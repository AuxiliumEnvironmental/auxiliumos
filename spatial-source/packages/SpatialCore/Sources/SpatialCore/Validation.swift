import Foundation

public enum Validator {
    public static func validID(_ id: String) -> Bool {
        !id.isEmpty && id.utf8.count <= 96 && id.utf8.allSatisfy {
            (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0 == 45 || $0 == 95
        }
    }
    public static func validate(_ document: SpatialDocument) -> [ValidationIssue] {
        var issues: [ValidationIssue] = []
        func add(_ code: String, _ path: String, _ message: String) { issues.append(.init(code,path,message)) }
        func text(_ value: String, _ path: String) {
            if value.isEmpty || value.unicodeScalars.count > 256 || value.unicodeScalars.contains(where: { $0.value < 32 && $0.value != 10 }) {
                add("invalid_text",path,"Use 1 to 256 visible characters")
            }
        }
        func ids(_ ids: [String], _ path: String) {
            if ids.contains(where: { !validID($0) }) { add("invalid_id",path,"Identifiers must be bounded ASCII letters, digits, hyphens, or underscores") }
            if Set(ids).count != ids.count { add("duplicate_id",path,"Identifiers must be unique in this collection") }
        }
        if !["1.0.0", "1.1.0"].contains(document.schemaVersion) { add("schema_version","schemaVersion","Unsupported schema; migrate explicitly") }
        if document.coordinateSystem != "meters_y_up_right_handed" { add("coordinates","coordinateSystem","Unsupported coordinate system") }
        if document.measurementStatus != "unverified" { add("measurement_claim","measurementStatus","This version does not certify measurements") }
        if !validID(document.documentID) { add("invalid_id","documentID","Invalid identifier") }
        if document.revision < 1 || document.revision > 9_007_199_254_740_991 { add("revision","revision","Invalid revision") }
        if let p = document.parentRevision, p < 1 || p >= document.revision { add("revision","parentRevision","Parent must precede this revision") }
        text(document.title,"title")
        if document.floors.isEmpty || document.floors.count > 100 { add("capacity","floors","Expected 1 to 100 floors"); return issues }
        ids(document.floors.map(\.id),"floors")
        for (fi, floor) in document.floors.enumerated() {
            let root = "floors[\(fi)]"
            text(floor.label,root+".label")
            if !floor.elevation.isFinite || abs(floor.elevation) > 10000 { add("number",root+".elevation","Invalid elevation") }
            if floor.nodes.count > 100000 || floor.walls.count > 50000 || floor.openings.count > 10000 || floor.rooms.count > 10000 {
                add("capacity",root,"Safety envelope exceeded"); continue
            }
            ids(floor.nodes.map(\.id),root+".nodes"); ids(floor.walls.map(\.id),root+".walls")
            ids(floor.openings.map(\.id),root+".openings"); ids(floor.rooms.map(\.id),root+".rooms")
            if !floor.areas.isEmpty && document.schemaVersion != "1.1.0" { add("schema_version",root+".areas","Semantic areas require the explicit 1.1 schema") }
            if floor.areas.count > 1000 { add("capacity",root+".areas","Expected at most 1000 semantic areas"); continue }
            ids(floor.areas.map(\.id),root+".areas")
            // Scene selection is floor-scoped and objectID-based. IDs for objects
            // that render faces/edges must therefore be unique across kinds.
            ids(floor.walls.map(\.id) + floor.openings.map(\.id) + floor.rooms.map(\.id) + floor.areas.map(\.id), root+".renderObjects")
            var areaWork = 0
            for area in floor.areas {
                let p = root+".areas."+area.id
                text(area.label,p+".label")
                areaWork += area.polygon.count * min(area.polygon.count, 1001)
                guard (3...1000).contains(area.polygon.count), areaWork <= 2_000_000 else {
                    add("capacity",p,"Semantic polygon work exceeds the bounded envelope"); continue
                }
                if !area.polygon.allSatisfy({ $0.finite && abs($0.x) <= 10000 && abs($0.z) <= 10000 }) || !Geometry.isSimplePolygon(area.polygon) {
                    add("invalid_polygon",p,"Semantic areas require a simple finite polygon")
                }
                if area.provenance.sourceIDs.count > 1000 || area.provenance.sourceIDs.contains(where: { !validID($0) }) {
                    add("source_id",p,"Invalid or excessive source identifiers")
                }
            }
            let index = FloorGeometryIndex(floor)
            let nodes = index.nodes, walls = index.walls
            var lengths: [String: Double] = [:]
            for node in floor.nodes where !node.point.finite || abs(node.point.x) > 10000 || abs(node.point.z) > 10000 {
                add("number",root+".nodes."+node.id,"Coordinate is nonfinite or outside safety bounds")
            }
            for wall in floor.walls {
                let p = root+".walls."+wall.id
                if wall.nodeIDs.count < 2 || wall.nodeIDs.count > 1000 { add("path",p,"Expected 2 to 1000 path nodes"); continue }
                if wall.nodeIDs.contains(where: { nodes[$0] == nil }) { add("missing_node",p,"Wall references a missing node"); continue }
                let points = wall.nodeIDs.compactMap { nodes[$0] }
                if !points.allSatisfy({ $0.finite }) { continue }
                if zip(points,points.dropFirst()).contains(where: { $0.distance(to: $1) <= Geometry.epsilon }) {
                    add("degenerate_wall",p,"Adjacent wall points must differ")
                }
                if Set(wall.nodeIDs).count != wall.nodeIDs.count { add("wall_loop",p,"A wall path cannot repeat a node") }
                if !Geometry.isSimplePath(points) { add("self_intersecting_wall",p,"Wall path cannot cross, touch, or double back on itself") }
                lengths[wall.id] = Geometry.pathLength(points)
                if !wall.height.isFinite || wall.height <= 0 || wall.height > 100 || !wall.baseY.isFinite || abs(wall.baseY) > 100 {
                    add("number",p,"Invalid height or wall base")
                }
                let worldBase = floor.elevation + wall.baseY
                let worldTop = worldBase + wall.height
                if !worldBase.isFinite || !worldTop.isFinite || abs(worldBase) > 10000 || abs(worldTop) > 10000 {
                    add("world_height_bounds",p,"Combined floor and wall elevation exceeds the shared scene coordinate bounds")
                }
                if wall.provenance.sourceIDs.count > 1000 || wall.provenance.sourceIDs.contains(where: { !validID($0) }) {
                    add("source_id",p,"Invalid or excessive source identifiers")
                }
            }
            for opening in floor.openings {
                let p = root+".openings."+opening.id
                guard let wall = walls[opening.wallID], let length = lengths[opening.wallID] else {
                    add("missing_wall",p,"Opening must have an existing valid host wall"); continue
                }
                if ![opening.offset,opening.width,opening.bottom,opening.height].allSatisfy({ $0.isFinite }) {
                    add("number",p,"Opening geometry must be finite"); continue
                }
                if opening.offset < 0 || opening.width <= 0 || opening.offset+opening.width > length+Geometry.epsilon ||
                   opening.bottom < 0 || opening.height <= 0 || opening.bottom+opening.height > wall.height+Geometry.epsilon {
                    add("opening_bounds",p,"Opening must fit inside its host wall")
                }
                if opening.provenance.sourceIDs.count > 1000 || opening.provenance.sourceIDs.contains(where: { !validID($0) }) {
                    add("source_id",p,"Invalid or excessive source identifiers")
                }
            }
            // Per-wall grouping keeps unrelated openings out of pair checks.
            for group in Dictionary(grouping: floor.openings, by: \.wallID).values {
                let ordered = group.sorted { $0.offset < $1.offset }
                for i in ordered.indices {
                    let a = ordered[i]
                    for j in (i+1)..<ordered.count {
                        let b = ordered[j]
                        if b.offset >= a.offset+a.width-Geometry.epsilon { break }
                        if min(a.bottom+a.height,b.bottom+b.height)-max(a.bottom,b.bottom) > Geometry.epsilon {
                            add("opening_overlap",root+".openings",a.id+" overlaps "+b.id)
                        }
                    }
                }
            }
            var roomReferences: [String: [(String,Bool)]] = [:]
            for room in floor.rooms {
                let p = root+".rooms."+room.id
                text(room.label,p+".label")
                if room.boundary.count < 3 || room.boundary.count > 1000 { add("boundary",p,"Expected 3 to 1000 boundary walls"); continue }
                if Set(room.boundary.map(\.wallID)).count != room.boundary.count { add("duplicate_boundary",p,"Room repeats a wall"); continue }
                for r in room.boundary { roomReferences[r.wallID,default:[]].append((room.id,r.reversed)) }
                do {
                    let boundary = try index.boundary(room: room)
                    if boundary.count > 1000 || !Geometry.isSimplePolygon(boundary) { add("invalid_polygon",p,"Room boundary must be a bounded, simple, nonzero polygon") }
                } catch { add("open_boundary",p,"Boundary must connect using shared node identifiers and close explicitly") }
            }
            for (wallID, refs) in roomReferences {
                if refs.count > 2 { add("nonmanifold",root+".walls."+wallID,"More than two rooms use one wall") }
                if refs.count == 2 && refs[0].1 == refs[1].1 { add("shared_wall_direction",root+".walls."+wallID,"Adjacent rooms must traverse a shared wall oppositely") }
            }
        }
        return issues
    }
    public static func requireValid(_ document: SpatialDocument) throws {
        let issues = validate(document)
        if !issues.isEmpty { throw SpatialError.invalid(issues) }
    }
}
