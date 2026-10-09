import Foundation
import RoomPlan
import simd
import SpatialCore
import CaptureKit

/// The SDK adapter never constructs or repairs graph topology. All coordinate
/// interpretation and normalization live in the shared portable engine.
enum AppleSurfaceAdapter {
    enum AdapterError: LocalizedError {
        case mixedFloorLevels
        var errorDescription: String? {
            "These captured surfaces do not establish one level floor. Raw and processed scans are retained. Recover rooms separately and review each floor; no floor has been flattened to make the rooms connect."
        }
    }
    private static func surface(_ value: CapturedRoom.Surface, kind: CapturedSurfaceKind) -> CapturedSurface {
            let matrix = value.transform
            let values = (0..<4).flatMap { column in (0..<4).map { row in Double(matrix[column][row]) } }
            var corners = value.polygonCorners.map { Point3(x: Double($0.x), y: Double($0.y), z: Double($0.z)) }
            if corners.isEmpty, value.curve == nil, kind != .floor {
                let halfWidth = Double(value.dimensions.x) / 2
                let halfHeight = Double(value.dimensions.y) / 2
                corners = [.init(x: -halfWidth, y: -halfHeight, z: 0), .init(x: halfWidth, y: -halfHeight, z: 0),
                           .init(x: halfWidth, y: halfHeight, z: 0), .init(x: -halfWidth, y: halfHeight, z: 0)]
            }
            let confidence: Confidence
            switch value.confidence {
            case .high: confidence = .high
            case .medium: confidence = .medium
            case .low: confidence = .low
            @unknown default: confidence = .unknown
            }
            return CapturedSurface(id: value.identifier.uuidString, kind: kind,
                                   transform: SurfaceTransform(columnMajor: values), localCorners: corners,
                                   parentWallID: value.parentIdentifier?.uuidString,
                                   classificationConfidence: confidence, isCurved: value.curve != nil)
        }
    static func capture(room: CapturedRoom, documentID: String, title: String,
                        frameID: String, sourceArchiveID: String, sdkVersion: String) throws -> SurfaceCapture {
        var surfaces = room.walls.map { surface($0, kind: .wall) }
            + room.doors.map { surface($0, kind: .door) }
            + room.windows.map { surface($0, kind: .window) }
            + room.openings.map { surface($0, kind: .passage) }
            + room.floors.map { surface($0, kind: .floor) }
        // Do not force AR's arbitrary world origin to be the floor level.
        let elevation: Double, planar: Bool
        do { elevation = try singleFloorElevation(floors: room.floors, walls: room.walls); planar = true }
        catch {
            // Keep a single difficult room editable as walls without inventing
            // a planar room fill. Full floor observations remain in the report.
            elevation = room.floors.map { Double($0.transform.columns.3.y) }.min()
                ?? room.walls.map { Double($0.transform.columns.3.y - $0.dimensions.y / 2) }.min() ?? 0
            planar = false
            for index in surfaces.indices where surfaces[index].kind == .floor {
                surfaces[index].unsupportedReason = "Floor elevations do not establish one plane. No room floor fill was inferred."
            }
        }
        return SurfaceCapture(documentID: documentID, title: title, floorID: "floor-1", floorLabel: "Floor 1",
                              floorElevation: elevation, frameID: frameID, sourceArchiveID: sourceArchiveID,
                              sdkVersion: sdkVersion,
                              surfaces: surfaces,
                              rooms: planar ? [CapturedRoomBoundary(id: room.identifier.uuidString, label: "Room 1",
                                                           wallIDs: room.walls.map { $0.identifier.uuidString })] : [])
    }

    /// Only StructureBuilder's merged structural surfaces enter the canonical
    /// graph. Unmapped room boundaries remain explicit review issues; this
    /// adapter never guesses an ID association by nearest wall or room name.
    static func capture(structure: CapturedStructure, documentID: String, title: String,
                        frameID: String, sourceArchiveID: String, sdkVersion: String,
                        labels: [UUID: String]) throws -> SurfaceCapture {
        let surfaces = structure.walls.map { surface($0, kind: .wall) }
            + structure.doors.map { surface($0, kind: .door) }
            + structure.windows.map { surface($0, kind: .window) }
            + structure.openings.map { surface($0, kind: .passage) }
            + structure.floors.map { surface($0, kind: .floor) }
        let elevation = try singleFloorElevation(floors: structure.floors, walls: structure.walls)
        return SurfaceCapture(documentID: documentID, title: title, floorID: "floor-1", floorLabel: "Floor 1",
            floorElevation: elevation, frameID: frameID, sourceArchiveID: sourceArchiveID, sdkVersion: sdkVersion,
            surfaces: surfaces, rooms: structure.rooms.enumerated().map { index, room in
                CapturedRoomBoundary(id: room.identifier.uuidString, label: labels[room.identifier] ?? "Room \(index + 1)",
                    wallIDs: room.walls.map { $0.identifier.uuidString })
            })
    }

    /// The current capture normalization produces one planar Floor. Apple's
    /// structure representation can contain split levels, so it is unsafe to
    /// silently choose its minimum elevation and draw every room floor there.
    /// Geometry.epsilon is the existing exact-equivalence tolerance, not a new
    /// sensor-accuracy threshold. Level grouping is not guessed by rounding.
    private static func singleFloorElevation(floors: [CapturedRoom.Surface], walls: [CapturedRoom.Surface]) throws -> Double {
        var elevations: [Double] = []
        for floor in floors {
            let captured = surface(floor, kind: .floor)
            guard !captured.isCurved else { throw AdapterError.mixedFloorLevels }
            if captured.localCorners.isEmpty { elevations.append(Double(floor.transform.columns.3.y)) }
            else { elevations.append(contentsOf: try captured.localCorners.map { try captured.transform.transformed($0).y }) }
        }
        if !elevations.isEmpty {
            do { return try CaptureFloorPlaneAdmission.elevation(elevations, exactTolerance: Geometry.epsilon) }
            catch { throw AdapterError.mixedFloorLevels }
        }
        // Legacy RoomPlan results without floor surfaces use observed wall bases
        // only when they agree. A step-up or uncertain base remains a review item.
        let bases = walls.map { Double($0.transform.columns.3.y - $0.dimensions.y / 2) }
        guard !bases.isEmpty else { return 0 }
        do { return try CaptureFloorPlaneAdmission.elevation(bases, exactTolerance: Geometry.epsilon) }
        catch { throw AdapterError.mixedFloorLevels }
    }
}
