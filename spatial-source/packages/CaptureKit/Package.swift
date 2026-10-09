// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CaptureKit",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "CaptureKit", targets: ["CaptureKit"])],
    targets: [.target(name: "CaptureKit"), .testTarget(name: "CaptureKitTests", dependencies: ["CaptureKit"])]
)
