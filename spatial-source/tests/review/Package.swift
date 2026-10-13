// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "IndependentReviewProbes", dependencies: [
    .package(path: "../../packages/SpatialCore"),
    .package(path: "../../packages/SpatialPersistence"),
    .package(path: "../../packages/SpatialInterop")
], targets: [.executableTarget(name: "ReviewProbes", dependencies: [
    .product(name: "SpatialCore", package: "SpatialCore"),
    .product(name: "SpatialPersistence", package: "SpatialPersistence"),
    .product(name: "SpatialInterop", package: "SpatialInterop")
])])
