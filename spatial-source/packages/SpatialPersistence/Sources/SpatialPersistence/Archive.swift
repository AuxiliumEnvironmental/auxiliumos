import Foundation
import SpatialCore
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

struct StoredArtifact {
    let id: String
    let filename: String
    let digest: String
    let byteCount: Int
    let kind: String
    var bindings: [SQLValue] { [.text(id), .text(filename), .text(digest), .integer(byteCount), .text(kind)] }
    init(id: String, filename: String, digest: String, byteCount: Int, kind: String) {
        self.id=id; self.filename=filename; self.digest=digest; self.byteCount=byteCount; self.kind=kind
    }
    init(row: SQLRow) throws {
        id=row.text(0); filename=row.text(1); digest=row.text(2); byteCount=row.int(3); kind=row.text(4)
        guard UUID(uuidString: id) != nil, filename == id + ".artifact", digest.count == 64,
              digest.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }), byteCount >= 0 else {
            throw StoreError.corruptArtifact
        }
    }
}

private struct CaptureIntent: Codable {
    let version: Int
    let artifactID: String
    let sourceID: String
    let kind: CaptureArtifactKind
    let sha256: String
    let byteCount: Int
    var recovery: RecoverableCapture {
        .init(artifactID: artifactID, sourceID: sourceID, kind: kind, sha256: sha256, byteCount: byteCount)
    }
}

