import Foundation
import SpatialCore

public enum DrawingExportError: String, Error, LocalizedError, Sendable {
    case nativeRendererUnavailable, renderingFailed, textDoesNotFit, exceedsSafetyBounds
    public var errorDescription: String? {
        switch self {
        case .nativeRendererUnavailable: return "PDF and PNG export requires the Apple drawing renderer. SVG remains available."
        case .renderingFailed: return "The drawing could not be rendered. The saved revision is unchanged."
        case .textDoesNotFit: return "A label does not fit the drawing. Export the geometry or shorten the displayed label before retrying."
        case .exceedsSafetyBounds: return "The drawing exceeds the export safety limit. Export individual floors instead."
        }
    }
}

/// Presentation only. These points are page coordinates, never measurements.
public struct DrawingPoint: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public init(x: Double, y: Double) { self.x = x; self.y = y }
}
public struct DrawingColor: Equatable, Sendable {
    public let red: Double, green: Double, blue: Double
    public init(red: Double, green: Double, blue: Double) { self.red = red; self.green = green; self.blue = blue }
    static let ink = DrawingColor(red: 23 / 255, green: 40 / 255, blue: 61 / 255)
    static let blue = DrawingColor(red: 37 / 255, green: 99 / 255, blue: 166 / 255)
    static let fill = DrawingColor(red: 237 / 255, green: 245 / 255, blue: 252 / 255)
    static let warning = DrawingColor(red: 149 / 255, green: 72 / 255, blue: 5 / 255)
    static let white = DrawingColor(red: 1, green: 1, blue: 1)
    var hex: String { String(format: "#%02X%02X%02X", Int((red * 255).rounded()), Int((green * 255).rounded()), Int((blue * 255).rounded())) }
}
public struct DrawingShape: Equatable, Sendable {
    public enum Kind: String, Sendable { case line, polygon, circle }
    public let kind: Kind
    public let objectID: String
    public let role: String
    public let points: [DrawingPoint]
    public let stroke: DrawingColor?
    public let fill: DrawingColor?
    public let lineWidth: Double
    public let dashed: Bool
    public let radius: Double
    init(_ kind: Kind, id: String, role: String, points: [DrawingPoint], stroke: DrawingColor? = nil,
         fill: DrawingColor? = nil, lineWidth: Double = 1, dashed: Bool = false, radius: Double = 0) {
        self.kind = kind; objectID = id; self.role = role; self.points = points
        self.stroke = stroke; self.fill = fill; self.lineWidth = lineWidth; self.dashed = dashed; self.radius = radius
    }
}
public struct DrawingText: Equatable, Sendable {
    public let objectID: String?
    public let text: String
    public let origin: DrawingPoint
    public let width: Double, height: Double, fontSize: Double
    public let color: DrawingColor
    public let bold: Bool
    init(_ text: String, x: Double, y: Double, width: Double, height: Double, size: Double = 11,
         color: DrawingColor = .ink, bold: Bool = false, id: String? = nil) {
        self.text = text; origin = .init(x: x, y: y); self.width = width; self.height = height
        fontSize = size; self.color = color; self.bold = bold; objectID = id
    }
}
public struct DrawingPage: Equatable, Sendable {
    public let width: Double, height: Double
    public let shapes: [DrawingShape]
    public let texts: [DrawingText]
}
public struct DrawingProjection: Equatable, Sendable {
    public let scale: Double, translateX: Double, translateY: Double
    public func project(_ point: Point2) -> DrawingPoint {
        DrawingPoint(x: point.x * scale + translateX, y: point.z * scale + translateY)
    }
}
public struct DrawingPlan: Equatable, Sendable {
    public let documentID: String, floorID: String
    public let revision: Int
    public let projection: DrawingProjection
    public let pages: [DrawingPage]
    public let incompleteBoundaryNodeIDs: [String]
    public let unassignedWallIDs: [String]
}
public struct ExportedDrawing: Sendable {
    public let documentID: String, floorID: String
    public let revision: Int
    public let svgPages: [Data]
    public let pdf: Data
    public let pngPages: [Data]
}

