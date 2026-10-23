import SwiftUI
import Charts

struct NutritionProgressView: View {
    @Environment(LocalStore.self) private var store
    var openDay: (String) -> Void
    @State private var days = 7
    @State private var selected: Date?

    private var dayKeys: [String] {
        (0..<days).reversed().map { DiaryCalendar.shifted(DiaryCalendar.key(Date()), days: -$0) }
    }
    private var loggedKeys: [String] { dayKeys.filter { !store.entries(on: $0).isEmpty } }
    private var chartDates: [Date] { dayKeys.compactMap { DiaryCalendar.date($0) } }
    private var endDate: Date { DiaryCalendar.date(DiaryCalendar.shifted(DiaryCalendar.key(Date()), days: 1)) ?? Date() }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    MacroWordmark()
                    Text("Progress").font(.title2.weight(.medium)).frame(maxWidth: .infinity)
                    HStack(spacing: 16) {
                        Picker("Range", selection: $days) {
                            Text("7 days").tag(7)
                            Text("30 days").tag(30)
                        }.pickerStyle(.segmented).accessibilityIdentifier("progressRange")
                        if let start = dayKeys.first.flatMap({ DiaryCalendar.date($0) }) {
                            Text("\(start.formatted(.dateTime.month(.abbreviated).day())) – \(Date().formatted(.dateTime.day()))")
                                .font(.caption).fixedSize()
                        }
                    }
                    Text("\(loggedKeys.count) of \(days) days logged").font(.caption).foregroundStyle(MacroTheme.secondary)
                    if let selected {
                        Button { openDay(DiaryCalendar.key(selected)) } label: {
                            HStack {
                                Text(DiaryCalendar.title(DiaryCalendar.key(selected)))
                                Spacer()
                                Image(systemName: "arrow.right")
                            }.font(.callout).padding(12).macroGlass(radius: 12)
                        }
                    }
                    metric("Calories", key: \.calories, unit: "kcal")
                    metric("Protein", key: \.proteinG, unit: "g")
                    metric("Fat", key: \.fatG, unit: "g")
                    metric("Carbs", key: \.carbsG, unit: "g")
                }
                .padding(.horizontal, 20).padding(.bottom, 24)
            }
            .macroPage().toolbar(.hidden, for: .navigationBar)
        }
    }

    private func metric(_ title: String, key: KeyPath<Nutrition, Double>, unit: String) -> some View {
        let average = loggedKeys.isEmpty ? nil : loggedKeys.reduce(0) { $0 + store.totals(on: $1)[keyPath: key] } / Double(loggedKeys.count)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.headline)
                    Text(average.map { "\($0.roundedText) \(unit) avg" } ?? "No logged days").font(.caption).foregroundStyle(MacroTheme.secondary)
                }
                Spacer()
                if let goal = store.goal(on: DiaryCalendar.key(Date()))?.nutrition[keyPath: key] {
                    Text("\(goal.roundedText) \(unit) goal").font(.caption).foregroundStyle(MacroTheme.secondary)
                }
            }
            Chart {
                ForEach(dayKeys, id: \.self) { dayKey in
                    if let date = DiaryCalendar.date(dayKey) {
                        if !store.entries(on: dayKey).isEmpty {
                            BarMark(x: .value("Day", date, unit: .day), y: .value(title, store.totals(on: dayKey)[keyPath: key]))
                                .foregroundStyle(.white.opacity(dayKey == DiaryCalendar.key(Date()) ? 0.95 : 0.65))
                                .cornerRadius(2)
                        }
                        if let goal = store.goal(on: dayKey)?.nutrition[keyPath: key], goal > 0,
                           let nextDay = DiaryCalendar.date(DiaryCalendar.shifted(dayKey, days: 1)) {
                            RuleMark(xStart: .value("Start", date), xEnd: .value("End", nextDay), y: .value("Goal", goal))
                                .foregroundStyle(.white.opacity(0.65))
                                .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                        }
                    }
                }
            }
            .frame(height: 110)
            .chartXScale(domain: (chartDates.first ?? Date())...endDate)
            .chartXAxis {
                AxisMarks(values: chartDates.enumerated().filter { days == 7 || $0.offset % 7 == 0 }.map(\.element)) { _ in
                    AxisValueLabel(format: days == 7 ? .dateTime.weekday(.narrow) : .dateTime.month().day())
                        .foregroundStyle(MacroTheme.secondary)
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { _ in
                    AxisGridLine().foregroundStyle(.white.opacity(0.12))
                    AxisValueLabel().foregroundStyle(MacroTheme.secondary)
                }
            }
            .chartXSelection(value: $selected)
            .accessibilityLabel("\(title), \(loggedKeys.count) logged days. \(average.map { "Average \($0.roundedText) \(unit)" } ?? "No data")")
            Divider().overlay(.white.opacity(0.1)).padding(.top, 4)
        }
    }
}
