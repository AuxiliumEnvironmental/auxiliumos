import Foundation
import CSQLite

enum SQLValue {
    case text(String), integer(Int), real(Double), blob(Data)
}

/// Used only by its owning SpatialStore actor, including all statement lifetimes.
final class SQLiteConnection: @unchecked Sendable {
    private var handle: OpaquePointer?
    init(url: URL) throws {
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX | SQLITE_OPEN_NOFOLLOW
        let code = sqlite3_open_v2(url.path, &handle, flags, nil)
        guard code == SQLITE_OK else {
            if let handle { sqlite3_close_v2(handle) }; handle = nil
            throw StoreError.database(code)
        }
        sqlite3_busy_timeout(handle, 2500)
        sqlite3_limit(handle, SQLITE_LIMIT_LENGTH, 2 * 1024 * 1024)
        do {
            try execute("PRAGMA foreign_keys=ON")
            try execute("PRAGMA trusted_schema=OFF")
            try execute("PRAGMA journal_mode=WAL")
            try execute("PRAGMA synchronous=FULL")
            let version = try rows("PRAGMA user_version").first?.int(0) ?? 0
            guard (0...6).contains(version) else { throw StoreError.unsupportedStoreVersion }
            if version == 0 {
                try transaction {
                    try execute("""
                        CREATE TABLE artifacts (
                          id TEXT PRIMARY KEY NOT NULL, filename TEXT UNIQUE NOT NULL,
                          digest TEXT NOT NULL CHECK(length(digest)=64), byte_count INTEGER NOT NULL CHECK(byte_count>=0),
                          kind TEXT NOT NULL);
                        CREATE TABLE revisions (
                          document_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
                          artifact_id TEXT NOT NULL REFERENCES artifacts(id), command TEXT NOT NULL,
                          created_at REAL NOT NULL, PRIMARY KEY(document_id,revision));
                        CREATE TABLE drafts (
                          document_id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, current_revision INTEGER NOT NULL,
                          undo_history BLOB NOT NULL, redo_history BLOB NOT NULL, updated_at REAL NOT NULL,
                          FOREIGN KEY(document_id,current_revision) REFERENCES revisions(document_id,revision));
                        CREATE TABLE captures (
                          source_id TEXT NOT NULL, kind TEXT NOT NULL, artifact_id TEXT NOT NULL REFERENCES artifacts(id),
                          PRIMARY KEY(source_id,kind));
                        CREATE TABLE frozen_revisions (
                          id TEXT PRIMARY KEY NOT NULL, document_id TEXT NOT NULL, revision INTEGER NOT NULL,
                          frozen_at REAL NOT NULL, UNIQUE(document_id,revision),
                          FOREIGN KEY(document_id,revision) REFERENCES revisions(document_id,revision));
                        PRAGMA user_version=1;
                        """)
                }
            }
            if version < 2 {
                try transaction {
                    try execute("""
                        CREATE TABLE edit_receipts (
                          document_id TEXT NOT NULL, revision INTEGER NOT NULL, receipt BLOB NOT NULL,
                          PRIMARY KEY(document_id,revision),
                          FOREIGN KEY(document_id,revision) REFERENCES revisions(document_id,revision));
                        PRAGMA user_version=2;
                        """)
                }
            }
            if version < 3 {
                try transaction {
                    try execute("""
                        CREATE TABLE IF NOT EXISTS publication_outbox (
                          request_id TEXT PRIMARY KEY NOT NULL,
                          snapshot_id TEXT NOT NULL REFERENCES frozen_revisions(id),
                          artifact_id TEXT NOT NULL REFERENCES artifacts(id),
                          record BLOB NOT NULL);
                        PRAGMA user_version=3;
                        """)
                }
            }
            if version < 4 {
                try transaction {
                    try execute("""
                        CREATE TABLE IF NOT EXISTS store_access_policy (
                          singleton INTEGER PRIMARY KEY CHECK(singleton=1), record BLOB NOT NULL);
                        INSERT OR IGNORE INTO store_access_policy(singleton,record)
                          SELECT 1,CAST('{"version":1,"mode":"localDeviceOnly","lastObservedAt":0}' AS BLOB)
                          WHERE EXISTS(SELECT 1 FROM artifacts);
                        PRAGMA user_version=4;
                        """)
                }
            }
            if version < 5 {
                try transaction {
                    try execute("""
                        CREATE TABLE IF NOT EXISTS recovered_drafts (
                          original_artifact_id TEXT PRIMARY KEY NOT NULL REFERENCES artifacts(id),
                          new_document_id TEXT UNIQUE NOT NULL REFERENCES drafts(document_id),
                          source_document_id TEXT NOT NULL, source_revision INTEGER NOT NULL CHECK(source_revision>0));
                        PRAGMA user_version=5;
                        """)
                }
            }
            if version < 6 {
                try transaction {
                    try execute("""
                        CREATE TABLE IF NOT EXISTS history_cleanup_operations (
                          id TEXT PRIMARY KEY NOT NULL, preview_digest TEXT NOT NULL,
                          snapshot_count INTEGER NOT NULL CHECK(snapshot_count>=0),
                          byte_count INTEGER NOT NULL CHECK(byte_count>=0), created_at REAL NOT NULL);
                        CREATE TABLE IF NOT EXISTS history_retirements (
                          artifact_id TEXT PRIMARY KEY NOT NULL REFERENCES artifacts(id),
                          document_id TEXT NOT NULL, revision INTEGER NOT NULL,
                          operation_id TEXT NOT NULL REFERENCES history_cleanup_operations(id),
                          state TEXT NOT NULL CHECK(state IN ('pending','removed')),
                          UNIQUE(document_id,revision),
                          FOREIGN KEY(document_id,revision) REFERENCES revisions(document_id,revision));
                        PRAGMA user_version=6;
                        """)
                }
            }
        } catch { sqlite3_close_v2(handle); handle = nil; throw error }
    }
    deinit { if let handle { sqlite3_close_v2(handle) } }

