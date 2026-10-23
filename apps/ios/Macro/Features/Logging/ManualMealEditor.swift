import SwiftUI

struct ManualMealEditor: View {
    @Environment(LocalStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    var meal: MealLog?
    @State private var date: Date
    @State private var title: String
    @State private var foods: [FoodComponent]
    @State private var error: String?

    init(meal: MealLog?, date: String) {
        self.meal = meal
        _date = State(initialValue: DiaryCalendar.date(date) ?? Date())
        _title = State(initialValue: meal?.title ?? "")
        _foods = State(initialValue: meal?.foods ?? [FoodComponent(name: "", portion: "1 serving", nutrition: .zero, source: "user_reported")])
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Meal title", text: $title).accessibilityIdentifier("manualMealTitle")
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                }
                ForEach(foods.indices, id: \.self) { index in
                    Section("Food \(index + 1)") {
                        TextField("Food name", text: $foods[index].name).accessibilityIdentifier("foodName\(index)")
                        TextField("Portion", text: $foods[index].portion)
                        number("Calories", value: $foods[index].nutrition.calories, id: "foodCalories\(index)")
                        number("Protein (g)", value: $foods[index].nutrition.proteinG, id: "foodProtein\(index)")
                        number("Fat (g)", value: $foods[index].nutrition.fatG, id: "foodFat\(index)")
                        number("Carbs (g)", value: $foods[index].nutrition.carbsG, id: "foodCarbs\(index)")
                        if foods.count > 1 {
                            Button("Remove food", systemImage: "minus.circle", role: .destructive) { foods.remove(at: index) }
                        }
                    }
                }
                Button("Add food", systemImage: "plus") {
                    foods.append(FoodComponent(name: "", portion: "1 serving", nutrition: .zero, source: "user_reported"))
                }
                if let error { Section { ErrorLabel(message: error) } }
            }
            .scrollContentBackground(.hidden)
            .macroPage()
            .navigationTitle(meal == nil ? "Add meal" : "Edit meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", systemImage: "checkmark") { save() }.accessibilityIdentifier("saveManualMeal")
                }
            }
        }.preferredColorScheme(.dark).tint(.white)
    }

    private func number(_ label: String, value: Binding<Double>, id: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            DecimalInput(title: label, value: value).frame(width: 105).accessibilityIdentifier(id)
        }
    }

    private func save() {
        do {
            let name = title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? foods.map(\.name).prefix(3).joined(separator: ", ") : title.trimmingCharacters(in: .whitespacesAndNewlines)
            let updatedFoods = foods.enumerated().map { index, food in
                var food = food
                if meal == nil || meal?.foods.indices.contains(index) != true || meal?.foods[index] != food {
                    food.source = "user_reported"
                }
                return food
            }
            let proposed = ProposedLog(date: DiaryCalendar.key(date), title: name, foods: updatedFoods, assumptions: meal?.assumptions ?? [])
            if let meal { try store.edit(meal, proposed: proposed) } else { try store.addManual(proposed) }
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}
