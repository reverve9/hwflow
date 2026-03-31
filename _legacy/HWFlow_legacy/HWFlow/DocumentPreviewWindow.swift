import SwiftUI
import Combine

struct DocumentPreviewWindow: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var styleLoader = PreviewStyleState()

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 16) {
                    ForEach(Array(paginatedBlocks.enumerated()), id: \.offset) { pageIndex, pageBlocks in
                        pageContainer(pageIndex: pageIndex, blocks: pageBlocks)
                    }
                }
                .padding(24)
            }
            .background(Color.gray.opacity(0.2))
            .onChange(of: appState.selectedBlockIDs) { _, _ in
                if let id = appState.selectedBlockID {  // anchorBlockID 기반
                    withAnimation(.easeInOut(duration: 0.3)) {
                        proxy.scrollTo(id, anchor: .center)
                    }
                }
            }
        }
        .frame(minWidth: 400, minHeight: 500)
        .onAppear { styleLoader.load(preset: appState.selectedPreset) }
        .onReceive(appState.$selectedPreset) { newValue in
            styleLoader.load(preset: newValue)
        }
        // 스타일 매핑, 타입 오버라이드, 블록 오버라이드 변경 감지 → 자동 갱신
        .onReceive(appState.$styleMapping.throttle(for: 0.1, scheduler: RunLoop.main, latest: true)) { _ in
            styleLoader.reload()
        }
        .onReceive(appState.$blockTypeOverrides.throttle(for: 0.1, scheduler: RunLoop.main, latest: true)) { _ in
            // SwiftUI가 뷰를 자동 갱신 (appState 참조)
        }
        .onReceive(appState.$blockOverrides.throttle(for: 0.1, scheduler: RunLoop.main, latest: true)) { _ in
            // SwiftUI가 뷰를 자동 갱신
        }
        .onReceive(appState.$tableRowOverrides.throttle(for: 0.1, scheduler: RunLoop.main, latest: true)) { _ in
            // 표 오버라이드 → 자동 갱신
        }
        .onReceive(appState.$tableHeaderOverrides.throttle(for: 0.1, scheduler: RunLoop.main, latest: true)) { _ in
            // 표 헤더 오버라이드 → 자동 갱신
        }
    }

    // MARK: - A4 페이지 크기 (72dpi)
    private let pageWidth: CGFloat = 595
    private let pageHeight: CGFloat = 842

    // MARK: - 페이지 분할 (블록 단위 추정)
    private var paginatedBlocks: [[IRBlock]] {
        let contentHeight = pageHeight - CGFloat(styleLoader.marginTop) - CGFloat(styleLoader.marginBottom)
        var pages: [[IRBlock]] = []
        var currentPage: [IRBlock] = []
        var usedHeight: CGFloat = 0

        for block in appState.irBlocks {
            let effectiveType = appState.effectiveType(for: block)
            let blockHeight = estimateBlockHeight(block, effectiveType: effectiveType)

            if usedHeight + blockHeight > contentHeight && !currentPage.isEmpty {
                pages.append(currentPage)
                currentPage = [block]
                usedHeight = blockHeight
            } else {
                currentPage.append(block)
                usedHeight += blockHeight
            }
        }
        if !currentPage.isEmpty {
            pages.append(currentPage)
        }
        if pages.isEmpty {
            pages.append([])
        }
        return pages
    }

    private func estimateBlockHeight(_ block: IRBlock, effectiveType: String) -> CGFloat {
        if block.isTable {
            // 표: 행 수 × 행 높이(약 22pt) + 패딩
            let rowCount = max(appState.effectiveTableRows(for: block).count, 1)
            let rowHeight: CGFloat = 22
            return CGFloat(rowCount) * rowHeight + 8
        }
        let style = resolvedStyle(for: block, effectiveType: effectiveType)
        let fontSize = CGFloat(style.sizePt)
        let lineH = CGFloat(style.lineHeight) / 100.0 * fontSize
        let textLen = CGFloat(block.text.count)
        let contentWidth = pageWidth - CGFloat(styleLoader.marginLeft) - CGFloat(styleLoader.marginRight) - CGFloat(style.indentLeft) / 283.46 * 2.835
        let charsPerLine = max(contentWidth / (fontSize * 0.6), 1)
        let lineCount = max(ceil(textLen / charsPerLine), 1)
        let spaceB = CGFloat(style.spaceBefore) / 283.46 * 2.835
        let spaceA = CGFloat(style.spaceAfter) / 283.46 * 2.835
        return lineCount * lineH + spaceB + spaceA
    }

    // MARK: - 페이지 컨테이너
    private func pageContainer(pageIndex: Int, blocks: [IRBlock]) -> some View {
        VStack(spacing: 0) {
            // 페이지 본문
            VStack(alignment: .leading, spacing: 0) {
                ForEach(blocks) { block in
                    let effectiveType = appState.effectiveType(for: block)
                    let isSelected = appState.selectedBlockIDs.contains(block.id)

                    if block.isTable {
                        tableBlockView(block)
                            .padding(.horizontal, CGFloat(styleLoader.marginLeft))
                            .padding(.vertical, 4)
                            .background(
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(isSelected ? Color.accentColor.opacity(0.08) : Color.clear)
                            )
                            .overlay(alignment: .leading) {
                                if isSelected {
                                    Rectangle()
                                        .fill(Color.accentColor)
                                        .frame(width: 3)
                                }
                            }
                            .id(block.id)
                    } else {
                        paragraphBlockView(block, effectiveType: effectiveType)
                            .background(
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(isSelected ? Color.accentColor.opacity(0.08) : Color.clear)
                            )
                            .overlay(alignment: .leading) {
                                if isSelected {
                                    Rectangle()
                                        .fill(Color.accentColor)
                                        .frame(width: 3)
                                }
                            }
                            .id(block.id)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.top, CGFloat(styleLoader.marginTop))
            .padding(.bottom, CGFloat(styleLoader.marginBottom))
            .frame(width: pageWidth, alignment: .topLeading)
            .frame(minHeight: pageHeight)
            .background(.white)
            .shadow(color: .black.opacity(0.15), radius: 4, y: 2)

            // 페이지 번호
            Text("\(pageIndex + 1)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.top, 6)
        }
    }

    // MARK: - 단락 렌더링
    private func paragraphBlockView(_ block: IRBlock, effectiveType: String) -> some View {
        let style = resolvedStyle(for: block, effectiveType: effectiveType)

        let indentPx = CGFloat(style.indentLeft) / 283.46 * 2.835
        let spaceBeforePx = CGFloat(style.spaceBefore) / 283.46 * 2.835
        let spaceAfterPx = CGFloat(style.spaceAfter) / 283.46 * 2.835
        let lineSpacingValue = CGFloat(style.lineHeight - 100) / 100.0 * CGFloat(style.sizePt)

        let attrText = buildAttributedText(block, style: style)

        return Text(attrText)
            .lineSpacing(lineSpacingValue)
            .multilineTextAlignment(textAlignment(style.align))
            .frame(maxWidth: .infinity, alignment: frameAlignment(style.align))
            .padding(.leading, CGFloat(styleLoader.marginLeft) + indentPx)
            .padding(.trailing, CGFloat(styleLoader.marginRight))
            .padding(.top, spaceBeforePx)
            .padding(.bottom, spaceAfterPx)
    }

    // MARK: - 스타일 해석
    private func resolvedStyle(for block: IRBlock, effectiveType: String) -> ParagraphStyleData {
        // 개별 오버라이드가 있으면 우선
        if let override = appState.blockOverrides[block.id] {
            return override.style
        }
        // effectiveType에 해당하는 프리셋 스타일
        return styleLoader.styleFor(effectiveType)
    }

    private func buildAttributedText(_ block: IRBlock, style: ParagraphStyleData) -> AttributedString {
        var result = AttributedString()
        // 텍스트 오버라이드 확인
        let textOverride = appState.blockTextOverrides[block.id]
        let runs = block.runs

        if textOverride != nil || runs.isEmpty {
            // 오버라이드된 텍스트 또는 runs가 없는 경우
            let displayText = textOverride ?? block.text
            var part = AttributedString(displayText)
            part.font = resolveFont(name: style.font, size: CGFloat(style.sizePt), bold: style.bold)
            result.append(part)
        } else {
            for run in runs {
                let text = run["text"] as? String ?? ""
                let runBold = (run["bold"] as? Bool ?? false) || style.bold
                var part = AttributedString(text)
                part.font = resolveFont(name: style.font, size: CGFloat(style.sizePt), bold: runBold)
                result.append(part)
            }
        }
        return result
    }

    private func resolveFont(name: String, size: CGFloat, bold: Bool) -> Font {
        if let nsFont = NSFont(name: name, size: size) {
            if bold {
                let boldDesc = nsFont.fontDescriptor.withSymbolicTraits(.bold)
                if let boldFont = NSFont(descriptor: boldDesc, size: size) {
                    return Font(boldFont)
                }
            }
            return Font(nsFont)
        }
        return bold ? .system(size: size, weight: .bold) : .system(size: size)
    }

    private func textAlignment(_ align: String) -> TextAlignment {
        switch align {
        case "center": return .center
        case "right": return .trailing
        default: return .leading
        }
    }

    private func frameAlignment(_ align: String) -> Alignment {
        switch align {
        case "center": return .center
        case "right": return .trailing
        default: return .leading
        }
    }

    // MARK: - 표
    private func tableBlockView(_ block: IRBlock) -> some View {
        let rows = appState.effectiveTableRows(for: block)
        let hasHeader = appState.effectiveHasHeader(for: block)
        let colCount = rows.map(\.count).max() ?? 1
        let headerStyle = styleLoader.styleFor("table_header")
        let bodyStyle = styleLoader.styleFor("table_body")
        let defaultHeaderColor = Color(hex: styleLoader.tableHeadColor) ?? Color.gray.opacity(0.2)

        return VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { rIdx, row in
                let isHeader = hasHeader && rIdx == 0
                HStack(alignment: .top, spacing: 0) {
                    ForEach(0..<colCount, id: \.self) { cIdx in
                        let cell = cIdx < row.count ? row[cIdx] : IRTableCell(runs: [])
                        let style = isHeader ? headerStyle : bodyStyle
                        let cellBg: Color = {
                            if let hex = cell.bgColor, let c = Color(hex: hex) { return c }
                            return isHeader ? defaultHeaderColor : Color.clear
                        }()

                        previewTableCell(cell: cell, style: style, bg: cellBg)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .id(block.id)
    }

    /// 셀 뷰: 내용 + 배경 + 테두리가 한 덩어리. 내용이 늘면 자연스럽게 커짐
    private func previewTableCell(cell: IRTableCell, style: ParagraphStyleData, bg: Color) -> some View {
        let attrText = buildTableCellText(cell: cell, style: style)
        let textAlign: TextAlignment = {
            switch cell.align {
            case "center": return .center; case "right": return .trailing; default: return .leading
            }
        }()
        let frameAlign: Alignment = {
            switch cell.align {
            case "center": return .center; case "right": return .trailing; default: return .leading
            }
        }()

        // valign에 따른 세로 정렬
        let vAlign: Alignment = {
            switch cell.valign {
            case "top": return .top; case "bottom": return .bottom; default: return .center
            }
        }()

        return Text(attrText)
            .multilineTextAlignment(textAlign)
            .lineSpacing(2)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: Alignment(horizontal: frameAlign.horizontal, vertical: vAlign.vertical))
            .padding(.horizontal, 4)
            .padding(.vertical, 3)
            .background(bg)
            // 테두리: 각 면을 얇은 Rectangle로 직접 그림
            .overlay(alignment: .top) {
                if cell.borders.top.type != "NONE" {
                    Rectangle().fill(Color.black.opacity(0.6))
                        .frame(height: borderLW(cell.borders.top))
                }
            }
            .overlay(alignment: .bottom) {
                if cell.borders.bottom.type != "NONE" {
                    Rectangle().fill(Color.black.opacity(0.6))
                        .frame(height: borderLW(cell.borders.bottom))
                }
            }
            .overlay(alignment: .leading) {
                if cell.borders.left.type != "NONE" {
                    Rectangle().fill(Color.black.opacity(0.6))
                        .frame(width: borderLW(cell.borders.left))
                }
            }
            .overlay(alignment: .trailing) {
                if cell.borders.right.type != "NONE" {
                    Rectangle().fill(Color.black.opacity(0.6))
                        .frame(width: borderLW(cell.borders.right))
                }
            }
    }

    private func borderLW(_ b: CellBorder) -> CGFloat {
        switch b.width {
        case "0.7 mm": return 2.0; case "0.4 mm": return 1.5; case "0.25 mm": return 1.0; default: return 0.5
        }
    }

    private func buildTableCellText(cell: IRTableCell, style: ParagraphStyleData) -> AttributedString {
        var result = AttributedString()
        if cell.runs.isEmpty {
            var part = AttributedString(" ")
            part.font = resolveFont(name: style.font, size: CGFloat(style.sizePt), bold: style.bold)
            result.append(part)
        } else {
            for run in cell.runs {
                let runBold = run.bold || style.bold
                var part = AttributedString(run.text)
                part.font = resolveFont(name: style.font, size: CGFloat(style.sizePt), bold: runBold)
                result.append(part)
            }
        }
        return result
    }
}

// MARK: - 스타일 로더 (파일 변경 감시 + 리얼타임)
@MainActor
class PreviewStyleState: ObservableObject {
    @Published var marginTop: CGFloat = 56
    @Published var marginBottom: CGFloat = 42
    @Published var marginLeft: CGFloat = 42
    @Published var marginRight: CGFloat = 42
    @Published var styles: [String: ParagraphStyleData] = [:]
    @Published var tableHeadColor: String = "#D8D8D8"

    private var fileWatcher: DispatchSourceFileSystemObject?
    private var currentPreset: String = ""
    private static var stylesPath: String { HWFlowPaths.stylesDir }

    func load(preset: String) {
        currentPreset = preset
        reload()
        watchFile()
    }

    func reload() {
        let path = "\(Self.stylesPath)/\(currentPreset).json"
        guard let data = FileManager.default.contents(atPath: path),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        let mmToPx: CGFloat = 2.835
        if let page = json["page"] as? [String: Any],
           let margin = page["margin"] as? [String: Any] {
            marginTop = CGFloat(margin["top_mm"] as? Int ?? 20) * mmToPx
            marginBottom = CGFloat(margin["bottom_mm"] as? Int ?? 15) * mmToPx
            marginLeft = CGFloat(margin["left_mm"] as? Int ?? 15) * mmToPx
            marginRight = CGFloat(margin["right_mm"] as? Int ?? 15) * mmToPx
        }

        if let colors = json["colors"] as? [String: String],
           let thc = colors["table_head"] {
            tableHeadColor = thc
        }

        if let ps = json["paragraph_styles"] as? [String: [String: Any]] {
            var newStyles: [String: ParagraphStyleData] = [:]
            for (key, dict) in ps {
                newStyles[key] = ParagraphStyleData.from(dict: dict)
            }
            styles = newStyles
        }
    }

    func styleFor(_ type: String) -> ParagraphStyleData {
        styles[type] ?? ParagraphStyleData()
    }

    private func watchFile() {
        fileWatcher?.cancel()
        let path = "\(Self.stylesPath)/\(currentPreset).json"
        let fd = open(path, O_EVTONLY)
        guard fd >= 0 else { return }

        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .rename],
            queue: .main
        )
        source.setEventHandler { [weak self] in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                self?.reload()
            }
        }
        source.setCancelHandler { close(fd) }
        source.resume()
        fileWatcher = source
    }

    deinit {
        fileWatcher?.cancel()
    }
}

// MARK: - Color hex initializer
extension Color {
    init?(hex: String) {
        var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, let val = UInt64(h, radix: 16) else { return nil }
        let r = Double((val >> 16) & 0xFF) / 255
        let g = Double((val >> 8) & 0xFF) / 255
        let b = Double(val & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
