import SwiftUI
import SpatialPersistence

@MainActor
struct StorageStatusView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmCleanup = false
    var body: some View {
        NavigationStack {
            List {
                if let inventory = model.inventory {
                    Section("Retained on this device") {
                        LabeledContent("Saved layouts", value: String(inventory.draftCount))
                        LabeledContent("Retained geometry snapshots", value: String(inventory.revisionCount - inventory.retiredHistoryCount))
                        LabeledContent("Revision and lineage records", value: String(inventory.revisionCount))
                        LabeledContent("Old snapshots retired by confirmation", value: String(inventory.retiredHistoryCount))
                        LabeledContent("Frozen exact-version outputs", value: String(inventory.frozenSnapshotCount))
                        LabeledContent("Original captures and metadata", value: bytes(inventory.captureBytes))
                        LabeledContent("Geometry history", value: bytes(inventory.geometryBytes))
                        LabeledContent("Delivery artifacts", value: bytes(inventory.publicationBytes))
                        LabeledContent("Recovered original files", value: bytes(inventory.recoveredSourceBytes))
                        Text("These are registered artifact sizes, not total app disk usage. Database overhead and unacknowledged files are additional.").font(.footnote)
                    }
                    Section("Recovery and retention") {
                        LabeledContent("Retained unacknowledged files", value: String(inventory.retainedOrphanCount))
                        Text("Use the recovery actions in the workspace to recover verified captures or geometry as a new layout. Unrecognized files remain retained; they are not opened automatically.")
                        Text("Undo and redo history is limited to \(inventory.undoHistoryLimit) steps. Source files and uncertain work are not automatically deleted. There is no persistent drawing cache to clear.")
                        Text("When storage is too low, new saves stop with an explicit error. Free device space outside this app and retry before leaving unsaved work. Export is a copy, not confirmation that it is safe to delete source captures.")
                    }
                } else { Text("Storage details are unavailable. Reload the workspace after unlocking.") }
                Section("Optional old-history cleanup") {
                    Text("Cleanup protects original captures, current and first versions, undo/redo, every frozen output, delivery artifacts and recovery sources. It also keeps at least the newest 100 additional unpinned snapshots per layout. Only older unpinned geometry files are eligible. Revision and edit-lineage records stay retained.")
                    Button("Review eligible old history") { Task { await model.previewHistoryCleanup() } }.frame(minHeight: 44).disabled(model.busy)
                    if let preview = model.cleanupPreview {
                        if preview.snapshots.isEmpty { Text("No old unpinned history is eligible for cleanup.").foregroundStyle(.secondary) }
                        else {
                            Text("\(preview.snapshots.count) old snapshot(s) · \(bytes(preview.bytesToRemove)) in this batch")
                            Button("Remove this old unpinned history", role: .destructive) { confirmCleanup = true }.frame(minHeight: 44).disabled(model.busy)
                            Text("These particular old geometry files cannot be reopened after removal. This action has no undo. A changed store invalidates the preview and requires a new review.").font(.footnote)
                        }
                    }
                    ForEach(model.pendingCleanups, id: \.operationID) { cleanup in
                        Button("Resume confirmed cleanup (\(cleanup.pendingSnapshots) files)") { Task { await model.resumeHistoryCleanup(cleanup.operationID) } }
                            .frame(minHeight: 44).disabled(model.busy)
                    }
                    if model.busy { ProgressView("Updating on-device records") }
                    if let error = model.error { Text(error).foregroundStyle(.secondary) }
                }
                Section("Privacy") {
                    Text("Content is local and excluded from automatic device backup by this app. Device failure or deleting the app can lose it. Export required exact-version copies to a location you control; exports do not contain the original Apple scan or world map.")
                    Text("Files use complete iOS protection while the device is locked. The workspace requires device-owner authentication. This is not a company account grant.")
                    Text("No cloud AI, telemetry upload, or live AuxiliumOS/Moldo connection is enabled. Apple capture archives may include imagery encoded by the framework; they are treated as sensitive property content.")
                }
            }.navigationTitle("On-device storage")
                .toolbar { Button("Done") { dismiss() } }
                .refreshable { await model.load() }
                .confirmationDialog("Permanently remove the reviewed old unpinned geometry files?", isPresented: $confirmCleanup, titleVisibility: .visible) {
                    Button("Remove reviewed old history", role: .destructive) { Task { await model.confirmHistoryCleanup() } }
                    Button("Keep all history", role: .cancel) {}
                } message: { Text("Original captures, current/first versions, undo/redo, frozen exports, delivery files and recovery sources are protected. Only this reviewed batch is authorized; incomplete cleanup can resume after reopening.") }
        }
    }
    private func bytes(_ value: Int) -> String { ByteCountFormatter.string(fromByteCount: Int64(value), countStyle: .file) }
}

