import Foundation

/// Affine local-to-world matrix, in the same column-major order as simd_float4x4.
/// No translation-only shortcut or axis-aligned replacement is permitted.
public struct SurfaceTransform: Codable, Equatable, Sendable {
    public var columnMajor: [Double]
    public init(columnMajor: [Double]) { self.columnMajor = columnMajor }
    public static let identity = SurfaceTransform(columnMajor: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
    public func transformed(_ point: Point3) throws -> Point3 {
        let m = columnMajor
        guard m.count == 16, m.allSatisfy(\.isFinite),
              abs(m[3]) <= Geometry.epsilon, abs(m[7]) <= Geometry.epsilon,
              abs(m[11]) <= Geometry.epsilon, abs(m[15] - 1) <= Geometry.epsilon,
              [point.x, point.y, point.z].allSatisfy(\.isFinite) else {
            throw SpatialError.invalid([.init("invalid_transform", "transform", "Expected a finite affine 4 by 4 matrix and finite local corner")])
        }
        let p = Point3(x: m[0]*point.x + m[4]*point.y + m[8]*point.z + m[12],
                       y: m[1]*point.x + m[5]*point.y + m[9]*point.z + m[13],
                       z: m[2]*point.x + m[6]*point.y + m[10]*point.z + m[14])
        guard [p.x, p.y, p.z].allSatisfy({ $0.isFinite && abs($0) <= 10000 }) else {
            throw SpatialError.invalid([.init("transformed_bounds", "transform", "Transformed corner exceeds the finite coordinate safety envelope")])
        }
        return p
    }
}

public enum CapturedSurfaceKind: String, Codable, Sendable { case wall, door, window, passage, floor }

/// SDK-independent source record. Corners are ordered in surface-local space.
/// The native adapter preserves Apple archives before calling this boundary.
/// A curve without an approved tessellation is retained and explicitly unresolved.
public struct CapturedSurface: Codable, Equatable, Sendable {
    public var id: String
    public var kind: CapturedSurfaceKind
    public var transform: SurfaceTransform
    public var localCorners: [Point3]
    public var parentWallID: String?
    public var classificationConfidence: Confidence
    public var isCurved: Bool
    public var unsupportedReason: String?
    public init(id: String, kind: CapturedSurfaceKind, transform: SurfaceTransform, localCorners: [Point3],
                parentWallID: String? = nil, classificationConfidence: Confidence = .unknown,
                isCurved: Bool = false, unsupportedReason: String? = nil) {
        self.id = id; self.kind = kind; self.transform = transform; self.localCorners = localCorners
        self.parentWallID = parentWallID; self.classificationConfidence = classificationConfidence
        self.isCurved = isCurved; self.unsupportedReason = unsupportedReason
    }
}

/// Wall IDs are unordered. Only an unambiguous closed cycle becomes a Room.
public struct CapturedRoomBoundary: Codable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var wallIDs: [String]
    public init(id: String, label: String, wallIDs: [String]) { self.id = id; self.label = label; self.wallIDs = wallIDs }
}

/// Every surface in one input must already share this verified frame. This API
/// does not align captures, infer relocalization, or merge independent sessions.
public struct SurfaceCapture: Codable, Equatable, Sendable {
    public var documentID: String
    public var title: String
    public var floorID: String
    public var floorLabel: String
    public var floorElevation: Double
    public var frameID: String
    public var sourceArchiveID: String
    public var sdkVersion: String
    public var surfaces: [CapturedSurface]
    public var rooms: [CapturedRoomBoundary]
    public init(documentID: String, title: String, floorID: String, floorLabel: String, floorElevation: Double = 0,
                frameID: String, sourceArchiveID: String, sdkVersion: String, surfaces: [CapturedSurface],
                rooms: [CapturedRoomBoundary] = []) {
        self.documentID = documentID; self.title = title; self.floorID = floorID; self.floorLabel = floorLabel
        self.floorElevation = floorElevation; self.frameID = frameID; self.sourceArchiveID = sourceArchiveID
        self.sdkVersion = sdkVersion; self.surfaces = surfaces; self.rooms = rooms
    }
}

