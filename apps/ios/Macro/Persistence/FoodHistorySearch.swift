import Foundation

extension LocalStore {
    // Called only after the model recognizes an explicit historical reference.
    // Search all committed meals, not just the visible day or eight recent logs.
    func foodHistory(matching queries: [String]) -> [HistoricalFood] {
        let recent = logs.sorted {
            if $0.consumedAt != $1.consumedAt { return $0.consumedAt > $1.consumedAt }
            return $0.id.uuidString < $1.id.uuidString
        }
        let candidates = recent.flatMap { meal in
            meal.foods.enumerated().compactMap { index, food -> HistoricalFood? in
                // Legacy daily imports contain a whole day's macros in one food.
                // Their ingredient descriptions cannot be assigned those totals.
                guard ["estimated", "user_reported", "history"].contains(food.source), food.nutrition.isValid,
                      !food.name.isEmpty, !food.portion.isEmpty else { return nil }
                var bounded = food
                bounded.name = String(food.name.prefix(200))
                bounded.portion = String(food.portion.prefix(200))
                bounded.ingredients = food.ingredients.filter { !$0.isEmpty }.prefix(12).map { String($0.prefix(200)) }
                return HistoricalFood(id: "\(meal.id.uuidString):\(meal.revision):\(index)", date: meal.dateKey, food: bounded)
            }
        }
        let perQuery = max(2, 10 / max(1, queries.count))
        var selected: [HistoricalFood] = []
        for query in queries.prefix(5) {
            let terms = Self.foodSearchTerms(query)
            guard !terms.isEmpty else { continue }
            let ranked = candidates.enumerated().compactMap { index, match -> (Int, Int, HistoricalFood)? in
                let name = Self.foodSearchTerms(match.food.name)
                let all = name.union(Self.foodSearchTerms(match.food.ingredients.joined(separator: " ")))
                let hits = terms.intersection(all).count
                guard hits > 0, Double(hits) / Double(terms.count) >= 0.5 else { return nil }
                let score = terms.intersection(name).count * 6 + hits * 2
                return (score, index, match)
            }.sorted { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 > $1.0 }
            for (_, _, match) in ranked.prefix(perQuery) where !selected.contains(where: { $0.id == match.id }) {
                selected.append(match)
            }
        }
        return Array(selected.prefix(10))
    }

    private static func foodSearchTerms(_ text: String) -> Set<String> {
        let normalized = text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
        let stop: Set<String> = ["a", "an", "the", "of", "with", "and", "from", "same", "as", "last", "time", "logged", "before", "previous", "my", "i", "had", "ate", "one", "two", "slice", "slices"]
        return Set(normalized.components(separatedBy: CharacterSet.alphanumerics.inverted).compactMap { word in
            guard word.count > 1, !stop.contains(word), Double(word) == nil else { return nil }
            return word.count > 3 && word.hasSuffix("s") && !word.hasSuffix("ss") ? String(word.dropLast()) : word
        })
    }
}
