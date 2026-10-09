import { expect, test, type Page, type Route } from "@playwright/test";

// Explicit browser_fixture evidence: real React + Supabase SDK, intercepted
// synthetic HTTP. No authentic login, RLS, hosted API, or tenancy claim.
const ORIGIN = "https://txofqxictwecgcnvezlb.supabase.co";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const accountA = {
  id: uuid(100),
  display_name: "Synthetic East account",
  is_demo: true,
};
const accountB = {
  id: uuid(200),
  display_name: "Synthetic West account",
  is_demo: true,
};
const facilityA = {
  id: uuid(1001),
  account_id: accountA.id,
  display_name: "Synthetic East facility",
  is_demo: true,
};
const profile = uuid(2);
const catalogue = {
  version: "2026-10-08.1",
  issues: [
    { id: "water", label: "Synthetic water concern" },
    { id: "unknown", label: "Synthetic classification needed" },
  ],
  intents: [
    { id: "assessment", label: "Synthetic assessment request" },
    { id: "advice", label: "Synthetic advice request" },
  ],
  statuses: [
    "submitted",
    "intake_completeness_review",
    "needs_client_information",
    "classification_review",
    "technical_review",
    "safety_review",
    "revision_proposed",
    "client_revision_pending",
    "declined",
    "cancelled",
  ],
};
const submission = () => ({
  title: "Synthetic moisture request",
  original_wording: "Original synthetic wording must remain unchanged.",
  issue_id: "water",
  intent_id: "assessment",
  urgency: "routine",
  affected_area: "Synthetic floor 2",
  site_contact: "Synthetic site liaison",
  access_notes: "",
  safety_flags: [],
  payer_note: "",
  signer_note: "",
});
function request(overrides: Record<string, unknown> = {}) {
  const original = submission();
  return {
    id: uuid(300),
    account_id: accountA.id,
    facility_id: facilityA.id,
    incident_id: null as string | null,
    title: original.title,
    original_wording: original.original_wording,
    original_issue_id: original.issue_id,
    original_intent_id: original.intent_id,
    classified_issue_id: original.issue_id,
    classified_intent_id: original.intent_id,
    catalogue_version: catalogue.version,
    urgency: "routine",
    status: "submitted",
    revision: 1,
    assigned_to_profile_id: null as string | null,
    next_action: null as string | null,
    created_at: "2026-10-08T00:00:00Z",
    updated_at: "2026-10-08T00:00:00Z",
    can_triage: true,
    can_respond: false,
    original_submission: original as Record<string, unknown>,
    responses: [] as { id: string; body: string; created_at: string }[],
    ...overrides,
  };
}
function gate() {
  let release!: () => void;
  let arrived!: () => void;
  return {
    ready: new Promise<void>((resolve) => {
      arrived = resolve;
    }),
    wait: new Promise<void>((resolve) => {
      release = resolve;
    }),
    release: () => release(),
    arrived: () => arrived(),
  };
}

