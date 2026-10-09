import Foundation

/// Commands mutate one canonical graph. Opening offsets remain absolute distances
/// along their host unless an explicit split/join changes that host's path origin.
public enum EditCommand: Codable, Equatable, Sendable {
    case moveNode(floorID: String, nodeID: String, point: Point2)
    case moveWall(floorID: String, wallID: String, translation: Point2)
    case addWall(floorID: String, wall: Wall, newNodes: [Node])
    case deleteWall(floorID: String, wallID: String)
    case splitWall(floorID: String, wallID: String, offset: Double, newWallID: String, newNodeID: String?)
    case joinWalls(floorID: String, firstWallID: String, secondWallID: String)
    case mergeNodes(floorID: String, sourceNodeID: String, targetNodeID: String)
    case disconnectNode(floorID: String, wallID: String, nodeID: String, newNodeID: String)
    case addOpening(floorID: String, opening: Opening)
    case moveOpening(floorID: String, openingID: String, offset: Double)
    case updateOpening(floorID: String, opening: Opening)
    case deleteOpening(floorID: String, openingID: String)
    case renameRoom(floorID: String, roomID: String, label: String)
    case addRoom(floorID: String, room: Room)
    case setRoomBoundary(floorID: String, roomID: String, boundary: [WallReference])
    case deleteRoom(floorID: String, roomID: String)
    case splitRoom(floorID: String, roomID: String, dividerWallID: String, newRoomID: String, newLabel: String)
    case mergeRooms(floorID: String, firstRoomID: String, secondRoomID: String)
    case setArea(floorID: String, area: SemanticArea)
    case deleteArea(floorID: String, areaID: String)
    case updateFloor(floorID: String, label: String, elevation: Double)
    case addFloor(floor: Floor)
    case deleteFloor(floorID: String)

    fileprivate var floorID: String {
        switch self {
        case .moveNode(let f, _, _), .moveWall(let f, _, _), .addWall(let f, _, _),
             .deleteWall(let f, _), .splitWall(let f, _, _, _, _), .joinWalls(let f, _, _),
             .mergeNodes(let f, _, _), .disconnectNode(let f, _, _, _), .addOpening(let f, _),
             .moveOpening(let f, _, _), .updateOpening(let f, _), .deleteOpening(let f, _),
             .renameRoom(let f, _, _), .addRoom(let f, _), .setRoomBoundary(let f, _, _),
             .deleteRoom(let f, _), .deleteFloor(let f), .splitRoom(let f, _, _, _, _),
             .mergeRooms(let f, _, _), .setArea(let f, _), .deleteArea(let f, _), .updateFloor(let f, _, _): return f
        case .addFloor(let floor): return floor.id
        }
    }
}

/// A mapping does not relocate annotations automatically. A consumer must review
/// mappings against its base geometry revision before relinking an overlay.
public struct GeometryIDMapping: Codable, Equatable, Sendable {
    public var floorID: String
    public var objectKind: String
    public var sourceID: String
    public var resultingIDs: [String]
    public var requiresOverlayReview: Bool
    public init(floorID: String, objectKind: String, sourceID: String, resultingIDs: [String]) {
        self.floorID = floorID; self.objectKind = objectKind; self.sourceID = sourceID
        self.resultingIDs = resultingIDs; self.requiresOverlayReview = true
    }
}

public struct EditReceipt: Codable, Equatable, Sendable {
    public var sourceRevision: Int
    public var resultingRevision: Int
    public var mappings: [GeometryIDMapping]
    public init(sourceRevision: Int, resultingRevision: Int, mappings: [GeometryIDMapping]) {
        self.sourceRevision = sourceRevision; self.resultingRevision = resultingRevision; self.mappings = mappings
    }
    /// Conservative lineage for durable undo/redo after reopening. Callers must
    /// validate and persist both snapshots; this method grants no publication authority.
    public static func restoring(from source: SpatialDocument, to result: SpatialDocument) -> EditReceipt {
        .init(sourceRevision: source.revision, resultingRevision: result.revision,
              mappings: restorationMappings(from: source, to: result))
    }
}

