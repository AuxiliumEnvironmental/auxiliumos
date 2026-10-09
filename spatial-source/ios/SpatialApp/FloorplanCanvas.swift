import SwiftUI
import UIKit
import SpatialCore

struct FloorplanCanvas: UIViewRepresentable {
    let floor: Floor
    @Binding var selection: ObjectSelection?
    let tool: CanvasTool
    let resetID: Int
    let mutationEnabled: Bool
    @ObservedObject var areaDraft: AreaDraftState
    let edit: (EditCommand) -> Void
    let choose: ([ObjectSelection]) -> Void
    let chooseEndpoint: ([Node], @escaping (Node?) -> Void) -> Void
    let showDetails: () -> Void
    func makeUIView(context: Context) -> PlanCanvasView {
        let view = PlanCanvasView()
        view.areaDraft = areaDraft
        view.changedSelection = { selection = $0 }
        view.edit = edit; view.choose = choose; view.chooseEndpoint = chooseEndpoint; view.showDetails = showDetails
        return view
    }
    func updateUIView(_ view: PlanCanvasView, context: Context) {
        view.changedSelection = { selection = $0 }; view.edit = edit; view.choose = choose; view.chooseEndpoint = chooseEndpoint; view.showDetails = showDetails
        view.areaDraft = areaDraft
        view.configure(floor: floor, selection: selection, tool: tool, resetID: resetID, mutationEnabled: mutationEnabled)
    }
}

