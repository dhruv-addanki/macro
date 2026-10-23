import SwiftUI
import UIKit

struct ProfileView: View {
    @Environment(LocalStore.self) private var store
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var editGoals = false
    @State private var calculator = false
    @State private var connection = false
    @State private var privacy = false
    @State private var error: String?

    private var goal: Nutrition? { store.goal(on: DiaryCalendar.key(Date()))?.nutrition }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    MacroWordmark()
                    Text("Profile").font(.title2.weight(.medium)).frame(maxWidth: .infinity)
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Daily targets").font(.headline).padding(.bottom, 12)
                        target("Calories", value: goal?.calories, unit: "kcal")
                        target("Protein", value: goal?.proteinG, unit: "g")
                        target("Fat", value: goal?.fatG, unit: "g")
                        target("Carbs", value: goal?.carbsG, unit: "g")
                    }
                    Button { calculator = true } label: {
                        Label("Calculate my goal", systemImage: "calculator").frame(maxWidth: .infinity, alignment: .leading).padding(16)
                    }.buttonStyle(.glass).accessibilityIdentifier("calculateGoal")
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Preferences").font(.headline).padding(.bottom, 12)
                        preference("Goal", value: store.profile.goalType.capitalized)
                        preference("Current weight", value: store.profile.weightKG > 0 ? (store.profile.units == "imperial" ? "\((store.profile.weightKG * 2.20462).nutrientText) lb" : "\(store.profile.weightKG.nutrientText) kg") : "Not set")
                        preference("Activity", value: store.profile.activity.capitalized)
                        HStack {
                            Text("Units")
                            Spacer()
                            Picker("Units", selection: Binding(get: { store.profile.units }, set: {
                                store.profile.units = $0
                                do { try store.save() } catch { self.error = error.localizedDescription }
                            })) {
                                Text("Metric").tag("metric")
                                Text("Imperial").tag("imperial")
                            }.pickerStyle(.segmented).frame(maxWidth: 200)
                        }.padding(.vertical, 14)
                    }
                    VStack(spacing: 0) {
                        Button { connection = true } label: { settingsRow("API connection", icon: "network") }.accessibilityIdentifier("apiConnection")
                        Divider().overlay(.white.opacity(0.1))
                        Button { privacy = true } label: { settingsRow("Privacy & data", icon: "lock") }
                    }.buttonStyle(.plain)
                    if let error { ErrorLabel(message: error) }
                }.padding(.horizontal, 22).padding(.bottom, 32)
            }
            .macroPage().toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $editGoals) { GoalEditor() }
            .sheet(isPresented: $calculator) { GoalSetupView() }
            .sheet(isPresented: $connection) { ConnectionSettingsView() }
            .sheet(isPresented: $privacy) { PrivacyView() }
        }
    }

    private func target(_ label: String, value: Double?, unit: String) -> some View {
        VStack(spacing: 0) {
            Button { editGoals = true } label: {
              if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 12) {
                    Text(label)
                    HStack {
                        Text(value.map { "\($0.roundedText) \(unit)" } ?? "Set target")
                        Spacer()
                        Image(systemName: "pencil").font(.callout)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 18).contentShape(Rectangle())
              } else {
                HStack {
                    Text(label)
                    Spacer()
                    Text(value.map { "\($0.roundedText) \(unit)" } ?? "Set target")
                    Image(systemName: "pencil").font(.callout).padding(.leading, 8)
                }.padding(.vertical, 15).contentShape(Rectangle())
              }
            }.buttonStyle(.plain).accessibilityIdentifier("target\(label)")
            Divider().overlay(.white.opacity(0.1))
        }
    }

    private func preference(_ label: String, value: String) -> some View {
        VStack(spacing: 0) {
            Button { calculator = true } label: {
              if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 10) {
                    Text(label)
                    HStack { Text(value).foregroundStyle(MacroTheme.secondary); Spacer(); Image(systemName: "chevron.right").font(.caption) }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 18).contentShape(Rectangle())
              } else {
                HStack { Text(label); Spacer(); Text(value).foregroundStyle(MacroTheme.secondary); Image(systemName: "chevron.right").font(.caption) }.padding(.vertical, 15).contentShape(Rectangle())
              }
            }.buttonStyle(.plain)
            Divider().overlay(.white.opacity(0.1))
        }
    }

    private func settingsRow(_ title: String, icon: String) -> some View {
        HStack {
            Image(systemName: icon).frame(width: 24)
            Text(title)
            Spacer()
            Image(systemName: "chevron.right").font(.caption)
        }.padding(.vertical, 16).contentShape(Rectangle())
    }
}

