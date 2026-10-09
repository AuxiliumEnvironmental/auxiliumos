import type { SupabaseClient } from "@supabase/supabase-js";
import { RuntimeError, serviceError } from "./errors";

/**
 * Creator-owned synthetic planning notes. A saved planning draft is never a
 * signature, approval, release, schedule, cap or other professional action.
 */
export const PLAN_MODULE_KEYS = ["programs", "portfolios", "readiness", "scope", "sampling", "estimates", "approvals", "projects", "messages", "vendors", "finance", "reports", "ai", "audit", "integrations"] as const;
export type PlanModuleKey = (typeof PLAN_MODULE_KEYS)[number];

export type PlanFieldKind = "text" | "multiline" | "date" | "quantity" | "money" | "select";
export type PlanFieldSpec = { kind: PlanFieldKind; options?: readonly string[] };
/** Exact known labels per screen. Only these labels and checks may be sent or accepted. */
export type PlanSchema = { values: Readonly<Record<string, PlanFieldSpec>>; rows: Readonly<Record<string, PlanFieldSpec>>; checks: readonly string[] };
export type PlanScope = { accountId: string; facilityId: string; moduleKey: string; panelKey: string };
export type PlanContent = { title: string; values: Record<string, string>; rows: Record<string, string>[]; checks: Record<string, boolean> };
/** List results are metadata only; content requires get_workspace_plan. */
export type WorkspacePlanSummary = {
  id: string; accountId: string; facilityId: string; moduleKey: string; panelKey: string; title: string;
  revision: number; createdAt: string; updatedAt: string; isDemo: true; state: "planning_draft";
};
export type WorkspacePlan = WorkspacePlanSummary & Omit<PlanContent, "title">;
/** An immutable save request. A retry must resend this exact object. */
export type PlanSaveRequest = Readonly<{ scope: PlanScope; planId: string; expectedRevision: number; requestId: string; content: PlanContent }>;

