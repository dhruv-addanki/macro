import Foundation

enum AIError: LocalizedError {
    case message(String)
    var errorDescription: String? { switch self { case .message(let message): message } }
}

struct ProxyStatus: Decodable, Sendable {
    var ok: Bool
    var service: String
    var openaiConfigured: Bool
    var model: String
    var transcriptionModel: String
}

protocol MealAI: Sendable {
    func interpret(_ input: InterpretRequest, configuration: ProxyConfiguration) async throws -> InterpretResult
    func transcribe(_ file: URL, id: UUID, configuration: ProxyConfiguration) async throws -> String
}

struct AIClient: MealAI {
    private struct Failure: Decodable { var message: String }

    private func request(path: String, configuration: ProxyConfiguration) -> URLRequest {
        var request = URLRequest(url: configuration.baseURL.appendingPathComponent(path))
        request.timeoutInterval = 180
        request.setValue("Bearer \(configuration.token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func perform<T: Decodable & Sendable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let response = response as? HTTPURLResponse else { throw AIError.message("The proxy returned an invalid response.") }
            guard (200...299).contains(response.statusCode) else {
                let failure = try? JSONDecoder().decode(Failure.self, from: data)
                throw AIError.message(failure?.message ?? "The proxy could not complete this request (\(response.statusCode)). Your diary has not changed.")
            }
            return try JSONDecoder().decode(T.self, from: data)
        } catch let error as URLError {
            if error.code == .cancelled { throw CancellationError() }
            let local = request.url?.scheme == "http"
            throw AIError.message(local ? "Cannot reach the local API. Start npm run start:voice on your Mac and check Profile > API connection. Your draft is saved." : "Cannot reach the API. Check your internet connection and retry. Your draft is saved.")
        } catch is DecodingError {
            throw AIError.message("The estimate was not in the expected format. Your diary has not changed.")
        }
    }

    func interpret(_ input: InterpretRequest, configuration: ProxyConfiguration) async throws -> InterpretResult {
        var request = request(path: "v1/meals/interpret", configuration: configuration)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(input)
        let result = try await perform(request, as: InterpretResult.self)
        try result.validate()
        return result
    }

    func transcribe(_ file: URL, id: UUID, configuration: ProxyConfiguration) async throws -> String {
        let data = try Data(contentsOf: file)
        guard data.count <= 8 * 1024 * 1024 else { throw AIError.message("The recording is too large. Record a shorter meal description.") }
        _ = try RecordingAnalysis.inspect(file)
        let boundary = "Macro-\(UUID().uuidString)"
        var body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"meal.m4a\"\r\nContent-Type: audio/mp4\r\n\r\n".utf8)
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        var request = request(path: "v1/audio/transcribe", configuration: configuration)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(id.uuidString, forHTTPHeaderField: "Idempotency-Key")
        request.httpBody = body
        struct Transcript: Decodable, Sendable { var text: String }
        return try await perform(request, as: Transcript.self).text
    }

    func status(configuration: ProxyConfiguration) async throws -> ProxyStatus {
        try await perform(request(path: "v1/status", configuration: configuration), as: ProxyStatus.self)
    }
}

#if DEBUG
struct UITestAI: MealAI {
    func interpret(_ input: InterpretRequest, configuration: ProxyConfiguration) async throws -> InterpretResult {
        try await Task.sleep(for: .milliseconds(150))
        if let target = input.target {
            var foods = target.foods
            if input.text.lowercased().contains("half") {
                for i in foods.indices {
                    foods[i].nutrition.calories /= 2
                    foods[i].nutrition.proteinG /= 2
                    foods[i].nutrition.fatG /= 2
                    foods[i].nutrition.carbsG /= 2
                }
            }
            return InterpretResult(action: "update", logs: [ProposedLog(date: target.date, title: target.title, foods: foods, assumptions: ["UI test fixture"])], targetLogID: target.id, expectedRevision: target.revision)
        }
        return InterpretResult(action: "create", logs: [ProposedLog(date: input.selectedDate, title: "Banana and yogurt", foods: [FoodComponent(name: "Banana", portion: "1 medium", nutrition: Nutrition(calories: 105, proteinG: 1, fatG: 0, carbsG: 26)), FoodComponent(name: "Greek yogurt", portion: "170 g", nutrition: Nutrition(calories: 100, proteinG: 17, fatG: 0, carbsG: 8))], assumptions: ["UI test fixture"])])
    }

    func transcribe(_ file: URL, id: UUID, configuration: ProxyConfiguration) async throws -> String {
        _ = try RecordingAnalysis.inspect(file)
        return "I ate a banana and Greek yogurt."
    }
}
#endif
