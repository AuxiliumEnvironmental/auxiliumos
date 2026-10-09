import Foundation

/// Explicit physical room corrections. Semantic-area drawing does not call this
/// code. Commands validate the complete resulting graph before any revision saves.
enum RoomTopology {
    private static func invalid(_ message: String) -> SpatialError {
        .invalid([.init("room_topology", "rooms", message)])
    }
    static func split(roomID: String, dividerWallID: String, newRoomID: String, newLabel: String, floor: inout Floor) throws {
        guard let index = floor.rooms.firstIndex(where: { $0.id == roomID }),
              let divider = floor.walls.first(where: { $0.id == dividerWallID }),
              let start = divider.nodeIDs.first, let end = divider.nodeIDs.last,
              !floor.rooms.contains(where: { $0.id == newRoomID }), Validator.validID(newRoomID) else {
            throw invalid("Choose an existing room and divider with a new room identifier")
        }
        let original = floor.rooms[index]
        guard !floor.rooms.contains(where: { $0.boundary.contains(where: { $0.wallID == dividerWallID }) }) else {
            throw invalid("The divider already belongs to a room boundary")
        }
        // Compound commands may contain temporarily invalid graphs. Reject
        // duplicate input here rather than trap before the transaction rolls back.
        guard Set(floor.walls.map(\.id)).count == floor.walls.count else { throw invalid("Wall identifiers are duplicated") }
        let wallMap = Dictionary(floor.walls.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let starts = original.boundary.compactMap { ref -> String? in
            guard let wall = wallMap[ref.wallID] else { return nil }
            return ref.reversed ? wall.nodeIDs.last : wall.nodeIDs.first
        }
        guard let a = starts.firstIndex(of: start), let b = starts.firstIndex(of: end), a != b else {
            throw invalid("Divider endpoints must be explicit boundary corners. Split the host wall first if needed")
        }
        func arc(_ from: Int, _ to: Int) -> [WallReference] {
            var result: [WallReference] = []; var i = from
            while i != to { result.append(original.boundary[i]); i = (i + 1) % original.boundary.count }
            return result
        }
        var first = original
        first.boundary = arc(a, b) + [.init(wallID: dividerWallID, reversed: true)]
        let second = Room(id: newRoomID, label: newLabel, boundary: arc(b, a) + [.init(wallID: dividerWallID)])
        let before = try Geometry.boundary(room: original, floor: floor)
        let left = try Geometry.boundary(room: first, floor: floor), right = try Geometry.boundary(room: second, floor: floor)
        guard first.boundary.count >= 3, second.boundary.count >= 3,
              Geometry.isSimplePolygon(left), Geometry.isSimplePolygon(right) else {
            throw invalid("The divider must produce two simple closed rooms")
        }
        let area = Geometry.signedArea(before), la = Geometry.signedArea(left), ra = Geometry.signedArea(right)
        guard area * la > 0, area * ra > 0,
              abs(abs(la) + abs(ra) - abs(area)) <= max(Geometry.epsilon, abs(area) * 1e-9) else {
            throw invalid("The divider must remain inside the original room without overlaps")
        }
        floor.rooms[index] = first; floor.rooms.append(second)
    }
    /// Removes only the shared partition and its hosted openings. The caller must
    /// explain this physical change. All original source captures remain intact.
    static func merge(firstRoomID: String, secondRoomID: String, floor: inout Floor) throws -> (walls: [String], openings: [String]) {
        guard firstRoomID != secondRoomID,
              let first = floor.rooms.first(where: { $0.id == firstRoomID }),
              let second = floor.rooms.first(where: { $0.id == secondRoomID }) else { throw invalid("Choose two distinct rooms") }
        let common = Set(first.boundary.map(\.wallID)).intersection(second.boundary.map(\.wallID))
        guard !common.isEmpty else { throw invalid("Only rooms with an explicitly shared partition can merge") }
        guard !floor.rooms.filter({ $0.id != firstRoomID && $0.id != secondRoomID }).contains(where: { !common.isDisjoint(with: $0.boundary.map(\.wallID)) }) else {
            throw invalid("A shared partition belongs to another room")
        }
        let outer = (first.boundary + second.boundary).filter { !common.contains($0.wallID) }
        guard Set(outer.map(\.wallID)).count == outer.count else { throw invalid("The outside boundary is ambiguous") }
        let boundary = try RoomBoundaryBuilder.closedBoundary(wallIDs: outer.map(\.wallID), floor: floor)
        let merged = Room(id: first.id, label: first.label, boundary: boundary)
        let mergedPolygon = try Geometry.boundary(room: merged, floor: floor)
        let firstPolygon = try Geometry.boundary(room: first, floor: floor), secondPolygon = try Geometry.boundary(room: second, floor: floor)
        let expectedArea = abs(Geometry.signedArea(firstPolygon)) + abs(Geometry.signedArea(secondPolygon))
        guard Geometry.isSimplePolygon(mergedPolygon),
              abs(abs(Geometry.signedArea(mergedPolygon)) - expectedArea) <= max(Geometry.epsilon, expectedArea * 1e-9) else {
            throw invalid("Merge would overlap rooms, create a hole, or change the outer boundary")
        }
        let openings = floor.openings.filter { common.contains($0.wallID) }.map(\.id)
        floor.rooms = floor.rooms.filter { $0.id != first.id && $0.id != second.id } + [merged]
        floor.walls.removeAll { common.contains($0.id) }; floor.openings.removeAll { common.contains($0.wallID) }
        return (common.sorted(), openings)
    }
}
