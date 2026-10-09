import SwiftUI
import SpatialCore

struct ObjectInspector: View {
    @ObservedObject var model: EditorModel
    @Environment(\.dismiss) private var dismiss
    @State private var label = ""
    @State private var openingKind: OpeningKind = .door
    @State private var mergeTarget: String?
    @State private var editingBoundary = false
    var body: some View {
        NavigationStack {
            Form {
                Group {
                if let floor = model.floor, let selection = model.selection {
                    switch selection.kind {
                    case .room:
                        if let room = floor.rooms.first(where: { $0.id == selection.id }) {
                            Section("Room label") {
                                TextField("Label", text: $label).textInputAutocapitalization(.words)
                                Button("Save label") { perform(.renameRoom(floorID: floor.id, roomID: room.id, label: label)) }.frame(minHeight: 44)
                            }.onAppear { label = room.label }
                            Button("Remove room label and floor region", role: .destructive) { perform(.deleteRoom(floorID: floor.id, roomID: room.id), close: true) }.frame(minHeight: 44)
                            Text("Walls remain. This reversible edit changes the modeled room region.").font(.footnote)
                            Section("Physical room corrections") {
                                Button("Edit room boundary") { editingBoundary = true }.frame(minHeight: 44)
                                Menu("Split using a drawn partition") {
                                    ForEach(Array(floor.walls.enumerated()).filter { entry in !floor.rooms.contains(where: { $0.boundary.contains(where: { $0.wallID == entry.element.id }) }) }, id: \.element.id) { index, wall in
                                        Button("Use wall \(index+1)") { perform(.splitRoom(floorID: floor.id, roomID: room.id, dividerWallID: wall.id, newRoomID: UUID().uuidString, newLabel: "New room")) }
                                    }
                                }.frame(minHeight: 44)
                                Text("Draw an internal partition between explicit boundary corners first. A split outside the room is rejected.").font(.footnote)
                                Menu("Merge with adjacent room") {
                                    ForEach(floor.rooms.filter { other in other.id != room.id && !Set(room.boundary.map(\.wallID)).isDisjoint(with: other.boundary.map(\.wallID)) }, id: \.id) { other in
                                        Button(other.label) { mergeTarget = other.id }
                                    }
                                }.frame(minHeight: 44)
                                Text("Merging removes the shared physical partition and its hosted openings. Use a semantic area when only a label or work zone is needed.").font(.footnote)
                            }
                        }
                    case .area:
                        if let area = floor.areas.first(where: { $0.id == selection.id }) { SemanticAreaInspector(model: model, area: area).id(area.id) }
                    case .node:
                        if let node = floor.nodes.first(where: { $0.id == selection.id }) {
                            Section("Adjust corner") {
                                Text("Small display steps. These controls do not verify field measurements.").font(.footnote)
                                nudge { dx, dz in perform(.moveNode(floorID: floor.id, nodeID: node.id, point: .init(x: node.point.x + dx, z: node.point.z + dz))) }
                            }
                            Section("Connect to an existing corner") {
                                Menu("Choose the corner to join") {
                                    ForEach(Array(floor.nodes.enumerated()).filter { $0.element.id != node.id }, id: \.element.id) { index, target in
                                        Button("Corner \(index + 1)") { perform(.mergeNodes(floorID: floor.id, sourceNodeID: node.id, targetNodeID: target.id), close: true) }
                                    }
                                }.frame(minHeight: 44)
                                Text("This explicitly joins the selected node to the chosen node. Invalid connections are rejected. Undo restores the earlier revision.").font(.footnote)
                            }
                            Section("Disconnect a wall at this corner") {
                                Menu("Choose the wall to detach") {
                                    ForEach(Array(floor.walls.enumerated()).filter { $0.element.nodeIDs.contains(node.id) }, id: \.element.id) { index, wall in
                                        Button("Detach wall \(index + 1)") {
                                            perform(.disconnectNode(floorID: floor.id, wallID: wall.id, nodeID: node.id, newNodeID: UUID().uuidString))
                                        }
                                    }
                                }.frame(minHeight: 44)
                                Text("Creates an independent corner at the same position. A change that would break a room boundary is rejected; edit that boundary first.").font(.footnote)
                            }
                        }
                    case .wall:
                        if let wall = floor.walls.first(where: { $0.id == selection.id }) {
                            Section("Wall") {
                                Text("Height basis: " + wall.heightBasis.rawValue.capitalized).font(.footnote)
                                nudge { dx, dz in perform(.moveWall(floorID: floor.id, wallID: wall.id, translation: .init(x: dx, z: dz))) }
                                ForEach(wall.nodeIDs, id: \.self) { id in
                                    Button("Edit corner " + String(id.suffix(6))) { model.selection = .init(kind: .node, id: id) }.frame(minHeight: 44)
                                }
                            }
                            Section("Add opening") {
                                Picker("Kind", selection: $openingKind) { Text("Door").tag(OpeningKind.door); Text("Window").tag(OpeningKind.window); Text("Passage").tag(OpeningKind.passage) }
                                Text("The opening starts at the wall's center with editable display sizing. Check it against the property.").font(.footnote)
                                Button("Add " + openingKind.rawValue) { addOpening(wall: wall, floor: floor) }.frame(minHeight: 44)
                            }
                            Section("Wall topology") {
                                Button("Split wall at midpoint") {
                                    guard let path = try? Geometry.path(wall: wall, floor: floor) else { return }
                                    perform(.splitWall(floorID: floor.id, wallID: wall.id, offset: Geometry.pathLength(path) / 2, newWallID: UUID().uuidString, newNodeID: UUID().uuidString))
                                }.frame(minHeight: 44)
                                Menu("Join another wall") {
                                    ForEach(Array(floor.walls.enumerated()).filter { $0.element.id != wall.id }, id: \.element.id) { index, other in
                                        Button("Wall \(index + 1)") { perform(.joinWalls(floorID: floor.id, firstWallID: wall.id, secondWallID: other.id)) }
                                    }
                                }.frame(minHeight: 44)
                                Button("Delete wall", role: .destructive) { perform(.deleteWall(floorID: floor.id, wallID: wall.id), close: true) }.frame(minHeight: 44)
                                Text("Dependent room or opening geometry must stay valid. Edits that break those relationships are rejected.").font(.footnote)
                            }
                        }
                    case .opening:
                        if let opening = floor.openings.first(where: { $0.id == selection.id }),
                           let wall = floor.walls.first(where: { $0.id == opening.wallID }), let path = try? Geometry.path(wall: wall, floor: floor) {
                            Section(opening.kind.rawValue.capitalized) {
                                Picker("Opening kind", selection: Binding(get: { opening.kind }, set: { kind in var edited = opening; edited.kind = kind; perform(.updateOpening(floorID: floor.id, opening: edited)) })) {
                                    Text("Door").tag(OpeningKind.door); Text("Window").tag(OpeningKind.window); Text("Passage").tag(OpeningKind.passage)
                                }
                                Text("Move along the host wall in small display steps.").font(.footnote)
                                HStack {
                                    Button("Earlier") { perform(.moveOpening(floorID: floor.id, openingID: opening.id, offset: max(0, opening.offset - 0.05))) }.frame(minHeight: 44)
                                    Spacer()
                                    Button("Later") { perform(.moveOpening(floorID: floor.id, openingID: opening.id, offset: min(Geometry.pathLength(path) - opening.width, opening.offset + 0.05))) }.frame(minHeight: 44)
                                }
                                HStack {
                                    Button("Lower") { var edited = opening; edited.bottom -= 0.05; perform(.updateOpening(floorID: floor.id, opening: edited)) }.frame(minHeight: 44)
                                    Spacer()
                                    Button("Raise") { var edited = opening; edited.bottom += 0.05; perform(.updateOpening(floorID: floor.id, opening: edited)) }.frame(minHeight: 44)
                                }
                                HStack {
                                    Button("Shorter") { var edited = opening; edited.height -= 0.05; perform(.updateOpening(floorID: floor.id, opening: edited)) }.frame(minHeight: 44)
                                    Spacer()
                                    Button("Taller") { var edited = opening; edited.height += 0.05; perform(.updateOpening(floorID: floor.id, opening: edited)) }.frame(minHeight: 44)
                                }
                                HStack {
                                    Button("Narrower") { var edited = opening; edited.width = max(0.05, opening.width - 0.05); perform(.updateOpening(floorID: floor.id, opening: edited)) }.frame(minHeight: 44)
                                    Spacer()
                                    Button("Wider") { var edited = opening; edited.width = min(Geometry.pathLength(path) - opening.offset, opening.width + 0.05); perform(.updateOpening(floorID: floor.id, opening: edited)) }.frame(minHeight: 44)
                                }
                                Menu("Move to another host wall") {
                                    ForEach(Array(floor.walls.enumerated()).filter { $0.element.id != wall.id }, id: \.element.id) { index, target in
                                        Button("Center on wall \(index + 1)") {
                                            guard let targetPath = try? Geometry.path(wall: target, floor: floor) else { return }
                                            var edited = opening
                                            edited.wallID = target.id
                                            edited.offset = (Geometry.pathLength(targetPath) - edited.width) / 2
                                            perform(.updateOpening(floorID: floor.id, opening: edited))
                                        }
                                    }
                                }.frame(minHeight: 44)
                                Text("Changing the host preserves this opening's identity and size. The target must fit the entire opening without overlap; invalid placements are rejected.").font(.footnote)
                                Button("Delete opening", role: .destructive) { perform(.deleteOpening(floorID: floor.id, openingID: opening.id), close: true) }.frame(minHeight: 44)
                            }
                        }
                    }
                } else { Text("Choose an object in the layout or the Objects list.") }
                }.disabled(model.pendingSave || model.busy)
                if model.pendingSave {
                    Section { Text("The edit is still on screen but has not been saved."); Button("Retry save") { Task { await model.save() } }.frame(minHeight: 44) }
                }
                if let error = model.error { Section("Action needs attention") { Text(error); Button("Dismiss message") { model.error = nil }.frame(minHeight: 44) } }
            }
            .disabled(model.busy)
            .navigationTitle("Edit object").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done") { dismiss() } }
            .sheet(isPresented: $editingBoundary) { CreateRoomSheet(model: model, existingRoomID: model.selection?.id) }
            .confirmationDialog("Remove the shared partition and merge these rooms?", isPresented: Binding(get: { mergeTarget != nil }, set: { if !$0 { mergeTarget = nil } }), titleVisibility: .visible) {
                Button("Merge rooms and remove partition", role: .destructive) {
                    if let source = model.selection, let target = mergeTarget { perform(.mergeRooms(floorID: model.floorID, firstRoomID: source.id, secondRoomID: target), close: true) }
                    mergeTarget = nil
                }
                Button("Cancel", role: .cancel) { mergeTarget = nil }
            }
        }
    }
    private func nudge(_ change: @escaping (Double, Double) -> Void) -> some View {
        VStack(spacing: 8) {
            Button { change(0, -0.05) } label: { Label("Up", systemImage: "arrow.up").frame(minHeight: 44) }
            HStack {
                Button { change(-0.05, 0) } label: { Label("Left", systemImage: "arrow.left").frame(minHeight: 44) }
                Spacer()
                Button { change(0.05, 0) } label: { Label("Right", systemImage: "arrow.right").frame(minHeight: 44) }
            }
            Button { change(0, 0.05) } label: { Label("Down", systemImage: "arrow.down").frame(minHeight: 44) }
        }.buttonStyle(.bordered).disabled(model.pendingSave)
    }
    private func addOpening(wall: Wall, floor: Floor) {
        guard let path = try? Geometry.path(wall: wall, floor: floor) else { return }
        let length = Geometry.pathLength(path), width = min(0.9, length / 3)
        let bottom = openingKind == .window ? wall.height * 0.35 : 0
        let height = openingKind == .window ? wall.height * 0.4 : min(2.1, wall.height)
        let opening = Opening(id: UUID().uuidString, wallID: wall.id, kind: openingKind, offset: (length - width) / 2,
                              width: width, bottom: bottom, height: height, provenance: .init(origin: .edited))
        perform(.addOpening(floorID: floor.id, opening: opening))
    }
    private func perform(_ command: EditCommand, close: Bool = false) {
        Task { await model.apply(command); if close && model.error == nil && !model.pendingSave { dismiss() } }
    }
}

