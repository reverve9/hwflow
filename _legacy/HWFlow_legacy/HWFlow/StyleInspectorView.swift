import SwiftUI

struct StyleInspectorView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 0) {
            // 헤더
            HStack {
                Image(systemName: "magnifyingglass")
                Text("스타일 인스펙터")
                    .font(.headline)
                Spacer()
                Button {
                    appState.showInspector = false
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(12)
            .background(.bar)

            Divider()

            if let block = appState.selectedBlock {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // 단락 스타일 정보
                        InspectorSection(title: "단락 스타일") {
                            let effectiveType = appState.effectiveType(for: block)
                            LabeledValue(label: "원본", value: hwpMapping(block.type))
                            if effectiveType != block.type {
                                HStack {
                                    Text("적용")
                                        .font(.callout)
                                        .foregroundStyle(.secondary)
                                        .frame(width: 70, alignment: .leading)
                                    Text(hwpMapping(effectiveType))
                                        .font(.callout)
                                        .fontWeight(.bold)
                                        .foregroundStyle(.orange)
                                    Spacer()
                                }
                            } else {
                                LabeledValue(label: "적용", value: hwpMapping(effectiveType))
                            }
                        }

                        // 프리셋에서 로드된 스타일 값
                        if let preset = currentPresetValues(for: appState.effectiveType(for: block)) {
                            InspectorSection(title: "폰트") {
                                LabeledValue(label: "서체", value: preset["font"] as? String ?? "-")
                                LabeledValue(label: "크기", value: "\(preset["size_pt"] as? Int ?? 0)pt")
                                LabeledValue(label: "굵기", value: (preset["bold"] as? Bool ?? false) ? "Bold" : "Regular")
                            }

                            InspectorSection(title: "단락") {
                                LabeledValue(label: "정렬", value: alignLabel(preset["align"] as? String ?? ""))
                                LabeledValue(label: "줄간격", value: "\(preset["line_height_percent"] as? Int ?? 160)%")
                                LabeledValue(label: "들여쓰기", value: hwpunitToMM(preset["indent_left_hwpunit"] as? Int ?? 0))
                                LabeledValue(label: "단락 전", value: hwpunitToMM(preset["space_before_hwpunit"] as? Int ?? 0))
                                LabeledValue(label: "단락 후", value: hwpunitToMM(preset["space_after_hwpunit"] as? Int ?? 0))
                            }

                            if let numbering = preset["numbering"] as? String {
                                InspectorSection(title: "번호 매기기") {
                                    LabeledValue(label: "형식", value: numbering)
                                }
                            }
                        }

                        // 텍스트 미리보기
                        InspectorSection(title: "내용 미리보기") {
                            Text(block.text)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(5)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(12)
                }
            } else {
                VStack(spacing: 12) {
                    Spacer()
                    Image(systemName: "cursorarrow.click.2")
                        .font(.title)
                        .foregroundStyle(.secondary)
                    Text("단락을 클릭하면\n스타일 정보가 여기에 표시됩니다")
                        .multilineTextAlignment(.center)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            }
        }
        .background(.background)
    }

    private func hwpMapping(_ type: String) -> String {
        appState.displayName(for: type)
    }

    private func alignLabel(_ align: String) -> String {
        switch align {
        case "left": return "왼쪽"
        case "center": return "가운데"
        case "right": return "오른쪽"
        case "justify": return "양쪽 정렬"
        default: return align
        }
    }

    private func hwpunitToMM(_ value: Int) -> String {
        let mm = Double(value) / 283.46
        return String(format: "%.1fmm", mm)
    }

    private func currentPresetValues(for type: String) -> [String: Any]? {
        // 스타일 프리셋 JSON을 직접 로드
        let stylesDir = Bundle.main.bundlePath + "/../../../../../styles"
        let presetFile = stylesDir + "/\(appState.selectedPreset).json"

        // 개발 중에는 프로젝트 디렉토리에서 직접 로드 시도
        let candidates = [
            presetFile,
            ProcessInfo.processInfo.environment["HWFLOW_ROOT"].map { $0 + "/styles/\(appState.selectedPreset).json" },
            "/Volumes/NINE_DEV/PROJECT/HWFlow/styles/\(appState.selectedPreset).json"
        ].compactMap { $0 }

        for path in candidates {
            if let data = FileManager.default.contents(atPath: path),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let styles = json["paragraph_styles"] as? [String: [String: Any]] {
                return styles[type]
            }
        }
        return nil
    }
}

// MARK: - 인스펙터 UI 컴포넌트

struct InspectorSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)

            VStack(alignment: .leading, spacing: 4) {
                content()
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.gray.opacity(0.1))
            )
        }
    }
}

struct LabeledValue: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.callout)
                .foregroundStyle(.secondary)
                .frame(width: 70, alignment: .leading)
            Text(value)
                .font(.callout)
                .fontWeight(.medium)
            Spacer()
        }
    }
}
