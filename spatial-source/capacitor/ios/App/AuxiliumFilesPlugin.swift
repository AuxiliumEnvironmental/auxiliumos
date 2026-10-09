import Capacitor
import UIKit

@objc(AuxiliumFilesPlugin)
final class AuxiliumFilesPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AuxiliumFilesPlugin"
    let jsName = "AuxiliumFiles"
    let pluginMethods = [CAPPluginMethod(name: "saveExport", returnType: CAPPluginReturnPromise)]
    @MainActor var accessAllowed: () -> Bool = { false }
    @MainActor private var pending: CAPPluginCall?
    @MainActor private var directory: URL?
    @MainActor private var activity: UIActivityViewController?
    @MainActor private var generation = UUID()

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
            guard pending == nil, let presenter = bridge?.viewController, presenter.presentedViewController == nil else {
                call.reject("Another native operation is open.", "BUSY"); return
            }
            do {
                let bytes = try ExportBridgePolicy.decode(filename: filename, mimeType: type, base64: encoded)
                let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                var parent = support.appendingPathComponent("AuxiliumSpatialExportStaging", isDirectory: true)
                try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
                var flags = URLResourceValues(); flags.isExcludedFromBackup = true; try parent.setResourceValues(flags)
                // Remove stale files left by a process death, only in this plugin's
                // private staging folder. Captures and drafts are never touched.
                for old in try FileManager.default.contentsOfDirectory(at: parent, includingPropertiesForKeys: nil) {
                    try FileManager.default.removeItem(at: old)
                }
                let token = UUID(), path = parent.appendingPathComponent(token.uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: path, withIntermediateDirectories: false, attributes: [.protectionKey: FileProtectionType.complete])
                directory = path
                let file = path.appendingPathComponent(filename)
                try bytes.write(to: file, options: [.atomic, .completeFileProtection])
                let controller = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                controller.popoverPresentationController?.sourceView = presenter.view
                controller.popoverPresentationController?.sourceRect = presenter.view.bounds
                generation = token; pending = call; activity = controller
                controller.completionWithItemsHandler = { [weak self] _, completed, _, error in
                    Task { @MainActor in self?.finish(token: token, completed: completed, error: error) }
                }
                presenter.present(controller, animated: true)
            } catch {
                cleanup()
                call.reject("The export could not be prepared. No file was shared.", "INVALID_EXPORT", error)
            }
        }
    }

    @MainActor private func finish(token: UUID, completed: Bool, error: Error?) {
        guard generation == token, let pending else { return }
        if let error { pending.reject("The selected export destination did not finish.", "EXPORT_FAILED", error) }
        else { pending.resolve(["bridgeVersion": BridgePolicy.version, "completed": completed]) }
        self.pending = nil; activity = nil; cleanup()
    }
    @MainActor func lock() {
        // A backgrounding/lock never counts as successful export. The native
        // activity callback may arrive later; its generation is now invalid.
        generation = UUID()
        pending?.resolve(["bridgeVersion": BridgePolicy.version, "completed": false])
        pending = nil; activity?.dismiss(animated: false); activity = nil; cleanup()
    }
    @MainActor private func cleanup() {
        if let directory { try? FileManager.default.removeItem(at: directory) }
        directory = nil
    }
}
