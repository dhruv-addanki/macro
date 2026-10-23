import Foundation
import Observation

@MainActor @Observable
final class LoggingController {
    let store: LocalStore
    let configuration: AppConfiguration
    let audio = AudioRecorder()
    private let ai: any MealAI
    private var task: Task<Void, Never>?
    private var operationID = UUID()
    var draft: PendingSubmission?
    var text = ""
    var errorMessage: String?
    var busy = false
    var phase = ""
    var presented = false
    var completedDate: String?

    init(store: LocalStore, configuration: AppConfiguration, ai: any MealAI = AIClient()) {
        self.store = store
        self.configuration = configuration
        self.ai = ai
    }

    func begin(date: String, target: MealLog? = nil, record: Bool) {
        task?.cancel()
        operationID = UUID()
        busy = false
        phase = ""
        audio.stop()
        errorMessage = nil
        completedDate = nil
        text = ""
        do {
            draft = try store.beginSubmission(date: date, target: target)
            presented = true
            if record { startRecording() }
        } catch { errorMessage = error.localizedDescription }
    }

    func resume(_ draft: PendingSubmission) {
        task?.cancel()
        operationID = UUID()
        busy = false
        phase = ""
        self.draft = draft
        text = draft.text
        errorMessage = draft.errorMessage
        presented = true
    }

    func startRecording() {
        guard let draft, !busy else { return }
        task?.cancel()
        audio.stop()
        errorMessage = nil
        task = Task {
            do {
                let previousPath = draft.recordingPath
                try await audio.start()
                guard !Task.isCancelled, presented, draft.state != "canceled" else { audio.discard(); return }
                if let previousPath { try? FileManager.default.removeItem(atPath: previousPath) }
                draft.recordingPath = audio.fileURL?.path
                draft.text = ""
                draft.requestData = nil
                draft.responseData = nil
                draft.question = nil
                draft.errorMessage = nil
                text = ""
                draft.state = "recording"
                try store.save()
            } catch is CancellationError {
                return
            } catch {
                guard self.draft?.id == draft.id, presented, !Task.isCancelled else { return }
                errorMessage = error.localizedDescription
            }
        }
    }

    func stopRecording() {
        audio.stop()
        draft?.state = "draft"
        try? store.save()
    }

    func send() {
        guard let draft, !busy else { return }
        audio.stop()
        if draft.state == "completed" { presented = false; return }
        let entered = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !entered.isEmpty || draft.recordingPath != nil else { errorMessage = "Describe your meal or record it first."; return }
        errorMessage = nil
        busy = true
        let operation = UUID()
        operationID = operation
        task = Task {
            defer { if operationID == operation { busy = false; phase = "" } }
            do {
                let config = try configuration.snapshot()
                if !entered.isEmpty, entered != draft.text {
                    draft.text = entered
                    draft.requestData = nil
                    draft.responseData = nil
                }
                if draft.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let path = draft.recordingPath {
                    phase = "Transcribing"
                    draft.state = "transcribing"
                    try store.save()
                    let file = URL(fileURLWithPath: path)
                    let recordingID = UUID(uuidString: file.deletingPathExtension().lastPathComponent) ?? draft.id
                    let transcript = try await ai.transcribe(file, id: recordingID, configuration: config)
                    try Task.checkCancellation()
                    guard draft.state != "canceled" else { throw DiaryError.canceled }
                    draft.text = transcript
                    text = transcript
                    try store.save()
                }
                var request: InterpretRequest
                if let data = draft.requestData,
                   let cached = try? JSONDecoder().decode(InterpretRequest.self, from: data),
                   cached.history != nil, cached.text == draft.text {
                    request = cached
                } else {
                    // Rebuild edited or legacy drafts without carrying stale
                    // estimates, implicit recent logs, or cached clarifications.
                    draft.responseData = nil
                    draft.question = nil
                    let target = draft.targetID.flatMap(store.log)
                    if let revision = draft.targetRevision, target?.revision != revision { throw DiaryError.staleCorrection }
                    request = InterpretRequest(
                        requestID: UUID().uuidString, text: draft.text, selectedDate: draft.selectedDate,
                        captureDate: DiaryCalendar.key(draft.capturedAt, timeZone: TimeZone(identifier: draft.capturedTimeZone) ?? .current),
                        capturedAt: ISO8601DateFormatter().string(from: draft.capturedAt), timeZone: draft.capturedTimeZone,
                        target: target?.context, recentLogs: [], previousQuestion: nil, history: .initial
                    )
                    draft.requestData = try JSONEncoder().encode(request)
                }
                phase = "Estimating"
                draft.state = "estimating"
                try store.save()
                var result: InterpretResult
                if let response = draft.responseData {
                    result = try JSONDecoder().decode(InterpretResult.self, from: response)
                } else {
                    result = try await ai.interpret(request, configuration: config)
                }
                try Task.checkCancellation()
                guard draft.state != "canceled" else { throw DiaryError.canceled }
                try result.validate()
                if result.action == "lookup_history" {
                    guard request.history?.phase == "initial", let queries = result.historyQueries else { throw DiaryError.invalidFood }
                    request.history = FoodHistory(phase: "resolved", queries: queries, matches: store.foodHistory(matching: queries))
                    // A new idempotency key for this phase, stable across retries.
                    // Persist before sending so a network failure can resume here.
                    request.requestID = UUID().uuidString
                    draft.requestData = try JSONEncoder().encode(request)
                    draft.responseData = nil
                    try store.save()
                    result = try await ai.interpret(request, configuration: config)
                    try Task.checkCancellation()
                    guard draft.state != "canceled" else { throw DiaryError.canceled }
                    try result.validate()
                }
                guard ["create", "update"].contains(result.action) else { throw DiaryError.invalidFood }
                draft.responseData = try JSONEncoder().encode(result)
                draft.state = "saving"
                phase = "Saving"
                try store.save()
                _ = try store.commit(result, submission: draft)
                completedDate = result.logs.first?.date
                presented = false
            } catch is CancellationError {
                if draft.state != "canceled", draft.state != "completed" {
                    draft.state = "failed"
                    draft.errorMessage = "The request was interrupted. Your draft is saved."
                    try? store.save()
                }
            } catch {
                guard draft.state != "canceled", draft.state != "completed" else { return }
                errorMessage = error.localizedDescription
                draft.state = "failed"
                draft.errorMessage = error.localizedDescription
                try? store.save()
            }
        }
    }

    func keepDraft() {
        task?.cancel()
        stopRecording()
        if draft?.text != text {
            draft?.requestData = nil
            draft?.responseData = nil
        }
        draft?.text = text
        try? store.save()
        presented = false
    }

    func refreshCorrection() {
        guard let draft, let id = draft.targetID, let target = store.log(id) else {
            errorMessage = "This meal no longer exists. Cancel this correction and log a new meal."
            return
        }
        draft.targetRevision = target.revision
        draft.requestData = nil
        draft.responseData = nil
        draft.question = nil
        draft.errorMessage = nil
        draft.state = "draft"
        do { try store.save(); errorMessage = nil } catch { errorMessage = error.localizedDescription }
    }

    func cancel() {
        task?.cancel()
        operationID = UUID()
        audio.stop()
        do { if let draft { try store.cancel(draft) } } catch { errorMessage = error.localizedDescription }
        presented = false
        busy = false
    }
}
