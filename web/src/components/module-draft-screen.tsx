import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CalendarDays, CheckSquare, Clock3, Eye, FileText, FolderOpen, LoaderCircle, LockKeyhole, MessageSquare, Plus, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react';
import { Button } from './button';
import type { DraftField, ScreenDefinition } from '../pages/module-screen-definitions';
import { useWorkspacePlans } from '../lib/use-workspace-plans';
import { buildSaveRequest, panelKeyFor, PlanError, PLAN_MODULE_KEYS, type PlanSaveRequest, type PlanFieldSpec, type PlanSchema, type PlanScope, type WorkspacePlan } from '../lib/workspace-plan-api';
import type { RuntimeError } from '../lib/errors';
import { sampleRows, sampleTitle, sampleValue } from '../lib/sample-case';
import { SampleCaseTag } from './sample-case';

type Values = Record<string, string>;
type DraftRow = { id: number; values: Values };
export type PlanContext = { accountId: string; facilityId: string } | null;

const REVIEW_LABELS = ['Current revision notes', 'Proposed revision notes'];
/** Exact payload labels a screen may persist. Calendar month and screen names are never included. */
const spec = (field: DraftField): PlanFieldSpec => ({ kind: field.kind ?? 'text', options: field.options });
export function planSchema(definition: ScreenDefinition): PlanSchema {
 const values: Record<string, PlanFieldSpec> = Object.fromEntries(definition.fields.map(field => [field.label, spec(field)]));
 if (definition.pattern === 'review') for (const label of REVIEW_LABELS) values[label] = { kind: 'multiline' };
 if (definition.checks) values['Review notes'] = { kind: 'multiline' };
 return { values, rows: Object.fromEntries((definition.repeat?.fields ?? []).map(field => [field.label, spec(field)])), checks: definition.checks ?? [] };
}
export function isSavablePanel(moduleKey: string | undefined, definition: ScreenDefinition) {
 return !!moduleKey && (PLAN_MODULE_KEYS as readonly string[]).includes(moduleKey) && definition.pattern !== 'history' && definition.pattern !== 'integration' && definition.fields.length > 0;
}

