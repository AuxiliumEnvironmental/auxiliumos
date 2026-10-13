import Foundation
import XCTest
@testable import SpatialCore

/// Synthetic engine-workload evidence only. Timings are observations on the
/// executing host and never assert native touch, rendering, LiDAR or p95 budgets.
final class OperatingEnvelopeTests: XCTestCase {
    func testProposedOperatingEnvelope() throws {
        try exercise(columns: 10, rows: 10, walls: 1_000, openings: 500, name: "proposed-100-rooms")
    }

    func testTenfoldOperatingEnvelopeAndExplicitCapacityRejection() throws {
        var document = try exercise(columns: 40, rows: 25, walls: 10_000, openings: 5_000, name: "extended-1000-rooms")
        document.floors[0].nodes += [.init(id: "capacity-a", point: .init(x: 500, z: 0)),
                                     .init(id: "capacity-b", point: .init(x: 500, z: 1))]
        document.floors[0].walls.append(.init(id: "capacity-extra", nodeIDs: ["capacity-a", "capacity-b"], height: 2.6,
                                             heightBasis: .synthetic, provenance: .init(origin: .synthetic)))
        try Validator.requireValid(document)
        XCTAssertThrowsError(try WalkNavigation(document: document, floorID: "stress-floor")) {
            XCTAssertEqual($0 as? WalkError, .capacity, "An oversized request must be explicitly rejected, never silently truncated.")
        }
    }

    @discardableResult
    private func exercise(columns: Int, rows: Int, walls: Int, openings: Int, name: String) throws -> SpatialDocument {
        let document = workload(columns: columns, rows: rows, wallCount: walls, openingCount: openings)
        XCTAssertEqual(document.floors[0].rooms.count, columns * rows)
        XCTAssertEqual(document.floors[0].walls.count, walls)
        XCTAssertEqual(document.floors[0].openings.count, openings)
        var observations: [String: Any] = ["profile": name, "rooms": columns * rows, "walls": walls, "openings": openings,
            "native_performance_acceptance": false,
            "overlay_marker_coverage": "Not exercised: overlay markers have no canonical v1 engine type here. This does not satisfy the proposed 2000/20000 overlay-marker workload."]
        func measured<T>(_ key: String, _ operation: () throws -> T) rethrows -> T {
            let start = ProcessInfo.processInfo.systemUptime
            let value = try operation()
            observations[key] = ProcessInfo.processInfo.systemUptime - start
            return value
        }
        try measured("validation_seconds") { try Validator.requireValid(document) }
        let scene = try measured("scene_seconds") { try SceneBuilder.build(document: document, floorID: "stress-floor") }
        XCTAssertEqual(scene.documentID, document.documentID); XCTAssertEqual(scene.revision, document.revision)
        XCTAssertEqual(scene.faces.filter { $0.role == "floor" }.count, columns * rows)
        XCTAssertTrue(scene.faces.allSatisfy { face in
            face.vertices.allSatisfy { $0.x.isFinite && $0.y.isFinite && $0.z.isFinite } &&
            face.triangles.allSatisfy { $0.count == 3 && $0.allSatisfy { $0 >= 0 && $0 < face.vertices.count } }
        })
        let renderedIDs = Set(scene.faces.map(\.objectID) + scene.edges.map(\.objectID))
        XCTAssertTrue(document.floors[0].walls.allSatisfy { renderedIDs.contains($0.id) })
        XCTAssertTrue(document.floors[0].openings.allSatisfy { renderedIDs.contains($0.id) })
        let navigation = try measured("navigation_build_seconds") { try WalkNavigation(document: document, floorID: "stress-floor") }
        XCTAssertEqual(navigation.roomIDs.count, columns * rows)
        XCTAssertFalse(navigation.portals.isEmpty)
        let position = try measured("room_placement_seconds") { try navigation.place(inRoom: "room-0-0") }
        XCTAssertEqual(position.roomID, "room-0-0")
        let firstPortal = try XCTUnwrap(navigation.portals.first)
        let length = firstPortal.a.distance(to: firstPortal.b)
        let nx = -(firstPortal.b.z - firstPortal.a.z) / length, nz = (firstPortal.b.x - firstPortal.a.x) / length
        let center = Point2(x: (firstPortal.a.x + firstPortal.b.x) / 2, z: (firstPortal.a.z + firstPortal.b.z) / 2)
        let start = try navigation.place(at: .init(x: center.x + nx * 0.3, z: center.z + nz * 0.3))
        let target = Point2(x: center.x - nx * 0.3, z: center.z - nz * 0.3)
        let move = try measured("single_portal_move_seconds") { try navigation.move(from: start, toward: target) }
        XCTAssertTrue(move.reachedTarget); XCTAssertNotEqual(move.position.roomID, start.roomID)
        XCTAssertEqual(move.crossedPortalIDs, [firstPortal.openingID])
        let clearPoint = Point3(x: position.point.x, y: 0.4, z: position.point.z)
        let cutaway = measured("cutaway_seconds") {
            CutawayVisibility.evaluate(scene: scene, camera: .init(x: -3, y: 2, z: position.point.z), focus: clearPoint)
        }
        XCTAssertFalse(cutaway.hiddenWallIDs.isEmpty)
        let knownWallIDs = Set(document.floors[0].walls.map(\.id))
        XCTAssertTrue(cutaway.hiddenWallIDs.isSubset(of: knownWallIDs))
        observations["scene_face_count"] = scene.faces.count
        observations["scene_edge_count"] = scene.edges.count
        observations["permitted_portal_count"] = navigation.portals.count
        observations["prohibited_opening_count"] = navigation.restrictions.count
        observations["canonical_revision"] = document.revision
        let bytes = try JSONSerialization.data(withJSONObject: observations, options: [.sortedKeys])
        print("OPERATING_ENVELOPE_OBSERVATION " + String(decoding: bytes, as: UTF8.self))
        return document
    }

