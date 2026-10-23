import SwiftUI

@main
struct MacroApp: App {
    @State private var store: LocalStore?
    @State private var configuration = AppConfiguration()
    @State private var logging: LoggingController?
    @State private var startupError: String?

    var body: some Scene {
        WindowGroup {
            Group {
                if let store, let logging {
                    AppRootView()
                        .environment(store)
                        .environment(configuration)
                        .environment(logging)
                } else if let startupError {
                    VStack(spacing: 20) {
                        Image(systemName: "externaldrive.badge.exclamationmark").font(.largeTitle)
                        Text("Your diary could not open").font(.title2)
                        Text(startupError).font(.callout)
                        Button("Retry", systemImage: "arrow.clockwise") { start() }
                    }
                    .padding(24).macroPage()
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).macroPage()
                }
            }
            .preferredColorScheme(.dark)
            .tint(.white)
            .task { if store == nil { start() } }
        }
    }

    @MainActor private func start() {
        do {
            let testing = ProcessInfo.processInfo.arguments.contains("--uitesting")
            let store = try LocalStore(inMemory: testing)
            #if DEBUG
            // Explicit developer transfer into this device's diary; no personal data is bundled.
            let arguments = ProcessInfo.processInfo.arguments
            let refreshingHistory = arguments.contains("--refresh-imported-history")
            if !testing && (arguments.contains("--import-history") || refreshingHistory) {
                let documents = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask,
                                                           appropriateFor: nil, create: true)
                let input = documents.appendingPathComponent("MacroHistoryImport.json")
                let updatedEntries = try store.importHistory(Data(contentsOf: input), refreshExisting: refreshingHistory)
                let updatedGoals = refreshingHistory
                    ? try store.applyCurrentGoal(to: store.logs.filter { log in
                        log.assumptions.contains(where: { $0.hasPrefix("Imported from Personal Health Tracker — Diet & Workouts") })
                    }.map(\.dateKey))
                    : 0
                let export = try store.exportData()
                try Data(contentsOf: export).write(to: documents.appendingPathComponent("MacroHistoryImportReceipt.json"),
                                                   options: [.atomic, .completeFileProtection])
                print("Macro history import completed: \(updatedEntries) entries processed, \(updatedGoals) goals applied; \(store.logs.count) total entries.")
            }
            #endif
            var ai: any MealAI = AIClient()
            #if DEBUG
            if testing && !ProcessInfo.processInfo.arguments.contains("--live-ai") {
                configuration.url = "http://127.0.0.1:4001"
                configuration.token = "ui-testing-token-not-for-production"
                ai = UITestAI()
            }
            #endif
            if testing {
                try store.setGoal(Nutrition(calories: 2200, proteinG: 138, fatG: 73, carbsG: 248))
            }
            self.store = store
            logging = LoggingController(store: store, configuration: configuration, ai: ai)
            startupError = nil
        } catch { startupError = error.localizedDescription }
    }
}
