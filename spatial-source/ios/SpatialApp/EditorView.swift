import SwiftUI
import UniformTypeIdentifiers
import SpatialCore
import SpatialPersistence
import SpatialInterop

@MainActor
struct EditorView: View {
    @StateObject private var model: EditorModel
    @Environment(\.dismiss) private var dismiss
    @State private var mode = "2D"
    @State private var details = false
    @State private var objects = false
    @State private var review = false
    @State private var exportReview = false
    @State private var exporting = false
    @State private var leaving = false
    @State private var overlapping: [ObjectSelection] = []
    @State private var endpointOptions: [Node] = []
    @State private var endpointCommit: ((Node?) -> Void)?
    @State private var resetID = 0
    @StateObject private var orbit = OrbitState()
    @StateObject private var areaDraft = AreaDraftState()
    @State private var floors = false
    @State private var exportFile: GeometryFile?
    @State private var exportContentType: UTType = .json
    @State private var exportName = "Auxilium-Spatial.json"
    @State private var exportBusy = false
    init(document: SpatialDocument, store: SpatialStore) { _model = StateObject(wrappedValue: EditorModel(document: document, store: store)) }
    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label(areaDraft.points.isEmpty ? model.status : "Area sketch not saved", systemImage: model.pendingSave || !areaDraft.points.isEmpty ? "exclamationmark.circle" : "checkmark.circle").font(.caption)
                    Spacer()
                    Text("Revision \(model.document.revision)").font(.caption).foregroundStyle(.secondary)
                }
                Button { review = true } label: {
                    Label("Needs review · \(model.issues.count) geometry issues", systemImage: "exclamationmark.triangle").font(.caption).frame(minHeight: 44)
                }.disabled(!areaDraft.points.isEmpty)
                HStack {
                    Picker("Floor", selection: $model.floorID) {
                        ForEach(model.document.floors, id: \.id) { Text($0.label).tag($0.id) }
                    }.pickerStyle(.menu).disabled(!areaDraft.points.isEmpty)
                    Button { floors = true } label: { Image(systemName: "square.3.layers.3d").frame(minWidth: 44, minHeight: 44) }.accessibilityLabel("Manage floors").disabled(!areaDraft.points.isEmpty)
                    Spacer()
                    Picker("Layout view", selection: $mode) { Text("2D").tag("2D"); Text("3D").tag("3D") }.pickerStyle(.segmented).frame(maxWidth: 180)
                }
            }.padding(.horizontal).padding(.bottom, 8)
            if let floor = model.floor {
                ZStack(alignment: .topTrailing) {
                    FloorplanCanvas(floor: floor, selection: $model.selection, tool: model.tool, resetID: resetID, mutationEnabled: !model.busy && !model.pendingSave, areaDraft: areaDraft,
                                        edit: { command in Task { await model.apply(command) } },
                                        choose: { overlapping = $0 }, chooseEndpoint: { nodes, accept in
                                            guard nodes.count <= 20 else { model.error = "Too many corners share this touch target. Zoom in and tap the intended corner again."; return }
                                            endpointOptions = nodes; endpointCommit = accept
                                        }, showDetails: { details = true })
                            .opacity(mode == "2D" ? 1 : 0).allowsHitTesting(mode == "2D").accessibilityHidden(mode != "2D")
                    if mode == "3D" {
                        SpatialModelView(document: model.document, floorID: model.floorID, selection: model.selection,
                                         edgesOnly: false, resetID: resetID, state: orbit,
                                         selected: { model.selection = $0 }, failed: { model.error = $0 }, choose: { overlapping = $0 })
                    }
                    VStack(alignment: .trailing, spacing: 8) {
                        if mode == "2D" { Button { resetID += 1 } label: { Label("Reset view", systemImage: "arrow.counterclockwise") }.buttonStyle(.bordered).frame(minHeight: 44) }
                    }.padding(12)
                }
                .overlay(alignment: .bottomLeading) {
                    if mode == "2D" { Text(hint)
                        .font(.caption).padding(10).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12)).padding(8).allowsHitTesting(false)
                    }
                }
            }
            if model.tool == .area && mode == "2D" {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        Text("Unsaved area · \(areaDraft.points.count) points").font(.caption)
                        Button("Undo point") { _ = areaDraft.points.popLast() }.disabled(areaDraft.points.isEmpty)
                        Button("Finish area") { finishArea() }.disabled(areaDraft.points.count < 3 || model.busy || model.pendingSave)
                        Button("Cancel area") { areaDraft.points = []; model.tool = .select }
                    }.buttonStyle(.bordered).frame(minHeight: 44).padding(.horizontal)
                }
            }
            if model.pendingSave {
                HStack { Text("Unsaved changes").font(.callout); Spacer(); Button("Retry save") { Task { await model.save() } }.frame(minHeight: 44) }.padding(.horizontal).background(Color.orange.opacity(0.15))
            }
            if let selection = model.selection {
                Button { details = true } label: { Label("Edit " + selection.kind.rawValue, systemImage: "slider.horizontal.3").frame(maxWidth: .infinity, minHeight: 44) }.buttonStyle(.bordered)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    if mode == "2D" {
                        ForEach(CanvasTool.allCases, id: \.self) { tool in
                            Button { model.tool = tool } label: { Text(tool.rawValue).fontWeight(model.tool == tool ? .bold : .regular).frame(minWidth: 48, minHeight: 44) }
                                .buttonStyle(.bordered).tint(model.tool == tool ? .blue : .secondary).disabled(tool != .select && (model.pendingSave || model.busy))
                                .disabled(!areaDraft.points.isEmpty && tool != .area)
                        }
                    }
                    Button { objects = true } label: { Label("Objects", systemImage: "list.bullet").frame(minHeight: 44) }.buttonStyle(.bordered)
                    Button { Task { await model.undo() } } label: { Label("Undo", systemImage: "arrow.uturn.backward").frame(minHeight: 44) }.buttonStyle(.bordered).disabled(!model.canUndo || model.pendingSave || model.busy || !areaDraft.points.isEmpty)
                    Button { Task { await model.redo() } } label: { Label("Redo", systemImage: "arrow.uturn.forward").frame(minHeight: 44) }.buttonStyle(.bordered).disabled(!model.canRedo || model.pendingSave || model.busy || !areaDraft.points.isEmpty)
                }.padding(.horizontal)
            }.padding(.vertical, 8).background(.regularMaterial)
        }
        .navigationTitle(model.document.title).navigationBarTitleDisplayMode(.inline).navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { Button("Workspace") { if model.pendingSave || !areaDraft.points.isEmpty { leaving = true } else { dismiss() } }.disabled(model.busy) }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { review = true } label: { Image(systemName: "checklist").frame(minWidth: 44, minHeight: 44) }.accessibilityLabel("Review layout issues").disabled(!areaDraft.points.isEmpty)
                Button { exportReview = true } label: { Image(systemName: "square.and.arrow.up").frame(minWidth: 44, minHeight: 44) }.accessibilityLabel("Export selected revision").disabled(model.pendingSave || model.busy || !areaDraft.points.isEmpty)
            }
        }
        .task { await model.loadState() }
        .sheet(isPresented: $objects) { ObjectList(model: model) { objects = false; details = true } }
        .sheet(isPresented: $details) { ObjectInspector(model: model) }
        .sheet(isPresented: $floors) { FloorManagementView(model: model) }
        .onChange(of: model.floorID) { _, _ in model.selection = nil; areaDraft.points = [] }
        .sheet(isPresented: $review) { reviewSheet }
        .sheet(isPresented: $exportReview) { exportSheet }
        .confirmationDialog("Select the object at this location", isPresented: Binding(get: { !overlapping.isEmpty }, set: { if !$0 { overlapping = [] } }), titleVisibility: .visible) {
            ForEach(overlapping, id: \.self) { object in
                Button(object.kind.rawValue.capitalized + " " + String(object.id.prefix(8))) { model.selection = object; overlapping = []; if model.tool != .select { details = true } }
            }
        }
        .confirmationDialog("Choose the wall endpoint", isPresented: Binding(get: { endpointCommit != nil }, set: { if !$0 { endpointCommit = nil; endpointOptions = [] } }), titleVisibility: .visible) {
            if let commit = endpointCommit {
                ForEach(endpointOptions, id: \.id) { node in
                    Button("Corner \((model.floor?.nodes.firstIndex(where: { $0.id == node.id }) ?? 0) + 1)") {
                        endpointCommit = nil; endpointOptions = []; commit(node)
                    }
                }
                Button("Create an independent corner here") { endpointCommit = nil; endpointOptions = []; commit(nil) }
            }
            Button("Cancel", role: .cancel) { endpointCommit = nil; endpointOptions = [] }
        } message: { Text("Several explicit corners are near your touch. The nearest is listed first. Choose the intended connection or keep this endpoint independent.") }
        .alert("Action needs attention", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("OK", role: .cancel) { model.error = nil }
        } message: { Text(model.error ?? "") }
        .confirmationDialog("Leave unsaved changes?", isPresented: $leaving, titleVisibility: .visible) {
            Button("Discard unsaved changes", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        } message: { Text("The previously saved revision remains on this device. The edits shown on this screen have not been saved.") }
        .fileExporter(isPresented: $exporting, document: exportFile, contentType: exportContentType, defaultFilename: exportName) { result in
            if case .failure(let error) = result { model.error = "Export was not completed. " + error.localizedDescription }
        }
    }
    private var hint: String {
        switch model.tool {
        case .select: return "Tap an object. Drag a selected corner or wall. Two fingers pan."
        case .draw: return "Tap a start and end. Nearby corners join explicitly. New wall display height is assumed."
        case .opening: return "Choose a wall to add a door, window, or passage."
        case .label: return "Choose a room or area to edit its label."
        case .area: return "Tap area corners, then Finish area. Dashed boundaries are not physical walls."
        }
    }
    private func finishArea() {
        let area = SemanticArea(id: UUID().uuidString, label: "Area \((model.floor?.areas.count ?? 0) + 1)", polygon: areaDraft.points)
        Task {
            await model.apply(.setArea(floorID: model.floorID, area: area))
            // Once a valid command owns this geometry, its pending save (if any)
            // is the recovery path. Keeping a second sketch would create a new
            // duplicate area after Retry save; rejected commands keep the sketch.
            if model.document.floors.contains(where: { $0.areas.contains(where: { $0.id == area.id }) }) {
                areaDraft.points = []; model.tool = .select; model.selection = .init(kind: .area, id: area.id); details = true
            }
        }
    }
    private var reviewSheet: some View {
        NavigationStack {
            List {
                Section("Current geometry") {
                    if model.issues.isEmpty { Text("No automatic geometry issues found. This does not establish completeness or verified measurements.") }
                    ForEach(Array(model.issues.enumerated()), id: \.offset) { _, issue in
                        Button { model.focus(issue); review = false } label: { Label(issue.message, systemImage: "exclamationmark.triangle").frame(minHeight: 44) }
                    }
                }
                if !model.captureIssues.isEmpty {
                    Section("Original capture observations") {
                        Text("These observations describe the original capture. Edits do not erase source evidence; check them against your corrected layout.").font(.footnote)
                        ForEach(Array(model.captureIssues.enumerated()), id: \.offset) { _, issue in
                            Button { model.focus(issue); review = false } label: { Text(issue.message).frame(minHeight: 44) }
                        }
                    }
                }
                Section { Text("Unmodeled or disconnected areas require review. Independently retained segments are not assumed aligned.") }
            }.navigationTitle("Needs review").toolbar { Button("Done") { review = false } }
        }
    }
    private var exportSheet: some View {
        NavigationStack {
            Form {
                Section("Selected revision") { Text(model.document.title); Text("Revision \(model.document.revision)"); Text("Measurements unverified") }
                Section("Included") { Text("Choose the exact saved revision below. Drawing exports include a full label directory when needed. The all-floor archive contains canonical geometry and per-floor drawings and 3D models with an identity manifest. Original Apple scans and world maps are excluded.") }
                Section { Text("\(model.issues.count) current geometry issues. The file stays subject to your review; export does not publish it to AuxiliumOS or Moldo.") }
                Section("Choose file") {
                    Button("Export geometry JSON") { prepareExport(.json) }.frame(minHeight: 44)
                    if model.document.floors.count == 1 {
                        Button("Export layout bundle (ZIP)") { prepareExport(.bundle) }.frame(minHeight: 44)
                    }
                    Button("Export selected floor 3D model (GLB)") { prepareExport(.model) }.frame(minHeight: 44)
                    Button("Export selected floor drawing (PDF)") { prepareExport(.pdf) }.frame(minHeight: 44)
                    Button("Export selected floor SVG pages (ZIP)") { prepareExport(.svgPages) }.frame(minHeight: 44)
                    Button("Export selected floor PNG pages (ZIP)") { prepareExport(.pngPages) }.frame(minHeight: 44)
                    Button("Export all floors and formats (ZIP)") { prepareExport(.allFloors) }.frame(minHeight: 44)
                    if exportBusy { ProgressView("Preparing exact saved revision") }
                }.disabled(exportBusy)
                if let error = model.error { Section("Action needs attention") { Text(error) } }
            }.navigationTitle("Export layout").interactiveDismissDisabled(exportBusy).toolbar { Button("Cancel") { exportReview = false }.disabled(exportBusy) }
        }
    }

    private enum ExportChoice: Sendable { case json, bundle, model, pdf, svgPages, pngPages, allFloors }
    private func prepareExport(_ choice: ExportChoice) {
        guard !exportBusy else { return }
        exportBusy = true
        let floorID = model.floorID
        Task {
            defer { exportBusy = false }
            do {
                let bytes = try await model.exportGeometry()
                let output = try await Task.detached(priority: .userInitiated) { () -> (Data, Int) in
                    let snapshot = try GeometryJSONReader.decode(bytes)
                    switch choice {
                    case .json: return (bytes, snapshot.revision)
                    case .bundle: return (try ExchangeExporter.export(document: snapshot, floorID: floorID).archiveData, snapshot.revision)
                    case .model: return (try GLBExporter.export(document: snapshot, floorID: floorID), snapshot.revision)
                    case .pdf: return (try DrawingExporter.exportPDF(document: snapshot, floorID: floorID), snapshot.revision)
                    case .svgPages: return (try DrawingExporter.exportSVGArchive(document: snapshot, floorID: floorID), snapshot.revision)
                    case .pngPages: return (try DrawingExporter.exportPNGArchive(document: snapshot, floorID: floorID), snapshot.revision)
                    case .allFloors: return (try LocalDocumentExporter.export(document: snapshot).archiveData, snapshot.revision)
                    }
                }.value
                let ext: String
                switch choice {
                case .json: ext = "json"; exportContentType = .json
                case .bundle: ext = "zip"; exportContentType = .zip
                case .model: ext = "glb"; exportContentType = UTType(filenameExtension: "glb") ?? .data
                case .pdf: ext = "pdf"; exportContentType = .pdf
                case .svgPages, .pngPages, .allFloors: ext = "zip"; exportContentType = .zip
                }
                exportFile = GeometryFile(data: output.0)
                exportName = "Auxilium-Spatial-r\(output.1)." + ext
                exportReview = false; exporting = true
            } catch { model.error = "The selected revision could not be exported. " + String(describing: error) }
        }
    }
}

