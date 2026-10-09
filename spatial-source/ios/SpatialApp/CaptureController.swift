import SwiftUI
import UIKit
import AVFoundation
import ARKit
import RoomPlan
import CaptureKit
import SpatialCore
import SpatialPersistence

@MainActor
final class CaptureController: ObservableObject {
    @Published private(set) var lifecycle = CaptureLifecycle()
    @Published private(set) var walkthrough = ConnectedCaptureLifecycle()
    @Published private(set) var captureView: RoomCaptureView?
    @Published private(set) var guidance = "Scan each room, keeping the camera active between connected rooms."
    @Published private(set) var message: String?
    @Published private(set) var visibleWalls = 0
    @Published private(set) var completed: SpatialDocument?
    @Published private(set) var retainedSourceID: String?
    @Published private(set) var savingMap = false
    private let pipeline: CapturePipeline
    private let storageURL: URL
    private let resumeDocumentID: String?
    private var delegate: CaptureAttemptDelegate?
    private var sessionObserver: CaptureSessionObserver?
    private var worldSession: ARSession?
    private var worldSessionID: String?
    private var observers: [NSObjectProtocol] = []
    private var resourceTimer: Timer?
    private var finishWatchdog: Task<Void, Never>?
    private var pendingRaw: CapturedRoomData?
    private var sourceContext: CaptureContext?
    private var sourceID: String?
    private var title = "Property walkthrough"
    private var captureError: String?
    private var interruptionWarning: String?
    private var trackingDeadline: Date?
    private var lastResourceCheck = Date.distantPast
    private var receivedSource = false
    private var authorizedStartGeneration: UUID?
    private var visibilityGeneration = UUID()

