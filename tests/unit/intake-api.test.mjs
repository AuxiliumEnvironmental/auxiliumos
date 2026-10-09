import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Production adapter with a narrow simulated SDK transport. This is unit
// evidence, not authentication, PostgreSQL, RLS, or real-service API evidence.
const moduleUrl = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
const errorsUrl = moduleUrl(
  transpile(
    await readFile(
      new URL("../../web/src/lib/errors.ts", import.meta.url),
      "utf8",
    ),
  ),
);
const source = transpile(
  await readFile(
    new URL("../../web/src/lib/intake-api.ts", import.meta.url),
    "utf8",
  ),
);
const { IntakeApi, IntakeError, INTAKE_TRANSITIONS, validateSubmission, intakeUrgencyLabel } =
  await import(
    moduleUrl(
      source.replace(/from\s+["']\.\/errors["']/, `from '${errorsUrl}'`),
    )
  );
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const payload = () => ({
  title: "Synthetic request",
  original_wording: " Exact original wording. ",
  issue_id: "water",
  intent_id: "assessment",
  urgency: "routine",
  affected_area: "",
  site_contact: "",
  access_notes: "",
  safety_flags: [],
  payer_note: "",
  signer_note: "",
});
const item = () => ({
  id: id(10),
  account_id: id(1),
  facility_id: id(2),
  incident_id: null,
  title: "Synthetic request",
  original_wording: " Original ",
  original_issue_id: "water",
  original_intent_id: "assessment",
  classified_issue_id: "water",
  classified_intent_id: "assessment",
  catalogue_version: "2026-10-08.1",
  urgency: "routine",
  status: "submitted",
  revision: 1,
  assigned_to_profile_id: null,
  next_action: null,
  created_at: "2026-10-08T00:00:00Z",
  updated_at: "2026-10-08T00:00:00Z",
  can_triage: true,
  can_respond: false,
});
const mutation = (revision = 1) => ({
  request_id: id(10),
  revision,
  status: "submitted",
});
function setup(data, error = null, status = 200) {
  const calls = [];
  const api = new IntakeApi({
    rpc(name, args) {
      const call = { name, args, retry: null, signal: null };
      calls.push(call);
      return {
        retry(value) {
          call.retry = value;
          return this;
        },
        abortSignal(signal) {
          call.signal = signal;
          return this;
        },
        then(resolve, reject) {
          return Promise.resolve({ data, error, status }).then(resolve, reject);
        },
      };
    },
  });
  return { api, calls };
}

test("submission uses exact RPC arguments, immutable wording, stable supplied idempotency key and no implicit retries", async () => {
  const { api, calls } = setup(mutation());
  const submission = payload();
  const original = structuredClone(submission);
  const signal = new AbortController().signal;
  assert.deepEqual(
    await api.submit(id(1), id(2), id(3), submission, signal),
    mutation(),
  );
  await api.submit(id(1), id(2), id(3), submission);
  assert.deepEqual(calls[0].args, {
    p_account_id: id(1),
    p_facility_id: id(2),
    p_idempotency_key: id(3),
    p_submission: original,
  });
  assert.equal(calls[0].name, "submit_project_request");
  assert.equal(calls[0].signal, signal);
  assert.equal(calls[0].retry, false);
  assert.deepEqual(calls[1].args, calls[0].args);
  assert.deepEqual(submission, original);
});

test("optional new incident or existing incident is preserved without a mandatory program", () => {
  assert.doesNotThrow(() =>
    validateSubmission({
      ...payload(),
      new_incident: {
        title: "Synthetic event",
        occurred_at: "2026-10-08T10:00:00Z",
      },
    }),
  );
  assert.doesNotThrow(() =>
    validateSubmission({ ...payload(), incident_id: id(4) }),
  );
  assert.throws(
    () =>
      validateSubmission({
        ...payload(),
        incident_id: id(4),
        new_incident: { title: "Synthetic event" },
      }),
    /not both/,
  );
});

test("submission cannot report success with an unexpected approval or revision", async () => {
  for (const result of [
    { ...mutation(), status: "scheduling_released" },
    mutation(2),
  ])
    await assert.rejects(
      setup(result).api.submit(id(1), id(2), id(3), payload()),
      (error) => error.reason === "unexpected",
    );
});

test("submission rejects blank, overlong, invalid urgency, excessive safety and unsupported authority fields before RPC", async () => {
  const { api, calls } = setup(mutation());
  for (const changes of [
    { title: " " },
    { title: "x".repeat(161) },
    { original_wording: "x".repeat(8001) },
    { urgency: "mobilize" },
    { safety_flags: Array(21).fill("flag") },
    { safety_flags: ["x".repeat(201)] },
    { payer_note: "x".repeat(2001) },
    { approved: true },
    { new_incident: { title: "Event", actor: id(3) } },
  ]) {
    await assert.rejects(
      api.submit(id(1), id(2), id(3), { ...payload(), ...changes }),
      (error) => error instanceof IntakeError && error.reason === "validation",
    );
  }
  assert.equal(calls.length, 0);
});

test("catalogue preserves all server labels and versions without making scientific combinations", async () => {
  const catalogue = {
    version: "2026-10-08.1",
    issues: [
      { id: "water", label: "Water / Moisture" },
      { id: "unknown", label: "Help classify" },
    ],
    intents: [{ id: "assessment", label: "Assessment" }],
    statuses: ["submitted", "declined"],
  };
  const { api, calls } = setup(catalogue);
  assert.deepEqual(await api.catalogue(), catalogue);
  assert.equal(calls[0].name, "intake_catalogue");
});

test("queue maps authorized envelope and explicit UUID cursor without a count", async () => {
  const { api, calls } = setup({ items: [item()], next_cursor: id(10) });
  assert.deepEqual(
    await api.list({ accountId: id(1), limit: 1, status: "submitted" }),
    { items: [item()], nextCursor: id(10) },
  );
  assert.deepEqual(calls[0].args, {
    p_account_id: id(1),
    p_after_id: null,
    p_limit: 1,
    p_status: "submitted",
  });
});

test("queue rejects wrong-account rows, duplicate or out-of-order rows and invalid cursor", async () => {
  for (const data of [
    { items: [{ ...item(), account_id: id(99) }], next_cursor: null },
    { items: [item(), item()], next_cursor: null },
    { items: [item()], next_cursor: id(99) },
    { items: [], next_cursor: id(10) },
  ]) {
    await assert.rejects(
      setup(data).api.list({ accountId: id(1) }),
      (error) => error.reason === "unexpected",
    );
  }
});

test("queue validates account, cursor and bounded page size before transport", async () => {
  const { api, calls } = setup({ items: [], next_cursor: null });
  for (const args of [
    { accountId: "not-an-id" },
    { accountId: id(1), limit: 101 },
    { accountId: id(1), afterId: "bad" },
  ])
    await assert.rejects(api.list(args));
  assert.equal(calls.length, 0);
});

test("detail preserves original submission/responses and honestly supports legacy unknown classification", async () => {
  const detail = {
    ...item(),
    original_issue_id: null,
    original_intent_id: null,
    classified_issue_id: null,
    classified_intent_id: null,
    catalogue_version: "legacy-unversioned",
    original_submission: payload(),
    responses: [
      {
        id: id(40),
        body: " Synthetic response ",
        created_at: "2026-10-08T01:00:00Z",
      },
    ],
  };
  assert.deepEqual(await setup(detail).api.detail(id(10)), detail);
  assert.equal(await setup(null).api.detail(id(10)), null);
  await assert.rejects(setup({ ...detail, id: id(11) }).api.detail(id(10)));
  await assert.rejects(
    setup({ ...detail, can_triage: "true" }).api.detail(id(10)),
  );
});

test("legacy titles through 250 characters load in queue and detail without widening new submissions", async () => {
  for (const length of [161, 250]) {
    const legacy = {
      ...item(),
      title: "L".repeat(length),
      original_issue_id: null,
      original_intent_id: null,
      classified_issue_id: null,
      classified_intent_id: null,
      catalogue_version: "legacy-unversioned",
    };
    const queue = await setup({ items: [legacy], next_cursor: null }).api.list({ accountId: id(1) });
    assert.deepEqual(queue.items, [legacy]);
    const detail = { ...legacy, original_submission: { title: legacy.title }, responses: [] };
    assert.deepEqual(await setup(detail).api.detail(id(10)), detail);
    const { api, calls } = setup(mutation());
    await assert.rejects(api.submit(id(1), id(2), id(3), { ...payload(), title: legacy.title }), (error) => error.reason === "validation");
    assert.equal(calls.length, 0);
  }
  await assert.rejects(setup({ items: [{ ...item(), title: "L".repeat(251) }], next_cursor: null }).api.list({ accountId: id(1) }), (error) => error.reason === "unexpected");
});

test("legacy structural urgency displays as unknown while recorded urgency labels are unchanged", () => {
  assert.equal(intakeUrgencyLabel({ catalogue_version: "legacy-unversioned", urgency: "routine" }), "Not recorded");
  for (const [urgency, label] of [["routine", "Routine"], ["urgent", "Urgent"], ["emergency", "Emergency"]]) {
    assert.equal(intakeUrgencyLabel({ catalogue_version: "2026-10-08.1", urgency }), label);
  }
});

test("assignee query is exact-account and exact-facility and parses minimal returned profiles", async () => {
  const people = [{ profile_id: id(20), display_name: "Synthetic triager" }];
  const { api, calls } = setup(people);
  assert.deepEqual(await api.assignees(id(1), id(2)), people);
  assert.equal(calls[0].name, "list_intake_assignees");
  assert.deepEqual(calls[0].args, {
    p_account_id: id(1),
    p_facility_id: id(2),
  });
});

test("triage sends only explicit changes with expected revision and rejects original or actor mutations", async () => {
  const { api, calls } = setup(mutation(2));
  const changes = {
    assigned_to_profile_id: id(20),
    classified_issue_id: "water",
    status: "intake_completeness_review",
    next_action: "Synthetic review",
  };
  await api.triage(id(10), 1, changes);
  assert.equal(calls[0].name, "triage_project_request");
  assert.deepEqual(calls[0].args, {
    p_request_id: id(10),
    p_expected_revision: 1,
    p_changes: changes,
  });
  await assert.rejects(
    api.triage(id(10), 1, { original_wording: "overwrite" }),
  );
  await assert.rejects(api.triage(id(10), 1, {}));
  await assert.rejects(api.triage(id(10), 1, { actor_id: id(20) }));
  await assert.rejects(api.triage(id(10), 0, changes));
  assert.equal(calls.length, 1);
});

test("response is a separate append RPC with exact revision and unchanged narrative", async () => {
  const { api, calls } = setup(mutation(2));
  await api.respond(id(10), 1, " Exact synthetic response. ");
  assert.equal(calls[0].name, "respond_project_request");
  assert.deepEqual(calls[0].args, {
    p_request_id: id(10),
    p_expected_revision: 1,
    p_response: " Exact synthetic response. ",
  });
  await assert.rejects(api.respond(id(10), 1, " "));
  await assert.rejects(api.respond(id(10), 1, "x".repeat(8001)));
  assert.equal(calls.length, 1);
});

for (const [code, reason] of [
  ["22023", "validation"],
  ["42501", "unavailable"],
  ["40001", "conflict"],
  ["23505", "idempotency_conflict"],
])
  test(`SQLSTATE ${code} becomes a safe ${reason} message`, async () => {
    const { api } = setup(
      null,
      {
        code,
        message: "PRIVATE provider SQL detail",
        details: "PRIVATE payload",
      },
      400,
    );
    await assert.rejects(
      api.submit(id(1), id(2), id(3), payload()),
      (error) =>
        error instanceof IntakeError &&
        error.reason === reason &&
        !error.message.includes("PRIVATE"),
    );
  });

test("network and expired-session responses use safe existing runtime error semantics", async () => {
  await assert.rejects(
    setup(null, { message: "PRIVATE" }, 503).api.catalogue(),
    (error) =>
      error.code === "network" &&
      error.retryable &&
      !error.message.includes("PRIVATE"),
  );
  await assert.rejects(
    setup(null, { message: "PRIVATE" }, 401).api.catalogue(),
    (error) => error.code === "session_expired",
  );
});

test("already-aborted work never issues a request and in-flight abort cannot publish results", async () => {
  const controller = new AbortController();
  controller.abort();
  const { api, calls } = setup(mutation());
  await assert.rejects(
    api.submit(id(1), id(2), id(3), payload(), controller.signal),
    { name: "AbortError" },
  );
  assert.equal(calls.length, 0);
  const active = new AbortController();
  const result = api.submit(id(1), id(2), id(3), payload(), active.signal);
  active.abort();
  await assert.rejects(result, { name: "AbortError" });
});

test("transition hints never expose approval, mobilization, conversion or terminal reopening", () => {
  assert.deepEqual(INTAKE_TRANSITIONS.submitted, [
    "intake_completeness_review",
  ]);
  const destinations = Object.values(INTAKE_TRANSITIONS).flat();
  for (const forbidden of [
    "approved_for_agreement",
    "rom_preparation",
    "scheduling_released",
    "converted_to_project",
    "expired",
  ])
    assert.equal(destinations.includes(forbidden), false);
  for (const terminal of ["declined", "cancelled", "expired"])
    assert.equal(INTAKE_TRANSITIONS[terminal], undefined);
});
