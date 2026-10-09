import SwiftUI
import RealityKit
import SpatialCore
import simd

@MainActor
final class OrbitState: ObservableObject {
    enum Command { case startRoom(String), chooseFloor, cancelPlacement, exit, reset, forward(Double), turn(Double), look(Double) }
    var yaw: Float = .pi / 4
    var pitch: Float = .pi / 3
    var radius: Float = 10
    var target = SIMD3<Float>(repeating: 0)
    var floorKey: String?
    var resetID = 0
    var walkPosition: WalkPosition?
    var walkStart: WalkPosition?
    var walkYaw: Double = 0
    var walkPitch: Double = -0.18
    var command: Command?
    @Published var commandID = 0
    @Published var walking = false
    @Published var walkRoomID: String?
    @Published var walkSelect = false
    @Published var choosingPlacement = false
    @Published var cutaway = true
    @Published var ceilings = false
    @Published var available = false
    @Published var ceilingCount = 0
    @Published var status = "Preparing geometric model"
    @Published var cutawayExplanation = ""
    func request(_ command: Command) { self.command = command; commandID += 1 }
}

/// Real non-AR native geometry viewer. No camera or sensor simulation is involved.
@MainActor
struct SpatialModelView: View {
    let document: SpatialDocument
    let floorID: String
    let selection: ObjectSelection?
    let edgesOnly: Bool
    let resetID: Int
    @ObservedObject var state: OrbitState
    let selected: (ObjectSelection?) -> Void
    let failed: (String) -> Void
    var choose: (([ObjectSelection]) -> Void)? = nil
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    private var floor: Floor? { document.floors.first { $0.id == floorID } }
    var body: some View {
        VStack(spacing: 0) {
            SpatialModelSurface(document: document, floorID: floorID, selection: selection, edgesOnly: edgesOnly,
                                resetID: resetID, state: state, reduceMotion: reduceMotion, darkMode: colorScheme == .dark,
                                selected: selected, failed: failed, choose: choose)
                .overlay(alignment: .topLeading) {
                    if state.choosingPlacement {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Tap a clear floor position to start walking.").font(.callout)
                            Button("Cancel placement") { state.request(.cancelPlacement) }.frame(minHeight: 44)
                        }.padding(10).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12)).padding(8)
                    }
                }
            VStack(alignment: .leading, spacing: 4) {
                // Recovery controls never scroll out of the touch-accessible area.
                HStack(spacing: 8) {
                    if state.walking {
                        control("Exit walk", "rectangle.portrait.and.arrow.right") { state.request(.exit) }
                    }
                    control(state.walking ? "Reset walk" : "Reset view", "arrow.counterclockwise") { state.request(.reset) }
                    Spacer(minLength: 0)
                }.padding(.horizontal, 10)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        if state.walking {
                            roomMenu
                            control("Turn left", "arrow.turn.up.left") { state.request(.turn(-.pi / 12)) }
                            control("Forward", "arrow.up") { state.request(.forward(0.55)) }
                            control("Back", "arrow.down") { state.request(.forward(-0.55)) }
                            control("Turn right", "arrow.turn.up.right") { state.request(.turn(.pi / 12)) }
                            control("Look up", "chevron.up") { state.request(.look(0.15)) }
                            control("Look down", "chevron.down") { state.request(.look(-0.15)) }
                            Toggle(state.walkSelect ? "Tap: Select" : "Tap: Move", isOn: $state.walkSelect)
                                .toggleStyle(.button).frame(minHeight: 44)
                                .accessibilityHint("Switch between choosing geometry and moving to a visible floor point.")
                        } else {
                            if let selection, selection.kind == .room, floor?.rooms.contains(where: { $0.id == selection.id }) == true {
                                control("Walk selected room", "figure.walk") { state.request(.startRoom(selection.id)) }.disabled(!state.available)
                            }
                            roomMenu
                            control("Place on floor", "mappin.and.ellipse") { state.request(.chooseFloor) }.disabled(!state.available)
                            Toggle("Cutaway", isOn: $state.cutaway).toggleStyle(.button).frame(minHeight: 44)
                                .accessibilityHint("Hides only wall faces obstructing the viewpoint. Outlines remain.")
                        }
                        Toggle("Display ceilings", isOn: $state.ceilings).toggleStyle(.button).frame(minHeight: 44)
                            .disabled(state.ceilingCount == 0)
                            .accessibilityHint("Assumed display planes from level wall tops, not captured ceiling measurements.")
                    }.padding(.horizontal, 10)
                }
                Text(state.status).font(.caption).padding(.horizontal, 10).fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Navigation status. " + state.status)
                if !state.walking && state.cutaway {
                    Text(state.cutawayExplanation).font(.caption2).foregroundStyle(.secondary).padding(.horizontal, 10)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if state.ceilings {
                    Text("Display ceilings use level wall tops. Rooms with differing top heights remain open.")
                        .font(.caption2).foregroundStyle(.secondary).padding(.horizontal, 10).fixedSize(horizontal: false, vertical: true)
                }
            }.padding(.vertical, 6).background(.regularMaterial)
        }
    }
    private var roomMenu: some View {
        Menu {
            ForEach(floor?.rooms ?? [], id: \.id) { room in
                Button((state.walking ? "Jump to " : "Start in ") + room.label) { state.request(.startRoom(room.id)) }
            }
        } label: {
            Label(state.walking ? "Jump to room" : "Walk in room", systemImage: "door.left.hand.open").frame(minHeight: 44)
        }.buttonStyle(.bordered).disabled(!state.available || (floor?.rooms.isEmpty ?? true))
            .accessibilityHint("Explicit placement in a named modeled room. This does not establish a connection between rooms.")
    }
    private func control(_ title: String, _ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Label(title, systemImage: symbol).frame(minWidth: 44, minHeight: 44) }.buttonStyle(.bordered)
    }
}