public struct GeometryReviewIssue: Codable, Equatable, Sendable {
    public var code: String
    public var floorID: String
    public var objectIDs: [String]
    public var message: String
    public init(code: String, floorID: String, objectIDs: [String], message: String) {
        self.code = code; self.floorID = floorID; self.objectIDs = objectIDs; self.message = message
    }
}

public struct PreservedSurface: Codable, Equatable, Sendable {
    public var input: CapturedSurface
    public var worldCorners: [Point3]
}

/// Persist next to the normalized draft. Unsupported geometry is retained here,
/// and remains a review issue; omission from the drawable graph is never a claim
/// that the captured area is complete. sourceArchiveID references protected raw
/// Apple bytes, rather than replacing those bytes with this interpretation.
public struct NormalizationReport: Codable, Equatable, Sendable {
    public var normalizerVersion: String
    public var frameID: String
    public var sourceArchiveID: String
    public var sdkVersion: String
    public var exactEndpointTolerance: Double
    public var proposedEndpointTolerance: Double
    public var surfaces: [PreservedSurface]
    public var sourceRooms: [CapturedRoomBoundary]
    public var issues: [GeometryReviewIssue]
    public var mappings: [GeometryIDMapping]
}

public struct NormalizationResult: Codable, Equatable, Sendable {
    public var document: SpatialDocument
    public var report: NormalizationReport
}

public enum SurfaceNormalizer {
    public static let version = "1.0.0"
    /// These are algorithm tolerances, not measurement accuracy statements.
    public static let exactEndpointTolerance = Geometry.epsilon
    public static let proposedEndpointTolerance = 0.03

