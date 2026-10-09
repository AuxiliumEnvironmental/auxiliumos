import XCTest
@testable import AuxiliumSpatial

/// Apple-hosted bridge policy tests. These never certify sensor behavior.
final class BridgePolicyTests: XCTestCase {
    func testOnlyPackagedOriginIsAccepted() {
        XCTAssertTrue(BridgePolicy.permits(URL(string: "capacitor://localhost/")))
        XCTAssertTrue(BridgePolicy.permits(URL(string: "capacitor://localhost/spatial")))
        for value in ["https://localhost/", "http://localhost/", "capacitor://evil/", "capacitor://localhost.evil/",
                      "capacitor://localhost:443/", "capacitor://user@localhost/", "file:///private/data",
                      "capacitor://localhost/_capacitor_file_/private/data", "capacitor://localhost/_capacitor_http_interceptor_/",
                      "capacitor://localhost/x/../_capacitor_file_/private/data"] {
            XCTAssertFalse(BridgePolicy.permits(URL(string: value)), value)
        }
        XCTAssertFalse(BridgePolicy.permits(nil))
    }
    func testVersionAndRequestKeysAreExact() {
        XCTAssertTrue(BridgePolicy.accepts(version: "1.0.0", keys: ["bridgeVersion"]))
        XCTAssertFalse(BridgePolicy.accepts(version: "1.1.0", keys: ["bridgeVersion"]))
        XCTAssertFalse(BridgePolicy.accepts(version: nil, keys: []))
        XCTAssertFalse(BridgePolicy.accepts(version: "1.0.0", keys: ["bridgeVersion", "documentID"]))
    }
    func testMessagesRejectSubframesProxyPagesAndUnscopedPlugins() {
        let local = URL(string: "capacitor://localhost/")!
        XCTAssertTrue(BridgePolicy.permitsMessage(mainFrame: true, scheme: "capacitor", host: "localhost", request: local, page: local, plugin: "AuxiliumCapture"))
        XCTAssertTrue(BridgePolicy.permitsMessage(mainFrame: true, scheme: "capacitor", host: "localhost", request: local, page: local, plugin: "AuxiliumFiles"))
        XCTAssertFalse(BridgePolicy.permitsMessage(mainFrame: false, scheme: "capacitor", host: "localhost", request: local, page: local, plugin: "AuxiliumCapture"))
        XCTAssertFalse(BridgePolicy.permitsMessage(mainFrame: true, scheme: "https", host: "localhost", request: local, page: local, plugin: "AuxiliumCapture"))
        XCTAssertFalse(BridgePolicy.permitsMessage(mainFrame: true, scheme: "capacitor", host: "localhost", request: URL(string: "https://host/"), page: local, plugin: "AuxiliumCapture"))
        XCTAssertFalse(BridgePolicy.permitsMessage(mainFrame: true, scheme: "capacitor", host: "localhost", request: local, page: local, plugin: "WebView"))
        XCTAssertFalse(BridgePolicy.permitsMessage(mainFrame: true, scheme: "capacitor", host: "localhost", request: local, page: local, plugin: "CapacitorHttp"))
    }
    func testExportRejectsArbitraryPathsURLsAndMIMEConfusion() throws {
        let bytes = Data("{}".utf8).base64EncodedString()
        XCTAssertEqual(try ExportBridgePolicy.decode(filename: "layout-r1.json", mimeType: "application/json", base64: bytes), Data("{}".utf8))
        for name in ["../layout.json", "/tmp/layout.json", "layout..json", "https://host/file.json", "private\\layout.json", "layout.html"] {
            XCTAssertThrowsError(try ExportBridgePolicy.decode(filename: name, mimeType: "application/json", base64: bytes), name)
        }
        XCTAssertThrowsError(try ExportBridgePolicy.decode(filename: "layout.json", mimeType: "text/html", base64: bytes))
        XCTAssertThrowsError(try ExportBridgePolicy.decode(filename: "layout.png", mimeType: "image/png", base64: bytes))
        XCTAssertThrowsError(try ExportBridgePolicy.decode(filename: "layout.json", mimeType: "application/json", base64: "bad!!!"))
    }
    func testExportRejectsActiveSVGAndRetainsPlainLineArt() throws {
        let safe = "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0L1 1\"/></svg>"
        XCTAssertNoThrow(try ExportBridgePolicy.decode(filename: "layout.svg", mimeType: "image/svg+xml", base64: Data(safe.utf8).base64EncodedString()))
        for value in ["<svg><script>alert(1)</script></svg>", "<svg><image href=\"https://private/\"/></svg>", "<svg onload='x()'></svg>", "<!DOCTYPE svg><svg/>", "<svg><foreignObject/></svg>",
                      "<svg><style>@import 'https://private';</style></svg>", "<svg><path style=\"fill:url(https://private)\"/></svg>",
                      "<svg><path href=\"&#x64;ata:text/html,private\"/></svg>", "<svg><animate/></svg>", "<svg><g></svg>"] {
            XCTAssertThrowsError(try ExportBridgePolicy.decode(filename: "layout.svg", mimeType: "image/svg+xml", base64: Data(value.utf8).base64EncodedString()))
        }
    }
    func testExportSizeLimitPrecedesDecode() {
        let oversized = String(repeating: "A", count: ((ExportBridgePolicy.maximumBytes + 2) / 3) * 4 + 4)
        XCTAssertThrowsError(try ExportBridgePolicy.decode(filename: "layout.json", mimeType: "application/json", base64: oversized))
    }
}
