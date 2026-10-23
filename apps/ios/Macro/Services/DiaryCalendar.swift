import Foundation

enum DiaryCalendar {
    static func key(_ date: Date, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func date(_ key: String, timeZone: TimeZone = .current) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let value = formatter.date(from: key), self.key(value, timeZone: timeZone) == key else { return nil }
        return value
    }

    static func consumptionDate(key: String, capturedAt: Date, timeZone: String) -> Date {
        let zone = TimeZone(identifier: timeZone) ?? .current
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let components = calendar.dateComponents([.hour, .minute, .second], from: capturedAt)
        let day = date(key, timeZone: zone) ?? capturedAt
        return calendar.date(bySettingHour: components.hour ?? 12, minute: components.minute ?? 0, second: components.second ?? 0, of: day) ?? day
    }

    static func shifted(_ key: String, days: Int) -> String {
        guard let date = date(key), let shifted = Calendar(identifier: .gregorian).date(byAdding: .day, value: days, to: date) else { return key }
        return self.key(shifted)
    }

    static func title(_ key: String) -> String {
        guard let date = date(key) else { return key }
        let prefix = key == self.key(Date()) ? "Today" : date.formatted(.dateTime.weekday(.wide))
        return "\(prefix) · \(date.formatted(.dateTime.month(.abbreviated).day()))"
    }
}

enum NutritionCalculator {
    static func goal(age: Int, heightCM: Double, weightKG: Double, sex: String, activity: String, goalType: String) throws -> Nutrition {
        guard (18...100).contains(age), (100...250).contains(heightCM), (30...350).contains(weightKG) else { throw DiaryError.invalidGoal }
        let resting = 10 * weightKG + 6.25 * heightCM - 5 * Double(age) + (sex == "male" ? 5 : -161)
        let factor = activity == "low" ? 1.2 : activity == "high" ? 1.75 : 1.5
        let adjustment: Double = goalType == "lose" ? -250 : goalType == "gain" ? 250 : 0
        let calories = ((resting * factor + adjustment) / 25).rounded() * 25
        guard calories > 0 else { throw DiaryError.invalidGoal }
        return Nutrition(calories: calories, proteinG: (calories * 0.25 / 4).rounded(), fatG: (calories * 0.30 / 9).rounded(), carbsG: (calories * 0.45 / 4).rounded())
    }
}