struct GoalEditor: View {
    @Environment(LocalStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var calories: Double = 0
    @State private var protein: Double = 0
    @State private var fat: Double = 0
    @State private var carbs: Double = 0
    @State private var balanced = false
    @State private var date = Date()
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Daily target") {
                    number("Calories", value: $calories).accessibilityIdentifier("goalCalories")
                    DatePicker("Starts", selection: $date, displayedComponents: .date)
                    Toggle("Balanced macro split", isOn: $balanced)
                }
                Section("Macro targets") {
                    if balanced {
                        LabeledContent("Protein", value: "\((calories * 0.25 / 4).roundedText) g")
                        LabeledContent("Fat", value: "\((calories * 0.30 / 9).roundedText) g")
                        LabeledContent("Carbs", value: "\((calories * 0.45 / 4).roundedText) g")
                    } else {
                        number("Protein (g)", value: $protein)
                        number("Fat (g)", value: $fat)
                        number("Carbs (g)", value: $carbs)
                        LabeledContent("Macro energy", value: "\((protein * 4 + fat * 9 + carbs * 4).roundedText) kcal")
                    }
                }
                if let error { Section { ErrorLabel(message: error) } }
            }
            .scrollContentBackground(.hidden).macroPage()
            .navigationTitle("Daily targets").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", systemImage: "checkmark") {
                        do {
                            let value = balanced ? Nutrition(calories: calories, proteinG: (calories * 0.25 / 4).rounded(), fatG: (calories * 0.30 / 9).rounded(), carbsG: (calories * 0.45 / 4).rounded()) : Nutrition(calories: calories, proteinG: protein, fatG: fat, carbsG: carbs)
                            try store.setGoal(value, date: DiaryCalendar.key(date))
                            dismiss()
                        } catch { self.error = error.localizedDescription }
                    }.accessibilityIdentifier("saveGoals")
                }
            }
            .onAppear {
                if let goal = store.goal(on: DiaryCalendar.key(Date())) {
                    calories = goal.calories; protein = goal.proteinG; fat = goal.fatG; carbs = goal.carbsG
                } else { balanced = true }
            }
        }.preferredColorScheme(.dark).tint(.white)
    }

    private func number(_ title: String, value: Binding<Double>) -> some View {
        HStack { Text(title); Spacer(); DecimalInput(title: title, value: value).frame(width: 120) }
    }
}

private struct SharedFile: Identifiable { let id = UUID(); let url: URL }

struct PrivacyView: View {
    @Environment(LocalStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var exported: SharedFile?
    @State private var confirmClear = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Storage", value: "On this iPhone")
                    LabeledContent("Logged meals", value: "\(store.logs.count)")
                    LabeledContent("Cloud sync", value: "Off")
                }
                Section {
                    Button("Export diary", systemImage: "square.and.arrow.up") {
                        do { exported = SharedFile(url: try store.exportData()) } catch { self.error = error.localizedDescription }
                    }
                    Button("Clear diary & goals", systemImage: "trash", role: .destructive) { confirmClear = true }
                }
                if let error { ErrorLabel(message: error) }
            }
            .scrollContentBackground(.hidden).macroPage()
            .navigationTitle("Privacy & data").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .sheet(item: $exported) { ShareSheet(url: $0.url) }
            .confirmationDialog("Delete all local meals, goals, and drafts? This cannot be undone.", isPresented: $confirmClear, titleVisibility: .visible) {
                Button("Clear all data", role: .destructive) {
                    do { try store.clearData(); dismiss() } catch { self.error = error.localizedDescription }
                }
            }
        }.preferredColorScheme(.dark).tint(.white)
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    var url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [url], applicationActivities: nil) }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
