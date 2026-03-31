import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 0) {
            // 상단 툴바
            ToolbarArea()
            Divider()
            // 본문 영역
            HSplitView {
                DocumentPreview()
                    .frame(minWidth: 350)

                if appState.showSplitPreview && !appState.irBlocks.isEmpty {
                    DocumentPreviewWindow()
                        .frame(minWidth: 350)
                }

                if appState.showInspector {
                    StyleInspectorView()
                        .frame(minWidth: 260, idealWidth: 280, maxWidth: 320)
                }
            }
        }
        .sheet(isPresented: $appState.showStyleSettings) {
            StyleSettingsView()
                .environmentObject(appState)
        }
        .sheet(isPresented: $appState.showBlockModal) {
            if let block = appState.selectedBlock {
                if block.isTable {
                    TableEditModal(block: block)
                        .environmentObject(appState)
                } else {
                    BlockStyleModal(
                        block: block,
                        currentOverride: appState.blockOverrides[block.id],
                        currentTypeOverride: appState.blockTypeOverrides[block.id],
                        currentTextOverride: appState.blockTextOverrides[block.id]
                    )
                    .environmentObject(appState)
                }
            }
        }
    }
}

// MARK: - 상단 툴바
struct ToolbarArea: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        HStack(spacing: 12) {
            // 입력 모드 선택
            Picker("", selection: $appState.inputMode) {
                ForEach(InputMode.allCases, id: \.self) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 220)

            Divider().frame(height: 20)

            // 스타일 프리셋
            HStack(spacing: 4) {
                Text("스타일:")
                    .foregroundStyle(.secondary)
                    .font(.callout)
                Picker("", selection: $appState.selectedPreset) {
                    ForEach(appState.availablePresets) { preset in
                        Text(preset.name).tag(preset.id)
                    }
                }
                .frame(width: 140)
            }

            Divider().frame(height: 20)

            // 문서 제목
            TextField("문서 제목", text: $appState.documentTitle)
                .textFieldStyle(.roundedBorder)
                .frame(width: 160)

            Spacer()

            // 스플릿 미리보기 토글
            Button {
                appState.showSplitPreview.toggle()
            } label: {
                Image(systemName: "rectangle.split.2x1")
                    .symbolVariant(appState.showSplitPreview ? .fill : .none)
            }
            .help("스플릿 미리보기")
            .disabled(appState.irBlocks.isEmpty)

            // 별도 창 미리보기
            Button {
                openPreviewWindow()
            } label: {
                Image(systemName: "macwindow.on.rectangle")
            }
            .help("새 창으로 미리보기")
            .disabled(appState.irBlocks.isEmpty)

            // 스타일 설정
            Button {
                appState.showStyleSettings = true
            } label: {
                Image(systemName: "paintbrush")
            }
            .help("스타일 설정")

            // 인스펙터 토글
            Button {
                appState.showInspector.toggle()
            } label: {
                Image(systemName: "sidebar.right")
                    .symbolVariant(appState.showInspector ? .fill : .none)
            }
            .help("스타일 인스펙터")

            // 변환 버튼
            Button {
                appState.convert()
            } label: {
                HStack(spacing: 4) {
                    if appState.isConverting {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Text("변환")
                    Image(systemName: "doc.badge.arrow.up")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(appState.isConverting || appState.irBlocks.isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private func openPreviewWindow() {
        openWindow(id: "preview")
    }
}

// MARK: - 문서 미리보기 영역
struct DocumentPreview: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 0) {
            switch appState.inputMode {
            case .paste:
                PasteInputView()
            case .file:
                FileInputView()
            }

            if !appState.conversionMessage.isEmpty {
                HStack {
                    Text(appState.conversionMessage)
                        .font(.callout)
                        .foregroundStyle(appState.conversionMessage.contains("완료") ? .green : .red)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.bar)
            }
        }
    }
}

// MARK: - 텍스트 붙여넣기 입력
struct PasteInputView: View {
    @EnvironmentObject var appState: AppState
    @State private var showPreview = false

    var body: some View {
        if showPreview && !appState.irBlocks.isEmpty {
            BlockListView()
                .overlay(alignment: .topTrailing) {
                    Button("편집") { showPreview = false }
                        .buttonStyle(.bordered)
                        .padding(12)
                }
        } else {
            VStack(spacing: 0) {
                TextEditor(text: $appState.pasteText)
                    .font(.system(.body, design: .monospaced))
                    .padding(8)

                HStack {
                    Text("\(appState.pasteText.count)자")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("미리보기") {
                        appState.parseInput()
                        showPreview = true
                    }
                    .disabled(appState.pasteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.bar)
            }
        }
    }
}

// MARK: - 파일 업로드 입력
struct FileInputView: View {
    @EnvironmentObject var appState: AppState
    @State private var isDragging = false

