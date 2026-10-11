import Foundation

/// The installed app trusts only its packaged top-level workspace. A document
/// URL, schema hash or project identifier never grants sensor access.
enum BridgePolicy {
    static let version = "1.0.0"
    static func permits(_ url: URL?) -> Bool {
        guard let url, url.scheme == "capacitor", url.host == "localhost",
              url.port == nil, url.user == nil, url.password == nil,
              !url.path.contains("_capacitor_"),
              !url.path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }) else { return false }
        return true
    }
    static func accepts(version: String?, keys: Set<String>) -> Bool {
        version == Self.version && keys == ["bridgeVersion"]
    }
    static func permitsMessage(mainFrame: Bool, scheme: String, host: String, request: URL?, page: URL?, plugin: String?) -> Bool {
        mainFrame && scheme == "capacitor" && host == "localhost" && permits(request) && permits(page) &&
            ["AuxiliumCapture", "AuxiliumFiles"].contains(plugin ?? "")
    }
}
