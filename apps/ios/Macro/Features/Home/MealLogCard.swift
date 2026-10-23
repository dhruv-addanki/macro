import SwiftUI

struct MealLogCard: View {
    var meal: MealLog
    var runningCalories: Double
    var edit: () -> Void
    var correct: () -> Void
    var delete: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var expanded = false
    @State private var details = false
    @State private var confirmDelete = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Button {
                withAnimation(reduceMotion ? nil : .snappy(duration: 0.25)) { expanded.toggle() }
            } label: {
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(meal.nutrition.calories.roundedText).font(.system(size: 30, weight: .semibold)).monospacedDigit().minimumScaleFactor(0.7).lineLimit(1)
                        Text("kcal").font(.caption).foregroundStyle(MacroTheme.secondary)
                    }.frame(width: 64, alignment: .leading)
                    VStack(alignment: .leading, spacing: 10) {
                        Text(meal.title).font(.system(size: 16, weight: .medium)).multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
                        MacroNumbers(nutrition: meal.nutrition)
                    }
                    Image(systemName: expanded ? "chevron.up" : "chevron.down").font(.system(size: 13, weight: .medium)).padding(.top, 4)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(meal.title), \(meal.nutrition.calories.roundedText) calories. \(expanded ? "Collapse" : "Expand")")
            .accessibilityIdentifier("mealCard")
            if expanded {
                VStack(spacing: 12) {
                    ForEach(Array(meal.foods.enumerated()), id: \.offset) { _, food in
                        if food.source == "imported_daily_estimate" {
                            ImportedFoodRows(transcript: meal.transcript)
                            Text("Daily nutrition totals apply to the full list.")
                                .font(.caption2)
                                .foregroundStyle(MacroTheme.secondary)
                        } else {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(food.name).font(.callout)
                                    Spacer()
                                    Text("\(food.nutrition.calories.roundedText) kcal").font(.caption).monospacedDigit()
                                }
                                Text(food.portion).font(.caption).foregroundStyle(MacroTheme.secondary)
                                if !food.ingredients.isEmpty {
                                    Text(food.ingredients.joined(separator: ", ")).font(.caption2).foregroundStyle(MacroTheme.secondary)
                                }
                            }
                            Divider().overlay(.white.opacity(0.1))
                        }
                    }
                    HStack {
                        Button("Edit", systemImage: "pencil", action: edit).accessibilityIdentifier("editMeal")
                        Spacer()
                        Button("Correct", systemImage: "mic", action: correct).accessibilityIdentifier("correctMeal")
                        Spacer()
                        Button("Delete", systemImage: "trash") { confirmDelete = true }.labelStyle(.iconOnly).accessibilityIdentifier("deleteMeal")
                    }.font(.callout)
                    DisclosureGroup("Nutrition & estimate details", isExpanded: $details) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Sugar: \(meal.nutrition.sugarG.map { "\($0.nutrientText) g" } ?? "Unknown")")
                            Text("Fiber: \(meal.nutrition.fiberG.map { "\($0.nutrientText) g" } ?? "Unknown")")
                            Text("Sodium: \(meal.nutrition.sodiumMg.map { "\($0.roundedText) mg" } ?? "Unknown")")
                            ForEach(Array(meal.assumptions.enumerated()), id: \.offset) { _, assumption in Text(assumption) }
                            ForEach(Array(meal.foods.enumerated()), id: \.offset) { _, food in Text("\(food.name): \(food.source.replacingOccurrences(of: "_", with: " "))") }
                            if !meal.transcript.isEmpty { Text(meal.transcript).italic() }
                        }.font(.caption).foregroundStyle(MacroTheme.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
                    }.font(.caption)
                }
            }
            Text("\(runningCalories.roundedText) kcal so far").font(.caption).foregroundStyle(MacroTheme.secondary)
        }
        .padding(16)
        .macroGlass()
        .confirmationDialog("Delete this meal?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete meal", role: .destructive, action: delete)
        }
    }
}

private struct ImportedFoodRows: View {
    let transcript: String

