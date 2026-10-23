import SwiftUI

struct GoalSetupView: View {
    @Environment(LocalStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var age = 0
    @State private var height: Double = 0
    @State private var weight: Double = 0
    @State private var sex = "male"
    @State private var activity = "moderate"
    @State private var goal = "maintain"
    @State private var error: String?

    private var imperial: Bool { store.profile.units == "imperial" }

    var body: some View {
        NavigationStack {
            Form {
                Section("Starting estimate") {
                    HStack { Text("Age"); Spacer(); DecimalInput(title: "Years", value: Binding(get: { Double(age) }, set: { age = Int(max(-1, min(1000, $0))) })).frame(width: 90) }
                    Picker("Equation", selection: $sex) { Text("Male").tag("male"); Text("Female").tag("female") }
                    number(imperial ? "Height (in)" : "Height (cm)", value: $height)
                    number(imperial ? "Weight (lb)" : "Weight (kg)", value: $weight)
                    Picker("Activity", selection: $activity) {
                        Text("Low").tag("low"); Text("Moderate").tag("moderate"); Text("High").tag("high")
                    }
                    Picker("Goal", selection: $goal) {
                        Text("Lose").tag("lose"); Text("Maintain").tag("maintain"); Text("Gain").tag("gain")
                    }
                }
                Section {
                    Button("Calculate & save", systemImage: "checkmark") { calculate() }
                    Text("Adult starting estimate. Use manual targets for pregnancy, breastfeeding, or a prescribed diet.").font(.caption).foregroundStyle(MacroTheme.secondary)
                }
                if let error { Section { ErrorLabel(message: error) } }
            }
            .scrollContentBackground(.hidden).macroPage()
            .navigationTitle("Calculate goal").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) } }
            .onAppear {
                age = store.profile.age
                height = imperial ? store.profile.heightCM / 2.54 : store.profile.heightCM
                weight = imperial ? store.profile.weightKG * 2.20462 : store.profile.weightKG
                sex = store.profile.formulaSex; activity = store.profile.activity; goal = store.profile.goalType
            }
        }.preferredColorScheme(.dark).tint(.white)
    }

    private func number(_ title: String, value: Binding<Double>) -> some View {
        HStack { Text(title); Spacer(); DecimalInput(title: title, value: value).frame(width: 100) }
    }

    private func calculate() {
        do {
            let cm = imperial ? height * 2.54 : height
            let kg = imperial ? weight / 2.20462 : weight
            let nutrition = try NutritionCalculator.goal(age: age, heightCM: cm, weightKG: kg, sex: sex, activity: activity, goalType: goal)
            store.profile.age = age; store.profile.heightCM = cm; store.profile.weightKG = kg
            store.profile.formulaSex = sex; store.profile.activity = activity; store.profile.goalType = goal
            try store.setGoal(nutrition)
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}