export type PlanErrorCode = "unavailable" | "validation" | "conflict" | "not_available";
export class PlanError extends RuntimeError {
  constructor(public readonly planCode: PlanErrorCode, message: string, retryable = false) {
    super(planCode === "unavailable" ? "access_unavailable" : planCode === "validation" ? "validation" : "backend", message, retryable);
    this.name = "PlanError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE = 120;
const MAX_ROWS = 50;
const MAX_BYTES = 64 * 1024;
const LINK = /([a-z][a-z0-9+.-]*:\/\/|\bwww\.|\b(?:mailto|javascript|data|file):)/i;
const SECRET = /(pass(?:word|wd)?\s*[:=]|secret\s*[:=]|api[_-]?key|bearer\s+[a-z0-9]|token\s*[:=]|sb_(?:secret|publishable)_|service[_-]?role|eyJ[A-Za-z0-9_-]{10,}\.|-----BEGIN)/i;

/** Mirrors the server's bounds. Returns an error message or null. */
export function fieldProblem(label: string, spec: PlanFieldSpec, value: string): string | null {
  if (value === "") return null;
  if (spec.kind === "date") {
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const real = date && new Date(Date.UTC(+date[1], +date[2] - 1, +date[3])).toISOString().slice(0, 10) === value;
    return real ? null : `${label}: use a real date.`;
  }
  if (spec.kind === "money") return /^-?\d{1,12}(\.\d{1,2})?$/.test(value) ? null : `${label}: use a plain amount with up to 2 decimals.`;
  if (spec.kind === "quantity") return /^-?\d{1,12}(\.\d{1,6})?$/.test(value) ? null : `${label}: use a plain number with up to 6 decimals.`;
  if (spec.kind === "select") return spec.options?.includes(value) ? null : `${label}: choose a listed option.`;
  if (value.length > (spec.kind === "multiline" ? 4000 : 500)) return `${label}: keep this under ${spec.kind === "multiline" ? 4000 : 500} characters.`;
  return textProblem(label, value);
}
function textProblem(label: string, value: string): string | null {
  if (LINK.test(value)) return `${label}: links and web addresses are not accepted. Describe the reference instead.`;
  if (SECRET.test(value)) return `${label}: passwords, keys and tokens are not accepted here.`;
  return null;
}

function bad(): never {
  throw new RuntimeError("backend", "The workspace returned an unexpected planning draft. Contact your workspace administrator.");
}
function invalid(message: string): never {
  throw new PlanError("validation", message);
}
function aborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Request canceled", "AbortError");
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export function panelKeyFor(moduleKey: string, index: number) {
  return `${moduleKey}.${index + 1}`;
}

export function validateScope(scope: PlanScope): PlanScope {
  if (!uuid(scope.accountId) || !uuid(scope.facilityId)) invalid("Choose a permitted development account and facility.");
  if (!(PLAN_MODULE_KEYS as readonly string[]).includes(scope.moduleKey)) invalid("This module cannot save planning drafts.");
  if (!new RegExp(`^${scope.moduleKey}\\.[1-9][0-9]?$`).test(scope.panelKey)) invalid("This screen cannot save planning drafts.");
  return { accountId: scope.accountId.toLowerCase(), facilityId: scope.facilityId.toLowerCase(), moduleKey: scope.moduleKey, panelKey: scope.panelKey };
}

function textMap(value: unknown, specs: Readonly<Record<string, PlanFieldSpec>>, onBad: (message?: string) => never): Record<string, string> {
  if (!isRecord(value)) return onBad();
  const result: Record<string, string> = {};
  for (const [key, text] of Object.entries(value)) {
    const spec = Object.prototype.hasOwnProperty.call(specs, key) ? specs[key] : undefined;
    if (!spec || typeof text !== "string") return onBad();
    const problem = fieldProblem(key, spec, text);
    if (problem) return onBad(problem);
    result[key] = text;
  }
  return result;
}
function boolMap(value: unknown, labels: readonly string[], onBad: () => never): Record<string, boolean> {
  if (!isRecord(value)) return onBad();
  const result: Record<string, boolean> = {};
  for (const [key, flag] of Object.entries(value)) {
    if (!labels.includes(key) || typeof flag !== "boolean") return onBad();
    result[key] = flag;
  }
  return result;
}
function rowList(value: unknown, specs: Readonly<Record<string, PlanFieldSpec>>, onBad: (message?: string) => never): Record<string, string>[] {
  if (!Array.isArray(value)) return onBad();
  if (value.length > MAX_ROWS) return onBad(`Keep to ${MAX_ROWS} items or fewer.`);
  return value.map((row) => textMap(row, specs, onBad));
}
const tooLarge = (content: Omit<PlanContent, "title">) => new TextEncoder().encode(JSON.stringify({ values: content.values, rows: content.rows, checks: content.checks })).length > MAX_BYTES;

/** Strict client-side input validation. Unknown labels and local row IDs are rejected. */
export function validateContent(content: PlanContent, schema: PlanSchema): PlanContent {
  const fail = (message?: string) => invalid(message ?? "Check the planning draft fields and try again.");
  const title = typeof content.title === "string" ? content.title.trim() : "";
  if (!title) invalid("Enter a planning draft title.");
  if (title.length > MAX_TITLE) invalid(`Keep the title to ${MAX_TITLE} characters or fewer.`);
  const titleProblem = textProblem("Title", title);
  if (titleProblem) invalid(titleProblem);
  const checked = { values: textMap(content.values, schema.values, fail), rows: rowList(content.rows, schema.rows, fail), checks: boolMap(content.checks, schema.checks, fail) };
  if (tooLarge(checked)) invalid("This planning draft is too large. Shorten some notes and try again.");
  return { title, ...checked };
}

function parseSummary(value: unknown, scope: PlanScope): WorkspacePlanSummary {
  if (!isRecord(value)) return bad();
  const r = value;
  if (!uuid(r.id) || !uuid(r.account_id) || !uuid(r.facility_id)) return bad();
  if (r.account_id.toLowerCase() !== scope.accountId || r.facility_id.toLowerCase() !== scope.facilityId) return bad();
  if (r.module_key !== scope.moduleKey || r.panel_key !== scope.panelKey) return bad();
  if (r.is_demo !== true || r.state !== "planning_draft") return bad();
  if (typeof r.revision !== "number" || !Number.isInteger(r.revision) || r.revision < 1) return bad();
  if (typeof r.title !== "string" || !r.title.trim() || r.title.length > MAX_TITLE) return bad();
  if (typeof r.created_at !== "string" || typeof r.updated_at !== "string" || Number.isNaN(Date.parse(r.created_at)) || Number.isNaN(Date.parse(r.updated_at))) return bad();
  return {
    id: r.id.toLowerCase(), accountId: scope.accountId, facilityId: scope.facilityId, moduleKey: scope.moduleKey, panelKey: scope.panelKey,
    title: r.title, revision: r.revision, createdAt: r.created_at, updatedAt: r.updated_at, isDemo: true, state: "planning_draft",
  };
}
function parseDetail(value: unknown, scope: PlanScope, schema: PlanSchema): WorkspacePlan {
  const summary = parseSummary(value, scope);
  const r = value as Record<string, unknown>;
  const content = { values: textMap(r.values, schema.values, bad), rows: rowList(r.rows, schema.rows, bad), checks: boolMap(r.checks, schema.checks, bad) };
  if (tooLarge(content)) return bad();
  return { ...summary, ...content };
}

export function newPlanId(): string {
  return crypto.randomUUID();
}

/** Build an immutable request. New drafts use revision 0; edits use the current revision and a fresh request ID. */
export function buildSaveRequest(scope: PlanScope, schema: PlanSchema, content: PlanContent, existing?: { id: string; revision: number }): PlanSaveRequest {
  const checkedScope = validateScope(scope);
  const checked = validateContent(content, schema);
  return Object.freeze({
    scope: Object.freeze(checkedScope),
    planId: existing?.id ?? crypto.randomUUID(),
    expectedRevision: existing?.revision ?? 0,
    requestId: crypto.randomUUID(),
    content: Object.freeze({ ...checked, rows: checked.rows.map((row) => ({ ...row })) }),
  });
}

export class WorkspacePlanApi {
  constructor(private readonly client: SupabaseClient) {}

  private async rpc(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    aborted(signal);
    let query = this.client.rpc(name, args).retry(false);
    if (signal) query = query.abortSignal(signal);
    const response = await query;
    aborted(signal);
    if (response.error) {
      switch (response.error.code) {
        case "42501": throw new PlanError("unavailable", "This planning draft is unavailable for your current access at this facility.");
        case "22023": throw new PlanError("validation", "The workspace could not accept these planning draft values. Check the fields and try again.");
        case "40001": throw new PlanError("conflict", "This planning draft changed or the save was already used. Load the latest saved version before continuing.");
        case "PGRST202":
        case "42883": throw new PlanError("not_available", "Saving planning drafts is not available in this workspace yet.", true);
        default: throw serviceError(response.error, response.status);
      }
    }
    return response.data;
  }

  /** Latest personal planning-draft summaries (metadata only, at most 100). */
  async list(scope: PlanScope, signal?: AbortSignal): Promise<WorkspacePlanSummary[]> {
    const s = validateScope(scope);
    const data = await this.rpc("list_workspace_plans", { p_account_id: s.accountId, p_facility_id: s.facilityId, p_module_key: s.moduleKey, p_panel_key: s.panelKey }, signal);
    if (!Array.isArray(data) || data.length > 100) return bad();
    return data.map((row) => parseSummary(row, s));
  }

  async get(planId: string, scope: PlanScope, schema: PlanSchema, signal?: AbortSignal): Promise<WorkspacePlan> {
    if (!uuid(planId)) invalid("Choose a saved planning draft.");
    const s = validateScope(scope);
    const plan = parseDetail(await this.rpc("get_workspace_plan", { p_plan_id: planId.toLowerCase() }, signal), s, schema);
    if (plan.id !== planId.toLowerCase()) return bad();
    return plan;
  }

  /** Sends exactly the supplied request. It never generates IDs or retries by itself. */
  async save(request: PlanSaveRequest, schema: PlanSchema, signal?: AbortSignal): Promise<WorkspacePlan> {
    const s = validateScope(request.scope);
    if (!uuid(request.planId) || !uuid(request.requestId) || !Number.isInteger(request.expectedRevision) || request.expectedRevision < 0) invalid("Check the planning draft and try again.");
    const content = validateContent(request.content, schema);
    const plan = parseDetail(await this.rpc("save_workspace_plan", {
      p_plan_id: request.planId, p_account_id: s.accountId, p_facility_id: s.facilityId,
      p_module_key: s.moduleKey, p_panel_key: s.panelKey,
      p_expected_revision: request.expectedRevision, p_request_id: request.requestId,
      p_title: content.title, p_values: content.values, p_rows: content.rows, p_checks: content.checks,
    }, signal), s, schema);
    // An identical retry returns the original saved revision for this request.
    if (plan.id !== request.planId.toLowerCase() || plan.revision !== request.expectedRevision + 1) return bad();
    return plan;
  }
}