public enum DrawingExporter {
    /// Top-down drawings use +X right and +Z down, matching the canonical 2D editor.
    /// There is deliberately no north arrow, ruler, scale, dimension, or quantity claim.
    public static func plan(document: SpatialDocument, floorID: String, lightBlueFill: Bool = true) throws -> DrawingPlan {
        _ = try ExportPreparation.prepare(document: document, floorID: floorID)
        guard let floor = document.floors.first(where: { $0.id == floorID }) else { throw SpatialExportError.invalidGeometry }
        let geometryIndex = FloorGeometryIndex(floor)
        let width = 792.0, height = 612.0
        let allPoints = floor.nodes.map(\.point) + floor.areas.flatMap(\.polygon)
        let minX = allPoints.map(\.x).min() ?? 0, maxX = allPoints.map(\.x).max() ?? 1
        let minZ = allPoints.map(\.z).min() ?? 0, maxZ = allPoints.map(\.z).max() ?? 1
        let scale = min(680 / max(maxX - minX, 0.1), 364 / max(maxZ - minZ, 0.1))
        let projection = DrawingProjection(scale: scale,
            translateX: (width - (maxX - minX) * scale) / 2 - minX * scale,
            translateY: 118 + (364 - (maxZ - minZ) * scale) / 2 - minZ * scale)
        var shapes: [DrawingShape] = [], texts: [DrawingText] = []
        let rooms = floor.rooms.sorted { $0.id < $1.id }
        let referenced = Set(rooms.flatMap { $0.boundary.map(\.wallID) })
        let unassigned = floor.walls.filter { !referenced.contains($0.id) }.map(\.id).sorted()
        var degree: [String: Int] = [:]
        for wall in floor.walls {
            if let first = wall.nodeIDs.first { degree[first, default: 0] += 1 }
            if let last = wall.nodeIDs.last { degree[last, default: 0] += 1 }
        }
        let incomplete = floor.nodes.filter { degree[$0.id] == 1 }.sorted { $0.id < $1.id }
        for room in rooms {
            let polygon = try geometryIndex.boundary(room: room)
            if lightBlueFill {
                shapes.append(.init(.polygon, id: room.id, role: "room", points: polygon.map(projection.project), fill: .fill))
            }
        }
        let areas = floor.areas.sorted { $0.id < $1.id }
        for (index, area) in areas.enumerated() {
            shapes.append(.init(.polygon, id: area.id, role: "semantic-area", points: area.polygon.map(projection.project),
                                stroke: .blue, lineWidth: 1, dashed: true))
            let triangles = try Geometry.triangulate(area.polygon)
            if let t = triangles.max(by: {
                abs(Geometry.cross(area.polygon[$0[0]], area.polygon[$0[1]], area.polygon[$0[2]])) <
                abs(Geometry.cross(area.polygon[$1[0]], area.polygon[$1[1]], area.polygon[$1[2]]))
            }) {
                let p = projection.project(.init(x: t.reduce(0) { $0 + area.polygon[$1].x } / 3,
                                                  z: t.reduce(0) { $0 + area.polygon[$1].z } / 3))
                texts.append(.init("A\(index + 1)", x: p.x - 12, y: p.y - 8, width: 44, height: 20, size: 11, color: .blue, bold: true, id: area.id))
            }
        }
        let byWall = Dictionary(grouping: floor.openings, by: \.wallID)
        for wall in floor.walls.sorted(by: { $0.id < $1.id }) {
            let path = try geometryIndex.path(wall: wall)
            var breaks = [0.0]
            for index in 1..<path.count { breaks.append(breaks.last! + path[index - 1].distance(to: path[index])) }
            let openings = (byWall[wall.id] ?? []).sorted { $0.id < $1.id }
            breaks += openings.flatMap { [$0.offset, $0.offset + $0.width] }
            breaks = Array(Set(breaks)).sorted()
            for index in 1..<breaks.count {
                let lo = breaks[index - 1], hi = breaks[index], mid = (lo + hi) / 2
                let a = projection.project(try Geometry.point(at: lo, on: path))
                let b = projection.project(try Geometry.point(at: hi, on: path))
                let holes = openings.filter { mid > $0.offset && mid < $0.offset + $0.width }
                if holes.isEmpty {
                    shapes.append(.init(.line, id: wall.id, role: "wall", points: [a, b], stroke: .ink, lineWidth: 2.1))
                } else {
                    // Projection may contain stacked openings. A window is always a double
                    // line; a door/passage remains a gap. Neither implies a hinge direction.
                    for opening in holes {
                        let dx = b.x - a.x, dy = b.y - a.y, length = hypot(dx, dy)
                        guard length > 0 else { continue }
                        if opening.kind == .window {
                            for offset in [-1.5, 1.5] {
                                shapes.append(.init(.line, id: opening.id, role: "window", points: [
                                    .init(x: a.x - dy / length * offset, y: a.y + dx / length * offset),
                                    .init(x: b.x - dy / length * offset, y: b.y + dx / length * offset)], stroke: .blue, lineWidth: 0.8))
                            }
                        } else {
                            // Jamb marks stop at the host, leaving the opening unfilled.
                            for p in [a, b] {
                                shapes.append(.init(.line, id: opening.id, role: opening.kind.rawValue, points: [
                                    .init(x: p.x - dy / length * 3, y: p.y + dx / length * 3),
                                    .init(x: p.x + dy / length * 3, y: p.y - dx / length * 3)], stroke: .blue, lineWidth: 0.8))
                            }
                        }
                    }
                }
            }
        }
        for node in incomplete {
            shapes.append(.init(.circle, id: node.id, role: "incomplete-boundary", points: [projection.project(node.point)],
                                stroke: .warning, lineWidth: 1.4, dashed: true, radius: 5))
        }
        for (index, room) in rooms.enumerated() {
            let polygon = try geometryIndex.boundary(room: room), triangles = try Geometry.triangulate(polygon)
            guard let triangle = triangles.max(by: {
                abs(Geometry.cross(polygon[$0[0]], polygon[$0[1]], polygon[$0[2]])) < abs(Geometry.cross(polygon[$1[0]], polygon[$1[1]], polygon[$1[2]]))
            }) else { throw SpatialExportError.invalidGeometry }
            let center = projection.project(.init(x: triangle.reduce(0) { $0 + polygon[$1].x } / 3,
                                                z: triangle.reduce(0) { $0 + polygon[$1].z } / 3))
            let marker = "R\(index + 1)"
            let markerWidth = max(24, Double(marker.count) * 8)
            shapes.append(.init(.polygon, id: room.id, role: "room-label-backing", points: [
                .init(x: center.x - markerWidth / 2, y: center.y - 10), .init(x: center.x + markerWidth / 2, y: center.y - 10),
                .init(x: center.x + markerWidth / 2, y: center.y + 10), .init(x: center.x - markerWidth / 2, y: center.y + 10)], fill: .white))
            texts.append(.init(marker, x: center.x - markerWidth / 2 + 2, y: center.y - 8, width: markerWidth, height: 18, size: 11, bold: true, id: room.id))
        }
        let status = incomplete.isEmpty && unassigned.isEmpty ? "Closed room boundaries only. Capture completeness is not established." :
            "Incomplete layout: \(incomplete.count) open endpoints; \(unassigned.count) walls outside accepted room boundaries."
        texts += [
            .init("Spatial layout", x: 40, y: 28, width: 712, height: 29, size: 23, bold: true),
            .init("Floor drawing  |  Revision \(document.revision)  |  \(document.reviewState == .reviewed ? "Reviewed draft" : "Needs review")", x: 40, y: 64, width: 712, height: 20),
            .init("Room keys and full labels follow on the directory pages.", x: 40, y: 87, width: 712, height: 18, size: 10),
            .init("Door / passage: open gap. Window: double line. Dashed polygon: area, not a physical barrier. Dashed circle: incomplete.", x: 40, y: 507, width: 712, height: 32, size: 10),
            .init(status, x: 40, y: 542, width: 712, height: 27, size: 10, color: incomplete.isEmpty && unassigned.isEmpty ? .ink : .warning)
        ]
        if floor.walls.isEmpty {
            texts.append(.init("No captured or drawn walls on this floor.", x: 180, y: 280, width: 440, height: 38, size: 16))
        }
        var pages = [DrawingPage(width: width, height: height, shapes: shapes, texts: texts)]
        // Directory pages retain exact full labels rather than truncate long Unicode
        // strings or put overlapping room names on a small-property drawing.
        var directory: [DrawingText] = [], y = 76.0
        func newDirectory() {
            if !directory.isEmpty { pages.append(.init(width: width, height: height, shapes: [], texts: directory)) }
            directory = [.init("Drawing directory", x: 40, y: 28, width: 712, height: 30, size: 21, bold: true)]
            y = 76
        }
        func row(_ heading: String, _ value: String, id: String? = nil) {
            let lines = wrapped(value, width: 540, size: 12)
            // Explicit continuation rows are used for long/multiline labels. There is
            // no truncation and no dependence on an installed portable font.
            for start in stride(from: 0, to: lines.count, by: 20) {
                let chunk = Array(lines[start..<min(lines.count, start + 20)])
                let rowHeight = max(32, Double(chunk.count) * 17 + 12)
                if y + rowHeight > 550 { newDirectory() }
                directory.append(.init(heading + (start == 0 ? "" : " (continued)"), x: 40, y: y, width: 126, height: rowHeight, size: 10, bold: true, id: id))
                directory.append(.init(chunk.joined(separator: "\n"), x: 180, y: y, width: 572, height: rowHeight, size: 11, id: id))
                y += rowHeight
            }
        }
        newDirectory()
        row("Document", document.title)
        row("Document ID", document.documentID)
        row("Floor", floor.label, id: floor.id)
        row("Floor ID", floor.id)
        row("Revision", String(document.revision))
        for (index, room) in rooms.enumerated() { row("R\(index + 1)", room.label, id: room.id) }
        for (index, area) in areas.enumerated() { row("A\(index + 1)", area.label, id: area.id) }
        row("Interpretation", "Diagrammatic geometry. Measurements unverified. Drawing orientation is model-relative, not GPS north. No area or quantity claims.")
        if !unassigned.isEmpty { row("Needs review", "Walls outside accepted room boundaries are shown without inventing closed room floors.") }
        if !directory.isEmpty { pages.append(.init(width: width, height: height, shapes: [], texts: directory)) }
        guard pages.count <= 500, shapes.count <= 400_000 else { throw DrawingExportError.exceedsSafetyBounds }
        pages = pages.enumerated().map { index, page in
            .init(width: page.width, height: page.height, shapes: page.shapes, texts: page.texts + [
                .init("Diagrammatic layout. Measurements unverified.", x: 40, y: 583, width: 590, height: 16, size: 9),
                .init("\(index + 1) / \(pages.count)", x: 690, y: 583, width: 62, height: 16, size: 9)])
        }
        return DrawingPlan(documentID: document.documentID, floorID: floor.id, revision: document.revision,
                           projection: projection, pages: pages, incompleteBoundaryNodeIDs: incomplete.map(\.id), unassignedWallIDs: unassigned)
    }

