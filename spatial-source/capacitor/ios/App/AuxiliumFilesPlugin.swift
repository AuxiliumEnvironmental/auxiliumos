import Capacitor
import UIKit

/// Pure state for a single explicit share operation. Leaving the app and locking
/// protected data are not UIActivity completion events. Page identity is separate
/// from file lifetime, so a stale JavaScript callback cannot discard in-use bytes.
struct NativeExportLifecycle {
    enum Completion: Equatable { case succeeded, cancelled, failed }
    private(set) var operationID: UUID?
    private(set) var completion: Completion?
    private(set) var pageCurrent = true
    private(set) var foreground = true
    private(set) var protectedDataAvailable = true
    private(set) var unlocked = true
    var retainsStagedFile: Bool { operationID != nil && completion == nil }
    var mayDeliverCompletion: Bool {
        completion != nil && pageCurrent && foreground && protectedDataAvailable && unlocked
    }
    mutating func begin(_ id: UUID) -> Bool {
        guard operationID == nil else { return false }
        operationID = id; completion = nil; pageCurrent = true
        return true
    }
    mutating func enteredBackground() { foreground = false; unlocked = false }
    mutating func protectedDataUnavailable() { protectedDataAvailable = false; unlocked = false }
    mutating func updateAccess(foreground: Bool, protectedDataAvailable: Bool, unlocked: Bool) {
        self.foreground = foreground; self.protectedDataAvailable = protectedDataAvailable; self.unlocked = unlocked
    }
    mutating func workspaceReloaded() { pageCurrent = false }
    mutating func completed(_ id: UUID, completed: Bool, failed: Bool) -> Bool {
        guard operationID == id, completion == nil else { return false }
        completion = failed ? .failed : (completed ? .succeeded : .cancelled)
        return true
    }
    mutating func clear() { operationID = nil; completion = nil; pageCurrent = true }
}

