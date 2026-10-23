import Foundation
import Testing
@testable import Macro

@MainActor
struct FoodHistoryTests {
    private func meal(_ name: String = "Garlic bread", date: String = "2026-01-01", source: String = "user_reported") -> ProposedLog {
        ProposedLog(date: date, title: name, foods: [FoodComponent(name: name, portion: "1 slice", nutrition: Nutrition(calories: 150, proteinG: 3, fatG: 7, carbsG: 18), ingredients: name.contains("bread") ? ["bread", "garlic butter"] : [], source: source)], assumptions: [])
    }

    private func controller(_ store: LocalStore, _ ai: any MealAI) -> LoggingController {
        let config = AppConfiguration()
        config.url = "http://127.0.0.1:4001"
        config.token = "unit-test-token-long-enough"
        return LoggingController(store: store, configuration: config, ai: ai)
    }

    private func finish(_ controller: LoggingController) async throws {
        for _ in 0..<200 {
            if !controller.busy { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        Issue.record("History logging did not finish")
    }

    @Test func searchesWholeDiaryAndPrefersConsumptionDateOverEditDate() throws {
        let store = try LocalStore(inMemory: true)
        try store.addManual(meal(date: "2026-01-01"))
        let old = try #require(store.logs.first)
        try store.addManual(meal(date: "2026-02-01"))
        let recent = try #require(store.logs.first { $0.dateKey == "2026-02-01" })
        // Many unrelated newer meals must not hide an older food.
        for day in 1...12 { try store.addManual(meal("Yogurt", date: String(format: "2026-10-%02d", day))) }
        try store.edit(old, proposed: meal(date: "2026-01-01"))
        let matches = store.foodHistory(matching: ["garlic breads"])
        #expect(matches.count == 2)
        #expect(matches.first?.id.hasPrefix(recent.id.uuidString) == true)
        #expect(matches.last?.id == "\(old.id.uuidString):1:0")
        #expect(matches.last?.food.nutrition == old.foods.first?.nutrition)
    }

    @Test func excludesDailyAggregatesAndReturnsBoundedFoodSnapshots() throws {
        let store = try LocalStore(inMemory: true)
        try store.addManual(meal("Daily total", source: "imported_daily_estimate"))
        #expect(store.foodHistory(matching: ["garlic bread"]).isEmpty)
        for _ in 0..<15 { try store.addManual(meal("Café garlic bread")) }
        let matches = store.foodHistory(matching: ["cafe garlic bread", "garlic bread"])
        #expect(matches.count <= 10)
        #expect(Set(matches.map(\.id)).count == matches.count)
        #expect(matches.first?.food.name == "Café garlic bread")
        #expect(store.foodHistory(matching: ["chicken"]).isEmpty)
        let selected = try #require(store.logs.first { $0.foods[0].source != "imported_daily_estimate" })
        try store.delete(selected)
        #expect(!store.foodHistory(matching: ["cafe garlic bread"]).contains { $0.id.hasPrefix(selected.id.uuidString) })
    }

    @Test func ordinaryLogSendsNoHistoryEvenWithPopulatedDiary() async throws {
        let store = try LocalStore(inMemory: true)
        try store.addManual(meal())
        let ai = HistoryAI(log: meal("Banana", date: "2026-10-23"), mode: .ordinary)
        let logging = controller(store, ai)
        logging.begin(date: "2026-10-23", record: false)
        logging.text = "I ate a banana"
        logging.send()
        try await finish(logging)
        let requests = await ai.requests
        #expect(requests.count == 1)
        #expect(requests[0].recentLogs.isEmpty)
        #expect(requests[0].history?.phase == "initial")
        #expect(requests[0].history?.matches.isEmpty == true)
        #expect(store.logs.count == 2)
    }

    @Test func explicitReferenceResolvesInternallyAndCreatesANewMeal() async throws {
        let store = try LocalStore(inMemory: true)
        try store.addManual(meal())
        let prior = try #require(store.logs.first)
        let ai = HistoryAI(log: meal(date: "2026-10-23"))
        let logging = controller(store, ai)
        logging.begin(date: "2026-10-23", record: false)
        logging.text = "Two slices of the same garlic bread we logged last time"
        logging.send()
        try await finish(logging)
        let requests = await ai.requests
        #expect(requests.count == 2)
        #expect(requests[0].history?.matches.isEmpty == true)
        #expect(requests[1].history?.matches.first?.food == prior.foods.first)
        #expect(requests[1].requestID != requests[0].requestID)
        #expect(requests[1].target == nil)
        #expect(logging.draft?.question == nil)
        #expect(logging.draft?.state == "completed")
        #expect(!logging.presented)
        #expect(store.logs.count == 2)
        #expect(prior.revision == 0)
        #expect(prior.nutrition.calories == 150)
        logging.send()
        #expect(store.logs.count == 2)
    }

    @Test func resolvedLookupRetriesWithTheSameSnapshotAndRequestID() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("diary.store")
        let store = try LocalStore(url: url)
        try store.addManual(meal())
        let ai = HistoryAI(log: meal(date: "2026-10-23"), mode: .failOnce)
        let logging = controller(store, ai)
        logging.begin(date: "2026-10-23", record: false)
        logging.text = "The same garlic bread as before"
        logging.send()
        try await finish(logging)
        #expect(logging.draft?.state == "failed")
        #expect(store.logs.count == 1)
        let reopened = try LocalStore(url: url)
        let resumed = controller(reopened, ai)
        resumed.resume(try #require(reopened.drafts.first))
        resumed.send()
        try await finish(resumed)
        let requests = await ai.requests
        #expect(requests.count == 3)
        #expect(requests[1].requestID == requests[2].requestID)
        #expect(requests[1].history?.matches == requests[2].history?.matches)
        #expect(reopened.logs.count == 2)
        #expect(resumed.draft?.state == "completed")
    }

    @Test func noMatchStillLogsAndLookupCannotLoopOrAskQuestions() async throws {
        for mode in [HistoryAI.Mode.normal, .repeatLookup, .clarify] {
            let store = try LocalStore(inMemory: true)
            let ai = HistoryAI(log: meal(date: "2026-10-23"), mode: mode)
            let logging = controller(store, ai)
            logging.begin(date: "2026-10-23", record: false)
            logging.text = "The same garlic bread as before"
            logging.send()
            try await finish(logging)
            let requests = await ai.requests
            #expect(requests.count == 2)
            #expect(requests[1].history?.matches.isEmpty == true)
            #expect(logging.draft?.question == nil)
            #expect(store.logs.count == (mode == .normal ? 1 : 0))
            #expect(logging.draft?.state == (mode == .normal ? "completed" : "failed"))
        }
    }

    @Test func cancellationDuringResolvedRequestCannotSave() async throws {
        let store = try LocalStore(inMemory: true)
        try store.addManual(meal())
        let ai = HistoryAI(log: meal(date: "2026-10-23"), mode: .slow)
        let logging = controller(store, ai)
        logging.begin(date: "2026-10-23", record: false)
        logging.text = "Same garlic bread as last time"
        logging.send()
        for _ in 0..<100 {
            if await ai.requests.count == 2 { break }
            try await Task.sleep(for: .milliseconds(5))
        }
        logging.cancel()
        try await Task.sleep(for: .milliseconds(150))
        #expect(store.logs.count == 1)
        #expect(logging.draft?.state == "canceled")
    }

    @Test func legacyDraftDropsImplicitContextAndClarification() async throws {
        let store = try LocalStore(inMemory: true)
        try store.addManual(meal())
        let draft = try store.beginSubmission(date: "2026-10-23")
        draft.text = "I ate a banana"
        draft.question = "Which brand?"
        draft.requestData = try JSONEncoder().encode(InterpretRequest(requestID: UUID().uuidString, text: draft.text, selectedDate: draft.selectedDate, captureDate: draft.selectedDate, capturedAt: ISO8601DateFormatter().string(from: draft.capturedAt), timeZone: draft.capturedTimeZone, target: nil, recentLogs: store.logs.map(\.context), previousQuestion: draft.question))
        let ai = HistoryAI(log: meal("Banana", date: "2026-10-23"), mode: .ordinary)
        let logging = controller(store, ai)
        logging.resume(draft)
        logging.send()
        try await finish(logging)
        let request = try #require(await ai.requests.first)
        #expect(request.recentLogs.isEmpty)
        #expect(request.previousQuestion == nil)
        #expect(request.history?.matches.isEmpty == true)
        #expect(draft.question == nil)
    }
}

private actor HistoryAI: MealAI {
    enum Mode { case normal, ordinary, failOnce, repeatLookup, clarify, slow }
    let log: ProposedLog
    let mode: Mode
    var requests: [InterpretRequest] = []
    init(log: ProposedLog, mode: Mode = .normal) { self.log = log; self.mode = mode }

    func interpret(_ input: InterpretRequest, configuration: ProxyConfiguration) async throws -> InterpretResult {
        requests.append(input)
        if mode != .ordinary && (input.history?.phase == "initial" || mode == .repeatLookup) {
            return InterpretResult(action: "lookup_history", logs: [], historyQueries: ["garlic bread"])
        }
        if mode == .failOnce && requests.count == 2 { throw AIError.message("Temporary network failure") }
        if mode == .clarify { return InterpretResult(action: "clarify", logs: [], question: "Which brand?") }
        if mode == .slow { try? await Task.sleep(for: .milliseconds(100)) }
        return InterpretResult(action: "create", logs: [log])
    }
    func transcribe(_ file: URL, id: UUID, configuration: ProxyConfiguration) async throws -> String { "Same garlic bread as before" }
}
