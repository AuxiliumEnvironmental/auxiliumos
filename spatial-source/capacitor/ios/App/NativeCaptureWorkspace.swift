import SwiftUI
import UIKit
import RoomPlan
import SpatialCore
import SpatialPersistence

@MainActor
final class NativeCaptureVault: ObservableObject {
    let store: SpatialStore
    let root: URL
    @Published var drafts: [DraftSummary] = []
    @Published var pending: [RecoverableCapture] = []
    @Published var sources: [String] = []
    @Published var busy = false
    @Published var message: String?
    init() throws {
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        var directory = support.appendingPathComponent("AuxiliumSpatial", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                               attributes: [.protectionKey: FileProtectionType.complete])
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        root = directory
        store = try SpatialStore(root: directory, protectedDataAvailable: UIApplication.shared.isProtectedDataAvailable)
    }
    func reload() async {
        do {
            let pipeline = CapturePipeline(store: store)
            let summaries = try await store.listDrafts()
            var captures: [DraftSummary] = []
            for summary in summaries {
                if !(try await pipeline.reviewReports(documentID: summary.documentID, revision: summary.revision)).isEmpty {
                    captures.append(summary)
                }
            }
            drafts = captures
            pending = try await store.recoverableCaptures()
            sources = try await pipeline.unrecoveredSourceIDs()
        } catch { message = "Retained captures could not be listed. Unlock the device and retry. " + error.localizedDescription }
    }
    func recoverArchive(_ id: String) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { _ = try await store.recoverCapture(artifactID: id); await reload() }
        catch { message = "Source files were preserved, but recovery could not finish. " + error.localizedDescription }
    }
    func recoverSource(_ id: String, separately: Bool, complete: (SpatialDocument) -> Void) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do {
            let document = try await CapturePipeline(store: store).process(sourceID: id, title: "Recovered walkthrough", separately: separately)
            await reload(); complete(document)
        } catch { message = "Source is retained. No incompatible rooms were joined. " + error.localizedDescription }
    }
    func open(_ id: String, complete: (SpatialDocument) -> Void) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do { complete(try await store.open(documentID: id)) }
        catch { message = "Saved source is retained. This layout could not open. " + error.localizedDescription }
    }
    func verifiedSavedCapture(_ expected: SpatialDocument) async throws -> SpatialDocument {
        let saved = try await store.open(documentID: expected.documentID)
        guard saved == expected else { throw CocoaError(.fileReadCorruptFile) }
        let reports = try await CapturePipeline(store: store).reviewReports(documentID: saved.documentID, revision: saved.revision)
        guard !reports.isEmpty else { throw CocoaError(.fileReadCorruptFile) }
        var rawSources = Set<String>()
        struct StructureSources: Decodable { let sourceIDs: [String] }
        for report in reports {
            if report.sourceArchiveID.hasPrefix("structure-") {
                let bytes = try await store.readCapture(sourceID: report.sourceArchiveID, kind: .captureMetadata)
                let ids = try JSONDecoder().decode(StructureSources.self, from: bytes).sourceIDs
                guard !ids.isEmpty else { throw CocoaError(.fileReadCorruptFile) }
                rawSources.formUnion(ids)
            } else { rawSources.insert(report.sourceArchiveID) }
        }
        for source in rawSources { _ = try await store.readCapture(sourceID: source, kind: .roomPlanRaw) }
        return saved
    }
}