    init(store: SpatialStore, storageURL: URL, resumeDocumentID: String? = nil) {
        pipeline = CapturePipeline(store: store); self.storageURL = storageURL
        self.resumeDocumentID = resumeDocumentID
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.checkpoint(reason: "Capture was interrupted. Completed rooms are retained. The active room may need another scan; connections require relocalization or a separate segment.") }
        })
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in await self?.launchAuthorizedCaptureIfActive() }
        })
        for name in [UIApplication.didEnterBackgroundNotification, UIApplication.protectedDataWillBecomeUnavailableNotification] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.backgrounded() }
            })
        }
        observers.append(center.addObserver(forName: ProcessInfo.thermalStateDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.checkResources() }
        })
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
        resourceTimer?.invalidate(); finishWatchdog?.cancel()
        worldSession?.pause()
    }

    var busy: Bool { [.preflight, .finishing, .archiving, .processing, .saving].contains(lifecycle.phase) || savingMap || walkthrough.continuity == .relocalizing }
    var hasUnsavedReturnedSource: Bool { pendingRaw != nil && !lifecycle.rawRetained }
    var canRetry: Bool { lifecycle.phase == .failed && (pendingRaw != nil || retainedSourceID != nil) }
    var canScanNext: Bool { startControlsAllowed && !busy && !hasUnsavedReturnedSource && walkthrough.canStartRoom && [.draftReady, .cancelled, .failed].contains(lifecycle.phase) }
    var retainedCount: Int { walkthrough.retained.count }
    var currentRoomNumber: Int { walkthrough.compatibleSourceIDs.count + 1 }
    var canRelocalize: Bool { startControlsAllowed && !busy && walkthrough.canRelocalize }
    var canStartSeparate: Bool { startControlsAllowed && !busy && !hasUnsavedReturnedSource && walkthrough.active == nil && walkthrough.continuity == .broken }
    private var supportedDevice: Bool {
        UIDevice.current.userInterfaceIdiom == .phone && RoomCaptureSession.isSupported && ARWorldTrackingConfiguration.isSupported
    }
    private var startControlsAllowed: Bool {
        supportedDevice && AVCaptureDevice.authorizationStatus(for: .video) == .authorized &&
        UIApplication.shared.applicationState == .active && UIApplication.shared.isProtectedDataAvailable
    }

    func start() async {
        guard worldSession == nil, let generation = lifecycle.begin() else { return }
        title = "Walkthrough " + Date.now.formatted(date: .abbreviated, time: .shortened)
        guard supportedDevice else {
            fail(generation, "Room capture requires a supported LiDAR-equipped iPhone Pro. You can still open and edit saved layouts."); return
        }
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        var granted = status == .authorized
        if status == .notDetermined { granted = await AVCaptureDevice.requestAccess(for: .video) }
        guard lifecycle.accepts(generation), lifecycle.phase == .preflight else { return }
        guard granted else { fail(generation, "Camera access is off. Enable Camera for Auxilium Spatial in Settings to scan. Saved layouts remain available."); return }
        authorizedStartGeneration = generation
        await launchAuthorizedCaptureIfActive()
    }

    private func launchAuthorizedCaptureIfActive() async {
        guard UIApplication.shared.applicationState == .active,
              let generation = authorizedStartGeneration,
              lifecycle.accepts(generation), lifecycle.phase == .preflight else { return }
        authorizedStartGeneration = nil
        let visibleAttempt = visibilityGeneration
        do { try verifyCaptureAdmission() } catch { fail(generation, error.localizedDescription); return }
        if let resumeDocumentID {
            do {
                let restored = try await pipeline.resumeState(documentID: resumeDocumentID)
                guard visibilityGeneration == visibleAttempt, UIApplication.shared.applicationState == .active,
                      lifecycle.phase == .preflight else { return }
                try verifyCaptureAdmission()
                walkthrough = try ConnectedCaptureLifecycle(restoring: restored.rooms,
                    savedRevision: restored.document.revision, mapSourceID: restored.mapSourceID)
                completed = restored.document; title = restored.document.title
                guard lifecycle.restoredDraft(generation) else { return }
                guidance = "\(retainedCount) room(s) saved. Return to the previously scanned room and relocalize before adding another."
                await relocalize()
            } catch {
                walkthrough.interrupt(invalidateActive: false)
                fail(generation, "This layout cannot safely resume capture in its previous coordinates. It may have been corrected, or its world map is unavailable. Existing work is preserved. Start a separate segment instead. " + error.localizedDescription)
            }
            return
        }
        let session = ARSession(), id = UUID().uuidString
        guard walkthrough.attachSession(id) else { return }
        install(session: session, id: id)
        // One session is created for this shared frame. No reset is requested
        // between successful room captures.
        session.run(ARWorldTrackingConfiguration())
        prepareRoom(generation)
        startMonitoring()
    }

    func scanNextRoom() {
        guard canScanNext else { return }
        do { try verifyCaptureAdmission() } catch { message = error.localizedDescription; return }
        guard let generation = lifecycle.begin() else { return }
        prepareRoom(generation)
    }

    private func install(session: ARSession, id: String) {
        worldSession?.pause()
        let monitor = CaptureSessionObserver(owner: self, sessionID: id)
        sessionObserver = monitor; session.delegate = monitor
        worldSession = session; worldSessionID = id
    }

    private func prepareRoom(_ generation: UUID) {
        guard let session = worldSession else { return }
        do { try verifyCaptureAdmission() } catch { fail(generation, error.localizedDescription); return }
        sourceID = generation.uuidString; pendingRaw = nil; retainedSourceID = nil; sourceContext = nil
        receivedSource = false; visibleWalls = 0; message = nil; captureError = nil; interruptionWarning = nil
        let view = RoomCaptureView(frame: .zero, arSession: session)
        view.isModelEnabled = false
        // A new delegate/view binds callbacks to this attempt. Both use the same
        // live ARSession, so a late previous room callback cannot claim this ID.
        let proxy = CaptureAttemptDelegate(owner: self, generation: generation)
        delegate = proxy; view.delegate = proxy; view.captureSession.delegate = proxy; captureView = view
        trackingDeadline = Date().addingTimeInterval(20)
        guidance = "Point toward a well-lit corner. Waiting for normal world tracking before starting this room."
        updateTracking()
    }

    private func beginPreparedRoomIfReady() {
        guard lifecycle.phase == .preflight, walkthrough.canStartRoom,
              let id = lifecycle.generation, let sourceID, walkthrough.beginRoom(sourceID: sourceID) != nil else { return }
        do { try verifyCaptureAdmission() } catch { _ = walkthrough.abandonRoom(sourceID: sourceID); fail(id, error.localizedDescription); return }
        guard lifecycle.started(id) else { return }
        trackingDeadline = nil
        guidance = "Move slowly around this room. Include corners, doorways, and windows."
        captureView?.captureSession.run(configuration: .init())
    }

    func finish(cancel: Bool = false) {
        guard let id = lifecycle.generation, lifecycle.finish(id, cancel: cancel) else { return }
        guidance = cancel ? "Stopping this room and retaining any returned source." : "Finishing this room. Keep the camera pointed toward the room."
        // Preserve the world coordinate system while RoomBuilder processes this
        // room and the person moves through the doorway toward the next room.
        captureView?.captureSession.stop(pauseARSession: cancel || walkthrough.continuity == .broken)
        if cancel { walkthrough.interrupt(invalidateActive: true) }
        finishWatchdog = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 20_000_000_000)
            guard !Task.isCancelled, let self, self.lifecycle.phase == .finishing else { return }
            if self.lifecycle.finishTimedOut(id) {
                self.walkthrough.interrupt(invalidateActive: true); self.worldSession?.pause()
                self.message = "Apple has not returned this room's source yet. This room is not saved. A late result can still be retained on this screen. Previous rooms remain saved."
            }
        }
    }

    func checkpoint(reason: String) {
        // Camera permission UI can temporarily resign active before any sensor
        // session exists. It is not tracking loss or a failed room capture.
        guard worldSession != nil, walkthrough.continuity != .closed else { return }
        walkthrough.interrupt(invalidateActive: !receivedSource)
        interruptionWarning = reason; message = reason
        if lifecycle.phase == .capturing { finish() }
        else if lifecycle.phase == .preflight, let generation = lifecycle.generation { fail(generation, reason) }
        worldSession?.pause()
    }

    private func backgrounded() {
        visibilityGeneration = UUID(); authorizedStartGeneration = nil
        if lifecycle.phase == .preflight, let generation = lifecycle.generation {
            fail(generation, "Capture preparation stopped when the app left the foreground. Reopen the unlocked workspace before starting another scan.")
        } else {
            checkpoint(reason: "The app left the foreground. Saved rooms remain intact. Resume only after unlocking the workspace and relocalizing, or start a separate segment.")
        }
    }

    func receive(_ data: CapturedRoomData, generation: UUID, error: Error?) {
        guard lifecycle.received(generation), let sourceID else { return }
        finishWatchdog?.cancel(); receivedSource = true; pendingRaw = data
        if error != nil { walkthrough.interrupt(invalidateActive: true); worldSession?.pause() }
        captureError = error.map { _ in "Apple reported a capture interruption. This room remains a separate segment; review its incomplete areas." }
        message = captureError ?? interruptionWarning
        let connection = walkthrough.active
        sourceContext = CaptureContext(sourceID: sourceID, frameID: connection?.frameID ?? sourceID, title: title,
            capturedAt: Date(), sdkVersion: (Bundle.main.object(forInfoDictionaryKey: "DTSDKName") as? String ?? "unknown-sdk") + "; iOS " + UIDevice.current.systemVersion,
            warning: captureError ?? interruptionWarning, cancelled: lifecycle.cancelled, connection: connection)
        Task { await finalize(generation: generation, sourceID: sourceID) }
    }

    func retry(separately: Bool = false) {
        guard let generation = lifecycle.generation, let sourceID, canRetry, lifecycle.retry(generation) else { return }
        message = nil
        Task { await finalize(generation: generation, sourceID: sourceID, separately: separately) }
    }

    private func finalize(generation: UUID, sourceID: String, separately: Bool = false) async {
        do {
            if !lifecycle.rawRetained {
                guard let raw = pendingRaw else { throw CocoaError(.fileReadCorruptFile) }
                try await pipeline.archive(raw: raw, sourceID: sourceID, context: sourceContext)
                guard lifecycle.archived(generation) else { return }
                retainedSourceID = sourceID; pendingRaw = nil
            }
            if lifecycle.phase == .cancelled {
                _ = walkthrough.abandonRoom(sourceID: sourceID)
                guidance = "This room was cancelled. Returned source is retained for recovery; it is not counted as a saved layout."
                captureView = nil; return
            }
            guidance = "Room source saved on device. Building the editable layout."
            let document = try await pipeline.process(sourceID: sourceID, title: title, separately: separately)
            guard lifecycle.processed(generation), lifecycle.saved(generation) else { return }
            let admitted = walkthrough.roomSaved(sourceID: sourceID, documentID: document.documentID, revision: document.revision)
            completed = document
            if !admitted { walkthrough.interrupt(invalidateActive: false) }
            if walkthrough.continuity == .continuous {
                guidance = "\(retainedCount) room(s) saved. Walk through the connecting doorway, then start the next room. Keep the camera active."
                await preserveWorldMap(sourceID: sourceID)
            } else {
                guidance = "\(retainedCount) room(s) retained. Connection was lost. Return to known space to relocalize, or start a separate segment."
            }
        } catch {
            fail(generation, lifecycle.rawRetained
                 ? "This room's source is saved, but its layout could not finish. Retry processing or recover this room separately. " + error.localizedDescription
                 : "This room is not saved. Keep this screen open, unlock the device if needed, and retry saving. " + error.localizedDescription)
        }
    }

    private func preserveWorldMap(sourceID: String) async {
        guard let session = worldSession, let sessionID = worldSessionID,
              walkthrough.continuity == .continuous, walkthrough.tracking == .normal else { return }
        do { try verifyCaptureAdmission() } catch { return }
        savingMap = true; defer { savingMap = false }
        do {
            let map: ARWorldMap = try await withCheckedThrowingContinuation { continuation in
                let request = WorldMapRequest(continuation)
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) { request.complete(.failure(CocoaError(.coderValueNotFound))) }
                session.getCurrentWorldMap { map, error in
                    if let map { request.complete(.success(map)) }
                    else { request.complete(.failure(error ?? CocoaError(.coderInvalidValue))) }
                }
            }
            guard worldSessionID == sessionID, walkthrough.continuity == .continuous, walkthrough.active == nil else { return }
            let bytes = try NSKeyedArchiver.archivedData(withRootObject: map, requiringSecureCoding: true)
            try await pipeline.archiveWorldMap(bytes, sourceID: sourceID)
            _ = walkthrough.worldMapSaved(sourceID: sourceID, sessionID: sessionID)
        } catch {
            message = "Rooms are saved. A recovery world map could not be saved, so any later loss of alignment will require a separate segment."
        }
    }

    func relocalize() async {
        guard canRelocalize, let mapSource = walkthrough.mapSourceID else { return }
        let visibleAttempt = visibilityGeneration
        do {
            try verifyCaptureAdmission()
            let bytes = try await pipeline.worldMap(sourceID: mapSource)
            guard visibilityGeneration == visibleAttempt, UIApplication.shared.applicationState == .active else {
                message = "Return to the app before relocalizing. Saved rooms remain intact."; return
            }
            try verifyCaptureAdmission()
            guard let map = try NSKeyedUnarchiver.unarchivedObject(ofClass: ARWorldMap.self, from: bytes) else { throw CocoaError(.coderReadCorrupt) }
            let id = UUID().uuidString, session = ARSession()
            guard walkthrough.beginRelocalization(mapSourceID: mapSource, newSessionID: id) else { return }
            install(session: session, id: id)
            let configuration = ARWorldTrackingConfiguration(); configuration.initialWorldMap = map
            session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
            let view = RoomCaptureView(frame: .zero, arSession: session); view.isModelEnabled = false; captureView = view
            trackingDeadline = Date().addingTimeInterval(30)
            guidance = "Return to the previously scanned room. Aim toward familiar corners while tracking relocalizes. No new room is being captured."
            message = nil; startMonitoring()
        } catch { message = "The retained world map could not be loaded. Rooms remain saved; start a separate segment. " + error.localizedDescription }
    }

    func startSeparateSegment() {
        guard canStartSeparate else { return }
        do { try verifyCaptureAdmission() } catch { message = error.localizedDescription; return }
        guard let generation = lifecycle.begin() else { return }
        let id = UUID().uuidString
        guard walkthrough.startSeparateSegment(sessionID: id) else { return }
        let session = ARSession(); install(session: session, id: id)
        session.run(ARWorldTrackingConfiguration())
        prepareRoom(generation); startMonitoring()
    }

    func close() {
        guard !hasUnsavedReturnedSource else { return }
        authorizedStartGeneration = nil; walkthrough.close(); worldSession?.pause(); resourceTimer?.invalidate(); resourceTimer = nil
        captureView = nil
    }

    private func startMonitoring() {
        resourceTimer?.invalidate()
        resourceTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.updateTracking() }
        }
    }
    private func updateTracking() {
        guard let session = worldSession, let id = worldSessionID, walkthrough.continuity != .closed else { return }
        if let frame = session.currentFrame {
            // An old normal frame after suspension is not current tracking.
            let age = ProcessInfo.processInfo.systemUptime - frame.timestamp
            if age >= 0 && age < 1 {
                switch frame.camera.trackingState {
                case .normal: observedTracking(.normal, sessionID: id)
                case .notAvailable: observedTracking(.unavailable, sessionID: id)
                case .limited(.relocalizing): observedTracking(.relocalizing, sessionID: id)
                case .limited(.excessiveMotion): observedTracking(.limited, sessionID: id); if lifecycle.phase == .capturing { guidance = "Slow down and hold the phone steady." }
                case .limited(.insufficientFeatures): observedTracking(.limited, sessionID: id); if lifecycle.phase == .capturing { guidance = "Point toward a well-lit corner with visible detail." }
                case .limited: observedTracking(.limited, sessionID: id)
                }
            } else if walkthrough.continuity == .continuous && age > 2 { checkpoint(reason: "Live tracking stopped. Saved rooms remain intact. Resume only after relocalization or in a separate segment.") }
        }
        if let deadline = trackingDeadline, Date() > deadline {
            trackingDeadline = nil
            if walkthrough.continuity == .relocalizing {
                walkthrough.relocalizationFailed(); worldSession?.pause()
                message = "Relocalization did not succeed. No connection was assumed. Saved rooms are retained; try again from the prior room or start a separate segment."
            } else if lifecycle.phase == .preflight, let generation = lifecycle.generation {
                walkthrough.interrupt(invalidateActive: false)
                fail(generation, "Normal tracking was not established. Improve the lighting and begin a separate segment, or return to saved layouts.")
            }
        }
        if Date().timeIntervalSince(lastResourceCheck) >= 5 { lastResourceCheck = Date(); checkResources() }
    }

    func observedTracking(_ state: ConnectedCaptureLifecycle.Tracking, sessionID: String) {
        guard worldSessionID == sessionID else { return }
        let prior = walkthrough.continuity
        walkthrough.observeTracking(state, sessionID: sessionID, invalidateActive: !receivedSource)
        if prior == .relocalizing && walkthrough.continuity == .continuous {
            trackingDeadline = nil; guidance = "The saved coordinate space was relocalized. Move through the doorway and scan the next room."; message = nil
        } else if prior == .continuous && walkthrough.continuity == .broken {
            checkpoint(reason: "World tracking lost its shared alignment. Completed rooms are saved. The active room will remain separate until reviewed.")
        }
        beginPreparedRoomIfReady()
    }
    func sessionInterrupted(_ id: String) {
        guard worldSessionID == id else { return }
        checkpoint(reason: "The AR session was interrupted. Completed rooms are saved. Relocalize from retained space or start a separate segment.")
    }
    private func verifyCaptureAdmission() throws {
        let capacity = try storageURL.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage
        guard let rejection = CaptureStartAdmission.rejection(supportedDevice: supportedDevice,
            cameraAuthorized: AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
            applicationActive: UIApplication.shared.applicationState == .active,
            protectedDataAvailable: UIApplication.shared.isProtectedDataAvailable,
            thermalSafe: ![.serious, .critical].contains(ProcessInfo.processInfo.thermalState),
            availableStorageBytes: capacity) else { return }
        switch rejection {
        case .unsupportedDevice: throw NativeCaptureError("Room capture requires a supported LiDAR-equipped iPhone Pro. Saved layouts remain available.")
        case .cameraNotAuthorized: throw NativeCaptureError("Camera access is not authorized. Enable Camera for Auxilium Spatial in Settings before any new scan.")
        case .inactiveApplication: throw NativeCaptureError("Return to the unlocked app before starting or continuing capture.")
        case .protectedDataUnavailable: throw NativeCaptureError("Unlock the device before scanning.")
        case .thermalLimit: throw NativeCaptureError("The device needs to cool before scanning. Saved layouts remain available.")
        case .insufficientStorage: throw NativeCaptureError("At least 512 MB of available storage is required. Free space before continuing.")
        }
    }
    private func checkResources() {
        guard [.capturing, .draftReady, .preflight].contains(lifecycle.phase), walkthrough.continuity != .broken else { return }
        do { try verifyCaptureAdmission() }
        catch { checkpoint(reason: error.localizedDescription + " Finishing the active room to preserve returned source.") }
        if lifecycle.phase == .capturing && ProcessInfo.processInfo.isLowPowerModeEnabled { guidance = "Low Power Mode is on. Finish this room soon and review the saved result." }
    }
    private func fail(_ generation: UUID, _ text: String) {
        guard lifecycle.failed(generation) else { return }
        message = text; finishWatchdog?.cancel()
        // Saving/processing failure does not invalidate already-returned raw
        // coordinates, but the next capture requires re-established continuity.
        walkthrough.interrupt(invalidateActive: !receivedSource); worldSession?.pause()
    }
    func instruction(_ instruction: RoomCaptureSession.Instruction, generation: UUID) {
        guard lifecycle.accepts(generation), lifecycle.phase == .capturing else { return }
        switch instruction {
        case .normal: guidance = "Move slowly around this room. Include every corner and doorway."
        case .moveCloseToWall: guidance = "Move closer to the wall."
        case .moveAwayFromWall: guidance = "Move farther from the wall."
        case .turnOnLight: guidance = "Increase the light in this room."
        case .slowDown: guidance = "Slow down and keep the phone steady."
        case .lowTexture: guidance = "Point toward a corner or another visible room feature."
        @unknown default: guidance = "Move slowly and include visible room features."
        }
    }
    func update(_ room: CapturedRoom, generation: UUID) {
        guard lifecycle.accepts(generation), lifecycle.phase == .capturing else { return }
        visibleWalls = room.walls.count
    }
}

