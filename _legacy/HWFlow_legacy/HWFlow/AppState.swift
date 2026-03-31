import SwiftUI
import UniformTypeIdentifiers

enum InputMode: String, CaseIterable {
    case file = "파일 업로드"
    case paste = "텍스트 붙여넣기"
}

struct StylePreset: Identifiable, Hashable {
    let id: String
    let name: String
    let description: String
    let file: String
}

struct IRTableRun {
    let text: String
    let bold: Bool
}

struct CellBorder: Equatable {
    var type: String  // "SOLID", "NONE", "DASHED", "DOTTED"
    var width: String // "0.12 mm", "0.4 mm", etc.

    static let solid = CellBorder(type: "SOLID", width: "0.12 mm")
    static let none = CellBorder(type: "NONE", width: "0.1 mm")
    static let thick = CellBorder(type: "SOLID", width: "0.4 mm")
}

struct CellBorders: Equatable {
    var top: CellBorder
    var bottom: CellBorder
    var left: CellBorder
    var right: CellBorder

    static let solid = CellBorders(top: .solid, bottom: .solid, left: .solid, right: .solid)
    static let none = CellBorders(top: .none, bottom: .none, left: .none, right: .none)
}

struct IRTableCell {
    let runs: [IRTableRun]
    var align: String       // "left", "center", "right", "justify"
    var valign: String      // "top", "center", "bottom"
    var bgColor: String?    // hex "#RRGGBB" or nil = transparent
    var borders: CellBorders

    init(runs: [IRTableRun],
         align: String = "left",
         valign: String = "center",
         bgColor: String? = nil,
         borders: CellBorders = .solid) {
        self.runs = runs
        self.align = align
        self.valign = valign
        self.bgColor = bgColor
        self.borders = borders
    }

    var text: String {
        runs.map(\.text).joined()
    }
}

struct IRBlock: Identifiable {
    let id = UUID()
    let type: String          // heading1, heading2, body, table 등
    let text: String          // 표시용 텍스트
    let runs: [[String: Any]] // 원본 run 데이터
    let isTable: Bool
    let tableRows: [[IRTableCell]]  // 표 전용 데이터
    let hasHeader: Bool             // 표 헤더 여부

    static func from(dict: [String: Any]) -> IRBlock {
        let type = dict["type"] as? String ?? "body"
        let isTable = type == "table"
        var text = ""
        var tableRows: [[IRTableCell]] = []
        let hasHeader = dict["has_header"] as? Bool ?? false

        if isTable {
            if let rows = dict["rows"] as? [[Any]] {
                for row in rows {
                    var cellRow: [IRTableCell] = []
                    for item in row {
                        if let cellDict = item as? [String: Any] {
                            let cellRuns: [IRTableRun]
                            if let runDicts = cellDict["runs"] as? [[String: Any]] {
                                cellRuns = runDicts.map { r in
                                    IRTableRun(
                                        text: r["text"] as? String ?? "",
                                        bold: r["bold"] as? Bool ?? false
                                    )
                                }
                            } else {
                                // 하위 호환: {"text": ..., "bold": ...}
                                cellRuns = [IRTableRun(
                                    text: cellDict["text"] as? String ?? "",
                                    bold: cellDict["bold"] as? Bool ?? false
                                )]
                            }
                            let cellAlign = cellDict["align"] as? String ?? "left"
                            let cellValign = cellDict["valign"] as? String ?? "center"
                            let cellBgColor = cellDict["bg_color"] as? String
                            var cellBorders = CellBorders.solid
                            if let bd = cellDict["borders"] as? [String: [String: String]] {
                                func parseBorder(_ d: [String: String]?) -> CellBorder {
                                    guard let d else { return .solid }
                                    return CellBorder(
                                        type: d["type"] ?? "SOLID",
                                        width: d["width"] ?? "0.12 mm"
                                    )
                                }
                                cellBorders = CellBorders(
                                    top: parseBorder(bd["top"]),
                                    bottom: parseBorder(bd["bottom"]),
                                    left: parseBorder(bd["left"]),
                                    right: parseBorder(bd["right"])
                                )
                            }
                            cellRow.append(IRTableCell(
                                runs: cellRuns,
                                align: cellAlign,
                                valign: cellValign,
                                bgColor: cellBgColor,
                                borders: cellBorders
                            ))
                        }
                    }
                    tableRows.append(cellRow)
                }
                // 첫 행 요약
                if let firstRow = tableRows.first {
                    text = "[표] " + firstRow.map(\.text).joined(separator: " | ")
                }
            }
        } else {
            if let runs = dict["runs"] as? [[String: Any]] {
                text = runs.compactMap { $0["text"] as? String }.joined()
            }
        }
        let runs = dict["runs"] as? [[String: Any]] ?? []
        return IRBlock(type: type, text: text, runs: runs, isTable: isTable,
                       tableRows: tableRows, hasHeader: hasHeader)
    }
}

