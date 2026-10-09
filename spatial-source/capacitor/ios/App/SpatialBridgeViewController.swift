import Capacitor
import WebKit

@MainActor
final class SpatialBridgeViewController: CAPBridgeViewController {
    var accessAllowed: () -> Bool = { false }
    let capturePlugin = AuxiliumCapturePlugin()
    let filesPlugin = AuxiliumFilesPlugin()
    private var guardedHandler: PackagedWorkspaceHandler?
    private var navigationGuard: WorkspaceNavigationGuard?

    override func instanceDescriptor() -> InstanceDescriptor {
        // Ignore persisted hot-update paths and remote live-reload settings.
        // Only the bundle copied from the canonical web build can call native code.
        let descriptor = InstanceDescriptor()
        descriptor.appLocation = Bundle.main.bundleURL.appendingPathComponent("public", isDirectory: true)
        descriptor.serverURL = nil; descriptor.urlScheme = "capacitor"; descriptor.urlHostname = "localhost"
        descriptor.allowedNavigationHostnames = []
        descriptor.loggingBehavior = .none
        descriptor.isWebDebuggable = false
        return descriptor
    }

    override func capacitorDidLoad() {
        capturePlugin.accessAllowed = { [weak self] in self?.accessAllowed() == true }
        filesPlugin.accessAllowed = { [weak self] in self?.accessAllowed() == true }
        bridge?.registerPluginInstance(capturePlugin)
        bridge?.registerPluginInstance(filesPlugin)
        // Capacitor's general handler is broad. Put a main-frame, origin and
        // plugin allowlist in front of it, including calls from same-origin frames.
        guard let capacitor = bridge as? CapacitorBridge, let webView else { return }
        let handler = PackagedWorkspaceHandler(target: capacitor.webViewDelegationHandler)
        guardedHandler = handler
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "bridge")
        webView.configuration.userContentController.add(handler, name: "bridge")
        let navigation = WorkspaceNavigationGuard(target: capacitor.webViewDelegationHandler) { [weak self] in
            self?.capturePlugin.workspaceReloaded(); self?.filesPlugin.workspaceReloaded()
        }
        navigationGuard = navigation
        webView.navigationDelegate = navigation
        webView.uiDelegate = navigation
    }

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        // Preserve the existing persistent IndexedDB store. Selecting a new UUID
        // or a nonpersistent store would orphan or discard local drafts. WebKit's
        // actual file protection still needs installed-device acceptance; the
        // device-owner shield alone makes no at-rest protection claim.
        configuration.websiteDataStore = .default()
        configuration.allowsAirPlayForMediaPlayback = false
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        return configuration
    }
}

/// No bridge calls from iframes, remote pages or Capacitor's local file proxy.
/// Sensitive built-ins such as arbitrary native HTTP and hot update paths are
/// deliberately not part of this app's exposed bridge.
private final class PackagedWorkspaceHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], body["type"] as? String == "message",
              BridgePolicy.permitsMessage(mainFrame: message.frameInfo.isMainFrame,
                scheme: message.frameInfo.securityOrigin.protocol, host: message.frameInfo.securityOrigin.host,
                request: message.frameInfo.request.url, page: message.webView?.url, plugin: body["pluginId"] as? String) else { return }
        target?.userContentController(userContentController, didReceive: message)
    }
}

/// Preserve Capacitor's navigation behavior while invalidating callbacks across
/// page reload/process death. A callback ID from an old JavaScript page must
/// never resolve a promise on a new page that happens to reuse that ID.
@MainActor
private final class WorkspaceNavigationGuard: NSObject, WKNavigationDelegate, WKUIDelegate {
    private weak var target: WKNavigationDelegate?
    private let changed: () -> Void
    init(target: WKNavigationDelegate, changed: @escaping () -> Void) { self.target = target; self.changed = changed }
    override func responds(to selector: Selector!) -> Bool { super.responds(to: selector) || target?.responds(to: selector) == true }
    override func forwardingTarget(for selector: Selector!) -> Any? { target }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        changed(); target?.webView?(webView, didStartProvisionalNavigation: navigation)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        changed(); target?.webViewWebContentProcessDidTerminate?(webView)
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
    func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.deny)
    }
}