// Value-type command engine. Persist a successful snapshot and receipt in one
// transaction before showing "Saved on device". This type is not a database.
public struct EditorSession: Sendable {
    public private(set) var document: SpatialDocument
    public private(set) var lastReceipt: EditReceipt?
    private var undoStack: [SpatialDocument] = []
    private var redoStack: [SpatialDocument] = []
    public var canUndo: Bool { !undoStack.isEmpty }
    public var canRedo: Bool { !redoStack.isEmpty }
    public init(_ document: SpatialDocument) throws {
        try Validator.requireValid(document); self.document = document
    }
    public mutating func apply(_ command: EditCommand, expectedRevision: Int) throws {
        try apply([command], expectedRevision: expectedRevision)
    }
    /// Validates once after a coherent compound edit. This enables explicit room
    /// split/merge or dependency deletion without ever publishing a broken graph.
    /// A failure rolls back the graph, both history stacks, and the receipt.
    public mutating func apply(_ commands: [EditCommand], expectedRevision: Int) throws {
        try check(expectedRevision)
        guard !commands.isEmpty, commands.count <= 1000 else {
            throw editError("command_count", "commands", "Use 1 to 1000 commands per edit")
        }
        var next = document
        var mappings: [GeometryIDMapping] = []
        for command in commands {
            var commandMappings: [GeometryIDMapping] = []
            try mutate(command, document: &next, mappings: &commandMappings)
            mappings = composeMappings(mappings, through: commandMappings, source: document)
        }
        try prepare(&next)
        mappings = mappings.map { mapping in
            var final = mapping
            final.resultingIDs = mapping.resultingIDs.filter { objectExists(id: $0, kind: mapping.objectKind, floorID: mapping.floorID, in: next) }
            return final
        }
        for mapping in restorationMappings(from: document, to: next) where !mappings.contains(where: {
            $0.floorID == mapping.floorID && $0.objectKind == mapping.objectKind && $0.sourceID == mapping.sourceID
        }) { mappings.append(mapping) }
        let receipt = EditReceipt(sourceRevision: document.revision, resultingRevision: next.revision, mappings: mappings)
        undoStack.append(document); if undoStack.count > 100 { undoStack.removeFirst() }
        redoStack.removeAll(); document = next; lastReceipt = receipt
    }
    public mutating func undo(expectedRevision: Int) throws {
        try check(expectedRevision)
        guard var previous = undoStack.last else { throw SpatialError.nothingToUndo }
        try prepare(&previous)
        let receipt = EditReceipt(sourceRevision: document.revision, resultingRevision: previous.revision,
                                  mappings: restorationMappings(from: document, to: previous))
        undoStack.removeLast(); redoStack.append(document); document = previous; lastReceipt = receipt
    }
    public mutating func redo(expectedRevision: Int) throws {
        try check(expectedRevision)
        guard var next = redoStack.last else { throw SpatialError.nothingToRedo }
        try prepare(&next)
        let receipt = EditReceipt(sourceRevision: document.revision, resultingRevision: next.revision,
                                  mappings: restorationMappings(from: document, to: next))
        redoStack.removeLast(); undoStack.append(document); document = next; lastReceipt = receipt
    }
    private func check(_ expected: Int) throws {
        if document.revision != expected { throw SpatialError.staleRevision(expected: expected, actual: document.revision) }
    }
    private func prepare(_ next: inout SpatialDocument) throws {
        guard document.revision < 9_007_199_254_740_991 else { throw SpatialError.tooLarge }
        next.revision = document.revision + 1; next.parentRevision = document.revision
        next.reviewState = .needsReview
        try Validator.requireValid(next)
    }
}

private func editError(_ code: String, _ path: String, _ message: String) -> SpatialError {
    .invalid([.init(code, path, message)])
}

private func uniqueID(_ id: String, among ids: [String], path: String) throws {
    guard Validator.validID(id) else { throw editError("invalid_id", path, "Use a bounded ASCII object identifier") }
    guard !ids.contains(id) else { throw editError("duplicate_id", path, "The new identifier already exists") }
}

