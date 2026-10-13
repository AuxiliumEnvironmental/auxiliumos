import SwiftUI
import SpatialCore
import SpatialPersistence

struct ObjectSelection: Equatable, Hashable {
    enum Kind: String { case node, wall, opening, room, area }
    var kind: Kind
    var id: String
}
enum CanvasTool: String, CaseIterable { case select = "Select", draw = "Draw", opening = "Opening", label = "Label", area = "Area" }

@MainActor final class AreaDraftState: ObservableObject {
    @Published var points: [Point2] = []
}

@MainActor
final class EditorModel: ObservableObject {
    @Published private(set) var document: SpatialDocument
    @Published var selection: ObjectSelection?
    @Published var floorID: String
    @Published var tool: CanvasTool = .select
    @Published var error: String?
    @Published private(set) var busy = false
    @Published private(set) var pendingSave = false
    @Published private(set) var canUndo = false
    @Published private(set) var canRedo = false
    @Published private(set) var issues: [GeometryReviewIssue] = []
    @Published private(set) var captureIssues: [GeometryReviewIssue] = []
    private let store: SpatialStore
    private var savedRevision: Int
    private var pendingReceipt: EditReceipt?
    init(document: SpatialDocument, store: SpatialStore) {
        self.document = document; self.store = store
        floorID = document.floors.first?.id ?? ""; savedRevision = document.revision
    }
    var floor: Floor? { document.floors.first { $0.id == floorID } }
    var status: String { pendingSave ? "Changes not saved" : (busy ? "Saving on device" : "Saved on device") }
    func loadState() async {
        do {
            if let summary = try await store.listDrafts().first(where: { $0.documentID == document.documentID }) {
                canUndo = summary.canUndo; canRedo = summary.canRedo
            }
            let snapshot = document
            issues = await Task.detached { GeometryDiagnostics.inspect(document: snapshot) }.value
            let reports = try await CapturePipeline(store: store).reviewReports(documentID: document.documentID, revision: document.revision)
            captureIssues = reports.flatMap(\.issues)
        } catch { self.error = String(describing: error) }
    }
    func apply(_ command: EditCommand) async {
        await apply([command])
    }
    func apply(_ commands: [EditCommand]) async {
        guard !busy else { error = "The current edit is still saving. Wait for its save result before changing geometry."; return }
        guard !pendingSave else { error = "Changes are not saved. Retry saving before changing more geometry."; return }
        error = nil
        do {
            var editor = try EditorSession(document)
            try editor.apply(commands, expectedRevision: document.revision)
            document = editor.document; pendingReceipt = editor.lastReceipt; pendingSave = true
            reconcileSelection()
            await save()
        } catch { self.error = "This edit was not applied. " + String(describing: error) }
    }
    func save() async {
        guard pendingSave, !busy else { return }
        busy = true; error = nil; defer { busy = false }
        do {
            _ = try await store.save(document, expectedRevision: savedRevision, command: "native-editor", receipt: pendingReceipt)
            savedRevision = document.revision; pendingSave = false; pendingReceipt = nil
            await loadState()
        } catch { self.error = "The edit remains on screen but is not saved. Retry before leaving. " + String(describing: error) }
    }
    func undo() async { await history(redo: false) }
    func redo() async { await history(redo: true) }
    private func history(redo: Bool) async {
        guard !pendingSave, !busy else { return }
        busy = true; error = nil; defer { busy = false }
        do {
            document = redo
                ? try await store.redo(documentID: document.documentID, expectedRevision: savedRevision)
                : try await store.undo(documentID: document.documentID, expectedRevision: savedRevision)
            savedRevision = document.revision; reconcileSelection(); await loadState()
        } catch { self.error = "Saved history could not be changed. " + String(describing: error) }
    }
    func exportGeometry() async throws -> Data {
        guard !pendingSave, !busy else { throw SpatialError.staleRevision(expected: savedRevision, actual: document.revision) }
        let frozen = try await store.freeze(documentID: document.documentID, revision: document.revision)
        return try await store.readFrozen(snapshotID: frozen.snapshotID)
    }
    private func reconcileSelection() {
        if !document.floors.contains(where: { $0.id == floorID }) { floorID = document.floors.first?.id ?? "" }
        guard let selection, let floor else { self.selection = nil; return }
        let exists: Bool
        switch selection.kind {
        case .node: exists = floor.nodes.contains { $0.id == selection.id }
        case .wall: exists = floor.walls.contains { $0.id == selection.id }
        case .opening: exists = floor.openings.contains { $0.id == selection.id }
        case .room: exists = floor.rooms.contains { $0.id == selection.id }
        case .area: exists = floor.areas.contains { $0.id == selection.id }
        }
        if !exists { self.selection = nil }
    }
    func focus(_ issue: GeometryReviewIssue) {
        floorID = issue.floorID
        guard let floor else { return }
        for id in issue.objectIDs {
            if floor.walls.contains(where: { $0.id == id }) { selection = .init(kind: .wall, id: id); return }
            if floor.openings.contains(where: { $0.id == id }) { selection = .init(kind: .opening, id: id); return }
            if floor.rooms.contains(where: { $0.id == id }) { selection = .init(kind: .room, id: id); return }
            if floor.nodes.contains(where: { $0.id == id }) { selection = .init(kind: .node, id: id); return }
        }
        selection = nil
    }
}
