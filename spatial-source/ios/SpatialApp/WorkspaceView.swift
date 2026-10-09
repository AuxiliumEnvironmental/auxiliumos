import SwiftUI
import UniformTypeIdentifiers
import SpatialCore
import SpatialPersistence
import RoomPlan

@MainActor
struct WorkspaceView: View {
    @ObservedObject var model: WorkspaceModel
    @State private var capturing = false
    @State private var captureResumeID: String?
    @State private var importing = false
    @State private var storage = false
    @State private var delivery = false
    @State private var navigation: [String] = []
    var body: some View {
        NavigationStack(path: $navigation) {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Your layouts, on this device").font(.title2.bold())
                        Text("Walk room to room, correct the geometry, and reopen your saved work.").foregroundStyle(.secondary)
                        Text("Connected capture requires retained alignment · Measurements unverified").font(.footnote).foregroundStyle(.secondary)
                    }.padding(.vertical, 8)
                    Button { captureResumeID = nil; capturing = true } label: { Label("New walkthrough", systemImage: "viewfinder") }.frame(minHeight: 44).disabled(model.store == nil || model.busy)
                    Button { importing = true } label: { Label("Import layout", systemImage: "square.and.arrow.down") }.frame(minHeight: 44).disabled(model.store == nil || model.busy)
                }
                if !model.pendingCaptureArchives.isEmpty {
                    Section("Interrupted source saves") {
                        Text("Verified source bytes were retained before saving finished. Recover their local record, then process the room.").font(.footnote)
                        ForEach(model.pendingCaptureArchives, id: \.artifactID) { archive in
                            Button { Task { await model.recoverArchive(archive.artifactID) } } label: {
                                Label("Recover source " + String(archive.sourceID.prefix(8)), systemImage: "externaldrive.badge.checkmark")
                            }.frame(minHeight: 44).disabled(model.busy)
                        }
                    }
                }
                if !model.recoverableSources.isEmpty {
                    Section("Retained room sources") {
                        Text("These sources were saved before processing completed. Only recorded compatible captures may be joined; other rooms remain separate.").font(.footnote)
                        ForEach(model.recoverableSources, id: \.self) { id in
                            Button { Task { await model.recover(id) } } label: {
                                Label("Recover room " + String(id.prefix(8)), systemImage: "arrow.clockwise")
                            }.frame(minHeight: 44).disabled(model.busy)
                            .contextMenu {
                                Button("Recover as a separate layout") { Task { await model.recover(id, separately: true) } }
                            }
                            .accessibilityAction(named: Text("Recover as a separate layout")) { Task { await model.recover(id, separately: true) } }
                            Button("Recover separately without assuming alignment") { Task { await model.recover(id, separately: true) } }
                                .font(.callout).frame(minHeight: 44).disabled(model.busy)
                        }
                    }
                }
                if !model.recoverableDrafts.isEmpty {
                    Section("Unacknowledged layout saves") {
                        Text("These verified geometry files were retained before their save was acknowledged. Recovery creates a new layout marked Needs review and does not replace an existing saved revision.").font(.footnote)
                        ForEach(model.recoverableDrafts, id: \.artifactID) { candidate in
                            Button { Task { await model.recoverDraft(candidate.artifactID) } } label: {
                                Label("Recover revision \(candidate.originalRevision) as a new layout", systemImage: "doc.badge.arrow.up")
                            }.frame(minHeight: 44).disabled(model.busy)
                        }
                    }
                }
                Section("Saved layouts") {
                    if model.drafts.isEmpty {
                        Text("No saved layouts yet.").foregroundStyle(.secondary).padding(.vertical)
                    }
                    ForEach(model.drafts, id: \.documentID) { draft in
                        Button { Task { await model.open(draft.documentID) } } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(draft.title).font(.headline).foregroundStyle(.primary)
                                Text("Revision \(draft.revision) · Saved on device").font(.subheadline).foregroundStyle(.secondary)
                                Text(draft.updatedAt.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, 6)
                        }.frame(minHeight: 44).disabled(model.busy)
                        .contextMenu {
                            Button { captureResumeID = draft.documentID; capturing = true } label: {
                                Label("Continue capture", systemImage: "viewfinder")
                            }
                        }
                        .accessibilityAction(named: Text("Continue capture")) { captureResumeID = draft.documentID; capturing = true }
                    }
                }
                Section {
                    Button { storage = true } label: { Label("On-device storage and recovery", systemImage: "internaldrive") }.frame(minHeight: 44)
                    Button { delivery = true } label: { Label("Delivery status", systemImage: "tray.and.arrow.up") }.frame(minHeight: 44)
                    Label("Not connected to AuxiliumOS or Moldo", systemImage: "externaldrive").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Auxilium Spatial")
            .overlay { if model.busy { ProgressView("Opening retained work").padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)) } }
            .refreshable { await model.load() }
            .navigationDestination(for: String.self) { id in
                if let doc = model.opened, doc.documentID == id, let store = model.store {
                    EditorView(document: doc, store: store).onDisappear { Task { await model.load() } }
                }
            }
            .onChange(of: model.opened?.documentID) { _, id in if let id { navigation = [id] } }
            .onChange(of: navigation) { _, value in if value.isEmpty { model.opened = nil } }
        }
        .fullScreenCover(isPresented: $capturing, onDismiss: { Task { await model.load() } }) {
            if let store = model.store, let root = model.root {
                CaptureScreen(store: store, root: root, resumeDocumentID: captureResumeID) { document in model.acceptCaptured(document); capturing = false }
            }
        }
        .sheet(isPresented: $storage) { StorageStatusView(model: model) }
        .sheet(isPresented: $delivery) { DeliveryStatusView(model: model) }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json, .zip]) { result in
            switch result {
            case .success(let url): Task { await model.importFile(url) }
            case .failure(let error): model.error = error.localizedDescription
            }
        }
        .alert("Action needs attention", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("OK", role: .cancel) { model.error = nil }
            Button("Retry loading") { model.error = nil; Task { await model.load() } }
        } message: { Text(model.error ?? "") }
    }
}

