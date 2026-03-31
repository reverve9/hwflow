import SwiftUI

struct BlockStyleModal: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    let block: IRBlock
    @State private var selectedType: String
    @State private var overrideStyle: ParagraphStyleData
    @State private var useStyleOverride: Bool
    @State private var editedText: String

    static let defaultBlockTypes = ["heading1", "heading2", "heading3", "heading4", "body"]

    init(block: IRBlock, currentOverride: BlockStyleOverride?, currentTypeOverride: String?, currentTextOverride: String?) {
        self.block = block
        _selectedType = State(initialValue: currentTypeOverride ?? block.type)
        _overrideStyle = State(initialValue: currentOverride?.style ?? ParagraphStyleData())
        _useStyleOverride = State(initialValue: currentOverride != nil)
        _editedText = State(initialValue: currentTextOverride ?? block.text)
    }

    var body: some View {
        VStack(spacing: 0) {
            // 헤더
            HStack {
                VStack(alignment: .leading) {
                    Text("블록 수정")
                        .font(.title3)
                        .fontWeight(.bold)
                    Text(block.text.prefix(60) + (block.text.count > 60 ? "..." : ""))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                Button("적용") {
                    applyChanges()
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                Button("취소") { dismiss() }
                    .buttonStyle(.bordered)
            }
            .padding(16)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // 텍스트 편집
                    VStack(alignment: .leading, spacing: 8) {
                        Text("내용")
                            .font(.headline)
                        TextEditor(text: $editedText)
                            .font(.system(.body, design: .monospaced))
                            .frame(minHeight: 60, maxHeight: 120)
                            .border(Color.gray.opacity(0.3))
                    }

                    Divider()

                    // 블록 타입 변경
                    VStack(alignment: .leading, spacing: 8) {
                        Text("단락 스타일")
                            .font(.headline)

                        HStack(spacing: 12) {
                            Text("원본:")
                                .foregroundStyle(.secondary)
                            Text(StyleData.styleLabels[block.type] ?? block.type)
                                .foregroundStyle(.secondary)

                            if selectedType != block.type {
                                Image(systemName: "arrow.right")
                                    .foregroundStyle(.orange)
                                Text(StyleData.styleLabels[selectedType] ?? selectedType)
                                    .fontWeight(.medium)
                                    .foregroundStyle(.orange)
                            }
                        }
                        .font(.callout)

                        Picker("변경할 스타일", selection: $selectedType) {
                            ForEach(appState.availableStyleKeys, id: \.self) { key in
                                Text(appState.displayName(for: key)).tag(key)
                            }
                        }
                        .pickerStyle(.radioGroup)
                    }

                    Divider()

                    // 스타일 세부 수정
                    VStack(alignment: .leading, spacing: 8) {
                        Toggle("세부 스타일 개별 수정", isOn: $useStyleOverride)

                        if useStyleOverride {
                            VStack(alignment: .leading, spacing: 12) {
                                HStack(spacing: 16) {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text("폰트").font(.caption).foregroundStyle(.secondary)
                                        Picker("", selection: $overrideStyle.font) {
                                            Text("함초롬바탕").tag("함초롬바탕")
                                            Text("함초롬돋움").tag("함초롬돋움")
                                        }
                                        .frame(width: 130)
                                    }
                                    NumberField(label: "크기(pt)", value: $overrideStyle.sizePt)
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text("굵기").font(.caption).foregroundStyle(.secondary)
                                        Toggle("Bold", isOn: $overrideStyle.bold)
                                            .toggleStyle(.checkbox)
                                    }
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text("정렬").font(.caption).foregroundStyle(.secondary)
                                        Picker("", selection: $overrideStyle.align) {
                                            Text("왼쪽").tag("left")
                                            Text("가운데").tag("center")
                                            Text("오른쪽").tag("right")
                                            Text("양쪽").tag("justify")
                                        }
                                        .frame(width: 80)
                                    }
                                }

                                HStack(spacing: 16) {
                                    NumberField(label: "줄간격(%)", value: $overrideStyle.lineHeight)
                                    NumberField(label: "들여쓰기", value: $overrideStyle.indentLeft)
                                    NumberField(label: "단락 전", value: $overrideStyle.spaceBefore)
                                    NumberField(label: "단락 후", value: $overrideStyle.spaceAfter)
                                }
                            }
                            .padding(12)
                            .background(
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(Color.gray.opacity(0.1))
                            )

                            Button("프리셋 기본값으로 초기화") {
                                loadDefaultForType()
                            }
                            .font(.caption)
                        }
                    }
                }
                .padding(20)
            }
        }
        .frame(width: 520, height: useStyleOverride ? 560 : 400)
        .onAppear { loadDefaultIfNeeded() }
        .onChange(of: selectedType) { _, _ in
            if !useStyleOverride {
                loadDefaultForType()
            }
        }
    }

    private func loadDefaultIfNeeded() {
        if !useStyleOverride {
            loadDefaultForType()
        }
    }

    private func loadDefaultForType() {
        let typeToLoad = selectedType
        let path = "\(HWFlowPaths.stylesDir)/\(appState.selectedPreset).json"
        guard let data = FileManager.default.contents(atPath: path),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let styles = json["paragraph_styles"] as? [String: [String: Any]],
              let dict = styles[typeToLoad] else { return }
        overrideStyle = ParagraphStyleData.from(dict: dict)
    }

    private func applyChanges() {
        // 텍스트 변경
        if editedText != block.text {
            appState.blockTextOverrides[block.id] = editedText
        } else {
            appState.blockTextOverrides.removeValue(forKey: block.id)
        }

        // 타입 변경
        if selectedType != block.type {
            appState.blockTypeOverrides[block.id] = selectedType
        } else {
            appState.blockTypeOverrides.removeValue(forKey: block.id)
        }

        // 스타일 오버라이드
        if useStyleOverride {
            appState.blockOverrides[block.id] = BlockStyleOverride(style: overrideStyle)
        } else {
            appState.blockOverrides.removeValue(forKey: block.id)
        }
    }
}

struct BlockStyleOverride {
    var style: ParagraphStyleData
}