@MainActor
struct DeliveryStatusView: View {
    @ObservedObject var model: WorkspaceModel
    @Environment(\.dismiss) private var dismiss
    @State private var cancelling: String?
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label("Not connected", systemImage: "network.slash")
                    Text("AuxiliumOS and Moldo are disabled. No live receiver or destination authorization is configured. Local export does not queue a delivery, grant access, or release a client document.")
                }
                Section("Retained delivery requests") {
                    if model.publications.isEmpty { Text("No queued requests. All saved layouts remain local.").foregroundStyle(.secondary) }
                    ForEach(model.publications, id: \.request.clientRequestID) { item in
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Revision \(item.request.sourceRevision)").font(.headline)
                            Text(state(item.state))
                            Text("\(item.request.destination.system == .auxiliumos ? "AuxiliumOS" : "Moldo") · \(item.attempts) attempt(s)").font(.caption).foregroundStyle(.secondary)
                            Text("Request " + String(item.request.clientRequestID.prefix(8))).font(.caption)
                            if let failure = item.lastFailure { Text(failure.localizedDescription).font(.callout) }
                            if item.receiverConfirmed {
                                Text("Exact receiver acknowledgement retained. This is an internal draft, not a client release.").font(.footnote)
                            } else if item.state != .cancelledLocally {
                                Button("Stop local retries") { cancelling = item.request.clientRequestID }
                                    .frame(minHeight: 44).disabled(model.busy)
                            }
                        }.padding(.vertical, 4)
                    }
                }
                Section { Text("No retry or destination picker is presented while the connector is disabled. A future authorized connector must recheck current rights and the exact immutable request before delivery.").font(.footnote) }
                if let error = model.error { Section("Action needs attention") { Text(error) } }
            }.navigationTitle("Delivery status")
                .toolbar { Button("Done") { dismiss() } }
                .refreshable { await model.load() }
                .confirmationDialog("Stop this request's local retries?", isPresented: Binding(get: { cancelling != nil }, set: { if !$0 { cancelling = nil } }), titleVisibility: .visible) {
                    Button("Stop local retries", role: .destructive) { if let id = cancelling { Task { await model.cancelPublication(id) } }; cancelling = nil }
                    Button("Keep request", role: .cancel) { cancelling = nil }
                } message: { Text("The exact saved source remains. This does not recall a remote draft or prove an uncertain transfer never arrived. Active deliveries must finish or time out before local cancellation.") }
        }
    }
    private func state(_ value: PublicationState) -> String {
        switch value {
        case .queued: return "Pending delivery, saved on device"
        case .delivering: return "Attempt recorded, receipt not confirmed"
        case .awaitingReceipt: return "Waiting for exact receiver acknowledgement"
        case .needsAuthentication: return "Authentication required"
        case .denied: return "Permission denied, local source retained"
        case .conflict: return "Destination version conflict"
        case .retryableFailure: return "Transfer incomplete, exact request retained"
        case .delivered: return "Receiver-confirmed internal draft"
        case .cancelledLocally: return "Local retries stopped, source retained"
        }
    }
}