/// 번들/개발 경로 자동 해결
enum HWFlowPaths {
    static var stylesDir: String {
        let bundled = (Bundle.main.resourcePath ?? "") + "/styles"
        if FileManager.default.fileExists(atPath: bundled) { return bundled }
        return "/Volumes/NINE_DEV/PROJECT/HWFlow/styles"
    }
}

@MainActor
class AppState: ObservableObject {
    @Published var inputMode: InputMode = .file
    @Published var pasteText: String = ""
    @Published var selectedFileURL: URL?
    @Published var selectedPreset: String = "공문서_표준"
    @Published var availablePresets: [StylePreset] = []
    @Published var irBlocks: [IRBlock] = []
    @Published var selectedBlockIDs: Set<UUID> = []
    @Published var anchorBlockID: UUID?
    @Published var isConverting: Bool = false
    @Published var conversionMessage: String = ""
    @Published var showInspector: Bool = false
    @Published var showSplitPreview: Bool = false
    @Published var showStyleSettings: Bool = false
    @Published var showBlockModal: Bool = false
    @Published var documentTitle: String = ""
    @Published var blockOverrides: [UUID: BlockStyleOverride] = [:]
    @Published var blockTypeOverrides: [UUID: String] = [:]  // 블록 타입 변경
    @Published var availableStyleKeys: [String] = ["heading1", "heading2", "heading3", "heading4", "body"]
    @Published var styleDisplayNames: [String: String] = [:]  // key → 표시 이름
    @Published var styleMapping: [String: String] = [:]  // 파싱타입 → 적용스타일 (일괄 매핑)
    @Published var blockTextOverrides: [UUID: String] = [:]  // 블록 텍스트 수정
    @Published var tableRowOverrides: [UUID: [[IRTableCell]]] = [:]  // 표 셀 데이터 오버라이드
    @Published var tableHeaderOverrides: [UUID: Bool] = [:]          // 표 헤더 토글 오버라이드

    private let bridge = JSBridge()

    init() {
        loadPresets()
    }

    func loadPresets() {
        Task {
            let presets = await bridge.listStyles()
            self.availablePresets = presets
            if !presets.isEmpty && !presets.contains(where: { $0.id == selectedPreset }) {
                selectedPreset = presets[0].id
            }
        }
    }

    func parseInput() {
        Task {
            switch inputMode {
            case .paste:
                guard !pasteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                let blocks = await bridge.parseMarkdown(pasteText)
                self.irBlocks = blocks
                if documentTitle.isEmpty {
                    documentTitle = blocks.first?.text.prefix(30).description ?? "문서"
                }
            case .file:
                guard let url = selectedFileURL else {
                    conversionMessage = "파일이 선택되지 않았습니다."
                    return
                }
                conversionMessage = "파싱 중: \(url.lastPathComponent)"
                let blocks = await bridge.parseFile(url)
                if blocks.isEmpty {
                    conversionMessage = "파싱 실패: 결과가 비어있습니다. Xcode 콘솔을 확인하세요."
                } else {
                    conversionMessage = "파싱 완료: \(blocks.count)개 블록"
                    self.irBlocks = blocks
                    if documentTitle.isEmpty {
                        documentTitle = url.deletingPathExtension().lastPathComponent
                    }
                }
            }
        }
    }

    func convert() {
        guard !irBlocks.isEmpty else {
            conversionMessage = "변환할 내용이 없습니다."
            return
        }

        isConverting = true
        conversionMessage = ""

        Task {
            let panel = NSSavePanel()
            panel.allowedContentTypes = [UTType(filenameExtension: "hwpx") ?? .data]
            panel.nameFieldStringValue = (documentTitle.isEmpty ? "문서" : documentTitle) + ".hwpx"
            panel.title = "HWPX 파일 저장"

            let response = await panel.beginSheetModal(for: NSApp.keyWindow ?? NSWindow())

            if response == .OK, let url = panel.url {
                let success: Bool
                switch inputMode {
                case .paste:
                    success = await bridge.convertMarkdown(
                        pasteText, style: selectedPreset, output: url.path
                    )
                case .file:
                    if let fileURL = selectedFileURL {
                        success = await bridge.convertFile(
                            fileURL, style: selectedPreset, output: url.path
                        )
                    } else {
                        success = false
                    }
                }
                conversionMessage = success ? "변환 완료: \(url.lastPathComponent)" : "변환 실패"
            }
            isConverting = false
        }
    }

    /// 단일 선택 호환 (첫 번째 또는 앵커)
    var selectedBlockID: UUID? {
        anchorBlockID ?? selectedBlockIDs.first
    }

