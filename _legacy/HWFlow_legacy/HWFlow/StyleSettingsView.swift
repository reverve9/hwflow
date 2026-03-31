import SwiftUI
import UniformTypeIdentifiers

// MARK: - 스타일 매니저 (메인 패널)
struct StyleSettingsView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var pageSettings = PageSettings()
    @State private var styles: [EditableStyle] = []
    @State private var selectedStyleID: UUID?
    @State private var showMappingPanel: Bool = false  // nil=스타일편집, true=매핑편집
    @State private var saveMessage: String = ""
    @State private var showAddSheet = false
    @State private var showSaveAsSheet = false
    @State private var showDeletePresetAlert = false

    var body: some View {
        VStack(spacing: 0) {
            // 헤더
            VStack(spacing: 8) {
                HStack {
                    Text("스타일 매니저")
                        .font(.title2)
                        .fontWeight(.bold)
                    Spacer()
                    if !saveMessage.isEmpty {
                        Text(saveMessage)
                            .font(.caption)
                            .foregroundStyle(saveMessage.contains("완료") || saveMessage.contains("생성") ? .green : .red)
                    }
                    Button("닫기") { dismiss() }
                        .buttonStyle(.bordered)
                }

                // 프리셋 관리 바
                HStack(spacing: 8) {
                    Text("프리셋:")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Picker("", selection: $appState.selectedPreset) {
                        ForEach(appState.availablePresets) { preset in
                            Text(preset.name).tag(preset.id)
                        }
                    }
                    .frame(width: 150)
                    .onChange(of: appState.selectedPreset) { _, _ in
                        loadCurrentStyle()
                    }

                    Button("저장") { saveStyle() }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)

                    Button("새 프리셋으로 저장") { showSaveAsSheet = true }
                        .controlSize(.small)

                    if appState.selectedPreset != "공문서_표준" {
                        Button("삭제") { showDeletePresetAlert = true }
                            .foregroundStyle(.red)
                            .controlSize(.small)
                    }

                    Spacer()

                    Button("내보내기") { exportPreset() }
                        .controlSize(.small)
                    Button("가져오기") { importPreset() }
                        .controlSize(.small)
                }
            }
            .padding(16)

            Divider()

            HSplitView {
                // 좌측: 스타일 목록
                styleListPanel
                    .frame(minWidth: 180, idealWidth: 200, maxWidth: 240)

                // 우측: 선택된 스타일 편집
                styleEditPanel
                    .frame(minWidth: 350)
            }
        }
        .frame(width: 680, height: 600)
        .onAppear { loadCurrentStyle() }
        .sheet(isPresented: $showAddSheet) {
            AddStyleSheet { name, baseType in
                addStyle(name: name, baseType: baseType)
            }
        }
        .sheet(isPresented: $showSaveAsSheet) {
            SaveAsPresetSheet { presetName in
                saveAsNewPreset(name: presetName)
            }
        }
        .alert("프리셋 삭제", isPresented: $showDeletePresetAlert) {
            Button("삭제", role: .destructive) { deleteCurrentPreset() }
            Button("취소", role: .cancel) {}
        } message: {
            Text("'\(appState.selectedPreset)' 프리셋을 삭제하시겠습니까?")
        }
    }

    // MARK: - 좌측 스타일 목록
    private var styleListPanel: some View {
        VStack(spacing: 0) {
            // 페이지 설정
            Button {
                selectedStyleID = nil
                showMappingPanel = false
            } label: {
                HStack {
                    Image(systemName: "doc")
                    Text("페이지 설정")
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(!showMappingPanel && selectedStyleID == nil ? Color.accentColor.opacity(0.1) : Color.clear)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            // 스타일 매핑
            Button {
                showMappingPanel = true
                selectedStyleID = nil
            } label: {
                HStack {
                    Image(systemName: "arrow.left.arrow.right")
                    Text("스타일 매핑")
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(showMappingPanel ? Color.accentColor.opacity(0.1) : Color.clear)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Divider().padding(.vertical, 4)

            // 스타일 목록
            ScrollView {
                LazyVStack(spacing: 1) {
                    ForEach(styles) { style in
                        styleRow(style)
                    }
                }
            }

            Divider()

            // 추가/삭제 버튼
            HStack {
                Button {
                    showAddSheet = true
                } label: {
                    Image(systemName: "plus")
                }
                .help("새 스타일 추가")

                Button {
                    deleteSelectedStyle()
                } label: {
                    Image(systemName: "minus")
                }
                .help("선택된 스타일 삭제")
                .disabled(selectedStyleID == nil || isBuiltinStyle(selectedStyleID))

                Spacer()
            }
            .padding(8)
        }
        .background(Color.gray.opacity(0.05))
    }

    private func styleRow(_ style: EditableStyle) -> some View {
        HStack {
            Circle()
                .fill(style.isBuiltin ? Color.blue.opacity(0.6) : Color.orange.opacity(0.6))
                .frame(width: 8, height: 8)
            Text(style.displayName)
                .font(.callout)
                .lineLimit(1)
            Spacer()
            if style.isBuiltin {
                Text("기본")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(selectedStyleID == style.id ? Color.accentColor.opacity(0.15) : Color.clear)
        .contentShape(Rectangle())
        .onTapGesture {
            selectedStyleID = style.id
            showMappingPanel = false
        }
    }

    // MARK: - 우측 편집 패널
    @ViewBuilder
    private var styleEditPanel: some View {
        if showMappingPanel {
            styleMappingPanel
        } else if selectedStyleID == nil {
            // 페이지 설정
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("페이지 설정")
                        .font(.title3)
                        .fontWeight(.bold)

                    HStack(spacing: 20) {
                        NumberField(label: "상단 여백(mm)", value: $pageSettings.marginTop)
                        NumberField(label: "하단 여백(mm)", value: $pageSettings.marginBottom)
                        NumberField(label: "좌측 여백(mm)", value: $pageSettings.marginLeft)
                        NumberField(label: "우측 여백(mm)", value: $pageSettings.marginRight)
                    }
                }
                .padding(20)
            }
        } else if let index = styles.firstIndex(where: { $0.id == selectedStyleID }) {
            ScrollView {
                styleEditForm(style: $styles[index])
                    .padding(20)
            }
        } else {
            Text("스타일을 선택하세요")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func styleEditForm(style: Binding<EditableStyle>) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            // 스타일 이름
            HStack {
                Text("스타일 이름")
                    .font(.title3)
                    .fontWeight(.bold)
                Spacer()
                if !style.wrappedValue.isBuiltin {
                    Button("삭제", role: .destructive) {
                        deleteSelectedStyle()
                    }
                    .foregroundStyle(.red)
                    .font(.caption)
                }
            }

            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("표시 이름").font(.caption).foregroundStyle(.secondary)
                    TextField("스타일 이름", text: style.displayName)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 160)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("키 (내부 ID)").font(.caption).foregroundStyle(.secondary)
                    if style.wrappedValue.isBuiltin {
                        Text(style.wrappedValue.key)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    } else {
                        TextField("key", text: style.key)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 160)
                    }
                }
            }

            Divider()

            // 폰트
            SectionHeader(title: "폰트")
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("서체").font(.caption).foregroundStyle(.secondary)
                    Picker("", selection: style.data.font) {
                        Text("함초롬바탕").tag("함초롬바탕")
                        Text("함초롬돋움").tag("함초롬돋움")
                    }
                    .frame(width: 130)
                }
                NumberField(label: "크기(pt)", value: style.data.sizePt)
                VStack(alignment: .leading, spacing: 6) {
                    Text("굵기").font(.caption).foregroundStyle(.secondary)
                    Toggle("Bold", isOn: style.data.bold)
                        .toggleStyle(.checkbox)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("정렬").font(.caption).foregroundStyle(.secondary)
                    Picker("", selection: style.data.align) {
                        Text("왼쪽").tag("left")
                        Text("가운데").tag("center")
                        Text("오른쪽").tag("right")
                        Text("양쪽").tag("justify")
                    }
                    .frame(width: 80)
                }
            }

            // 단락
            SectionHeader(title: "단락")
            HStack(spacing: 16) {
                NumberField(label: "줄간격(%)", value: style.data.lineHeight)
                NumberField(label: "들여쓰기", value: style.data.indentLeft)
                NumberField(label: "단락 전", value: style.data.spaceBefore)
                NumberField(label: "단락 후", value: style.data.spaceAfter)
            }

            // 번호 매기기 (기본 스타일만)
            if let numbering = StyleData.numberingOptions[style.wrappedValue.key] {
                SectionHeader(title: "번호 매기기")
                Text(numbering)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - 스타일 매핑 패널
    private var styleMappingPanel: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("스타일 매핑")
                    .font(.title3)
                    .fontWeight(.bold)

                Text("파서가 판단한 스타일을 원하는 스타일로 일괄 변환합니다.")
                    .font(.callout)
                    .foregroundStyle(.secondary)

                VStack(spacing: 12) {
                    ForEach(parserStyleKeys, id: \.self) { parserKey in
                        HStack(spacing: 12) {
                            // 파싱 결과 (원본)
                            Text(StyleData.styleLabels[parserKey] ?? parserKey)
                                .frame(width: 100, alignment: .trailing)
                                .font(.callout)

                            Image(systemName: "arrow.right")
                                .foregroundStyle(.secondary)

                            // 매핑 대상
                            Picker("", selection: mappingBinding(for: parserKey)) {
                                ForEach(styles) { style in
                                    Text(style.displayName).tag(style.key)
                                }
                            }
                            .frame(width: 160)

                            // 변경 표시
                            if appState.styleMapping[parserKey] != nil && appState.styleMapping[parserKey] != parserKey {
                                Image(systemName: "pencil.circle.fill")
                                    .foregroundStyle(.orange)
                                    .font(.caption)

                                Button {
                                    appState.styleMapping.removeValue(forKey: parserKey)
                                } label: {
                                    Image(systemName: "arrow.uturn.backward")
                                        .font(.caption)
                                }
                                .help("원본으로 되돌리기")
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.gray.opacity(0.05))
                )

                // 전체 초기화
                Button("모든 매핑 초기화") {
                    appState.styleMapping.removeAll()
                }
                .font(.caption)
                .disabled(appState.styleMapping.isEmpty)
            }
            .padding(20)
        }
    }

    private var parserStyleKeys: [String] {
        ["heading1", "heading2", "heading3", "heading4", "body"]
    }

    private func mappingBinding(for parserKey: String) -> Binding<String> {
        Binding(
            get: { appState.styleMapping[parserKey] ?? parserKey },
            set: { newValue in
                if newValue == parserKey {
                    appState.styleMapping.removeValue(forKey: parserKey)
                } else {
                    appState.styleMapping[parserKey] = newValue
                }
            }
        )
    }

    // MARK: - 스타일 추가/삭제
    private func addStyle(name: String, baseType: String) {
        let baseStyle = styles.first { $0.key == baseType }?.data ?? ParagraphStyleData()
        let key = name.lowercased().replacingOccurrences(of: " ", with: "_")
        let newStyle = EditableStyle(
            key: key,
            displayName: name,
            data: baseStyle,
            isBuiltin: false
        )
        styles.append(newStyle)
        selectedStyleID = newStyle.id
    }

    private func deleteSelectedStyle() {
        guard let id = selectedStyleID,
              let index = styles.firstIndex(where: { $0.id == id }),
              !styles[index].isBuiltin else { return }
        styles.remove(at: index)
        selectedStyleID = nil
    }

    private func isBuiltinStyle(_ id: UUID?) -> Bool {
        guard let id else { return false }
        return styles.first { $0.id == id }?.isBuiltin ?? false
    }

    // MARK: - 로드/저장
    private func loadCurrentStyle() {
        let path = "\(HWFlowPaths.stylesDir)/\(appState.selectedPreset).json"
        guard let data = FileManager.default.contents(atPath: path),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            saveMessage = "로드 실패"
            return
        }

        // 페이지 설정
        if let page = json["page"] as? [String: Any],
           let margin = page["margin"] as? [String: Any] {
            pageSettings.marginTop = margin["top_mm"] as? Int ?? 20
            pageSettings.marginBottom = margin["bottom_mm"] as? Int ?? 15
            pageSettings.marginLeft = margin["left_mm"] as? Int ?? 15
            pageSettings.marginRight = margin["right_mm"] as? Int ?? 15
        }

        // 스타일 목록
        let builtinKeys = ["heading1", "heading2", "heading3", "heading4", "body", "table_header", "table_body"]
        var loadedStyles: [EditableStyle] = []

        if let ps = json["paragraph_styles"] as? [String: [String: Any]] {
            // 기본 스타일 먼저 (순서 유지)
            for key in builtinKeys {
                if let dict = ps[key] {
                    let displayName = dict["display_name"] as? String ?? (StyleData.styleLabels[key] ?? key)
                    loadedStyles.append(EditableStyle(
                        key: key,
                        displayName: displayName,
                        data: ParagraphStyleData.from(dict: dict),
                        isBuiltin: true
                    ))
                }
            }
            // 커스텀 스타일
            for (key, dict) in ps where !builtinKeys.contains(key) {
                let displayName = dict["display_name"] as? String ?? key
                loadedStyles.append(EditableStyle(
                    key: key,
                    displayName: displayName,
                    data: ParagraphStyleData.from(dict: dict),
                    isBuiltin: false
                ))
            }
        }

        styles = loadedStyles
        appState.availableStyleKeys = loadedStyles.map { $0.key }
        appState.styleDisplayNames = Dictionary(uniqueKeysWithValues: loadedStyles.map { ($0.key, $0.displayName) })

        // 매핑 로드
        if let mapping = json["style_mapping"] as? [String: String] {
            appState.styleMapping = mapping
        }
    }

    // MARK: - JSON 빌드
    private func buildJSON(presetName: String) -> [String: Any] {
        var paragraphStyles: [String: Any] = [:]
        for style in styles {
            var dict = style.data.toDict()
            if style.displayName != (StyleData.styleLabels[style.key] ?? style.key) || !style.isBuiltin {
                dict["display_name"] = style.displayName
            }
            paragraphStyles[style.key] = dict
        }

        return [
            "meta": [
                "name": presetName,
                "version": "1.0",
                "description": "스타일 프리셋"
            ],
            "page": [
                "size": "A4",
                "width_mm": 210,
                "height_mm": 297,
                "margin": [
                    "top_mm": pageSettings.marginTop,
                    "bottom_mm": pageSettings.marginBottom,
                    "left_mm": pageSettings.marginLeft,
                    "right_mm": pageSettings.marginRight,
                ],
                "header_height_mm": 15,
                "footer_height_mm": 15,
            ],
            "colors": [
                "primary": "#000000",
                "secondary": "#444444",
                "accent": "#003087",
                "table_head": "#D8D8D8",
            ],
            "paragraph_styles": paragraphStyles,
            "character_styles": [
                "emphasis": ["bold": true],
                "highlight": ["background": "#FFFF00"],
                "hyperlink": ["color": "#0000FF", "underline": true],
            ],
            "table_style": [
                "border_type": "SOLID",
                "border_width": "0.12 mm",
                "border_color": "#000000",
                "header_fill": "#D8D8D8",
                "cell_margin_left": 510,
                "cell_margin_right": 510,
                "cell_margin_top": 141,
                "cell_margin_bottom": 141,
            ],
            "style_mapping": appState.styleMapping,
        ]
    }

    private func writeJSON(_ json: [String: Any], to path: String) -> Bool {
        do {
            let data = try JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: URL(fileURLWithPath: path))
            return true
        } catch {
            return false
        }
    }

    // MARK: - 저장
    private func saveStyle() {
        let json = buildJSON(presetName: appState.selectedPreset)
        let path = "\(HWFlowPaths.stylesDir)/\(appState.selectedPreset).json"
        if writeJSON(json, to: path) {
            saveMessage = "저장 완료"
            appState.availableStyleKeys = styles.map { $0.key }
            appState.styleDisplayNames = Dictionary(uniqueKeysWithValues: styles.map { ($0.key, $0.displayName) })
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saveMessage = "" }
        } else {
            saveMessage = "저장 실패"
        }
    }

    // MARK: - 새 프리셋으로 저장
    private func saveAsNewPreset(name: String) {
        let json = buildJSON(presetName: name)
        let path = "\(HWFlowPaths.stylesDir)/\(name).json"
        if writeJSON(json, to: path) {
            saveMessage = "'\(name)' 프리셋 생성"
            appState.selectedPreset = name
            appState.loadPresets()
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saveMessage = "" }
        } else {
            saveMessage = "저장 실패"
        }
    }

    // MARK: - 프리셋 삭제
    private func deleteCurrentPreset() {
        let path = "\(HWFlowPaths.stylesDir)/\(appState.selectedPreset).json"
        try? FileManager.default.removeItem(atPath: path)
        appState.selectedPreset = "공문서_표준"
        appState.loadPresets()
        loadCurrentStyle()
        saveMessage = "삭제 완료"
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saveMessage = "" }
    }

    // MARK: - 내보내기
    private func exportPreset() {
        let srcPath = "\(HWFlowPaths.stylesDir)/\(appState.selectedPreset).json"
        guard FileManager.default.fileExists(atPath: srcPath) else {
            saveMessage = "저장된 프리셋이 없습니다. 먼저 저장하세요."
            return
        }

        let panel = NSSavePanel()
        panel.title = "스타일 프리셋 내보내기"
        panel.nameFieldStringValue = "\(appState.selectedPreset).json"
        panel.allowedContentTypes = [.json]

        panel.begin { response in
            if response == .OK, let url = panel.url {
                do {
                    try FileManager.default.copyItem(atPath: srcPath, toPath: url.path)
                    saveMessage = "내보내기 완료"
                } catch {
                    saveMessage = "내보내기 실패"
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saveMessage = "" }
            }
        }
    }

    // MARK: - 가져오기
    private func importPreset() {
        let panel = NSOpenPanel()
        panel.title = "스타일 프리셋 가져오기"
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = false

        panel.begin { response in
            if response == .OK, let url = panel.url {
                do {
                    let data = try Data(contentsOf: url)
                    // JSON 유효성 검증
                    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                          json["paragraph_styles"] != nil else {
                        saveMessage = "유효한 스타일 파일이 아닙니다"
                        return
                    }

                    let presetName = (json["meta"] as? [String: Any])?["name"] as? String
                        ?? url.deletingPathExtension().lastPathComponent
                    let destPath = "\(HWFlowPaths.stylesDir)/\(presetName).json"

                    try data.write(to: URL(fileURLWithPath: destPath))
                    appState.selectedPreset = presetName
                    appState.loadPresets()
                    loadCurrentStyle()
                    saveMessage = "'\(presetName)' 가져오기 완료"
                } catch {
                    saveMessage = "가져오기 실패"
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saveMessage = "" }
            }
        }
    }
}

