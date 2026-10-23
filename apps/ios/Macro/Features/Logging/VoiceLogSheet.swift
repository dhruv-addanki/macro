import SwiftUI

struct VoiceLogSheet: View {
    @Environment(LoggingController.self) private var logging
    @Environment(LocalStore.self) private var store
    @State private var typing = false

    var body: some View {
        @Bindable var logging = logging
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    if let target = logging.draft?.targetID.flatMap(store.log) {
                        Text("Correcting \(target.title)").font(.headline)
                    }
                    if let draft = logging.draft {
                        Text(DiaryCalendar.title(draft.selectedDate)).font(.caption).foregroundStyle(MacroTheme.secondary)
                    }
                    if logging.busy {
                        SwiftUI.ProgressView().controlSize(.large)
                        Text(logging.phase).font(.headline)
                    } else if logging.audio.isRecording {
                        Label("Recording · \(Int(logging.audio.duration) / 60):\(String(format: "%02d", Int(logging.audio.duration) % 60))", systemImage: "record.circle")
                        Label(logging.audio.inputName, systemImage: "mic").font(.caption).foregroundStyle(MacroTheme.secondary)
                            .accessibilityIdentifier("recordingInput")
                        HStack(spacing: 4) {
                            ForEach(Array(logging.audio.levels.enumerated()), id: \.offset) { _, level in
                                Capsule().fill(.white.opacity(0.9)).frame(maxWidth: .infinity).frame(height: max(4, level * 75))
                            }
                        }.frame(height: 80).accessibilityHidden(true)
                    }
                    if typing || !logging.text.isEmpty || (!logging.audio.isRecording && logging.draft?.recordingPath == nil) {
                        TextEditor(text: $logging.text)
                            .scrollContentBackground(.hidden)
                            .frame(minHeight: 120, maxHeight: 220)
                            .padding(8)
                            .background(.white.opacity(0.05), in: .rect(cornerRadius: 8))
                            .accessibilityLabel("Meal description")
                            .accessibilityIdentifier("mealDescription")
                            .disabled(logging.busy)
                    }
                    if let question = logging.draft?.question {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(question).font(.headline)
                            TextField("Your answer", text: $logging.answer, axis: .vertical)
                                .textFieldStyle(.roundedBorder)
                                .accessibilityIdentifier("clarificationAnswer")
                        }
                    }
                    if let message = logging.errorMessage {
                        ErrorLabel(message: message)
                        if logging.draft?.targetID != nil {
                            Button("Use latest meal", systemImage: "arrow.clockwise") { logging.refreshCorrection() }
                        }
                    }
                    if let message = logging.audio.errorMessage { ErrorLabel(message: message) }
                    if !logging.busy {
                        HStack(spacing: 28) {
                            Button {
                                logging.stopRecording()
                                typing = true
                            } label: { Image(systemName: "keyboard").font(.title3).frame(width: 48, height: 48) }
                                .buttonStyle(.glass).accessibilityLabel("Type meal")
                            Button {
                                logging.send()
                            } label: {
                                Label(logging.audio.isRecording ? "Stop and send" : "Log meal", systemImage: logging.audio.isRecording ? "stop.fill" : "arrow.up")
                                    .font(.headline).frame(minHeight: 48).padding(.horizontal, 12)
                            }
                            .buttonStyle(.glass)
                            .accessibilityIdentifier("sendMeal")
                            if !logging.audio.isRecording {
                                Button { typing = false; logging.startRecording() } label: { Image(systemName: "mic").font(.title3).frame(width: 48, height: 48) }
                                    .buttonStyle(.glass).accessibilityLabel("Record meal").accessibilityIdentifier("recordMeal")
                            }
                        }
                        if logging.draft?.recordingPath != nil && !logging.audio.isRecording && logging.text.isEmpty {
                            Label("Recording ready", systemImage: "waveform").font(.caption)
                        }
                        Button("Keep draft", systemImage: "doc") { logging.keepDraft() }.font(.callout)
                    }
                }
                .padding(22)
            }
            .navigationTitle(logging.draft?.targetID == nil ? "Log meal" : "Correct meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark") { logging.cancel() }.labelStyle(.iconOnly)
                }
            }
            .background(MacroTheme.background.opacity(0.96))
            .foregroundStyle(.white)
            .onAppear { typing = !logging.audio.isRecording && logging.draft?.recordingPath == nil }
            .onChange(of: logging.audio.isRecording) { _, recording in if recording { typing = false } }
        }
    }
}
