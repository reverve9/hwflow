import Foundation
import JavaScriptCore

actor JSBridge {
    private let context: JSContext
    private let stylesDir: String
    private let engineLoaded: Bool

    // 개발용 경로
    private static let devRoot = "/Volumes/NINE_DEV/PROJECT/HWFlow"

    init() {
        let ctx = JSContext()!
        self.context = ctx

        // 스타일 디렉토리 (번들 우선 → 개발 경로 폴백)
        let bundledStyles = (Bundle.main.resourcePath ?? "") + "/styles"
        if FileManager.default.fileExists(atPath: bundledStyles) {
            self.stylesDir = bundledStyles
        } else {
            self.stylesDir = Self.devRoot + "/styles"
        }

        // JS 엔진 로드
        self.engineLoaded = Self.loadEngine(ctx)

        // 에러 핸들러
        ctx.exceptionHandler = { _, exception in
            print("[JSBridge] JS Error: \(exception?.toString() ?? "unknown")")
        }

        if engineLoaded {
            let ver = ctx.objectForKeyedSubscript("HWFlowEngine")?
                .invokeMethod("version", withArguments: [])?.toString() ?? "?"
            print("[JSBridge] Engine loaded, version: \(ver)")
        } else {
            print("[JSBridge] WARNING: Engine failed to load")
        }
        print("[JSBridge] stylesDir: \(self.stylesDir)")
    }

    private static func loadEngine(_ ctx: JSContext) -> Bool {
        // 1순위: 앱 번들 리소스
        if let bundlePath = Bundle.main.path(forResource: "hwflow_engine", ofType: "js"),
           let source = try? String(contentsOfFile: bundlePath, encoding: .utf8) {
            ctx.evaluateScript(source)
            print("[JSBridge] Mode: BUNDLED")
            return true
        }

        // 2순위: 개발 모드 (빌드된 JS)
        let devPath = devRoot + "/js-engine/dist/hwflow_engine.js"
        if let source = try? String(contentsOfFile: devPath, encoding: .utf8) {
            ctx.evaluateScript(source)
            print("[JSBridge] Mode: DEV (\(devPath))")
            return true
        }

        return false
    }

    // MARK: - 스타일 목록 조회 (JS 불필요 — Swift에서 직접 처리)

    func listStyles() -> [StylePreset] {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(atPath: stylesDir) else {
            return [StylePreset(id: "공문서_표준", name: "공문서_표준",
                                description: "기본", file: "공문서_표준.json")]
        }
        return files.filter { $0.hasSuffix(".json") }.sorted().compactMap { fname in
            let path = stylesDir + "/" + fname
            guard let data = fm.contents(atPath: path),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let meta = json["meta"] as? [String: Any] else { return nil }
            return StylePreset(
                id: (meta["name"] as? String) ?? fname.replacingOccurrences(of: ".json", with: ""),
                name: (meta["name"] as? String) ?? "",
                description: (meta["description"] as? String) ?? "",
                file: fname
            )
        }
    }

    // MARK: - 마크다운 파싱

    func parseMarkdown(_ text: String) -> [IRBlock] {
        guard engineLoaded else { return [] }
        let engine = context.objectForKeyedSubscript("HWFlowEngine")
        let result = engine?.invokeMethod("parseMarkdownJSON", withArguments: [text])
        let json = result?.toString() ?? "[]"
        return parseIRJSON(json)
    }

    // MARK: - 파일 파싱

    func parseFile(_ url: URL) -> [IRBlock] {
        let ext = url.pathExtension.lowercased()
        if ["md", "txt", "markdown"].contains(ext) {
            let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            return parseMarkdown(text)
        } else if ext == "docx" {
            guard let data = FileManager.default.contents(atPath: url.path) else {
                print("[JSBridge] Cannot read file: \(url.path)")
                return []
            }
            let base64 = data.base64EncodedString()
            guard engineLoaded else { return [] }
            let engine = context.objectForKeyedSubscript("HWFlowEngine")
            let result = engine?.invokeMethod("parseDocxJSON", withArguments: [base64])
            let json = result?.toString() ?? "[]"
            return parseIRJSON(json)
        }
        return []
    }

    // MARK: - 변환

    func convertMarkdown(_ text: String, style: String, output: String) -> Bool {
        guard engineLoaded,
              let styleJson = loadStyleJSON(style) else { return false }
        let engine = context.objectForKeyedSubscript("HWFlowEngine")
        let result = engine?.invokeMethod("convertMarkdown",
                                           withArguments: [text, styleJson, ""])
        let base64 = result?.toString() ?? ""
        return writeBase64(base64, to: output)
    }

    func convertFile(_ url: URL, style: String, output: String) -> Bool {
        let ext = url.pathExtension.lowercased()

        if ["md", "txt", "markdown"].contains(ext) {
            let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            return convertMarkdown(text, style: style, output: output)
        } else if ext == "docx" {
            guard let data = FileManager.default.contents(atPath: url.path),
                  let styleJson = loadStyleJSON(style),
                  engineLoaded else { return false }
            let base64In = data.base64EncodedString()
            let engine = context.objectForKeyedSubscript("HWFlowEngine")
            let result = engine?.invokeMethod("convertDocx",
                                               withArguments: [base64In, styleJson, ""])
            let base64Out = result?.toString() ?? ""
            return writeBase64(base64Out, to: output)
        }
        return false
    }

    // MARK: - 헬퍼

    private func loadStyleJSON(_ styleName: String) -> String? {
        var name = styleName
        if !name.hasSuffix(".json") { name += ".json" }

        // 직접 경로
        if FileManager.default.fileExists(atPath: styleName) {
            return try? String(contentsOfFile: styleName, encoding: .utf8)
        }

        let path = stylesDir + "/" + name
        return try? String(contentsOfFile: path, encoding: .utf8)
    }

    private func writeBase64(_ base64: String, to path: String) -> Bool {
        guard !base64.isEmpty,
              let data = Data(base64Encoded: base64) else {
            print("[JSBridge] base64 decode failed")
            return false
        }
        return FileManager.default.createFile(atPath: path, contents: data)
    }

    // MARK: - IR JSON 파싱 (PythonBridge.parseIRJSON과 동일)

    private func parseIRJSON(_ json: String) -> [IRBlock] {
        guard !json.isEmpty,
              let data = json.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            print("[JSBridge] IR JSON parse failed. Raw: \(json.prefix(200))")
            return []
        }
        return arr.map { IRBlock.from(dict: $0) }
    }
}