    public static func svgPages(document: SpatialDocument, floorID: String) throws -> [Data] {
        try svgPages(plan: plan(document: document, floorID: floorID))
    }
    public static func svgPages(plan: DrawingPlan) throws -> [Data] {
        let pages = plan.pages.enumerated().map { pageIndex, page -> Data in
            func n(_ value: Double) -> String { String(format: "%.5f", locale: Locale(identifier: "en_US_POSIX"), value) }
            func e(_ value: String) -> String { SVGExporter.escape(value) }
            var text = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 \(n(page.width)) \(n(page.height))\" role=\"img\">\n"
            text += "<title>Spatial layout page \(pageIndex + 1)</title><desc>Document \(e(plan.documentID)); floor \(e(plan.floorID)); revision \(plan.revision). Diagrammatic layout. Measurements unverified.</desc>\n"
            text += "<rect width=\"\(n(page.width))\" height=\"\(n(page.height))\" fill=\"white\"/>\n"
            for shape in page.shapes {
                let attrs = "data-object-id=\"\(e(shape.objectID))\" data-role=\"\(e(shape.role))\" fill=\"\(shape.fill?.hex ?? "none")\" stroke=\"\(shape.stroke?.hex ?? "none")\" stroke-width=\"\(n(shape.lineWidth))\"" + (shape.dashed ? " stroke-dasharray=\"3 3\"" : "")
                switch shape.kind {
                case .line:
                    text += "<line x1=\"\(n(shape.points[0].x))\" y1=\"\(n(shape.points[0].y))\" x2=\"\(n(shape.points[1].x))\" y2=\"\(n(shape.points[1].y))\" \(attrs) stroke-linecap=\"round\"/>\n"
                case .polygon:
                    text += "<polygon points=\"\(shape.points.map { n($0.x) + "," + n($0.y) }.joined(separator: " "))\" \(attrs)/>\n"
                case .circle:
                    text += "<circle cx=\"\(n(shape.points[0].x))\" cy=\"\(n(shape.points[0].y))\" r=\"\(n(shape.radius))\" \(attrs)/>\n"
                }
            }
            for label in page.texts {
                // Explicitly wrapped text uses the same conservative scalar capacity as
                // native layout. No foreignObject, script, linked asset, or event handlers.
                let lines = wrapped(label.text, width: label.width, size: label.fontSize)
                text += "<text x=\"\(n(label.origin.x))\" y=\"\(n(label.origin.y + label.fontSize))\" font-family=\"system-ui,sans-serif\" font-size=\"\(n(label.fontSize))\" fill=\"\(label.color.hex)\"" + (label.bold ? " font-weight=\"600\"" : "") + (label.objectID.map { " data-object-id=\"\(e($0))\"" } ?? "") + ">"
                for (index, line) in lines.enumerated() {
                    text += "<tspan x=\"\(n(label.origin.x))\" dy=\"\(index == 0 ? "0" : n(label.fontSize * 1.45))\">\(e(line))</tspan>"
                }
                text += "</text>\n"
            }
            return Data((text + "</svg>\n").utf8)
        }
        guard pages.allSatisfy({ $0.count <= SpatialImportLimits.memberBytes }), pages.reduce(0, { $0 + $1.count }) <= SpatialImportLimits.totalBytes else {
            throw DrawingExportError.exceedsSafetyBounds
        }
        return pages
    }

