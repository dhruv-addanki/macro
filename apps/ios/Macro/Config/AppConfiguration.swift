import Foundation
import Observation
import Security

struct ProxyConfiguration: Sendable {
    var baseURL: URL
    var token: String
}

@MainActor @Observable
final class AppConfiguration {
    var url: String
    var token: String

    init() {
        let defaults = UserDefaults.standard
        func bundled(_ name: String) -> String? {
            guard let value = Bundle.main.object(forInfoDictionaryKey: name) as? String,
                  !value.isEmpty, !value.contains("$("), !value.hasPrefix("YOUR_"), !value.hasPrefix("MATCH_") else { return nil }
            return value
        }
        let initialURL = defaults.string(forKey: "proxyURL") ?? bundled("MacroAPIBaseURL") ?? "http://127.0.0.1:4001"
        url = initialURL
        token = (try? APICredentialStore.load(for: initialURL)) ?? ""
        if let legacy = defaults.string(forKey: "proxyToken"), !legacy.isEmpty {
            if token.isEmpty { token = legacy }
            if (try? APICredentialStore.save(token, for: url)) != nil { defaults.removeObject(forKey: "proxyToken") }
        }
        #if DEBUG
        if token.isEmpty, url == bundled("MacroAPIBaseURL") { token = bundled("MacroDevAPIToken") ?? "" }
        provisionDevelopmentDevice()
        #endif
    }

    func snapshot() throws -> ProxyConfiguration {
        let parsed = try Self.validatedURL(url)
        guard token.trimmingCharacters(in: .whitespacesAndNewlines).count >= 24 else { throw AIError.message("Set your API credential in Profile > API connection.") }
        return ProxyConfiguration(baseURL: parsed, token: token.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    func save() throws {
        let config = try snapshot()
        try APICredentialStore.save(config.token, for: config.baseURL.absoluteString)
        url = config.baseURL.absoluteString; token = config.token
        UserDefaults.standard.set(url, forKey: "proxyURL")
        UserDefaults.standard.removeObject(forKey: "proxyToken")
    }

    static func validatedURL(_ value: String) throws -> URL {
        guard let parsed = URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = parsed.host, !host.isEmpty, parsed.user == nil, parsed.password == nil,
              parsed.query == nil, parsed.fragment == nil else { throw AIError.message("Enter a valid HTTPS API URL.") }
        if parsed.scheme == "https" { return parsed }
        #if DEBUG
        let parts = host.split(separator: ".")
        let octets = parts.compactMap { Int($0) }
        let privateIPv4 = parts.count == 4 && octets.count == 4 && octets.map(String.init).joined(separator: ".") == host && octets.allSatisfy { (0...255).contains($0) } &&
            (octets[0] == 127 || octets[0] == 10 || (octets[0] == 192 && octets[1] == 168) || (octets[0] == 172 && (16...31).contains(octets[1])))
        if parsed.scheme == "http", host == "localhost" || host == "[::1]" || privateIPv4 { return parsed }
        #endif
        throw AIError.message("Use HTTPS for a hosted API. Unencrypted connections are only allowed on a private development network.")
    }

    #if DEBUG
    private func provisionDevelopmentDevice() {
        // USB provisioning avoids putting a production credential in the app binary.
        let file = URL.applicationSupportDirectory.appendingPathComponent("api-connection.json")
        guard FileManager.default.fileExists(atPath: file.path) else { return }
        struct Provisioning: Decodable { var url: String; var token: String }
        do {
            let value = try JSONDecoder().decode(Provisioning.self, from: Data(contentsOf: file))
            let config = try Self.validatedURL(value.url)
            guard config.scheme == "https", value.token.count >= 32 else { return }
            try APICredentialStore.save(value.token, for: config.absoluteString)
            UserDefaults.standard.set(config.absoluteString, forKey: "proxyURL")
            UserDefaults.standard.removeObject(forKey: "proxyToken")
            url = config.absoluteString; token = value.token
            try FileManager.default.removeItem(at: file)
        } catch { return }
    }
    #endif
}

enum APICredentialStore {
    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.macro.api", kSecAttrAccount as String: account]
    }

    static func load(for account: String) throws -> String? {
        var query = query(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw AIError.message("The API credential could not be read from Keychain (\(status)).") }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String, for account: String) throws {
        let query = query(account)
        let attributes: [String: Any] = [kSecValueData as String: Data(token.utf8), kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw AIError.message("The API credential could not be saved to Keychain. Unlock the phone and try again.") }
    }

    static func remove(for account: String) { SecItemDelete(query(account) as CFDictionary) }
}
