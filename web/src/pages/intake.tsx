import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Plus,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "../components/app-shell";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  SyntheticBadge,
} from "../components/shared";
import { asRuntimeError, isAbort, RuntimeError } from "../lib/errors";
import type { AccountDirectoryItem, FacilityDirectoryItem } from "../lib/directory-api";
import {
  IntakeApi,
  IntakeError,
  INTAKE_TRANSITIONS,
  intakeStatusLabel,
  intakeUrgencyLabel,
  validateSubmission,
  type CatalogueEntry,
  type IntakeCatalogue,
  type IntakeDetail,
  type IntakeAssignee,
  type IntakeItem,
  type IntakeSubmission,
  type TriageChanges,
} from "../lib/intake-api";
import { useAccounts, useDirectoryPage } from "../lib/use-directory";
import { useRuntime } from "../lib/runtime";
import "./intake.css";

type Resource<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; error: RuntimeError };
function useIntakeResource<T>(
  key: string,
  query: (signal: AbortSignal) => Promise<T>,
) {
  const { handleFailure } = useRuntime();
  const [attempt, setAttempt] = useState(0);
  const identity = `${key}:${attempt}`;
  const [stored, setStored] = useState<{
    identity: string;
    state: Resource<T>;
  }>({ identity: "", state: { status: "loading" } });
  const state: Resource<T> =
    stored.identity === identity ? stored.state : { status: "loading" };
  useEffect(() => {
    const controller = new AbortController();
    void query(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted)
          setStored({ identity, state: { status: "ready", value } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbort(error)) return;
        const failure = asRuntimeError(error);
        setStored({ identity, state: { status: "error", error: failure } });
        if (failure.code === "session_expired") handleFailure(failure);
      });
    return () => controller.abort();
  }, [identity, query, handleFailure]);
  return { state, retry: () => setAttempt((value) => value + 1) };
}

