import Foundation
import Observation
import SwiftData

struct LogSnapshot: Codable {
    var id: UUID
    var submissionID: UUID
    var proposed: ProposedLog
    var transcript: String
    var consumedAt: Date
    var timeZone: String
    var revision: Int
}

struct DiaryUndo {
    var label: String
    var before: [LogSnapshot]
    var after: [UUID: Int]
    var deletedIDs: Set<UUID>
}

@MainActor @Observable
final class LocalStore {
    let container: ModelContainer
    private var context: ModelContext { container.mainContext }
    private(set) var logs: [MealLog] = []
    private(set) var goals: [NutritionGoal] = []
    private(set) var drafts: [PendingSubmission] = []
    private(set) var profile: UserProfile
    var undoAction: DiaryUndo?

    init(inMemory: Bool = false, url: URL? = nil) throws {
        let schema = Schema(versionedSchema: MacroSchemaV1.self)
        let configuration: ModelConfiguration
        if let url {
            configuration = ModelConfiguration("Macro", schema: schema, url: url, cloudKitDatabase: .none)
        } else {
            configuration = ModelConfiguration("Macro", schema: schema, isStoredInMemoryOnly: inMemory, cloudKitDatabase: .none)
        }
        container = try ModelContainer(for: schema, configurations: [configuration])
        container.mainContext.autosaveEnabled = false
        let profiles = try container.mainContext.fetch(FetchDescriptor<UserProfile>())
        profile = profiles.first ?? UserProfile()
        if profiles.isEmpty { container.mainContext.insert(profile); try container.mainContext.save() }
        try refresh()
        for draft in drafts where ["recording", "transcribing", "estimating", "saving"].contains(draft.state) {
            draft.state = "failed"
            draft.errorMessage = "This submission was interrupted. Retry it or continue editing."
        }
        try context.save()
        try refresh()
    }

    func refresh() throws {
        logs = try context.fetch(FetchDescriptor<MealLog>()).sorted {
            if $0.consumedAt != $1.consumedAt { return $0.consumedAt < $1.consumedAt }
            if $0.createdAt != $1.createdAt { return $0.createdAt < $1.createdAt }
            return $0.id.uuidString < $1.id.uuidString
        }
        for log in logs {
            let foods = try JSONDecoder().decode([FoodComponent].self, from: log.foodsData)
            let assumptions = try JSONDecoder().decode([String].self, from: log.assumptionsData)
            try ProposedLog(date: log.dateKey, title: log.title, foods: foods, assumptions: assumptions).validate()
        }
        goals = try context.fetch(FetchDescriptor<NutritionGoal>()).sorted {
            if $0.effectiveFrom != $1.effectiveFrom { return $0.effectiveFrom < $1.effectiveFrom }
            return $0.createdAt < $1.createdAt
        }
        drafts = try context.fetch(FetchDescriptor<PendingSubmission>()).filter { !["completed", "canceled"].contains($0.state) }.sorted { $0.createdAt > $1.createdAt }
    }

    func entries(on date: String) -> [MealLog] { logs.filter { $0.dateKey == date } }
    func totals(on date: String) -> Nutrition { .total(entries(on: date).map(\.nutrition)) }
    func goal(on date: String) -> NutritionGoal? { goals.last { $0.effectiveFrom <= date } }
    func log(_ id: UUID) -> MealLog? { logs.first { $0.id == id } }

    func beginSubmission(date: String, target: MealLog? = nil) throws -> PendingSubmission {
        let draft = PendingSubmission(date: date, target: target)
        context.insert(draft)
        try save()
        return draft
    }

    func save() throws {
        do { try context.save(); try refresh() } catch { context.rollback(); try? refresh(); throw error }
    }

    func cancel(_ draft: PendingSubmission) throws {
        let path = draft.recordingPath
        draft.state = "canceled"
        draft.recordingPath = nil
        try save()
        if let path { try? FileManager.default.removeItem(atPath: path) }
    }