// MARK: - 스타일 추가 시트
struct AddStyleSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name: String = ""
    @State private var baseType: String = "body"
    let onAdd: (String, String) -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("새 스타일 추가")
                .font(.headline)

            TextField("스타일 이름 (예: 인용문)", text: $name)
                .textFieldStyle(.roundedBorder)
                .frame(width: 250)

            Picker("기반 스타일", selection: $baseType) {
                Text("본문").tag("body")
                Text("제목 1").tag("heading1")
                Text("제목 2").tag("heading2")
                Text("제목 3").tag("heading3")
                Text("제목 4").tag("heading4")
            }
            .frame(width: 250)

            HStack {
                Button("취소") { dismiss() }
                    .buttonStyle(.bordered)
                Button("추가") {
                    if !name.isEmpty {
                        onAdd(name, baseType)
                        dismiss()
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(name.isEmpty)
            }
        }
        .padding(24)
        .frame(width: 300)
    }
}

// MARK: - 프리셋 저장 시트
struct SaveAsPresetSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var presetName: String = ""
    let onSave: (String) -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("새 프리셋으로 저장")
                .font(.headline)

            Text("현재 스타일 설정을 새 프리셋으로 저장합니다.")
                .font(.caption)
                .foregroundStyle(.secondary)

            TextField("프리셋 이름 (예: 보고서_일반)", text: $presetName)
                .textFieldStyle(.roundedBorder)
                .frame(width: 250)

            HStack {
                Button("취소") { dismiss() }
                    .buttonStyle(.bordered)
                Button("저장") {
                    if !presetName.isEmpty {
                        onSave(presetName)
                        dismiss()
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(presetName.isEmpty)
            }
        }
        .padding(24)
        .frame(width: 320)
    }
}

