import SwiftUI
import SpatialCore
import SpatialPersistence
import SpatialInterop
import Darwin

@main
@MainActor
struct AuxiliumSpatialApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var workspace = WorkspaceModel()
    @StateObject private var access = DeviceAccessGate()
    var body: some Scene {
        WindowGroup {
            WorkspaceView(model: workspace)
                .background(DeviceGateInstaller(gate: access).frame(width: 0, height: 0))
                .onChange(of: access.unlocked) { _, unlocked in
                    workspace.setLocalAccessAllowed(unlocked && UIApplication.shared.isProtectedDataAvailable)
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .background { workspace.setLocalAccessAllowed(false); access.lock() }
                    else if phase == .inactive { access.conceal() }
                    else { access.becameActive() }
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)) { _ in access.conceal() }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in workspace.setLocalAccessAllowed(false); access.lock() }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in access.becameActive() }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.protectedDataDidBecomeAvailableNotification)) { _ in
                    workspace.setLocalAccessAllowed(access.unlocked)
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.protectedDataWillBecomeUnavailableNotification)) { _ in
                    workspace.setLocalAccessAllowed(false); access.lock()
                }
                .privacySensitive()
                .overlay {
                    if scenePhase != .active {
                        ZStack { Color(uiColor: .systemBackground).ignoresSafeArea(); Label("Auxilium Spatial", systemImage: "lock.shield").font(.title2) }
                    }
                }
        }
    }
}

@MainActor
final class WorkspaceModel: ObservableObject {
    @Published private(set) var drafts: [DraftSummary] = []
    @Published private(set) var pendingCaptureArchives: [RecoverableCapture] = []
    @Published private(set) var recoverableSources: [String] = []
    @Published private(set) var recoverableDrafts: [RecoverableDraft] = []
    @Published private(set) var publications: [PublicationSummary] = []
    @Published private(set) var inventory: StorageInventory?
    @Published private(set) var cleanupPreview: HistoryCleanupPreview?
    @Published private(set) var pendingCleanups: [HistoryCleanupResult] = []
    @Published private(set) var busy = false
    @Published var error: String?
    @Published var opened: SpatialDocument?
    private(set) var store: SpatialStore?
    private(set) var root: URL?
    private var localAccessAllowed = false
    private var accessGeneration = UUID()

    func setLocalAccessAllowed(_ allowed: Bool) {
        localAccessAllowed = allowed; accessGeneration = UUID()
        let attempt = accessGeneration
        Task {
            guard accessGeneration == attempt else { return }
            await store?.setProtectedDataAvailable(allowed)
            guard accessGeneration == attempt, localAccessAllowed else { return }
            await load()
        }
    }

