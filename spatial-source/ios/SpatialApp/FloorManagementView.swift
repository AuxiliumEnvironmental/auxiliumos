import SwiftUI
import SpatialCore

@MainActor
struct FloorManagementView: View {
    @ObservedObject var model: EditorModel
    @Environment(\.dismiss) private var dismiss
    @State private var label = ""
    @State private var elevation = "0"
    @State private var deleting: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("Selected floor") {
                    Picker("Floor", selection: $model.floorID) {
                        ForEach(model.document.floors, id: \.id) { Text($0.label).tag($0.id) }
                    }
                    TextField("Floor label", text: $label)
                    TextField("Diagram elevation", text: $elevation).keyboardType(.numbersAndPunctuation)
                    Text("Internal diagram units only. Floors are independently framed. This does not align scans or create stair connections.").font(.footnote)
                    Button("Save floor details") {
                        guard let value = Double(elevation), value.isFinite else { model.error = "Enter a finite diagram elevation."; return }
                        Task { await model.apply(.updateFloor(floorID: model.floorID, label: label, elevation: value)) }
                    }.frame(minHeight: 44)
                }
                Section("Independent floors") {
                    Button("Add blank floor") {
                        let floor = Floor(id: UUID().uuidString, label: "Floor \(model.document.floors.count + 1)", nodes: [], walls: [], openings: [], rooms: [])
                        Task { await model.apply(.addFloor(floor: floor)); if model.error == nil { model.floorID = floor.id; load() } }
                    }.frame(minHeight: 44)
                    Button("Delete selected floor", role: .destructive) { deleting = model.floorID }
                        .frame(minHeight: 44).disabled(model.document.floors.count <= 1)
                    Text("Deletion changes this draft only and can be undone. Frozen revisions and original captures remain intact.").font(.footnote)
                }
                if let error = model.error { Section("Action needs attention") { Text(error) } }
            }.disabled(model.busy || model.pendingSave)
                .navigationTitle("Manage floors").toolbar { Button("Done") { dismiss() } }
                .onAppear(perform: load).onChange(of: model.floorID) { _, _ in load() }
                .confirmationDialog("Remove the selected floor and its geometry from this draft?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
                    Button("Delete floor", role: .destructive) { if let id = deleting { Task { await model.apply(.deleteFloor(floorID: id)); deleting = nil; load() } } }
                    Button("Cancel", role: .cancel) { deleting = nil }
                }
        }
    }
    private func load() { label = model.floor?.label ?? ""; elevation = String(model.floor?.elevation ?? 0) }
}

@MainActor
struct SemanticAreaInspector: View {
    private struct DraftCorner: Identifiable { let id = UUID(); var point: Point2 }
    @ObservedObject var model: EditorModel
    let area: SemanticArea
    @State private var label = ""
    @State private var corners: [DraftCorner] = []
    var body: some View {
        Section("Semantic area") {
            Text("Dashed boundary only. It does not create walls, room connections, or measured quantities.").font(.footnote)
            TextField("Area label", text: $label)
            ForEach(Array(corners.enumerated()), id: \.element.id) { i, corner in
                VStack(alignment: .leading) {
                    Text("Corner \(i + 1)").font(.caption)
                    HStack {
                        TextField("X", value: coordinate(corner.id, \.x), format: .number).keyboardType(.numbersAndPunctuation).accessibilityLabel("Corner \(i+1) diagram X")
                        TextField("Z", value: coordinate(corner.id, \.z), format: .number).keyboardType(.numbersAndPunctuation).accessibilityLabel("Corner \(i+1) diagram Z")
                        Button { corners.removeAll { $0.id == corner.id } } label: { Image(systemName: "minus.circle").frame(minWidth: 44, minHeight: 44) }.accessibilityLabel("Remove corner \(i+1)").disabled(corners.count <= 3)
                    }
                }
            }
            Button("Save area") {
                var updated = area; updated.label = label; updated.polygon = corners.map(\.point)
                Task { await model.apply(.setArea(floorID: model.floorID, area: updated)) }
            }.frame(minHeight: 44)
            Button("Delete semantic area", role: .destructive) { Task { await model.apply(.deleteArea(floorID: model.floorID, areaID: area.id)) } }.frame(minHeight: 44)
        }.onAppear { label = area.label; corners = area.polygon.map { DraftCorner(point: $0) } }
    }
    private func coordinate(_ id: UUID, _ path: WritableKeyPath<Point2, Double>) -> Binding<Double> {
        Binding(get: { corners.first(where: { $0.id == id })?.point[keyPath: path] ?? 0 }, set: { value in
            // A field can still receive a final callback after its row is removed.
            // Never address a different corner through a stale array index.
            if let index = corners.firstIndex(where: { $0.id == id }) { corners[index].point[keyPath: path] = value }
        })
    }
}