    public static func normalize(_ capture: SurfaceCapture) throws -> NormalizationResult {
        try validateInput(capture)
        let surfaces = try capture.surfaces.sorted { $0.id < $1.id }.map { surface in
            PreservedSurface(input: surface, worldCorners: try surface.localCorners.map(surface.transform.transformed))
        }
        var floor = Floor(id: capture.floorID, label: capture.floorLabel, elevation: capture.floorElevation,
                          nodes: [], walls: [], openings: [], rooms: [])
        var issues: [GeometryReviewIssue] = [], mappings: [GeometryIDMapping] = []
        var wallIDs: [String: String] = [:]
        var canonicalWallIndices: [String: Int] = [:]
        var wallRectangles: [String: VerticalRectangle] = [:]
        var exactWalls: [ExactWallKey: [Int]] = [:]
        var nodeIndex = EndpointIndex(cellSize: exactEndpointTolerance)
        func issue(_ code: String, _ ids: [String], _ message: String) -> GeometryReviewIssue {
            .init(code: code, floorID: floor.id, objectIDs: ids, message: message)
        }
        for source in surfaces where source.input.kind == .wall {
            if source.input.isCurved || source.input.unsupportedReason != nil {
                issues.append(issue("unsupported_surface", [source.input.id], source.input.unsupportedReason ?? "Curved wall retained in the source record; review its path before use")); continue
            }
            guard let rectangle = verticalRectangle(source.worldCorners) else {
                issues.append(issue("nonuniform_surface", [source.input.id], "Wall profile is not a vertical constant-height rectangle; full transformed corners are retained for review")); continue
            }
            let baseY = rectangle.bottom - capture.floorElevation
            guard abs(baseY) <= 100, rectangle.height <= 100 else {
                issues.append(issue("surface_height_bounds", [source.input.id], "Wall base or height exceeds the canonical graph envelope")); continue
            }
            let aIndex: Int
            if let existing = nodeIndex.findIndex(rectangle.a, nodes: floor.nodes) { aIndex = existing }
            else {
                aIndex = floor.nodes.count; floor.nodes.append(.init(id: "n_" + source.input.id + "_a", point: rectangle.a))
                nodeIndex.insert(rectangle.a, index: aIndex)
            }
            let bIndex: Int
            if let existing = nodeIndex.findIndex(rectangle.b, nodes: floor.nodes) { bIndex = existing }
            else {
                bIndex = floor.nodes.count; floor.nodes.append(.init(id: "n_" + source.input.id + "_b", point: rectangle.b))
                nodeIndex.insert(rectangle.b, index: bIndex)
            }
            let aID = floor.nodes[aIndex].id, bID = floor.nodes[bIndex].id
            let endpoints = [aID, bID].sorted()
            let key = ExactWallKey(first: endpoints[0], second: endpoints[1], base: Int64(floorValue(baseY / Geometry.epsilon)),
                                   height: Int64(floorValue(rectangle.height / Geometry.epsilon)))
            // Index exact endpoint/profile matches instead of rebuilding every
            // wall path for every input surface. Nearby/partial overlaps remain
            // separate candidates, never an automatic geometry merge.
            var duplicates: [Int] = []
            for db in -1...1 { for dh in -1...1 {
                let nearby = ExactWallKey(first: key.first, second: key.second, base: key.base + Int64(db), height: key.height + Int64(dh))
                duplicates.append(contentsOf: exactWalls[nearby] ?? [])
            } }
            if let wi = duplicates.sorted().first(where: {
                abs(floor.walls[$0].baseY - baseY) <= Geometry.epsilon && abs(floor.walls[$0].height - rectangle.height) <= Geometry.epsilon
            }) {
                let retainedID = floor.walls[wi].id
                floor.walls[wi].provenance.sourceIDs.append(source.input.id)
                wallIDs[source.input.id] = retainedID
                mappings.append(.init(floorID: floor.id, objectKind: "wall", sourceID: source.input.id, resultingIDs: [retainedID])); continue
            }
            canonicalWallIndices[source.input.id] = floor.walls.count
            exactWalls[key, default: []].append(floor.walls.count)
            wallRectangles[source.input.id] = .init(a: floor.nodes[aIndex].point, b: floor.nodes[bIndex].point,
                                                    bottom: rectangle.bottom, height: rectangle.height)
            floor.walls.append(.init(id: source.input.id, nodeIDs: [aID, bID], baseY: baseY, height: rectangle.height,
                                     heightBasis: .captured, provenance: .init(origin: .captured, sourceIDs: [source.input.id],
                                     classificationConfidence: source.input.classificationConfidence)))
            wallIDs[source.input.id] = source.input.id
        }
        for source in surfaces where source.input.kind == .door || source.input.kind == .window || source.input.kind == .passage {
            guard !source.input.isCurved, source.input.unsupportedReason == nil, let rectangle = verticalRectangle(source.worldCorners) else {
                issues.append(issue("unsupported_opening", [source.input.id], "Opening has a nonrectangular or unsupported profile; its original transformed corners are retained")); continue
            }
            let candidates: [Wall]
            if let parent = source.input.parentWallID {
                guard let mapped = wallIDs[parent], let wi = canonicalWallIndices[mapped] else {
                    issues.append(issue("missing_opening_parent", [source.input.id, parent], "Source opening parent is unavailable; select a host explicitly")); continue
                }
                candidates = [floor.walls[wi]]
            } else { candidates = floor.walls }
            let fits = candidates.compactMap { wall in
                wallRectangles[wall.id].flatMap { fit(rectangle, to: wall, host: $0, elevation: floor.elevation) }
            }
            guard fits.count == 1, let matched = fits.first else {
                issues.append(issue(fits.isEmpty ? "unresolved_opening_host" : "ambiguous_opening_host", [source.input.id] + candidates.map(\.id),
                                    fits.isEmpty ? "Opening does not fit an exact supported host; source geometry is retained for review" : "More than one wall can host this opening; choose the host explicitly")); continue
            }
            let kind: OpeningKind = source.input.kind == .door ? .door : source.input.kind == .window ? .window : .passage
            let opening = Opening(id: source.input.id, wallID: matched.wallID, kind: kind, offset: matched.offset,
                                  width: matched.width, bottom: matched.bottom, height: rectangle.height,
                                  provenance: .init(origin: .captured, sourceIDs: [source.input.id], classificationConfidence: source.input.classificationConfidence))
            if let oi = floor.openings.firstIndex(where: { existing in
                existing.wallID == opening.wallID && existing.kind == opening.kind &&
                abs(existing.offset - opening.offset) <= Geometry.epsilon && abs(existing.width - opening.width) <= Geometry.epsilon &&
                abs(existing.bottom - opening.bottom) <= Geometry.epsilon && abs(existing.height - opening.height) <= Geometry.epsilon
            }) {
                floor.openings[oi].provenance.sourceIDs.append(source.input.id)
                mappings.append(.init(floorID: floor.id, objectKind: "opening", sourceID: source.input.id, resultingIDs: [floor.openings[oi].id])); continue
            }
            let overlaps = floor.openings.filter { other in
                other.wallID == opening.wallID && min(other.offset + other.width, opening.offset + opening.width) - max(other.offset, opening.offset) > Geometry.epsilon &&
                min(other.bottom + other.height, opening.bottom + opening.height) - max(other.bottom, opening.bottom) > Geometry.epsilon
            }
            guard overlaps.isEmpty else {
                issues.append(issue("overlapping_source_opening", [source.input.id] + overlaps.map(\.id), "Overlapping source openings need review; this opening was retained outside the drawable graph")); continue
            }
            floor.openings.append(opening)
        }
        for room in capture.rooms.sorted(by: { $0.id < $1.id }) {
            let resolved = room.wallIDs.compactMap { wallIDs[$0] }
            guard resolved.count == room.wallIDs.count, let boundary = orderedBoundary(wallIDs: Array(Set(resolved)), floor: floor) else {
                issues.append(issue("incomplete_room_boundary", [room.id] + room.wallIDs, "Room boundary is incomplete or ambiguous; no inferred closure or floor fill was added")); continue
            }
            floor.rooms.append(.init(id: room.id, label: room.label, boundary: boundary))
            let candidate = SpatialDocument(documentID: capture.documentID, title: capture.title, floors: [floor])
            let problems = Validator.validate(candidate)
            if !problems.isEmpty {
                floor.rooms.removeLast()
                issues.append(issue("invalid_source_room", [room.id] + room.wallIDs, "Room was retained for review: " + problems.map(\.message).joined(separator: "; ")))
            }
        }
        for source in surfaces where source.input.kind == .floor {
            let points = source.worldCorners.map { Point2(x: $0.x, z: $0.z) }
            let ys = source.worldCorners.map(\.y)
            if source.input.isCurved || source.input.unsupportedReason != nil || !Geometry.isSimplePolygon(points) ||
               (ys.max() ?? 0) - (ys.min() ?? 0) > Geometry.epsilon {
                issues.append(issue("unsupported_floor_surface", [source.input.id], "Nonplanar or invalid floor surface is retained for review; it was not replaced by a hull"))
            }
        }
        issues.append(contentsOf: GeometryDiagnostics.inspect(floor: floor))
        issues.append(contentsOf: endpointProposals(floor: floor))
        let document = SpatialDocument(documentID: capture.documentID, title: capture.title, floors: [floor])
        try Validator.requireValid(document)
        let report = NormalizationReport(normalizerVersion: version, frameID: capture.frameID, sourceArchiveID: capture.sourceArchiveID,
                                         sdkVersion: capture.sdkVersion, exactEndpointTolerance: exactEndpointTolerance,
                                         proposedEndpointTolerance: proposedEndpointTolerance, surfaces: surfaces,
                                         sourceRooms: capture.rooms, issues: issues, mappings: mappings)
        return .init(document: document, report: report)
    }
}