    @discardableResult
    func commit(_ result: InterpretResult, submission: PendingSubmission) throws -> [UUID] {
        try result.validate()
        if submission.state == "completed" { return [] }
        guard submission.state != "canceled" else { throw DiaryError.canceled }
        guard ["create", "update"].contains(result.action) else { throw DiaryError.invalidFood }
        var before: [LogSnapshot] = []
        var changed: [MealLog] = []
        do {
            if result.action == "create" {
                guard submission.targetID == nil else { throw DiaryError.missingTarget }
                for proposed in result.logs {
                    let log = try MealLog(submissionID: submission.id, proposed: proposed, transcript: submission.text, capturedAt: submission.capturedAt, timeZone: submission.capturedTimeZone)
                    context.insert(log)
                    changed.append(log)
                }
            } else {
                guard let targetID = result.targetLogID.flatMap(UUID.init(uuidString:)),
                      let target = log(targetID), result.expectedRevision == target.revision,
                      submission.targetID == nil || submission.targetID == targetID,
                      submission.targetRevision == nil || submission.targetRevision == target.revision else { throw DiaryError.staleCorrection }
                if submission.targetID == nil {
                    guard let data = submission.requestData,
                          let request = try? JSONDecoder().decode(InterpretRequest.self, from: data),
                          request.recentLogs.contains(where: { $0.id == result.targetLogID && $0.revision == result.expectedRevision }) else { throw DiaryError.missingTarget }
                }
                before = [snapshot(target)]
                try target.replace(with: result.logs[0])
                changed = [target]
            }
            submission.responseData = try JSONEncoder().encode(result)
            submission.state = "completed"
            submission.errorMessage = nil
            try context.save()
        } catch {
            context.rollback()
            try? refresh()
            throw error
        }
        undoAction = DiaryUndo(label: result.action == "create" ? "Meal logged" : "Meal updated", before: before, after: Dictionary(uniqueKeysWithValues: changed.map { ($0.id, $0.revision) }), deletedIDs: [])
        let ids = changed.map(\.id)
        try refresh()
        if let path = submission.recordingPath { try? FileManager.default.removeItem(atPath: path); submission.recordingPath = nil; try? save() }
        return ids
    }

    func addManual(_ proposed: ProposedLog) throws {
        try proposed.validate()
        let draft = try beginSubmission(date: proposed.date)
        draft.text = proposed.title
        _ = try commit(InterpretResult(action: "create", logs: [proposed]), submission: draft)
    }

    func edit(_ meal: MealLog, proposed: ProposedLog) throws {
        let before = snapshot(meal)
        do { try meal.replace(with: proposed); try context.save() } catch { context.rollback(); try? refresh(); throw error }
        undoAction = DiaryUndo(label: "Meal updated", before: [before], after: [meal.id: meal.revision], deletedIDs: [])
        try refresh()
    }

    func delete(_ meal: MealLog) throws {
        let before = snapshot(meal)
        let id = meal.id
        context.delete(meal)
        try save()
        undoAction = DiaryUndo(label: "Meal deleted", before: [before], after: [:], deletedIDs: [id])
    }

    func undo() throws {
        guard let action = undoAction else { return }
        for (id, revision) in action.after where log(id)?.revision != revision { throw DiaryError.noUndo }
        for id in action.deletedIDs where log(id) != nil { throw DiaryError.noUndo }
        do {
            for (id, _) in action.after where !action.before.contains(where: { $0.id == id }) {
                if let meal = log(id) { context.delete(meal) }
            }
            for before in action.before {
                if let meal = log(before.id) {
                    try meal.replace(with: before.proposed)
                    meal.transcript = before.transcript
                    meal.consumedAt = before.consumedAt
                } else {
                    let meal = try MealLog(id: before.id, submissionID: before.submissionID, proposed: before.proposed, transcript: before.transcript, capturedAt: before.consumedAt, timeZone: before.timeZone)
                    meal.revision = before.revision + 1
                    context.insert(meal)
                }
            }
            try context.save()
        } catch { context.rollback(); try? refresh(); throw error }
        undoAction = nil
        try refresh()
    }

    func setGoal(_ nutrition: Nutrition, date: String = DiaryCalendar.key(Date())) throws {
        guard nutrition.isValid, nutrition.calories > 0, DiaryCalendar.date(date) != nil else { throw DiaryError.invalidGoal }
        let existing = goals.filter { $0.effectiveFrom == date }
        existing.forEach { context.delete($0) }
        context.insert(NutritionGoal(effectiveFrom: date, nutrition: nutrition))
        try save()
    }

    func exportData() throws -> URL {
        struct Backup: Encodable {
            var schemaVersion = 1
            var exportedAt = Date()
            var meals: [LogSnapshot]
            var goals: [GoalBackup]
            var profile: ProfileBackup
        }
        struct GoalBackup: Encodable { var effectiveFrom: String; var nutrition: Nutrition }
        struct ProfileBackup: Encodable {
            var age: Int; var heightCM: Double; var weightKG: Double
            var formulaSex: String; var activity: String; var goalType: String; var units: String
        }
        let backup = Backup(meals: logs.map(snapshot), goals: goals.map { GoalBackup(effectiveFrom: $0.effectiveFrom, nutrition: $0.nutrition) }, profile: ProfileBackup(age: profile.age, heightCM: profile.heightCM, weightKG: profile.weightKG, formulaSex: profile.formulaSex, activity: profile.activity, goalType: profile.goalType, units: profile.units))
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("Macro-\(DiaryCalendar.key(Date())).json")
        try encoder.encode(backup).write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }

