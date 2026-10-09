import type { SupabaseClient } from "@supabase/supabase-js";
import { RuntimeError, serviceError } from "./errors";

// Wire shapes and allowed initial transitions follow INTAKE_RUNTIME_CONTRACT.md.
// These UI hints never replace the server's current entitlement/revision checks.
export type IntakeCatalogue = {
  version: string;
  issues: CatalogueEntry[];
  intents: CatalogueEntry[];
  statuses: string[];
};
export type CatalogueEntry = { id: string; label: string };
export type IntakeSubmission = {
  title: string;
  original_wording: string;
  issue_id: string;
  intent_id: string;
  urgency: "routine" | "urgent" | "emergency";
  affected_area: string;
  site_contact: string;
  access_notes: string;
  safety_flags: string[];
  payer_note: string;
  signer_note: string;
  incident_id?: string;
  new_incident?: { title: string; occurred_at?: string };
};
export type IntakeItem = {
  id: string;
  account_id: string;
  facility_id: string;
  incident_id: string | null;
  title: string;
  original_wording: string;
  original_issue_id: string | null;
  original_intent_id: string | null;
  classified_issue_id: string | null;
  classified_intent_id: string | null;
  catalogue_version: string;
  urgency: IntakeSubmission["urgency"];
  status: string;
  revision: number;
  assigned_to_profile_id: string | null;
  next_action: string | null;
  created_at: string;
  updated_at: string;
  can_triage: boolean;
  can_respond: boolean;
};
export type IntakeDetail = IntakeItem & {
  original_submission: Record<string, unknown>;
  responses: { id: string; body: string; created_at: string }[];
};
export type IntakePage = { items: IntakeItem[]; nextCursor: string | null };
export type IntakeAssignee = { profile_id: string; display_name: string };
export type IntakeMutation = {
  request_id: string;
  revision: number;
  status: string;
};
export type TriageChanges = {
  assigned_to_profile_id?: string | null;
  status?: string;
  classified_issue_id?: string;
  classified_intent_id?: string;
  next_action?: string;
};
export type IntakeFailure =
  | "validation"
  | "unavailable"
  | "conflict"
  | "idempotency_conflict"
  | "unexpected";

export class IntakeError extends RuntimeError {
  constructor(
    public readonly reason: IntakeFailure,
    message: string,
  ) {
    super(reason === "validation" ? "validation" : "backend", message);
    this.name = "IntakeError";
  }
}

export const INTAKE_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  submitted: ["intake_completeness_review"],
  intake_completeness_review: [
    "needs_client_information",
    "classification_review",
    "technical_review",
    "safety_review",
    "declined",
    "cancelled",
  ],
  needs_client_information: [
    "intake_completeness_review",
    "declined",
    "cancelled",
  ],
  classification_review: [
    "technical_review",
    "safety_review",
    "revision_proposed",
    "declined",
    "cancelled",
  ],
  technical_review: [
    "needs_client_information",
    "classification_review",
    "revision_proposed",
    "declined",
    "cancelled",
  ],
  safety_review: [
    "needs_client_information",
    "classification_review",
    "revision_proposed",
    "declined",
    "cancelled",
  ],
  revision_proposed: [
    "client_revision_pending",
    "needs_client_information",
    "declined",
    "cancelled",
  ],
  client_revision_pending: [
    "needs_client_information",
    "classification_review",
    "declined",
    "cancelled",
  ],
};

