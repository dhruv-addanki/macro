import Foundation
import SwiftData

@Model
final class MealLog {
    @Attribute(.unique) var id: UUID
    var submissionID: UUID
    var dateKey: String
    var capturedTimeZone: String
    var consumedAt: Date
    var createdAt: Date
    var updatedAt: Date
    var revision: Int
    var title: String
    var transcript: String
    var foodsData: Data
    var assumptionsData: Data

    init(id: UUID = UUID(), submissionID: UUID, proposed: ProposedLog, transcript: String, capturedAt: Date, timeZone: String) throws {
        self.id = id
        self.submissionID = submissionID
        dateKey = proposed.date
        capturedTimeZone = timeZone
        consumedAt = DiaryCalendar.consumptionDate(key: proposed.date, capturedAt: capturedAt, timeZone: timeZone)
        createdAt = Date()
        updatedAt = Date()
        revision = 0
        title = proposed.title
        self.transcript = transcript
        foodsData = try JSONEncoder().encode(proposed.foods)
        assumptionsData = try JSONEncoder().encode(proposed.assumptions)
    }

    var foods: [FoodComponent] { (try? JSONDecoder().decode([FoodComponent].self, from: foodsData)) ?? [] }
    var assumptions: [String] { (try? JSONDecoder().decode([String].self, from: assumptionsData)) ?? [] }
    var nutrition: Nutrition { .total(foods.map(\.nutrition)) }
    var context: LogContext { LogContext(id: id.uuidString, revision: revision, date: dateKey, title: title, foods: foods, assumptions: assumptions) }
    var proposal: ProposedLog { ProposedLog(date: dateKey, title: title, foods: foods, assumptions: assumptions) }

    func replace(with proposed: ProposedLog) throws {
        try proposed.validate()
        foodsData = try JSONEncoder().encode(proposed.foods)
        assumptionsData = try JSONEncoder().encode(proposed.assumptions)
        if dateKey != proposed.date {
            consumedAt = DiaryCalendar.consumptionDate(key: proposed.date, capturedAt: consumedAt, timeZone: capturedTimeZone)
        }
        dateKey = proposed.date
        title = proposed.title
        revision += 1
        updatedAt = Date()
    }
}

@Model
final class UserProfile {
    @Attribute(.unique) var id: String
    var age: Int
    var heightCM: Double
    var weightKG: Double
    var formulaSex: String
    var activity: String
    var goalType: String
    var units: String

    init() {
        id = "local"
        age = 0
        heightCM = 0
        weightKG = 0
        formulaSex = "male"
        activity = "moderate"
        goalType = "maintain"
        units = "metric"
    }
}

@Model
final class NutritionGoal {
    @Attribute(.unique) var id: UUID
    var effectiveFrom: String
    var createdAt: Date
    var calories: Double
    var proteinG: Double
    var fatG: Double
    var carbsG: Double

    init(effectiveFrom: String, nutrition: Nutrition) {
        id = UUID()
        self.effectiveFrom = effectiveFrom
        createdAt = Date()
        calories = nutrition.calories
        proteinG = nutrition.proteinG
        fatG = nutrition.fatG
        carbsG = nutrition.carbsG
    }

    var nutrition: Nutrition { Nutrition(calories: calories, proteinG: proteinG, fatG: fatG, carbsG: carbsG) }
}

@Model
final class PendingSubmission {
    @Attribute(.unique) var id: UUID
    var createdAt: Date
    var capturedAt: Date
    var capturedTimeZone: String
    var selectedDate: String
    var text: String
    var recordingPath: String?
    var state: String
    var errorMessage: String?
    var targetID: UUID?
    var targetRevision: Int?
    var requestData: Data?
    var responseData: Data?
    var question: String?

    init(date: String, target: MealLog? = nil) {
        id = UUID()
        createdAt = Date()
        capturedAt = Date()
        capturedTimeZone = TimeZone.current.identifier
        selectedDate = date
        text = ""
        state = "draft"
        targetID = target?.id
        targetRevision = target?.revision
    }
}

enum MacroSchemaV1: VersionedSchema {
    static var versionIdentifier: Schema.Version { .init(1, 0, 0) }
    static var models: [any PersistentModel.Type] { [MealLog.self, UserProfile.self, NutritionGoal.self, PendingSubmission.self] }
}