// MARK: - 데이터 모델

struct EditableStyle: Identifiable {
    let id = UUID()
    var key: String
    var displayName: String
    var data: ParagraphStyleData
    var isBuiltin: Bool
}

struct PageSettings {
    var marginTop: Int = 20
    var marginBottom: Int = 15
    var marginLeft: Int = 15
    var marginRight: Int = 15
}

// MARK: - UI 컴포넌트

struct SectionHeader: View {
    let title: String
    var body: some View {
        Text(title)
            .font(.headline)
            .padding(.vertical, 4)
            .padding(.horizontal, 8)
            .background(Color.accentColor.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

struct NumberField: View {
    let label: String
    @Binding var value: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            TextField("", value: $value, format: .number)
                .textFieldStyle(.roundedBorder)
                .frame(width: 70)
        }
    }
}

// MARK: - ParagraphStyleData

struct ParagraphStyleData {
    var font: String = "함초롬바탕"
    var sizePt: Int = 10
    var bold: Bool = false
    var align: String = "justify"
    var indentLeft: Int = 0
    var spaceBefore: Int = 0
    var spaceAfter: Int = 0
    var lineHeight: Int = 160

    static func from(dict: [String: Any]) -> ParagraphStyleData {
        var s = ParagraphStyleData()
        s.font = dict["font"] as? String ?? "함초롬바탕"
        s.sizePt = dict["size_pt"] as? Int ?? 10
        s.bold = dict["bold"] as? Bool ?? false
        s.align = dict["align"] as? String ?? "justify"
        s.indentLeft = dict["indent_left_hwpunit"] as? Int ?? 0
        s.spaceBefore = dict["space_before_hwpunit"] as? Int ?? 0
        s.spaceAfter = dict["space_after_hwpunit"] as? Int ?? 0
        s.lineHeight = dict["line_height_percent"] as? Int ?? 160
        return s
    }

    func toDict() -> [String: Any] {
        return [
            "font": font,
            "size_pt": sizePt,
            "bold": bold,
            "align": align,
            "indent_left_hwpunit": indentLeft,
            "space_before_hwpunit": spaceBefore,
            "space_after_hwpunit": spaceAfter,
            "line_height_percent": lineHeight,
        ]
    }
}

// MARK: - StyleData (호환용)
struct StyleData {
    static let styleLabels: [String: String] = [
        "heading1": "제목 1 (H1)",
        "heading2": "제목 2 (H2)",
        "heading3": "제목 3 (H3)",
        "heading4": "제목 4 (H4)",
        "body": "본문",
        "table_header": "표 헤더",
        "table_body": "표 본문",
    ]

    static let numberingOptions: [String: String] = [
        "heading1": "I, II, III",
        "heading2": "1, 2, 3",
        "heading3": "가, 나, 다",
        "heading4": "1), 2), 3)",
    ]
}