    private var rows: [ImportedFoodRow] {
        ImportedFoodRow.parse(transcript)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(rows.count) recorded items")
                .font(.caption.weight(.medium))
                .foregroundStyle(MacroTheme.secondary)
                .padding(.bottom, 4)

            ForEach(rows) { row in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(row.name)
                            .font(.callout)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(row.calories.map { "\($0.roundedText) kcal" } ?? "Included in daily total")
                            .font(.caption)
                            .foregroundStyle(MacroTheme.secondary)
                            .monospacedDigit()
                            .fixedSize(horizontal: true, vertical: false)
                    }
                    if !row.portion.isEmpty {
                        Text(row.portion)
                            .font(.caption)
                            .foregroundStyle(MacroTheme.secondary)
                    }
                    if !row.details.isEmpty {
                        Text(row.details)
                            .font(.caption2)
                            .foregroundStyle(MacroTheme.secondary)
                    }
                }
                .padding(.vertical, 8)
                Divider().overlay(.white.opacity(0.1))
            }
        }
    }
}

private struct ImportedFoodRow: Identifiable {
    let id: Int
    let name: String
    let portion: String
    let details: String
    let calories: Double?

    static func parse(_ transcript: String) -> [ImportedFoodRow] {
        splitEntries(transcript).enumerated().compactMap { index, entry in
            let parsed = parseEntry(entry)
            guard !parsed.name.isEmpty else { return nil }
            return ImportedFoodRow(
                id: index,
                name: parsed.name,
                portion: parsed.portion,
                details: parsed.details,
                calories: parsed.calories
            )
        }
    }

    private static func splitEntries(_ transcript: String) -> [String] {
        var entries: [String] = []
        var current = ""
        var parenthesisDepth = 0

        for character in transcript {
            if character == ";" && parenthesisDepth == 0 {
                let entry = current.trimmingCharacters(in: .whitespacesAndNewlines)
                if !entry.isEmpty { entries.append(entry) }
                current = ""
                continue
            }
            if character == "(" { parenthesisDepth += 1 }
            if character == ")" { parenthesisDepth = max(0, parenthesisDepth - 1) }
            current.append(character)
        }

        let finalEntry = current.trimmingCharacters(in: .whitespacesAndNewlines)
        if !finalEntry.isEmpty { entries.append(finalEntry) }
        return entries
    }

