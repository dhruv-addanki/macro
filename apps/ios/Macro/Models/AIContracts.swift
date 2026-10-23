import Foundation

struct Nutrition: Codable, Equatable, Sendable {
    var calories: Double = 0
    var proteinG: Double = 0
    var fatG: Double = 0
    var carbsG: Double = 0
    var sugarG: Double? = nil
    var fiberG: Double? = nil
    var sodiumMg: Double? = nil

    static let zero = Nutrition()

    enum CodingKeys: String, CodingKey { case calories, proteinG, fatG, carbsG, sugarG, fiberG, sodiumMg }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(calories, forKey: .calories)
        try c.encode(proteinG, forKey: .proteinG)
        try c.encode(fatG, forKey: .fatG)
        try c.encode(carbsG, forKey: .carbsG)
        try c.encode(sugarG, forKey: .sugarG)
        try c.encode(fiberG, forKey: .fiberG)
        try c.encode(sodiumMg, forKey: .sodiumMg)
    }

    var isValid: Bool {
        [calories, proteinG, fatG, carbsG].allSatisfy { $0.isFinite && $0 >= 0 && $0 <= 100_000 }
            && [sugarG, fiberG, sodiumMg].compactMap { $0 }.allSatisfy { $0.isFinite && $0 >= 0 && $0 <= 100_000 }
    }

    static func total(_ values: [Nutrition]) -> Nutrition {
        func knownTotal(_ key: KeyPath<Nutrition, Double?>) -> Double? {
            guard !values.isEmpty, values.allSatisfy({ $0[keyPath: key] != nil }) else { return nil }
            return values.reduce(0) { $0 + ($1[keyPath: key] ?? 0) }
        }
        return Nutrition(
            calories: values.reduce(0) { $0 + $1.calories },
            proteinG: values.reduce(0) { $0 + $1.proteinG },
            fatG: values.reduce(0) { $0 + $1.fatG },
            carbsG: values.reduce(0) { $0 + $1.carbsG },
            sugarG: knownTotal(\.sugarG), fiberG: knownTotal(\.fiberG), sodiumMg: knownTotal(\.sodiumMg)
        )
    }
}

struct FoodComponent: Codable, Equatable, Identifiable, Sendable {
    var name: String
    var portion: String
    var nutrition: Nutrition
    var ingredients: [String] = []
    var source: String = "estimated"
    var id: String { "\(name)|\(portion)" }
}

struct ProposedLog: Codable, Equatable, Sendable {
    var date: String
    var title: String
    var foods: [FoodComponent]
    var assumptions: [String]

    var nutrition: Nutrition { .total(foods.map(\.nutrition)) }

    func validate() throws {
        guard DiaryCalendar.date(date) != nil, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              title.count <= 200, !foods.isEmpty, foods.count <= 40,
              foods.allSatisfy({ !$0.name.isEmpty && !$0.portion.isEmpty && $0.nutrition.isValid }) else {
            throw DiaryError.invalidFood
        }
    }
}

struct LogContext: Codable, Sendable {
    var id: String
    var revision: Int
    var date: String
    var title: String
    var foods: [FoodComponent]
    var assumptions: [String]
}

struct HistoricalFood: Codable, Equatable, Sendable {
    var id: String
    var date: String
    var food: FoodComponent
}

struct FoodHistory: Codable, Sendable {
    var phase: String
    var queries: [String]
    var matches: [HistoricalFood]

    static let initial = FoodHistory(phase: "initial", queries: [], matches: [])
}

struct InterpretRequest: Codable, Sendable {
    var requestID: String
    var text: String
    var selectedDate: String
    var captureDate: String
    var capturedAt: String
    var timeZone: String
    var target: LogContext?
    var recentLogs: [LogContext]
    var previousQuestion: String?
    var history: FoodHistory? = nil

    enum CodingKeys: String, CodingKey {
        case requestID, text, selectedDate, captureDate, capturedAt, timeZone, target, recentLogs, previousQuestion, history
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(requestID, forKey: .requestID)
        try c.encode(text, forKey: .text)
        try c.encode(selectedDate, forKey: .selectedDate)
        try c.encode(captureDate, forKey: .captureDate)
        try c.encode(capturedAt, forKey: .capturedAt)
        try c.encode(timeZone, forKey: .timeZone)
        try c.encode(target, forKey: .target)
        try c.encode(recentLogs, forKey: .recentLogs)
        try c.encode(previousQuestion, forKey: .previousQuestion)
        try c.encodeIfPresent(history, forKey: .history)
    }
}

struct InterpretResult: Codable, Equatable, Sendable {
    var schemaVersion: Int = 1
    var action: String
    var logs: [ProposedLog]
    var targetLogID: String?
    var expectedRevision: Int?
    var question: String?
    var historyQueries: [String]? = nil

    func validate() throws {
        guard schemaVersion == 1 else { throw DiaryError.invalidFood }
        switch action {
        case "create":
            guard !logs.isEmpty, logs.count <= 10, targetLogID == nil, expectedRevision == nil, question == nil else { throw DiaryError.invalidFood }
        case "update":
            guard logs.count == 1, let targetLogID, UUID(uuidString: targetLogID) != nil,
                  let expectedRevision, expectedRevision >= 0, question == nil else { throw DiaryError.invalidFood }
        case "clarify":
            guard logs.isEmpty, let question, !question.isEmpty, targetLogID == nil, expectedRevision == nil else { throw DiaryError.invalidFood }
        case "lookup_history":
            guard logs.isEmpty, targetLogID == nil, expectedRevision == nil, question == nil,
                  let historyQueries, (1...5).contains(historyQueries.count),
                  historyQueries.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.count <= 200 }) else { throw DiaryError.invalidFood }
        default: throw DiaryError.invalidFood
        }
        guard action == "lookup_history" || historyQueries == nil else { throw DiaryError.invalidFood }
        try logs.forEach { try $0.validate() }
    }
}

enum DiaryError: LocalizedError {
    case invalidFood, staleCorrection, canceled, noUndo, invalidGoal, missingTarget
    var errorDescription: String? {
        switch self {
        case .invalidFood: "The food data is incomplete or invalid. Your diary has not changed."
        case .staleCorrection: "This meal changed while the request was processing. Please try the correction again."
        case .canceled: "This submission was canceled."
        case .noUndo: "This change can no longer be undone because the meal was edited again."
        case .invalidGoal: "Enter valid positive calories and nonnegative macro targets."
        case .missingTarget: "The meal to correct is no longer available."
        }
    }
}

extension Double {
    var roundedText: String { formatted(.number.precision(.fractionLength(0))) }
    var nutrientText: String { formatted(.number.precision(.fractionLength(0...1))) }
}