/// The app supplies an application-support URL. User data never becomes a path.
final class ArtifactArchive: @unchecked Sendable {
    let root: URL
    let staging: URL
    let artifacts: URL
    let databaseURL: URL
    init(root: URL) throws {
        guard root.isFileURL else { throw StoreError.unsafeFile }
        self.root = root.standardizedFileURL
        staging = self.root.appendingPathComponent("staging", isDirectory: true)
        artifacts = self.root.appendingPathComponent("artifacts", isDirectory: true)
        databaseURL = self.root.appendingPathComponent("spatial.sqlite3")
        for directory in [self.root, staging, artifacts] {
            if FileManager.default.fileExists(atPath: directory.path) {
                try Self.requireDirectory(directory)
            } else {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                        attributes: [.posixPermissions: 0o700])
                try Self.requireDirectory(directory)
            }
            try Self.protect(directory, directory: true)
        }
        try protectDatabaseFiles()
        #if os(iOS) || os(macOS)
        var mutableRoot = self.root
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try mutableRoot.setResourceValues(values)
        #endif
    }
    func protectDatabaseFiles() throws {
        for suffix in ["", "-wal", "-shm"] {
            let url = URL(fileURLWithPath: databaseURL.path + suffix)
            if FileManager.default.fileExists(atPath: url.path) {
                try Self.requireRegular(url)
                try Self.protect(url, directory: false)
            }
        }
    }
    func stage(_ data: Data, kind: String, limit: Int, captureSourceID: String? = nil,
               fault: @Sendable (CommitBoundary) throws -> Void) throws -> StoredArtifact {
        guard !data.isEmpty, data.count <= limit else { throw StoreError.sizeLimit }
        try Self.requireDirectory(root); try Self.requireDirectory(staging); try Self.requireDirectory(artifacts)
        let id = UUID().uuidString.lowercased()
        let staged = staging.appendingPathComponent(id + ".stage")
        let final = artifacts.appendingPathComponent(id + ".artifact")
        let digest = ArtifactDigest.sha256(data)
        if let source = captureSourceID {
            guard Validator.validID(source), let captureKind = CaptureArtifactKind(rawValue: kind) else { throw StoreError.invalidIdentifier }
            let intent = CaptureIntent(version: 1, artifactID: id, sourceID: source,
                                       kind: captureKind, sha256: digest, byteCount: data.count)
            try writeProtected(try JSONEncoder().encode(intent), to: staging.appendingPathComponent(id + ".intent"))
            try Self.syncDirectory(staging)
            try fault(.captureIntentSynced)
        }
        try writeProtected(data, to: staged)
        try Self.syncDirectory(staging)
        try fault(.stagedFileSynced)
        try promote(staged: staged, final: final)
        try fault(.immutableFilePromoted)
        return StoredArtifact(id: id, filename: id + ".artifact", digest: digest,
                              byteCount: data.count, kind: kind)
    }
    private func writeProtected(_ data: Data, to staged: URL) throws {
        let fd = staged.path.withCString { open($0, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600) }
        guard fd >= 0 else { throw Self.ioError() }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        do {
            try Self.protect(staged, directory: false)
            try handle.write(contentsOf: data)
            try handle.synchronize()
            try handle.close()
        } catch {
            try? handle.close()
            // Retain the staged bytes for explicit inspection/recovery.
            if (error as NSError).code == NSFileWriteOutOfSpaceError { throw StoreError.insufficientSpace }
            throw error
        }
    }
    private func promote(staged: URL, final: URL) throws {
        // link() will not overwrite an existing immutable file. Same filesystem.
        guard staged.path.withCString({ source in final.path.withCString { link(source, $0) } }) == 0 else {
            throw Self.ioError()
        }
        try Self.syncDirectory(artifacts)
        guard staged.path.withCString({ unlink($0) }) == 0 else { throw Self.ioError() }
        try Self.syncDirectory(staging)
    }
    func read(_ artifact: StoredArtifact, limit: Int) throws -> Data {
        guard artifact.byteCount <= limit, artifact.byteCount > 0 else { throw StoreError.sizeLimit }
        try Self.requireDirectory(root); try Self.requireDirectory(artifacts)
        // StoredArtifact validates exact generated basename before this join.
        let url = artifacts.appendingPathComponent(artifact.filename)
        let data = try readFile(url, limit: limit)
        guard data.count == artifact.byteCount, ArtifactDigest.sha256(data) == artifact.digest else { throw StoreError.corruptArtifact }
        return data
    }
    /// Only a committed history-retirement ledger may call this method. No directory
    /// recursion, user paths, raw capture, publication, or recovery-artifact deletion.
    /// Missing exact files are idempotent only AFTER that durable retirement was committed.
    func removeRetiredGeometry(_ artifact: StoredArtifact, limit: Int) throws {
        guard artifact.kind == "geometry", UUID(uuidString: artifact.id) != nil,
              artifact.filename == artifact.id + ".artifact" else { throw HistoryCleanupError.unsafeCandidate }
        try Self.requireDirectory(root); try Self.requireDirectory(artifacts)
        let url = artifacts.appendingPathComponent(artifact.filename)
        var info = stat()
        let status = url.path.withCString { lstat($0, &info) }
        if status != 0 {
            guard errno == ENOENT else { throw Self.ioError() }
            try Self.syncDirectory(artifacts); return
        }
        guard (info.st_mode & S_IFMT) == S_IFREG else { throw HistoryCleanupError.unsafeCandidate }
        _ = try read(artifact, limit: limit)
        var current = stat()
        guard url.path.withCString({ lstat($0, &current) }) == 0,
              current.st_ino == info.st_ino, current.st_dev == info.st_dev,
              (current.st_mode & S_IFMT) == S_IFREG else { throw HistoryCleanupError.unsafeCandidate }
        guard url.path.withCString({ unlink($0) }) == 0 else { throw Self.ioError() }
        try Self.syncDirectory(artifacts)
    }
    private func readFile(_ url: URL, limit: Int) throws -> Data {
        let fd = url.path.withCString { open($0, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC) }
        guard fd >= 0 else { throw StoreError.corruptArtifact }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close() }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
              info.st_size > 0, info.st_size <= limit else { throw StoreError.corruptArtifact }
        let expected = Int(info.st_size)
        let data = try handle.read(upToCount: expected + 1) ?? Data()
        guard data.count == expected else { throw StoreError.corruptArtifact }
        return data
    }
    private func readIntent(_ id: String, limit: Int) throws -> CaptureIntent {
        guard UUID(uuidString: id) != nil else { throw StoreError.invalidIdentifier }
        try Self.requireDirectory(root); try Self.requireDirectory(staging); try Self.requireDirectory(artifacts)
        let bytes = try readFile(staging.appendingPathComponent(id + ".intent"), limit: 2048)
        var scanner = JSONSafetyScanner(bytes)
        try scanner.validate()
        let intent: CaptureIntent
        do {
            let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any]
            guard let object, Set(object.keys) == Set(["version","artifactID","sourceID","kind","sha256","byteCount"]) else { throw StoreError.corruptArtifact }
            intent = try JSONDecoder().decode(CaptureIntent.self, from: bytes)
        } catch { throw StoreError.corruptArtifact }
        guard intent.version == 1, intent.artifactID == id, Validator.validID(intent.sourceID),
              intent.byteCount > 0, intent.byteCount <= limit, intent.sha256.count == 64,
              intent.sha256.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else { throw StoreError.corruptArtifact }
        return intent
    }
    private func verifiedCandidate(_ id: String, limit: Int) throws -> CaptureIntent {
        let intent = try readIntent(id, limit: limit)
        let final = artifacts.appendingPathComponent(id + ".artifact")
        let staged = staging.appendingPathComponent(id + ".stage")
        let url = FileManager.default.fileExists(atPath: final.path) ? final : staged
        let bytes = try readFile(url, limit: limit)
        guard bytes.count == intent.byteCount, ArtifactDigest.sha256(bytes) == intent.sha256 else { throw StoreError.corruptArtifact }
        return intent
    }
    func recoverableCaptures(limit: Int, referenced: Set<String>) throws -> [RecoverableCapture] {
        try Self.requireDirectory(root); try Self.requireDirectory(staging)
        let files = try FileManager.default.contentsOfDirectory(at: staging, includingPropertiesForKeys: nil)
        guard files.count <= 100000 else { throw StoreError.sizeLimit }
        var candidates: [RecoverableCapture] = []
        for file in files where file.pathExtension == "intent" {
            let id = file.deletingPathExtension().lastPathComponent
            guard !referenced.contains(id + ".artifact") else { continue }
            // One malformed orphan must not hide other recoverable captures.
            if let candidate = try? verifiedCandidate(id, limit: limit) { candidates.append(candidate.recovery) }
        }
        return candidates.sorted { $0.artifactID < $1.artifactID }
    }
    func recoverCapture(_ id: String, limit: Int) throws -> (RecoverableCapture, StoredArtifact) {
        let intent = try verifiedCandidate(id, limit: limit)
        let final = artifacts.appendingPathComponent(id + ".artifact")
        if !FileManager.default.fileExists(atPath: final.path) {
            try promote(staged: staging.appendingPathComponent(id + ".stage"), final: final)
        }
        let artifact = StoredArtifact(id: id, filename: id + ".artifact", digest: intent.sha256,
                                      byteCount: intent.byteCount, kind: intent.kind.rawValue)
        _ = try read(artifact, limit: limit)
        return (intent.recovery, artifact)
    }
    func finishCaptureIntent(_ id: String) throws {
        guard UUID(uuidString: id) != nil else { throw StoreError.invalidIdentifier }
        let url = staging.appendingPathComponent(id + ".intent")
        if url.path.withCString({ unlink($0) }) != 0 && errno != ENOENT { throw Self.ioError() }
        try Self.syncDirectory(staging)
    }
    func recoverableGeometry(referenced: Set<String>, limit: Int) throws -> [RecoverableDraft] {
        let retained = try recovery(referenced: referenced)
        var result: [String: RecoverableDraft] = [:]
        for entry in retained where entry.state == .stagedUncommitted || entry.state == .immutableUnreferenced {
            let id = URL(fileURLWithPath: entry.artifactName).deletingPathExtension().lastPathComponent
            guard UUID(uuidString: id) != nil, !referenced.contains(id + ".artifact"),
                  !FileManager.default.fileExists(atPath: staging.appendingPathComponent(id + ".intent").path) else { continue }
            if let (candidate, _, _) = try? geometryCandidate(id, limit: limit) { result[id] = candidate }
        }
        return result.values.sorted { $0.artifactID < $1.artifactID }
    }
    func recoverGeometry(_ id: String, limit: Int) throws -> (RecoverableDraft, SpatialDocument, StoredArtifact) {
        let (candidate, document, artifact) = try geometryCandidate(id, limit: limit)
        let final = artifacts.appendingPathComponent(artifact.filename)
        if !FileManager.default.fileExists(atPath: final.path) {
            try promote(staged: staging.appendingPathComponent(id + ".stage"), final: final)
        }
        _ = try read(artifact, limit: limit)
        return (candidate, document, artifact)
    }
    private func geometryCandidate(_ id: String, limit: Int) throws -> (RecoverableDraft, SpatialDocument, StoredArtifact) {
        guard UUID(uuidString: id) != nil,
              !FileManager.default.fileExists(atPath: staging.appendingPathComponent(id + ".intent").path) else { throw StoreError.invalidIdentifier }
        try Self.requireDirectory(root); try Self.requireDirectory(staging); try Self.requireDirectory(artifacts)
        let final = artifacts.appendingPathComponent(id + ".artifact")
        let bytes = try readFile(FileManager.default.fileExists(atPath: final.path) ? final : staging.appendingPathComponent(id + ".stage"), limit: limit)
        let document = try SpatialDocumentReader.decode(bytes, maximumBytes: limit)
        let digest = ArtifactDigest.sha256(bytes)
        let candidate = RecoverableDraft(artifactID: id, originalDocumentID: document.documentID,
            originalRevision: document.revision, sha256: digest, byteCount: bytes.count)
        let artifact = StoredArtifact(id: id, filename: id + ".artifact", digest: digest, byteCount: bytes.count, kind: "recoveredGeometry")
        return (candidate, document, artifact)
    }
    func recovery(referenced: Set<String>) throws -> [RecoveryArtifact] {
        try Self.requireDirectory(root); try Self.requireDirectory(staging); try Self.requireDirectory(artifacts)
        var result: [RecoveryArtifact] = []
        for (folder, suffix, state) in [(staging, ".stage", RecoveryArtifact.State.stagedUncommitted),
                                        (artifacts, ".artifact", .immutableUnreferenced)] {
            for url in try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) {
                let name = url.lastPathComponent
                guard (try? Self.requireRegular(url)) != nil else {
                    result.append(.init(artifactName: name, state: .unsafeFile)); continue
                }
                if folder == staging && url.pathExtension == "intent" {
                    let id = url.deletingPathExtension().lastPathComponent
                    if referenced.contains(id + ".artifact") { continue }
                    if (try? verifiedCandidate(id, limit: 256 * 1024 * 1024)) != nil { continue }
                    let hasPayload = FileManager.default.fileExists(atPath: staging.appendingPathComponent(id + ".stage").path) ||
                        FileManager.default.fileExists(atPath: artifacts.appendingPathComponent(id + ".artifact").path)
                    let validIntent = (try? readIntent(id, limit: 256 * 1024 * 1024)) != nil
                    result.append(.init(artifactName: name, state: validIntent && !hasPayload ? .captureIntentWithoutPayload : .invalidCaptureIntent))
                    continue
                }
                guard name.hasSuffix(suffix), UUID(uuidString: String(name.dropLast(suffix.count))) != nil else {
                    result.append(.init(artifactName: name, state: .unrecognizedFile)); continue
                }
                if !referenced.contains(name) { result.append(.init(artifactName: name, state: state)) }
            }
        }
        return result.sorted { $0.artifactName < $1.artifactName }
    }
    private static func protect(_ url: URL, directory: Bool) throws {
        var attributes: [FileAttributeKey: Any] = [.posixPermissions: directory ? 0o700 : 0o600]
        #if os(iOS)
        attributes[.protectionKey] = FileProtectionType.complete
        #endif
        try FileManager.default.setAttributes(attributes, ofItemAtPath: url.path)
    }
    private static func requireDirectory(_ url: URL) throws {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard attributes[.type] as? FileAttributeType == .typeDirectory else { throw StoreError.unsafeFile }
    }
    private static func requireRegular(_ url: URL) throws {
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        guard attributes[.type] as? FileAttributeType == .typeRegular else { throw StoreError.unsafeFile }
    }
    private static func syncDirectory(_ url: URL) throws {
        let fd = url.path.withCString { open($0, O_RDONLY | O_DIRECTORY | O_NOFOLLOW) }
        guard fd >= 0 else { throw ioError() }
        defer { close(fd) }
        guard fsync(fd) == 0 else { throw ioError() }
    }
    private static func ioError() -> StoreError {
        errno == ENOSPC ? .insufficientSpace : .fileIO(errno)
    }
}