@MainActor
struct CaptureScreen: View {
    @StateObject private var controller: CaptureController
    @Environment(\.dismiss) private var dismiss
    @State private var confirmCancel = false
    @State private var confirmDiscard = false
    var open: (SpatialDocument) -> Void
    init(store: SpatialStore, root: URL, resumeDocumentID: String? = nil, open: @escaping (SpatialDocument) -> Void) {
        _controller = StateObject(wrappedValue: CaptureController(store: store, storageURL: root, resumeDocumentID: resumeDocumentID)); self.open = open
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading) {
                    Text(controller.lifecycle.phase == .capturing ? "Room \(controller.currentRoomNumber)" : "Guided walkthrough").font(.headline)
                    Text("\(controller.retainedCount) room(s) saved on device").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if controller.lifecycle.phase == .capturing {
                    Button("Cancel") { confirmCancel = true }.frame(minWidth: 44, minHeight: 44)
                } else if !controller.busy {
                    Button("Close") { if controller.hasUnsavedReturnedSource { confirmDiscard = true } else { controller.close(); dismiss() } }.frame(minWidth: 44, minHeight: 44)
                }
            }.padding(.horizontal)
            if let view = controller.captureView {
                RoomCaptureSurface(view: view).id(ObjectIdentifier(view))
                    .accessibilityLabel("Live room camera. " + controller.guidance)
            } else {
                ContentUnavailableView(controller.lifecycle.phase == .draftReady ? "Room retained" : "Room capture",
                                       systemImage: "viewfinder", description: Text(controller.guidance)).frame(maxHeight: .infinity)
            }
            ScrollView {
              VStack(spacing: 12) {
                Text(controller.guidance).font(.headline).frame(maxWidth: .infinity, alignment: .leading).accessibilityAddTraits(.updatesFrequently)
                if let text = controller.message { Label(text, systemImage: "exclamationmark.triangle").font(.callout).frame(maxWidth: .infinity, alignment: .leading) }
                if let document = controller.completed {
                    CaptureProgressOutline(document: document).frame(height: 72)
                        .accessibilityLabel("Accumulated saved outline. \(document.floors.reduce(0) { $0 + $1.walls.count }) walls in the saved layout. Review incomplete areas after capture.")
                }
                if controller.lifecycle.phase == .capturing {
                    Text("\(controller.visibleWalls) wall surfaces detected · Current room not saved").font(.footnote).foregroundStyle(.secondary)
                    Button { controller.finish() } label: { Label("Finish room", systemImage: "checkmark") }.buttonStyle(.borderedProminent).controlSize(.large).frame(minHeight: 44)
                } else if controller.busy {
                    ProgressView(controller.walkthrough.continuity == .relocalizing ? "Relocalizing. No new room is being scanned." : controller.savingMap ? "Layout saved; retaining recovery world map" : controller.lifecycle.phase == .preflight ? "Preparing world tracking" : controller.lifecycle.rawRetained ? "Source saved; processing layout" : "Saving returned source")
                } else {
                    if controller.canRetry {
                        Button("Retry saving and processing") { controller.retry() }.buttonStyle(.borderedProminent).controlSize(.large).frame(minHeight: 44)
                        if controller.lifecycle.rawRetained {
                            Button("Recover this room separately") { controller.retry(separately: true) }.buttonStyle(.bordered).controlSize(.large).frame(minHeight: 44)
                        }
                    }
                    if controller.canScanNext {
                        Button { controller.scanNextRoom() } label: { Label("Scan next connected room", systemImage: "plus.viewfinder") }
                            .buttonStyle(.borderedProminent).controlSize(.large).frame(minHeight: 44)
                    }
                    if controller.canRelocalize {
                        Button("Relocalize from saved room") { Task { await controller.relocalize() } }.buttonStyle(.borderedProminent).controlSize(.large).frame(minHeight: 44)
                    }
                    if controller.canStartSeparate {
                        Button("Start separate segment") { controller.startSeparateSegment() }.buttonStyle(.bordered).controlSize(.large).frame(minHeight: 44)
                    }
                    if let document = controller.completed {
                        Button("Finish walkthrough and review") { controller.close(); open(document) }.buttonStyle(.bordered).controlSize(.large).frame(minHeight: 44)
                            .disabled(controller.hasUnsavedReturnedSource)
                    }
                }
              }.padding()
            }.frame(maxHeight: 340).background(.regularMaterial)
        }
        .interactiveDismissDisabled(controller.busy || controller.lifecycle.phase == .capturing || controller.hasUnsavedReturnedSource)
        .task { await controller.start() }
        .onDisappear { controller.close() }
        .confirmationDialog("Discard this unsaved returned source?", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Discard unsaved source", role: .destructive) { dismiss() }
            Button("Keep source and retry", role: .cancel) {}
        } message: { Text("Saving this room failed. Closing now discards its in-memory source. Previously saved rooms remain on this device.") }
        .confirmationDialog("Stop this room scan?", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Stop scan", role: .destructive) { controller.finish(cancel: true) }
            Button("Keep scanning", role: .cancel) {}
        } message: { Text("Previously saved layouts remain available. Any source Apple returns will be retained for recovery; an unfinished scan may need to be repeated.") }
    }
}