    /// Imports meal snapshots only. Existing meals, goals, profile, and drafts are preserved.
    @discardableResult
    func importHistory(_ data: Data, refreshExisting: Bool = false) throws -> Int {
        struct History: Decodable { var schemaVersion: Int; var meals: [LogSnapshot] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let history = try decoder.decode(History.self, from: data)
        guard history.schemaVersion == 1, history.meals.count <= 10_000,
              Set(history.meals.map(\.id)).count == history.meals.count else { throw DiaryError.invalidFood }
        // Validate the entire batch before any inserts, including entries already imported.
        for meal in history.meals {
            try meal.proposed.validate()
            guard TimeZone(identifier: meal.timeZone) != nil, meal.revision >= 0,
                  meal.consumedAt.timeIntervalSince1970.isFinite else { throw DiaryError.invalidFood }
        }
        let existingByID = Dictionary(uniqueKeysWithValues: logs.map { ($0.id, $0) })
        let incoming = history.meals.filter { existingByID[$0.id] == nil }
        let existingHistory = history.meals.compactMap { meal -> (MealLog, LogSnapshot)? in
            guard let existing = existingByID[meal.id] else { return nil }
            return (existing, meal)
        }
        if refreshExisting {
            let sourceMarker = "Imported from Personal Health Tracker — Diet & Workouts"
            guard existingHistory.count == history.meals.filter({ existingByID[$0.id] != nil }).count,
                  existingHistory.allSatisfy({ $0.0.assumptions.contains(where: { $0.hasPrefix(sourceMarker) }) }) else {
                throw DiaryError.invalidFood
            }
        }
        let updates = refreshExisting ? existingHistory.filter { existing, meal in
            existing.proposal != meal.proposed || existing.transcript != meal.transcript
                || existing.consumedAt != meal.consumedAt || existing.capturedTimeZone != meal.timeZone
        } : []
        do {
            for meal in incoming {
                let log = try MealLog(id: meal.id, submissionID: meal.submissionID, proposed: meal.proposed,
                                      transcript: meal.transcript, capturedAt: meal.consumedAt, timeZone: meal.timeZone)
                log.consumedAt = meal.consumedAt
                log.revision = meal.revision
                context.insert(log)
            }
            for (existing, meal) in updates {
                try existing.replace(with: meal.proposed)
                existing.submissionID = meal.submissionID
                existing.capturedTimeZone = meal.timeZone
                existing.consumedAt = meal.consumedAt
                existing.transcript = meal.transcript
            }
            try context.save()
        } catch {
            context.rollback()
            try? refresh()
            throw error
        }
        try refresh()
        if !incoming.isEmpty || !updates.isEmpty { undoAction = nil }
        return incoming.count + updates.count
    }

    /// Copies today's effective target back to selected diary dates in one save.
    @discardableResult
    func applyCurrentGoal(to dates: [String]) throws -> Int {
        guard let currentGoal = goal(on: DiaryCalendar.key(Date())) else { throw DiaryError.invalidGoal }
        guard dates.allSatisfy({ DiaryCalendar.date($0) != nil }) else { throw DiaryError.invalidGoal }
        let targetDates = Set(dates).subtracting([currentGoal.effectiveFrom])
        let changedDates = targetDates.filter { goal(on: $0)?.nutrition != currentGoal.nutrition }
        guard !changedDates.isEmpty else { return 0 }
        do {
            for date in changedDates {
                goals.filter { $0.effectiveFrom == date }.forEach { context.delete($0) }
                context.insert(NutritionGoal(effectiveFrom: date, nutrition: currentGoal.nutrition))
            }
            try context.save()
        } catch {
            context.rollback()
            try? refresh()
            throw error
        }
        try refresh()
        return changedDates.count
    }

    func clearData() throws {
        var recordingPaths: [String] = []
        for record in logs { context.delete(record) }
        for record in goals { context.delete(record) }
        for record in try context.fetch(FetchDescriptor<PendingSubmission>()) {
            if let path = record.recordingPath { recordingPaths.append(path) }
            context.delete(record)
        }
        try save()
        for path in recordingPaths { try? FileManager.default.removeItem(atPath: path) }
        undoAction = nil
    }

    private func snapshot(_ log: MealLog) -> LogSnapshot {
        LogSnapshot(id: log.id, submissionID: log.submissionID, proposed: log.proposal, transcript: log.transcript, consumedAt: log.consumedAt, timeZone: log.capturedTimeZone, revision: log.revision)
    }
}