function Field({ field, value, onChange, prefix }: { field: DraftField; value: string; onChange: (value: string) => void; prefix: string }) {
 const id = `${prefix}-${field.label.replace(/[^a-z0-9]/gi, '-')}`;
 const props = { id, value, autoComplete: "off", spellCheck: false, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value) };
 return <div className={`field ${field.kind === 'multiline' ? 'field-wide' : ''}`}><label htmlFor={id}>{field.label}</label>{field.kind === 'multiline' ? <textarea {...props} rows={4} /> : field.kind === 'select' ? <select {...props}><option value="">Choose an option</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select> : <input {...props} type={field.kind === 'date' ? 'date' : field.kind === 'money' || field.kind === 'quantity' ? 'number' : 'text'} step={field.kind === 'money' ? '0.01' : field.kind === 'quantity' ? 'any' : undefined} />}</div>;
}
function DraftPreview({ title, values, rows, definition, savedRevision }: { title: string; values: Values; rows: DraftRow[]; definition: ScreenDefinition; savedRevision: number | null }) {
 const filled = Object.entries(values).filter(([,value]) => value.trim());
 return <section className="draft-preview" aria-label="Draft preview"><div className="section-intro"><h3>{title.trim() || 'Draft preview'}</h3><span className="status-label">{savedRevision ? `Personal planning draft · revision ${savedRevision}` : 'Unsaved'}</span></div>{filled.length === 0 && rows.length === 0 ? <p>No draft details entered.</p> : <><dl>{filled.map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{rows.length > 0 && <><h4>{definition.repeat?.label}</h4>{rows.map((row,index) => <dl key={row.id}><dt>Item {index + 1}</dt><dd>{Object.entries(row.values).filter(([,v]) => v.trim()).map(([k,v]) => `${k}: ${v}`).join(' · ') || 'No details entered'}</dd></dl>)}</>}</> }<p className="field-hint">Planning notes only. Nothing has been submitted, approved, scheduled or sent. References you enter are unverified.</p></section>;
}

export function ModuleDraftScreen({ definition, open = false, moduleKey, index = 0, context = null }: { definition: ScreenDefinition; open?: boolean; moduleKey?: string; index?: number; context?: PlanContext }) {
 const savable = isSavablePanel(moduleKey, definition);
 const schema = useMemo(() => planSchema(definition), [definition]);
 const scope = savable && context && moduleKey ? { accountId: context.accountId, facilityId: context.facilityId, moduleKey, panelKey: panelKeyFor(moduleKey, index) } : null;
 const plans = useWorkspacePlans(scope, schema);
 if (definition.pattern === 'integration') return <IntegrationStatus title={definition.title} />;
 if (definition.pattern === 'history') return <HistoryPanel title={definition.title} />;
 // Remount on account/facility/module/panel/session change: old content never shows in a new scope.
 return <DraftBody key={plans.key} definition={definition} open={open} savable={savable} scope={scope} schema={schema} plans={plans} />;
}

/**
 * - uncertain: network/server/malformed outcome. The save may have committed, so the
 *   exact frozen request is the only thing that may be resent; the editor stays locked.
 * - invalid: definitive input rejection; nothing committed, editing resumes with fresh intent.
 * - conflict: definitive revision conflict.
 */
type SaveState = { status: 'idle' } | { status: 'saving'; request: PlanSaveRequest } | { status: 'uncertain' | 'conflict'; request: PlanSaveRequest; error: RuntimeError } | { status: 'invalid'; error: RuntimeError };
const isDefinitiveRejection = (error: RuntimeError) => error instanceof PlanError && (error.planCode === 'validation' || error.planCode === 'unavailable' || error.planCode === 'not_available');

function DraftBody({ definition, open, savable, scope, schema, plans }: { definition: ScreenDefinition; open: boolean; savable: boolean; scope: PlanScope | null; schema: PlanSchema; plans: ReturnType<typeof useWorkspacePlans> }) {
 const id = useId();
 const scoped = scope !== null;
 const [started, setStarted] = useState(false);
 const [title, setTitle] = useState('');
 const [values, setValues] = useState<Values>({});
 const [rows, setRows] = useState<DraftRow[]>([]);
 const [nextId, setNextId] = useState(1);
 const [checks, setChecks] = useState<Record<string,boolean>>({});
 const [preview, setPreview] = useState(false);
 const [discarding, setDiscarding] = useState(false);
 const [pendingOpen, setPendingOpen] = useState<string | null>(null);
 const [message, setMessage] = useState('');
 const [month, setMonth] = useState('');
 const [dirty, setDirty] = useState(false);
 const [current, setCurrent] = useState<{ id: string; revision: number } | null>(null);
 const [save, setSave] = useState<SaveState>({ status: 'idle' });
 const [loadError, setLoadError] = useState('');
 const [refreshFailed, setRefreshFailed] = useState<string | null>(null);
 /** Pending read (open, readback or recheck). Edits are locked so a response cannot erase new typing. */
 const [reading, setReading] = useState(false);
 const [fromSample, setFromSample] = useState(false);
 const operation = useRef(0);
 const currentRef = useRef(current);
 currentRef.current = current;
 const isOpen = open || started || current !== null;
 /** Any pending/unresolved operation. A failed post-save readback stays locked until the same plan reloads. */
 const locked = reading || save.status === 'saving' || save.status === 'uncertain' || save.status === 'conflict' || refreshFailed !== null;
 useEffect(() => {
  if (!dirty) return;
  const warn = (event: BeforeUnloadEvent) => {event.preventDefault();event.returnValue = '';};
  window.addEventListener('beforeunload', warn);
  return () => window.removeEventListener('beforeunload', warn);
 }, [dirty]);
 const touch = () => { setDirty(true); setMessage(''); };
 const update = (label: string, value: string) => { setValues(old => ({...old,[label]:value})); touch(); };
 const clear = () => { operation.current++; setReading(false); setPendingOpen(null); setLoadError(''); setRefreshFailed(null); setFromSample(false); setTitle('');setValues({});setRows([]);setChecks({});setPreview(false);setDiscarding(false);setMonth('');setDirty(false);setCurrent(null);setSave({status:'idle'}); };
 const reset = () => { if (locked) return; clear(); setStarted(false); setMessage('Draft discarded.'); };
 const apply = (plan: WorkspacePlan) => {
  const known = currentRef.current;
  if (known && known.id === plan.id && known.revision > plan.revision) return;
  currentRef.current = { id: plan.id, revision: plan.revision };
  let n = 1;
  setTitle(plan.title); setValues({...plan.values}); setChecks({...plan.checks});
  setRows(plan.rows.map(row => ({ id: n++, values: {...row} }))); setNextId(n);
  setCurrent({ id: plan.id, revision: plan.revision }); setDirty(false); setStarted(true); setSave({status:'idle'});
 };
 const loadSample = () => {
  if (locked) return;
  setTitle(sampleTitle(definition.title));
  setValues(Object.fromEntries([...definition.fields, ...(definition.checks ? [{ label: 'Review notes', kind: 'multiline' as const }] : [])].map(field => [field.label, sampleValue(field)])));
  if (definition.repeat) { const sampled = sampleRows(definition.repeat.fields); setRows(sampled.map((values, n) => ({ id: nextId + n, values }))); setNextId(nextId + sampled.length); }
  setFromSample(true); setDirty(true); setStarted(true); setMessage('Sample example loaded from the fictional Harbour Point case. It is unsaved; saving makes it your own planning draft.');
 };
 /** One read at a time; a newer operation fences any older response out. */
 const read = async (planId: string) => {
  const ticket = ++operation.current;
  setReading(true);
  const result = await plans.open(planId);
  if (ticket !== operation.current) return null;
  setReading(false);
  return result;
 };
 const openPlan = async (planId: string) => {
  if (locked) return;
  setPendingOpen(null); setDiscarding(false); setLoadError(''); setMessage('Opening your planning draft…');
  const result = await read(planId);
  if (!result) return;
  if (result.ok) { currentRef.current = null; apply(result.plan); setMessage(`Opened your planning draft · revision ${result.plan.revision}`); }
  else { setMessage(''); setLoadError(result.error.message); }
 };
 /** Sends exactly the given frozen request. Never retried automatically. */
 const send = async (request: PlanSaveRequest) => {
  if (reading || save.status === 'saving') return;
  const ticket = ++operation.current;
  setDiscarding(false); setPendingOpen(null); setLoadError('');
  setSave({ status: 'saving', request }); setMessage('Saving planning draft…');
  const result = await plans.save(request);
  if (!result || ticket !== operation.current) return;
  if (result.ok) {
   // A retry may return its original (older) revision; apply() never downgrades.
   setSave({ status: 'idle' }); apply(result.plan); setMessage(`Saved personal planning draft · revision ${result.plan.revision}`);
   await refreshSaved(result.plan.id, result.plan.revision);
   return;
  }
  setMessage('');
  if (result.error instanceof PlanError && result.error.planCode === 'conflict') setSave({ status: 'conflict', request, error: result.error });
  else if (isDefinitiveRejection(result.error)) setSave({ status: 'invalid', error: result.error });
  else setSave({ status: 'uncertain', request, error: result.error });
 };
 /** Confirmed saves refresh from get_workspace_plan; a refresh failure never reports the save as lost. */
 const refreshSaved = async (planId: string, savedRevision: number) => {
  setRefreshFailed(null);
  const ticket = ++operation.current;
  setReading(true);
  const fresh = await plans.refresh(planId);
  if (ticket !== operation.current) return;
  setReading(false);
  if (!fresh) return;
  if (fresh.ok) { if (fresh.plan.revision >= savedRevision) apply(fresh.plan); setMessage(`Showing the latest saved copy · revision ${Math.max(fresh.plan.revision, currentRef.current?.revision ?? 0)}`); return; }
  setRefreshFailed(planId);
 };
 const startSave = () => {
  if (!scope || locked) return;
  try {
   const request = buildSaveRequest(scope, schema,
    { title, values: Object.fromEntries(Object.entries(values).filter(([key]) => Object.prototype.hasOwnProperty.call(schema.values, key))), rows: rows.map(row => ({...row.values})), checks }, current ?? undefined);
   void send(request);
  } catch (error) { setSave({ status: 'idle' }); setMessage(error instanceof Error ? error.message : 'Check the planning draft and try again.'); }
 };
 const savedRevision = current && !dirty ? current.revision : null;
 const status = reading ? 'Loading saved copy…' : save.status === 'uncertain' ? 'Save outcome unconfirmed' : save.status === 'saving' ? 'Saving…' : savedRevision ? `Saved personal planning draft · revision ${savedRevision}` : current ? `Unsaved changes · revision ${current.revision}` : 'Unsaved draft';
 return <section className={`draft-screen pattern-${definition.pattern}`} aria-labelledby={`${id}-title`}>
  <div className="section-intro"><div><p className="entity-type">{definition.pattern === 'review' ? 'Revision review' : definition.pattern === 'schedule' ? 'Planning' : definition.pattern === 'audit' ? 'Permitted inspection' : 'Preparation'}</p><h2 id={`${id}-title`}>{definition.title}</h2></div><div className="draft-header-actions">{<Button variant="text-button" disabled={locked} onClick={loadSample}><Sparkles size={16} />Load sample example</Button>}{!isOpen && <Button variant="primary" disabled={locked} onClick={() => {setStarted(true);setMessage(definition.pattern === 'audit' ? 'Search filters opened. No search has been run.' : 'Unsaved draft opened.');}}><Plus size={16} />{definition.pattern === 'audit' ? 'Prepare filters' : definition.pattern === 'review' ? 'Prepare review notes' : 'Prepare draft'}</Button>}</div></div>
  {savable && scoped && <SavedPlans plans={plans} currentId={current?.id} disabled={locked} onOpen={planId => { if (locked) return; if (dirty) setPendingOpen(planId); else void openPlan(planId); }} onNew={() => { if (locked) return; if (dirty) setDiscarding(true); else { clear(); setStarted(true); setMessage('New planning draft opened.'); } }} />}
  {loadError && <p className="inline-error" role="alert">{loadError}</p>}
  {pendingOpen && <div className="discard-confirmation" role="alert"><p>Open your saved draft and discard your unsaved changes?</p><Button disabled={locked} onClick={() => void openPlan(pendingOpen)}>Discard and open</Button><Button variant="text-button" disabled={locked} onClick={() => setPendingOpen(null)}>Keep editing</Button></div>}
  {!isOpen ? <div className="draft-start"><FileText size={32} /><div><h3>{definition.pattern === 'audit' ? 'Prepare a search' : 'Start with an unsaved draft'}</h3><p>{definition.pattern === 'review' ? 'Identify the exact revision and prepare review notes.' : definition.pattern === 'schedule' ? 'Arrange work and dates before scheduling.' : definition.pattern === 'report' ? 'Define the reporting period and source basis.' : definition.pattern === 'conversation' ? 'Prepare wording and recipients without sending.' : 'Enter details for review before saving.'}</p></div></div> : <>
   <div className="draft-state"><span className="status-label">{status}</span>{fromSample && <SampleCaseTag />}<p>{savable ? (scoped ? 'Personal planning draft for the selected development facility. Only you can see it; it is not shared with teammates.' : 'Choose a development account and facility above to save. No personal health information.') : 'Unsaved; leaving this module discards the draft. No sensitive or personal health information.'}</p></div>
   <form onSubmit={event => {event.preventDefault();setPreview(true);setMessage('Draft preview ready. Nothing has been submitted.');}}>
    <fieldset className="draft-fieldset" disabled={locked}>
    {savable && <div className="draft-fields"><div className="field field-wide"><label htmlFor={`${id}-plan-title`}>Planning draft title</label><input id={`${id}-plan-title`} aria-describedby={`${id}-plan-rules`} value={title} maxLength={120} autoComplete="off" onChange={event => {setTitle(event.target.value);touch();}} /><p id={`${id}-plan-rules`} className="field-hint">Notes only: links, files, passwords, keys and personal health information are not accepted.</p></div></div>}
    <div className="draft-fields">{definition.fields.map(field => <Field key={field.label} prefix={id} field={field} value={values[field.label] ?? ''} onChange={value => update(field.label,value)} />)}</div>
    {definition.repeat && <section className="repeat-section"><div className="section-intro"><h3>{definition.repeat.label}</h3><Button type="button" onClick={() => {setRows(old => [...old,{id:nextId,values:{}}]);setNextId(old => old+1);touch();}}><Plus size={16} />Add item</Button></div>{rows.length === 0 && <p className="field-hint">No draft items added.</p>}{rows.map((row,index) => <fieldset className="repeat-row" key={row.id}><legend>Item {index+1}</legend><div className="draft-fields">{definition.repeat?.fields.map(field => <Field key={field.label} prefix={`${id}-${row.id}`} field={field} value={row.values[field.label] ?? ''} onChange={value => {setRows(old => old.map(item => item.id === row.id ? {...item,values:{...item.values,[field.label]:value}} : item));touch();}} />)}</div><Button type="button" variant="text-button" aria-label={`Remove item ${index+1}`} onClick={() => {setRows(old => old.filter(item => item.id !== row.id));touch();}}><Trash2 size={16} />Remove item</Button></fieldset>)}</section>}
    {definition.pattern === 'review' && <section className="revision-comparison"><h3>Revision comparison notes</h3><div className="comparison-columns"><Field prefix={id} field={{label:'Current revision notes',kind:'multiline'}} value={values['Current revision notes'] ?? ''} onChange={value=>update('Current revision notes',value)} /><Field prefix={id} field={{label:'Proposed revision notes',kind:'multiline'}} value={values['Proposed revision notes'] ?? ''} onChange={value=>update('Proposed revision notes',value)} /></div><p className="field-hint">Comparison notes only. Verified revision content is not available yet.</p></section>}
    {definition.checks && <section className="review-checklist"><h3><CheckSquare size={18} />{definition.pattern === 'checklist' ? 'Evidence checklist' : 'Review preparation'}</h3>{definition.checks.map(check => <label key={check} className="review-check"><input type="checkbox" checked={checks[check] ?? false} onChange={event => {setChecks(old => ({...old,[check]:event.target.checked}));touch();}} /><span>{check}</span></label>)}<p className="field-hint">These notes are not an approval or completion record.</p><Field prefix={id} field={{label:'Review notes',kind:'multiline'}} value={values['Review notes'] ?? ''} onChange={value => update('Review notes',value)} /></section>}
    {definition.pattern === 'schedule' && <section className="schedule-preview"><div className="field"><label htmlFor={`${id}-month`}>Planning month</label><input id={`${id}-month`} type="month" value={month} onChange={event => setMonth(event.target.value)} /></div><h3><CalendarDays size={18} />Planned dates</h3>{rows.filter(row => Object.entries(row.values).some(([k,v]) => /date/i.test(k) && v && (!month || v.startsWith(month)))).map(row => <div className="planned-date" key={row.id}><span>{Object.entries(row.values).filter(([k,v]) => /date/i.test(k) && v).map(([,v])=>v).join(' to ')}</span><strong>{Object.values(row.values)[0] || 'Untitled draft item'}</strong><span className="status-label">Planning only</span></div>)}<p className="field-hint">Draft dates do not reserve time or mobilize work.</p></section>}
    {definition.pattern === 'conversation' && <section className="conversation-preview"><h3><MessageSquare size={18} />Message preview</h3><p className="conversation-subject">{values.Subject || values.Question || 'No subject or question entered'}</p><p className="message-body">{values.Message || 'Nothing has been sent.'}</p></section>}
    {definition.pattern === 'report' && <section className="report-basis"><h3>Report contents</h3><p>Period: {values['Period start'] || 'Not selected'} to {values['Period end'] || 'Not selected'}</p><p>Source-backed results are not available yet.</p></section>}
    </fieldset>
    <div className="draft-actions">
     {savable && <Button type="button" variant="primary" disabled={!scoped || locked || !title.trim()} title={!scoped ? 'Choose a development account and facility to save.' : !title.trim() ? 'Enter a planning draft title.' : undefined} onClick={startSave}>{save.status === 'saving' ? <LoaderCircle className="spinner" size={16} /> : <Save size={16} />}Save planning draft</Button>}
     <Button type="submit" disabled={locked}><Eye size={16} />Preview draft</Button>
     <Button type="button" variant="text-button" disabled={locked} onClick={() => dirty ? setDiscarding(true) : reset()}><RotateCcw size={16} />Discard draft</Button>
    </div>
    {definition.consequence && <div className="gated-action"><Button type="button" variant="secondary" disabled><LockKeyhole size={16} />{definition.consequence}</Button><p>Next professional step. Requires the connected workflow and the responsible person's own authority; a planning draft does not perform it.</p></div>}
   </form>
   {save.status === 'invalid' && <div className="save-problem" role="alert"><p>{save.error.message}</p><p className="field-hint">Nothing was saved. Correct the draft and save again.</p></div>}
   {save.status === 'uncertain' && <div className="save-problem" role="alert"><p>{save.error.message}</p><p className="field-hint">The save may already be recorded. Editing is paused so the exact same save can be retried without creating a duplicate.</p><Button disabled={reading} onClick={() => void send(save.request)}>Retry same save</Button></div>}
   {save.status === 'conflict' && <div className="save-problem" role="alert"><p>{save.error.message}</p> <><Button disabled={reading} onClick={() => { if (reading) return; void (async () => { const planId = save.request.planId; const result = await read(planId); if (!result) return; if (result.ok) { currentRef.current = null; apply(result.plan); setMessage(`Opened the latest saved version · revision ${result.plan.revision}`); } else { setLoadError(result.error.message); } })(); }}>Open latest saved version</Button><Button variant="text-button" disabled={reading} onClick={() => { if (reading || save.status !== 'conflict') return; operation.current++; setSave({status:'idle'}); setCurrent(null); currentRef.current = null; setMessage('Kept your changes as a new unsaved draft.'); }}>Keep my changes as a new draft</Button></></div>}
   {refreshFailed && <div className="save-problem" role="status"><p>Saved. Revision {current?.revision} is recorded, but this may not be the latest copy and it could not be reloaded. Editing is paused until it reloads.</p><Button disabled={reading || current?.id !== refreshFailed} onClick={() => { if (reading || current?.id !== refreshFailed) return; void refreshSaved(refreshFailed, current.revision); }}>Reload latest</Button></div>}
   {discarding && <div className="discard-confirmation" role="alert"><p>Discard the unsaved details on this tab?</p><Button disabled={locked} onClick={reset}>Discard changes</Button><Button variant="text-button" disabled={locked} onClick={() => setDiscarding(false)}>Keep editing</Button></div>}
   {preview && <DraftPreview title={title} values={values} rows={rows} definition={definition} savedRevision={savedRevision} />}
  </>}
  <p className="draft-announcement" role="status">{message}</p>
  {!savable && <p className="availability-note"><LockKeyhole size={14} />{definition.pattern === 'audit' ? 'Event search requires confirmed audit access.' : 'Saving and operational actions are not available yet.'}</p>}
 </section>;
}

function SavedPlans({ plans, currentId, disabled, onOpen, onNew }: { plans: ReturnType<typeof useWorkspacePlans>; currentId?: string; disabled: boolean; onOpen: (id: string) => void; onNew: () => void }) {
 const list = plans.list;
 return <section className="saved-plans" aria-label="Your planning drafts"><div className="section-intro"><h3><FolderOpen size={17} />Your planning drafts</h3><Button variant="text-button" disabled={disabled} onClick={onNew}><Plus size={15} />Create another</Button></div>
  {list.status === 'loading' ? <p className="field-hint" role="status">Loading saved planning drafts…</p>
   : list.status === 'error' ? <div className="save-problem" role="alert"><p>{list.error instanceof PlanError && list.error.planCode === 'not_available' ? 'Personal planning drafts are not available in this workspace yet. You can still prepare an unsaved draft.' : list.error.message}</p>{list.error.retryable && <Button onClick={plans.reload}>Try again</Button>}</div>
   : list.status === 'ready' && list.plans.length === 0 ? <p className="field-hint">You have no planning drafts for this facility yet.</p>
   : list.status === 'ready' ? <ul className="saved-plan-list">{list.plans.map(plan => <li key={plan.id} className={plan.id === currentId ? 'is-current' : ''}><div><strong>{plan.title}</strong><span>Revision {plan.revision} · updated {new Date(plan.updatedAt).toLocaleString()}</span></div><Button variant="text-button" disabled={disabled} aria-label={`Open ${plan.title}`} onClick={() => onOpen(plan.id)}>Open</Button></li>)}</ul> : null}
 </section>;
}

function HistoryPanel({ title }: { title: string }) {
 const [filter,setFilter] = useState('All');
 const id = useId();
 return <section className="history-panel"><div className="section-intro"><h2>{title}</h2><Clock3 size={20} /></div><div className="field"><label htmlFor={id}>History view</label><select id={id} value={filter} onChange={event=>setFilter(event.target.value)}><option>All</option><option>Most recent first</option><option>Oldest first</option></select></div><div className="history-empty"><Clock3 size={25} /><h3>History is not available yet</h3><p>Confirmed events will appear here when access is available.</p></div></section>;
}
function IntegrationStatus({ title }: { title: string }) {
 return <section className="integration-status"><div className="section-intro"><h2>{title}</h2><span className="status-label unavailable">Not connected</span></div>{title === 'Moldo connection' ? <><div className="integration-brand"><span className="entity-icon">M</span><div><h3>Moldo</h3><p>Independently operated</p></div></div><dl className="integration-facts"><div><dt>Connection</dt><dd>Not available</dd></div><div><dt>OS access</dt><dd>Assigned OS access required</dd></div></dl><Button disabled>Connect Moldo</Button></> : title === 'Source provenance' ? <><h3>Source ownership</h3><dl className="integration-facts"><div><dt>Source system</dt><dd>Moldo</dd></div><div><dt>Source records</dt><dd>Not received</dd></div><div><dt>Confirmed version</dt><dd>Not available</dd></div></dl></> : <><h3>Synchronization</h3><dl className="integration-facts"><div><dt>Last confirmed sync</dt><dd>Not available</dd></div><div><dt>Pending changes</dt><dd>Not available</dd></div><div><dt>Connection issues</dt><dd>No status received</dd></div></dl><Button disabled>Retry synchronization</Button></>}<p className="availability-note">No external data is exchanged.</p></section>;
}
