import SwiftUI

struct ConnectionSettingsView: View {
    @Environment(AppConfiguration.self) private var configuration
    @Environment(\.dismiss) private var dismiss
    @State private var url = ""
    @State private var token = ""
    @State private var checking = false
    @State private var status: ProxyStatus?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("API server") {
                    TextField("API URL", text: $url).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("API credential", text: $token).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button {
                        Task { await check() }
                    } label: {
                        HStack { Label("Check connection", systemImage: "arrow.clockwise"); Spacer(); if checking { ProgressView() } }
                    }.disabled(checking)
                }
                if let status {
                    Section("Connection") {
                        Label("Connected", systemImage: "checkmark.circle")
                        LabeledContent("OpenAI key", value: status.openaiConfigured ? "Configured" : "Missing on server")
                        LabeledContent("Meal model", value: status.model)
                        LabeledContent("Transcription", value: status.transcriptionModel)
                    }
                }
                if let error { Section { ErrorLabel(message: error) } }
            }
            .scrollContentBackground(.hidden).macroPage()
            .navigationTitle("API connection").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save", systemImage: "checkmark") { save() } }
            }
            .onAppear { url = configuration.url; token = configuration.token }
        }.preferredColorScheme(.dark).tint(.white)
    }

    private func save() {
        do {
            let oldURL = configuration.url; let oldToken = configuration.token
            configuration.url = url; configuration.token = token
            do { try configuration.save(); dismiss() } catch {
                configuration.url = oldURL; configuration.token = oldToken
                throw error
            }
        } catch { self.error = error.localizedDescription }
    }

    @MainActor private func check() async {
        checking = true; error = nil; status = nil
        defer { checking = false }
        do { status = try await AIClient().status(configuration: ProxyConfiguration(baseURL: AppConfiguration.validatedURL(url), token: token)) }
        catch { self.error = error.localizedDescription }
    }
}