private func mutate(_ command: EditCommand, document: inout SpatialDocument, mappings: inout [GeometryIDMapping]) throws {
    if case .addFloor(let floor) = command {
        try uniqueID(floor.id, among: document.floors.map(\.id), path: "floors")
        document.floors.append(floor); return
    }
    let floorID = command.floorID
    guard let fi = document.floors.firstIndex(where: { $0.id == floorID }) else { throw SpatialError.missing(floorID) }
    if case .deleteFloor = command {
        document.floors.remove(at: fi)
        mappings.append(.init(floorID: floorID, objectKind: "floor", sourceID: floorID, resultingIDs: [])); return
    }
    var floor = document.floors[fi]
    func wallIndex(_ id: String) throws -> Int {
        guard let index = floor.walls.firstIndex(where: { $0.id == id }) else { throw SpatialError.missing(id) }; return index
    }
    func nodeIndex(_ id: String) throws -> Int {
        guard let index = floor.nodes.firstIndex(where: { $0.id == id }) else { throw SpatialError.missing(id) }; return index
    }
    func openingIndex(_ id: String) throws -> Int {
        guard let index = floor.openings.firstIndex(where: { $0.id == id }) else { throw SpatialError.missing(id) }; return index
    }
    func roomIndex(_ id: String) throws -> Int {
        guard let index = floor.rooms.firstIndex(where: { $0.id == id }) else { throw SpatialError.missing(id) }; return index
    }
    switch command {
    case .moveNode(_, let id, let point):
        let ni = try nodeIndex(id); floor.nodes[ni].point = point
        markEdited(nodeIDs: [id], floor: &floor)
        mappings.append(.init(floorID: floorID, objectKind: "node", sourceID: id, resultingIDs: [id]))
    case .moveWall(_, let id, let translation):
        let wi = try wallIndex(id), moving = Set(floor.walls[wi].nodeIDs)
        for ni in floor.nodes.indices where moving.contains(floor.nodes[ni].id) {
            floor.nodes[ni].point.x += translation.x; floor.nodes[ni].point.z += translation.z
        }
        markEdited(nodeIDs: moving, floor: &floor)
        mappings.append(.init(floorID: floorID, objectKind: "wall", sourceID: id, resultingIDs: [id]))
    case .addWall(_, var wall, let nodes):
        try uniqueID(wall.id, among: floor.walls.map(\.id), path: "walls")
        for node in nodes {
            try uniqueID(node.id, among: floor.nodes.map(\.id), path: "nodes"); floor.nodes.append(node)
        }
        wall.provenance.origin = .edited; floor.walls.append(wall)
    case .deleteWall(_, let id):
        let wi = try wallIndex(id)
        floor.walls.remove(at: wi)
        // Dependencies are not silently erased. Delete/update them explicitly in
        // this command batch; final validation enforces the resulting graph.
        mappings.append(.init(floorID: floorID, objectKind: "wall", sourceID: id, resultingIDs: []))
    case .splitWall(_, let id, let offset, let newWallID, let newNodeID):
        try splitWall(id: id, offset: offset, newWallID: newWallID, newNodeID: newNodeID, floor: &floor)
        mappings.append(.init(floorID: floorID, objectKind: "wall", sourceID: id, resultingIDs: [id, newWallID]))
    case .joinWalls(_, let firstID, let secondID):
        try joinWalls(firstID: firstID, secondID: secondID, floor: &floor)
        mappings.append(.init(floorID: floorID, objectKind: "wall", sourceID: firstID, resultingIDs: [firstID]))
        mappings.append(.init(floorID: floorID, objectKind: "wall", sourceID: secondID, resultingIDs: [firstID]))
    case .mergeNodes(_, let sourceID, let targetID):
        guard sourceID != targetID else { throw editError("same_node", sourceID, "Choose two different nodes") }
        let si = try nodeIndex(sourceID); _ = try nodeIndex(targetID)
        for wi in floor.walls.indices where floor.walls[wi].nodeIDs.contains(sourceID) {
            floor.walls[wi].nodeIDs = floor.walls[wi].nodeIDs.map { $0 == sourceID ? targetID : $0 }
            floor.walls[wi].provenance.origin = .edited
        }
        floor.nodes.remove(at: si)
        mappings.append(.init(floorID: floorID, objectKind: "node", sourceID: sourceID, resultingIDs: [targetID]))
    case .disconnectNode(_, let wallID, let nodeID, let newID):
        let wi = try wallIndex(wallID), ni = try nodeIndex(nodeID)
        guard floor.walls[wi].nodeIDs.contains(nodeID) else { throw editError("not_on_wall", wallID, "This node does not belong to the selected wall") }
        try uniqueID(newID, among: floor.nodes.map(\.id), path: "nodes")
        floor.nodes.append(.init(id: newID, point: floor.nodes[ni].point))
        floor.walls[wi].nodeIDs = floor.walls[wi].nodeIDs.map { $0 == nodeID ? newID : $0 }
        floor.walls[wi].provenance.origin = .edited
        mappings.append(.init(floorID: floorID, objectKind: "node", sourceID: nodeID, resultingIDs: [nodeID, newID]))
    case .addOpening(_, var opening):
        try uniqueID(opening.id, among: floor.openings.map(\.id), path: "openings")
        opening.provenance.origin = .edited; floor.openings.append(opening)
    case .moveOpening(_, let id, let offset):
        let oi = try openingIndex(id); floor.openings[oi].offset = offset; floor.openings[oi].provenance.origin = .edited
        mappings.append(.init(floorID: floorID, objectKind: "opening", sourceID: id, resultingIDs: [id]))
    case .updateOpening(_, var opening):
        let oi = try openingIndex(opening.id)
        // Retain lineage even if a caller reconstructed an opening value.
        opening.provenance.sourceIDs = Array(Set(opening.provenance.sourceIDs + floor.openings[oi].provenance.sourceIDs)).sorted()
        opening.provenance.origin = .edited; floor.openings[oi] = opening
        mappings.append(.init(floorID: floorID, objectKind: "opening", sourceID: opening.id, resultingIDs: [opening.id]))
    case .deleteOpening(_, let id):
        floor.openings.remove(at: try openingIndex(id))
        mappings.append(.init(floorID: floorID, objectKind: "opening", sourceID: id, resultingIDs: []))
    case .renameRoom(_, let id, let label): floor.rooms[try roomIndex(id)].label = label
    case .addRoom(_, let room):
        try uniqueID(room.id, among: floor.rooms.map(\.id), path: "rooms"); floor.rooms.append(room)
    case .setRoomBoundary(_, let id, let boundary):
        floor.rooms[try roomIndex(id)].boundary = boundary
        mappings.append(.init(floorID: floorID, objectKind: "room", sourceID: id, resultingIDs: [id]))
    case .deleteRoom(_, let id):
        floor.rooms.remove(at: try roomIndex(id))
        mappings.append(.init(floorID: floorID, objectKind: "room", sourceID: id, resultingIDs: []))
    case .splitRoom(_, let id, let divider, let newID, let label):
        try RoomTopology.split(roomID: id, dividerWallID: divider, newRoomID: newID, newLabel: label, floor: &floor)
        mappings.append(.init(floorID: floorID, objectKind: "room", sourceID: id, resultingIDs: [id, newID]))
    case .mergeRooms(_, let first, let second):
        let removed = try RoomTopology.merge(firstRoomID: first, secondRoomID: second, floor: &floor)
        mappings.append(.init(floorID: floorID, objectKind: "room", sourceID: second, resultingIDs: [first]))
        mappings.append(.init(floorID: floorID, objectKind: "room", sourceID: first, resultingIDs: [first]))
        for id in removed.walls { mappings.append(.init(floorID: floorID, objectKind: "wall", sourceID: id, resultingIDs: [])) }
        for id in removed.openings { mappings.append(.init(floorID: floorID, objectKind: "opening", sourceID: id, resultingIDs: [])) }
    case .setArea(_, var area):
        if let index = floor.areas.firstIndex(where: { $0.id == area.id }) {
            area.provenance.sourceIDs = Array(Set(area.provenance.sourceIDs + floor.areas[index].provenance.sourceIDs)).sorted()
            area.provenance.origin = .edited; floor.areas[index] = area
            mappings.append(.init(floorID: floorID, objectKind: "area", sourceID: area.id, resultingIDs: [area.id]))
        } else { area.provenance.origin = .edited; floor.areas.append(area) }
        document.schemaVersion = "1.1.0"
    case .deleteArea(_, let id):
        guard let index = floor.areas.firstIndex(where: { $0.id == id }) else { throw SpatialError.missing(id) }
        floor.areas.remove(at: index)
        mappings.append(.init(floorID: floorID, objectKind: "area", sourceID: id, resultingIDs: []))
    case .updateFloor(_, let label, let elevation): floor.label = label; floor.elevation = elevation
    case .addFloor, .deleteFloor: break // handled before acquiring a floor
    }
    document.floors[fi] = floor
}