async function fixture(page: Page) {
  const user = {
    id: uuid(1),
    aud: "authenticated",
    role: "authenticated",
    email: "intake-fixture@example.invalid",
    email_confirmed_at: "2026-10-08T00:00:00Z",
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-10-08T00:00:00Z",
    is_anonymous: false,
  };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, role: "authenticated", is_anonymous: false, exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`;
  const state = {
    rows: [] as ReturnType<typeof request>[],
    calls: [] as { name: string; args: Record<string, any> }[],
    unexpected: [] as string[],
    failSubmission: false,
    failQueue: false,
    conflictTriage: false,
    denyTriage: false,
    detailUnavailable: false,
    failResponse: false,
    listGate: null as ReturnType<typeof gate> | null,
    submitGate: null as ReturnType<typeof gate> | null,
    submitted: new Map<
      string,
      { request_id: string; revision: number; status: string }
    >(),
  };
  const json = (route: Route, data: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/auth/v1/token")
      return json(route, {
        access_token: token,
        refresh_token: "synthetic-intake-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user,
      });
    if (url.pathname === "/auth/v1/user") return json(route, user);
    if (url.pathname === "/auth/v1/logout") return json(route, {});
    if (url.pathname === "/rest/v1/user_profiles")
      return json(route, [
        {
          id: profile,
          display_name: "Synthetic operator",
          identity_status: "active",
          is_demo: true,
        },
      ]);
    if (url.pathname === "/rest/v1/client_accounts")
      return json(route, [accountA, accountB]);
    if (url.pathname === "/rest/v1/facilities")
      return json(
        route,
        url.searchParams.get("account_id") === `eq.${accountA.id}`
          ? [facilityA]
          : [],
      );
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const name = url.pathname.split("/").at(-1)!;
      const args = route.request().postDataJSON() as Record<string, any>;
      state.calls.push({ name, args });
      if (name === "intake_catalogue") return json(route, catalogue);
      if (name === "list_project_requests") {
        if (state.failQueue)
          return json(route, { message: "PRIVATE SQL table and payload" }, 503);
        const rows = state.rows.filter(
          (row) =>
            row.account_id === args.p_account_id &&
            (!args.p_status || row.status === args.p_status) &&
            (!args.p_after_id || row.id > args.p_after_id),
        );
        if (state.listGate && args.p_account_id === accountA.id) {
          state.listGate.arrived();
          await state.listGate.wait;
        }
        return json(route, {
          items: rows.slice(0, args.p_limit),
          next_cursor:
            rows.length > args.p_limit ? rows[args.p_limit - 1].id : null,
        });
      }
      if (name === "get_project_request")
        return json(
          route,
          state.detailUnavailable
            ? null
            : (state.rows.find((row) => row.id === args.p_request_id) ?? null),
        );
      if (name === "list_intake_assignees") {
        expect(args).toEqual({
          p_account_id: accountA.id,
          p_facility_id: facilityA.id,
        });
        return json(route, [
          { profile_id: profile, display_name: "Synthetic triager" },
        ]);
      }
      if (name === "submit_project_request") {
        if (state.submitGate) {
          state.submitGate.arrived();
          await state.submitGate.wait;
        }
        let result = state.submitted.get(args.p_idempotency_key);
        if (!result) {
          const row = request({
            id: uuid(301),
            title: args.p_submission.title,
            original_wording: args.p_submission.original_wording,
            original_submission: args.p_submission,
            original_issue_id: args.p_submission.issue_id,
            original_intent_id: args.p_submission.intent_id,
            classified_issue_id: args.p_submission.issue_id,
            classified_intent_id: args.p_submission.intent_id,
            urgency: args.p_submission.urgency,
            incident_id: args.p_submission.new_incident
              ? uuid(500)
              : (args.p_submission.incident_id ?? null),
            can_triage: false,
          });
          state.rows.push(row);
          result = { request_id: row.id, revision: 1, status: "submitted" };
          state.submitted.set(args.p_idempotency_key, result);
        }
        if (state.failSubmission)
          return json(
            route,
            { message: "PRIVATE connection interrupted after commit" },
            503,
          );
        return json(route, result);
      }
      if (name === "triage_project_request") {
        const row = state.rows.find((row) => row.id === args.p_request_id)!;
        if (state.denyTriage)
          return json(
            route,
            { code: "42501", message: "PRIVATE entitlement details" },
            403,
          );
        if (state.conflictTriage) {
          state.conflictTriage = false;
          row.revision += 1;
          row.next_action = "Another synthetic reviewer updated this.";
          return json(
            route,
            { code: "40001", message: "PRIVATE stale record" },
            409,
          );
        }
        expect(args.p_expected_revision).toBe(row.revision);
        Object.assign(row, args.p_changes);
        row.revision += 1;
        return json(route, {
          request_id: row.id,
          revision: row.revision,
          status: row.status,
        });
      }
      if (name === "respond_project_request") {
        const row = state.rows.find((row) => row.id === args.p_request_id)!;
        expect(args.p_expected_revision).toBe(row.revision);
        row.responses.push({
          id: uuid(600),
          body: args.p_response,
          created_at: "2026-10-08T02:00:00Z",
        });
        row.revision += 1;
        row.status = "intake_completeness_review";
        row.can_respond = false;
        if (state.failResponse)
          return json(
            route,
            { message: "PRIVATE interrupted after append" },
            503,
          );
        return json(route, {
          request_id: row.id,
          revision: row.revision,
          status: row.status,
        });
      }
    }
    state.unexpected.push(`${route.request().method()} ${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  // Never permit an unexpected request or fallback to reach a cloud service.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN) return route.fallback();
    if (url.hostname === "127.0.0.1") return route.continue();
    state.unexpected.push(`external ${url.origin}`);
    return route.abort("blockedbyclient");
  });
  return state;
}