export function intakeStatusLabel(status: string): string {
  const value = status.replaceAll("_", " ");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function intakeUrgencyLabel(item: Pick<IntakeItem, "catalogue_version" | "urgency">): string {
  // Legacy rows did not record urgency. Their structural backend default is
  // not evidence that the original submitter chose routine priority.
  return item.catalogue_version === "legacy-unversioned" ? "Not recorded" : intakeStatusLabel(item.urgency);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (message: string): never => {
  throw new IntakeError("validation", message);
};
const badResponse = (): never => {
  throw new IntakeError(
    "unexpected",
    "Intake returned an unexpected response. Refresh to check the current record before making another change.",
  );
};
const textValue = (value: unknown, max: number, required = false) =>
  typeof value === "string" &&
  value.length <= max &&
  (!required || !!value.trim());
const uuid = (value: unknown, label: string): string =>
  typeof value === "string" && UUID.test(value)
    ? value.toLowerCase()
    : invalid(`Choose a valid ${label}.`);
const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : badResponse();
const responseId = (value: unknown): string =>
  typeof value === "string" && UUID.test(value)
    ? value.toLowerCase()
    : badResponse();
const optionalId = (value: unknown): string | null =>
  value === null ? null : responseId(value);
const responseText = (value: unknown, max = 8000): string =>
  textValue(value, max) ? (value as string) : badResponse();
const optionalText = (value: unknown, max = 2000): string | null =>
  value === null ? null : responseText(value, max);
const revision = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : badResponse();
const timestamp = (value: unknown): string =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : badResponse();
const aborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("Request canceled", "AbortError");
};

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    invalid("This intake change contains unsupported fields.");
}

export function validateSubmission(submission: IntakeSubmission) {
  onlyKeys(submission, [
    "title",
    "original_wording",
    "issue_id",
    "intent_id",
    "urgency",
    "affected_area",
    "site_contact",
    "access_notes",
    "safety_flags",
    "payer_note",
    "signer_note",
    "incident_id",
    "new_incident",
  ]);
  if (!textValue(submission.title, 160, true))
    invalid("Enter a request title of 1 to 160 characters.");
  if (!textValue(submission.original_wording, 8000, true))
    invalid("Enter original request wording of 1 to 8,000 characters.");
  if (
    !textValue(submission.issue_id, 200, true) ||
    !textValue(submission.intent_id, 200, true)
  )
    invalid("Choose an issue and an intent from the current catalogue.");
  if (!["routine", "urgent", "emergency"].includes(submission.urgency))
    invalid("Choose a valid urgency.");
  for (const field of [
    "affected_area",
    "site_contact",
    "access_notes",
    "payer_note",
    "signer_note",
  ] as const) {
    if (!textValue(submission[field], 2000))
      invalid("Each context field must be at most 2,000 characters.");
  }
  if (
    !Array.isArray(submission.safety_flags) ||
    submission.safety_flags.length > 20 ||
    submission.safety_flags.some((flag) => !textValue(flag, 200, true))
  )
    invalid("Use at most 20 safety flags, each 1 to 200 characters.");
  if (
    submission.incident_id !== undefined &&
    submission.new_incident !== undefined
  )
    invalid("Link an existing incident or add new incident context, not both.");
  if (submission.incident_id !== undefined)
    uuid(submission.incident_id, "incident identifier");
  if (submission.new_incident !== undefined) {
    const incident = record(submission.new_incident);
    onlyKeys(incident, ["title", "occurred_at"]);
    if (!textValue(incident.title, 160, true))
      invalid("Enter an incident title of 1 to 160 characters.");
    if (
      incident.occurred_at !== undefined &&
      (typeof incident.occurred_at !== "string" ||
        !Number.isFinite(Date.parse(incident.occurred_at)))
    )
      invalid("Enter a valid incident date and time.");
  }
}

function parseItem(value: unknown): IntakeItem {
  const row = record(value);
  if (
    typeof row.can_triage !== "boolean" ||
    typeof row.can_respond !== "boolean" ||
    !["routine", "urgent", "emergency"].includes(String(row.urgency))
  )
    return badResponse();
  return {
    id: responseId(row.id),
    account_id: responseId(row.account_id),
    facility_id: responseId(row.facility_id),
    incident_id: optionalId(row.incident_id),
    // Original foundation rows allow 250 characters. Reading a preserved legacy
    // title must not apply the stricter 160-character new-submission limit.
    title: responseText(row.title, 250),
    original_wording: responseText(row.original_wording),
    original_issue_id: optionalText(row.original_issue_id),
    original_intent_id: optionalText(row.original_intent_id),
    classified_issue_id: optionalText(row.classified_issue_id),
    classified_intent_id: optionalText(row.classified_intent_id),
    catalogue_version: responseText(row.catalogue_version, 200),
    urgency: row.urgency as IntakeItem["urgency"],
    status: responseText(row.status, 100),
    revision: revision(row.revision),
    assigned_to_profile_id: optionalId(row.assigned_to_profile_id),
    next_action: optionalText(row.next_action),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
    can_triage: row.can_triage,
    can_respond: row.can_respond,
  };
}

