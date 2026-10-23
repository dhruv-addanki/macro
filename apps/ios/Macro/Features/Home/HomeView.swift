import SwiftUI

struct HomeView: View {
    @Environment(LocalStore.self) private var store
    @Environment(LoggingController.self) private var logging
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @Binding var selectedDate: String
    var openProfile: () -> Void
    @State private var editMeal: MealLog?
    @State private var manualPresented = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 16) {
                        MacroWordmark()
                        HStack {
                            Button("Previous day", systemImage: "chevron.left") { shift(-1) }.labelStyle(.iconOnly)
                            Spacer()
                            Text(DiaryCalendar.title(selectedDate)).font(.subheadline).accessibilityIdentifier("selectedDate")
                            Spacer()
                            Button("Next day", systemImage: "chevron.right") { shift(1) }.labelStyle(.iconOnly)
                        }
                        .buttonStyle(.plain)
                        .frame(minHeight: 44)
                        if selectedDate != DiaryCalendar.key(Date()) {
                            Button("Today") { selectedDate = DiaryCalendar.key(Date()) }.font(.caption)
                        }
                        DailySummary(total: store.totals(on: selectedDate), goal: store.goal(on: selectedDate)?.nutrition, setGoal: openProfile)
                    }
                    if let error { ErrorLabel(message: error) }
                    ForEach(store.drafts.filter { $0.selectedDate == selectedDate }) { draft in
                        Button { logging.resume(draft) } label: {
                            HStack {
                                Image(systemName: "doc.text")
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(draft.state == "clarifying" ? "One question about your meal" : "Unfinished meal")
                                    Text(draft.text.isEmpty ? "Recording draft" : draft.text).font(.caption).lineLimit(2).foregroundStyle(MacroTheme.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                            }
                            .padding(16).macroGlass()
                        }.buttonStyle(.plain)
                    }
                    if store.entries(on: selectedDate).isEmpty {
                        VStack(spacing: 14) {
                            Image(systemName: "fork.knife").font(.system(size: 30, weight: .ultraLight))
                            Text("No meals logged").font(.headline)
                            entryActions
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 34)
                    } else {
                        LazyVStack(spacing: 14) {
                            ForEach(store.entries(on: selectedDate)) { meal in
                                MealLogCard(meal: meal, runningCalories: runningTotal(through: meal), edit: { editMeal = meal }, correct: { logging.begin(date: meal.dateKey, target: meal, record: false) }, delete: {
                                    do { try store.delete(meal) } catch { self.error = error.localizedDescription }
                                })
                            }
                        }
                        entryActions.padding(.top, 8)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .clipped()
            .safeAreaInset(edge: .bottom) {
                HStack {
                    Spacer()
                    Button {
                        logging.begin(date: selectedDate, record: !ProcessInfo.processInfo.arguments.contains("--uitesting"))
                    } label: {
                        Image(systemName: "plus").font(.system(size: 26, weight: .light)).frame(width: 58, height: 58)
                    }
                    .buttonStyle(.glass)
                    .accessibilityLabel("Log meal")
                    .accessibilityIdentifier("addMeal")
                }
                .padding(.horizontal, 20).padding(.bottom, 8)
                .background(MacroTheme.backgroundEnd)
            }
            .simultaneousGesture(DragGesture(minimumDistance: 40).onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) * 1.5 else { return }
                shift(value.translation.width < 0 ? 1 : -1)
            })
            .macroPage()
            .toolbar(.hidden, for: .navigationBar)
            .sheet(item: $editMeal) { meal in ManualMealEditor(meal: meal, date: meal.dateKey) }
            .sheet(isPresented: $manualPresented) { ManualMealEditor(meal: nil, date: selectedDate) }
        }
    }

    private func shift(_ days: Int) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { selectedDate = DiaryCalendar.shifted(selectedDate, days: days) }
    }

    private var entryActions: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 18)) : AnyLayout(HStackLayout(spacing: 24))
        return layout {
            Button("Type meal", systemImage: "keyboard") { logging.begin(date: selectedDate, record: false) }.accessibilityIdentifier("typeMeal")
            Button("Add manually", systemImage: "square.and.pencil") { manualPresented = true }.accessibilityIdentifier("addManually")
        }.font(.callout)
    }

    private func runningTotal(through meal: MealLog) -> Double {
        var calories: Double = 0
        for entry in store.entries(on: selectedDate) {
            calories += entry.nutrition.calories
            if entry.id == meal.id { break }
        }
        return calories
    }
}

private struct DailySummary: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var total: Nutrition
    var goal: Nutrition?
    var setGoal: () -> Void

    var body: some View {
        VStack(spacing: 22) {
          if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 16) {
                Text("\(total.calories.roundedText) kcal").font(.title2.weight(.semibold)).accessibilityIdentifier("dailyCalories")
                if let goal {
                    Text("of \(goal.calories.roundedText) goal").font(.caption)
                    Text("\(abs(goal.calories - total.calories).roundedText) kcal \(total.calories <= goal.calories ? "left" : "over")").font(.caption)
                } else { Button("Set a goal", action: setGoal).font(.caption) }
                nutrient("Protein", value: total.proteinG, target: goal?.proteinG)
                nutrient("Fat", value: total.fatG, target: goal?.fatG)
                nutrient("Carbs", value: total.carbsG, target: goal?.carbsG)
            }.frame(maxWidth: .infinity, alignment: .leading)
          } else {
            HStack(spacing: 16) {
                ZStack {
                    Circle().stroke(.white.opacity(0.18), lineWidth: 3)
                    Circle().trim(from: 0, to: progress(total.calories, goal?.calories)).stroke(.white, style: StrokeStyle(lineWidth: 3, lineCap: .round)).rotationEffect(.degrees(-90))
                    Text(goal == nil ? "—" : "\(Int(progress(total.calories, goal?.calories) * 100))%")
                        .font(.system(size: 15, weight: .medium)).monospacedDigit()
                }
                .frame(width: 64, height: 64)
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 5) {
                    Text("\(total.calories.roundedText) kcal").font(.system(size: 25, weight: .semibold)).monospacedDigit().accessibilityIdentifier("dailyCalories")
                    if let goal { Text("of \(goal.calories.roundedText) goal").font(.caption).foregroundStyle(MacroTheme.secondary) }
                    else { Button("Set a goal", action: setGoal).font(.caption).underline() }
                }
                Spacer(minLength: 0)
                if let goal {
                    VStack(alignment: .trailing, spacing: 4) {
                        Text(abs(goal.calories - total.calories).roundedText).font(.system(size: 22, weight: .medium)).monospacedDigit()
                        Text(total.calories <= goal.calories ? "kcal left" : "kcal over").font(.caption).foregroundStyle(MacroTheme.secondary)
                    }
                }
            }
            HStack(spacing: 16) {
                nutrient("Protein", value: total.proteinG, target: goal?.proteinG)
                nutrient("Fat", value: total.fatG, target: goal?.fatG)
                nutrient("Carbs", value: total.carbsG, target: goal?.carbsG)
            }
          }
        }
    }

    private func progress(_ value: Double, _ target: Double?) -> Double { guard let target, target > 0 else { return 0 }; return min(1, max(0, value / target)) }
    private func nutrient(_ label: String, value: Double, target: Double?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.caption)
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.18))
                    Capsule().fill(.white).frame(width: geometry.size.width * progress(value, target))
                }
            }.frame(height: 3)
            Text(target.map { "\(value.roundedText) / \($0.roundedText) g" } ?? "\(value.roundedText) g")
                .font(.system(size: 12)).monospacedDigit().minimumScaleFactor(0.75).lineLimit(1)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
