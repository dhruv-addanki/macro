import SwiftUI

struct AppRootView: View {
    @Environment(LocalStore.self) private var store
    @Environment(LoggingController.self) private var logging
    @Environment(\.scenePhase) private var scenePhase
    @State private var selection = 0
    @State private var selectedDate = DiaryCalendar.key(Date())
    @State private var previousToday = DiaryCalendar.key(Date())
    @State private var undoError: String?

    var body: some View {
        @Bindable var logging = logging
        TabView(selection: $selection) {
            Tab("Home", systemImage: "house", value: 0) {
                HomeView(selectedDate: $selectedDate, openProfile: { selection = 2 })
            }
            Tab("Progress", systemImage: "chart.bar", value: 1) {
                NutritionProgressView { date in selectedDate = date; selection = 0 }
            }
            Tab("Profile", systemImage: "person", value: 2) {
                ProfileView()
            }
        }
        .background(EmeraldBackground())
        .tint(.white)
        .overlay(alignment: .top) {
            if let undo = store.undoAction {
                HStack {
                    Label(undo.label, systemImage: "checkmark.circle")
                    Spacer(minLength: 10)
                    Button("Undo", systemImage: "arrow.uturn.backward") {
                        do { try store.undo() } catch { undoError = error.localizedDescription }
                    }
                    .accessibilityIdentifier("undoChange")
                    Button("Dismiss", systemImage: "xmark") { store.undoAction = nil }
                        .labelStyle(.iconOnly)
                }
                .font(.callout)
                .padding(14)
                .macroGlass(radius: 18)
                .padding(.horizontal, 20)
                .padding(.top, 6)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .sheet(isPresented: $logging.presented, onDismiss: {
            logging.audio.stop()
            if let draft = logging.draft, !["completed", "canceled"].contains(draft.state) {
                draft.text = logging.text
                if draft.state == "recording" { draft.state = "draft" }
                try? store.save()
            }
        }) {
            VoiceLogSheet()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(.clear)
                .interactiveDismissDisabled(logging.busy || logging.audio.isRecording)
        }
        .onChange(of: logging.completedDate) { _, date in
            if let date { selectedDate = date; selection = 0 }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                let today = DiaryCalendar.key(Date())
                if selectedDate == previousToday { selectedDate = today }
                previousToday = today
            }
        }
        .alert("Could not undo", isPresented: Binding(get: { undoError != nil }, set: { if !$0 { undoError = nil } })) {
            Button("OK") { undoError = nil }
        } message: { Text(undoError ?? "") }
    }
}
