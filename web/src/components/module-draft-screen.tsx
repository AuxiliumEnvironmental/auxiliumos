import { useEffect, useId, useState, type ChangeEvent } from 'react';
import { CalendarDays, CheckSquare, Clock3, Eye, FileText, LockKeyhole, MessageSquare, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from './button';
import type { DraftField, ScreenDefinition } from '../pages/module-screen-definitions';

type Values = Record<string, string>;
type DraftRow = { id: number; values: Values };
function Field({ field, value, onChange, prefix }: { field: DraftField; value: string; onChange: (value: string) => void; prefix: string }) {
 const id = `${prefix}-${field.label.replace(/[^a-z0-9]/gi, '-')}`;
 const props = { id, value, autoComplete: "off", spellCheck: false, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value) };
 return <div className={`field ${field.kind === 'multiline' ? 'field-wide' : ''}`}><label htmlFor={id}>{field.label}</label>{field.kind === 'multiline' ? <textarea {...props} rows={4} /> : field.kind === 'select' ? <select {...props}><option value="">Choose an option</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select> : <input {...props} type={field.kind === 'date' ? 'date' : field.kind === 'money' || field.kind === 'quantity' ? 'number' : 'text'} step={field.kind === 'money' ? '0.01' : field.kind === 'quantity' ? 'any' : undefined} />}</div>;
}
function DraftPreview({ values, rows, definition }: { values: Values; rows: DraftRow[]; definition: ScreenDefinition }) {
 const filled = Object.entries(values).filter(([,value]) => value.trim());
 return <section className="draft-preview" aria-label="Unsaved draft preview"><div className="section-intro"><h3>Draft preview</h3><span className="status-label">Unsaved</span></div>{filled.length === 0 && rows.length === 0 ? <p>No draft details entered.</p> : <><dl>{filled.map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{rows.length > 0 && <><h4>{definition.repeat?.label}</h4>{rows.map((row,index) => <dl key={row.id}><dt>Item {index + 1}</dt><dd>{Object.entries(row.values).filter(([,v]) => v.trim()).map(([k,v]) => `${k}: ${v}`).join(' · ') || 'No details entered'}</dd></dl>)}</>}</> }<p className="field-hint">This draft has not been saved or submitted.</p></section>;
}
export function ModuleDraftScreen({ definition, open = false }: { definition: ScreenDefinition; open?: boolean }) {
 const id = useId();
 const [started, setStarted] = useState(false);
 const [values, setValues] = useState<Values>({});
 const [rows, setRows] = useState<DraftRow[]>([]);
 const [nextId, setNextId] = useState(1);
 const [checks, setChecks] = useState<Record<string,boolean>>({});
 const [preview, setPreview] = useState(false);
 const [discarding, setDiscarding] = useState(false);
 const [message, setMessage] = useState('');
 const [month, setMonth] = useState('');
 const isOpen = open || started;
 const edited = Object.values(values).some(Boolean) || rows.length > 0 || Object.values(checks).some(Boolean);
 useEffect(() => {
  if (!edited) return;
  const warn = (event: BeforeUnloadEvent) => {event.preventDefault();event.returnValue = '';};
  window.addEventListener('beforeunload', warn);
  return () => window.removeEventListener('beforeunload', warn);
 }, [edited]);
 const update = (label: string, value: string) => { setValues(old => ({...old,[label]:value})); setMessage(''); };
 const reset = () => { setValues({});setRows([]);setChecks({});setStarted(false);setPreview(false);setDiscarding(false);setMonth('');setMessage('Draft discarded.'); };
 if (definition.pattern === 'integration') return <IntegrationStatus title={definition.title} />;
 if (definition.pattern === 'history') return <HistoryPanel title={definition.title} />;
 return <section className={`draft-screen pattern-${definition.pattern}`} aria-labelledby={`${id}-title`}>
  <div className="section-intro"><div><p className="entity-type">{definition.pattern === 'review' ? 'Revision review' : definition.pattern === 'schedule' ? 'Planning' : definition.pattern === 'audit' ? 'Permitted inspection' : 'Preparation'}</p><h2 id={`${id}-title`}>{definition.title}</h2></div>{!isOpen && <Button variant="primary" onClick={() => {setStarted(true);setMessage(definition.pattern === 'audit' ? 'Search filters opened. No search has been run.' : 'Unsaved draft opened.');}}><Plus size={16} />{definition.pattern === 'audit' ? 'Prepare filters' : definition.pattern === 'review' ? 'Prepare review notes' : 'Prepare draft'}</Button>}</div>
  {!isOpen ? <div className="draft-start"><FileText size={32} /><div><h3>{definition.pattern === 'audit' ? 'Prepare a search' : 'Start with an unsaved draft'}</h3><p>{definition.pattern === 'review' ? 'Identify the exact revision and prepare review notes.' : definition.pattern === 'schedule' ? 'Arrange work and dates before scheduling.' : definition.pattern === 'report' ? 'Define the reporting period and source basis.' : definition.pattern === 'conversation' ? 'Prepare wording and recipients without sending.' : 'Enter details for review before saving.'}</p></div></div> : <>
   <div className="draft-state"><span className="status-label">Unsaved draft</span><p>Unsaved; leaving this module discards the draft. No sensitive or personal health information.</p></div>
   <form onSubmit={event => {event.preventDefault();setPreview(true);setMessage('Draft preview ready. Nothing has been submitted.');}}>
    <div className="draft-fields">{definition.fields.map(field => <Field key={field.label} prefix={id} field={field} value={values[field.label] ?? ''} onChange={value => update(field.label,value)} />)}</div>
    {definition.repeat && <section className="repeat-section"><div className="section-intro"><h3>{definition.repeat.label}</h3><Button type="button" onClick={() => {setRows(old => [...old,{id:nextId,values:{}}]);setNextId(old => old+1);}}><Plus size={16} />Add item</Button></div>{rows.length === 0 && <p className="field-hint">No draft items added.</p>}{rows.map((row,index) => <fieldset className="repeat-row" key={row.id}><legend>Item {index+1}</legend><div className="draft-fields">{definition.repeat?.fields.map(field => <Field key={field.label} prefix={`${id}-${row.id}`} field={field} value={row.values[field.label] ?? ''} onChange={value => setRows(old => old.map(item => item.id === row.id ? {...item,values:{...item.values,[field.label]:value}} : item))} />)}</div><Button type="button" variant="text-button" aria-label={`Remove item ${index+1}`} onClick={() => setRows(old => old.filter(item => item.id !== row.id))}><Trash2 size={16} />Remove item</Button></fieldset>)}</section>}
    {definition.pattern === 'review' && <section className="revision-comparison"><h3>Revision comparison notes</h3><div className="comparison-columns"><Field prefix={id} field={{label:'Current revision notes',kind:'multiline'}} value={values['Current revision notes'] ?? ''} onChange={value=>update('Current revision notes',value)} /><Field prefix={id} field={{label:'Proposed revision notes',kind:'multiline'}} value={values['Proposed revision notes'] ?? ''} onChange={value=>update('Proposed revision notes',value)} /></div><p className="field-hint">Comparison notes only. Verified revision content is not available yet.</p></section>}
    {definition.checks && <section className="review-checklist"><h3><CheckSquare size={18} />{definition.pattern === 'checklist' ? 'Evidence checklist' : 'Review preparation'}</h3>{definition.checks.map(check => <label key={check} className="review-check"><input type="checkbox" checked={checks[check] ?? false} onChange={event => setChecks(old => ({...old,[check]:event.target.checked}))} /><span>{check}</span></label>)}<p className="field-hint">These notes are not an approval or completion record.</p><Field prefix={id} field={{label:'Review notes',kind:'multiline'}} value={values['Review notes'] ?? ''} onChange={value => update('Review notes',value)} /></section>}
    {definition.pattern === 'schedule' && <section className="schedule-preview"><div className="field"><label htmlFor={`${id}-month`}>Planning month</label><input id={`${id}-month`} type="month" value={month} onChange={event => setMonth(event.target.value)} /></div><h3><CalendarDays size={18} />Planned dates</h3>{rows.filter(row => Object.entries(row.values).some(([k,v]) => /date/i.test(k) && v && (!month || v.startsWith(month)))).map(row => <div className="planned-date" key={row.id}><span>{Object.entries(row.values).filter(([k,v]) => /date/i.test(k) && v).map(([,v])=>v).join(' – ')}</span><strong>{Object.values(row.values)[0] || 'Untitled draft item'}</strong><span className="status-label">Unsaved</span></div>)}<p className="field-hint">Draft dates do not reserve time or mobilize work.</p></section>}
    {definition.pattern === 'conversation' && <section className="conversation-preview"><h3><MessageSquare size={18} />Message preview</h3><p className="conversation-subject">{values.Subject || values.Question || 'No subject or question entered'}</p><p className="message-body">{values.Message || 'Nothing has been sent.'}</p></section>}
    {definition.pattern === 'report' && <section className="report-basis"><h3>Report contents</h3><p>Period: {values['Period start'] || 'Not selected'} to {values['Period end'] || 'Not selected'}</p><p>Source-backed results are not available yet.</p></section>}
    <div className="draft-actions"><Button type="submit"><Eye size={16} />Preview draft</Button><Button type="button" variant="text-button" onClick={() => edited ? setDiscarding(true) : reset()}><RotateCcw size={16} />Discard draft</Button><Button type="button" variant="primary" disabled title="Saving is not available yet."><LockKeyhole size={16} />{definition.consequence || 'Save draft'}</Button></div>
   </form>
   {discarding && <div className="discard-confirmation" role="alert"><p>Discard the unsaved details on this tab?</p><Button onClick={reset}>Discard changes</Button><Button variant="text-button" onClick={() => setDiscarding(false)}>Keep editing</Button></div>}
   {preview && <DraftPreview values={values} rows={rows} definition={definition} />}
  </>}
  <p className="draft-announcement" role="status">{message}</p>
  <p className="availability-note"><LockKeyhole size={14} />{definition.pattern === 'audit' ? 'Event search requires confirmed audit access.' : 'Saving and operational actions are not available yet.'}</p>
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