@objc(AuxiliumFilesPlugin)
final class AuxiliumFilesPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AuxiliumFilesPlugin"
    let jsName = "AuxiliumFiles"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "saveExport", returnType: CAPPluginReturnPromise)]
    @MainActor var accessAllowed: () -> Bool = { false }
    @MainActor private var pending: CAPPluginCall?
    @MainActor private var directory: URL?
    @MainActor private var activity: UIActivityViewController?
    @MainActor private var lifecycle = NativeExportLifecycle()
    @MainActor private var completionError: Error?

    override func load() {
        Task { @MainActor in applicationAccessChanged() }
    }

    @objc func saveExport(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard BridgePolicy.permits(webView?.url), accessAllowed(), UIApplication.shared.isProtectedDataAvailable,
                  UIApplication.shared.applicationState == .active else {
                call.reject("Unlock the installed workspace before exporting.", "ACCESS_DENIED"); return
            }
            guard call.getString("bridgeVersion") == BridgePolicy.version,
                  Set(call.options.keys.compactMap { $0 as? String }) == ["bridgeVersion", "filename", "mimeType", "base64"],
                  let filename = call.getString("filename"), let type = call.getString("mimeType"),
                  let encoded = call.getString("base64") else {
                call.reject("Unsupported export bridge request.", "INVALID_EXPORT"); return
            }
            guard lifecycle.operationID == nil, pending == nil, let presenter = bridge?.viewController,
                  presenter.presentedViewController == nil else {
                call.reject("Another native operation is open.", "BUSY"); return
            }
            do {
                let bytes = try ExportBridgePolicy.decode(filename: filename, mimeType: type, base64: encoded)
                let parent = try stagingRoot()
                try removeStaleFiles(in: parent)
                let token = UUID(), path = parent.appendingPathComponent(token.uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: path, withIntermediateDirectories: false,
                                                       attributes: [.protectionKey: FileProtectionType.complete])
                directory = path
                let file = path.appendingPathComponent(filename)
                try bytes.write(to: file, options: [.atomic, .completeFileProtection])
                let controller = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                controller.popoverPresentationController?.sourceView = presenter.view
                controller.popoverPresentationController?.sourceRect = presenter.view.bounds
                guard lifecycle.begin(token) else { throw CocoaError(.coderInvalidValue) }
                pending = call; activity = controller; completionError = nil
                refreshAccess()
                controller.completionWithItemsHandler = { [weak self] _, completed, _, error in
                    Task { @MainActor in self?.finish(token: token, completed: completed, error: error) }
                }
                presenter.present(controller, animated: true)
            } catch {
                cleanupStaging()
                call.reject("The export could not be prepared. No file was shared.", "INVALID_EXPORT", error)
            }
        }
    }

    @MainActor private func finish(token: UUID, completed: Bool, error: Error?) {
        guard lifecycle.completed(token, completed: completed, failed: error != nil) else { return }
        completionError = error; activity = nil
        // UIKit's completion callback, not a scene transition, releases the file.
        // If data protection prevents deletion, the same private staging folder
        // is retried after unlock or on the next launch/request.
        cleanupStaging()
        refreshAccess(); deliverIfReady()
    }
    @MainActor func enteredBackground() {
        // A selected target may open another application before it reads the URL.
        // Keep the exact bytes and native activity; neither success nor cancellation
        // can be inferred from this notification.
        lifecycle.enteredBackground()
    }
    @MainActor func protectedDataUnavailable() {
        // NSFileProtectionComplete denies locked-device access. The device shield
        // hides the UI, while the explicit operation waits for UIKit's real result.
        lifecycle.protectedDataUnavailable()
    }
    @MainActor func workspaceReloaded() {
        // Do not send even a rejection to a callback ID from an earlier JS page.
        // The activity may still be transferring the file, so its lifetime remains
        // bound to completion. An in-flight share blocks another native share.
        lifecycle.workspaceReloaded(); pending = nil
        if lifecycle.completion != nil { cleanupStaging(); lifecycle.clear(); completionError = nil }
    }
    @MainActor func applicationAccessChanged() {
        refreshAccess()
        deliverIfReady()
        guard lifecycle.operationID == nil, accessAllowed(), UIApplication.shared.isProtectedDataAvailable else { return }
        // Startup/recovery cleanup is scoped to this plugin, never saved layouts.
        do { try removeStaleFiles(in: stagingRoot()) } catch { /* Retry at the next explicit export. */ }
    }
    @MainActor private func refreshAccess() {
        lifecycle.updateAccess(foreground: UIApplication.shared.applicationState == .active,
            protectedDataAvailable: UIApplication.shared.isProtectedDataAvailable, unlocked: accessAllowed())
    }
    @MainActor private func deliverIfReady() {
        guard let completion = lifecycle.completion else { return }
        if !lifecycle.pageCurrent {
            pending = nil; cleanupStaging(); lifecycle.clear(); completionError = nil; return
        }
        guard lifecycle.mayDeliverCompletion, BridgePolicy.permits(webView?.url), let pending else { return }
        switch completion {
        case .failed:
            pending.reject("The selected export destination did not finish.", "EXPORT_FAILED", completionError)
        case .succeeded, .cancelled:
            pending.resolve(["bridgeVersion": BridgePolicy.version, "completed": completion == .succeeded])
        }
        self.pending = nil; cleanupStaging(); lifecycle.clear(); completionError = nil
    }
    @MainActor private func stagingRoot() throws -> URL {
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                 appropriateFor: nil, create: true)
        var parent = support.appendingPathComponent("AuxiliumSpatialExportStaging", isDirectory: true)
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true,
                                               attributes: [.protectionKey: FileProtectionType.complete])
        var flags = URLResourceValues(); flags.isExcludedFromBackup = true; try parent.setResourceValues(flags)
        return parent
    }
    @MainActor private func removeStaleFiles(in parent: URL) throws {
        guard !lifecycle.retainsStagedFile else { return }
        for old in try FileManager.default.contentsOfDirectory(at: parent, includingPropertiesForKeys: nil) {
            try FileManager.default.removeItem(at: old)
        }
        directory = nil
    }
    @MainActor private func cleanupStaging() {
        guard !lifecycle.retainsStagedFile, let directory else { return }
        do { try FileManager.default.removeItem(at: directory); self.directory = nil }
        catch { /* Keep the path for retry; its contents remain protected. */ }
    }
}