@MainActor
private struct SpatialModelSurface: UIViewRepresentable {
    let document: SpatialDocument
    let floorID: String
    let selection: ObjectSelection?
    let edgesOnly: Bool
    let resetID: Int
    let state: OrbitState
    let reduceMotion: Bool
    let darkMode: Bool
    let selected: (ObjectSelection?) -> Void
    let failed: (String) -> Void
    let choose: (([ObjectSelection]) -> Void)?
    func makeCoordinator() -> Coordinator { Coordinator(state: state) }
    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero, cameraMode: .nonAR, automaticallyConfigureSession: false)
        context.coordinator.install(view); return view
    }
    func updateUIView(_ view: ARView, context: Context) {
        context.coordinator.selected = selected; context.coordinator.failed = failed
        context.coordinator.choose = choose
        context.coordinator.reduceMotion = reduceMotion
        context.coordinator.darkMode = darkMode
        context.coordinator.update(document: document, floorID: floorID, selection: selection, edgesOnly: edgesOnly, resetID: resetID)
    }
    static func dismantleUIView(_ view: ARView, coordinator: Coordinator) {
        coordinator.buildTask?.cancel(); coordinator.geometryTask?.cancel(); coordinator.motionTask?.cancel()
        view.session.pause(); view.scene.anchors.removeAll(); coordinator.view = nil
    }

    @MainActor
    final class Coordinator: NSObject {
        let state: OrbitState
        weak var view: ARView?
        private let anchor = AnchorEntity(world: .zero)
        private let camera = PerspectiveCamera()
        private var root: Entity?
        private var scene: GraphicScene?
        private var ceilings: [SceneFace] = []
        private var navigation: WalkNavigation?
        private var floor: Floor?
        private var revisionKey = ""
        private var renderedKey = ""
        private var latestSelection: ObjectSelection?
        private var latestEdgesOnly = false
        private var edgeRoles: [String: String] = [:]
        private var nodeHighlight: ModelEntity?
        private var consumedCommand = 0
        private var queuedResetID: Int?
        private var presentationKey = ""
        private var hiddenWalls: Set<String> = []
        private var hiddenCeilings: Set<String> = []
        private var focusKey = ""
        private var selectedRoomFocus: Point3?
        var buildTask: Task<Void, Never>?
        var geometryTask: Task<(GraphicScene, [SceneFace], WalkNavigation?), Error>?
        var motionTask: Task<Void, Never>?
        var selected: ((ObjectSelection?) -> Void)?
        var failed: ((String) -> Void)?
        var choose: (([ObjectSelection]) -> Void)?
        var reduceMotion = false
        var darkMode = false
        init(state: OrbitState) { self.state = state; consumedCommand = state.commandID }
        func install(_ view: ARView) {
            self.view = view; view.environment.background = .color(.systemBackground)
            camera.camera.fieldOfViewInDegrees = 50; camera.camera.near = 0.03; camera.camera.far = 2_000
            anchor.addChild(camera); view.scene.addAnchor(anchor)
            let orbit = UIPanGestureRecognizer(target: self, action: #selector(orbit(_:))); orbit.maximumNumberOfTouches = 1
            let pan = UIPanGestureRecognizer(target: self, action: #selector(pan(_:))); pan.minimumNumberOfTouches = 2
            let pinch = UIPinchGestureRecognizer(target: self, action: #selector(zoom(_:)))
            let tap = UITapGestureRecognizer(target: self, action: #selector(tap(_:)))
            view.addGestureRecognizer(orbit); view.addGestureRecognizer(pan); view.addGestureRecognizer(pinch); view.addGestureRecognizer(tap)
            view.isAccessibilityElement = true; view.accessibilityLabel = "Interactive geometric 3D model"
            view.accessibilityHint = "Use the labeled navigation controls below, or Objects for accessible selection. Model axes do not indicate GPS north."
        }
        func update(document: SpatialDocument, floorID: String, selection: ObjectSelection?, edgesOnly: Bool, resetID: Int) {
            latestSelection = selection; latestEdgesOnly = edgesOnly
            let key = document.documentID + ":" + floorID + ":" + String(document.revision)
            if revisionKey != key {
                revisionKey = key; buildTask?.cancel(); geometryTask?.cancel(); motionTask?.cancel(); navigation = nil
                nodeHighlight?.isEnabled = false
                buildTask = Task { [weak self] in
                    guard let self, !Task.isCancelled, self.revisionKey == key else { return }; self.state.available = false
                    do {
                        let work = Task.detached(priority: .userInitiated) {
                            try Task.checkCancellation()
                            let scene = try SceneBuilder.build(document: document, floorID: floorID)
                            try Task.checkCancellation()
                            let ceiling = try DisplayCeilings.build(document: document, floorID: floorID)
                            try Task.checkCancellation()
                            let navigation = try? WalkNavigation(document: document, floorID: floorID)
                            try Task.checkCancellation()
                            return (scene, ceiling, navigation)
                        }
                        self.geometryTask = work
                        let built = try await work.value
                        guard !Task.isCancelled, self.revisionKey == key else { return }
                        let model = try RealityKitSceneFactory.make(built.0, ceilings: built.1)
                        self.root?.removeFromParent()
                        self.root = model; self.scene = built.0; self.ceilings = built.1; self.navigation = built.2; self.renderedKey = key
                        self.floor = document.floors.first { $0.id == floorID }; self.anchor.addChild(model)
                        self.edgeRoles = Dictionary(built.0.edges.map { ($0.objectID, $0.role) }, uniquingKeysWith: { first, _ in first })
                        let floorKey = document.documentID + ":" + floorID
                        if self.state.floorKey != floorKey { self.state.floorKey = floorKey; self.exitWalk(); self.frame() }
                        else if let old = self.state.walkPosition {
                            if let nav = built.2, let restored = try? nav.place(inRoom: old.roomID, at: old.point) {
                                self.setWalk(restored)
                                if self.state.walkStart?.revision != restored.revision { self.state.walkStart = restored }
                            } else { self.exitWalk(); self.state.status = "The layout changed. Choose a clear starting room again." }
                        }
                        self.state.available = built.2 != nil && !(built.2?.roomIDs.isEmpty ?? true)
                        self.state.ceilingCount = built.1.count; self.presentationKey = ""; self.focusKey = ""
                        self.updateFocus(); self.positionCamera(); self.present()
                        if !self.state.walking { self.state.status = self.state.available ? self.overviewHint : "No navigable closed room is available. Correct room boundaries before walking." }
                        if self.queuedResetID != nil { self.reset(); self.queuedResetID = nil }
                    } catch {
                        guard !Task.isCancelled, self.revisionKey == key else { return }
                        self.root?.removeFromParent(); self.root = nil; self.exitWalk(); self.state.available = false
                        self.state.status = "This revision could not be rendered. The saved layout remains available."
                        self.failed?(self.state.status + " " + String(describing: error))
                    }
                }
            }
            // Published control feedback occurs outside SwiftUI's update pass.
            if state.resetID != resetID {
                state.resetID = resetID
                Task { [weak self] in guard let self else { return }; if self.root == nil { self.queuedResetID = resetID } else { self.reset() } }
            }
            if consumedCommand != state.commandID {
                consumedCommand = state.commandID; let command = state.command
                Task { [weak self] in if let command, self?.revisionKey == key { self?.perform(command) } }
            }
            updateFocus(); positionCamera(); present(); view?.environment.background = .color(.systemBackground)
        }
        private var overviewHint: String { "One finger orbits. Two fingers pan. Pinch zooms. Choose a room or floor position to walk." }
        private func frame() {
            guard let floor, !floor.nodes.isEmpty else { return }
            let xs = floor.nodes.map(\.point.x), zs = floor.nodes.map(\.point.z)
            let minX = xs.min()!, maxX = xs.max()!, minZ = zs.min()!, maxZ = zs.max()!
            state.target = .init(Float((minX + maxX) / 2), Float(floor.elevation + 0.4), Float((minZ + maxZ) / 2))
            state.radius = Float(max(maxX - minX, maxZ - minZ, 2)) * 1.7; state.yaw = .pi / 4; state.pitch = .pi / 3
        }
        private func perform(_ command: OrbitState.Command) {
            do {
                switch command {
                case .startRoom(let id):
                    guard let navigation else { return }; motionTask?.cancel()
                    let start = try navigation.place(inRoom: id)
                    state.walkStart = start; state.walkYaw = 0; state.walkPitch = -0.18
                    setWalk(start); selected?(.init(kind: .room, id: id))
                    state.status = "Placed in \(roomLabel(id)). Tap the floor to move. Drag to look. Windows and unknown boundaries block movement."
                case .chooseFloor: exitWalk(); state.choosingPlacement = true; state.status = "Choose a visible floor point inside a modeled room."
                case .cancelPlacement: state.choosingPlacement = false; state.status = overviewHint
                case .exit: exitWalk()
                case .reset: reset()
                case .forward(let distance):
                    guard let start = state.walkPosition else { return }
                    move(to: .init(x: start.point.x + sin(state.walkYaw) * distance, z: start.point.z - cos(state.walkYaw) * distance))
                case .turn(let angle): state.walkYaw = (state.walkYaw + angle).truncatingRemainder(dividingBy: .pi * 2)
                case .look(let angle): state.walkPitch = max(-1.1, min(0.45, state.walkPitch + angle))
                }
                positionCamera(); present()
            } catch { state.status = String(describing: error); announce(state.status) }
        }
        private func setWalk(_ position: WalkPosition) {
            state.walkPosition = position; state.walking = true; state.walkRoomID = position.roomID; state.choosingPlacement = false
        }
        private func exitWalk() {
            motionTask?.cancel(); state.walkPosition = nil; state.walkStart = nil; state.walking = false
            state.walkRoomID = nil; state.choosingPlacement = false; state.walkSelect = false; state.status = overviewHint
        }
        private func reset() {
            motionTask?.cancel()
            if let start = state.walkStart, let navigation, let restored = try? navigation.place(inRoom: start.roomID, at: start.point) {
                setWalk(restored); state.walkYaw = 0; state.walkPitch = -0.18
                state.status = "Reset to \(roomLabel(restored.roomID))."; selected?(.init(kind: .room, id: restored.roomID))
            } else { exitWalk(); frame() }
            positionCamera(); present()
        }
        private func roomLabel(_ id: String) -> String { floor?.rooms.first { $0.id == id }?.label ?? "selected room" }
        private func updateFocus() {
            let key = revisionKey + ":" + (latestSelection?.kind.rawValue ?? "") + ":" + (latestSelection?.id ?? "")
            guard key != focusKey else { return }; focusKey = key; selectedRoomFocus = nil
            if let selection = latestSelection, selection.kind == .room, let navigation,
               let start = try? navigation.place(inRoom: selection.id) {
                selectedRoomFocus = .init(x: start.point.x, y: (floor?.elevation ?? 0) + 0.4, z: start.point.z)
            }
        }
        private func present() {
            guard let root, let scene else { return }
            let newCutaway: CutawayResult
            if !state.walking && state.cutaway && !latestEdgesOnly {
                let eye = camera.position(relativeTo: nil)
                let focus = selectedRoomFocus ?? Point3(x: Double(state.target.x), y: Double(state.target.y), z: Double(state.target.z))
                newCutaway = CutawayVisibility.evaluate(scene: scene, camera: .init(x: Double(eye.x), y: Double(eye.y), z: Double(eye.z)), focus: focus,
                                                       ceilings: state.ceilings ? ceilings : [])
            } else { newCutaway = .init(hiddenWallIDs: [], hiddenCeilingRoomIDs: [], explanation: latestEdgesOnly ? "Edges-only is a display mode, not cutaway." : "") }
            hiddenWalls = newCutaway.hiddenWallIDs; hiddenCeilings = newCutaway.hiddenCeilingRoomIDs
            let key = "\(latestSelection?.kind.rawValue ?? ""):" + (latestSelection?.id ?? "") + ":\(state.walking):\(latestEdgesOnly):\(state.ceilings):" +
                hiddenWalls.sorted().joined(separator: "|") + ":" + hiddenCeilings.sorted().joined(separator: "|") + ":\(darkMode)"
            if state.cutawayExplanation != newCutaway.explanation {
                let explanation = newCutaway.explanation
                Task { [weak self] in self?.state.cutawayExplanation = explanation }
            }
            guard presentationKey != key else { return }; presentationKey = key
            var materials: [String: UnlitMaterial] = [:]
            for case let entity as ModelEntity in root.children {
                guard let identity = RealityKitSceneFactory.identity(of: entity) else { continue }
                if identity.role == "wall" { entity.isEnabled = state.walking || (!latestEdgesOnly && !hiddenWalls.contains(identity.objectID)) }
                else if identity.role == "ceiling" { entity.isEnabled = state.ceilings && !hiddenCeilings.contains(identity.objectID) }
                else { entity.isEnabled = true }
                if let selection = latestSelection, selection.kind != .node, identity.objectID == selection.id {
                    var highlight = UnlitMaterial(color: .systemBlue); highlight.faceCulling = .none
                    entity.model?.materials = [highlight]
                }
                else {
                    let role = identity.role == "edge" ? (edgeRoles[identity.objectID] == "window" ? "windowEdge" : (edgeRoles[identity.objectID] == "area" ? "areaEdge" : "edge")) : identity.role
                    let material = materials[role] ?? RealityKitSceneFactory.material(role: role, darkMode: darkMode)
                    materials[role] = material; entity.model?.materials = [material]
                }
            }
            if let selection = latestSelection, selection.kind == .node,
               let node = floor?.nodes.first(where: { $0.id == selection.id }), let floor {
                if nodeHighlight == nil {
                    nodeHighlight = ModelEntity(mesh: .generateSphere(radius: 0.06), materials: [UnlitMaterial(color: .systemBlue)])
                    anchor.addChild(nodeHighlight!)
                }
                nodeHighlight?.position = .init(Float(node.point.x), Float(floor.elevation + 0.05), Float(node.point.z))
                nodeHighlight?.name = "node:" + node.id; nodeHighlight?.isEnabled = true
            } else { nodeHighlight?.isEnabled = false }
        }
        private func positionCamera() {
            if let walk = state.walkPosition {
                let from = SIMD3<Float>(Float(walk.point.x), Float(walk.eyeY), Float(walk.point.z))
                let direction = SIMD3<Float>(Float(sin(state.walkYaw) * cos(state.walkPitch)), Float(sin(state.walkPitch)), Float(-cos(state.walkYaw) * cos(state.walkPitch)))
                camera.look(at: from + direction, from: from, relativeTo: nil)
            } else {
                let horizontal = state.radius * cos(state.pitch)
                let offset = SIMD3<Float>(horizontal * sin(state.yaw), state.radius * sin(state.pitch), horizontal * cos(state.yaw))
                camera.look(at: state.target, from: state.target + offset, relativeTo: nil)
            }
        }
        private func move(to point: Point2) {
            guard let navigation, let start = state.walkPosition else { return }; motionTask?.cancel()
            do {
                let result = try navigation.move(from: start, toward: point)
                let message: String
                switch result.stop {
                case .wall: message = "Stopped at a wall, window, or restricted opening."
                case .unknownBoundary: message = "Stopped at an unknown or disconnected boundary."
                case .ambiguousRooms: message = "Stopped where room boundaries overlap. Correct this area before walking."
                case .requestTooLong: message = "Choose a closer floor point."
                case .invalidTarget: message = "Choose a visible floor point."
                case nil: message = "In \(roomLabel(result.position.roomID)). Tap the floor to move. Drag to look."
                }
                if reduceMotion || start.point.distance(to: result.position.point) < 0.01 {
                    setWalk(result.position); state.status = message; selected?(.init(kind: .room, id: result.position.roomID)); positionCamera()
                    if result.stop != nil { announce(message) }
                } else {
                    let key = revisionKey
                    motionTask = Task { [weak self] in
                        guard let self else { return }
                        // Finite animation only. No perpetual idle render/update loop.
                        for index in 1...18 {
                            do { try await Task.sleep(nanoseconds: 16_000_000) } catch { return }
                            guard !Task.isCancelled, self.revisionKey == key, self.state.walking else { return }
                            let t = Double(index) / 18
                            let intermediate = Point2(x: start.point.x + (result.position.point.x - start.point.x) * t,
                                                      z: start.point.z + (result.position.point.z - start.point.z) * t)
                            guard let partial = try? navigation.move(from: start, toward: intermediate) else { return }
                            // Keep the displayed position when a view switch cancels
                            // movement, without publishing 60 SwiftUI changes/sec.
                            self.state.walkPosition = partial.position; self.positionCamera()
                        }
                        self.setWalk(result.position); self.state.status = message
                        self.selected?(.init(kind: .room, id: result.position.roomID))
                        if result.stop != nil { self.announce(message) }
                    }
                }
            } catch { state.status = String(describing: error); announce(state.status) }
        }
        private func announce(_ message: String) { UIAccessibility.post(notification: .announcement, argument: message) }
        @objc private func orbit(_ gesture: UIPanGestureRecognizer) {
            guard let view else { return }; let delta = gesture.translation(in: view); gesture.setTranslation(.zero, in: view)
            if state.walking {
                state.walkYaw = (state.walkYaw + Double(delta.x) * 0.006).truncatingRemainder(dividingBy: .pi * 2)
                state.walkPitch = max(-1.1, min(0.45, state.walkPitch - Double(delta.y) * 0.006))
            } else {
                state.yaw -= Float(delta.x) * 0.006
                state.pitch = max(0.08, min(.pi / 2 - 0.02, state.pitch + Float(delta.y) * 0.006))
            }
            positionCamera(); present()
        }
        @objc private func pan(_ gesture: UIPanGestureRecognizer) {
            guard let view, !state.walking else { return }; let delta = gesture.translation(in: view); gesture.setTranslation(.zero, in: view)
            let scale = state.radius * 0.0015
            state.target += SIMD3<Float>(-Float(delta.x) * cos(state.yaw) - Float(delta.y) * sin(state.yaw), 0,
                                         Float(delta.x) * sin(state.yaw) - Float(delta.y) * cos(state.yaw)) * scale
            positionCamera(); present()
        }
        @objc private func zoom(_ gesture: UIPinchGestureRecognizer) {
            guard !state.walking else { gesture.scale = 1; return }
            state.radius = max(0.5, min(500, state.radius / Float(gesture.scale))); gesture.scale = 1; positionCamera(); present()
        }
        private func floorPoint(_ screen: CGPoint, visibleOnly: Bool = false) -> Point2? {
            guard let view, let floor, let ray = view.ray(through: screen), abs(ray.direction.y) > 0.00001 else { return nil }
            if visibleOnly {
                guard let scene else { return nil }
                let invisible = latestEdgesOnly ? Set(floor.walls.map(\.id)) : hiddenWalls
                guard let hit = SceneRayPicker.nearest(scene: scene,
                    origin: .init(x: Double(ray.origin.x), y: Double(ray.origin.y), z: Double(ray.origin.z)),
                    direction: .init(x: Double(ray.direction.x), y: Double(ray.direction.y), z: Double(ray.direction.z)),
                    hiddenWalls: invisible, ceilings: state.ceilings ? ceilings : [], hiddenCeilings: hiddenCeilings), hit.role == "floor" else { return nil }
                return .init(x: hit.point.x, z: hit.point.z)
            }
            let t = (Float(floor.elevation) - ray.origin.y) / ray.direction.y
            guard t > 0, t.isFinite, t <= 200 else { return nil }
            let point = ray.origin + ray.direction * t; return .init(x: Double(point.x), z: Double(point.z))
        }
        @objc private func tap(_ gesture: UITapGestureRecognizer) {
            guard let view, renderedKey == revisionKey else { return }; let screen = gesture.location(in: view)
            if state.choosingPlacement {
                guard let navigation, let point = floorPoint(screen, visibleOnly: true) else { state.status = "Tap a visible floor surface, not a wall or ceiling. Orbit or enable Cutaway to expose the room."; return }
                do {
                    let start = try navigation.place(at: point)
                    state.walkStart = start; state.walkYaw = 0; state.walkPitch = -0.18; setWalk(start)
                    selected?(.init(kind: .room, id: start.roomID))
                    state.status = "Placed in \(roomLabel(start.roomID)). Tap the floor to move. Drag to look."
                    positionCamera(); present()
                } catch { state.status = String(describing: error); announce(state.status) }; return
            }
            if state.walking && !state.walkSelect {
                guard let point = floorPoint(screen) else { state.status = "Tap the floor below the horizon, or use Forward and Back."; return }
                move(to: point); return
            }
            pick(at: screen)
        }
        private func pick(at screen: CGPoint) {
            guard renderedKey == revisionKey, let view, let scene, let floor, let ray = view.ray(through: screen) else { selected?(nil); return }
            func point(_ v: SIMD3<Float>) -> Point3 { .init(x: Double(v.x), y: Double(v.y), z: Double(v.z)) }
            func vector(_ p: Point3) -> SIMD3<Float> { .init(Float(p.x), Float(p.y), Float(p.z)) }
            func object(_ id: String) -> ObjectSelection? {
                if floor.rooms.contains(where: { $0.id == id }) { return .init(kind: .room, id: id) }
                if floor.openings.contains(where: { $0.id == id }) { return .init(kind: .opening, id: id) }
                if floor.walls.contains(where: { $0.id == id }) { return .init(kind: .wall, id: id) }
                if floor.areas.contains(where: { $0.id == id }) { return .init(kind: .area, id: id) }
                if floor.nodes.contains(where: { $0.id == id }) { return .init(kind: .node, id: id) }
                return nil
            }
            let invisibleWalls = !state.walking && latestEdgesOnly ? Set(floor.walls.map(\.id)) : hiddenWalls
            let shownCeilings = state.ceilings ? ceilings : []
            let nearest = SceneRayPicker.nearest(scene: scene, origin: point(ray.origin), direction: point(ray.direction),
                                                 hiddenWalls: invisibleWalls, ceilings: shownCeilings, hiddenCeilings: hiddenCeilings)
            // Screen-space edge targets are 44 points across even though their
            // architectural strokes are thin. Depth tests prevent rear-edge X-ray selection.
            let forward = camera.orientation(relativeTo: nil).act(SIMD3<Float>(0, 0, -1))
            var candidates: [(id: String, kind: ObjectSelection.Kind?, distance: CGFloat, position: SIMD3<Float>)] = []
            for edge in scene.edges {
                let a = vector(edge.a), b = vector(edge.b)
                let za = simd_dot(a - ray.origin, forward), zb = simd_dot(b - ray.origin, forward)
                guard za > 0.03, zb > 0.03, let pa = view.project(a), let pb = view.project(b) else { continue }
                let dx = pb.x - pa.x, dy = pb.y - pa.y, length2 = dx * dx + dy * dy
                let t = length2 > 0 ? max(0, min(1, ((screen.x - pa.x) * dx + (screen.y - pa.y) * dy) / length2)) : 0
                let distance = hypot(screen.x - pa.x - t * dx, screen.y - pa.y - t * dy)
                guard distance <= 22 else { continue }
                let worldT = (Float(t) / zb) / ((1 - Float(t)) / za + Float(t) / zb)
                candidates.append((edge.objectID, nil, distance, a + (b - a) * worldT))
            }
            for node in floor.nodes {
                let position = SIMD3<Float>(Float(node.point.x), Float(floor.elevation + 0.025), Float(node.point.z))
                guard simd_dot(position - ray.origin, forward) > 0.03, let projected = view.project(position) else { continue }
                let distance = hypot(screen.x - projected.x, screen.y - projected.y)
                if distance <= 22 { candidates.append((node.id, .node, distance, position)) }
            }
            var objects: [ObjectSelection] = []
            for candidate in candidates.sorted(by: { $0.distance < $1.distance }).prefix(32) {
                let direction = candidate.position - ray.origin, distance = simd_length(direction)
                let obstruction = SceneRayPicker.nearest(scene: scene, origin: point(ray.origin), direction: point(direction),
                                                         hiddenWalls: invisibleWalls, ceilings: shownCeilings, hiddenCeilings: hiddenCeilings)
                guard obstruction == nil || obstruction!.distance >= Double(distance) - 0.025 else { continue }
                let selection = candidate.kind.map { ObjectSelection(kind: $0, id: candidate.id) } ?? object(candidate.id)
                if let selection, !objects.contains(selection) { objects.append(selection) }
            }
            if let nearest, let object = object(nearest.objectID), !objects.contains(object) { objects.append(object) }
            if objects.count > 1, let choose { choose(objects) } else { selected?(objects.first) }
        }
    }
}