    public static func export(document: SpatialDocument, floorID: String, pixelsPerPoint: Int = 2) throws -> ExportedDrawing {
        let plan = try plan(document: document, floorID: floorID)
        guard (1...3).contains(pixelsPerPoint) else { throw DrawingExportError.exceedsSafetyBounds }
        let svg = try svgPages(plan: plan)
        let native = try AppleDrawingRenderer.render(plan: plan, pixelsPerPoint: pixelsPerPoint)
        return ExportedDrawing(documentID: plan.documentID, floorID: plan.floorID, revision: plan.revision,
                               svgPages: svg, pdf: native.pdf, pngPages: native.png)
    }
    public static func exportPDF(document: SpatialDocument, floorID: String) throws -> Data {
        let plan = try plan(document: document, floorID: floorID)
        return try AppleDrawingRenderer.render(plan: plan, pixelsPerPoint: 1, includePNG: false).pdf
    }

    /// Derivative-only page archive, not an importable geometry or publication bundle.
    /// All pages are included. A selected floor does not disclose other floor geometry.
    public static func exportSVGArchive(document: SpatialDocument, floorID: String) throws -> Data {
        try pageArchive(documentID: document.documentID, floorID: floorID, revision: document.revision,
                        pages: svgPages(document: document, floorID: floorID), format: "svg")
    }
    public static func exportPNGArchive(document: SpatialDocument, floorID: String, pixelsPerPoint: Int = 2) throws -> Data {
        let plan = try plan(document: document, floorID: floorID)
        guard (1...3).contains(pixelsPerPoint) else { throw DrawingExportError.exceedsSafetyBounds }
        let pages = try AppleDrawingRenderer.render(plan: plan, pixelsPerPoint: pixelsPerPoint, includePDF: false).png
        return try pageArchive(documentID: plan.documentID, floorID: plan.floorID, revision: plan.revision, pages: pages, format: "png")
    }
    private static func pageArchive(documentID: String, floorID: String, revision: Int, pages: [Data], format: String) throws -> Data {
        struct Manifest: Encodable {
            let profileVersion = "auxilium-spatial-drawing-pages/1.0.0"
            let documentID: String, floorID: String
            let revision: Int
            let measurementStatus = "unverified"
            let format: String
            let pageCount: Int
            let files: [Entry]
            struct Entry: Encodable { let path: String, mimeType: String, sha256: String; let bytes: Int, pageIndex: Int }
        }
        guard ["svg", "png"].contains(format), (1...500).contains(pages.count) else { throw SpatialExportError.unsupportedProfile }
        var files: [String: Data] = [:], entries: [Manifest.Entry] = []
        for (index, page) in pages.enumerated() {
            let path = String(format: "floorplan-%04d.%@", index, format)
            files[path] = page
            entries.append(.init(path: path, mimeType: format == "svg" ? "image/svg+xml" : "image/png",
                                 sha256: ByteDigest.sha256(page), bytes: page.count, pageIndex: index))
        }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        files["manifest.json"] = try encoder.encode(Manifest(documentID: documentID, floorID: floorID, revision: revision,
                                                               format: format, pageCount: pages.count, files: entries))
        return try ProfileArchive.writeKnownFiles(files)
    }

    static func wrapped(_ text: String, width: Double, size: Double) -> [String] {
        func advance(_ character: Character) -> Double {
            character == " " ? size * 0.36 :
                (character.unicodeScalars.allSatisfy { $0.value < 0x250 } ? size * 0.66 : size * 1.05)
        }
        var lines: [String] = []
        for paragraph in text.components(separatedBy: "\n") {
            var current = "", used = 0.0
            for (index, word) in paragraph.components(separatedBy: " ").enumerated() {
                let prefix = index == 0 ? "" : " ", token = prefix + word
                let amount = token.reduce(0.0) { $0 + advance($1) }
                if used + amount > width && !current.isEmpty {
                    lines.append(current); current = ""; used = 0
                } else if index > 0 { current += " "; used += advance(" ") }
                // Only an individual overlong token is broken. Ordinary words stay
                // whole, including status copy and full room/floor labels.
                for character in word {
                    let next = advance(character)
                    if used + next > width && !current.isEmpty { lines.append(current); current = ""; used = 0 }
                    current.append(character); used += next
                }
            }
            lines.append(current)
        }
        return lines
    }
}
