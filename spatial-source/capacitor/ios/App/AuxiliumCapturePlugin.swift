import Capacitor
import SwiftUI
import UIKit
import WebKit
import AVFoundation
import ARKit
import RoomPlan
import SpatialCore

@objc(AuxiliumCapturePlugin)
final class AuxiliumCapturePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AuxiliumCapturePlugin"
    let jsName = "AuxiliumCapture"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "capture", returnType: CAPPluginReturnPromise)
    ]
    @MainActor var accessAllowed: () -> Bool = { false }
    @MainActor private var pendingCall: CAPPluginCall?
    @MainActor private var vault: NativeCaptureVault?
    @MainActor private var presentation: UIViewController?
    @MainActor private var generation = UUID()

    @objc func capabilities(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard validate(call) else { return }
            let supported = UIDevice.current.userInterfaceIdiom == .phone &&
                RoomCaptureSession.isSupported && ARWorldTrackingConfiguration.isSupported
            let denied = [.denied, .restricted].contains(AVCaptureDevice.authorizationStatus(for: .video))
            let available = supported && !denied && accessAllowed() && UIApplication.shared.isProtectedDataAvailable
            var result: [String: Any] = ["bridgeVersion": BridgePolicy.version, "available": available]
            if !available {
                result["reason"] = !supported ? "Scanning requires a supported LiDAR-equipped iPhone Pro. Saved layouts remain editable." :
                    denied ? "Enable Camera for Auxilium Spatial in Settings to scan." : "Unlock this app to scan."
            }
            call.resolve(result)
        }
    }

    @objc func capture(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard validate(call) else { return }
            guard accessAllowed(), UIApplication.shared.isProtectedDataAvailable,
                  UIApplication.shared.applicationState == .active else {
                call.reject("Unlock the app before opening native capture.", "LOCKED"); return
            }
            guard pendingCall == nil, let presenter = bridge?.viewController,
                  presenter.presentedViewController == nil else {
                call.reject("A native operation is already open.", "BUSY"); return
            }
            do {
                let vault = try NativeCaptureVault()
                let token = UUID(); generation = token; pendingCall = call; self.vault = vault
                let view = NativeCaptureWorkspace(vault: vault,
                    complete: { [weak self] document in self?.complete(document, token: token) },
                    cancel: { [weak self] in self?.cancel(token: token) })
                let controller = UIHostingController(rootView: view)
                controller.modalPresentationStyle = .fullScreen
                controller.isModalInPresentation = true
                presentation = controller
                presenter.present(controller, animated: true)
            } catch { call.reject("Native saved captures could not be opened. Existing files were retained.", "STORAGE_UNAVAILABLE", error) }
        }
    }

    @MainActor private func validate(_ call: CAPPluginCall) -> Bool {
        guard BridgePolicy.permits(webView?.url) else {
            call.reject("Native capture is available only to the installed workspace.", "ORIGIN_DENIED"); return false
        }
        guard BridgePolicy.accepts(version: call.getString("bridgeVersion"), keys: Set(call.options.keys.compactMap { $0 as? String })) else {
            call.reject("Unsupported or malformed capture bridge request.", "BRIDGE_VERSION"); return false
        }
        return true
    }

    @MainActor private func complete(_ document: SpatialDocument, token: UUID) {
        guard token == generation, let vault else { return }
        let pendingCall = self.pendingCall
        Task { @MainActor in
            do {
                // Return only the re-opened immutable bytes, never a live UI model
                // or an unsaved RoomPlan callback. Raw archives stay in native storage.
                let saved = try await vault.verifiedSavedCapture(document)
                guard generation == token, accessAllowed(), UIApplication.shared.isProtectedDataAvailable,
                      BridgePolicy.permits(webView?.url) else {
                    vault.message = "The saved capture is retained. Unlock the app to open it."; return
                }
                try Validator.requireValid(saved)
                let data = try saved.encoded()
                guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw CocoaError(.coderInvalidValue) }
                if let pendingCall, self.pendingCall === pendingCall {
                    pendingCall.resolve(["bridgeVersion": BridgePolicy.version, "document": value, "nativeSourceRetained": true])
                }
                self.pendingCall = nil
                presentation?.dismiss(animated: true); presentation = nil; self.vault = nil
            } catch { vault.message = "The captured source is retained, but this layout could not be verified for opening. " + error.localizedDescription }
        }
    }
    @MainActor private func cancel(token: UUID) {
        guard generation == token else { return }
        pendingCall?.reject("Native capture closed. Previously retained rooms remain on this device.", "CANCELLED")
        pendingCall = nil; generation = UUID()
        presentation?.dismiss(animated: true); presentation = nil; vault = nil
    }
    @MainActor func lock() {
        // Retain the native screen while the device shield covers it. The existing
        // capture controller checkpoints interruption and refuses to infer alignment.
        Task { await setLocalAccess(false) }
    }
    @MainActor func setLocalAccess(_ allowed: Bool) async {
        guard let vault else { return }
        let current = accessAllowed() && UIApplication.shared.isProtectedDataAvailable
        await vault.store.setProtectedDataAvailable(current)
        if current && accessAllowed() { await vault.reload() }
    }
    @MainActor func workspaceReloaded() {
        pendingCall?.reject("The workspace reloaded. Native source remains retained; reopen it from Apple capture.", "WORKSPACE_RELOADED")
        pendingCall = nil
    }
    override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        NSNumber(value: !BridgePolicy.permits(navigationAction.request.url))
    }
}