    /// Shared grid edges subdivided into 4 or 5 physical wall segments. The
    /// extra subdivisions reach the exact requested workload without overlaying
    /// duplicate walls, creating overlapping rooms, or weakening topology checks.
    private func workload(columns: Int, rows: Int, wallCount: Int, openingCount: Int) -> SpatialDocument {
        let edgeCount = (rows + 1) * columns + (columns + 1) * rows
        let extra = wallCount - edgeCount * 4
        precondition(extra >= 0 && extra <= edgeCount)
        var nodes: [String: Point2] = [:], walls: [Wall] = [], openings: [Opening] = []
        var horizontal: [String: [String]] = [:], vertical: [String: [String]] = [:]
        var edgeIndex = 0
        func addEdge(x1: Int, z1: Int, x2: Int, z2: Int) -> [String] {
            let segments = edgeIndex < extra ? 5 : 4; edgeIndex += 1
            var ids: [String] = []
            for part in 0..<segments {
                let ax = x1 + (x2 - x1) * part / segments, az = z1 + (z2 - z1) * part / segments
                let bx = x1 + (x2 - x1) * (part + 1) / segments, bz = z1 + (z2 - z1) * (part + 1) / segments
                let a = "node-\(ax)-\(az)", b = "node-\(bx)-\(bz)", id = "wall-\(walls.count)"
                nodes[a] = .init(x: Double(ax) / 5, z: Double(az) / 5)
                nodes[b] = .init(x: Double(bx) / 5, z: Double(bz) / 5)
                walls.append(.init(id: id, nodeIDs: [a, b], height: 2.6, heightBasis: .synthetic, provenance: .init(origin: .synthetic)))
                ids.append(id)
                if walls.count % 2 == 1 && openings.count < openingCount {
                    let length = nodes[a]!.distance(to: nodes[b]!)
                    let kind: OpeningKind = openings.count % 3 == 0 ? .window : (openings.count % 3 == 1 ? .door : .passage)
                    openings.append(.init(id: "opening-\(openings.count)", wallID: id, kind: kind, offset: (length - 0.44) / 2,
                                          width: 0.44, bottom: kind == .window ? 0.9 : 0, height: kind == .window ? 1.1 : 2.05,
                                          provenance: .init(origin: .synthetic)))
                }
            }
            return ids
        }
        for row in 0...rows { for column in 0..<columns {
            horizontal["\(row)-\(column)"] = addEdge(x1: column * 20, z1: row * 20, x2: (column + 1) * 20, z2: row * 20)
        } }
        for row in 0..<rows { for column in 0...columns {
            vertical["\(row)-\(column)"] = addEdge(x1: column * 20, z1: row * 20, x2: column * 20, z2: (row + 1) * 20)
        } }
        var rooms: [Room] = []
        for row in 0..<rows { for column in 0..<columns {
            let top = horizontal["\(row)-\(column)"]!.map { WallReference(wallID: $0) }
            let right = vertical["\(row)-\(column + 1)"]!.map { WallReference(wallID: $0) }
            let bottom = horizontal["\(row + 1)-\(column)"]!.reversed().map { WallReference(wallID: $0, reversed: true) }
            let left = vertical["\(row)-\(column)"]!.reversed().map { WallReference(wallID: $0, reversed: true) }
            rooms.append(.init(id: "room-\(row)-\(column)", label: "Synthetic room \(row + 1), \(column + 1)", boundary: top + right + bottom + left))
        } }
        let floor = Floor(id: "stress-floor", label: "Synthetic engine workload", nodes: nodes.map { .init(id: $0.key, point: $0.value) }.sorted { $0.id < $1.id },
                          walls: walls, openings: openings, rooms: rooms)
        return SpatialDocument(documentID: "synthetic-envelope-\(columns * rows)", title: "Synthetic engine envelope", floors: [floor])
    }
}