    var selectedBlock: IRBlock? {
        guard let id = selectedBlockID else { return nil }
        return irBlocks.first { $0.id == id }
    }

    var selectedBlocks: [IRBlock] {
        irBlocks.filter { selectedBlockIDs.contains($0.id) }
    }

    // MARK: - 블록 선택

    func selectBlock(_ id: UUID, command: Bool = false, shift: Bool = false) {
        if shift, let anchor = anchorBlockID,
           let anchorIdx = irBlocks.firstIndex(where: { $0.id == anchor }),
           let clickIdx = irBlocks.firstIndex(where: { $0.id == id }) {
            // Shift: 앵커~클릭 범위 선택
            let range = min(anchorIdx, clickIdx)...max(anchorIdx, clickIdx)
            selectedBlockIDs = Set(irBlocks[range].map(\.id))
        } else if command {
            // Command: 토글 추가/제거
            if selectedBlockIDs.contains(id) {
                selectedBlockIDs.remove(id)
            } else {
                selectedBlockIDs.insert(id)
            }
            anchorBlockID = id
        } else {
            // 일반: 단일 선택
            selectedBlockIDs = [id]
            anchorBlockID = id
        }
    }

    func clearBlockSelection() {
        selectedBlockIDs.removeAll()
        anchorBlockID = nil
    }

    /// 선택된 블록들의 타입을 일괄 변경
    func setTypeForSelectedBlocks(_ newType: String) {
        for id in selectedBlockIDs {
            blockTypeOverrides[id] = newType
        }
    }

    /// 블록의 실제 적용 타입 (개별 오버라이드 > 일괄 매핑 > 원본)
    func effectiveType(for block: IRBlock) -> String {
        // 1순위: 개별 블록 오버라이드
        if let override = blockTypeOverrides[block.id] {
            return override
        }
        // 2순위: 일괄 매핑
        if let mapped = styleMapping[block.type], mapped != block.type {
            return mapped
        }
        // 3순위: 원본
        return block.type
    }

    /// 스타일 키의 표시 이름
    func displayName(for key: String) -> String {
        styleDisplayNames[key] ?? StyleData.styleLabels[key] ?? key
    }

    /// 블록의 실제 텍스트 (오버라이드 반영)
    func effectiveText(for block: IRBlock) -> String {
        if block.isTable {
            let rows = effectiveTableRows(for: block)
            if let first = rows.first {
                return "[표] " + first.map(\.text).joined(separator: " | ")
            }
        }
        return blockTextOverrides[block.id] ?? block.text
    }

    /// 표의 실제 행 데이터 (오버라이드 반영)
    func effectiveTableRows(for block: IRBlock) -> [[IRTableCell]] {
        tableRowOverrides[block.id] ?? block.tableRows
    }

    /// 표의 실제 헤더 여부 (오버라이드 반영)
    func effectiveHasHeader(for block: IRBlock) -> Bool {
        tableHeaderOverrides[block.id] ?? block.hasHeader
    }

    // MARK: - 블록 조작

    func moveBlockUp(_ block: IRBlock) {
        guard let index = irBlocks.firstIndex(where: { $0.id == block.id }), index > 0 else { return }
        irBlocks.swapAt(index, index - 1)
    }

    func moveBlockDown(_ block: IRBlock) {
        guard let index = irBlocks.firstIndex(where: { $0.id == block.id }), index < irBlocks.count - 1 else { return }
        irBlocks.swapAt(index, index + 1)
    }

    func deleteBlock(_ block: IRBlock) {
        irBlocks.removeAll { $0.id == block.id }
        blockOverrides.removeValue(forKey: block.id)
        blockTypeOverrides.removeValue(forKey: block.id)
        blockTextOverrides.removeValue(forKey: block.id)
        tableRowOverrides.removeValue(forKey: block.id)
        tableHeaderOverrides.removeValue(forKey: block.id)
        selectedBlockIDs.remove(block.id)
        if anchorBlockID == block.id { anchorBlockID = nil }
    }

    func deleteSelectedBlocks() {
        for id in selectedBlockIDs {
            if let block = irBlocks.first(where: { $0.id == id }) {
                deleteBlock(block)
            }
        }
    }

    func addBlock(after block: IRBlock? = nil, type: String = "body", text: String = "") {
        let newBlock = IRBlock(type: type, text: text, runs: [], isTable: false,
                               tableRows: [], hasHeader: false)
        if let block, let index = irBlocks.firstIndex(where: { $0.id == block.id }) {
            irBlocks.insert(newBlock, at: index + 1)
        } else {
            irBlocks.append(newBlock)
        }
        selectedBlockIDs = [newBlock.id]
        anchorBlockID = newBlock.id
    }
}