struct GeometryFile:  FileDocument {
    static var readableContentTypes: [UTType] { [.json, .zip, .pdf, .data] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }; self.data = data }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

private struct ObjectList: View {
    @ObservedObject var model: EditorModel
    let picked: () -> Void
    @Environment(\.dismiss) var dismiss
    @State private var creatingRoom = false
    var body: some View {
        NavigationStack {
            List {
                if let floor = model.floor {
                    Section("Rooms") {
                        ForEach(floor.rooms, id: \.id) { item in object(.room, item.id, item.label) }
                        Button("Create room from walls") { creatingRoom = true }.frame(minHeight: 44).disabled(floor.walls.count < 3)
                    }
                    Section("Semantic areas, not walls") {
                        ForEach(floor.areas, id: \.id) { item in object(.area, item.id, item.label) }
                        Button("Draw a semantic area") { model.tool = .area; dismiss() }.frame(minHeight: 44)
                    }
                    Section("Walls") { ForEach(Array(floor.walls.enumerated()), id: \.element.id) { index, wall in object(.wall, wall.id, "Wall \(index + 1)") } }
                    Section("Openings") { ForEach(Array(floor.openings.enumerated()), id: \.element.id) { index, item in object(.opening, item.id, item.kind.rawValue.capitalized + " \(index + 1)") } }
                    Section("Corners and path nodes") { ForEach(Array(floor.nodes.enumerated()), id: \.element.id) { index, node in object(.node, node.id, "Corner \(index + 1)") } }
                }
            }.navigationTitle("Objects").toolbar { Button("Done") { dismiss() } }
                .sheet(isPresented: $creatingRoom) { CreateRoomSheet(model: model) }
        }
    }
    private func object(_ kind: ObjectSelection.Kind, _ id: String, _ label: String) -> some View {
        Button { model.selection = .init(kind: kind, id: id); picked() } label: { Text(label).frame(minHeight: 44) }
    }
}