struct CreateRoomSheet: View {
    @ObservedObject var model: EditorModel
    var existingRoomID: String? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var walls = Set<String>()
    @State private var label = "Room"
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                TextField("Room label", text: $label)
                Text("Select the walls forming one closed boundary. Existing shared corner connections determine their order. Gaps and crossed boundaries are rejected.").font(.footnote)
                if let floor = model.floor {
                    ForEach(Array(floor.walls.enumerated()), id: \.element.id) { index, wall in
                        Toggle("Wall \(index + 1)", isOn: Binding(get: { walls.contains(wall.id) }, set: { if $0 { walls.insert(wall.id) } else { walls.remove(wall.id) } })).frame(minHeight: 44)
                    }
                    Button(existingRoomID == nil ? "Create room" : "Save room boundary") {
                        Task {
                            do {
                                let boundary = try RoomBoundaryBuilder.closedBoundary(wallIDs: Array(walls), floor: floor)
                                if let existingRoomID {
                                    await model.apply([.setRoomBoundary(floorID: floor.id, roomID: existingRoomID, boundary: boundary),
                                                       .renameRoom(floorID: floor.id, roomID: existingRoomID, label: label)])
                                } else {
                                    await model.apply(.addRoom(floorID: floor.id, room: .init(id: UUID().uuidString, label: label, boundary: boundary)))
                                }
                                if model.error == nil && !model.pendingSave { dismiss() }
                            } catch { self.error = String(describing: error) }
                        }
                    }.frame(minHeight: 44).disabled(walls.count < 3 || model.busy || model.pendingSave)
                }
                if let error = error ?? model.error { Text(error).foregroundStyle(.secondary) }
            }.navigationTitle(existingRoomID == nil ? "Create room" : "Edit room boundary")
                .onAppear {
                    if let room = model.floor?.rooms.first(where: { $0.id == existingRoomID }) {
                        walls = Set(room.boundary.map(\.wallID)); label = room.label
                    }
                }
                .toolbar { Button("Cancel") { dismiss() } }
        }
    }
}