/// Derived review diagnostics are not persisted geometry or fabricated quality
/// scores. They remain useful after manual edits and jump to stable object IDs.
public enum GeometryDiagnostics {
    public static func inspect(document: SpatialDocument) -> [GeometryReviewIssue] { document.floors.flatMap { inspect(floor: $0) } }
    public static func inspect(floor: Floor) -> [GeometryReviewIssue] {
        var result: [GeometryReviewIssue] = []
        var endpoints: [String: [String]] = [:]
        for wall in floor.walls where wall.nodeIDs.count >= 2 {
            for pair in zip(wall.nodeIDs, wall.nodeIDs.dropFirst()) {
                endpoints[pair.0, default: []].append(wall.id)
                endpoints[pair.1, default: []].append(wall.id)
            }
        }
        for nodeID in endpoints.keys.sorted() where endpoints[nodeID]!.count == 1 {
            result.append(.init(code: "open_endpoint", floorID: floor.id, objectIDs: [nodeID] + endpoints[nodeID]!,
                                message: "This wall endpoint is disconnected; review the incomplete area"))
        }
        let assigned = Set(floor.rooms.flatMap { $0.boundary.map(\.wallID) })
        let unassigned = floor.walls.map(\.id).filter { !assigned.contains($0) }.sorted()
        if !unassigned.isEmpty {
            result.append(.init(code: "walls_without_room_boundary", floorID: floor.id, objectIDs: unassigned,
                                message: "These walls are not part of an accepted closed room boundary"))
        }
        if floor.walls.isEmpty {
            result.append(.init(code: "no_supported_walls", floorID: floor.id, objectIDs: [], message: "No supported wall geometry is available; review the retained source capture"))
        }
        return result
    }
}

