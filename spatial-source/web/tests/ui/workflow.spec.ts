import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { stressFixture } from './stressFixture';
import { freshDocument, syntheticDocument } from '../../src/ui/geometry';
import type { StoredWorkspace } from '../../src/types';

// A new run can retain its own screenshots without replacing earlier evidence.
const artifactDirectory = process.env.SPATIAL_ARTIFACT_DIR ?? 'tests/ui/artifacts/warm-switch';

async function readLocalLayouts(page:Page):Promise<StoredWorkspace[]>{return page.evaluate(async()=>{const path='/src/data/index.ts';const {SpatialWebStore}=await import(path);const store=new SpatialWebStore('auxilium-spatial-local-v1');try{const list=await store.list();return await Promise.all(list.map((item:{documentID:string})=>store.open(item.documentID)));}finally{store.close();}});}
async function clickPlanPoint(page:Page,x:number,z:number){const point=await page.locator('.spatial-plan svg').evaluate((svg:SVGSVGElement,point)=>{const p=svg.createSVGPoint();p.x=point.x;p.y=point.z;const screen=p.matrixTransform(svg.getScreenCTM()!);return{x:screen.x,y:screen.y};},{x,z});await page.mouse.click(point.x,point.y);}

test.use({ baseURL: process.env.SPATIAL_TEST_URL ?? 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1000 } });
test('real authoring, history, frozen export and reopen survive browser reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example' }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 1');
  await page.locator('.spatial-object-list button').filter({ hasText: 'Living room' }).click();
  await page.getByLabel('Room name', { exact: true }).fill('Corrected living room');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 3');
  await expect(page.locator('.spatial-object-list')).toContainText('Living room');
  await expect(page.locator('.spatial-object-list')).not.toContainText('Corrected living room');
  await expect(page.getByLabel('Room name',{exact:true})).toHaveValue('Living room');
  await page.getByRole('button', { name: /Redo/ }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 4');
  await page.getByRole('button', { name: 'Saved revisions', exact: true }).click();
  await page.getByRole('button', { name: 'Freeze revision 4' }).click();
  await expect(page.locator('.spatial-revision-list')).toContainText('Revision 4');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('geometry');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Prepare download' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await page.locator('.spatial-project-card').filter({ hasText: 'Courtyard study' }).click();
  await expect(page.locator('.spatial-object-list')).toContainText('Corrected living room');
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 4');
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({ path: `${artifactDirectory}/desktop-editor.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('graphic 3D renders, clips wall geometry, walks with collision and exits', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.getByRole('button', { name: 'Open example' }).click();
  await page.getByRole('button', { name: '3D model', exact: true }).click();
  await expect(page.locator('.spatial-model-canvas canvas[data-rendered=true]')).toBeVisible();
  await expect(page.locator('.spatial-model-message')).not.toContainText('unavailable');
  await page.getByLabel('Cutaway', { exact: true }).check();
  await page.getByLabel('Cutaway height').fill('0.4');
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({ path: `${artifactDirectory}/cutaway-model.png`, fullPage: true });
  await page.getByRole('button', { name: 'Walk through' }).click();
  await expect(page.getByText('● WALKING')).toBeVisible();
  const canvas = page.locator('.spatial-model-canvas canvas'); await canvas.focus();
  for (let i = 0; i < 45; i++) await canvas.press('w');
  await expect(page.locator('.spatial-model-message')).toContainText('Movement stopped');
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(page.getByText('● WALKING')).toBeVisible();
  await page.getByRole('button', { name: 'Exit walking' }).click();
  await expect(page.getByRole('button', { name: 'Orbit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('narrow viewport exposes the same correction controls with safe targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.getByRole('button', { name: 'Open example' }).click();
  await page.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.locator('.spatial-object-list button').filter({ hasText: 'Living room' }).click();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByLabel('Room name', { exact: true }).fill('Phone correction');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  const targets = await page.locator('button:visible').evaluateAll(buttons => buttons.map(button => ({ label: button.textContent, box: button.getBoundingClientRect() })).filter(({ box }) => box.width < 44 || box.height < 44).map(({label,box})=>({label,width:box.width,height:box.height})));
  expect(targets).toEqual([]);
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
  expect(await zoom.evaluate(button => { const rect=button.getBoundingClientRect();const top=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return rect.bottom<=window.innerHeight&&!!top&&button.contains(top); })).toBe(true);
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({ path: `${artifactDirectory}/mobile-editor.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('wall and opening corrections use shared saved geometry and survive a view switch', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Open example' }).click();
  await page.locator('.spatial-object-list').getByRole('button', { name: '╱ Wall 1', exact: true }).click();
  await page.getByRole('button', { name: 'Move up', exact: true }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  await page.locator('.spatial-object-list button').filter({ hasText: 'Door 1' }).click();
  await page.getByRole('button', { name: 'Wider', exact: true }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 3');
  await page.getByRole('combobox', { name: 'Opening type', exact: true }).selectOption('window');
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 4');
  await page.getByRole('button', { name: '3D model', exact: true }).click();
  await expect(page.locator('.spatial-inspector h2')).toHaveText('Window 1');
  await expect(page.locator('.spatial-model-canvas canvas[data-rendered=true]')).toBeVisible();
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 5');
  await expect(page.locator('.spatial-inspector h2')).toHaveText('Door 1');
});

test('authenticated personal scope rechecks authority and clears geometry on revocation', async ({page})=>{
  await page.goto('/tests/ui/authority.html');
  await expect(page.locator('.spatial-environment')).toContainText('Personal synthetic workspace');
  await page.getByRole('button',{name:'Open example'}).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 1');
  await page.getByRole('button',{name:'Revoke synthetic authority'}).click();
  await page.getByRole('button',{name:/Export/}).click();
  await expect(page.getByRole('heading',{name:'Workspace access is unavailable'})).toBeVisible();
  await expect(page.locator('.spatial-plan')).toHaveCount(0);
  await expect(page.locator('.spatial-model')).toHaveCount(0);
  await expect(page.locator('dialog')).toHaveCount(0);
});

test('walking crosses a permitted door but cannot exit through a window or unknown exterior',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open example'}).click();await page.getByRole('button',{name:'3D model',exact:true}).click();await page.getByRole('button',{name:'Walk through'}).click();const canvas=page.locator('.spatial-model-canvas canvas');
  for(let i=0;i<14;i++)await canvas.press('w');
  await expect(page.getByRole('combobox',{name:'Start in',exact:true})).toHaveValue('room-b');
  await page.getByRole('combobox',{name:'Start in',exact:true}).selectOption('room-a');for(let i=0;i<11;i++)await canvas.press('ArrowLeft');for(let i=0;i<26;i++)await canvas.press('ArrowRight');for(let i=0;i<25;i++)await canvas.press('w');
  await expect(page.getByRole('combobox',{name:'Start in',exact:true})).toHaveValue('room-a');await expect(page.locator('.spatial-model-message')).toContainText('Movement stopped');
  await page.getByRole('combobox',{name:'Start in',exact:true}).selectOption('room-b');for(let i=0;i<11;i++)await canvas.press('ArrowRight');for(let i=0;i<25;i++)await canvas.press('w');await expect(page.getByRole('combobox',{name:'Start in',exact:true})).toHaveValue('room-b');await expect(page.locator('.spatial-model-message')).toContainText(/Movement stopped|Unknown boundary/);
});

test('documented geometric stress workload releases renderer resources across 20 cycles',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/');const fixture=stressFixture();expect(fixture.floors[0].rooms).toHaveLength(100);expect(fixture.floors[0].walls).toHaveLength(1000);expect(fixture.floors[0].openings).toHaveLength(500);
  await page.locator('input[type=file]').setInputFiles({name:'synthetic-stress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await expect(page.locator('.spatial-save-state')).toContainText('Revision 1');
  const diagnostics=()=>page.evaluate(async()=>{const path='/src/ui/rendererDiagnostics.ts';const module=await import(path);return module.rendererDiagnostics();});
  const samples:Array<{cycle:number;switchMS:number;geometries:number;drawCalls:number;heapBytes:number}>=[];const cdp=await page.context().newCDPSession(page);
  for(let cycle=0;cycle<20;cycle++){const start=Date.now();await page.getByRole('button',{name:'3D model',exact:true}).click();await expect(page.locator('.spatial-model-canvas canvas[data-rendered=true]')).toBeVisible();const state=await diagnostics();expect(state.active).toHaveLength(1);expect(state.active[0].drawCalls).toBeLessThanOrEqual(8);const switchMS=Date.now()-start;
    if(cycle===0){await page.waitForTimeout(250);const after=await diagnostics();expect(after.active[0].renderFrames).toBe(state.active[0].renderFrames);}
    await page.getByRole('button',{name:'Auxilium Spatial saved layouts',exact:true}).click();await expect(page.locator('.spatial-model-canvas canvas')).toHaveCount(0);const closed=await diagnostics();expect(closed.active).toHaveLength(0);expect(closed.released.every((r:{geometries:number;textures:number})=>r.geometries===0&&r.textures===0)).toBe(true);await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage');samples.push({cycle,switchMS,geometries:state.active[0].geometries,drawCalls:state.active[0].drawCalls,heapBytes:heap.usedSize});
    if(cycle<19){await page.locator('.spatial-project-card').filter({hasText:'Synthetic rendering stress'}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 1');}
  }
  await mkdir(artifactDirectory,{recursive:true});await writeFile(`${artifactDirectory}/renderer-open-close-warm-switch.json`,JSON.stringify({environment:'Linux Chromium153, software-rendered WebGL, development build',counts:{rooms:100,walls:1000,openings:500,overlayMarkers:0},overlayNote:'Overlay markers have no model or UI contract in this workspace; 2000-marker portion remains unimplemented and unaccepted.',samples,resourceResult:'All 20 cycles reported 0 active renderers and 0 remaining Three.js geometries/textures after disposal. First idle sample generated no new frames.',acceptance:'Exploratory browser evidence only. iPhone15Pro frame, latency and total retained-memory acceptance remain pending.'},null,2));
});

test('ambiguous coincident corners require an explicit choice and preserve distinct identities',async({page})=>{
  const fixture=freshDocument('Synthetic ambiguous corners'),floor=fixture.floors[0];floor.nodes=[{id:'a',point:{x:0,z:0}},{id:'b',point:{x:3,z:0}},{id:'c',point:{x:0,z:0}},{id:'d',point:{x:0,z:3}}];const provenance={origin:'synthetic' as const,sourceIDs:[],classificationConfidence:'unknown' as const};floor.walls=[{id:'first',nodeIDs:['a','b'],baseY:0,height:2.6,heightBasis:'synthetic',provenance},{id:'second',nodeIDs:['c','d'],baseY:0,height:2.6,heightBasis:'synthetic',provenance}];
  await page.goto('/');await page.locator('input[type=file]').setInputFiles({name:'ambiguous.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await expect(page.locator('.spatial-plan circle')).toHaveCount(4);const circle=await page.locator('.spatial-plan circle').first().boundingBox();expect(circle).not.toBeNull();await page.mouse.click(circle!.x+circle!.width/2,circle!.y+circle!.height/2);const chooser=page.getByRole('dialog',{name:'Choose overlapping object'});await expect(chooser).toBeVisible();await chooser.getByRole('button').filter({hasText:'Corner 1'}).click();await expect(page.locator('.spatial-inspector h2')).toHaveText('Corner 1');await expect(page.locator('.spatial-save-state')).toContainText('Revision 1');await expect(page.locator('.spatial-plan circle')).toHaveCount(4);
});

test('late authority rejection from a replaced profile cannot deny the new workspace',async({page})=>{
  await page.goto('/tests/ui/authority.html');await page.getByRole('button',{name:'Open example'}).click();
  await page.getByRole('button',{name:'Defer next authority check',exact:true}).click();
  await page.getByRole('button',{name:/Export/}).click();
  await expect(page.getByRole('button',{name:'Reject deferred authority',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Switch synthetic profile',exact:true}).click();
  await expect(page.locator('.spatial-plan')).toHaveCount(0);
  await page.getByRole('button',{name:'Open example'}).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 1');
  await page.getByRole('button',{name:'Reject deferred authority',exact:true}).click();
  await expect(page.locator('.spatial-plan')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Workspace access is unavailable'})).toHaveCount(0);
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.locator('.spatial-object-list button').filter({hasText:'Living room'}).click();
  await page.getByLabel('Room name',{exact:true}).fill('Current principal');await page.getByRole('button',{name:'Save name',exact:true}).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
});

test('late allowed result cannot reopen geometry after current authority is revoked',async({page})=>{
  await page.goto('/tests/ui/authority.html');await page.getByRole('button',{name:'Open example'}).click();
  await page.getByRole('button',{name:'Defer next authority check',exact:true}).click();
  await page.getByRole('button',{name:/Export/}).click();
  await expect(page.getByRole('button',{name:'Resolve deferred authority',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Revoke synthetic authority',exact:true}).click();
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading',{name:'Workspace access is unavailable'})).toBeVisible();
  await page.getByRole('button',{name:'Resolve deferred authority',exact:true}).click();
  await expect(page.locator('.spatial-plan')).toHaveCount(0);await expect(page.locator('.spatial-model')).toHaveCount(0);await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Workspace access is unavailable'})).toBeVisible();
});


test('colliding source imports offer explicit separate retention and reopen exact copies without replacing corrections',async({page})=>{
  const source=syntheticDocument(),file={name:'retained-source.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))};
  await page.goto('/');await page.locator('input[type=file]').setInputFiles(file);
  await page.locator('.spatial-object-list button').filter({hasText:'Living room'}).click();await page.getByLabel('Room name',{exact:true}).fill('Original corrected room');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  await page.locator('input[type=file]').setInputFiles(file);await expect(page.getByRole('dialog',{name:'This layout is already saved'})).toBeVisible();
  let layouts=await readLocalLayouts(page);expect(layouts).toHaveLength(1);expect(layouts[0].document.floors[0].rooms[0].label).toBe('Original corrected room');
  await page.getByRole('button',{name:'Save as separate layout',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);await expect(page.locator('.spatial-save-state')).toContainText('Revision 1');
  layouts=await readLocalLayouts(page);expect(layouts).toHaveLength(2);const original=layouts.find(row=>row.document.documentID===source.documentID)!,copy=layouts.find(row=>row.document.documentID!==source.documentID)!;expect(original.document.floors[0].rooms[0].label).toBe('Original corrected room');expect(copy.document.floors).toEqual(source.floors);expect(copy.sourceIdentity).toMatchObject({documentID:source.documentID,revision:1,reason:'file-import'});
  await page.locator('.spatial-object-list button').filter({hasText:'Living room'}).click();await page.getByLabel('Room name',{exact:true}).fill('Separate corrected room');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  await page.locator('input[type=file]').setInputFiles(file);await page.getByRole('button',{name:'Save as separate layout',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);await expect(page.locator('.spatial-object-list')).toContainText('Separate corrected room');expect(await readLocalLayouts(page)).toHaveLength(2);
});

test('drawn semantic areas, floors and room merge operate on saved geometry with undo',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open example'}).click();
  await page.getByRole('button',{name:'Draw area',exact:true}).click();await clickPlanPoint(page,1,1);await clickPlanPoint(page,3,1);await clickPlanPoint(page,3,3);await page.getByRole('button',{name:'Finish area',exact:true}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  await page.locator('.spatial-object-list button').filter({hasText:'New area'}).click();await page.getByLabel('Area name',{exact:true}).fill('Work zone');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 3');
  await page.getByRole('button',{name:'Move right',exact:true}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 4');
  await page.getByRole('button',{name:'Manage floors',exact:true}).click();await page.getByLabel('New floor name',{exact:true}).fill('Upper floor');await page.getByRole('button',{name:'Add empty floor',exact:false}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 5');await page.getByRole('combobox',{name:'FLOOR',exact:true}).selectOption({label:'Upper floor'});await expect(page.locator('.spatial-object-empty')).toBeVisible();
  await page.getByRole('combobox',{name:'FLOOR',exact:true}).selectOption({label:'Ground floor'});await page.locator('.spatial-object-list button').filter({hasText:'Living room'}).click();page.once('dialog',dialog=>dialog.accept());await page.getByRole('combobox',{name:'Merge with adjacent room',exact:true}).selectOption('room-b');await expect(page.locator('.spatial-save-state')).toContainText('Revision 6');
  let layouts=await readLocalLayouts(page);expect(layouts[0].document.schemaVersion).toBe('1.1.0');expect(layouts[0].document.floors).toHaveLength(2);expect(layouts[0].document.floors[0].rooms).toHaveLength(1);expect(layouts[0].document.floors[0].openings.some((o:{id:string})=>o.id==='door-a')).toBe(false);expect(layouts[0].document.floors[0].areas![0].label).toBe('Work zone');
  await page.getByRole('button',{name:/Undo/}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 7');layouts=await readLocalLayouts(page);expect(layouts[0].document.floors[0].rooms).toHaveLength(2);expect(layouts[0].document.floors[0].openings.some((o:{id:string})=>o.id==='door-a')).toBe(true);
});

test('wall drawing chooses an ambiguous corner identity explicitly',async({page})=>{
  const source=freshDocument('Ambiguous drawing'),floor=source.floors[0];floor.nodes=[{id:'a',point:{x:0,z:0}},{id:'b',point:{x:3,z:0}},{id:'c',point:{x:0,z:0}},{id:'d',point:{x:0,z:3}}];const provenance={origin:'synthetic' as const,sourceIDs:[],classificationConfidence:'unknown' as const};floor.walls=[{id:'first',nodeIDs:['a','b'],baseY:0,height:2.6,heightBasis:'synthetic',provenance},{id:'second',nodeIDs:['c','d'],baseY:0,height:2.6,heightBasis:'synthetic',provenance}];
  await page.goto('/');await page.locator('input[type=file]').setInputFiles({name:'ambiguous-drawing.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await page.getByRole('button',{name:'Draw wall',exact:true}).click();await clickPlanPoint(page,0,0);const choice=page.getByRole('dialog',{name:'Choose overlapping object'});await expect(choice).toBeVisible();await expect(choice.getByRole('button').filter({hasText:'Corner 1'})).toBeFocused();await page.keyboard.press('Tab');await expect(choice.getByRole('button').filter({hasText:'Corner 3'})).toBeFocused();await page.keyboard.press('Enter');await clickPlanPoint(page,2,2);await page.getByRole('button',{name:'Finish walls',exact:true}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');const layouts=await readLocalLayouts(page),result=layouts[0].document.floors[0];expect(result.walls).toHaveLength(3);expect(result.nodes).toHaveLength(5);expect(result.walls[2].nodeIDs[0]).toBe('c');expect(result.nodes.filter((n:{point:{x:number;z:number}})=>n.point.x===0&&n.point.z===0)).toHaveLength(2);
});

test('concurrent corrections show unsaved state and reopen the actual latest draft without overwrite',async({page,context})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open example'}).click();
  const second=await context.newPage();await second.goto('/');await second.locator('.spatial-project-card').filter({hasText:'Courtyard study'}).click();await second.locator('.spatial-object-list button').filter({hasText:'Living room'}).click();await second.getByLabel('Room name',{exact:true}).fill('Saved from second tab');await second.getByRole('button',{name:'Save name',exact:true}).click();await expect(second.locator('.spatial-save-state')).toContainText('Revision 2');
  await page.locator('.spatial-object-list button').filter({hasText:'Living room'}).click();await page.getByLabel('Room name',{exact:true}).fill('Conflicting first-tab correction');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.locator('.spatial-save-state')).toContainText('Unsaved correction');await expect(page.getByRole('alert')).toContainText('revision-conflict');await expect(page.getByRole('alert')).toContainText('has not been saved');
  expect((await readLocalLayouts(page))[0].document.floors[0].rooms[0].label).toBe('Saved from second tab');
  await page.getByRole('button',{name:'Reopen latest saved',exact:true}).click();await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');await expect(page.locator('.spatial-object-list')).toContainText('Saved from second tab');await expect(page.locator('.spatial-object-list')).not.toContainText('Conflicting first-tab correction');await second.close();
});


test('complete local backup reimports the separately retained source identity through the actual workspace',async({page,browser})=>{
  const source=syntheticDocument(),file={name:'native-source-shape.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))};
  await page.goto('/');await page.locator('input[type=file]').setInputFiles(file);await expect(page.locator('.spatial-save-state')).toContainText('Revision 1');await page.locator('input[type=file]').setInputFiles(file);await page.getByRole('button',{name:'Save as separate layout',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  const before=await readLocalLayouts(page),copy=before.find(row=>row.document.documentID!==source.documentID)!;
  await page.getByRole('button',{name:/Export/}).click();await page.getByRole('combobox',{name:'Format',exact:true}).selectOption('local-document');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Prepare download',exact:true}).click();const download=await downloading,bytes=await readFile((await download.path())!);
  const recoveredContext=await browser.newContext();try{const recovered=await recoveredContext.newPage();await recovered.goto(process.env.SPATIAL_TEST_URL??'http://127.0.0.1:4175');await recovered.locator('input[type=file]').setInputFiles({name:download.suggestedFilename(),mimeType:'application/zip',buffer:bytes});await expect(recovered.locator('.spatial-save-state')).toContainText('Revision 1');const rows=await readLocalLayouts(recovered);expect(rows).toHaveLength(1);expect(rows[0].document).toEqual(copy.document);expect(rows[0].sourceIdentity).toEqual(copy.sourceIdentity);await recovered.getByRole('button',{name:'Saved revisions',exact:true}).click();await expect(recovered.getByRole('dialog',{name:'Saved revisions'})).toContainText('Saved separately from source revision 1');}finally{await recoveredContext.close();}
});

test('visible floor taps move through a permitted door and stop at a window between the same rooms',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open example'}).click();await page.getByRole('button',{name:'3D model',exact:true}).click();await page.getByRole('button',{name:'Walk through',exact:true}).click();const canvas=page.locator('.spatial-model-canvas canvas');
  const box=await canvas.boundingBox();expect(box).not.toBeNull();await page.mouse.click(box!.x+box!.width/2,box!.y+box!.height/2);await expect(page.getByRole('combobox',{name:'Start in',exact:true})).toHaveValue('room-b');await expect(page.locator('.spatial-model-message')).toContainText('permitted opening');
  await page.getByRole('button',{name:'Exit walking',exact:true}).click();await page.locator('.spatial-object-list button').filter({hasText:'Door 1'}).click();await page.getByRole('combobox',{name:'Opening type',exact:true}).selectOption('window');await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');await page.getByRole('combobox',{name:'Start in',exact:true}).selectOption('room-a');await page.getByRole('button',{name:'Walk through',exact:true}).click();for(let i=0;i<17;i++)await canvas.press('ArrowRight');const updated=await canvas.boundingBox();await page.mouse.click(updated!.x+updated!.width/2,updated!.y+updated!.height/2);await expect(page.getByRole('combobox',{name:'Start in',exact:true})).toHaveValue('room-a');await expect(page.locator('.spatial-model-message')).toContainText('Movement stopped');
});

test('plan framing and orbit framing survive view switches and display ceilings do not alter geometry',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open example'}).click();await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByRole('button',{name:'Zoom in',exact:true}).click();const plan=page.locator('.spatial-plan>svg'),view=await plan.getAttribute('viewBox'),saved=(await readLocalLayouts(page))[0].document;
  await page.getByRole('button',{name:'3D model',exact:true}).click();const canvas=page.locator('.spatial-model-canvas canvas[data-rendered=true]');await expect(canvas).toBeVisible();const box=await canvas.boundingBox();await page.mouse.move(box!.x+box!.width*.6,box!.y+box!.height*.6);await page.mouse.down();await page.mouse.move(box!.x+box!.width*.7,box!.y+box!.height*.55,{steps:8});await page.mouse.up();const open=await canvas.screenshot();await page.getByLabel('Display ceilings',{exact:true}).check();await page.mouse.move(1400,10);const capped=await canvas.screenshot();await writeFile(`${artifactDirectory}/framing-before.png`,capped);expect(capped.equals(open)).toBe(false);
  await page.getByRole('button',{name:'2D plan',exact:true}).click();await expect(plan).toHaveAttribute('viewBox',view!);await page.getByRole('button',{name:'3D model',exact:true}).click();await expect(canvas).toBeVisible();await expect(page.getByLabel('Display ceilings',{exact:true})).toBeChecked();await page.mouse.move(1400,10);const restored=await canvas.screenshot();await writeFile(`${artifactDirectory}/framing-after.png`,restored);expect(restored.equals(capped)).toBe(true);expect((await readLocalLayouts(page))[0].document).toEqual(saved);
});

test('mobile model controls stay reachable and held walking stops after release',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Open example'}).click();await page.getByRole('button',{name:'3D model',exact:true}).click();await expect(page.locator('canvas[data-rendered=true]')).toBeVisible();await expect(page.getByLabel('Display ceilings',{exact:true})).not.toBeVisible();await page.getByRole('button',{name:'View controls',exact:true}).click();await page.getByLabel('Display ceilings',{exact:true}).check();await page.getByLabel('Cutaway',{exact:true}).check();await page.getByLabel('Cutaway height',{exact:true}).fill('0.45');await page.getByRole('combobox',{name:'Start in',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('combobox',{name:'Start in',exact:true})).toBeVisible();await page.screenshot({path:`${artifactDirectory}/mobile-model-cutaway.png`,fullPage:true});await page.getByRole('button',{name:'Hide controls',exact:true}).click();await page.getByRole('button',{name:'Walk through',exact:true}).click();
  const button=page.getByRole('button',{name:'Walk forward',exact:true}),box=await button.boundingBox();expect(box).not.toBeNull();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.y+box!.height).toBeLessThan(844);await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.waitForTimeout(250);await page.mouse.up();await page.waitForTimeout(100);const diagnostics=()=>page.evaluate(async()=>{const path='/src/ui/rendererDiagnostics.ts';return(await import(path)).rendererDiagnostics();});const before=await diagnostics();await page.waitForTimeout(250);const after=await diagnostics();expect(after.active[0].renderFrames).toBe(before.active[0].renderFrames);await page.screenshot({path:`${artifactDirectory}/mobile-model-walk.png`,fullPage:true});await page.getByRole('button',{name:'Exit walking',exact:true}).click();await expect(page.getByRole('button',{name:'Orbit',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('200 percent text stays operable on a narrow screen and persists as a display preference',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Open example'}).click();await page.getByRole('button',{name:'Text size',exact:true}).click();await page.getByRole('button',{name:'200% text',exact:true}).click();await expect(page.locator('.spatial-workspace')).toHaveAttribute('data-large-text','true');await page.getByRole('button',{name:'Objects',exact:true}).click();await page.locator('.spatial-object-list button').filter({hasText:'Living room'}).click();await page.getByRole('button',{name:'Details',exact:true}).click();const input=page.getByLabel('Room name',{exact:true});expect(await input.evaluate(element=>Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(24);await input.fill('Large text correction');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.getByRole('button',{name:'Layout',exact:true}).click();await page.getByRole('button',{name:'Zoom in',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.screenshot({path:`${artifactDirectory}/mobile-200-percent-text.png`,fullPage:true});await page.reload();await expect(page.locator('.spatial-workspace')).toHaveAttribute('data-large-text','true');await page.locator('.spatial-project-card').filter({hasText:'Courtyard study'}).click();await page.getByRole('button',{name:'Objects',exact:true}).click();await expect(page.locator('.spatial-object-list')).toContainText('Large text correction');
});

test('synthetic safe-area insets keep portrait and landscape workspace controls within usable bounds',async({page})=>{
  // CSS property injection checks layout only. It is not an iPhone notch or WKWebView acceptance test.
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.locator('.spatial-workspace').evaluate((element:HTMLElement)=>{element.style.setProperty('--spatial-safe-area-top','59px');element.style.setProperty('--spatial-safe-area-left','0px');element.style.setProperty('--spatial-safe-area-right','0px');});
  await page.getByRole('button',{name:'Open example'}).click();
  const header=page.locator('.spatial-header');expect((await header.boundingBox())!.y).toBeGreaterThanOrEqual(59);
  const zoom=page.getByRole('button',{name:'Zoom in',exact:true});expect(await zoom.evaluate(button=>{const rect=button.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return rect.top>=59&&rect.bottom<=window.innerHeight&&!!hit&&button.contains(hit);})).toBe(true);await zoom.click();
  await page.getByRole('button',{name:'Objects',exact:true}).click();await page.locator('.spatial-object-list button').filter({hasText:'Living room'}).click();await page.getByRole('button',{name:'Details',exact:true}).click();await page.getByLabel('Room name',{exact:true}).fill('Inset-safe correction');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  await page.getByRole('button',{name:'Layout',exact:true}).click();await page.screenshot({path:`${artifactDirectory}/mobile-synthetic-safe-area.png`,fullPage:true});
  await page.setViewportSize({width:844,height:390});await page.locator('.spatial-workspace').evaluate((element:HTMLElement)=>{element.style.setProperty('--spatial-safe-area-top','0px');element.style.setProperty('--spatial-safe-area-left','59px');element.style.setProperty('--spatial-safe-area-right','59px');});
  const bounds=await page.locator('.spatial-header,.spatial-document-heading,.spatial-editor').evaluateAll(elements=>elements.map(element=>{const rect=element.getBoundingClientRect();return{left:rect.left,right:rect.right};}));for(const rect of bounds){expect(rect.left).toBeGreaterThanOrEqual(59);expect(rect.right).toBeLessThanOrEqual(785);}expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'3D model',exact:true}).click();await expect(page.locator('canvas[data-rendered=true]')).toBeVisible();await page.getByRole('button',{name:'Walk through',exact:true}).click();await page.getByRole('button',{name:'Exit walking',exact:true}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
});