/// Capture and recovery only. All authoring happens in the shared workspace.
@MainActor
struct NativeCaptureWorkspace: View {
    @ObservedObject var vault: NativeCaptureVault
    let complete: (SpatialDocument) -> Void
    let cancel: () -> Void
    @State private var route: CaptureRoute?
    private struct CaptureRoute: Identifiable { let id = UUID(); var resumeID: String? }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Capture room geometry with Apple RoomPlan. Raw sources remain protected on this device. Measurements are unverified.")
                    Button("Start guided walkthrough") { route = .init() }.frame(minHeight: 44)
                }
                if let message = vault.message {
                    Section { Label(message, systemImage: "exclamationmark.triangle").accessibilityAddTraits(.updatesFrequently) }
                }
                if !vault.pending.isEmpty {
                    Section("Interrupted source saves") {
                        ForEach(vault.pending, id: \.artifactID) { artifact in
                            Button("Recover source \(String(artifact.sourceID.prefix(8)))") {
                                Task { await vault.recoverArchive(artifact.artifactID) }
                            }.frame(minHeight: 44)
                        }
                    }
                }
                if !vault.sources.isEmpty {
                    Section("Retained unfinished rooms") {
                        ForEach(vault.sources, id: \.self) { source in
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Room \(String(source.prefix(8)))")
                                Button("Retry recorded compatible processing") {
                                    Task { await vault.recoverSource(source, separately: false, complete: complete) }
                                }.frame(minHeight: 44)
                                Button("Recover as a separate layout") {
                                    Task { await vault.recoverSource(source, separately: true, complete: complete) }
                                }.frame(minHeight: 44)
                            }
                        }
                    }
                }
                Section("Saved native captures") {
                    if vault.drafts.isEmpty { Text("No saved native captures.").foregroundStyle(.secondary) }
                    ForEach(vault.drafts, id: \.documentID) { draft in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(draft.title).font(.headline)
                            Text("Native capture revision \(draft.revision)").font(.caption)
                            Button("Open in shared workspace") { Task { await vault.open(draft.documentID, complete: complete) } }.frame(minHeight: 44)
                            Button("Relocalize and add connected room") { route = .init(resumeID: draft.documentID) }.frame(minHeight: 44)
                        }
                    }
                    Text("Adding rooms never replaces corrections in the shared workspace. A saved capture is opened as a separately reviewed input there.").font(.footnote)
                }
                Button("Refresh retained work") { Task { await vault.reload() } }.frame(minHeight: 44)
            }
            .disabled(vault.busy)
            .navigationTitle("Apple capture")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close", action: cancel).disabled(vault.busy) } }
            .task { await vault.reload() }
            .fullScreenCover(item: $route, onDismiss: { Task { await vault.reload() } }) { capture in
                NativeWalkthroughView(store: vault.store, root: vault.root, resumeDocumentID: capture.resumeID,
                    complete: { document in route = nil; complete(document) })
            }
        }
    }
}