    private static func parseEntry(_ entry: String) -> (name: String, portion: String, details: String, calories: Double?) {
        let caloriePattern = #"(?i)~?\s*(\d+(?:\.\d+)?)\s*kcal\b"#
        let calorieRegex = try? NSRegularExpression(pattern: caloriePattern)
        let fullRange = NSRange(entry.startIndex..<entry.endIndex, in: entry)
        let calorieMatches = calorieRegex?.matches(in: entry, range: fullRange) ?? []
        let calories = calorieMatches.last.flatMap { match -> Double? in
            guard let range = Range(match.range(at: 1), in: entry) else { return nil }
            return Double(entry[range])
        }

        var description = ""
        var parentheticalNotes: [String] = []
        var parenthesisDepth = 0
        var parenthetical = ""

        for character in entry {
            if character == "(" {
                if parenthesisDepth > 0 { parenthetical.append(character) }
                parenthesisDepth += 1
                continue
            }
            if character == ")", parenthesisDepth > 0 {
                parenthesisDepth -= 1
                if parenthesisDepth == 0 {
                    let note = cleanedParenthetical(parenthetical, calorieRegex: calorieRegex)
                    if !note.isEmpty { parentheticalNotes.append(note) }
                    parenthetical = ""
                } else {
                    parenthetical.append(character)
                }
                continue
            }
            if parenthesisDepth > 0 {
                parenthetical.append(character)
            } else {
                description.append(character)
            }
        }
        if !parenthetical.isEmpty {
            let note = cleanedParenthetical(parenthetical, calorieRegex: calorieRegex)
            if !note.isEmpty { parentheticalNotes.append(note) }
        }

        description = description.trimmingCharacters(in: .whitespacesAndNewlines)
        let segments = description.split(separator: ":", maxSplits: 1).map(String.init)
        let titleSegment = segments.first ?? description
        let ingredientDetails = segments.count > 1 ? segments[1].trimmingCharacters(in: .whitespacesAndNewlines) : ""
        let portionAndName = splitPortion(titleSegment)

        var details = [ingredientDetails] + parentheticalNotes
        details = details.map { $0.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters)) }.filter { !$0.isEmpty }
        return (portionAndName.name, portionAndName.portion, details.joined(separator: " · "), calories)
    }

    private static func cleanedParenthetical(_ text: String, calorieRegex: NSRegularExpression?) -> String {
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let matches = calorieRegex?.matches(in: text, range: range) ?? []
        var note = text
        if matches.count > 1 {
            return ""
        }
        if let match = matches.first, let matchRange = Range(match.range, in: note) {
            note.replaceSubrange(matchRange, with: "")
        }
        note = note.replacingOccurrences(of: #"\s*[,;/]+\s*"#, with: " · ", options: .regularExpression)
        note = note.trimmingCharacters(in: CharacterSet(charactersIn: " ,;·\n\t"))
        return note.caseInsensitiveCompare("total") == .orderedSame ? "" : note
    }

    private static func splitPortion(_ text: String) -> (name: String, portion: String) {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let amountPattern = #"^((?:(?:another|a)\s+)?(?:~\s*)?\d+(?:\.\d+)?(?:\s*/\s*\d+)?(?:\s*(?:x|×)\s*\d+(?:\.\d+)?)*(?:\s*(?:fl[ -]?oz|fluid\s*ounces?|oz|ounces?|cups?|cup|tbsp|tablespoons?|tsp|teaspoons?|ml|g|grams?|in(?:ch(?:es)?)?|handfuls?|handful|slices?|slice|pieces?|piece))?(?:\s+(?:full|medium|large|small|heaping|cup(?:\s+full)?))?)\s+(.+)$"#
        if let match = regexMatch(amountPattern, in: value),
           let amountRange = Range(match.range(at: 1), in: value),
           let nameRange = Range(match.range(at: 2), in: value) {
            let amount = String(value[amountRange]).trimmingCharacters(in: .whitespaces)
            let name = String(value[nameRange]).trimmingCharacters(in: .whitespaces)
            if !amount.contains("%"), !name.isEmpty {
                return (name.hasPrefix("of ") ? String(name.dropFirst(3)) : name, amount)
            }
        }

        let handfulPattern = #"^((?:another\s+)?handfuls?)\s+(?:of\s+)?(.+)$"#
        if let match = regexMatch(handfulPattern, in: value),
           let amountRange = Range(match.range(at: 1), in: value),
           let nameRange = Range(match.range(at: 2), in: value) {
            return (String(value[nameRange]), String(value[amountRange]))
        }

        let trailingAmountPattern = #"^(.+?)\s+((?:(?:about|~)\s*)?\d+(?:\.\d+)?(?:\s*(?:x|×)\s*\d+(?:\.\d+)?){0,2}\s*(?:cups?|cup|tbsp|tablespoons?|tsp|teaspoons?|fl[ -]?oz|oz|ml|g|grams?|in(?:ch(?:es)?)?))$"#
        if let match = regexMatch(trailingAmountPattern, in: value),
           let nameRange = Range(match.range(at: 1), in: value),
           let amountRange = Range(match.range(at: 2), in: value) {
            return (String(value[nameRange]).trimmingCharacters(in: .whitespaces), String(value[amountRange]))
        }

        let embeddedInchPattern = #"(~\s*\d+(?:\.\d+)?\s*-\s*in(?:ch(?:es)?)?)"#
        if let match = regexMatch(embeddedInchPattern, in: value),
           let amountRange = Range(match.range(at: 1), in: value) {
            let amount = String(value[amountRange])
            let name = value.replacingCharacters(in: amountRange, with: " ")
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return (name, amount)
        }

        return (value, "")
    }

    private static func regexMatch(_ pattern: String, in text: String) -> NSTextCheckingResult? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        return regex.firstMatch(in: text, range: NSRange(text.startIndex..<text.endIndex, in: text))
    }
}