    func execute(_ sql: String, _ bindings: [SQLValue] = []) throws {
        // Only the fixed, internal schema may contain multiple statements.
        if bindings.isEmpty {
            let code = sqlite3_exec(handle, sql, nil, nil, nil)
            guard code == SQLITE_OK else { throw StoreError.database(code) }
            return
        }
        let statement = try prepare(sql, bindings)
        defer { sqlite3_finalize(statement) }
        let code = sqlite3_step(statement)
        guard code == SQLITE_DONE else { throw StoreError.database(code) }
    }
    func rows(_ sql: String, _ bindings: [SQLValue] = []) throws -> [SQLRow] {
        let statement = try prepare(sql, bindings)
        defer { sqlite3_finalize(statement) }
        var result: [SQLRow] = []
        while true {
            let code = sqlite3_step(statement)
            if code == SQLITE_DONE { return result }
            guard code == SQLITE_ROW else { throw StoreError.database(code) }
            var values: [SQLValue] = []
            for column in 0..<sqlite3_column_count(statement) {
                switch sqlite3_column_type(statement, column) {
                case SQLITE_INTEGER: values.append(.integer(Int(sqlite3_column_int64(statement, column))))
                case SQLITE_FLOAT: values.append(.real(sqlite3_column_double(statement, column)))
                case SQLITE_BLOB:
                    let count = Int(sqlite3_column_bytes(statement, column))
                    values.append(.blob(count == 0 ? Data() : Data(bytes: sqlite3_column_blob(statement, column)!, count: count)))
                default:
                    guard let pointer = sqlite3_column_text(statement, column) else { throw StoreError.corruptArtifact }
                    values.append(.text(String(cString: pointer)))
                }
            }
            result.append(SQLRow(values: values))
            guard result.count <= 100000 else { throw StoreError.sizeLimit }
        }
    }
    func transaction<T>(_ body: () throws -> T) throws -> T {
        try execute("BEGIN IMMEDIATE")
        do {
            let value = try body()
            try execute("COMMIT")
            return value
        } catch {
            try? execute("ROLLBACK")
            throw error
        }
    }
    private func prepare(_ sql: String, _ values: [SQLValue]) throws -> OpaquePointer {
        var statement: OpaquePointer?
        let code = sqlite3_prepare_v2(handle, sql, -1, &statement, nil)
        guard code == SQLITE_OK, let statement else { throw StoreError.database(code) }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        for (index, value) in values.enumerated() {
            let result: Int32
            let i = Int32(index + 1)
            switch value {
            case .text(let text): result = sqlite3_bind_text(statement, i, text, -1, transient)
            case .integer(let integer): result = sqlite3_bind_int64(statement, i, Int64(integer))
            case .real(let real): result = sqlite3_bind_double(statement, i, real)
            case .blob(let data):
                result = data.withUnsafeBytes { sqlite3_bind_blob(statement, i, $0.baseAddress, Int32($0.count), transient) }
            }
            if result != SQLITE_OK { sqlite3_finalize(statement); throw StoreError.database(result) }
        }
        return statement
    }
}

struct SQLRow {
    let values: [SQLValue]
    func text(_ i: Int) -> String { if case .text(let value) = values[i] { return value }; return "" }
    func int(_ i: Int) -> Int { if case .integer(let value) = values[i] { return value }; return -1 }
    func real(_ i: Int) -> Double { if case .real(let value) = values[i] { return value }; return Double(int(i)) }
    func blob(_ i: Int) -> Data { if case .blob(let value) = values[i] { return value }; return Data() }
}
