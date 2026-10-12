import { FixturePicker } from './FixturePicker';
import { CutoutPicker } from './CutoutControls';
import type { Fixture, Cutout } from '../types';
import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { applyCommands } from '../core';
import { SpatialWebStore, exportRevision, importWorkspace } from '../data';
import { captureCapabilities, captureRoom } from '../capture';
import { saveExport } from '../exportDelivery';
import type { EditCommand, ExportFormat, Floor, FrozenRevision, ImportedWorkspace, Selection, SpatialDocument, StoredWorkspace, WorkspaceContext, WorkspaceSummary, Point2 } from '../types';
import { FloorplanCanvas, type CanvasTool, type PlanViewState } from './FloorplanCanvas';
import { ModelViewport, type ModelViewState } from './ModelViewport';
import { DraggableTools } from './DraggableTools';
import { BoundaryForm, Inspector } from './Inspector';
import { freshDocument, objectLabel, syntheticDocument, uid } from './geometry';
import { reviewItems } from './review';
import { useTextScale } from './useTextScale';
import { useDrawingRecovery } from './useDrawingRecovery';
import { groupTranslation, selectionKey } from './groupSelection';
import './workspace.css';

const standalone: WorkspaceContext = { mode: 'standalone', namespace: 'auxilium-spatial-local-v1' };
const formats: { id: ExportFormat; label: string; description: string; scope: 'all' | 'floor' | 'one' }[] = [
  { id: 'pdf', label: 'PDF drawing set', description: 'Clean architectural pages for review', scope: 'all' },
  { id: 'png', label: 'PNG drawing', description: 'An image of the selected floor', scope: 'floor' },
  { id: 'svg', label: 'SVG line drawing', description: 'Scalable vector line art', scope: 'floor' },
  { id: 'glb', label: 'GLB geometric model', description: 'Portable 3D geometry for this floor', scope: 'floor' },
  { id: 'geometry', label: 'Geometry JSON', description: 'The canonical graph and every floor', scope: 'all' },
  { id: 'scene', label: 'Scene JSON', description: 'Derived 3D faces and semantic edges', scope: 'floor' },
  { id: 'local-document', label: 'Complete local document', description: 'All floors in a validated recovery package', scope: 'all' },
  { id: 'bundle', label: 'Single-floor exchange bundle', description: 'Versioned geometry, scene and manifest', scope: 'one' },
];
const scopeKey = (context: WorkspaceContext) => JSON.stringify(context.mode === 'standalone' ? [context.mode, context.namespace] : context.mode === 'auxiliumos' ? [context.mode, context.namespace, context.profileID, context.accountID, context.projectID] : [context.mode, context.namespace, context.profileID]);
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
function Mark() { return <svg width="27" height="30" viewBox="0 0 27 30" fill="none" aria-hidden="true"><path d="M3 24V9L13.5 3L24 9V24L13.5 28L3 24Z" stroke="currentColor" strokeWidth="1.7"/><path d="M3 9L13.5 15L24 9M13.5 15V28M8 12V22M19 12V22" stroke="currentColor" strokeWidth="1.5"/></svg>; }
function Dialog({ title, onClose, children, error }: { title: string; onClose: () => void; children: ReactNode; error?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleID = useId();
  useEffect(() => { const active = window.document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => active?.focus(); }, []);
  return <dialog ref={ref} aria-labelledby={titleID} className="spatial-dialog" onCancel={event => { event.preventDefault(); onClose(); }}><div className="spatial-dialog-title"><h2 id={titleID}>{title}</h2><button aria-label="Close dialog" onClick={onClose}>×</button></div>{error&&<p className="spatial-error-text" role="alert">{error}</p>}{children}</dialog>;
}
export function SpatialWorkspace({ context = standalone }: { context?: WorkspaceContext }) {
  const installedIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  const textScale=useTextScale();
  const [library, setLibrary] = useState<WorkspaceSummary[]>([]);
  const [stored, setStored] = useState<StoredWorkspace | null>(null);
  const [floorID, setFloorID] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [groupSelection, setGroupSelection] = useState<Selection[]>([]);
  const selectToolButton = useRef<HTMLButtonElement>(null);
  const groupScope = useRef('');
  const [mode, setMode] = useState<'plan' | 'model'>('plan');
  const [warmModel, setWarmModel] = useState<{scope:string;document:SpatialDocument;floorID:string}|null>(null);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice || !['Correction saved on this device.', 'Previous geometry restored as a new saved revision.', 'Correction reapplied as a new saved revision.'].includes(notice)) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{ expected: number; commands: EditCommand[]; preview: SpatialDocument; recoveryToken?: string } | null>(null);
  const [featurePlacement,setFeaturePlacement]=useState<Fixture|Cutout|null>(null);
  const [modal, setModal] = useState<'fixtures' | 'cutouts' | 'new' | 'export' | 'room' | 'floor' | 'revisions' | 'capture' | 'review' | 'import-conflict' | 'text-size' | null>(null);
  const [incomingConflict, setIncomingConflict] = useState<{ imported: ImportedWorkspace; reason: 'native-capture' | 'file-import'; generation: number } | null>(null);
  const [boundaryRoom, setBoundaryRoom] = useState<string>();
  const [revisions, setRevisions] = useState<FrozenRevision[]>([]);
  const [frozen, setFrozen] = useState<FrozenRevision | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [exportScope, setExportScope] = useState<'all' | 'floor'>('all');
  const [exportFloorID, setExportFloorID] = useState('');
  const [mobilePanel, setMobilePanel] = useState<'canvas' | 'objects' | 'details'>('canvas');
  const [capability, setCapability] = useState<{ available: boolean; reason?: string }>({ available: false, reason: 'Checking capture availability.' });
  const importInput = useRef<HTMLInputElement>(null);
  const storeRef = useRef<SpatialWebStore | null>(null);
  const contextRef = useRef(context); contextRef.current = context;
  const contextKey = scopeKey(context);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const drawingCommitRef = useRef<symbol | null>(null);
  const planViews=useRef(new Map<string,PlanViewState>()),modelViews=useRef(new Map<string,ModelViewState>());
  const viewGeneration=generation.current;
  function remember<T>(cache:Map<string,T>,key:string,value:T){if(viewGeneration!==generation.current)return;cache.delete(key);cache.set(key,value);if(cache.size>64)cache.delete(cache.keys().next().value!);}
  const current = pending?.preview ?? stored?.document;
  const floor = current?.floors.find(f => f.id === floorID) ?? current?.floors[0];
  useEffect(()=>setFeaturePlacement(null),[contextKey,current?.documentID,floor?.id]);
  const allObjects=useMemo<Selection[]>(()=>floor?[...floor.rooms.map(r=>({floorID:floor.id,kind:'room' as const,objectID:r.id})),...(floor.areas??[]).map(a=>({floorID:floor.id,kind:'area' as const,objectID:a.id})),...floor.walls.map(w=>({floorID:floor.id,kind:'wall' as const,objectID:w.id})),...floor.openings.map(o=>({floorID:floor.id,kind:'opening' as const,objectID:o.id})),...(floor.fixtures??[]).map(f=>({floorID:floor.id,kind:'fixture' as const,objectID:f.id})),...(floor.cutouts??[]).map(c=>({floorID:floor.id,kind:'cutout' as const,objectID:c.id})),...floor.nodes.map(n=>({floorID:floor.id,kind:'node' as const,objectID:n.id}))]:[],[floor]);
  const availableSelectionKeys=useMemo(()=>new Set(allObjects.map(selectionKey)),[allObjects]);
  const groupKeys=useMemo(()=>new Set(groupSelection.map(selectionKey)),[groupSelection]);
  const retainedModel = warmModel?.scope===contextKey && warmModel.document.documentID===current?.documentID && warmModel.floorID===floor?.id ? warmModel : null;
  const modelDocument = mode==='model' ? current : retainedModel?.document;
  const modelFloor = modelDocument?.floors.find(item=>item.id===floor?.id);
  useLayoutEffect(() => {
    // Retain only the displayed revision of the currently open document/floor.
    // Plan edits do not rebuild a hidden scene; reactivation receives the current
    // canonical draft. Closing or changing authority/floor drops this snapshot.
    if (!current || !floor || accessDenied) { setWarmModel(null); return; }
    if (mode==='model') setWarmModel(previous=>previous?.scope===contextKey&&previous.document===current&&previous.floorID===floor.id?previous:{scope:contextKey,document:current,floorID:floor.id});
    else if (!retainedModel) setWarmModel(null);
  }, [current, floor?.id, mode, contextKey, accessDenied]);
  const issues = useMemo(() => current && floor ? reviewItems(current, floor) : [], [current, floor]);
  async function access(gen = generation.current) {
    const ctx = contextRef.current, key = scopeKey(ctx);
    const isCurrent = () => gen === generation.current && key === scopeKey(contextRef.current);
    if (!isCurrent()) throw new Error('Workspace context changed. This operation was cancelled.');
    try { if (ctx.mode !== 'standalone') await ctx.assertAccess(); }
    catch (cause) {
      // A late rejection from a replaced principal must never close the new
      // principal's workspace. A current denial invalidates every pending result.
      if (isCurrent()) {
        generation.current++; busyRef.current = false; planViews.current.clear();modelViews.current.clear();
        setAccessDenied(true); setStored(null); setLibrary([]); setPending(null);
        setSelection(null); setGroupSelection([]); setFrozen(null); setRevisions([]); setModal(null); setIncomingConflict(null);
        setNotice(''); setError(errorText(cause)); setBusy(false); setLoading(false);
      }
      throw cause;
    }
    if (!isCurrent()) throw new Error('Workspace context changed. This operation was cancelled.');
  }
  async function run<T>(work: (store: SpatialWebStore, gen: number) => Promise<T>): Promise<T | undefined> {
    if (busyRef.current || accessDenied) return;
    const gen = generation.current;
    busyRef.current = true; setBusy(true); setError('');
    try { await access(gen); const store = storeRef.current; if (!store || gen !== generation.current) return; const value = await work(store, gen); await access(gen); return value; } catch (cause) { if (gen === generation.current) setError(errorText(cause)); return; } finally { if (gen === generation.current) { busyRef.current = false; setBusy(false); } }
  }
  useLayoutEffect(() => {
    const gen = ++generation.current; planViews.current.clear();modelViews.current.clear(); const store = new SpatialWebStore(context.namespace); storeRef.current = store;
    setStored(null);setPending(null);setSelection(null);setGroupSelection([]);setFrozen(null);setRevisions([]);setModal(null);setIncomingConflict(null);setNotice('');setAccessDenied(false);setLoading(true);setError('');setLibrary([]);setBusy(false);busyRef.current=false;drawingCommitRef.current=null;
    void (async()=>{try{await access(gen);const entries=await store.list();await access(gen);if(gen===generation.current)setLibrary(entries);}catch(cause){if(gen===generation.current)setError(errorText(cause));}finally{if(gen===generation.current)setLoading(false);}})();
    const recheck = () => { if (window.document.visibilityState === 'visible') void access(gen).catch(cause=>{if(gen===generation.current)setError(errorText(cause));}); };
    window.document.addEventListener('visibilitychange',recheck);
    return()=>{generation.current++;store.close();if(storeRef.current===store)storeRef.current=null;window.document.removeEventListener('visibilitychange',recheck);};
  },[contextKey]);
  const recovery = useDrawingRecovery({ document: stored?.document ?? null, scope: contextKey, getStore: () => storeRef.current, getGeneration: () => generation.current, assertAccess: access });
  const disabled = busy || !!pending || accessDenied || recovery.blocked;
  const editingBlocked = disabled || drawing || recovery.active;
  useEffect(()=>{let active=true;void captureCapabilities().then(value=>{if(active)setCapability(value);}).catch(cause=>{if(active)setCapability({available:false,reason:errorText(cause)});});return()=>{active=false;};},[]);
  useEffect(()=>{const listener=(event:BeforeUnloadEvent)=>{if(pending||busy){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener);},[pending,busy]);
  useLayoutEffect(()=>{
    const scope=JSON.stringify([contextKey,current?.documentID,floor?.id]);
    if(groupScope.current!==scope){groupScope.current=scope;setGroupSelection([]);return;}
    if(!floor)return;
    setGroupSelection(previous=>{const next=previous.filter(item=>availableSelectionKeys.has(selectionKey(item)));return next.length===previous.length?previous:next;});
  },[contextKey,current?.documentID,current?.revision,floor?.id,availableSelectionKeys]);
  useEffect(()=>{if(!selection||!floor)return;const list=selection.kind==='fixture'?floor.fixtures??[]:selection.kind==='cutout'?floor.cutouts??[]:selection.kind==='node'?floor.nodes:selection.kind==='wall'?floor.walls:selection.kind==='opening'?floor.openings:selection.kind==='room'?floor.rooms:floor.areas??[];if(!list.some(item=>item.id===selection.objectID))setSelection(null);},[current?.revision,floor?.id]);
  useEffect(()=>{const keyboard=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(!target?.closest('.spatial-workspace')||target.closest('input,textarea,select,[contenteditable=true]')||!(event.metaKey||event.ctrlKey)||editingBlocked)return;const key=event.key.toLowerCase();if(key==='z'){event.preventDefault();void history(event.shiftKey?'redo':'undo');}else if(key==='y'){event.preventDefault();void history('redo');}};window.addEventListener('keydown',keyboard);return()=>window.removeEventListener('keydown',keyboard);},[stored,editingBlocked]);
  async function refreshLibrary(gen=generation.current) {const store=storeRef.current;try{await access(gen);const entries=await store?.list();await access(gen);if(entries&&gen===generation.current&&store===storeRef.current)setLibrary(entries);}catch(cause){if(gen===generation.current)setError(errorText(cause));}}
  async function guardScope(gen:number){if(gen!==generation.current)throw new Error('Workspace context changed. This operation was cancelled.');await access(gen);if(gen!==generation.current)throw new Error('Workspace context changed. This operation was cancelled.');}
  function showWorkspace(value:StoredWorkspace){setIncomingConflict(null);setStored(value);setPending(null);setFloorID(value.document.floors[0].id);setSelection(null);setGroupSelection([]);setFrozen(null);setMode('plan');setTool('select');setNotice('');setMobilePanel('canvas');}
  async function create(document:SpatialDocument){const value=await run(async (store,gen)=>{const created=await store.create(document);await refreshLibrary(gen);return created;});if(value){showWorkspace(value);setModal(null);}}
  async function open(documentID:string){if(pending&&!confirm('Discard the unsaved correction and open another layout? Your last saved revision remains available.'))return;const value=await run(store=>store.open(documentID));if(value)showWorkspace(value);}
  async function commitEdit(commands:EditCommand[], retry=false, recoveryToken?:string, expectedSourceRevision?:number):Promise<boolean>{
    if(viewGeneration!==generation.current)return false;
    if(expectedSourceRevision!==undefined&&stored?.document.revision!==expectedSourceRevision){setError('The layout changed. Start a new correction.');return false;}
    if(!stored||busyRef.current||(!retry&&pending))return false;
    let preview:SpatialDocument;const expected=retry&&pending?pending.expected:stored.document.revision;
    const token=retry&&pending?pending.recoveryToken:recoveryToken;
    try{preview=retry&&pending?pending.preview:applyCommands(stored.document,commands,expected).document;}catch(cause){setError(errorText(cause));return false;}
    setPending({expected,commands,preview,...(token?{recoveryToken:token}:{})});
    const value=await run(store=>store.apply(stored.document.documentID,expected,commands,token?{token}:undefined));
    if(value){if(token)recovery.consumed(token);setStored(value);setPending(null);setNotice('Correction saved on this device.');await refreshLibrary();return true;}return false;
  }
  async function commitFeatureEdit(commands:EditCommand[],revision:number):Promise<boolean>{const accepted=await commitEdit(commands,false,undefined,revision);if(accepted&&viewGeneration===generation.current){const command=commands[0];if(command.type==='setFixture'||command.type==='setCutout')setSelection({floorID:command.floorID,kind:command.type==='setFixture'?'fixture':'cutout',objectID:command.type==='setFixture'?command.fixture.id:command.cutout.id});}return accepted;}
  async function commitDrawingEdit(commands:EditCommand[]):Promise<boolean>{
    if(drawingCommitRef.current||busyRef.current||pending)return false;
    const gen=generation.current, submission=Symbol('drawing-submit');drawingCommitRef.current=submission;
    try{const checkpoint=await recovery.flush();if(gen!==generation.current)return false;return await commitEdit(commands,false,checkpoint?.token);}
    catch(cause){if(gen===generation.current)setError(errorText(cause));return false;}
    finally{if(drawingCommitRef.current===submission)drawingCommitRef.current=null;}
  }
  async function resumeDrawing(){const gen=generation.current;const record=await recovery.resume();if(record&&gen===generation.current){setFloorID(record.floorID);setTool(record.payload.tool);setMode('plan');setMobilePanel('canvas');setNotice('Unfinished drawing resumed. Finish it to create a saved geometry revision.');setError('');}}
  async function reopenSaved(){if(!stored)return;const value=await run(store=>store.open(stored.document.documentID));if(value){showWorkspace(value);recovery.refresh();setNotice('Opened the latest saved draft. Review any retained unfinished drawing before continuing.');}}

  async function history(action:'undo'|'redo'){if(!stored||editingBlocked)return;const value=await run(store=>store[action](stored.document.documentID,stored.document.revision));if(value){setStored(value);setNotice(action==='undo'?'Previous geometry restored as a new saved revision.':'Correction reapplied as a new saved revision.');await refreshLibrary();}}
  async function imported(file:File){if(file.size>64*1024*1024){setError('This file exceeds the 64 MB import safety limit.');return;}const gen=generation.current;const value=await run(async store=>{const imported=await importWorkspace(new Uint8Array(await file.arrayBuffer()),file.name);await guardScope(gen);return retainIncoming(store,imported,'file-import',gen);});if(value){showWorkspace(value);setNotice('Validated document imported and saved. Original Apple captures are not reconstructed from this file.');}}
  async function capture(){const gen=generation.current;const value=await run(async store=>{const document=await captureRoom();await guardScope(gen);return retainIncoming(store,{document},'native-capture',gen);});if(value){showWorkspace(value);setNotice('Captured geometry saved. Original Apple capture remains in protected native storage.');setModal(null);}}
  async function retainIncoming(store:SpatialWebStore,imported:ImportedWorkspace,reason:'native-capture'|'file-import',gen:number):Promise<StoredWorkspace|null>{
    try { const saved=await store.createImported(imported);await refreshLibrary(gen);return saved; }
    catch(cause){
      if(errorText(cause)!=='document-already-exists')throw cause;
      await guardScope(gen);setIncomingConflict({imported,reason,generation:gen});setModal('import-conflict');setNotice('');return null;
    }
  }
  async function saveIncomingCopy(){
    const incoming=incomingConflict;if(!incoming)return;
    const value=await run(async store=>{await guardScope(incoming.generation);const saved=await store.createCopy(incoming.imported.document,incoming.reason,incoming.imported.sourceIdentity&&incoming.imported.sourceBytes?{sourceIdentity:incoming.imported.sourceIdentity,sourceBytes:incoming.imported.sourceBytes}:undefined);await refreshLibrary(incoming.generation);return saved;});
    if(value){showWorkspace(value);setModal(null);setNotice('Separate layout ready. The original corrected layout is retained. If this source was already saved separately, its latest saved draft has reopened.');}
  }
  async function openExistingConflict(){
    const incoming=incomingConflict;if(!incoming)return;
    const value=await run(async store=>{await guardScope(incoming.generation);return store.open(incoming.imported.document.documentID);});
    if(value){showWorkspace(value);setModal(null);setNotice('Opened the existing saved layout. Incoming geometry was not applied.');}
  }
  async function requestCapture(){
    const gen=generation.current;if(busyRef.current||accessDenied||drawing)return;
    try{await access(gen);const next=await captureCapabilities();await access(gen);setCapability(next);if(next.available)await capture();else setModal('capture');}
    catch(cause){if(gen===generation.current)setError(errorText(cause));}
  }
  async function prepareExport(){if(!stored||editingBlocked)return;const value=await run(store=>store.freeze(stored.document.documentID,stored.document.revision));if(value){setFrozen(value);setExportFloorID(value.document.floors.some(f=>f.id===floorID)?floorID:value.document.floors[0].id);setModal('export');}}
  async function download(){if(!frozen)return;const gen=generation.current;const result=await run(async()=>{const selected=formats.find(format=>format.id===exportFormat)!;const target=selected.scope==='floor'||(exportFormat==='pdf'&&exportScope==='floor')?exportFloorID:undefined;const artifact=await exportRevision(frozen,exportFormat,target);await guardScope(gen);const delivery=await saveExport(artifact);return{artifact,delivery};});if(result)setNotice(result.delivery.completed?`Revision ${result.artifact.revision} prepared for ${capability.available?'sharing':'download'}.`:'Export sharing was cancelled. The saved revision is unchanged.');}
  async function showRevisions(){if(!stored||editingBlocked)return;const value=await run(store=>store.revisions(stored.document.documentID));if(value){setRevisions(value);setModal('revisions');}}
  const select=(value:Selection|null)=>{if(viewGeneration!==generation.current||value&&(!floor||!selectionExists(floor,value)))return;setSelection(value);setGroupSelection([]);};
  const selectGroup=(values:Selection[])=>{if(viewGeneration!==generation.current||!floor)return;const seen=new Set<string>(),next=values.filter(item=>{const key=selectionKey(item);if(!availableSelectionKeys.has(key)||seen.has(key))return false;seen.add(key);return true;});setGroupSelection(next);setSelection(next.length===1?next[0]:null);};
  const toggleGroup=(value:Selection)=>{const key=selectionKey(value);selectGroup(groupKeys.has(key)?groupSelection.filter(item=>selectionKey(item)!==key):[...groupSelection,value]);};
  const clearGroup=()=>{setGroupSelection([]);setSelection(null);setTool('select');requestAnimationFrame(()=>selectToolButton.current?.focus());};
  const chooseTool=(value:CanvasTool)=>{setFeaturePlacement(null);setTool(value);if(value!=='marquee'){setGroupSelection([]);}else if(selection&&floor&&selectionExists(floor,selection)){setGroupSelection([selection]);}setNotice('');setError('');};

  return <div className="spatial-workspace" data-mode={context.mode} data-document-open={!!current} data-large-text={textScale.scale>1.1} style={{'--spatial-text-scale':textScale.scale} as CSSProperties}>
    <header className="spatial-header"><button className="spatial-brand" disabled={drawing||recovery.active||recovery.blocked} onClick={()=>{if(pending){setError('Save or discard the pending correction before closing this layout.');return;}setStored(null);setSelection(null);setError('');}} aria-label="Auxilium Spatial saved layouts"><span className="spatial-mobile-back" aria-hidden="true">←</span><Mark/><span>auxilium<span className="spatial-brand-divider"/>spatial</span></button><div className="spatial-environment">{context.mode==='auxiliumos'?<><span className="spatial-dot"/> {context.projectLabel}</>:context.mode==='auxiliumos-personal'?<><span className="spatial-dot"/> AuxiliumOS · Personal synthetic workspace</>:<><span className="spatial-dot"/> Local workspace</>}</div><button className="spatial-text-size" aria-label="Text size" title={`Text size: ${Math.round(textScale.scale*100)}%`} onClick={()=>setModal('text-size')}>Aa</button><button className="spatial-capture-button" aria-label={capability.available?'Capture rooms':installedIOS?'Capture unavailable':'About iPhone capture'} disabled={editingBlocked} onClick={()=>void requestCapture()}><span className="spatial-capture-label">{capability.available?'Capture rooms':installedIOS?'Capture unavailable':'About iPhone capture'}</span><span className="spatial-capture-short">{capability.available?'Capture':'iPhone capture'}</span></button></header>{context.mode!=='standalone'&&<div className="spatial-context-caption">{context.mode==='auxiliumos'?context.projectLabel:'AuxiliumOS · Personal synthetic workspace'}</div>}
    <input ref={importInput} type="file" accept=".json,.zip,.auxilium,.spatial" className="spatial-hidden-input" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void imported(file);}} />
    {(error||pending&&!busy||notice) && <div className={`spatial-message ${error?'spatial-message-error':''}`} data-message-kind={error?'error':pending?'pending':'notice'} role={error?'alert':'status'}><div>{error||notice}{pending&&!busy&&<strong> Your correction is visible but has not been saved.</strong>}</div><div>{pending&&!busy&&<><button onClick={()=>void commitEdit(pending.commands,true)}>Retry save</button><button onClick={()=>{setPending(null);setError('');if(pending.recoveryToken)recovery.refresh();setNotice('Returned to the saved revision. Any unfinished drawing remains available for review.');}}>Discard unsaved edit</button><button onClick={()=>void reopenSaved()}>Reopen latest saved</button></>}{!pending&&<button aria-label="Dismiss message" onClick={()=>{setError('');setNotice('');}}>×</button>}</div></div>}
    {!accessDenied&&current&&recovery.error&&!recovery.offer&&<div className="spatial-message spatial-message-error" role="alert"><div>{recovery.error} Your last saved geometry remains available.</div><div>{!recovery.blocked&&<button onClick={()=>recovery.retry()}>Retry recovery save</button>}<button disabled={busy} onClick={()=>void reopenSaved()}>Reopen latest saved</button><button disabled={busy} onClick={()=>{setStored(null);setPending(null);setTool('select');}}>Back to saved layouts</button></div></div>}
    {accessDenied?<main className="spatial-access-blocked"><h1>Workspace access is unavailable</h1><p>This workspace has closed its authorized view. Return to the host application to re-establish your context.</p></main>:!current?<main className="spatial-library"><div className="spatial-library-heading"><div><div className="spatial-eyebrow">YOUR SPATIAL WORKSPACE</div><h1>A clear picture of<br/>every room.</h1><p>Capture, correct and explore a layout.<br/>Keep one geometry from the first scan to the saved drawing.</p></div><div className="spatial-library-actions"><button className="spatial-primary" disabled={busy||loading} onClick={()=>setModal('new')}>+ New layout</button><button disabled={busy||loading} onClick={()=>importInput.current?.click()}>Import a layout</button></div></div><div className="spatial-library-list"><div className="spatial-section-title"><h2>Saved layouts</h2><span>{loading?'Opening local storage…':'Saved in this browser or installed app'}</span></div>{library.length?<div className="spatial-project-grid">{library.map(item=><button className="spatial-project-card" key={item.documentID} disabled={busy} onClick={()=>void open(item.documentID)}><div className="spatial-project-icon"><Mark/></div><h3>{item.title}</h3><p>Revision {item.revision}<span>·</span>{new Date(item.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</p><span className="spatial-card-arrow">↗</span></button>)}</div>:!loading&&<div className="spatial-empty-library"><div className="spatial-empty-symbol">⌑</div><div><h3>Your layouts will be saved here.</h3><p>Start with a new drawing, import a validated document, or explore the synthetic example.</p></div></div>}</div><div className="spatial-example-card"><div className="spatial-example-diagram" aria-hidden="true"><svg viewBox="0 0 160 90"><path d="M20 15H140V75H20Z M80 15V38 M80 53V75" fill="#e9f2f7" stroke="#416276" strokeWidth="2"/><path d="M40 75H60" stroke="#9cbed1" strokeWidth="4"/><path d="M80 38Q65 38 65 53H80" fill="none" stroke="#7198ae"/></svg></div><div><div className="spatial-eyebrow">A PLACE TO TRY THINGS</div><h3>Explore a two-room example</h3><p>Move a wall, adjust a door, then walk between rooms. Synthetic data only.</p></div><button disabled={busy||loading} onClick={()=>void create(syntheticDocument())}>Open example ↗</button></div><p className="spatial-library-footnote">Local-first storage · No live publication · Unverified geometry</p></main>:floor&&<>
      <div className="spatial-document-heading"><div><button className="spatial-back" aria-label="Back to saved layouts" disabled={!!pending||busy||drawing||recovery.active||recovery.blocked} onClick={()=>setStored(null)}>←</button><div><h1>{current.title}</h1><div className="spatial-save-state"><span className={`spatial-dot ${pending||drawing?'spatial-dot-amber':''}`}/><span className="spatial-status-label">{busy?'Working…':pending?'Unsaved correction':drawing||recovery.active?`Unfinished drawing${recovery.status==='saved'?' · recovery saved':recovery.status==='saving'?' · saving recovery…':recovery.status==='failed'?' · recovery not saved':''}`:recovery.status==='checking'?'Checking recovery…':'Saved locally'}</span><span>·</span><span className="spatial-revision-label">Revision {current.revision}</span>{current.title.toLowerCase().includes('synthetic')&&<span className="spatial-synthetic-badge">SYNTHETIC</span>}</div></div></div><div className="spatial-document-actions" aria-label="Layout actions">
        <button aria-label="Undo" disabled={editingBlocked||!stored?.canUndo} onClick={()=>void history('undo')} title="Undo last correction"><span className="spatial-action-icon" aria-hidden="true">↶</span><span>Undo</span></button>
        <button aria-label="Redo" disabled={editingBlocked||!stored?.canRedo} onClick={()=>void history('redo')} title="Redo last correction"><span className="spatial-action-icon" aria-hidden="true">↷</span><span>Redo</span></button>
        <button aria-label="Review geometry" disabled={editingBlocked} onClick={()=>setModal('review')}><span className="spatial-action-icon" aria-hidden="true">✓</span><span>Review{issues.length?` (${issues.length})`:''}</span></button>
        <button aria-label="Saved revisions" disabled={editingBlocked} onClick={()=>void showRevisions()}><span className="spatial-action-icon" aria-hidden="true">◷</span><span>Revisions</span></button>
        <button aria-label="Export saved revision" className="spatial-primary" disabled={editingBlocked} onClick={()=>void prepareExport()}><span className="spatial-action-icon" aria-hidden="true">↗</span><span>Export</span></button>
      </div></div>
      <div className="spatial-editor" data-mobile-panel={mobilePanel}><aside className="spatial-object-panel"><div className="spatial-mobile-panel-heading"><strong>Objects</strong><button className="spatial-panel-close" aria-label="Back to map" onClick={()=>setMobilePanel('canvas')}>×</button></div><div className="spatial-floor-picker"><label>FLOOR<select value={floor.id} disabled={editingBlocked} onChange={event=>{setFloorID(event.target.value);setSelection(null);setTool('select');}}>{current.floors.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label><button aria-label="Manage floors" disabled={editingBlocked} onClick={()=>setModal('floor')}>⋯</button></div><div className="spatial-object-heading"><h2>Objects</h2><button disabled={editingBlocked} onClick={()=>{setBoundaryRoom(undefined);setModal('room');}} title="Create room from boundary walls">+ Room</button></div><div className="spatial-object-list" aria-label="Layout objects">{allObjects.length?(['room','area','fixture','cutout','wall','opening','node'] as const).map(kind=><div className="spatial-object-group" key={kind}>{allObjects.some(s=>s.kind===kind)&&<h3>{kind==='node'?'Corners':kind==='opening'?'Doors & openings':`${kind[0].toUpperCase()}${kind.slice(1)}s`}</h3>}{allObjects.filter(s=>s.kind===kind).map(item=><button key={item.objectID} aria-pressed={groupKeys.has(selectionKey(item))||selection?.objectID===item.objectID&&selection.kind===item.kind} disabled={tool==='marquee'&&editingBlocked} onClick={()=>{if(tool==='marquee')toggleGroup(item);else{select(item);setMobilePanel('details');}}}><span className={`spatial-object-symbol spatial-symbol-${kind}`}>{kind==='room'?'▱':kind==='wall'?'╱':kind==='node'?'·':kind==='area'?'▧':'⌑'}</span><span>{objectLabel(floor,item)}</span>{kind==='wall'&&floor.walls.find(w=>w.id===item.objectID)?.provenance.origin==='inferred'&&<span className="spatial-inferred-mark" title="Inferred boundary">!</span>}</button>)}</div>):<p className="spatial-object-empty">Draw a rectangular room for a quick start, or connect walls and define the room from its boundary.</p>}</div><div className="spatial-review-note"><span>◌</span><div><strong>{current.reviewState==='needsReview'?'Review needed':'Reviewed geometry'}</strong><p>{floor.walls.some(w=>w.provenance.origin==='inferred')?'Dashed walls are inferred. Check incomplete boundaries.':'Check room connections and openings against the property.'}</p></div></div></aside>
        <main className="spatial-canvas-column"><div className="spatial-canvas-toolbar"><div className="spatial-segmented"><button disabled={drawing||recovery.active||recovery.blocked} aria-pressed={mode==='plan'} onClick={()=>setMode('plan')}>2D plan</button><button disabled={drawing||recovery.active||recovery.blocked} aria-pressed={mode==='model'} onClick={()=>setMode('model')}>3D model</button></div>{mode==='plan'&&<DraggableTools><div className="spatial-tools" aria-label="Drawing tools"><button ref={selectToolButton} aria-label="Select objects" aria-pressed={tool==='select'} onClick={()=>chooseTool('select')} disabled={editingBlocked}>↖ <span>Select</span></button><button aria-label="Select a group" title="Select and move connected objects together" aria-pressed={tool==='marquee'} onClick={()=>chooseTool('marquee')} disabled={editingBlocked}>▤ <span>Group</span></button><button aria-label="Pan plan" aria-pressed={tool==='pan'} onClick={()=>chooseTool('pan')} disabled={editingBlocked}>✥ <span>Pan</span></button><button aria-label="Draw rectangular room" title="Draw a rectangular room" aria-pressed={tool==='room'} onClick={()=>chooseTool('room')} disabled={editingBlocked}>▱ <span>Room</span></button><button aria-label="Draw wall" aria-pressed={tool==='wall'} onClick={()=>chooseTool('wall')} disabled={editingBlocked}>╱ <span>Wall</span></button><button aria-label="Place opening" title="Place a door, window or passage" aria-pressed={tool==='opening'} onClick={()=>chooseTool('opening')} disabled={editingBlocked}>⌑ <span>Opening</span></button><button aria-label="Draw area" aria-pressed={tool==='area'} onClick={()=>chooseTool('area')} disabled={editingBlocked}>▧ <span>Area</span></button></div></DraggableTools>}<button disabled={editingBlocked} onClick={()=>setModal('fixtures')}>+ Fixture</button><button disabled={editingBlocked} onClick={()=>setModal('cutouts')}>+ Cutout</button>{featurePlacement&&<><span role="status">Choose placement on its selected surface</span><button onClick={()=>setFeaturePlacement(null)}>Cancel placement</button></>}<span className="spatial-view-label">{floor.label}</span>{groupSelection.length>0&&<><span className="spatial-group-count" role="status">{groupSelection.length} {groupSelection.length===1?'object':'objects'} selected</span><button onClick={()=>setMobilePanel('details')}>Group details</button></>}</div>{mode==='plan'?<FloorplanCanvas featurePlacement={featurePlacement} onFeaturePlaced={()=>setFeaturePlacement(null)} onFeatureEdit={commitFeatureEdit} key={`${contextKey}:${current.documentID}:${floor.id}:${recovery.resumeKey}`} document={current} groupSelection={groupSelection} onGroupSelection={selectGroup} initialDraft={recovery.initialDraft} onDraftChange={payload=>recovery.change(floor.id,payload)} rememberedView={planViews.current.get(`${current.documentID}:${floor.id}`)} rememberView={view=>remember(planViews.current,`${current.documentID}:${floor.id}`,view)} floor={floor} selection={selection} onSelect={select} onEdit={commands=>commitDrawingEdit(commands)} onDrawingChange={setDrawing} disabled={disabled} tool={tool} onTool={setTool} onError={setError}/>:null}{modelDocument&&modelFloor&&<ModelViewport featurePlacement={featurePlacement} onFeaturePlaced={()=>setFeaturePlacement(null)} onEdit={commitFeatureEdit} disabled={editingBlocked} key={`${contextKey}:${current.documentID}:${floor.id}`} active={mode==='model'} rememberedView={modelViews.current.get(`${current.documentID}:${floor.id}`)} rememberView={view=>remember(modelViews.current,`${current.documentID}:${floor.id}`,view)} document={modelDocument} floor={modelFloor} selection={selection} groupSelection={groupSelection} onSelect={select}/>}<div className="spatial-canvas-footer"><span>{mode==='plan'?'PLAN VIEW':'GEOMETRIC MODEL'}</span><span>{drawing?'Finish or cancel the drawing to change views or edit other objects.':'Unverified geometry · No measurement claims'}</span></div></main>
        <div className="spatial-details-panel"><div className="spatial-mobile-panel-heading"><strong>Details</strong><button className="spatial-panel-close" aria-label="Back to map" onClick={()=>setMobilePanel('canvas')}>×</button></div>{(tool==='marquee'||groupSelection.length>0)?<GroupInspector key={`${current.documentID}:${floor.id}:${groupSelection.map(selectionKey).join('|')}`} document={current} floor={floor} selected={groupSelection} disabled={editingBlocked} onClear={clearGroup} onEdit={commands=>commitEdit(commands)}/>:<Inspector floor={floor} selection={selection} onSelect={select} onEdit={commands=>void commitEdit(commands)} disabled={editingBlocked} onBoundary={roomID=>{setBoundaryRoom(roomID);setModal('room');}}/>}</div>
      <nav className="spatial-mobile-tabs" aria-label="Workspace panels"><button aria-pressed={mobilePanel==='objects'} onClick={()=>setMobilePanel('objects')}>Objects</button><button aria-pressed={mobilePanel==='canvas'} onClick={()=>setMobilePanel('canvas')}>Layout</button><button aria-pressed={mobilePanel==='details'} onClick={()=>setMobilePanel('details')}>Details</button></nav></div>
    </>}
    {!accessDenied&&floor&&(modal==='fixtures'||modal==='cutouts')&&<Dialog title={modal==='fixtures'?'Fixtures':'Cutout / penetration'} onClose={()=>setModal(null)}>{modal==='fixtures'?<FixturePicker floor={floor} disabled={editingBlocked} onPlace={fixture=>{setFeaturePlacement(fixture);setTool('select');setModal(null);setMobilePanel('canvas');}}/>:<CutoutPicker floor={floor} disabled={editingBlocked} onPlace={cutout=>{setFeaturePlacement(cutout);setTool('select');setModal(null);setMobilePanel('canvas');}}/>}</Dialog>}
    {!accessDenied&&current&&recovery.offer&&<Dialog error={recovery.error} title="Recover unfinished drawing" onClose={()=>{setStored(null);setTool('select');}}><p>A {recovery.offer.record.payload.tool==='opening'?recovery.offer.record.payload.opening.kind:recovery.offer.record.payload.tool} drawing was saved separately after your completed input. It has not changed the layout geometry.</p><p>Drawing base: revision {recovery.offer.record.baseRevision}. Saved layout: revision {current.revision}.</p>{recovery.offer.state==='stale'?<p className="spatial-error-text">The saved geometry changed after this drawing began. It cannot be resumed onto a different revision. Keep it for later or explicitly discard it.</p>:<button className="spatial-primary spatial-full-button" disabled={recovery.reviewBusy} onClick={()=>void resumeDrawing()}>Resume drawing</button>}<button className="spatial-full-button" disabled={recovery.reviewBusy} onClick={()=>void recovery.discard().then(ok=>{if(ok){setTool('select');setNotice('Unfinished drawing discarded. Saved geometry is unchanged.');}})}>Discard unfinished drawing</button><button className="spatial-full-button" onClick={()=>{setStored(null);setTool('select');}}>Keep for later</button></Dialog>}
    {modal==='text-size'&&<Dialog title="Text size" onClose={()=>setModal(null)}><p>Choose a comfortable text size. Larger system text is respected when the installed browser exposes it.</p><div className="spatial-text-size-options">{([{scale:1,label:'Standard'},{scale:1.25,label:'Larger'},{scale:1.5,label:'Extra large'},{scale:2,label:'200% text'}]).map(option=><button key={option.scale} aria-pressed={textScale.preferred===option.scale} onClick={()=>{textScale.set(option.scale);setModal(null);}}>{option.label}</button>)}</div></Dialog>}
    {modal==='import-conflict'&&incomingConflict&&<Dialog error={error} title="This layout is already saved" onClose={()=>{setModal(null);setIncomingConflict(null);}}><p>The incoming {incomingConflict.reason==='native-capture'?'native capture':'file'} is revision {incomingConflict.imported.document.revision} of <strong>{incomingConflict.imported.document.title}</strong>. Its identity already exists in this workspace.</p><p>Your existing corrected layout remains intact. Save the incoming geometry separately to review it without overwriting or automatically merging either version. Original geometry identities, provenance and source revision are retained.</p><button className="spatial-primary spatial-full-button" disabled={busy} onClick={()=>void saveIncomingCopy()}>Save as separate layout</button><button className="spatial-full-button" disabled={busy} onClick={()=>void openExistingConflict()}>Open existing saved layout</button><button className="spatial-full-button" disabled={busy} onClick={()=>{setModal(null);setIncomingConflict(null);}}>Discard incoming geometry</button></Dialog>}
    {modal==='review'&&floor&&<Dialog error={error} title="Review this floor" onClose={()=>setModal(null)}><p>These checks describe the current geometry. Check the drawing against the property; they do not certify a scan or its measurements.</p>{issues.length?<div className="spatial-review-list">{issues.slice(0,200).map(issue=><button key={issue.id} onClick={()=>{setMode('plan');setModal(null);setTool('select');if(issue.selection){setSelection(issue.selection);setMobilePanel('details');}else{setBoundaryRoom(undefined);setModal('room');}}}><span className="spatial-eyebrow">{issue.severity}</span><strong>{issue.title}</strong><span>{issue.detail}</span><small>{issue.selection?objectLabel(floor,issue.selection):'Create a room'} →</small></button>)}{issues.length>200&&<p>Showing the first 200 checks. Correct these and reopen Review to continue.</p>}</div>:<p>No structural issues were found by these limited checks. Visual inspection and property verification are still required.</p>}</Dialog>}
    {modal==='new'&&<Dialog error={error} title="New layout" onClose={()=>setModal(null)}><NewLayoutForm disabled={busy} onCreate={title=>void create(freshDocument(title))}/></Dialog>}
    {modal==='room'&&floor&&<Dialog error={error} title={boundaryRoom?'Edit room boundary':'Create room'} onClose={()=>setModal(null)}><BoundaryForm floor={floor} roomID={boundaryRoom} onSave={commands=>void commitEdit(commands).then(ok=>{if(ok)setModal(null);})}/></Dialog>}
    {modal==='floor'&&current&&floor&&<Dialog error={error} title="Manage floors" onClose={()=>setModal(null)}><FloorForm floor={floor} floors={current.floors} disabled={disabled} onEdit={commands=>void commitEdit(commands).then(ok=>{if(ok)setModal(null);})}/></Dialog>}
    {modal==='capture'&&<Dialog error={error} title={installedIOS?'Room capture unavailable':'Scanning needs the iPhone app'} onClose={()=>setModal(null)}><div className="spatial-capture-info"><Mark/><h3>{installedIOS?'Check capture availability':'This browser can edit layouts, but cannot scan rooms'}</h3><p>{capability.reason||'Room scanning requires the installed app on a supported LiDAR-equipped iPhone.'}</p>{!installedIOS&&<><p>Opening Spatial in Safari, Lovable, or from a website shortcut on your Home Screen does not install the iPhone app or enable LiDAR.</p><p>Use the installed Auxilium Spatial iPhone app for room capture. This page cannot launch a scan or install that app.</p></>}<p>You can keep drawing, importing and editing saved layouts here. Browser and iPhone layouts do not automatically sync.</p></div></Dialog>}
    {modal==='export'&&frozen&&<Dialog error={error} title="Export a saved revision" onClose={()=>setModal(null)}><p>Every file below comes from <strong>revision {frozen.document.revision}</strong> of {frozen.document.title}. Later edits cannot change this saved snapshot.</p><label>Format<select value={exportFormat} onChange={event=>setExportFormat(event.target.value as ExportFormat)}>{formats.map(format=><option key={format.id} value={format.id} disabled={format.scope==='one'&&frozen.document.floors.length>1}>{format.label}{format.scope==='one'&&frozen.document.floors.length>1?' (single floor only)':''}</option>)}</select></label><p className="spatial-caption">{formats.find(format=>format.id===exportFormat)?.description}</p>{exportFormat==='pdf'&&<label>Pages<select value={exportScope} onChange={event=>setExportScope(event.target.value as 'all'|'floor')}><option value="all">Every floor</option><option value="floor">Selected floor only</option></select></label>}{(formats.find(format=>format.id===exportFormat)?.scope==='floor'||exportFormat==='pdf'&&exportScope==='floor')&&<label>Floor in this revision<select value={exportFloorID} onChange={event=>setExportFloorID(event.target.value)}>{frozen.document.floors.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label>}<div className="spatial-export-identity"><span>Exact content identity</span><code>{frozen.hash}</code></div><p className="spatial-caption">Raw native captures remain separately protected. Exporting this layout is your explicit choice; no remote publication is enabled.</p><button className="spatial-primary spatial-full-button" disabled={busy} onClick={()=>void download()}>{busy?'Preparing…':capability.available?'Prepare and share':'Prepare download'}</button>{notice&&<p role="status">{notice}</p>}</Dialog>}
    {modal==='revisions'&&stored&&<Dialog error={error} title="Saved revisions" onClose={()=>setModal(null)}><p>Editing saves the current draft. Freeze a revision to keep an immutable export source.</p>{stored.sourceIdentity&&<p className="spatial-caption">Saved separately from source revision {stored.sourceIdentity.revision}. Source document identity and exact content hash remain in this local record.</p>}<button className="spatial-primary spatial-full-button" disabled={disabled} onClick={()=>void run(async store=>{await store.freeze(stored.document.documentID,stored.document.revision);return store.revisions(stored.document.documentID);}).then(value=>{if(value)setRevisions(value);})}>Freeze revision {stored.document.revision}</button>{revisions.length?<div className="spatial-revision-list">{revisions.map(revision=><div key={revision.document.revision}><button onClick={()=>{setFrozen(revision);setExportFloorID(revision.document.floors.some(f=>f.id===floorID)?floorID:revision.document.floors[0].id);setModal('export');}}><strong>Revision {revision.document.revision}</strong><span>{new Date(revision.createdAt).toLocaleString()}</span><small>{revision.hash.slice(0,16)}… · Export this version ↗</small></button>{revision.document.revision!==stored.document.revision&&<button disabled={disabled} onClick={()=>{if(confirm(`Restore geometry from revision ${revision.document.revision}? This creates a new draft revision and preserves the frozen source and undo history.`))void run(store=>store.restore(stored.document.documentID,revision.document.revision,stored.document.revision)).then(value=>{if(value){setStored(value);setNotice(`Geometry restored from revision ${revision.document.revision} as new revision ${value.document.revision}.`);setModal(null);void refreshLibrary();}});}}>Restore as new revision</button>}</div>)}</div>:<p>No frozen revisions yet. Your current draft is saved locally.</p>}</Dialog>}
  </div>;
}
function selectionExists(floor: Floor, value: Selection): boolean {
  if(value.floorID!==floor.id)return false;
  if(value.kind==='fixture')return floor.fixtures?.some(f=>f.id===value.objectID)??false;
  if(value.kind==='cutout')return floor.cutouts?.some(c=>c.id===value.objectID)??false;
  if(value.floorID!==floor.id)return false;
  const objects=value.kind==='node'?floor.nodes:value.kind==='wall'?floor.walls:value.kind==='opening'?floor.openings:value.kind==='room'?floor.rooms:value.kind==='area'?floor.areas??[]:[];
  return objects.some(item=>item.id===value.objectID);
}
function GroupInspector({ document, floor, selected, disabled, onClear, onEdit }: { document: SpatialDocument; floor: Floor; selected: Selection[]; disabled: boolean; onClear: () => void; onEdit: (commands: EditCommand[]) => Promise<boolean> }) {
  const [horizontal, setHorizontal] = useState('0'), [vertical, setVertical] = useState('0');
  const [error, setError] = useState('');
  const proposed = useMemo(() => {
    const delta = { x: Number(horizontal), z: Number(vertical) };
    if(!selected.length||!horizontal.trim()||!vertical.trim()||delta.x===0&&delta.z===0)return { result: null, error: '' };
    try { return { result: groupTranslation(document, floor.id, selected, delta), error: '' }; }
    catch(cause) { return { result: null, error: errorText(cause) }; }
  }, [document, floor.id, selected, horizontal, vertical]);
  async function move(delta?: Point2) {
    if(disabled)return;
    try {
      const result = delta ? groupTranslation(document, floor.id, selected, delta) : proposed.result;
      if(!result)return;
      if(await onEdit(result.commands)){setHorizontal('0');setVertical('0');setError('');}
    } catch(cause) { setError(errorText(cause)); }
  }
  return <aside className="spatial-inspector" aria-label="Group correction">
    <div className="spatial-inspector-heading"><div><div className="spatial-eyebrow">CONNECTED SELECTION</div><h2>Group correction</h2></div><button className="spatial-icon-button" aria-label="Clear group selection" disabled={disabled} onClick={onClear}>×</button></div>
    {!selected.length?<p>Drag a selection box in the plan, or choose objects in the Objects panel. Add to group keeps earlier choices.</p>:<>
      <p>{selected.slice(0,8).map(item=>objectLabel(floor,item)).join(', ')}{selected.length>8?` and ${selected.length-8} more`:''}.</p>
      <p className="spatial-caption">Shared corners also move the connected walls and rooms. Openings remain on their host walls.</p>
      <fieldset disabled={disabled}><section><h3>Small adjustment</h3><div className="spatial-nudge" aria-label="Group position adjustments"><button aria-label="Nudge group up" onClick={()=>void move({x:0,z:-.05})}>↑</button><div><button aria-label="Nudge group left" onClick={()=>void move({x:-.05,z:0})}>←</button><span>Move group</span><button aria-label="Nudge group right" onClick={()=>void move({x:.05,z:0})}>→</button></div><button aria-label="Nudge group down" onClick={()=>void move({x:0,z:.05})}>↓</button></div></section>
      <section><form onSubmit={event=>{event.preventDefault();void move();}}><label>Horizontal group shift<input type="number" inputMode="decimal" step="0.05" min="-10000" max="10000" value={horizontal} onChange={event=>{setHorizontal(event.target.value);setError('');}}/></label><label>Vertical group shift<input type="number" inputMode="decimal" step="0.05" min="-10000" max="10000" value={vertical} onChange={event=>{setVertical(event.target.value);setError('');}}/></label>
      {proposed.result&&<p role="status">This moves {proposed.result.nodeIDs.length} shared {proposed.result.nodeIDs.length===1?'corner':'corners'} and affects {proposed.result.affectedWallIDs.length} walls and {proposed.result.affectedRoomIDs.length} rooms.</p>}
      {(proposed.error||error)&&<p className="spatial-error-text" role="alert">{proposed.error||error}</p>}
      <button className="spatial-primary spatial-full-button" type="submit" disabled={disabled||!proposed.result}>Apply group move</button></form><p className="spatial-caption">These are model-coordinate adjustments, not verified measurements. Each correction is saved once and can be undone.</p></section></fieldset>
    </>}
  </aside>;
}
function NewLayoutForm({disabled,onCreate}:{disabled:boolean;onCreate:(title:string)=>void}){const[title,setTitle]=useState('');return <form onSubmit={event=>{event.preventDefault();if(title.trim())onCreate(title);}}><label>Layout name<input autoFocus value={title} maxLength={256} placeholder="e.g. Riverside ground floor" onChange={event=>setTitle(event.target.value)}/></label><p>Start with a blank floor. Draw connected walls, label rooms, and correct the same geometry in every view.</p><button className="spatial-primary spatial-full-button" type="submit" disabled={disabled||!title.trim()}>Create layout</button></form>;}
function FloorForm({floor,floors,disabled,onEdit}:{floor:Floor;floors:Floor[];disabled:boolean;onEdit:(commands:EditCommand[])=>void}){const[label,setLabel]=useState(floor.label),[elevation,setElevation]=useState(String(floor.elevation)),[newLabel,setNewLabel]=useState('');return <><form onSubmit={event=>{event.preventDefault();onEdit([{type:'updateFloor',floorID:floor.id,label,elevation:Number(elevation)}]);}}><label>Current floor name<input value={label} maxLength={256} onChange={event=>setLabel(event.target.value)}/></label><label>Model elevation<input type="number" value={elevation} step="0.05" min="-10000" max="10000" onChange={event=>setElevation(event.target.value)}/></label><p className="spatial-caption">A model coordinate, not a verified building measurement. Floors remain separate until explicit geometry describes a connection.</p><button className="spatial-full-button" disabled={disabled||!label.trim()||!elevation.trim()||!Number.isFinite(Number(elevation))}>Save floor</button></form><hr/><form onSubmit={event=>{event.preventDefault();onEdit([{type:'addFloor',floor:{id:uid(),label:newLabel.trim(),elevation:floor.elevation+3,nodes:[],walls:[],openings:[],rooms:[]}}]);}}><label>New floor name<input value={newLabel} maxLength={256} onChange={event=>setNewLabel(event.target.value)}/></label><button className="spatial-full-button" disabled={disabled||!newLabel.trim()} type="submit">+ Add empty floor</button></form><hr/><button className="spatial-danger spatial-full-button" disabled={disabled||floors.length<=1} onClick={()=>{if(confirm(`Delete ${floor.label} and its geometry from the draft? Undo can restore it. Frozen revisions remain unchanged.`))onEdit([{type:'deleteFloor',floorID:floor.id}]);}}>Delete current floor</button></>;}