async function openIntake(page: Page) {
  await page.goto("/intake");
  await page
    .getByLabel("Email", { exact: true })
    .fill("intake-fixture@example.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Intake", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Account", { exact: true }).selectOption(accountA.id);
}
async function fillSubmission(page: Page) {
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page.getByLabel("Facility", { exact: true }).selectOption(facilityA.id);
  await page
    .getByLabel("Request title", { exact: true })
    .fill("Synthetic retry-safe request");
  await page
    .getByLabel("Original request wording", { exact: true })
    .fill(" Exact original synthetic text. ");
  await page.getByLabel("Issue", { exact: true }).selectOption("water");
  await page.getByLabel("Intent", { exact: true }).selectOption("assessment");
}

test("fixture intake: submission validates, preserves incident and exact payload, retries a lost acknowledgement without duplication", async ({
  page,
}, testInfo) => {
  const backend = await fixture(page);
  backend.failSubmission = true;
  await openIntake(page);
  await expect(
    page.getByRole("heading", { name: "No requests available" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New request", exact: true }).click();
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  expect(
    backend.calls.filter((call) => call.name === "submit_project_request"),
  ).toHaveLength(0);
  await fillSubmission(page);
  await page.getByLabel("Urgency", { exact: true }).selectOption("emergency");
  await expect(
    page.getByText("Follow your emergency and facility protocols", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByText("Optional incident context", { exact: true }).click();
  await page
    .getByLabel("Incident context", { exact: true })
    .selectOption("new");
  await page
    .getByLabel("Incident title", { exact: true })
    .fill("Synthetic event context");
  await page
    .getByLabel("Safety flags", { exact: true })
    .fill("Synthetic access uncertainty\nSynthetic electrical concern");
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    "exact submission is held in memory",
  );
  await expect(page.getByRole("alert")).not.toContainText("PRIVATE");
  await expect(
    page.getByLabel("Request title", { exact: true }),
  ).toBeDisabled();
  expect(backend.rows).toHaveLength(1);
  backend.failSubmission = false;
  await page.getByRole("button", { name: "Retry same submission" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Synthetic retry-safe request",
      exact: true,
    }),
  ).toBeVisible();
  const calls = backend.calls.filter(
    (call) => call.name === "submit_project_request",
  );
  expect(calls).toHaveLength(2);
  expect(calls[1].args).toEqual(calls[0].args);
  expect(calls[0].args.p_submission.original_wording).toBe(
    " Exact original synthetic text. ",
  );
  expect(calls[0].args.p_submission.new_incident.title).toBe(
    "Synthetic event context",
  );
  expect(backend.rows).toHaveLength(1);
  await expect(
    page.getByRole("heading", { name: "Original submission (read-only)" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      [...Object.values(localStorage), ...Object.values(sessionStorage)].some(
        (value) =>
          /Exact original synthetic text|retry-safe request|event context/.test(
            value,
          ),
      ),
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("intake-desktop-fixture.png"),
    fullPage: true,
  });
  expect(backend.unexpected).toEqual([]);
});

test("fixture intake: current-facility assignee, reclassification and permitted triage keep original submission intact", async ({
  page,
}) => {
  const backend = await fixture(page);
  backend.rows = [request()];
  await openIntake(page);
  await page
    .getByRole("button", { name: "Synthetic moisture request", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Internal triage" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Request status", { exact: true }).locator("option"),
  ).toHaveText(["Submitted (current)", "Intake completeness review"]);
  await page.getByLabel("Assignee", { exact: true }).selectOption(profile);
  await page
    .getByLabel("Current issue", { exact: true })
    .selectOption("unknown");
  await page
    .getByLabel("Current intent", { exact: true })
    .selectOption("advice");
  await page
    .getByLabel("Request status", { exact: true })
    .selectOption("intake_completeness_review");
  await page
    .getByLabel("Next action", { exact: true })
    .fill("Synthetic reviewer to check site context.");
  await page.getByRole("button", { name: "Save triage" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Triage changes saved" }),
  ).toBeVisible();
  await expect(
    page.getByText("Original synthetic wording must remain unchanged.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(backend.rows[0].original_submission).toEqual(submission());
  expect(backend.rows[0].revision).toBe(2);
  expect(
    backend.calls.find((call) => call.name === "triage_project_request")!.args
      .p_changes,
  ).toEqual({
    assigned_to_profile_id: profile,
    classified_issue_id: "unknown",
    classified_intent_id: "advice",
    status: "intake_completeness_review",
    next_action: "Synthetic reviewer to check site context.",
  });
  expect(backend.unexpected).toEqual([]);
});

test("fixture intake: needs-information validation and conflict reload preserve draft for deliberate latest-revision save", async ({
  page,
}) => {
  const backend = await fixture(page);
  backend.rows = [
    request({ status: "intake_completeness_review", revision: 2 }),
  ];
  backend.conflictTriage = true;
  await openIntake(page);
  await page
    .getByRole("button", { name: "Synthetic moisture request", exact: true })
    .click();
  await page
    .getByLabel("Request status", { exact: true })
    .selectOption("needs_client_information");
  await page.getByRole("button", { name: "Save triage" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "requires an assignee and a next action",
  );
  expect(
    backend.calls.filter((call) => call.name === "triage_project_request"),
  ).toHaveLength(0);
  await page.getByLabel("Assignee", { exact: true }).selectOption(profile);
  await page
    .getByLabel("Next action", { exact: true })
    .fill("Please append synthetic access information.");
  await page.getByRole("button", { name: "Save triage" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "changed after you opened it",
  );
  await expect(page.getByRole("button", { name: "Save triage" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Load latest revision" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Your draft is retained" }),
  ).toBeVisible();
  await expect(page.getByLabel("Next action", { exact: true })).toHaveValue(
    "Please append synthetic access information.",
  );
  await expect(
    page
      .locator(".intake-next-action")
      .filter({ hasText: "Another synthetic reviewer updated this." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save triage" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Triage changes saved" }),
  ).toBeVisible();
  expect(
    backend.calls
      .filter((call) => call.name === "triage_project_request")
      .map((call) => call.args.p_expected_revision),
  ).toEqual([2, 3]);
  expect(backend.unexpected).toEqual([]);
});

test("fixture intake: submitter response appends once and unconfirmed append requires reload instead of duplicate retry", async ({
  page,
}) => {
  const backend = await fixture(page);
  backend.rows = [
    request({
      status: "needs_client_information",
      revision: 3,
      can_triage: false,
      can_respond: true,
      assigned_to_profile_id: profile,
      next_action: "Please provide synthetic access information.",
    }),
  ];
  backend.failResponse = true;
  await openIntake(page);
  await page
    .getByRole("button", { name: "Synthetic moisture request", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Internal triage" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Response", { exact: true })
    .fill("Synthetic access is via the north entrance.");
  await page.getByRole("button", { name: "Append response" }).click();
  await expect(page.getByRole("alert")).toContainText("could not be reached");
  await expect(page.getByLabel("Response", { exact: true })).toHaveValue(
    "Synthetic access is via the north entrance.",
  );
  await expect(
    page.getByRole("button", { name: "Append response" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Load latest revision" }).click();
  await expect(
    page.getByText("Synthetic access is via the north entrance.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Response", { exact: true })).toHaveCount(0);
  expect(backend.rows[0].responses).toHaveLength(1);
  expect(backend.rows[0].original_submission).toEqual(submission());
  expect(
    backend.calls.filter((call) => call.name === "respond_project_request"),
  ).toHaveLength(1);
  expect(backend.unexpected).toEqual([]);
});

test("fixture intake: queue retry, loading, account-switch race and unavailable detail never show stale scoped rows", async ({
  page,
}) => {
  const backend = await fixture(page);
  backend.rows = [request()];
  backend.failQueue = true;
  await openIntake(page);
  await expect(page.getByRole("alert")).toContainText("could not be reached");
  backend.failQueue = false;
  backend.listGate = gate();
  await page.getByRole("button", { name: "Try again" }).click();
  await backend.listGate.ready;
  await expect(page.getByRole("status")).toContainText("Loading requests");
  await page.getByLabel("Account", { exact: true }).selectOption(accountB.id);
  await expect(
    page.getByRole("heading", { name: "No requests available" }),
  ).toBeVisible();
  backend.listGate.release();
  backend.listGate = null;
  await expect(
    page.getByRole("button", {
      name: "Synthetic moisture request",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByLabel("Account", { exact: true }).selectOption(accountA.id);
  backend.detailUnavailable = true;
  await page
    .getByRole("button", { name: "Synthetic moisture request", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Request unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText(submission().original_wording, { exact: true }),
  ).toHaveCount(0);
  expect(backend.unexpected).toEqual([]);
});

test("fixture intake: revoked triage hides detail and terminal records expose no reopening or authority controls", async ({
  page,
}) => {
  const backend = await fixture(page);
  backend.rows = [request()];
  backend.denyTriage = true;
  await openIntake(page);
  await page
    .getByRole("button", { name: "Synthetic moisture request", exact: true })
    .click();
  await page
    .getByLabel("Next action", { exact: true })
    .fill("Synthetic review");
  await page.getByRole("button", { name: "Save triage" }).click();
  await expect(
    page.getByRole("heading", { name: "Request unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText(submission().original_wording, { exact: true }),
  ).toHaveCount(0);
  backend.denyTriage = false;
  backend.rows[0].status = "declined";
  await page.getByRole("button", { name: "Back to queue" }).click();
  await page
    .getByRole("button", { name: "Synthetic moisture request", exact: true })
    .click();
  await expect(
    page.getByText("Terminal requests cannot be reopened here.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save triage" })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Request status", { exact: true })).toHaveCount(
    0,
  );
  expect(backend.unexpected).toEqual([]);
});

test("fixture intake: legacy urgency is not recorded in queue and detail", async ({ page }) => {
  const backend = await fixture(page);
  backend.rows = [request({ catalogue_version: "legacy-unversioned", urgency: "routine", can_triage: false, original_issue_id: null, original_intent_id: null, classified_issue_id: null, classified_intent_id: null })];
  await openIntake(page);
  await expect(page.locator(".intake-queue-meta dt").filter({ hasText: /^Urgency$/ }).locator("..").locator("dd")).toHaveText("Not recorded");
  await page.getByRole("button", { name: "Synthetic moisture request", exact: true }).click();
  await expect(page.locator(".intake-facts dt").filter({ hasText: /^Urgency$/ }).locator("..").locator("dd")).toHaveText("Not recorded");
  expect(backend.unexpected).toEqual([]);
});

test("fixture intake: phone layout, keyboard submission, pending duplicate prevention and sign-out clearing", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const backend = await fixture(page);
  backend.submitGate = gate();
  await openIntake(page);
  await fillSubmission(page);
  await page.getByLabel("Request title", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByLabel("Original request wording", { exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("intake-phone-fixture.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await backend.submitGate.ready;
  await expect(
    page.getByRole("button", { name: "Submitting…" }),
  ).toBeDisabled();
  await page.keyboard.press("Enter");
  expect(
    backend.calls.filter((call) => call.name === "submit_project_request"),
  ).toHaveLength(1);
  backend.submitGate.release();
  await expect(
    page.getByRole("heading", {
      name: "Synthetic retry-safe request",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Exact original synthetic text.", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      [...Object.values(localStorage), ...Object.values(sessionStorage)].some(
        (value) =>
          /retry-safe request|Exact original synthetic text/.test(value),
      ),
    ),
  ).toBe(false);
  expect(backend.unexpected).toEqual([]);
});
