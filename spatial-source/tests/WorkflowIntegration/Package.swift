// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "WorkflowIntegration",
    platforms: [.iOS(.v17), .macOS(.v13)],
    dependencies: [
        .package(path: "../../packages/SpatialCore"),
        .package(path: "../../packages/SpatialPersistence"),
        .package(path: "../../packages/SpatialInterop"),
        .package(path: "../../packages/CaptureKit")
    ],
    targets: [.testTarget(name: "WorkflowIntegrationTests", dependencies: [
        .product(name: "SpatialCore", package: "SpatialCore"),
        .product(name: "SpatialPersistence", package: "SpatialPersistence"),
        .product(name: "SpatialInterop", package: "SpatialInterop"),
        .product(name: "CaptureKit", package: "CaptureKit")
    ])]
)