@MainActor
private struct NativeWalkthroughView: View {
    @StateObject private var controller: CaptureController
    @Environment(\.dismiss) private var dismiss
    @State private var confirmCancel = false
    @State private var confirmDiscard = false
    let complete: (SpatialDocument) -> Void
    init(store: SpatialStore, root: URL, resumeDocumentID: String?, complete: @escaping (SpatialDocument) -> Void) {
        _controller = StateObject(wrappedValue: CaptureController(store: store, storageURL: root, resumeDocumentID: resumeDocumentID))
        self.complete = complete
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading) {
                    Text(controller.lifecycle.phase == .capturing ? "Room \(controller.currentRoomNumber)" : "Guided walkthrough").font(.headline)
                    Text("\(controller.retainedCount) room(s) saved on device").font(.caption)
                }
                Spacer()
                if controller.lifecycle.phase == .capturing {
                    Button("Stop room") { confirmCancel = true }.frame(minWidth: 44, minHeight: 44)
                } else if !controller.busy {
                    Button("Close") {
                        if controller.hasUnsavedReturnedSource { confirmDiscard = true }
                        else { controller.close(); dismiss() }
                    }.frame(minWidth: 44, minHeight: 44)
                }
            }.padding()
            if let view = controller.captureView {
                NativeRoomSurface(view: view).id(ObjectIdentifier(view))
                    .accessibilityLabel("Live room camera. " + controller.guidance)
            } else {
                ContentUnavailableView("Room capture", systemImage: "viewfinder", description: Text(controller.guidance))
                    .frame(maxHeight: .infinity)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(controller.guidance).font(.headline).accessibilityAddTraits(.updatesFrequently)
                    if let message = controller.message { Label(message, systemImage: "exclamationmark.triangle") }
                    if let document = controller.completed {
                        NativeCaptureProgress(document: document).frame(height: 80)
                            .accessibilityLabel("Accumulated saved wall outline. Review incomplete boundaries in the shared workspace.")
                    }
                    if controller.lifecycle.phase == .capturing {
                        Text("\(controller.visibleWalls) surfaces detected. This room is not saved yet.").font(.caption)
                        Button("Finish room") { controller.finish() }.buttonStyle(.borderedProminent).frame(minHeight: 44)
                    } else if controller.busy {
                        ProgressView(controller.walkthrough.continuity == .relocalizing ? "Relocalizing known space" : "Retaining and processing room")
                    } else {
                        if controller.canRetry {
                            Button("Retry saving and processing") { controller.retry() }.frame(minHeight: 44)
                            if controller.lifecycle.rawRetained {
                                Button("Recover this room separately") { controller.retry(separately: true) }.frame(minHeight: 44)
                            }
                        }
                        if controller.canScanNext {
                            Button("Scan next connected room") { controller.scanNextRoom() }.buttonStyle(.borderedProminent).frame(minHeight: 44)
                        }
                        if controller.canRelocalize {
                            Button("Relocalize from saved room") { Task { await controller.relocalize() } }.frame(minHeight: 44)
                        }
                        if controller.canStartSeparate {
                            Button("Start separate segment") { controller.startSeparateSegment() }.frame(minHeight: 44)
                        }
                        if let document = controller.completed {
                            Button("Finish walkthrough and open workspace") { controller.close(); complete(document) }
                                .buttonStyle(.borderedProminent).frame(minHeight: 44).disabled(controller.hasUnsavedReturnedSource)
                        }
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).padding()
            }.frame(maxHeight: 340).background(.regularMaterial)
        }
        .interactiveDismissDisabled()
        .task { await controller.start() }
        .onDisappear { controller.close() }
        .confirmationDialog("Stop this room?", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Stop room", role: .destructive) { controller.finish(cancel: true) }
            Button("Keep scanning", role: .cancel) {}
        } message: { Text("Completed rooms remain saved. Any returned source is retained for recovery; the active room may need another scan.") }
        .confirmationDialog("Discard this unsaved returned source?", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Discard unsaved source", role: .destructive) { dismiss() }
            Button("Keep source and retry", role: .cancel) {}
        } message: { Text("Saving failed. Closing discards this room's in-memory source. Previously saved rooms remain protected on the device.") }
    }
}

private struct NativeRoomSurface: UIViewRepresentable {
    let view: RoomCaptureView
    func makeUIView(context: Context) -> RoomCaptureView { view }
    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}

/// Feedback reads the saved canonical graph. It adds no inferred floor fill or
/// alternative geometry and never treats a retained outline as a complete scan.
private struct NativeCaptureProgress: View {
    let document: SpatialDocument
    var body: some View {
        Canvas { context, size in
            guard let floor = document.floors.first, !floor.nodes.isEmpty else { return }
            let lookup = Dictionary(uniqueKeysWithValues: floor.nodes.map { ($0.id, $0.point) })
            let minX = floor.nodes.map(\.point.x).min() ?? 0, maxX = floor.nodes.map(\.point.x).max() ?? 1
            let minZ = floor.nodes.map(\.point.z).min() ?? 0, maxZ = floor.nodes.map(\.point.z).max() ?? 1
            let scale = min((size.width - 16) / max(maxX - minX, 0.1), (size.height - 16) / max(maxZ - minZ, 0.1))
            for wall in floor.walls {
                var path = Path()
                for (index, point) in wall.nodeIDs.compactMap({ lookup[$0] }).enumerated() {
                    let location = CGPoint(x: 8 + (point.x - minX) * scale, y: 8 + (point.z - minZ) * scale)
                    if index == 0 { path.move(to: location) } else { path.addLine(to: location) }
                }
                context.stroke(path, with: .color(.primary), style: StrokeStyle(lineWidth: 1.5,
                    dash: wall.provenance.origin == .inferred ? [4, 3] : []))
            }
        }.background(Color.blue.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
    }
}