private struct RoomCaptureSurface: UIViewRepresentable {
    let view: RoomCaptureView
    func makeUIView(context: Context) -> RoomCaptureView { view }
    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}

/// Read-only feedback from the persisted canonical graph, not a second editor
/// or a promise that the sensor saw every area. No unobserved room is filled in.
private struct CaptureProgressOutline: View {
    let document: SpatialDocument
    var body: some View {
        Canvas { context, size in
            guard let floor = document.floors.first, !floor.nodes.isEmpty else { return }
            let minX = floor.nodes.map(\.point.x).min() ?? 0, maxX = floor.nodes.map(\.point.x).max() ?? 1
            let minZ = floor.nodes.map(\.point.z).min() ?? 0, maxZ = floor.nodes.map(\.point.z).max() ?? 1
            let scale = min((size.width - 16) / max(maxX - minX, 0.1), (size.height - 16) / max(maxZ - minZ, 0.1))
            let lookup = Dictionary(uniqueKeysWithValues: floor.nodes.map { ($0.id, $0.point) })
            for wall in floor.walls {
                let points = wall.nodeIDs.compactMap { lookup[$0] }
                var path = Path()
                for (index, point) in points.enumerated() {
                    let location = CGPoint(x: 8 + (point.x - minX) * scale, y: 8 + (point.z - minZ) * scale)
                    if index == 0 { path.move(to: location) } else { path.addLine(to: location) }
                }
                context.stroke(path, with: .color(.primary), lineWidth: 1.5)
            }
        }.background(Color.blue.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
    }
}
