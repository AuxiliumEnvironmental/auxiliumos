import XCTest
import CaptureKit
import SpatialCore
import SpatialPersistence
@testable import AuxiliumSpatial

/// Apple-hosted contract tests. These use synthetic archive bytes only to test
/// local journal lookup. They do NOT run RoomPlan or establish sensor acceptance.
final class ConnectedCaptureTests: XCTestCase {
    private struct Completion: Encodable {
        let sourceID: String
        let documentID: String
        let revision: Int
        let sha256: String
        let reportSourceID: String?
    }
    func testCompletedConnectedSourcesDoNotAppearAsUnrecoveredRooms() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try SpatialStore(root: directory), source = UUID().uuidString
        let document = SpatialDocument(documentID: UUID().uuidString, title: "Synthetic saved layout",
            floors: [.init(id: "floor-1", label: "Floor 1", nodes: [], walls: [], openings: [], rooms: [])])
        _ = try await store.create(document)
        _ = try await store.archiveCapture(Data("synthetic archive lookup fixture, not a RoomPlan scan".utf8), sourceID: source, kind: .roomPlanRaw)
        let completion = Completion(sourceID: source, documentID: document.documentID, revision: 1,
            sha256: ArtifactDigest.sha256(try document.encoded()), reportSourceID: nil)
        _ = try await store.archiveCapture(JSONEncoder().encode(completion), sourceID: "saved-" + source, kind: .captureMetadata)
        let pipeline = CapturePipeline(store: store)
        let pending = try await pipeline.unrecoveredSourceIDs()
        XCTAssertTrue(pending.isEmpty)
    }
    func testRawSourceWithoutCompletionMarkerRemainsRecoverable() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try SpatialStore(root: directory), source = UUID().uuidString
        _ = try await store.archiveCapture(Data("synthetic raw marker test only".utf8), sourceID: source, kind: .roomPlanRaw)
        let pending = try await CapturePipeline(store: store).unrecoveredSourceIDs()
        XCTAssertEqual(pending, [source])
    }
    func testLegacyCaptureContextDecodesWithoutConnectedMetadata() throws {
        let source = UUID().uuidString
        let object: [String: Any] = ["sourceID": source, "frameID": source, "title": "Retained room",
            "capturedAt": 0, "sdkVersion": "synthetic", "cancelled": false]
        let decoded = try JSONDecoder().decode(CaptureContext.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertNil(decoded.connection); XCTAssertEqual(decoded.sourceID, source)
    }
}
