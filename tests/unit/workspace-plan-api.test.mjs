import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Fixture evidence: production adapter with a simulated SDK transport.
// Not authentication, PostgreSQL, RLS or deployed-backend evidence.
const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const errorsUrl = moduleUrl(transpile(await readFile(new URL("../../web/src/lib/errors.ts", import.meta.url), "utf8")));
const source = transpile(await readFile(new URL("../../web/src/lib/workspace-plan-api.ts", import.meta.url), "utf8"));
const { WorkspacePlanApi, PlanError, buildSaveRequest, validateScope } = await import(moduleUrl(source.replace(/from\s+["']\.\/errors["']/, `from '${errorsUrl}'`)));

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { accountId: id(1), facilityId: id(2), moduleKey: "scope", panelKey: "scope.1" };
const schema = { values: { Inclusions: { kind: "text" }, Exclusions: { kind: "multiline" }, Due: { kind: "date" }, Cost: { kind: "money" }, Count: { kind: "quantity" }, Priority: { kind: "select", options: ["High", "Low"] } }, rows: { Deliverable: { kind: "text" }, "Acceptance evidence": { kind: "text" } }, checks: ["Confirm"] };
const content = { title: " Plan A ", values: { Inclusions: "Roof" }, rows: [{ Deliverable: "Report" }], checks: { Confirm: true } };
const row = (over = {}) => ({ id: id(9), account_id: id(1), facility_id: id(2), module_key: "scope", panel_key: "scope.1", title: "Plan A", revision: 1, values: { Inclusions: "Roof" }, rows: [{ Deliverable: "Report" }], checks: { Confirm: true }, created_at: "2026-10-09T00:00:00Z", updated_at: "2026-10-09T00:00:00Z", is_demo: true, state: "planning_draft", ...over });

function client(responses) {
  const calls = [];
  return { calls, rpc(name, args) {
    const call = { name, args, retry: undefined, signal: undefined };
    calls.push(call);
    const q = { retry(v) { call.retry = v; return q; }, abortSignal(s) { call.signal = s; return q; }, then(ok, fail) { return Promise.resolve(responses.shift()).then(ok, fail); } };
    return q;
  } };
}

test("list sends exact arguments with retry disabled and validates scope", async () => {
  const { values, rows, checks, ...summary } = row();
  const c = client([{ data: [summary], error: null }]);
  const plans = await new WorkspacePlanApi(c).list(scope);
  assert.equal("values" in plans[0], false);
  assert.deepEqual(c.calls[0].args, { p_account_id: id(1), p_facility_id: id(2), p_module_key: "scope", p_panel_key: "scope.1" });
  assert.equal(c.calls[0].name, "list_workspace_plans");
  assert.equal(c.calls[0].retry, false);
  assert.equal(plans[0].revision, 1);
});

test("wrong-scope, non-demo, wrong state or unknown label results never render", async () => {
  for (const bad of [row({ facility_id: id(3) }), row({ module_key: "projects" }), row({ panel_key: "scope.2" }), row({ is_demo: false }), row({ state: "approved" }), row({ revision: 0 })]) {
    await assert.rejects(new WorkspacePlanApi(client([{ data: [bad], error: null }])).list(scope), (e) => e.code === "backend" && !/Signed|approved/.test(e.message));
  }
});

test("get validates the returned record against the current account, facility, module and panel", async () => {
  await assert.rejects(new WorkspacePlanApi(client([{ data: row({ account_id: id(7) }), error: null }])).get(id(9), scope, schema));
  await assert.rejects(new WorkspacePlanApi(client([{ data: row({ values: { Signed: "yes" } }), error: null }])).get(id(9), scope, schema), (e) => e.code === "backend" && !/Signed/.test(e.message));
  const plan = await new WorkspacePlanApi(client([{ data: row(), error: null }])).get(id(9), scope, schema);
  assert.equal(plan.id, id(9));
});

test("new save uses revision 0 and sends the exact supplied request; retry reuses the same request id", async () => {
  const request = buildSaveRequest(scope, schema, content);
  assert.equal(request.expectedRevision, 0);
  assert.ok(Object.isFrozen(request));
  const c = client([{ data: null, error: { code: "", message: "x" }, status: 503 }, { data: row({ id: request.planId }), error: null }]);
  const api = new WorkspacePlanApi(c);
  await assert.rejects(api.save(request, schema), (e) => e.retryable === true);
  const saved = await api.save(request, schema);
  assert.equal(c.calls.length, 2, "no automatic retry");
  assert.deepEqual(c.calls[0].args, c.calls[1].args);
  assert.deepEqual(c.calls[0].args, { p_plan_id: request.planId, p_account_id: id(1), p_facility_id: id(2), p_module_key: "scope", p_panel_key: "scope.1", p_expected_revision: 0, p_request_id: request.requestId, p_title: "Plan A", p_values: { Inclusions: "Roof" }, p_rows: [{ Deliverable: "Report" }], p_checks: { Confirm: true } });
  assert.equal(saved.revision, 1);
});

test("edit keeps the plan id and current revision with a fresh request id", () => {
  const first = buildSaveRequest(scope, schema, content, { id: id(9), revision: 3 });
  const second = buildSaveRequest(scope, schema, content, { id: id(9), revision: 3 });
  assert.equal(first.planId, id(9));
  assert.equal(first.expectedRevision, 3);
  assert.notEqual(first.requestId, second.requestId);
});

test("input validation rejects missing title, unknown labels, local row ids and disallowed modules", () => {
  assert.throws(() => buildSaveRequest(scope, schema, { ...content, title: " " }), PlanError);
  assert.throws(() => buildSaveRequest(scope, schema, { ...content, values: { Approved: "yes" } }), PlanError);
  assert.throws(() => buildSaveRequest(scope, schema, { ...content, rows: [{ id: "1", Deliverable: "x" }] }), PlanError);
  assert.throws(() => validateScope({ ...scope, moduleKey: "documents", panelKey: "documents.1" }), PlanError);
  assert.throws(() => validateScope({ ...scope, panelKey: "projects.1" }), PlanError);
});

test("backend codes map to safe messages without raw provider text", async () => {
  const cases = [["42501", "unavailable"], ["22023", "validation"], ["40001", "conflict"], ["PGRST202", "not_available"]];
  for (const [code, planCode] of cases) {
    await assert.rejects(new WorkspacePlanApi(client([{ data: null, error: { code, message: "SECRET SQL detail" } }])).list(scope), (e) => e.planCode === planCode && !e.message.includes("SECRET"));
  }
});

test("a conflict on save does not return a saved record", async () => {
  const request = buildSaveRequest(scope, schema, content, { id: id(9), revision: 1 });
  await assert.rejects(new WorkspacePlanApi(client([{ data: null, error: { code: "40001" } }])).save(request, schema), (e) => e.planCode === "conflict");
  await assert.rejects(new WorkspacePlanApi(client([{ data: row({ revision: 5 }), error: null }])).save(request, schema), (e) => e.code === "backend");
});

test("an aborted request throws AbortError, not a failure or success", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(new WorkspacePlanApi(client([])).list(scope, controller.signal), (e) => e.name === "AbortError");
});

test("authorized empty list is an empty array; list beyond 100 is rejected", async () => {
  assert.deepEqual(await new WorkspacePlanApi(client([{ data: [], error: null }])).list(scope), []);
  await assert.rejects(new WorkspacePlanApi(client([{ data: Array.from({ length: 101 }, () => row()), error: null }])).list(scope));
});

test("field bounds mirror the server", () => {
  const ok = (values, extra = {}) => buildSaveRequest(scope, schema, { ...content, values, ...extra });
  const no = (values, extra = {}) => assert.throws(() => ok(values, extra), PlanError);
  ok({ Due: "2026-02-28", Cost: "-123456789012.50", Count: "1.123456", Priority: "High", Exclusions: "x".repeat(4000) });
  no({ Due: "2026-02-30" }); no({ Cost: "1.234" }); no({ Cost: "$5" }); no({ Count: "1.1234567" }); no({ Priority: "Medium" });
  no({ Inclusions: "x".repeat(501) }); no({ Exclusions: "x".repeat(4001) });
  no({ Inclusions: "see https://example.test" }); no({ Inclusions: "www.example.test" }); no({ Inclusions: "password: hunter" });
  no({}, { title: "x".repeat(121) }); no({}, { title: "  " }); no({}, { title: "api_key here" });
  no({}, { rows: Array.from({ length: 51 }, () => ({ Deliverable: "a" })) });
  no({}, { rows: Array.from({ length: 50 }, () => ({ Deliverable: "é".repeat(500), "Acceptance evidence": "é".repeat(500) })), values: { Exclusions: "z".repeat(4000) } });
});