private func validateInput(_ capture: SurfaceCapture) throws {
    guard [capture.documentID, capture.floorID, capture.frameID, capture.sourceArchiveID].allSatisfy(Validator.validID),
          capture.floorElevation.isFinite, abs(capture.floorElevation) <= 10000,
          !capture.sdkVersion.isEmpty, capture.sdkVersion.utf8.count <= 128 else {
        throw SpatialError.invalid([.init("capture_metadata", "capture", "Invalid capture identity, frame, SDK or elevation")])
    }
    guard capture.surfaces.count <= 50000, capture.rooms.count <= 10000,
          capture.surfaces.reduce(0, { $0 + min($1.localCorners.count, 1001) }) <= 200000 else { throw SpatialError.tooLarge }
    guard Set(capture.surfaces.map(\.id)).count == capture.surfaces.count, Set(capture.rooms.map(\.id)).count == capture.rooms.count else {
        throw SpatialError.invalid([.init("duplicate_source_id", "capture", "Source identifiers must be unique within each collection")])
    }
    for surface in capture.surfaces {
        guard Validator.validID(surface.id), surface.id.utf8.count <= 80,
              surface.parentWallID.map(Validator.validID) ?? true,
              surface.localCorners.count >= 3, surface.localCorners.count <= 1000,
              surface.localCorners.allSatisfy({ p in [p.x,p.y,p.z].allSatisfy({ $0.isFinite && abs($0) <= 10000 }) }),
              (surface.unsupportedReason?.utf8.count ?? 0) <= 1024 else {
            throw SpatialError.invalid([.init("capture_surface", surface.id, "Invalid source identifier, corners, parent or profile metadata")])
        }
        // Validate even a matrix whose input corners happen to mask bad values.
        _ = try surface.transform.transformed(.init(x: 0, y: 0, z: 0))
    }
    for room in capture.rooms {
        guard Validator.validID(room.id), room.id.utf8.count <= 80, room.wallIDs.count <= 1000,
              room.wallIDs.allSatisfy(Validator.validID), Set(room.wallIDs).count == room.wallIDs.count,
              !room.label.isEmpty, room.label.unicodeScalars.count <= 256 else {
            throw SpatialError.invalid([.init("capture_room", room.id, "Invalid source room metadata")])
        }
    }
}