    func load() async {
        guard localAccessAllowed else { return }
        do {
            if store == nil {
                let applicationSupport = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                var url = applicationSupport.appendingPathComponent("AuxiliumSpatial", isDirectory: true)
                try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
                var values = URLResourceValues(); values.isExcludedFromBackup = true
                try url.setResourceValues(values)
                let newStore = try SpatialStore(root: url, protectedDataAvailable: UIApplication.shared.isProtectedDataAvailable)
                root = url; store = newStore
            }
            guard let store else { return }
            let loaded = try await store.listDrafts()
            let archives = try await store.recoverableCaptures()
            let sources = try await CapturePipeline(store: store).unrecoveredSourceIDs()
            let draftCandidates = try await store.recoverableDrafts()
            let outbox = try await store.listPublications()
            let storage = try await store.storageInventory()
            let cleanups = try await store.pendingHistoryCleanups()
            guard localAccessAllowed else { return }
            drafts = loaded; pendingCaptureArchives = archives; recoverableSources = sources
            recoverableDrafts = draftCandidates; publications = outbox; inventory = storage
            pendingCleanups = cleanups
        } catch { self.error = "Saved work could not be opened. Unlock the device if needed, then retry. " + error.localizedDescription }
    }
    func open(_ id: String) async {
        guard localAccessAllowed, let store, !busy else { return }
        busy = true; defer { busy = false }
        do { let document = try await store.open(documentID: id); if localAccessAllowed { opened = document } }
        catch { self.error = "This layout could not be opened. Its saved data was retained. " + error.localizedDescription }
    }
    func recoverArchive(_ artifactID: String) async {
        guard localAccessAllowed, let store, !busy else { return }
        busy = true
        do {
            _ = try await store.recoverCapture(artifactID: artifactID)
            busy = false; await load()
        } catch { busy = false; self.error = "The retained source could not be registered. Its files were preserved. " + String(describing: error) }
    }
    func recover(_ sourceID: String, separately: Bool = false) async {
        guard localAccessAllowed, let store, !busy else { return }
        busy = true; defer { busy = false }
        do {
            let document = try await CapturePipeline(store: store).process(sourceID: sourceID, title: separately ? "Separate recovered room" : "Recovered room", separately: separately)
            if localAccessAllowed { opened = document }
            await load()
        } catch { self.error = "The room source is retained, but processing could not finish. " + error.localizedDescription }
    }
    func recoverDraft(_ artifactID: String) async {
        guard localAccessAllowed, let store, !busy else { return }
        busy = true; defer { busy = false }
        do {
            let document = try await store.recoverDraftCopy(artifactID: artifactID, newDocumentID: UUID().uuidString)
            if localAccessAllowed { opened = document }
            await load()
        } catch { self.error = "The recovery copy could not be saved. The original retained bytes and existing saved layouts were preserved. " + String(describing: error) }
    }
    func cancelPublication(_ id: String) async {
        guard localAccessAllowed, let store, !busy else { return }
        busy = true; defer { busy = false }
        do { _ = try await store.cancelPublication(requestID: id); await load() }
        catch { self.error = "The local delivery request could not be cancelled. " + String(describing: error) }
    }
    func previewHistoryCleanup() async {
        guard localAccessAllowed, let store, !busy else { return }
        busy = true; defer { busy = false }; error = nil; cleanupPreview = nil
        do {
            let preview = try await store.previewHistoryCleanup()
            if localAccessAllowed { cleanupPreview = preview }
        } catch { self.error = "Old history could not be inspected. No cleanup was authorized. " + String(describing: error) }
    }
    func confirmHistoryCleanup() async {
        guard localAccessAllowed, let store, let preview = cleanupPreview, !busy else { return }
        busy = true; defer { busy = false }; error = nil
        do {
            _ = try await store.applyHistoryCleanup(preview)
            cleanupPreview = nil; await load()
        } catch { cleanupPreview = nil; self.error = "Cleanup could not finish. Current, frozen and undo versions remain protected. Refresh the preview or resume the previously confirmed cleanup. " + String(describing: error); await load() }
    }
    func resumeHistoryCleanup(_ operationID: String) async {
        guard localAccessAllowed, let store, !busy else { return }
        busy = true; defer { busy = false }; error = nil
        do { _ = try await store.resumeHistoryCleanup(operationID: operationID); await load() }
        catch { self.error = "Previously confirmed cleanup remains pending. " + String(describing: error); await load() }
    }
    func acceptCaptured(_ document: SpatialDocument) {
        // Completion can arrive while a device-authentication shield is visible.
        // Persisted work will be found by load() after unlock; do not navigate then.
        if localAccessAllowed { opened = document }
    }
    func importFile(_ url: URL) async {
        guard localAccessAllowed, let store, !busy else { return }
        busy = true; defer { busy = false }
        do {
            let accessing = url.startAccessingSecurityScopedResource()
            defer { if accessing { url.stopAccessingSecurityScopedResource() } }
            let imported = try await Task.detached(priority: .userInitiated) {
                let limit = url.pathExtension.lowercased() == "zip" ? 64 * 1024 * 1024 : 16 * 1024 * 1024
                // Avoid blocking on a FIFO before the descriptor's regular-file
                // check. Reads remain bounded after admission.
                let descriptor = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC | O_NONBLOCK)
                guard descriptor >= 0 else { throw CocoaError(.fileReadNoPermission) }
                let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
                defer { try? handle.close() }
                var metadata = stat()
                guard fstat(descriptor, &metadata) == 0, (metadata.st_mode & S_IFMT) == S_IFREG,
                      metadata.st_size > 0, metadata.st_size <= limit else { throw SpatialError.tooLarge }
                var data = Data()
                while data.count <= limit {
                    guard let chunk = try handle.read(upToCount: min(65536, limit + 1 - data.count)), !chunk.isEmpty else { break }
                    data.append(chunk)
                }
                guard !data.isEmpty, data.count <= limit else { throw SpatialError.tooLarge }
                if url.pathExtension.lowercased() == "zip" {
                    // Two explicit strict profiles. Neither reader extracts files
                    // or executes untrusted supplied PDF/SVG derivatives.
                    do { return try ExchangeImporter.importArchive(data).document }
                    catch { return try LocalDocumentImporter.importArchive(data).document }
                }
                return try GeometryJSONReader.decode(data)
            }.value
            guard localAccessAllowed else { return }
            // Explicit copy identity prevents untrusted files replacing an existing
            // local draft. Immutable imported raw bytes are not transmitted.
            var copy = imported
            copy.documentID = UUID().uuidString; copy.revision = 1; copy.parentRevision = nil; copy.reviewState = .needsReview
            _ = try await store.create(copy)
            if localAccessAllowed { opened = copy }; await load()
        } catch { self.error = "The file could not be imported. Existing layouts were preserved. " + error.localizedDescription }
    }
}
