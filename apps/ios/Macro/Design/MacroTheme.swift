import SwiftUI

enum MacroTheme {
    static let background = Color(red: 0.055, green: 0.235, blue: 0.19)
    static let backgroundEnd = Color(red: 0.065, green: 0.255, blue: 0.21)
    static let secondary = Color.white.opacity(0.78)
}

struct EmeraldBackground: View {
    var body: some View {
        LinearGradient(colors: [MacroTheme.background, MacroTheme.backgroundEnd], startPoint: .top, endPoint: .bottom)
            .overlay(alignment: .top) {
                Canvas { context, size in
                    for index in 0..<12 {
                        var path = Path()
                        let offset = CGFloat(index) * 30
                        path.move(to: CGPoint(x: size.width * 0.55 + offset, y: -30))
                        path.addQuadCurve(to: CGPoint(x: size.width + 60, y: 110 + offset), control: CGPoint(x: size.width * 0.72 + offset, y: 90 + offset))
                        context.stroke(path, with: .color(.white.opacity(0.035)), lineWidth: 0.5)
                    }
                }
                .frame(height: 230)
                .allowsHitTesting(false)
            }
            .ignoresSafeArea()
    }
}

struct GlassSurface: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var radius: CGFloat = 20
    func body(content: Content) -> some View {
        if reduceTransparency {
            content.background(Color(red: 0.12, green: 0.31, blue: 0.26), in: .rect(cornerRadius: radius))
        } else {
            content.glassEffect(.regular.tint(.white.opacity(0.025)), in: .rect(cornerRadius: radius))
        }
    }
}

extension View {
    func macroGlass(radius: CGFloat = 20) -> some View { modifier(GlassSurface(radius: radius)) }
    func macroPage() -> some View { background(EmeraldBackground()).foregroundStyle(.white).toolbarBackground(.hidden, for: .navigationBar) }
}

struct MacroWordmark: View {
    var body: some View {
        Text("MACRO")
            .font(.system(size: 20, weight: .light, design: .default))
            .fontWidth(.expanded)
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
            .padding(.bottom, 4)
            .accessibilityHidden(true)
    }
}

struct MacroNumbers: View {
    var nutrition: Nutrition
    var body: some View {
        HStack(spacing: 16) {
            nutrient(nutrition.proteinG, label: "P")
            nutrient(nutrition.fatG, label: "F")
            nutrient(nutrition.carbsG, label: "C")
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Protein \(nutrition.proteinG.nutrientText) grams, fat \(nutrition.fatG.nutrientText) grams, carbs \(nutrition.carbsG.nutrientText) grams")
    }

    private func nutrient(_ value: Double, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value.nutrientText) g").font(.system(size: 14, weight: .medium)).monospacedDigit()
            Text(label).font(.system(size: 11)).foregroundStyle(MacroTheme.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ErrorLabel: View {
    var message: String
    var body: some View {
        Label(message, systemImage: "exclamationmark.circle")
            .font(.callout)
            .foregroundStyle(.white)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white.opacity(0.08), in: .rect(cornerRadius: 8))
            .accessibilityIdentifier("errorMessage")
    }
}

struct DecimalInput: View {
    var title: String
    @Binding var value: Double
    @State private var text = ""
    @State private var selection: TextSelection?
    @FocusState private var focused: Bool

    var body: some View {
        TextField(title, text: $text, selection: $selection, prompt: Text("0"))
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .focused($focused)
            .onAppear { synchronize() }
            .onChange(of: value) { _, _ in if !focused { synchronize() } }
            .onChange(of: focused) { _, focused in
                if focused { selection = TextSelection(range: text.startIndex..<text.endIndex) }
                else if value >= 0 { synchronize() }
            }
            .onChange(of: text) { _, text in
                guard focused else { return }
                let strategy = FloatingPointParseStrategy(format: FloatingPointFormatStyle<Double>.number.locale(.current), lenient: false)
                let parsed = text.isEmpty ? 0 : (try? strategy.parse(text)) ?? -1
                value = parsed.isFinite ? parsed : -1
            }
    }

    private func synchronize() {
        text = value == 0 ? "" : value.formatted(.number.grouping(.never).precision(.fractionLength(0...2)))
    }
}