private struct VerticalRectangle {
    var a: Point2
    var b: Point2
    var bottom: Double
    var height: Double
}

private func verticalRectangle(_ corners: [Point3]) -> VerticalRectangle? {
    guard corners.count == 4 else { return nil }
    let low = corners.map(\.y).min()!, high = corners.map(\.y).max()!
    guard high - low > Geometry.epsilon else { return nil }
    let a = Point2(x: corners[0].x, z: corners[0].z)
    guard let b = corners.map({ Point2(x: $0.x, z: $0.z) }).first(where: { $0.distance(to: a) > Geometry.epsilon }) else { return nil }
    var combinations: Set<Int> = []
    var encoded: [Int] = []
    for p in corners {
        let horizontal = Point2(x: p.x, z: p.z), endpoint: Int, vertical: Int
        if horizontal.distance(to: a) <= Geometry.epsilon { endpoint = 0 }
        else if horizontal.distance(to: b) <= Geometry.epsilon { endpoint = 1 }
        else { return nil }
        if abs(p.y - low) <= Geometry.epsilon { vertical = 0 }
        else if abs(p.y - high) <= Geometry.epsilon { vertical = 2 }
        else { return nil }
        combinations.insert(endpoint + vertical); encoded.append(endpoint + vertical)
    }
    guard combinations.count == 4 else { return nil }
    // An ordered polygon must traverse edges, not two diagonals of a bowtie.
    for i in encoded.indices {
        let xor = encoded[i] ^ encoded[(i + 1) % encoded.count]
        if xor != 1 && xor != 2 { return nil }
    }
    return .init(a: a, b: b, bottom: low, height: high - low)
}

private struct OpeningFit {
    var wallID: String
    var offset: Double
    var width: Double
    var bottom: Double
}

private func fit(_ rectangle: VerticalRectangle, to wall: Wall, host: VerticalRectangle, elevation: Double) -> OpeningFit? {
    let a = host.a, b = host.b, length = a.distance(to: b)
    guard length > Geometry.epsilon,
          abs(Geometry.cross(a,b,rectangle.a)) / length <= Geometry.epsilon,
          abs(Geometry.cross(a,b,rectangle.b)) / length <= Geometry.epsilon else { return nil }
    func offset(_ p: Point2) -> Double { ((p.x - a.x)*(b.x - a.x) + (p.z - a.z)*(b.z - a.z)) / length }
    var start = min(offset(rectangle.a), offset(rectangle.b))
    let end = max(offset(rectangle.a), offset(rectangle.b))
    var bottom = rectangle.bottom - elevation - wall.baseY
    if abs(start) <= Geometry.epsilon { start = 0 }
    if abs(bottom) <= Geometry.epsilon { bottom = 0 }
    guard start >= 0, end <= length + Geometry.epsilon, end - start > Geometry.epsilon,
          bottom >= 0, bottom + rectangle.height <= wall.height + Geometry.epsilon else { return nil }
    return .init(wallID: wall.id, offset: start, width: end - start, bottom: bottom)
}

public enum RoomBoundaryBuilder {
    /// Orders exactly the selected observed walls. Rejects gaps, forks,
    /// duplicate/missing IDs, self intersections and multiple disconnected rings.
    public static func closedBoundary(wallIDs: [String], floor: Floor) throws -> [WallReference] {
        guard wallIDs.count <= 1000, Set(wallIDs).count == wallIDs.count,
              let boundary = orderedBoundary(wallIDs: wallIDs, floor: floor) else {
            throw SpatialError.invalid([.init("incomplete_room_boundary", floor.id,
                "Select one unambiguous closed ring of connected walls")])
        }
        return boundary
    }
}

