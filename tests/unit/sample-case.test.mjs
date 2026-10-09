import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Checks that every "Load sample example" fill passes the final server bounds
// mirrored in the client validator, for every screen and exact field label.
const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const load = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const errorsUrl = moduleUrl(await load("../../web/src/lib/errors.ts"));
const api = await import(moduleUrl((await load("../../web/src/lib/workspace-plan-api.ts")).replace(/from\s+["']\.\/errors["']/, `from '${errorsUrl}'`)));
const sample = await import(moduleUrl(await load("../../web/src/lib/sample-case.ts")));
const { moduleScreens } = await import(moduleUrl(await load("../../web/src/pages/module-screen-definitions.ts")));

const spec = (f) => ({ kind: f.kind ?? "text", options: f.options });
test("sample examples satisfy server bounds for every screen", () => {
  for (const [module, screens] of Object.entries(moduleScreens)) screens.forEach((screen, index) => {
    if (!screen.fields.length) return;
    const values = Object.fromEntries(screen.fields.map((f) => [f.label, spec(f)]));
    if (screen.checks) values["Review notes"] = { kind: "multiline" };
    const schema = { values, rows: Object.fromEntries((screen.repeat?.fields ?? []).map((f) => [f.label, spec(f)])), checks: screen.checks ?? [] };
    const content = {
      title: sample.sampleTitle(screen.title),
      values: Object.fromEntries([...screen.fields, ...(screen.checks ? [{ label: "Review notes", kind: "multiline" }] : [])].map((f) => [f.label, sample.sampleValue(f)])),
      rows: screen.repeat ? sample.sampleRows(screen.repeat.fields) : [], checks: {},
    };
    assert.doesNotThrow(() => api.validateContent(content, schema), `${module} ${index}`);
  });
});

test("sample references are plain SAMPLE identifiers, not UUIDs or links", () => {
  for (const ref of Object.values(sample.SAMPLE_CASE.refs)) assert.match(ref, /^SAMPLE-[A-Z]+-\d{2}$/);
});

test("readiness site passport uses the approved Facility coordinator key", () => {
  const labels = moduleScreens.readiness[0].fields.map((f) => f.label);
  assert.ok(labels.includes("Facility coordinator"));
  assert.ok(!labels.includes("Site champion"));
});