private func markEdited(nodeIDs: Set<String>, floor: inout Floor) {
    for wi in floor.walls.indices where !nodeIDs.isDisjoint(with: floor.walls[wi].nodeIDs) {
        floor.walls[wi].provenance.origin = .edited
    }
}

private func splitWall(id: String, offset: Double, newWallID: String, newNodeID: String?, floor: inout Floor) throws {
    guard let wi = floor.walls.firstIndex(where: { $0.id == id }) else { throw SpatialError.missing(id) }
    try uniqueID(newWallID, among: floor.walls.map(\.id), path: "walls")
    let original = floor.walls[wi], points = try Geometry.path(wall: original, floor: floor)
    let length = Geometry.pathLength(points)
    guard offset.isFinite, offset > Geometry.epsilon, offset < length - Geometry.epsilon else {
        throw editError("split_bounds", id, "Split must lie inside the wall path")
    }
    for opening in floor.openings where opening.wallID == id {
        if opening.offset < offset - Geometry.epsilon && opening.offset + opening.width > offset + Geometry.epsilon {
            throw editError("opening_straddles_split", opening.id, "Move the split outside the opening first")
        }
    }
    var distance = 0.0, cutIndex = 0, ids = original.nodeIDs
    for i in 1..<points.count {
        let end = distance + points[i - 1].distance(to: points[i])
        if abs(offset - end) <= Geometry.epsilon {
            cutIndex = i; break
        }
        if offset < end {
            guard let newID = newNodeID else { throw editError("split_node_required", id, "Provide an identifier for the new corner") }
            try uniqueID(newID, among: floor.nodes.map(\.id), path: "nodes")
            floor.nodes.append(.init(id: newID, point: try Geometry.point(at: offset, on: points)))
            ids.insert(newID, at: i); cutIndex = i; break
        }
        distance = end
    }
    guard cutIndex > 0, cutIndex < ids.count - 1 else { throw editError("split_bounds", id, "Could not locate an interior split") }
    var left = original, right = original
    left.nodeIDs = Array(ids[...cutIndex]); right.nodeIDs = Array(ids[cutIndex...]); right.id = newWallID
    left.provenance.origin = .edited; right.provenance.origin = .edited
    floor.walls[wi] = left; floor.walls.insert(right, at: wi + 1)
    for oi in floor.openings.indices where floor.openings[oi].wallID == id {
        if floor.openings[oi].offset >= offset - Geometry.epsilon {
            floor.openings[oi].wallID = newWallID; floor.openings[oi].offset -= offset
            // Only round floating point noise at the exact split, never clamp an
            // out-of-bounds opening after a geometry edit.
            if abs(floor.openings[oi].offset) <= Geometry.epsilon { floor.openings[oi].offset = 0 }
        }
    }
    for ri in floor.rooms.indices {
        floor.rooms[ri].boundary = floor.rooms[ri].boundary.flatMap { ref in
            guard ref.wallID == id else { return [ref] }
            return ref.reversed ? [.init(wallID: newWallID, reversed: true), .init(wallID: id, reversed: true)] :
                                  [.init(wallID: id), .init(wallID: newWallID)]
        }
    }
}