function parseMutation(data: unknown, expectedId?: string): IntakeMutation {
  const row = record(data);
  const result = {
    request_id: responseId(row.request_id),
    revision: revision(row.revision),
    status: responseText(row.status, 100),
  };
  if (expectedId && result.request_id !== expectedId) return badResponse();
  return result;
}

export class IntakeApi {
  constructor(private readonly client: SupabaseClient) {}

  private async rpc(
    name: string,
    args: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<unknown> {
    aborted(signal);
    // Never automatically retry a mutation. Submission retries reuse an explicit
    // in-memory idempotency key; stale triage/response revisions require review.
    let query = this.client.rpc(name, args).retry(false);
    if (signal) query = query.abortSignal(signal);
    const response = await query;
    aborted(signal);
    if (response.error) {
      switch (response.error.code) {
        case "22023":
          throw new IntakeError(
            "validation",
            "Intake could not accept those values. Check the fields and permitted state change, then try again.",
          );
        case "42501":
          throw new IntakeError(
            "unavailable",
            "This request or action is unavailable for your current access. Refresh your access or contact your workspace administrator.",
          );
        case "40001":
          throw new IntakeError(
            "conflict",
            "This request changed after you opened it. Load the latest revision, review your draft, then save again.",
          );
        case "23505":
          throw new IntakeError(
            "idempotency_conflict",
            "This submission identifier was already used with different content. Check the request queue before starting another request.",
          );
        default:
          throw serviceError(response.error, response.status);
      }
    }
    return response.data;
  }

  async catalogue(signal?: AbortSignal): Promise<IntakeCatalogue> {
    const data = record(await this.rpc("intake_catalogue", {}, signal));
    const entries = (value: unknown): CatalogueEntry[] => {
      if (!Array.isArray(value) || !value.length) return badResponse();
      const items = value.map((value) => {
        const row = record(value);
        return {
          id: responseText(row.id, 200),
          label: responseText(row.label, 2000),
        };
      });
      if (new Set(items.map((item) => item.id)).size !== items.length)
        return badResponse();
      return items;
    };
    if (
      !Array.isArray(data.statuses) ||
      data.statuses.some((value) => !textValue(value, 100, true))
    )
      return badResponse();
    return {
      version: responseText(data.version, 200),
      issues: entries(data.issues),
      intents: entries(data.intents),
      statuses: data.statuses as string[],
    };
  }

  async list({
    accountId,
    afterId,
    limit = 50,
    status,
    signal,
  }: {
    accountId: string;
    afterId?: string;
    limit?: number;
    status?: string;
    signal?: AbortSignal;
  }): Promise<IntakePage> {
    const account = uuid(accountId, "account");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      invalid("Page size must be a whole number from 1 to 100.");
    if (status !== undefined && !textValue(status, 100, true))
      invalid("Choose a valid request status.");
    const data = record(
      await this.rpc(
        "list_project_requests",
        {
          p_account_id: account,
          p_after_id: afterId ? uuid(afterId, "request cursor") : null,
          p_limit: limit,
          p_status: status ?? null,
        },
        signal,
      ),
    );
    if (!Array.isArray(data.items) || data.items.length > limit)
      return badResponse();
    const items = data.items.map(parseItem);
    if (
      items.some(
        (item, index) =>
          item.account_id !== account ||
          (afterId && item.id <= afterId.toLowerCase()) ||
          (index > 0 && item.id <= items[index - 1].id),
      )
    )
      return badResponse();
    const nextCursor = optionalId(data.next_cursor);
    if (
      nextCursor !== null &&
      (!items.length || nextCursor !== items[items.length - 1].id)
    )
      return badResponse();
    return { items, nextCursor };
  }

  async detail(
    requestId: string,
    signal?: AbortSignal,
  ): Promise<IntakeDetail | null> {
    const id = uuid(requestId, "request");
    const data = await this.rpc(
      "get_project_request",
      { p_request_id: id },
      signal,
    );
    if (data === null) return null;
    const row = record(data);
    const item = parseItem(row);
    if (item.id !== id || !Array.isArray(row.responses)) return badResponse();
    return {
      ...item,
      original_submission: record(row.original_submission),
      responses: row.responses.map((value) => {
        const response = record(value);
        return {
          id: responseId(response.id),
          body: responseText(response.body),
          created_at: timestamp(response.created_at),
        };
      }),
    };
  }

  async assignees(
    accountId: string,
    facilityId: string,
    signal?: AbortSignal,
  ): Promise<IntakeAssignee[]> {
    const data = await this.rpc(
      "list_intake_assignees",
      {
        p_account_id: uuid(accountId, "account"),
        p_facility_id: uuid(facilityId, "facility"),
      },
      signal,
    );
    if (!Array.isArray(data)) return badResponse();
    return data.map((value) => {
      const row = record(value);
      return {
        profile_id: responseId(row.profile_id),
        display_name: responseText(row.display_name, 2000),
      };
    });
  }

  async submit(
    accountId: string,
    facilityId: string,
    idempotencyKey: string,
    submission: IntakeSubmission,
    signal?: AbortSignal,
  ): Promise<IntakeMutation> {
    validateSubmission(submission);
    const result = parseMutation(
      await this.rpc(
        "submit_project_request",
        {
          p_account_id: uuid(accountId, "account"),
          p_facility_id: uuid(facilityId, "facility"),
          p_idempotency_key: uuid(idempotencyKey, "submission identifier"),
          p_submission: submission,
        },
        signal,
      ),
    );
    if (result.revision !== 1 || result.status !== "submitted")
      return badResponse();
    return result;
  }

  async triage(
    requestId: string,
    expectedRevision: number,
    changes: TriageChanges,
    signal?: AbortSignal,
  ): Promise<IntakeMutation> {
    const id = uuid(requestId, "request");
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      invalid("Refresh the request to load a valid revision.");
    onlyKeys(changes, [
      "assigned_to_profile_id",
      "status",
      "classified_issue_id",
      "classified_intent_id",
      "next_action",
    ]);
    if (!Object.keys(changes).length)
      invalid("Choose at least one change to save.");
    if (
      changes.assigned_to_profile_id !== undefined &&
      changes.assigned_to_profile_id !== null
    )
      uuid(changes.assigned_to_profile_id, "assignee");
    for (const field of [
      "status",
      "classified_issue_id",
      "classified_intent_id",
    ] as const)
      if (changes[field] !== undefined && !textValue(changes[field], 200, true))
        invalid("Choose a valid classification and state.");
    if (
      changes.next_action !== undefined &&
      !textValue(changes.next_action, 2000)
    )
      invalid("Next action must be at most 2,000 characters.");
    return parseMutation(
      await this.rpc(
        "triage_project_request",
        {
          p_request_id: id,
          p_expected_revision: expectedRevision,
          p_changes: changes,
        },
        signal,
      ),
      id,
    );
  }

  async respond(
    requestId: string,
    expectedRevision: number,
    response: string,
    signal?: AbortSignal,
  ): Promise<IntakeMutation> {
    const id = uuid(requestId, "request");
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      invalid("Refresh the request to load a valid revision.");
    if (!textValue(response, 8000, true))
      invalid("Enter a response of 1 to 8,000 characters.");
    return parseMutation(
      await this.rpc(
        "respond_project_request",
        {
          p_request_id: id,
          p_expected_revision: expectedRevision,
          p_response: response,
        },
        signal,
      ),
      id,
    );
  }
}
