import Foundation
import AVFAudio
import Testing
@testable import Macro

@MainActor
struct DiaryTests {
    @Test func hostedConnectionsRequireHTTPS() throws {
        #expect(try AppConfiguration.validatedURL("https://example.com").scheme == "https")
        #expect(try AppConfiguration.validatedURL("http://192.168.1.2:4001").scheme == "http")
        for url in ["http://example.com", "http://10.1.1.1.example.com", "http://010.0.0.1", "http://+10.0.0.1", "https://user:password@example.com", "https://example.com?token=secret"] {
            #expect(throws: AIError.self) { try AppConfiguration.validatedURL(url) }
        }
    }

    @Test func apiCredentialUsesKeychainAndIsScopedToTheServer() throws {
        let account = "https://\(UUID().uuidString).example.com"
        defer { APICredentialStore.remove(for: account) }
        #expect(try APICredentialStore.load(for: account) == nil)
        try APICredentialStore.save("first-test-credential", for: account)
        #expect(try APICredentialStore.load(for: account) == "first-test-credential")
        #expect(try APICredentialStore.load(for: account + "/other") == nil)
        try APICredentialStore.save("replacement-test-credential", for: account)
        #expect(try APICredentialStore.load(for: account) == "replacement-test-credential")
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["MACRO_TEST_HOSTED_API"] == "1"))
    func hostedAPIConnectionFromNativeClient() async throws {
        let config = try AppConfiguration().snapshot()
        #expect(config.baseURL.scheme == "https")
        let status = try await AIClient().status(configuration: config)
        #expect(status.ok && status.openaiConfigured)
        #expect(status.service == "macro-voice")
    }

    func proposal(date: String = "2026-10-22", calories: Double = 400) -> ProposedLog {
        ProposedLog(date: date, title: "Lunch", foods: [FoodComponent(name: "Rice bowl", portion: "1 bowl", nutrition: Nutrition(calories: calories, proteinG: 20, fatG: 12, carbsG: 53))], assumptions: [])
    }

    @Test func totalsDoNotInventUnknownNutrients() {
        let total = Nutrition.total([Nutrition(calories: 100, proteinG: 10, sugarG: 2), Nutrition(calories: 200, proteinG: 15)])
        #expect(total.calories == 300)
        #expect(total.proteinG == 25)
        #expect(total.sugarG == nil)
        #expect(total.fiberG == nil)
    }

    @Test func datesRejectInvalidDaysAndPreserveCaptureTimezone() {
        #expect(DiaryCalendar.date("2026-02-30") == nil)
        #expect(DiaryCalendar.shifted("2026-03-08", days: 1) == "2026-03-09")
        let instant = ISO8601DateFormatter().date(from: "2026-10-23T02:30:00Z")!
        #expect(DiaryCalendar.key(instant, timeZone: TimeZone(identifier: "America/New_York")!) == "2026-10-22")
    }

    @Test func formulaAndManualGoalHistory() throws {
        let goal = try NutritionCalculator.goal(age: 29, heightCM: 178, weightKG: 82, sex: "male", activity: "moderate", goalType: "maintain")
        #expect(goal.calories == 2700)
        let store = try LocalStore(inMemory: true)
        try store.setGoal(goal, date: "2026-10-22")
        try store.setGoal(Nutrition(calories: 2200, proteinG: 138, fatG: 73, carbsG: 248), date: "2026-10-23")
        #expect(store.goal(on: "2026-10-22")?.calories == 2700)
        #expect(store.goal(on: "2026-10-23")?.calories == 2200)
        #expect(store.goal(on: "2026-10-21") == nil)
    }

    @Test func repeatedSubmissionCannotDuplicateMeals() throws {
        let store = try LocalStore(inMemory: true)
        let draft = try store.beginSubmission(date: "2026-10-22")
        let response = InterpretResult(action: "create", logs: [proposal()])
        try store.commit(response, submission: draft)
        try store.commit(response, submission: draft)
        #expect(store.logs.count == 1)
        #expect(store.totals(on: "2026-10-22").calories == 400)
    }

    @Test func correctionUpdatesOriginalAndUndoRestoresIt() throws {
        let store = try LocalStore(inMemory: true)
        try store.addManual(proposal())
        let originalID = store.logs[0].id
        let draft = try store.beginSubmission(date: "2026-10-22", target: store.logs[0])
        let response = InterpretResult(action: "update", logs: [proposal(calories: 200)], targetLogID: originalID.uuidString, expectedRevision: 0)
        try store.commit(response, submission: draft)
        #expect(store.logs.count == 1)
        #expect(store.logs[0].id == originalID)
        #expect(store.logs[0].nutrition.calories == 200)
        try store.undo()
        #expect(store.logs[0].nutrition.calories == 400)
        #expect(store.logs[0].revision == 2)
    }

    @Test func staleCorrectionAndCanceledResponseCannotWrite() throws {
        let store = try LocalStore(inMemory: true)
        try store.addManual(proposal())
        let meal = store.logs[0]
        let draft = try store.beginSubmission(date: meal.dateKey, target: meal)
        try store.edit(meal, proposed: proposal(calories: 500))
        #expect(throws: DiaryError.self) {
            try store.commit(InterpretResult(action: "update", logs: [proposal(calories: 200)], targetLogID: meal.id.uuidString, expectedRevision: 0), submission: draft)
        }
        #expect(store.logs[0].nutrition.calories == 500)
        let canceled = try store.beginSubmission(date: "2026-10-22")
        try store.cancel(canceled)
        #expect(throws: DiaryError.self) { try store.commit(InterpretResult(action: "create", logs: [proposal()]), submission: canceled) }
        #expect(store.logs.count == 1)
    }

    @Test func deleteUndoAndBackdatingRecomputeTotals() throws {
        let store = try LocalStore(inMemory: true)
        try store.addManual(proposal())
        let meal = store.logs[0]
        try store.edit(meal, proposed: proposal(date: "2026-10-21", calories: 500))
        #expect(store.totals(on: "2026-10-22").calories == 0)
        #expect(store.totals(on: "2026-10-21").calories == 500)
        try store.delete(meal)
        #expect(store.logs.isEmpty)
        try store.undo()
        #expect(store.totals(on: "2026-10-21").calories == 500)
    }

    @Test func localStoreSurvivesReopen() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("diary.store")
        do {
            let store = try LocalStore(url: url)
            try store.addManual(proposal())
        }
        let reopened = try LocalStore(url: url)
        #expect(reopened.logs.count == 1)
        #expect(reopened.logs[0].nutrition.calories == 400)
    }

    private func historyData(_ meals: [LogSnapshot], version: Int = 1) throws -> Data {
        struct History: Encodable { var schemaVersion: Int; var meals: [LogSnapshot] }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(History(schemaVersion: version, meals: meals))
    }

    private func historicalMeal(date: String = "2026-10-19", calories: Double = 750) -> LogSnapshot {
        LogSnapshot(id: UUID(), submissionID: UUID(), proposed: proposal(date: date, calories: calories),
                    transcript: "Original food descriptions", consumedAt: ISO8601DateFormatter().date(from: date + "T16:00:00Z")!,
                    timeZone: "America/New_York", revision: 0)
    }

    @Test func historyImportPreservesExistingDataAndEditedImportsOnReplay() throws {
        let store = try LocalStore(inMemory: true)
        try store.addManual(proposal())
        let originalID = store.logs[0].id
        try store.setGoal(Nutrition(calories: 2100), date: "2026-10-01")
        let draftID = try store.beginSubmission(date: "2026-10-22").id
        store.profile.age = 31
        try store.save()
        let meal = historicalMeal()
        let bytes = try historyData([meal])
        #expect(try store.importHistory(bytes) == 1)
        #expect(store.logs.count == 2)
        #expect(store.log(originalID)?.nutrition.calories == 400)
        #expect(store.totals(on: "2026-10-19").calories == 750)
        #expect(store.log(meal.id)?.consumedAt == meal.consumedAt)
        #expect(store.log(meal.id)?.transcript == meal.transcript)
        #expect(store.log(meal.id)?.nutrition.sugarG == nil)
        #expect(store.profile.age == 31)
        #expect(store.drafts.contains { $0.id == draftID })
        #expect(store.goal(on: "2026-10-19")?.calories == 2100)
        try store.edit(try #require(store.log(meal.id)), proposed: proposal(date: "2026-10-19", calories: 800))
        #expect(try store.importHistory(bytes) == 0)
        #expect(store.log(meal.id)?.nutrition.calories == 800)
        #expect(store.logs.count == 2)
    }

    @Test func historyImportRejectsAnInvalidBatchWithoutPartialWrites() throws {
        let store = try LocalStore(inMemory: true)
        let valid = historicalMeal()
        var invalid = historicalMeal(date: "2026-10-20")
        invalid.proposed.foods[0].nutrition.calories = -1
        #expect(throws: DiaryError.self) { try store.importHistory(historyData([valid, invalid])) }
        #expect(store.logs.isEmpty)
        #expect(throws: DiaryError.self) { try store.importHistory(historyData([valid, valid])) }
        #expect(throws: DiaryError.self) { try store.importHistory(historyData([valid], version: 2)) }
        invalid = historicalMeal()
        invalid.timeZone = "Unknown/Zone"
        #expect(throws: DiaryError.self) { try store.importHistory(historyData([invalid])) }
        #expect(store.logs.isEmpty)
    }

    @Test func historyImportPersistsDatesAndTotalsAcrossReopen() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("history.store")
        var dstMeal = historicalMeal(date: "2026-11-01", calories: 100)
        dstMeal.consumedAt = ISO8601DateFormatter().date(from: "2026-11-01T06:30:00Z")!
        let meals = [historicalMeal(), historicalMeal(date: "2026-10-20", calories: 900), dstMeal]
        do {
            let store = try LocalStore(url: url)
            #expect(try store.importHistory(historyData(meals)) == 3)
        }
        let reopened = try LocalStore(url: url)
        #expect(reopened.logs.count == 3)
        #expect(reopened.log(dstMeal.id)?.consumedAt == dstMeal.consumedAt)
        #expect(reopened.totals(on: "2026-10-19").calories == 750)
        #expect(reopened.totals(on: "2026-10-20").calories == 900)
        #expect(try reopened.importHistory(historyData(meals)) == 0)
    }

    @Test func wireEncodingIncludesUnknownsAsNull() throws {
        let bytes = try JSONEncoder().encode(Nutrition(calories: 100))
        let object = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
        #expect(object["sugarG"] is NSNull)
        #expect(object["fiberG"] is NSNull)
        #expect(object["sodiumMg"] is NSNull)
    }

    @Test func exportIncludesProfileAndNoCredentials() throws {
        let store = try LocalStore(inMemory: true)
        store.profile.age = 30
        try store.addManual(proposal())
        let file = try store.exportData()
        defer { try? FileManager.default.removeItem(at: file) }
        let bytes = try Data(contentsOf: file)
        let object = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
        #expect((object["profile"] as? [String: Any])?["age"] as? Int == 30)
        #expect((object["meals"] as? [Any])?.count == 1)
        #expect(!String(decoding: bytes, as: UTF8.self).contains("proxyToken"))
    }

    @Test func clarificationDoesNotCountUntilAnswered() async throws {
        let store = try LocalStore(inMemory: true)
        let configuration = AppConfiguration()
        configuration.url = "http://127.0.0.1:4001"
        configuration.token = "unit-test-token-long-enough"
        let ai = ClarifyingAI(log: proposal())
        let controller = LoggingController(store: store, configuration: configuration, ai: ai)
        controller.begin(date: "2026-10-22", record: false)
        controller.text = "A bowl"
        controller.send()
        try await finish(controller)
        #expect(store.logs.isEmpty)
        #expect(controller.draft?.state == "clarifying")
        controller.answer = "One cup of rice"
        controller.send()
        try await finish(controller)
        #expect(store.logs.count == 1)
        #expect(controller.draft?.state == "completed")
        #expect(controller.draft?.text.contains("One cup of rice") == true)
    }

    @Test func canceledInFlightInterpretationCannotSave() async throws {
        let store = try LocalStore(inMemory: true)
        let configuration = AppConfiguration()
        configuration.url = "http://127.0.0.1:4001"
        configuration.token = "unit-test-token-long-enough"
        let controller = LoggingController(store: store, configuration: configuration, ai: SlowAI(log: proposal()))
        controller.begin(date: "2026-10-22", record: false)
        controller.text = "Lunch"
        controller.send()
        try await Task.sleep(for: .milliseconds(30))
        controller.cancel()
        try await Task.sleep(for: .milliseconds(180))
        #expect(store.logs.isEmpty)
        #expect(controller.draft?.state == "canceled")
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["MACRO_TEST_AUDIO"] == "1"))
    func microphoneCaptureWritesAudioFrames() async throws {
        let audio = AudioRecorder()
        defer { audio.discard() }
        try await audio.start()
        let session = AVAudioSession.sharedInstance()
        let input = session.currentRoute.inputs.map { $0.portType.rawValue }.joined(separator: ",")
        let muted = AVAudioApplication.shared.isInputMuted
        print("Audio check started: input=\(input), muted=\(muted), rate=\(session.sampleRate)")
        try await Task.sleep(for: .milliseconds(100))
        NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: session,
                                        userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue])
        try await Task.sleep(for: .milliseconds(100))
        #expect(audio.isRecording, "An interruption ending must not stop a fresh recording")
        try await Task.sleep(for: .milliseconds(3800))
        let elapsed = audio.duration
        let meter = audio.levels.max() ?? 0
        audio.stop()
        let file = try AVAudioFile(forReading: #require(audio.fileURL))
        let fileDuration = Double(file.length) / file.processingFormat.sampleRate
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 4096))
        var peak: Float = 0
        while file.framePosition < file.length {
            try file.read(into: buffer)
            if let channel = buffer.floatChannelData?[0] {
                for index in 0..<Int(buffer.frameLength) { peak = max(peak, abs(channel[index])) }
            }
        }
        print("Audio check finished: timer=\(elapsed), fileDuration=\(fileDuration), peak=\(peak), meter=\(meter)")
        #expect(!input.isEmpty)
        #expect(!muted)
        #expect(elapsed >= 3)
        #expect(fileDuration >= 3, "The recorder UI advanced but the file did not contain four seconds of audio")
        #expect(peak > 0, "The captured audio contains only digital silence")
    }

    @Test func waveformShowsQuietMicrophoneInput() {
        #expect(AudioRecorder.waveformLevel(for: -45) > 0.2)
        #expect(AudioRecorder.waveformLevel(for: -160) <= 0.08)
        #expect(AudioRecorder.waveformLevel(for: .nan) <= 0.08)
    }

    @Test func interruptionEndingDoesNotStopRecording() {
        let ended = Notification(name: AVAudioSession.interruptionNotification, userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue])
        let began = Notification(name: AVAudioSession.interruptionNotification, userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
        #expect(!AudioRecorder.shouldStop(for: ended))
        #expect(AudioRecorder.shouldStop(for: began))
        #expect(!AudioRecorder.shouldStop(for: Notification(name: AVAudioSession.interruptionNotification)))
    }

    @Test func emptyAndVeryShortRecordingsDoNotReachTranscription() throws {
        let short = try audioFixture(seconds: 0.04, amplitude: 0)
        let silent = try audioFixture(seconds: 1, amplitude: 0)
        defer { try? FileManager.default.removeItem(at: short); try? FileManager.default.removeItem(at: silent) }
        #expect(throws: AIError.self) { try RecordingAnalysis.inspect(short) }
        #expect(throws: AIError.self) { try RecordingAnalysis.inspect(silent) }
    }

    @Test func quietButValidAudioIsNotRejectedAsSilence() throws {
        let file = try audioFixture(seconds: 1, amplitude: 0.001)
        defer { try? FileManager.default.removeItem(at: file) }
        let analysis = try RecordingAnalysis.inspect(file)
        #expect(analysis.duration >= 0.99)
        #expect(analysis.peak > 0.0009)
    }

    @Test func silentAudioIsRejectedBeforeAnyNetworkRequest() async throws {
        let file = try audioFixture(seconds: 1, amplitude: 0)
        defer { try? FileManager.default.removeItem(at: file) }
        do {
            _ = try await AIClient().transcribe(file, id: UUID(), configuration: ProxyConfiguration(baseURL: URL(string: "http://127.0.0.1:9")!, token: "unit-test-token"))
            Issue.record("Silent audio must not be uploaded")
        } catch {
            #expect(error.localizedDescription.contains("Nothing has been uploaded"))
        }
    }

    private func audioFixture(seconds: Double, amplitude: Float) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).caf")
        let format = try #require(AVAudioFormat(standardFormatWithSampleRate: 22050, channels: 1))
        let count = AVAudioFrameCount(seconds * format.sampleRate)
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count))
        buffer.frameLength = count
        let data = try #require(buffer.floatChannelData?[0])
        for index in 0..<Int(count) { data[index] = amplitude * Float(sin(Double(index) * 2 * .pi * 440 / format.sampleRate)) }
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try file.write(from: buffer)
        return url
    }

    private func finish(_ controller: LoggingController) async throws {
        for _ in 0..<100 {
            if !controller.busy { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        Issue.record("The logging controller did not finish")
    }
}

private actor ClarifyingAI: MealAI {
    let log: ProposedLog
    var calls = 0
    init(log: ProposedLog) { self.log = log }
    func interpret(_ input: InterpretRequest, configuration: ProxyConfiguration) async throws -> InterpretResult {
        calls += 1
        if calls == 1 { return InterpretResult(action: "clarify", logs: [], question: "What was in the bowl?") }
        return InterpretResult(action: "create", logs: [log])
    }
    func transcribe(_ file: URL, id: UUID, configuration: ProxyConfiguration) async throws -> String { "Lunch" }
}

private struct SlowAI: MealAI {
    let log: ProposedLog
    func interpret(_ input: InterpretRequest, configuration: ProxyConfiguration) async throws -> InterpretResult {
        try? await Task.sleep(for: .milliseconds(100))
        return InterpretResult(action: "create", logs: [log])
    }
    func transcribe(_ file: URL, id: UUID, configuration: ProxyConfiguration) async throws -> String { "Lunch" }
}