private func joinWalls(firstID: String, secondID: String, floor: inout Floor) throws {
    guard firstID != secondID else { throw editError("same_wall", firstID, "Choose two different walls") }
    guard let ai = floor.walls.firstIndex(where: { $0.id == firstID }),
          let bi = floor.walls.firstIndex(where: { $0.id == secondID }) else { throw SpatialError.missing("join walls") }
    let a = floor.walls[ai], b = floor.walls[bi]
    guard abs(a.baseY - b.baseY) <= Geometry.epsilon, abs(a.height - b.height) <= Geometry.epsilon else {
        throw editError("incompatible_wall_profile", firstID, "Joined walls must have the same base and height")
    }
    guard Set(a.nodeIDs).intersection(b.nodeIDs).count == 1 else {
        throw editError("join_topology", firstID, "Joined walls must share exactly one endpoint")
    }
    let aLength = Geometry.pathLength(try Geometry.path(wall: a, floor: floor))
    let bLength = Geometry.pathLength(try Geometry.path(wall: b, floor: floor))
    let bReversed: Bool, bFirst: Bool
    if a.nodeIDs.last == b.nodeIDs.first { bReversed = false; bFirst = false }
    else if a.nodeIDs.last == b.nodeIDs.last { bReversed = true; bFirst = false }
    else if a.nodeIDs.first == b.nodeIDs.last { bReversed = false; bFirst = true }
    else if a.nodeIDs.first == b.nodeIDs.first { bReversed = true; bFirst = true }
    else { throw editError("join_topology", firstID, "The shared node must be an endpoint on both walls") }
    let orientedB = bReversed ? Array(b.nodeIDs.reversed()) : b.nodeIDs
    var joined = a
    joined.nodeIDs = bFirst ? orientedB + a.nodeIDs.dropFirst() : a.nodeIDs + orientedB.dropFirst()
    joined.provenance.origin = .edited
    // A merged wall cannot inherit the stronger confidence/basis of only one
    // source. Mixed height bases remain assumed until explicitly reviewed.
    if a.heightBasis != b.heightBasis { joined.heightBasis = .assumed }
    let confidenceRank: [Confidence] = [.unknown, .low, .medium, .high]
    joined.provenance.classificationConfidence = confidenceRank[min(
        confidenceRank.firstIndex(of: a.provenance.classificationConfidence)!,
        confidenceRank.firstIndex(of: b.provenance.classificationConfidence)!)]
    joined.provenance.sourceIDs = Array(Set(a.provenance.sourceIDs + b.provenance.sourceIDs)).sorted()
    let forward = bFirst ? [WallReference(wallID: secondID, reversed: bReversed), .init(wallID: firstID)] :
                           [WallReference(wallID: firstID), .init(wallID: secondID, reversed: bReversed)]
    let reverse = forward.reversed().map { WallReference(wallID: $0.wallID, reversed: !$0.reversed) }
    for ri in floor.rooms.indices {
        let boundary = floor.rooms[ri].boundary
        let uses = boundary.filter { $0.wallID == firstID || $0.wallID == secondID }
        if uses.isEmpty { continue }
        guard uses.count == 2 else {
            throw editError("join_room_boundary", floor.rooms[ri].id, "Joining would change a room boundary; edit its boundary explicitly first")
        }
        var replacement: [WallReference]?
        for start in boundary.indices {
            let pair = [boundary[start], boundary[(start + 1) % boundary.count]]
            if pair == forward || pair == reverse {
                let rotated = Array(boundary[start...]) + Array(boundary[..<start])
                replacement = [.init(wallID: firstID, reversed: pair == reverse)] + Array(rotated.dropFirst(2)); break
            }
        }
        guard let replacement else { throw editError("join_room_boundary", floor.rooms[ri].id, "Walls must be consecutive in each affected room") }
        floor.rooms[ri].boundary = replacement
    }
    for oi in floor.openings.indices {
        if floor.openings[oi].wallID == firstID {
            if bFirst { floor.openings[oi].offset += bLength }
        } else if floor.openings[oi].wallID == secondID {
            if bReversed { floor.openings[oi].offset = bLength - floor.openings[oi].offset - floor.openings[oi].width }
            if !bFirst { floor.openings[oi].offset += aLength }
            floor.openings[oi].wallID = firstID
        }
    }
    floor.walls[ai] = joined; floor.walls.remove(at: bi)
}

