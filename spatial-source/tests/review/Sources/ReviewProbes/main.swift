import Foundation
import SpatialCore
import SpatialPersistence
import SpatialInterop

@main struct ReviewProbes {
    enum Stop: Error { case injected }
    static func check(_ condition: Bool, _ text: String) throws { if !condition { throw NSError(domain: "QAProbe", code: 1, userInfo: [NSLocalizedDescriptionKey:text]) }; print("PASS " + text) }
    static func main() async throws {
        var e = try EditorSession(Fixtures.twoRooms())
        try e.apply([
            .splitWall(floorID: "floor-1", wallID: "w0", offset: 2, newWallID: "new-wall", newNodeID: "new-node"),
            .joinWalls(floorID: "floor-1", firstWallID: "w0", secondWallID: "new-wall")
        ], expectedRevision: 1)
        let walls = Set(e.document.floors[0].walls.map(\.id))
        let dangling = e.lastReceipt!.mappings.filter { $0.objectKind == "wall" && !$0.resultingIDs.allSatisfy(walls.contains) }
        try check(dangling.isEmpty, "compound split-join mappings contain no dead targets")
        try check(!e.lastReceipt!.mappings.contains { $0.sourceID == "new-wall" }, "receipt omits transient source identity")
        var d = Fixtures.twoRooms()
        d.title = String(repeating: "a\u{0301}", count: 256)
        try check(!Validator.validate(d).isEmpty, "core rejects title over schema Unicode scalar bound")
        try check((try? SpatialDocumentReader.decode(d.encoded())) == nil, "persistence rejects title over schema Unicode scalar bound")
        try check((try? GeometryJSONReader.decode(d.encoded())) == nil, "interop rejects title over schema Unicode scalar bound")
        d.title = String(repeating: "a\u{0301}", count: 128)
        try check(Validator.validate(d).isEmpty, "core accepts title at scalar bound")
        try check((try? GeometryJSONReader.decode(d.encoded())) != nil, "exact bound title exports and reimports")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("spatial-independent-review-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let faulty = try SpatialStore(root: root, faultInjector: { if $0 == .immutableFilePromoted { throw Stop.injected } })
        let raw = Data("synthetic QA capture".utf8)
        do { _ = try await faulty.archiveCapture(raw, sourceID: "source-qa", kind: .roomPlanRaw); try check(false,"fault injected") }
        catch Stop.injected {}
        let store = try SpatialStore(root: root)
        let candidates = try await store.recoverableCaptures()
        try check(candidates.count == 1, "interrupted raw has one independently recoverable identity")
        _ = try await store.archiveCapture(raw, sourceID: "source-qa", kind: .roomPlanRaw)
        _ = try await store.recoverCapture(artifactID: candidates[0].artifactID)
        let remaining = try await store.recoverableCaptures()
        try check(remaining.isEmpty, "successful duplicate recovery is no longer offered")
        try check(try await store.readCapture(sourceID:"source-qa",kind:.roomPlanRaw) == raw, "duplicate recovery preserves exact raw bytes")
        let repository = (0..<5).reduce(URL(fileURLWithPath: #filePath)) { url, _ in url.deletingLastPathComponent() }
        let archive = try Data(contentsOf: repository.appendingPathComponent("fixtures/synthetic_exchange.zip"))
        let imported = try ExchangeImporter.importArchive(archive)
        try check(imported.document == Fixtures.twoRooms(), "independent valid exchange import")
        try check(imported.originalArchive == archive, "exchange preserves exact archive")
        var truncations = 0
        for length in stride(from: 0, to: archive.count, by: max(1,archive.count/32)) {
            do { _ = try ExchangeImporter.importArchive(archive.prefix(length)); try check(false,"truncated archive rejected") }
            catch is SpatialImportError { truncations += 1 }
        }
        try check(truncations >= 32, "32+ diverse archive truncations rejected without trap")
        let text = String(decoding: try Fixtures.twoRooms().encoded(),as:UTF8.self)
        for injected in ["{\"revision\":1,", "{\"revi\\u0073ion\":1,"] {
            do { _ = try GeometryJSONReader.decode(Data((injected+text.dropFirst()).utf8)); try check(false,"duplicate identity rejected") }
            catch SpatialImportError.duplicateJSONKey {}
        }
        try check(true,"plain and escaped duplicate revision rejected")
        var elevated = Fixtures.twoRooms(); elevated.floors[0].elevation = 9999
        try check(Validator.validate(elevated).contains { $0.code == "world_height_bounds" }, "core rejects derived world height outside pinned scene bounds")
        try check((try? GeometryJSONReader.decode(elevated.encoded())) == nil, "untrusted geometry cannot regenerate out-of-bounds scene")
        do {
            _ = try ExchangeExporter.export(document: elevated, floorID: "floor-1")
            try check(false, "export rejects derived scene exceeding pinned coordinate bounds")
        } catch is SpatialImportError { try check(true, "export rejects derived scene exceeding pinned coordinate bounds") }
          catch is SpatialExportError { try check(true, "export rejects derived scene exceeding pinned coordinate bounds") }
        // Independent binary decoder in inspect_exports.py verifies derivative layout,
        // hashes, indices, coordinates, semantic IDs, and door/window open interiors.
        if let output = ProcessInfo.processInfo.environment["SPATIAL_REVIEW_OUTPUT"] {
            let directory = URL(fileURLWithPath: output, isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var exact = Fixtures.twoRooms(); exact.revision = 19; exact.parentRevision = 18
            let exchange = try ExchangeExporter.export(document: exact, floorID: "floor-1")
            try exchange.archiveData.write(to: directory.appendingPathComponent("review-exchange.zip"))
            try GLBExporter.export(document: exact, floorID: "floor-1").write(to: directory.appendingPathComponent("review-model.glb"))
            try check(try ExchangeImporter.importArchive(exchange.archiveData).document == exact, "exported revision19 roundtrips exactly")
        }
    }
}