function useIntakeMutation() {
  const { handleFailure } = useRuntime();
  const current = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<RuntimeError | null>(null);
  useEffect(
    () => () => {
      current.current?.abort();
    },
    [],
  );
  async function perform<T>(
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T | undefined> {
    if (current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setPending(true);
    setError(null);
    try {
      const result = await operation(controller.signal);
      return controller.signal.aborted ? undefined : result;
    } catch (error) {
      if (controller.signal.aborted || isAbort(error)) return;
      const failure = asRuntimeError(error);
      setError(failure);
      if (failure.code === "session_expired") handleFailure(failure);
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        current.current = null;
      }
    }
  }
  return { pending, error, setError, perform };
}

function Failure({
  error,
  onRetry,
}: {
  error: RuntimeError;
  onRetry: () => void;
}) {
  return (
    <div>
      <ErrorState error={error} onRetry={onRetry} />
      {!error.retryable && (
        <button className="button secondary intake-retry" onClick={onRetry}>
          Check again
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
function Status({ value }: { value: string }) {
  return <span className="intake-status">{intakeStatusLabel(value)}</span>;
}
function label(entries: CatalogueEntry[], id: string | null) {
  return id === null
    ? "Not recorded"
    : (entries.find((entry) => entry.id === id)?.label ??
        `${id} (earlier catalogue)`);
}
function date(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
function ClassificationSelect({
  id,
  title,
  value,
  options,
  onChange,
  optional = false,
}: {
  id: string;
  title: string;
  value: string;
  options: CatalogueEntry[];
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{title}</label>
      <select
        id={id}
        value={value}
        required={!optional}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {optional
            ? "Not recorded / unchanged"
            : `Choose ${title.toLowerCase()}`}
        </option>
        {value && !options.some((entry) => entry.id === value) && (
          <option value={value}>{value} (earlier catalogue)</option>
        )}
        {options.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function IntakePage({
  accountId,
  onAccountChange,
}: {
  accountId?: string;
  onAccountChange: (id: string) => void;
}) {
  const { api, state } = useRuntime();
  const intake = useMemo(() => new IntakeApi(api.client), [api.client]);
  const accounts = useAccounts();
  const catalogueQuery = useCallback(
    (signal: AbortSignal) => intake.catalogue(signal),
    [intake],
  );
  const catalogue = useIntakeResource("catalogue", catalogueQuery);
  const account =
    accounts.state.status === "ready"
      ? accounts.state.result.items.find((item) => item.id === accountId)
      : undefined;
  return (
    <div className="intake-page">
      <PageHeader
        eyebrow="Synthetic requests"
        title="Intake"
        description="Submit a synthetic request, follow its next action, or triage within your assigned facilities."
      />
      <div className="intake-boundary">
        <strong>
          A request is not accepted work or authorization to mobilize.
        </strong>
        <p>
          Synthetic data only. No real names, PHI or real client data. Review
          states request human review; they do not approve it. Development
          defaults remain provisional.
        </p>
      </div>
      {accounts.state.status === "loading" ? (
        <LoadingState label="Loading accounts" />
      ) : accounts.state.status === "error" ? (
        <Failure error={accounts.state.error} onRetry={accounts.retry} />
      ) : (
        <>
          <section
            className="account-selector-panel"
            aria-label="Intake account selection"
          >
            <div className="field account-select">
              <label htmlFor="intake-account">Account</label>
              <select
                id="intake-account"
                value={account?.id ?? ""}
                onChange={(event) => onAccountChange(event.target.value)}
              >
                <option value="">Choose an account</option>
                {accounts.state.result.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.displayName}
                  </option>
                ))}
              </select>
              <p className="field-hint">
                Only available accounts appear. Changing accounts clears unsaved
                intake work.
              </p>
            </div>
            <Pagination
              page={accounts.page}
              nextCursor={accounts.state.result.nextCursor}
              onNext={accounts.next}
              onPrevious={accounts.previous}
              label="Intake account pages"
            />
          </section>
          {!account ? (
            <EmptyState
              icon={ClipboardList}
              title={
                accounts.state.result.items.length
                  ? "Choose an account to begin"
                  : "No accounts available"
              }
            >
              <p>
                Request visibility and actions depend on your current account
                and exact facility access.
              </p>
            </EmptyState>
          ) : catalogue.state.status === "loading" ? (
            <LoadingState label="Loading intake catalogue" />
          ) : catalogue.state.status === "error" ? (
            <Failure error={catalogue.state.error} onRetry={catalogue.retry} />
          ) : (
            <AccountIntake
              key={`${account.id}:${state.status === "ready" ? state.revision : "unavailable"}`}
              account={account}
              intake={intake}
              catalogue={catalogue.state.value}
            />
          )}
        </>
      )}
    </div>
  );
}

function AccountIntake({
  account,
  intake,
  catalogue,
}: {
  account: AccountDirectoryItem;
  intake: IntakeApi;
  catalogue: IntakeCatalogue;
}) {
  const { api } = useRuntime();
  const facilityQuery = useCallback(
    (afterId: string | undefined, signal: AbortSignal) =>
      api.listFacilities({ accountId: account.id, afterId, signal }),
    [account.id, api],
  );
  const facilities = useDirectoryPage(
    `${account.id}:intake-facilities`,
    facilityQuery,
  );
  const [mode, setMode] = useState<"queue" | "new">("queue");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  return (
    <>
      <div className="intake-toolbar">
        <div className="button-row">
          <button
            className={`button ${mode === "queue" ? "primary" : "secondary"}`}
            aria-pressed={mode === "queue"}
            onClick={() => setMode("queue")}
          >
            Request queue
          </button>
          <button
            className={`button ${mode === "new" ? "primary" : "secondary"}`}
            aria-pressed={mode === "new"}
            onClick={() => setMode("new")}
          >
            <Plus size={16} aria-hidden="true" />
            New request
          </button>
        </div>
        <SyntheticBadge />
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div hidden={mode !== "new"}>
        <SubmissionForm
          account={account}
          intake={intake}
          catalogue={catalogue}
          facilities={facilities}
          onSubmitted={(id) => {
            setRequestId(id);
            setRefresh((value) => value + 1);
            setMode("queue");
            setNotice(
              "Submission received. It does not authorize work, scheduling or mobilization.",
            );
          }}
        />
      </div>
      <div hidden={mode !== "queue"}>
        {requestId ? (
          <RequestDetail
            key={requestId}
            requestId={requestId}
            accountId={account.id}
            intake={intake}
            catalogue={catalogue}
            facilities={facilities}
            onBack={() => {
              setRequestId(null);
              setNotice("");
              setRefresh((value) => value + 1);
            }}
          />
        ) : (
          <RequestQueue
            accountId={account.id}
            intake={intake}
            catalogue={catalogue}
            refresh={refresh}
            facilities={facilities}
            onOpen={(id) => {
              setRequestId(id);
              setNotice("");
            }}
          />
        )}
      </div>
    </>
  );
}

function SubmissionForm({
  account,
  intake,
  catalogue,
  facilities,
  onSubmitted,
}: {
  account: AccountDirectoryItem;
  intake: IntakeApi;
  catalogue: IntakeCatalogue;
  facilities: FacilityPage;
  onSubmitted: (id: string) => void;
}) {
  const [facilityId, setFacilityId] = useState("");
  const [draft, setDraft] = useState<IntakeSubmission>({
    title: "",
    original_wording: "",
    issue_id: "",
    intent_id: "",
    urgency: "routine",
    affected_area: "",
    site_contact: "",
    access_notes: "",
    safety_flags: [],
    payer_note: "",
    signer_note: "",
  });
  const [flags, setFlags] = useState("");
  const [incidentMode, setIncidentMode] = useState("none");
  const [incidentId, setIncidentId] = useState("");
  const [incidentTitle, setIncidentTitle] = useState("");
  const [incidentTime, setIncidentTime] = useState("");
  const [attempt, setAttempt] = useState<{
    key: string;
    facilityId: string;
    payload: IntakeSubmission;
  } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const mutation = useIntakeMutation();
  const form = useRef<HTMLFormElement>(null);
  const update = <K extends keyof IntakeSubmission>(
    field: K,
    value: IntakeSubmission[K],
  ) => setDraft((previous) => ({ ...previous, [field]: value }));
  // A definite validation rejection permits edits. Unconfirmed saves retain the
  // exact payload/key and lock the form so retry cannot silently duplicate work.
  useEffect(() => {
    if (
      mutation.error?.code === "validation" ||
      (mutation.error instanceof IntakeError &&
        mutation.error.reason === "unavailable")
    )
      setAttempt(null);
  }, [mutation.error]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    let current = attempt;
    if (!current) {
      try {
        if (
          !facilityId ||
          facilities.state.status !== "ready" ||
          !facilities.state.result.items.some((item) => item.id === facilityId)
        )
          throw new RuntimeError(
            "validation",
            "Choose an available facility on this directory page.",
          );
        const payload: IntakeSubmission = {
          ...draft,
          safety_flags: flags
            .split("\n")
            .map((flag) => flag.trim())
            .filter(Boolean),
        };
        if (incidentMode === "existing") payload.incident_id = incidentId;
        if (incidentMode === "new")
          payload.new_incident = {
            title: incidentTitle,
            ...(incidentTime
              ? { occurred_at: new Date(incidentTime).toISOString() }
              : {}),
          };
        validateSubmission(payload);
        current = { key: crypto.randomUUID(), facilityId, payload };
        setAttempt(current);
      } catch (error) {
        mutation.setError(asRuntimeError(error));
        return;
      }
    }
    const result = await mutation.perform((signal) =>
      intake.submit(
        account.id,
        current!.facilityId,
        current!.key,
        current!.payload,
        signal,
      ),
    );
    if (result) {
      setSubmitted(true);
      onSubmitted(result.request_id);
    }
  }
  if (submitted)
    return (
      <section className="intake-panel">
        <h2>Request submitted</h2>
        <p>
          Your original wording is preserved. Use the request queue to follow
          its next action.
        </p>
        <button
          className="button secondary"
          onClick={() => {
            setSubmitted(false);
            setAttempt(null);
            setDraft({
              title: "",
              original_wording: "",
              issue_id: "",
              intent_id: "",
              urgency: "routine",
              affected_area: "",
              site_contact: "",
              access_notes: "",
              safety_flags: [],
              payer_note: "",
              signer_note: "",
            });
            setFlags("");
            setIncidentMode("none");
            setIncidentId("");
            setIncidentTitle("");
            setIncidentTime("");
            mutation.setError(null);
          }}
        >
          Start another request
        </button>
      </section>
    );
  return (
    <section className="intake-panel" aria-labelledby="new-request-title">
      <h2 id="new-request-title">New project request</h2>
      <p className="muted">
        No program or MSA is required. Directory access alone does not grant
        submission permission.
      </p>
      <form
        ref={form}
        onSubmit={(event) => {
          void submit(event);
        }}
        autoComplete="off"
      >
        <fieldset disabled={mutation.pending || attempt !== null}>
          <legend className="intake-legend">Request essentials</legend>
          {facilities.state.status === "loading" ? (
            <LoadingState label="Loading facilities" />
          ) : facilities.state.status === "error" ? (
            <Failure
              error={facilities.state.error}
              onRetry={facilities.retry}
            />
          ) : (
            <>
              <div className="field">
                <label htmlFor="intake-facility">Facility</label>
                <select
                  id="intake-facility"
                  required
                  value={
                    facilities.state.result.items.some(
                      (item) => item.id === facilityId,
                    )
                      ? facilityId
                      : ""
                  }
                  onChange={(event) => setFacilityId(event.target.value)}
                >
                  <option value="">
                    {facilities.state.result.items.length
                      ? "Choose a facility"
                      : "No facilities available on this page"}
                  </option>
                  {facilities.state.result.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <Pagination
                page={facilities.page}
                nextCursor={facilities.state.result.nextCursor}
                onNext={facilities.next}
                onPrevious={facilities.previous}
                label="Intake facility pages"
              />
            </>
          )}
          <div className="field">
            <label htmlFor="intake-title">Request title</label>
            <input
              id="intake-title"
              required
              maxLength={160}
              value={draft.title}
              onChange={(event) => update("title", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="intake-wording">Original request wording</label>
            <textarea
              id="intake-wording"
              required
              maxLength={8000}
              rows={5}
              value={draft.original_wording}
              onChange={(event) =>
                update("original_wording", event.target.value)
              }
              aria-describedby="wording-hint"
            />
            <p id="wording-hint" className="field-hint">
              Preserved exactly as submitted. Use synthetic context only; never
              include medical information or real names.
            </p>
          </div>
          <div className="intake-grid">
            <ClassificationSelect
              id="intake-issue"
              title="Issue"
              value={draft.issue_id}
              options={catalogue.issues}
              onChange={(value) => update("issue_id", value)}
            />
            <ClassificationSelect
              id="intake-intent"
              title="Intent"
              value={draft.intent_id}
              options={catalogue.intents}
              onChange={(value) => update("intent_id", value)}
            />
          </div>
          <p className="field-hint">
            Catalogue {catalogue.version}. Selecting issue and intent does not
            establish scientific suitability or an offered service.
          </p>
          <div className="field">
            <label htmlFor="intake-urgency">Urgency</label>
            <select
              id="intake-urgency"
              value={draft.urgency}
              onChange={(event) =>
                update(
                  "urgency",
                  event.target.value as IntakeSubmission["urgency"],
                )
              }
            >
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>
          {draft.urgency === "emergency" && (
            <p className="notice" role="status">
              Follow your emergency and facility protocols for immediate danger.
              This request provides no emergency response promise or
              mobilization authority.
            </p>
          )}
          <details className="intake-disclosure" open>
            <summary>Site, access and responsibility context</summary>
            <div className="intake-grid">
              {(
                [
                  ["affected_area", "Affected area"],
                  ["site_contact", "Site contact (synthetic role only)"],
                  ["access_notes", "Access notes"],
                  ["payer_note", "Payer note"],
                  ["signer_note", "Signer note"],
                ] as const
              ).map(([field, title]) => (
                <div className="field" key={field}>
                  <label htmlFor={`intake-${field}`}>{title}</label>
                  <textarea
                    id={`intake-${field}`}
                    maxLength={2000}
                    rows={2}
                    value={draft[field]}
                    onChange={(event) => update(field, event.target.value)}
                  />
                </div>
              ))}
              <div className="field">
                <label htmlFor="intake-safety">Safety flags</label>
                <textarea
                  id="intake-safety"
                  rows={3}
                  maxLength={4020}
                  value={flags}
                  onChange={(event) => setFlags(event.target.value)}
                  aria-describedby="safety-hint"
                />
                <p id="safety-hint" className="field-hint">
                  One flag per line; at most 20, each up to 200 characters.
                  Unknown safety conditions still require review.
                </p>
              </div>
            </div>
          </details>
          <details className="intake-disclosure">
            <summary>Optional incident context</summary>
            <p className="field-hint">
              An incident is event context, not a project or authorization.
              Existing incidents must belong to this exact facility.
            </p>
            <div className="field">
              <label htmlFor="incident-mode">Incident context</label>
              <select
                id="incident-mode"
                value={incidentMode}
                onChange={(event) => setIncidentMode(event.target.value)}
              >
                <option value="none">No incident context</option>
                <option value="new">
                  Create event context with this request
                </option>
                <option value="existing">
                  Link an existing incident identifier
                </option>
              </select>
            </div>
            {incidentMode === "existing" && (
              <div className="field">
                <label htmlFor="incident-id">
                  Existing incident identifier
                </label>
                <input
                  id="incident-id"
                  required
                  value={incidentId}
                  onChange={(event) => setIncidentId(event.target.value)}
                  placeholder="Incident UUID"
                />
              </div>
            )}
            {incidentMode === "new" && (
              <>
                <div className="field">
                  <label htmlFor="incident-title">Incident title</label>
                  <input
                    id="incident-title"
                    required
                    maxLength={160}
                    value={incidentTitle}
                    onChange={(event) => setIncidentTitle(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="incident-time">
                    Incident occurred at (optional, local time)
                  </label>
                  <input
                    id="incident-time"
                    type="datetime-local"
                    value={incidentTime}
                    onChange={(event) => setIncidentTime(event.target.value)}
                  />
                </div>
              </>
            )}
          </details>
        </fieldset>
        {mutation.error && (
          <div className="form-error" role="alert">
            <p>{mutation.error.message}</p>
            {attempt && (
              <p>
                Your exact submission is held in memory. Retry it to recover the
                original request; check the queue before starting another.
                Navigating away or signing out clears this local draft.
              </p>
            )}
          </div>
        )}
        <div className="intake-form-actions">
          <p className="field-hint">
            Submission does not approve scope, sampling, rates, agreements or
            scheduling.
          </p>
          <button
            type="submit"
            className="button primary"
            disabled={
              mutation.pending ||
              (mutation.error instanceof IntakeError &&
                ["idempotency_conflict"].includes(mutation.error.reason))
            }
          >
            {mutation.pending
              ? "Submitting…"
              : attempt
                ? "Retry same submission"
                : "Submit request"}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </form>
    </section>
  );
}

type FacilityPage = ReturnType<typeof useDirectoryPage<FacilityDirectoryItem>>;
type AssigneeResource = ReturnType<typeof useIntakeResource<IntakeAssignee[]>>;
function facilityName(facilities: FacilityPage, item: IntakeItem) {
  return (facilities.state.status === "ready"
    ? facilities.state.result.items.find(facility => facility.accountId === item.account_id && facility.id === item.facility_id)?.displayName
    : undefined) ?? "Facility name unavailable";
}
function RequestReferences({ item }: { item: IntakeItem }) {
  return <details className="intake-disclosure">
    <summary style={{ minHeight: "44px", paddingBlock: "var(--space-3)", cursor: "pointer" }}>Request references</summary>
    <dl style={{ overflowWrap: "anywhere" }}>
      <dt>Request ID</dt><dd>{item.id}</dd>
      <dt>Facility ID</dt><dd>{item.facility_id}</dd>
      <dt>Assignee ID</dt><dd>{item.assigned_to_profile_id ?? "Unassigned"}</dd>
      <dt>Incident ID</dt><dd>{item.incident_id ?? "None linked"}</dd>
    </dl>
  </details>;
}

function RequestQueue({
  accountId,
  intake,
  catalogue,
  refresh,
  facilities,
  onOpen,
}: {
  accountId: string;
  intake: IntakeApi;
  catalogue: IntakeCatalogue;
  refresh: number;
  facilities: FacilityPage;
  onOpen: (id: string) => void;
}) {
  const [status, setStatus] = useState("");
  return (
    <section aria-labelledby="request-queue-title">
      <div className="section-intro">
        <h2 id="request-queue-title">Request queue</h2>
        <span className="field-hint">
          Your submissions and permitted facility triage
        </span>
      </div>
      <div className="field intake-filter">
        <label htmlFor="request-status-filter">Filter by status</label>
        <select
          id="request-status-filter"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All available statuses</option>
          {catalogue.statuses.map((value) => (
            <option key={value} value={value}>
              {intakeStatusLabel(value)}
            </option>
          ))}
        </select>
      </div>
      <QueueRows
        key={`${accountId}:${status}:${refresh}`}
        accountId={accountId}
        status={status}
        intake={intake}
        facilities={facilities}
        onOpen={onOpen}
      />
    </section>
  );
}

function QueueRows({
  accountId,
  status,
  intake,
  facilities,
  onOpen,
}: {
  accountId: string;
  status: string;
  intake: IntakeApi;
  facilities: FacilityPage;
  onOpen: (id: string) => void;
}) {
  const query = useCallback(
    (afterId: string | undefined, signal: AbortSignal) =>
      intake.list({ accountId, status: status || undefined, afterId, signal }),
    [accountId, status, intake],
  );
  const page = useDirectoryPage(`${accountId}:${status}:intake`, query);
  const { state } = useRuntime();
  return (
    <>
      {page.state.status === "loading" ? (
        <LoadingState label="Loading requests" />
      ) : page.state.status === "error" ? (
        <Failure error={page.state.error} onRetry={page.retry} />
      ) : (
        <>
          {page.state.result.items.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No requests available">
              <p>
                No requests match this page and filter within your current
                access. You can create a synthetic request if you have
                submission permission.
              </p>
            </EmptyState>
          ) : (
            <ul className="intake-queue">
              {page.state.result.items.map((item) => (
                <li key={item.id}>
                  <div className="intake-queue-heading">
                    <button
                      className="intake-request-link"
                      onClick={() => onOpen(item.id)}
                    >
                      {item.title}
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                    <Status value={item.status} />
                  </div>
                  <dl className="intake-queue-meta">
                    <div>
                      <dt>Facility</dt>
                      <dd>{facilityName(facilities, item)}</dd>
                    </div>
                    <div>
                      <dt>Urgency</dt>
                      <dd>{intakeUrgencyLabel(item)}</dd>
                    </div>
                    <div>
                      <dt>Owner</dt>
                      <dd>{item.assigned_to_profile_id === null ? "Unassigned"
                        : state.status === "ready" && state.context.profileId === item.assigned_to_profile_id
                          ? state.context.displayName : "Assignee name unavailable"}</dd>
                    </div>
                    <div>
                      <dt>Last activity</dt>
                      <dd>{date(item.updated_at)}</dd>
                    </div>
                  </dl>
                  <p className="intake-next-action">
                    <strong>Next action</strong>
                    {item.next_action || "Not recorded"}
                  </p>
                  <RequestReferences item={item} />
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={page.page}
            nextCursor={page.state.result.nextCursor}
            onNext={page.next}
            onPrevious={page.previous}
            label="Request pages"
          />
          <button
            className="button secondary intake-retry"
            onClick={page.retry}
          >
            Refresh queue
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </>
      )}
    </>
  );
}

function RequestDetail({
  requestId,
  accountId,
  intake,
  catalogue,
  facilities,
  onBack,
}: {
  requestId: string;
  accountId: string;
  intake: IntakeApi;
  catalogue: IntakeCatalogue;
  facilities: FacilityPage;
  onBack: () => void;
}) {
  const [latest, setLatest] = useState<IntakeDetail | null | undefined>(
    undefined,
  );
  const [notice, setNotice] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const query = useCallback(
    (signal: AbortSignal) => intake.detail(requestId, signal),
    [intake, requestId],
  );
  const resource = useIntakeResource(requestId, query);
  const item =
    latest !== undefined
      ? latest
      : resource.state.status === "ready"
        ? resource.state.value
        : undefined;
  const unavailable =
    item === null || (item !== undefined && item.account_id !== accountId);
  const { state } = useRuntime();
  const triageItem = item && !unavailable && item.can_triage ? item : undefined;
  const assigneeQuery = useCallback(
    (signal: AbortSignal) => triageItem
      ? intake.assignees(triageItem.account_id, triageItem.facility_id, signal)
      : Promise.resolve<IntakeAssignee[]>([]),
    [intake, triageItem?.id, triageItem?.account_id, triageItem?.facility_id, triageItem?.revision],
  );
  const assignees = useIntakeResource(
    triageItem ? `${triageItem.id}:${triageItem.account_id}:${triageItem.facility_id}:assignees:${triageItem.revision}` : `${requestId}:assignees:unavailable`,
    assigneeQuery,
  );
  useEffect(() => {
    if (item && !unavailable)
      detailHeading.current?.focus({ preventScroll: true });
  }, [item?.id, unavailable]);
  const reload = async (signal: AbortSignal) => {
    const result = await intake.detail(requestId, signal);
    if (!signal.aborted) setLatest(result);
    return result;
  };
  function saved(message: string) {
    setLatest(undefined);
    setNotice(message);
    resource.retry();
  }
  return (
    <section aria-label="Request detail">
      <button className="button secondary intake-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to queue
      </button>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {unavailable ? (
        <EmptyState icon={ClipboardList} title="Request unavailable">
          <p>
            The request could not be opened with your current account and
            facility access. No request details are shown.
          </p>
        </EmptyState>
      ) : item === undefined ? (
        resource.state.status === "error" ? (
          <Failure error={resource.state.error} onRetry={resource.retry} />
        ) : (
          <LoadingState label="Loading request" />
        )
      ) : (
        <>
          <div className="intake-panel">
            <div className="intake-detail-heading">
              <div>
                <p className="eyebrow">Request · Revision {item.revision}</p>
                <h2 ref={detailHeading} tabIndex={-1}>
                  {item.title}
                </h2>
              </div>
              <Status value={item.status} />
            </div>
            <dl className="intake-facts">
              <div>
                <dt>Facility</dt>
                <dd>{facilityName(facilities, item)}</dd>
              </div>
              <div>
                <dt>Incident context</dt>
                <dd>{item.incident_id ? "Incident linked" : "None linked"}</dd>
              </div>
              <div>
                <dt>Urgency</dt>
                <dd>{intakeUrgencyLabel(item)}</dd>
              </div>
              <div>
                <dt>Assignee</dt>
                <dd>{item.assigned_to_profile_id === null ? "Unassigned"
                  : (assignees.state.status === "ready" && triageItem
                    ? assignees.state.value.find(person => person.profile_id === item.assigned_to_profile_id)?.display_name : undefined)
                    ?? (state.status === "ready" && state.context.profileId === item.assigned_to_profile_id
                      ? state.context.displayName : "Assignee name unavailable")}</dd>
              </div>
              <div>
                <dt>Original issue</dt>
                <dd>{label(catalogue.issues, item.original_issue_id)}</dd>
              </div>
              <div>
                <dt>Current issue</dt>
                <dd>{label(catalogue.issues, item.classified_issue_id)}</dd>
              </div>
              <div>
                <dt>Original intent</dt>
                <dd>{label(catalogue.intents, item.original_intent_id)}</dd>
              </div>
              <div>
                <dt>Current intent</dt>
                <dd>{label(catalogue.intents, item.classified_intent_id)}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{date(item.created_at)}</dd>
              </div>
              <div>
                <dt>Last activity</dt>
                <dd>{date(item.updated_at)}</dd>
              </div>
            </dl>
            <p className="intake-next-action">
              <strong>Next action</strong>
              {item.next_action || "Not recorded"}
            </p>
            <RequestReferences item={item} />
            <section className="intake-original">
              <h3>Original submission (read-only)</h3>
              <p className="field-hint">
                Catalogue {item.catalogue_version}. Reclassification and later
                responses do not replace these words.
              </p>
              <p className="intake-narrative">{item.original_wording}</p>
              <dl className="intake-facts">
                {[
                  ["affected_area", "Affected area"],
                  ["site_contact", "Site contact"],
                  ["access_notes", "Access notes"],
                  ["payer_note", "Payer note"],
                  ["signer_note", "Signer note"],
                ].map(([field, title]) => (
                  <div key={field}>
                    <dt>{title}</dt>
                    <dd className="intake-narrative">
                      {typeof item.original_submission[field] === "string" &&
                      item.original_submission[field]
                        ? (item.original_submission[field] as string)
                        : "Not recorded"}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>Safety flags</dt>
                  <dd>
                    {Array.isArray(item.original_submission.safety_flags) &&
                    item.original_submission.safety_flags.length
                      ? item.original_submission.safety_flags
                          .filter(
                            (value): value is string =>
                              typeof value === "string",
                          )
                          .join(" · ")
                      : "Not recorded"}
                  </dd>
                </div>
              </dl>
            </section>
            <OriginalIncident value={item.original_submission.new_incident} />
            <section className="intake-responses">
              <h3>Appended responses</h3>
              {item.responses.length === 0 ? (
                <p className="field-hint">No responses recorded.</p>
              ) : (
                <ol>
                  {item.responses.map((response) => (
                    <li key={response.id}>
                      <time dateTime={response.created_at}>
                        {date(response.created_at)}
                      </time>
                      <p className="intake-narrative">{response.body}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
          {item.can_triage ? (
            <TriageForm
              item={item}
              intake={intake}
              catalogue={catalogue}
              assignees={assignees}
              onReload={reload}
              onUnavailable={() => setLatest(null)}
              onSaved={() =>
                saved(
                  "Triage changes saved. Review states do not grant professional or commercial approval.",
                )
              }
            />
          ) : (
            <p className="field-hint intake-help">
              Triage actions are unavailable for your current facility access.
            </p>
          )}
          {item.can_respond && item.status === "needs_client_information" && (
            <ResponseForm
              item={item}
              intake={intake}
              onReload={reload}
              onUnavailable={() => setLatest(null)}
              onSaved={() =>
                saved(
                  "Response appended. The request is back in intake completeness review.",
                )
              }
            />
          )}
        </>
      )}
    </section>
  );
}

type EditProps = {
  item: IntakeDetail;
  intake: IntakeApi;
  onReload: (signal: AbortSignal) => Promise<IntakeDetail | null>;
  onUnavailable: () => void;
  onSaved: () => void;
};
function OriginalIncident({ value }: { value: unknown }) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const incident = value as Record<string, unknown>;
  if (typeof incident.title !== "string") return null;
  return (
    <section className="intake-original">
      <h3>Original incident context</h3>
      <p className="intake-narrative">{incident.title}</p>
      {typeof incident.occurred_at === "string" &&
        Number.isFinite(Date.parse(incident.occurred_at)) && (
          <p className="field-hint">Occurred {date(incident.occurred_at)}</p>
        )}
    </section>
  );
}
function requiresReload(error: RuntimeError | null) {
  return !!error && error.code !== "validation";
}

function TriageForm({
  item,
  intake,
  catalogue,
  assignees,
  onReload,
  onUnavailable,
  onSaved,
}: EditProps & { catalogue: IntakeCatalogue; assignees: AssigneeResource }) {
  const mutation = useIntakeMutation();
  const [draft, setDraft] = useState({
    assignee: item.assigned_to_profile_id ?? "",
    status: item.status,
    issue: item.classified_issue_id ?? "",
    intent: item.classified_intent_id ?? "",
    next: item.next_action ?? "",
  });
  const [reloaded, setReloaded] = useState(false);
  const allowed = INTAKE_TRANSITIONS[item.status] ?? [];
  const validStatus =
    draft.status === item.status || allowed.includes(draft.status);
  const terminal = allowed.length === 0;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (requiresReload(mutation.error)) return;
    if (!validStatus) {
      mutation.setError(
        new RuntimeError(
          "validation",
          "Choose a permitted status from the latest revision.",
        ),
      );
      return;
    }
    if (
      draft.status === "needs_client_information" &&
      (!draft.assignee || !draft.next.trim())
    ) {
      mutation.setError(
        new RuntimeError(
          "validation",
          "Needs client information requires an assignee and a next action.",
        ),
      );
      return;
    }
    const changes: TriageChanges = {};
    if (draft.assignee !== (item.assigned_to_profile_id ?? ""))
      changes.assigned_to_profile_id = draft.assignee || null;
    if (draft.status !== item.status) changes.status = draft.status;
    if (draft.issue && draft.issue !== item.classified_issue_id)
      changes.classified_issue_id = draft.issue;
    if (draft.intent && draft.intent !== item.classified_intent_id)
      changes.classified_intent_id = draft.intent;
    if (draft.next !== (item.next_action ?? ""))
      changes.next_action = draft.next;
    const result = await mutation.perform((signal) =>
      intake.triage(item.id, item.revision, changes, signal),
    );
    if (result) onSaved();
  }
  useEffect(() => {
    if (
      mutation.error instanceof IntakeError &&
      mutation.error.reason === "unavailable"
    )
      onUnavailable();
  }, [mutation.error, onUnavailable]);
  async function reload() {
    const result = await mutation.perform(onReload);
    if (result) {
      setReloaded(true);
      assignees.retry();
    }
  }
  return (
    <section className="intake-panel" aria-labelledby="triage-title">
      <h2 id="triage-title">Internal triage</h2>
      <p className="muted">
        Only current exact-facility triagers can save. Assignment,
        classification and state changes are audited.
      </p>
      {terminal ? (
        <p className="notice">
          No further transitions are available in this intake slice. Terminal
          requests cannot be reopened here.
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <fieldset
            disabled={mutation.pending || requiresReload(mutation.error)}
          >
            <legend className="intake-legend">
              Review draft · based on revision {item.revision}
            </legend>
            {assignees.state.status === "loading" ? (
              <LoadingState label="Loading eligible assignees" />
            ) : assignees.state.status === "error" ? (
              <Failure
                error={assignees.state.error}
                onRetry={assignees.retry}
              />
            ) : (
              <div className="field">
                <label htmlFor="triage-assignee">Assignee</label>
                <select
                  id="triage-assignee"
                  value={draft.assignee}
                  onChange={(event) =>
                    setDraft({ ...draft, assignee: event.target.value })
                  }
                >
                  <option value="">Unassigned</option>
                  {draft.assignee &&
                    !assignees.state.value.some(
                      (person) => person.profile_id === draft.assignee,
                    ) && (
                      <option value={draft.assignee} disabled>
                        Previously selected assignee is unavailable
                      </option>
                    )}
                  {assignees.state.value.map((person) => (
                    <option key={person.profile_id} value={person.profile_id}>
                      {person.display_name}
                    </option>
                  ))}
                </select>
                {assignees.state.value.length === 0 && (
                  <p className="field-hint">
                    No currently eligible assignees are available.
                  </p>
                )}
              </div>
            )}
            <div className="intake-grid">
              <ClassificationSelect
                id="triage-issue"
                title="Current issue"
                optional
                value={draft.issue}
                options={catalogue.issues}
                onChange={(value) => setDraft({ ...draft, issue: value })}
              />
              <ClassificationSelect
                id="triage-intent"
                title="Current intent"
                optional
                value={draft.intent}
                options={catalogue.intents}
                onChange={(value) => setDraft({ ...draft, intent: value })}
              />
            </div>
            <div className="field">
              <label htmlFor="triage-status">Request status</label>
              <select
                id="triage-status"
                value={draft.status}
                onChange={(event) =>
                  setDraft({ ...draft, status: event.target.value })
                }
              >
                {!validStatus && (
                  <option value={draft.status} disabled>
                    {intakeStatusLabel(draft.status)} — choose a permitted
                    change
                  </option>
                )}
                {[item.status, ...allowed].map((value) => (
                  <option key={value} value={value}>
                    {intakeStatusLabel(value)}
                    {value === item.status ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="triage-next">Next action</label>
              <textarea
                id="triage-next"
                rows={3}
                maxLength={2000}
                value={draft.next}
                onChange={(event) =>
                  setDraft({ ...draft, next: event.target.value })
                }
              />
            </div>
          </fieldset>
          {mutation.error && (
            <p className="form-error" role="alert">
              {mutation.error.message}
            </p>
          )}
          {reloaded && (
            <p className="notice" role="status">
              Latest revision loaded. Your draft is retained; compare it with
              the current record above before saving.
            </p>
          )}
          <div className="intake-form-actions">
            <p className="field-hint">
              No ROM approval, agreements, scheduling or project conversion in
              this slice.
            </p>
            {requiresReload(mutation.error) ? (
              <button
                type="button"
                className="button secondary"
                disabled={mutation.pending}
                onClick={() => {
                  void reload();
                }}
              >
                {mutation.pending ? "Loading…" : "Load latest revision"}
              </button>
            ) : (
              <button
                type="submit"
                className="button primary"
                disabled={
                  mutation.pending ||
                  assignees.state.status !== "ready" ||
                  !validStatus
                }
              >
                {mutation.pending ? "Saving…" : "Save triage"}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function ResponseForm({
  item,
  intake,
  onReload,
  onUnavailable,
  onSaved,
}: EditProps) {
  const [body, setBody] = useState("");
  const [reloaded, setReloaded] = useState(false);
  const mutation = useIntakeMutation();
  useEffect(() => {
    if (
      mutation.error instanceof IntakeError &&
      mutation.error.reason === "unavailable"
    )
      onUnavailable();
  }, [mutation.error, onUnavailable]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (requiresReload(mutation.error)) return;
    const result = await mutation.perform((signal) =>
      intake.respond(item.id, item.revision, body, signal),
    );
    if (result) onSaved();
  }
  return (
    <section className="intake-panel" aria-labelledby="response-title">
      <h2 id="response-title">Provide requested information</h2>
      <p className="muted">
        This appends a response to your request. The original submission remains
        unchanged.
      </p>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <div className="field">
          <label htmlFor="intake-response">Response</label>
          <textarea
            id="intake-response"
            required
            maxLength={8000}
            rows={4}
            disabled={mutation.pending || requiresReload(mutation.error)}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        {mutation.error && (
          <p className="form-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        {reloaded && (
          <p className="notice" role="status">
            Latest revision loaded. Review the existing responses above before
            appending your retained draft.
          </p>
        )}
        {requiresReload(mutation.error) ? (
          <button
            type="button"
            className="button secondary"
            disabled={mutation.pending}
            onClick={() => {
              void mutation.perform(onReload).then((result) => {
                if (result) setReloaded(true);
              });
            }}
          >
            {mutation.pending ? "Loading…" : "Load latest revision"}
          </button>
        ) : (
          <button
            type="submit"
            className="button primary"
            disabled={mutation.pending}
          >
            {mutation.pending ? "Appending…" : "Append response"}
          </button>
        )}
      </form>
    </section>
  );
}
