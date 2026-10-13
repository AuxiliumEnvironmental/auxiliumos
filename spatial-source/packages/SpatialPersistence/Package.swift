// swift-tools-version: 5.9
import PackageDescription

// Apple SDKs provide SQLite. Host pkg-config (for example Homebrew on a Mac
// runner) must never inject macOS search paths into an iOS or simulator link.
#if os(Linux)
let sqlitePkgConfig: String? = "sqlite3"
#else
let sqlitePkgConfig: String? = nil
#endif

let package = Package(
    name: "SpatialPersistence",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "SpatialPersistence", targets: ["SpatialPersistence"]),
               .executable(name: "spatialstorecheck", targets: ["spatialstorecheck"])],
    dependencies: [.package(path: "../SpatialCore"), .package(path: "../SpatialInterop")],
    targets: [
        .systemLibrary(name: "CSQLite", pkgConfig: sqlitePkgConfig, providers: [.apt(["libsqlite3-dev"])]),
        .target(name: "SpatialPersistence", dependencies: ["CSQLite", "SpatialCore", "SpatialInterop"]),
        .executableTarget(name: "spatialstorecheck", dependencies: ["SpatialPersistence", "SpatialCore"]),
        .testTarget(name: "SpatialPersistenceTests", dependencies: ["SpatialPersistence", "SpatialCore"])
    ]
)