    var body: some View {
        if !appState.irBlocks.isEmpty {
            BlockListView()
                .overlay(alignment: .topTrailing) {
                    Button("다른 파일") {
                        appState.irBlocks = []
                        appState.selectedFileURL = nil
                    }
                    .buttonStyle(.bordered)
                    .padding(12)
                }
        } else {
            dropArea
        }
    }

    private var dropArea: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "doc.badge.plus")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("파일을 드래그하거나 클릭하여 선택")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text(".docx, .md, .txt")
                .font(.caption)
                .foregroundStyle(.tertiary)

            Button("파일 선택") {
                openFilePanel()
            }
            .buttonStyle(.bordered)

            if let url = appState.selectedFileURL {
                Text("선택: \(url.lastPathComponent)")
                    .font(.caption)
                    .foregroundStyle(.green)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .background(
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [8]))
                .foregroundStyle(isDragging ? Color.blue : Color.gray.opacity(0.3))
                .padding(20)
        )
        .onDrop(of: [UTType.fileURL], isTargeted: $isDragging) { providers in
            handleDrop(providers)
        }
    }

    private func openFilePanel() {
        DispatchQueue.main.async {
            let panel = NSOpenPanel()
            panel.title = "문서 파일 선택"
            panel.message = "변환할 .docx, .md, .txt 파일을 선택하세요"
            panel.canChooseFiles = true
            panel.canChooseDirectories = false
            panel.allowsMultipleSelection = false
            panel.allowedContentTypes = [.data]  // 모든 파일 허용 후 확장자로 필터
            panel.allowsOtherFileTypes = true

            panel.begin { response in
                if response == .OK, let url = panel.url {
                    let ext = url.pathExtension.lowercased()
                    if ["md", "txt", "markdown", "docx"].contains(ext) {
                        self.appState.selectedFileURL = url
                        self.appState.parseInput()
                    }
                }
            }
        }
    }

    private func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        guard let provider = providers.first else { return false }

        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier) { item, error in
                guard let data = item as? Data,
                      let url = URL(dataRepresentation: data, relativeTo: nil) else { return }

                let ext = url.pathExtension.lowercased()
                guard ["md", "txt", "markdown", "docx"].contains(ext) else { return }

                DispatchQueue.main.async {
                    appState.selectedFileURL = url
                    appState.parseInput()
                }
            }
            return true
        }
        return false
    }
}