private struct NativeCaptureError: LocalizedError {
    let errorDescription: String?
    init(_ text: String) { errorDescription = text }
}

/// A bounded callback bridge. A timeout cannot double-resume the continuation
/// when ARKit eventually provides a late world map.
private final class WorldMapRequest: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<ARWorldMap, Error>?
    init(_ continuation: CheckedContinuation<ARWorldMap, Error>) { self.continuation = continuation }
    func complete(_ result: Result<ARWorldMap, Error>) {
        lock.lock(); let pending = continuation; continuation = nil; lock.unlock()
        pending?.resume(with: result)
    }
}

/// No frame/image retention and no replacement of the RoomPlan session delegate.
/// This observer belongs to the explicit ARSession supplied to RoomCaptureView.
private final class CaptureSessionObserver: NSObject, ARSessionDelegate {
    weak var owner: CaptureController?
    let sessionID: String
    init(owner: CaptureController, sessionID: String) { self.owner = owner; self.sessionID = sessionID }
    func sessionWasInterrupted(_ session: ARSession) {
        Task { @MainActor [weak owner, sessionID] in owner?.sessionInterrupted(sessionID) }
    }
    func session(_ session: ARSession, didFailWithError error: Error) {
        Task { @MainActor [weak owner, sessionID] in owner?.sessionInterrupted(sessionID) }
    }
    func sessionShouldAttemptRelocalization(_ session: ARSession) -> Bool { false } // Explicit identified-map recovery only.
    func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        let state: ConnectedCaptureLifecycle.Tracking
        switch camera.trackingState {
        case .normal: state = .normal
        case .notAvailable: state = .unavailable
        case .limited(.relocalizing): state = .relocalizing
        case .limited: state = .limited
        }
        Task { @MainActor [weak owner, sessionID] in owner?.observedTracking(state, sessionID: sessionID) }
    }
}

/// Every callback carries the generation installed when this view was made.
private final class CaptureAttemptDelegate: NSObject, RoomCaptureSessionDelegate, RoomCaptureViewDelegate {
    weak var owner: CaptureController?
    let generation: UUID
    init(owner: CaptureController, generation: UUID) { self.owner = owner; self.generation = generation }
    func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
        Task { @MainActor [weak owner, generation] in owner?.receive(data, generation: generation, error: error) }
    }
    func captureSession(_ session: RoomCaptureSession, didProvide instruction: RoomCaptureSession.Instruction) {
        Task { @MainActor [weak owner, generation] in owner?.instruction(instruction, generation: generation) }
    }
    func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        Task { @MainActor [weak owner, generation] in owner?.update(room, generation: generation) }
    }
    required init?(coder: NSCoder) { return nil }
    func encode(with coder: NSCoder) {}
    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        Task { @MainActor [weak owner, generation] in owner?.receive(roomDataForProcessing, generation: generation, error: error) }
        return false
    }
    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {}
}