private func orderedBoundary(wallIDs: [String], floor: Floor) -> [WallReference]? {
    guard wallIDs.count >= 3 else { return nil }
    let walls = Dictionary(floor.walls.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    var incidents: [String: [String]] = [:]
    for id in wallIDs {
        guard let wall = walls[id], let first = wall.nodeIDs.first, let last = wall.nodeIDs.last else { return nil }
        incidents[first, default: []].append(id); incidents[last, default: []].append(id)
    }
    guard incidents.values.allSatisfy({ $0.count == 2 }), let startID = wallIDs.sorted().first, let startWall = walls[startID] else { return nil }
    var boundary: [WallReference] = [.init(wallID: startID)]
    var used: Set<String> = [startID], end = startWall.nodeIDs.last!
    while used.count < wallIDs.count {
        guard let nextID = incidents[end]?.first(where: { !used.contains($0) }), let nextWall = walls[nextID] else { return nil }
        let reverse = nextWall.nodeIDs.last == end
        boundary.append(.init(wallID: nextID, reversed: reverse)); used.insert(nextID)
        end = reverse ? nextWall.nodeIDs.first! : nextWall.nodeIDs.last!
    }
    guard end == startWall.nodeIDs.first else { return nil }
    let temporary = Room(id: "boundary-check", label: "Boundary", boundary: boundary)
    guard let points = try? Geometry.boundary(room: temporary, floor: floor), Geometry.isSimplePolygon(points) else { return nil }
    if Geometry.signedArea(points) < 0 { boundary = boundary.reversed().map { .init(wallID: $0.wallID, reversed: !$0.reversed) } }
    return boundary
}

// Avoid Foundation.floor's name being hidden by a local Floor value.
private func floorValue(_ value: Double) -> Double { floor(value) }
private struct ExactWallKey: Hashable { var first: String; var second: String; var base: Int64; var height: Int64 }

private struct GridCell: Hashable { var x: Int64; var z: Int64 }
private struct EndpointIndex {
    var cellSize: Double
    var cells: [GridCell: [Int]] = [:]
    func cell(_ point: Point2) -> GridCell { .init(x: Int64(floor(point.x / cellSize)), z: Int64(floor(point.z / cellSize))) }
    mutating func insert(_ point: Point2, index: Int) { cells[cell(point), default: []].append(index) }
    func nearbyIndices(_ point: Point2) -> [Int] {
        let c = cell(point)
        return (-1...1).flatMap { x in (-1...1).flatMap { z in cells[.init(x: c.x + Int64(x), z: c.z + Int64(z))] ?? [] } }
    }
    func findIndex(_ point: Point2, nodes: [Node]) -> Int? {
        nearbyIndices(point).filter { nodes[$0].point.distance(to: point) <= cellSize }.sorted { nodes[$0].id < nodes[$1].id }.first
    }
}

private func endpointProposals(floor: Floor) -> [GeometryReviewIssue] {
    var index = EndpointIndex(cellSize: SurfaceNormalizer.proposedEndpointTolerance), issues: [GeometryReviewIssue] = []
    for (i, node) in floor.nodes.enumerated() {
        for prior in index.nearbyIndices(node.point) where floor.nodes[prior].point.distance(to: node.point) <= SurfaceNormalizer.proposedEndpointTolerance {
            if issues.count == 10000 {
                issues.append(.init(code: "dense_endpoint_review", floorID: floor.id, objectIDs: [],
                                    message: "More than 10000 nearby endpoint pairs require review. Geometry remains separate; inspect the dense region before connecting nodes"))
                return issues
            }
            let other = floor.nodes[prior]
            issues.append(.init(code: "proposed_endpoint_merge", floorID: floor.id, objectIDs: [other.id, node.id],
                                message: "Nearby endpoints remain separate; review before explicitly connecting them"))
        }
        index.insert(node.point, index: i)
    }
    return issues
}