// MARK: - IR 블록 리스트 (미리보기)
struct BlockListView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(appState.irBlocks) { block in
                            let displayText = appState.effectiveText(for: block)
                            BlockRowView(block: block, isSelected: appState.selectedBlockIDs.contains(block.id),
                                         hasOverride: appState.blockOverrides[block.id] != nil || appState.blockTextOverrides[block.id] != nil,
                                         effectiveType: appState.effectiveType(for: block),
                                         displayText: displayText)
                                .onTapGesture(count: 2) {
                                    appState.selectBlock(block.id)
                                    appState.showBlockModal = true
                                }
                                // Shift+클릭
                                .simultaneousGesture(TapGesture().modifiers(.shift).onEnded {
                                    appState.selectBlock(block.id, shift: true)
                                })
                                // Command+클릭
                                .simultaneousGesture(TapGesture().modifiers(.command).onEnded {
                                    appState.selectBlock(block.id, command: true)
                                })
                                .onTapGesture(count: 1) {
                                    appState.selectBlock(block.id)
                                    appState.showInspector = true
                                }
                                .contextMenu {
                                    if appState.selectedBlockIDs.count > 1 {
                                        // 복수 선택 컨텍스트 메뉴
                                        Text("\(appState.selectedBlockIDs.count)개 블록 선택")
                                        Divider()
                                        Menu("스타일 일괄 변경") {
                                            ForEach(appState.availableStyleKeys, id: \.self) { key in
                                                Button(appState.displayName(for: key)) {
                                                    appState.setTypeForSelectedBlocks(key)
                                                }
                                            }
                                        }
                                        Divider()
                                        Button("선택 블록 삭제", role: .destructive) {
                                            appState.deleteSelectedBlocks()
                                        }
                                    } else {
                                        Button("편집") {
                                            appState.selectBlock(block.id)
                                            appState.showBlockModal = true
                                        }
                                        Divider()
                                        Menu("스타일 변경") {
                                            ForEach(appState.availableStyleKeys, id: \.self) { key in
                                                Button(appState.displayName(for: key)) {
                                                    appState.blockTypeOverrides[block.id] = key
                                                }
                                            }
                                        }
                                        Divider()
                                        Button("위로 이동") { appState.moveBlockUp(block) }
                                        Button("아래로 이동") { appState.moveBlockDown(block) }
                                        Divider()
                                        Button("아래에 블록 추가") { appState.addBlock(after: block) }
                                        Divider()
                                        Button("삭제", role: .destructive) { appState.deleteBlock(block) }
                                    }
                                }
                                .id(block.id)
                        }
                    }
                    .padding(16)
                }
            }

            // 하단 블록 조작 바
            HStack(spacing: 12) {
                Button {
                    appState.addBlock(after: appState.selectedBlock)
                } label: {
                    Image(systemName: "plus")
                }
                .help("블록 추가")

                Button {
                    if appState.selectedBlockIDs.count > 1 {
                        appState.deleteSelectedBlocks()
                    } else if let block = appState.selectedBlock {
                        appState.deleteBlock(block)
                    }
                } label: {
                    Image(systemName: "minus")
                }
                .help("블록 삭제")
                .disabled(appState.selectedBlockIDs.isEmpty)

                Divider().frame(height: 16)

                Button {
                    if let block = appState.selectedBlock { appState.moveBlockUp(block) }
                } label: {
                    Image(systemName: "chevron.up")
                }
                .help("위로 이동")
                .disabled(appState.selectedBlockIDs.count != 1)

                Button {
                    if let block = appState.selectedBlock { appState.moveBlockDown(block) }
                } label: {
                    Image(systemName: "chevron.down")
                }
                .help("아래로 이동")
                .disabled(appState.selectedBlockIDs.count != 1)

                Spacer()

                if appState.selectedBlockIDs.count > 1 {
                    Text("\(appState.selectedBlockIDs.count)개 선택")
                        .font(.caption).foregroundColor(.accentColor)
                }
                Text("\(appState.irBlocks.count)개 블록")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.bar)
        }
    }
}

struct BlockRowView: View {
    let block: IRBlock
    let isSelected: Bool
    var hasOverride: Bool = false
    var effectiveType: String = ""
    var displayText: String = ""

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            // 스타일 레이블
            Text(styleLabel)
                .font(.caption2)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(styleLabelColor.opacity(0.15))
                .foregroundStyle(styleLabelColor)
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .frame(width: 70, alignment: .trailing)

            // 텍스트 내용
            Text(displayText.isEmpty ? block.text : displayText)
                .font(blockFont)
                .fontWeight(blockWeight)
                .foregroundStyle(.primary)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)

            if hasOverride {
                Image(systemName: "pencil.circle.fill")
                    .foregroundStyle(.orange)
                    .font(.caption)
            }
        }
        .padding(.vertical, 6)
        .padding(.horizontal, CGFloat(indentLevel) * 15 + 8)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(isSelected ? Color.accentColor.opacity(0.1) : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(isSelected ? Color.accentColor.opacity(0.3) : Color.clear, lineWidth: 1)
        )
    }

    private var displayType: String {
        effectiveType.isEmpty ? block.type : effectiveType
    }

    private var styleLabel: String {
        switch displayType {
        case "heading1": return "H1"
        case "heading2": return "H2"
        case "heading3": return "H3"
        case "heading4": return "H4"
        case "body": return "본문"
        case "table": return "표"
        default: return displayType
        }
    }

    private var styleLabelColor: Color {
        switch displayType {
        case "heading1": return .blue
        case "heading2": return .indigo
        case "heading3": return .purple
        case "heading4": return .pink
        case "table": return .orange
        default: return .gray
        }
    }

    private var blockFont: Font {
        switch displayType {
        case "heading1": return .title2
        case "heading2": return .title3
        case "heading3": return .headline
        case "heading4": return .subheadline
        default: return .body
        }
    }

    private var blockWeight: Font.Weight {
        switch displayType {
        case "heading1", "heading2", "heading3": return .bold
        default: return .regular
        }
    }

    private var indentLevel: Int {
        switch displayType {
        case "heading1": return 0
        case "heading2": return 1
        case "heading3": return 2
        case "heading4": return 3
        case "body": return 1
        default: return 0
        }
    }
}
