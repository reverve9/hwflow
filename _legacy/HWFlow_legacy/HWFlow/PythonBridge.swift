import Foundation

actor PythonBridge {
    private let enginePath: String   // hwflow_engine 또는 python3 경로
    private let stylesDir: String    // styles/ 디렉토리
    private let isBundled: Bool      // 번들 모드 여부

    // 개발용 (번들 안 됐을 때)
    private let devPythonPath: String?
    private let devPythonDir: String?

    private static let devRoot = "/Volumes/NINE_DEV/PROJECT/HWFlow"

    init() {
        let fm = FileManager.default
        let bundle = Bundle.main.resourcePath ?? ""

        // 1순위: 개발 모드 (소스 디렉토리 직접 사용 — 코드 수정 즉시 반영)
        let devRootPath: String? = {
            if let envRoot = ProcessInfo.processInfo.environment["HWFLOW_ROOT"],
               fm.fileExists(atPath: envRoot + "/python/main.py") {
                return envRoot
            }
            if fm.fileExists(atPath: Self.devRoot + "/python/main.py") {
                return Self.devRoot
            }
            return nil
        }()

        if let root = devRootPath {
            self.isBundled = false
            self.stylesDir = root + "/styles"
            self.enginePath = ""
            self.devPythonDir = root + "/python"

            let venvPython = root + "/.venv/bin/python3"
            self.devPythonPath = fm.fileExists(atPath: venvPython) ? venvPython : "/usr/bin/python3"

            print("[HWFlow] Mode: DEV")
            print("[HWFlow] pythonDir: \(self.devPythonDir!)")
            print("[HWFlow] pythonPath: \(self.devPythonPath!)")
            return
        }

        // 2순위: 번들 모드 (hwflow_engine 사용)
        let bundledEngine = bundle + "/hwflow_engine/hwflow_engine"
        let bundledStyles = bundle + "/styles"

        if fm.fileExists(atPath: bundledEngine) {
            self.isBundled = true
            self.enginePath = bundledEngine
            self.stylesDir = bundledStyles
            self.devPythonPath = nil
            self.devPythonDir = nil

            print("[HWFlow] Mode: BUNDLED")
            print("[HWFlow] engine: \(self.enginePath)")
            print("[HWFlow] stylesDir: \(self.stylesDir)")
            return
        }

        // fallback
        print("[HWFlow] WARNING: No engine or dev root found")
        self.isBundled = false
        self.enginePath = ""
        self.stylesDir = ""
        self.devPythonPath = "/usr/bin/python3"
        self.devPythonDir = ""
    }

    // MARK: - 스타일 목록 조회
    func listStyles() -> [StylePreset] {
        let result = runCommand(["--list-styles", "--styles-dir", stylesDir])
        guard let data = result.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] else {
            return [StylePreset(id: "공문서_표준", name: "공문서_표준", description: "기본", file: "공문서_표준.json")]
        }
        return arr.map {
            StylePreset(id: $0["name"] ?? "", name: $0["name"] ?? "",
                        description: $0["description"] ?? "", file: $0["file"] ?? "")
        }
    }

    // MARK: - 마크다운 파싱
    func parseMarkdown(_ text: String) -> [IRBlock] {
        let tmpFile = NSTemporaryDirectory() + "hwflow_input.md"
        try? text.write(toFile: tmpFile, atomically: true, encoding: .utf8)
        let result = runCommand(["--parse-markdown", tmpFile])
        return parseIRJSON(result)
    }

    // MARK: - 파일 파싱
    func parseFile(_ url: URL) -> [IRBlock] {
        let ext = url.pathExtension.lowercased()
        if ["md", "txt", "markdown"].contains(ext) {
            let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            return parseMarkdown(text)
        } else if ext == "docx" {
            let result = runCommand(["--parse-docx", url.path])
            return parseIRJSON(result)
        }
        return []
    }

    // MARK: - 변환
    func convertMarkdown(_ text: String, style: String, output: String) -> Bool {
        let tmpFile = NSTemporaryDirectory() + "hwflow_input.md"
        try? text.write(toFile: tmpFile, atomically: true, encoding: .utf8)
        let result = runCommand(["--input", tmpFile, "--style", style,
                                  "--output", output, "--styles-dir", stylesDir])
        return result.contains("변환 완료")
    }

    func convertFile(_ url: URL, style: String, output: String) -> Bool {
        let result = runCommand(["--input", url.path, "--style", style,
                                  "--output", output, "--styles-dir", stylesDir])
        return result.contains("변환 완료")
    }

    // MARK: - 통합 프로세스 실행

    private func runCommand(_ arguments: [String]) -> String {
        let process = Process()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()

        if isBundled {
            // 번들 모드: hwflow_engine 직접 실행
            process.executableURL = URL(fileURLWithPath: enginePath)
            process.arguments = arguments
        } else {
            // 개발 모드: python3 main.py <args>
            process.executableURL = URL(fileURLWithPath: devPythonPath ?? "/usr/bin/python3")
            process.currentDirectoryURL = URL(fileURLWithPath: devPythonDir ?? "")
            process.arguments = ["main.py"] + arguments
        }

        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        var env = ProcessInfo.processInfo.environment
        if !isBundled, let pyDir = devPythonDir {
            env["PYTHONPATH"] = pyDir
        }
        env["PYTHONIOENCODING"] = "utf-8"
        env["HWFLOW_STYLES_DIR"] = stylesDir
        process.environment = env

        do {
            try process.run()
            process.waitUntilExit()

            let outData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
            let errData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
            let stdout = String(data: outData, encoding: .utf8) ?? ""
            let stderr = String(data: errData, encoding: .utf8) ?? ""

            if process.terminationStatus != 0 {
                print("[HWFlow] Error (exit \(process.terminationStatus)):")
                print("[HWFlow] stderr: \(stderr)")
                print("[HWFlow] stdout: \(stdout)")
            }
            return stdout
        } catch {
            print("[HWFlow] Process launch error: \(error)")
            return ""
        }
    }

    // MARK: - IR JSON 파싱
    private func parseIRJSON(_ json: String) -> [IRBlock] {
        guard !json.isEmpty,
              let data = json.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            print("[HWFlow] IR JSON parse failed. Raw: \(json.prefix(200))")
            return []
        }
        return arr.map { IRBlock.from(dict: $0) }
    }
}
