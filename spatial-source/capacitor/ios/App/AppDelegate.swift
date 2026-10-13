import UIKit
import Combine

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Workspace", sessionRole: session.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}

@MainActor
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let access = DeviceAccessGate()
    private var host: SpatialBridgeViewController?
    private var observers: [NSObjectProtocol] = []
    private var accessSubscription: AnyCancellable?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let controller = SpatialBridgeViewController()
        controller.accessAllowed = { [weak self] in self?.access.unlocked == true }
        let window = UIWindow(windowScene: scene)
        // Do not open WebKit/IndexedDB during locked-device launch or prewarm.
        // Keep the existing persistent store intact; install its host only after
        // the device-owner gate succeeds in an active, protected-data session.
        let lockedPlaceholder = UIViewController()
        lockedPlaceholder.view.backgroundColor = .systemBackground
        window.rootViewController = lockedPlaceholder
        self.window = window; host = controller
        window.makeKeyAndVisible(); access.attach(to: window)
        accessSubscription = access.$unlocked.sink { [weak self, weak controller] unlocked in
            Task { @MainActor in
                if unlocked, let self, let controller, self.access.unlocked,
                   UIApplication.shared.isProtectedDataAvailable,
                   self.window?.windowScene?.activationState == .foregroundActive,
                   self.window?.rootViewController !== controller {
                    self.window?.rootViewController = controller
                }
                await controller?.capturePlugin.setLocalAccess(unlocked)
                controller?.filesPlugin.applicationAccessChanged()
            }
        }
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.protectedDataWillBecomeUnavailableNotification,
            object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in
                    self?.access.lock(); self?.host?.capturePlugin.lock()
                    self?.host?.filesPlugin.protectedDataUnavailable()
                }
            })
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.protectedDataDidBecomeAvailableNotification,
            object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.access.becameActive(); self?.host?.filesPlugin.applicationAccessChanged() }
            })
    }
    func sceneWillResignActive(_ scene: UIScene) { access.conceal() }
    func sceneDidEnterBackground(_ scene: UIScene) {
        access.lock(); host?.capturePlugin.lock(); host?.filesPlugin.enteredBackground()
    }
    func sceneDidBecomeActive(_ scene: UIScene) { access.becameActive(); host?.filesPlugin.applicationAccessChanged() }
    deinit { observers.forEach(NotificationCenter.default.removeObserver) }
}
