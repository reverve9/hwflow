import SwiftUI

@main
struct HWFlowApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .frame(minWidth: 800, minHeight: 600)
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 1000, height: 700)

        WindowGroup("문서 미리보기", id: "preview") {
            DocumentPreviewWindow()
                .environmentObject(appState)
        }
        .defaultSize(width: 650, height: 842)
    }
}