final class PlanCanvasView: UIView, UIGestureRecognizerDelegate {
    var changedSelection: ((ObjectSelection?) -> Void)?
    var edit: ((EditCommand) -> Void)?
    var choose: (([ObjectSelection]) -> Void)?
    var chooseEndpoint: (([Node], @escaping (Node?) -> Void) -> Void)?
    var showDetails: (() -> Void)?
    var areaDraft: AreaDraftState?
    private var floor: Floor?
    private var selection: ObjectSelection?
    private var tool: CanvasTool = .select
    private var zoom: CGFloat = 1
    private var pan: CGPoint = .zero
    private var resetID = 0
    private var mutationEnabled = true
    private var needsFraming = true
    private var previousSize: CGSize = .zero
    private var firstDraw: (Point2, String?)?
    private var draggedPoint: Point2?
    private var dragOrigin: Point2?
    private var base: CGFloat = 1
    private var center = Point2(x: 0, z: 0)
    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = true; backgroundColor = .systemBackground
        let tap = UITapGestureRecognizer(target: self, action: #selector(tap(_:)))
        let navigate = UIPanGestureRecognizer(target: self, action: #selector(navigate(_:)))
        navigate.minimumNumberOfTouches = 2; navigate.maximumNumberOfTouches = 2
        let drag = UIPanGestureRecognizer(target: self, action: #selector(drag(_:)))
        drag.minimumNumberOfTouches = 1; drag.maximumNumberOfTouches = 1; drag.delegate = self
        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(pinch(_:)))
        addGestureRecognizer(tap); addGestureRecognizer(navigate); addGestureRecognizer(drag); addGestureRecognizer(pinch)
        isAccessibilityElement = true
        accessibilityLabel = "2D layout canvas"
        accessibilityHint = "Use the Objects button for accessible selection and editing. Two fingers pan. Pinch to zoom."
    }
    required init?(coder: NSCoder) { nil }
    func configure(floor: Floor, selection: ObjectSelection?, tool: CanvasTool, resetID: Int, mutationEnabled: Bool) {
        let changedFloor = self.floor?.id != floor.id
        if changedFloor || self.resetID != resetID { zoom = 1; pan = .zero; firstDraw = nil; needsFraming = true }
        if self.tool != tool { firstDraw = nil }
        self.mutationEnabled = mutationEnabled
        self.floor = floor; self.selection = selection; self.tool = tool; self.resetID = resetID
        setNeedsDisplay()
    }
    private func framing() {
        guard needsFraming || previousSize != bounds.size else { return }
        needsFraming = false; previousSize = bounds.size
        guard let floor else { return }
        let points = floor.nodes.map(\.point) + floor.areas.flatMap(\.polygon)
        guard !points.isEmpty else { base = 50; center = .init(x: 0, z: 0); return }
        let xs = points.map(\.x), zs = points.map(\.z)
        let loX = xs.min()!, hiX = xs.max()!, loZ = zs.min()!, hiZ = zs.max()!
        center = .init(x: (loX + hiX) / 2, z: (loZ + hiZ) / 2)
        base = min(max(1, bounds.width - 64) / CGFloat(max(hiX - loX, 1)), max(1, bounds.height - 64) / CGFloat(max(hiZ - loZ, 1)))
    }
    private func screen(_ p: Point2) -> CGPoint { .init(x: bounds.midX + pan.x + CGFloat(p.x - center.x) * base * zoom, y: bounds.midY + pan.y + CGFloat(p.z - center.z) * base * zoom) }
    private func world(_ p: CGPoint) -> Point2 { .init(x: center.x + Double((p.x - bounds.midX - pan.x) / (base * zoom)), z: center.z + Double((p.y - bounds.midY - pan.y) / (base * zoom))) }
    override func draw(_ rect: CGRect) {
        guard var floor, let context = UIGraphicsGetCurrentContext() else { return }
        UIColor.systemBackground.setFill(); context.fill(bounds); framing()
        if let draggedPoint, selection?.kind == .node, let ni = floor.nodes.firstIndex(where: { $0.id == selection?.id }) { floor.nodes[ni].point = draggedPoint }
        if let draggedPoint, let dragOrigin, selection?.kind == .wall,
           let wall = floor.walls.first(where: { $0.id == selection?.id }) {
            for i in floor.nodes.indices where wall.nodeIDs.contains(floor.nodes[i].id) {
                floor.nodes[i].point.x += draggedPoint.x - dragOrigin.x; floor.nodes[i].point.z += draggedPoint.z - dragOrigin.z
            }
        }
        let index = FloorGeometryIndex(floor)
        let openingsByWall = Dictionary(grouping: floor.openings, by: \.wallID)
        for room in floor.rooms {
            guard let ring = try? index.boundary(room: room), let first = ring.first else { continue }
            let p = UIBezierPath(); p.move(to: screen(first)); ring.dropFirst().forEach { p.addLine(to: screen($0)) }; p.close()
            (selection == .init(kind: .room, id: room.id) ? UIColor.systemBlue.withAlphaComponent(0.20) : UIColor.systemBlue.withAlphaComponent(0.07)).setFill(); p.fill()
            if let tris = try? Geometry.triangulate(ring), let t = tris.max(by: { abs(Geometry.cross(ring[$0[0]], ring[$0[1]], ring[$0[2]])) < abs(Geometry.cross(ring[$1[0]], ring[$1[1]], ring[$1[2]])) }) {
                let label = Point2(x: (ring[t[0]].x + ring[t[1]].x + ring[t[2]].x) / 3, z: (ring[t[0]].z + ring[t[1]].z + ring[t[2]].z) / 3)
                let style: [NSAttributedString.Key: Any] = [.font: UIFont.preferredFont(forTextStyle: .caption1), .foregroundColor: UIColor.label]
                let text = NSString(string: room.label), size = text.size(withAttributes: style), at = screen(label)
                text.draw(at: .init(x: at.x - size.width / 2, y: at.y - size.height / 2), withAttributes: style)
            }
        }
        func line(_ a: Point2, _ b: Point2, color: UIColor, width: CGFloat, dashed: Bool = false) {
            let p = UIBezierPath(); p.move(to: screen(a)); p.addLine(to: screen(b)); p.lineWidth = width; p.lineCapStyle = .round
            if dashed { p.setLineDash([4, 4], count: 2, phase: 0) }
            color.setStroke(); p.stroke()
        }
        for area in floor.areas {
            for i in area.polygon.indices {
                line(area.polygon[i], area.polygon[(i + 1) % area.polygon.count], color: .systemBlue,
                     width: selection == .init(kind: .area, id: area.id) ? 3 : 1.5, dashed: true)
            }
            if let triangles = try? Geometry.triangulate(area.polygon), let t = triangles.first {
                let p = Point2(x: (area.polygon[t[0]].x + area.polygon[t[1]].x + area.polygon[t[2]].x)/3,
                               z: (area.polygon[t[0]].z + area.polygon[t[1]].z + area.polygon[t[2]].z)/3)
                NSString(string: "Area: " + area.label).draw(at: screen(p), withAttributes: [.font: UIFont.preferredFont(forTextStyle: .caption1), .foregroundColor: UIColor.systemBlue])
            }
        }
        let pendingArea = areaDraft?.points ?? []
        for i in pendingArea.indices {
            let at = screen(pendingArea[i]); UIColor.systemBlue.setFill()
            UIBezierPath(ovalIn: .init(x: at.x-5, y: at.y-5, width: 10, height: 10)).fill()
            if i > 0 { line(pendingArea[i-1], pendingArea[i], color: .systemBlue, width: 2, dashed: true) }
        }
        for wall in floor.walls {
            guard let path = try? index.path(wall: wall) else { continue }
            var distances = [0.0]
            for i in 1..<path.count { distances.append(distances.last! + path[i - 1].distance(to: path[i])) }
            let holes = openingsByWall[wall.id, default: []]
            distances += holes.flatMap { [$0.offset, $0.offset + $0.width] }; distances = Array(Set(distances)).sorted()
            for i in 1..<distances.count {
                let lo = distances[i - 1], hi = distances[i], mid = (lo + hi) / 2
                guard let a = try? Geometry.point(at: lo, on: path), let b = try? Geometry.point(at: hi, on: path) else { continue }
                if let opening = holes.first(where: { mid > $0.offset && mid < $0.offset + $0.width }) {
                    line(a, b, color: .systemBlue, width: selection == .init(kind: .opening, id: opening.id) ? 5 : 2, dashed: opening.kind != .window)
                } else { line(a, b, color: selection == .init(kind: .wall, id: wall.id) ? .systemBlue : .label, width: 3) }
            }
        }
        let endpointCounts = floor.walls.flatMap { [$0.nodeIDs.first!, $0.nodeIDs.last!] }.reduce(into: [String: Int]()) { $0[$1, default: 0] += 1 }
        for node in floor.nodes where endpointCounts[node.id] == 1 {
            let at = screen(node.point), mark = UIBezierPath(ovalIn: .init(x: at.x-9, y: at.y-9, width: 18, height: 18))
            UIColor.systemOrange.setStroke(); mark.lineWidth = 2; mark.stroke()
            NSString(string: "?").draw(at: .init(x: at.x+10,y: at.y-10), withAttributes: [.font: UIFont.preferredFont(forTextStyle: .caption1), .foregroundColor: UIColor.label])
        }
        if let selection, selection.kind == .node, let node = floor.nodes.first(where: { $0.id == selection.id }) {
            let at = screen(node.point), circle = UIBezierPath(ovalIn: .init(x: at.x - 7, y: at.y - 7, width: 14, height: 14))
            UIColor.systemBlue.setFill(); circle.fill(); UIColor.systemBackground.setStroke(); circle.lineWidth = 2; circle.stroke()
        }
        if let point = firstDraw?.0 {
            let at = screen(point); UIColor.systemBlue.setFill(); UIBezierPath(ovalIn: .init(x: at.x - 6, y: at.y - 6, width: 12, height: 12)).fill()
        }
    }
    private func hits(_ point: CGPoint) -> [ObjectSelection] {
        guard let floor else { return [] }
        let index = FloorGeometryIndex(floor)
        let walls = Dictionary(floor.walls.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var results: [(ObjectSelection, CGFloat)] = []
        for node in floor.nodes {
            let at = screen(node.point), d = hypot(point.x - at.x, point.y - at.y)
            if d <= 22 { results.append((.init(kind: .node, id: node.id), d)) }
        }
        for wall in floor.walls {
            guard let path = try? index.path(wall: wall) else { continue }
            for i in 1..<path.count {
                let d = distance(point, screen(path[i - 1]), screen(path[i]))
                if d <= 22 { results.append((.init(kind: .wall, id: wall.id), d)); break }
            }
        }
        for opening in floor.openings {
            guard let wall = walls[opening.wallID], let path = try? index.path(wall: wall),
                  let a = try? Geometry.point(at: opening.offset, on: path), let b = try? Geometry.point(at: opening.offset + opening.width, on: path) else { continue }
            let d = distance(point, screen(a), screen(b)); if d <= 22 { results.append((.init(kind: .opening, id: opening.id), d)) }
        }
        if results.isEmpty {
            for area in floor.areas where Geometry.contains(world(point), polygon: area.polygon) {
                results.append((.init(kind: .area, id: area.id), 0))
            }
            for room in floor.rooms {
                guard let ring = try? index.boundary(room: room), let first = ring.first else { continue }
                let p = UIBezierPath(); p.move(to: screen(first)); ring.dropFirst().forEach { p.addLine(to: screen($0)) }; p.close()
                if p.contains(point) { results.append((.init(kind: .room, id: room.id), 0)) }
            }
        }
        return results.sorted { $0.1 < $1.1 }.map(\.0)
    }
    private func distance(_ p: CGPoint, _ a: CGPoint, _ b: CGPoint) -> CGFloat {
        let dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy
        let t = length > 0 ? max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0
        return hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
    }
    @objc private func tap(_ recognizer: UITapGestureRecognizer) {
        guard let floor else { return }
        let point = recognizer.location(in: self)
        if tool == .area {
            guard mutationEnabled, (areaDraft?.points.count ?? 0) < 1000 else { return }
            areaDraft?.points.append(world(point)); setNeedsDisplay(); return
        }
        if tool == .draw {
            guard mutationEnabled else { return }
            let candidates = drawingCandidates(at: point), intended = world(point)
            if candidates.count > 1 {
                // Never choose array-first when several explicit graph corners
                // occupy the touch target. Cancel leaves the first endpoint intact.
                chooseEndpoint?(candidates) { [weak self] node in
                    guard let self, self.floor == floor, self.tool == .draw, self.mutationEnabled else { return }
                    self.commitDrawEndpoint(node: node, intended: intended, floor: floor)
                }
            } else { commitDrawEndpoint(node: candidates.first, intended: intended, floor: floor) }
            return
        }
        var candidates = hits(point)
        if tool == .opening { candidates = candidates.filter { $0.kind == .wall || $0.kind == .opening } }
        if tool == .label { candidates = candidates.filter { $0.kind == .room || $0.kind == .area } }
        if candidates.count > 1 { choose?(candidates) }
        else { changedSelection?(candidates.first); if tool != .select, !candidates.isEmpty { showDetails?() } }
    }
    /// Internal for native regression tests. Sorting guides the explicit chooser;
    /// multiple candidates still require a choice, never implicit nearest snapping.
    func drawingCandidates(at point: CGPoint) -> [Node] {
        framing()
        return (floor?.nodes ?? []).map { node in
            let at = screen(node.point)
            return (node, hypot(at.x - point.x, at.y - point.y))
        }.filter { $0.1 <= 22 }.sorted { $0.1 == $1.1 ? $0.0.id < $1.0.id : $0.1 < $1.1 }.map(\.0)
    }
    private func commitDrawEndpoint(node: Node?, intended: Point2, floor: Floor) {
        let end = node?.point ?? intended
        guard let start = firstDraw else { firstDraw = (end, node?.id); setNeedsDisplay(); return }
        firstDraw = nil
        guard start.0.distance(to: end) > Geometry.epsilon else { setNeedsDisplay(); return }
        let aID = start.1 ?? UUID().uuidString, bID = node?.id ?? UUID().uuidString
        var nodes: [Node] = []
        if start.1 == nil { nodes.append(.init(id: aID, point: start.0)) }
        if node == nil { nodes.append(.init(id: bID, point: end)) }
        edit?(.addWall(floorID: floor.id, wall: .init(id: UUID().uuidString, nodeIDs: [aID, bID], height: 2.4, heightBasis: .assumed, provenance: .init(origin: .edited)), newNodes: nodes))
        setNeedsDisplay()
    }
    @objc private func navigate(_ recognizer: UIPanGestureRecognizer) {
        let delta = recognizer.translation(in: self); pan.x += delta.x; pan.y += delta.y; recognizer.setTranslation(.zero, in: self); setNeedsDisplay()
    }
    @objc private func pinch(_ recognizer: UIPinchGestureRecognizer) {
        zoom = max(0.2, min(15, zoom * recognizer.scale)); recognizer.scale = 1; setNeedsDisplay()
    }
    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard mutationEnabled, tool == .select, let selection,
              [.node, .wall].contains(selection.kind) else { return false }
        return hits(gestureRecognizer.location(in: self)).contains(selection)
    }
    @objc private func drag(_ recognizer: UIPanGestureRecognizer) {
        guard mutationEnabled, let floor, let selection else { draggedPoint = nil; dragOrigin = nil; setNeedsDisplay(); return }
        if recognizer.state == .cancelled || recognizer.state == .failed { draggedPoint = nil; dragOrigin = nil; setNeedsDisplay(); return }
        if recognizer.state == .began { dragOrigin = world(recognizer.location(in: self)) }
        draggedPoint = world(recognizer.location(in: self))
        if recognizer.state == .ended, let point = draggedPoint {
            if selection.kind == .node { edit?(.moveNode(floorID: floor.id, nodeID: selection.id, point: point)) }
            else if selection.kind == .wall, let origin = dragOrigin { edit?(.moveWall(floorID: floor.id, wallID: selection.id, translation: .init(x: point.x-origin.x, z: point.z-origin.z))) }
            draggedPoint = nil; dragOrigin = nil
        }
        setNeedsDisplay()
    }
}
