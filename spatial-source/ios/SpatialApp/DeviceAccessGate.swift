import SwiftUI
import UIKit
import LocalAuthentication

/// This verifies the device owner, not an organization identity or a publish
/// grant. A separate high-level window covers even presented capture/export UI
/// without tearing down an editor's unsaved model when the app locks.
@MainActor
final class DeviceAccessGate: ObservableObject {
    @Published private(set) var unlocked = false
    @Published private(set) var busy = false
    @Published private(set) var message: String?
    private weak var applicationWindow: UIWindow?
    private var shield: UIWindow?
    private var context: LAContext?
    private var generation = UUID()
    private var acceptedAttempt: UUID?

    func attach(to window: UIWindow) {
        guard applicationWindow !== window else { return }
        applicationWindow = window
        guard let scene = window.windowScene else { return }
        let shield = UIWindow(windowScene: scene)
        shield.windowLevel = .alert + 1
        shield.rootViewController = UIHostingController(rootView: DeviceUnlockView(gate: self))
        shield.backgroundColor = .systemBackground
        self.shield = shield
        if !unlocked { shield.makeKeyAndVisible() }
    }
    func lock() {
        generation = UUID(); context?.invalidate(); context = nil
        acceptedAttempt = nil
        busy = false; unlocked = false
        shield?.makeKeyAndVisible()
    }
    func conceal() { shield?.makeKeyAndVisible() }
    func becameActive() {
        guard UIApplication.shared.isProtectedDataAvailable else { lock(); return }
        if acceptedAttempt == generation { completeUnlock() }
        else if unlocked { shield?.isHidden = true; applicationWindow?.makeKey() }
        else { conceal() }
    }
    private func completeUnlock() {
        guard applicationWindow?.windowScene?.activationState == .foregroundActive,
              UIApplication.shared.isProtectedDataAvailable else { return }
        acceptedAttempt = nil; unlocked = true; shield?.isHidden = true; applicationWindow?.makeKey()
    }
    func authenticate() {
        guard !busy, UIApplication.shared.isProtectedDataAvailable,
              applicationWindow?.windowScene?.activationState == .foregroundActive else {
            message = "Unlock your device and return to this app to open retained work."
            return
        }
        let auth = LAContext(); auth.localizedCancelTitle = "Keep locked"
        var failure: NSError?
        guard auth.canEvaluatePolicy(.deviceOwnerAuthentication, error: &failure) else {
            message = "Set up a device passcode in Settings before storing private layouts. No company access or publication permission is granted by device unlock."
            return
        }
        let attempt = UUID(); generation = attempt; context = auth; busy = true; message = nil
        Task {
            do {
                let accepted = try await auth.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Open the private layouts saved on this device.")
                guard generation == attempt else { return }
                busy = false; context = nil
                guard accepted, UIApplication.shared.isProtectedDataAvailable,
                      applicationWindow?.windowScene?.activationState != .background else {
                    message = "The workspace remains locked. Try again when this app is active."; return
                }
                // Authentication UI itself temporarily inactivates the scene.
                // Retain this generation's success until the app is active.
                acceptedAttempt = attempt; completeUnlock()
            } catch {
                guard generation == attempt else { return }
                busy = false; context = nil
                message = "The workspace remains locked. Your saved and pending work has not been deleted."
            }
        }
    }
}

private struct DeviceUnlockView: View {
    @ObservedObject var gate: DeviceAccessGate
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Image(systemName: "lock.shield").font(.largeTitle).accessibilityHidden(true)
                Text("Private layouts").font(.title.bold())
                Text("Use Face ID or your device passcode to open work saved on this device.").multilineTextAlignment(.center)
                Button("Unlock workspace") { gate.authenticate() }.buttonStyle(.borderedProminent).frame(minWidth: 44, minHeight: 44).disabled(gate.busy)
                if gate.busy { ProgressView("Waiting for device authentication") }
                if let message = gate.message { Text(message).font(.callout).multilineTextAlignment(.center) }
                Text("Local device access only. AuxiliumOS and Moldo are not connected.").font(.footnote).foregroundStyle(.secondary)
            }.padding(28).frame(maxWidth: 540).frame(maxWidth: .infinity)
        }.background(Color(uiColor: .systemBackground)).privacySensitive()
    }
}

struct DeviceGateInstaller: UIViewRepresentable {
    let gate: DeviceAccessGate
    func makeUIView(context: Context) -> AttachmentView { let view = AttachmentView(); view.gate = gate; return view }
    func updateUIView(_ view: AttachmentView, context: Context) { view.gate = gate }
    final class AttachmentView: UIView {
        weak var gate: DeviceAccessGate?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            if let window { DispatchQueue.main.async { [weak self, weak window] in if let window { self?.gate?.attach(to: window) } } }
        }
    }
}