private func objectExists(id: String, kind: String, floorID: String, in document: SpatialDocument) -> Bool {
    guard let floor = document.floors.first(where: { $0.id == floorID }) else { return false }
    switch kind {
    case "floor": return floor.id == id
    case "node": return floor.nodes.contains { $0.id == id }
    case "wall": return floor.walls.contains { $0.id == id }
    case "opening": return floor.openings.contains { $0.id == id }
    case "room": return floor.rooms.contains { $0.id == id }
    case "area": return floor.areas.contains { $0.id == id }
    default: return false
    }
}

/// A compound edit maps original identities directly to the final graph. IDs
/// that existed only between commands must never escape as annotation targets.
private func composeMappings(_ accumulated: [GeometryIDMapping], through changes: [GeometryIDMapping], source: SpatialDocument) -> [GeometryIDMapping] {
    var result = accumulated.map { prior in
        var next = prior
        let replacements = prior.resultingIDs.flatMap { id in
            changes.first(where: { $0.floorID == prior.floorID && $0.objectKind == prior.objectKind && $0.sourceID == id })?.resultingIDs ?? [id]
        }
        var seen: Set<String> = []
        next.resultingIDs = replacements.filter { seen.insert($0).inserted }
        return next
    }
    for change in changes where objectExists(id: change.sourceID, kind: change.objectKind, floorID: change.floorID, in: source) {
        if !result.contains(where: { $0.floorID == change.floorID && $0.objectKind == change.objectKind && $0.sourceID == change.sourceID }) {
            result.append(change)
        }
    }
    return result
}

private func restorationMappings(from: SpatialDocument, to: SpatialDocument) -> [GeometryIDMapping] {
    var result: [GeometryIDMapping] = []
    for floor in from.floors {
        guard let next = to.floors.first(where: { $0.id == floor.id }) else {
            result.append(.init(floorID: floor.id, objectKind: "floor", sourceID: floor.id, resultingIDs: [])); continue
        }
        let movedFloor = floor.elevation != next.elevation
        if movedFloor || floor.label != next.label {
            result.append(.init(floorID: floor.id, objectKind: "floor", sourceID: floor.id, resultingIDs: [floor.id]))
        }
        let changedNodes = Set(floor.nodes.filter { node in next.nodes.first(where: { $0.id == node.id }) != node }.map(\.id))
        for node in floor.nodes where changedNodes.contains(node.id) {
            result.append(.init(floorID: floor.id, objectKind: "node", sourceID: node.id,
                                resultingIDs: next.nodes.contains(where: { $0.id == node.id }) ? [node.id] : []))
        }
        let changedWalls = Set(floor.walls.filter { wall in
            movedFloor || next.walls.first(where: { $0.id == wall.id }) != wall || !changedNodes.isDisjoint(with: wall.nodeIDs)
        }.map(\.id))
        for wall in floor.walls where changedWalls.contains(wall.id) {
            result.append(.init(floorID: floor.id, objectKind: "wall", sourceID: wall.id,
                                resultingIDs: next.walls.contains(where: { $0.id == wall.id }) ? [wall.id] : []))
        }
        for opening in floor.openings where next.openings.first(where: { $0.id == opening.id }) != opening || changedWalls.contains(opening.wallID) {
            result.append(.init(floorID: floor.id, objectKind: "opening", sourceID: opening.id,
                                resultingIDs: next.openings.contains(where: { $0.id == opening.id }) ? [opening.id] : []))
        }
        for room in floor.rooms where next.rooms.first(where: { $0.id == room.id }) != room || !changedWalls.isDisjoint(with: room.boundary.map(\.wallID)) {
            result.append(.init(floorID: floor.id, objectKind: "room", sourceID: room.id,
                                resultingIDs: next.rooms.contains(where: { $0.id == room.id }) ? [room.id] : []))
        }
        for area in floor.areas where movedFloor || next.areas.first(where: { $0.id == area.id }) != area {
            result.append(.init(floorID: floor.id, objectKind: "area", sourceID: area.id,
                                resultingIDs: next.areas.contains(where: { $0.id == area.id }) ? [area.id] : []))
        }
    }
    return result
}
