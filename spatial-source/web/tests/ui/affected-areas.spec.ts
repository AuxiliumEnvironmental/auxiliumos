import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { freshDocument } from '../../src/ui/geometry';
import { domainBounds, asDomain } from '../../src/core/affectedAreaGeometry';
import type { SpatialDocument, StoredWorkspace } from '../../src/types';

// Explicit runner: existing config has a fixed testMatch outside F05's scope.
// Start Vite on 4175, then: npx playwright test tests/ui/affected-areas.spec.ts --config .
test.use({baseURL:process.env.SPATIAL_TEST_URL??'http://127.0.0.1:4175',viewport:{width:1440,height:1000},launchOptions:{executablePath:process.env.SPATIAL_BROWSER_EXECUTABLE,args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']}});
const evidence=resolve('../../docs/11-launch/spatial-feature-program/coordination/handoffs/F05');
function fixture(ceiling=false):SpatialDocument{
  const d=freshDocument('F05 synthetic surface journey'),f=d.floors[0];
  f.nodes=[[0,0],[8,0],[8,6],[0,6]].map(([x,z],i)=>({id:`n${i}`,point:{x,z}}));
  const provenance={origin:'synthetic' as const,sourceIDs:[],classificationConfidence:'unknown' as const};
  f.walls=f.nodes.map((n,i)=>({id:`w${i}`,nodeIDs:[n.id,`n${(i+1)%4}`],baseY:0,height:2.6,heightBasis:'synthetic',provenance:structuredClone(provenance)}));
  f.rooms=[{id:'room',label:'Synthetic room',boundary:f.walls.map(w=>({wallID:w.id,reversed:false}))}];
  f.openings=[{id:'window',wallID:'w3',kind:'window',offset:1,width:1,bottom:.7,height:1.1,provenance:structuredClone(provenance)}];
  if(ceiling){d.schemaVersion='1.5.0';d.affectedAreas=[];f.rooms[0].ceiling={id:'ceiling',height:2.6,heightBasis:'synthetic',provenance:structuredClone(provenance)};}return d;
}
async function start(page:Page,d=fixture()){await page.goto('/');await page.locator('input[type=file]').setInputFiles({name:'f05-synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await revision(page,1);return d;}
async function revision(page:Page,n:number){await expect(page.locator('.spatial-save-state')).toContainText(`Revision ${n}`);await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');}
async function saved(page:Page):Promise<StoredWorkspace>{return page.evaluate(async()=>{const path='/src/data/store.ts',{SpatialWebStore}=await import(path),store=new SpatialWebStore('auxilium-spatial-local-v1');try{const [s]=await store.list();return await store.open(s.documentID);}finally{store.close();}});}
async function planPoint(page:Page,x:number,z:number){return page.locator('.spatial-plan>svg').evaluate((svg:SVGSVGElement,{x,z})=>{const p=svg.createSVGPoint();p.x=x;p.y=z;const q=p.matrixTransform(svg.getScreenCTM()!);return{x:q.x,y:q.y};},{x,z});}
async function modelPoint(page:Page,x:number,y:number,z:number){return page.evaluate(async({x,y,z})=>{
  // Known synthetic fixture framing, before any orbit gesture.
  const path='/node_modules/three/build/three.module.js',T=await import(path),canvas=document.querySelector('.spatial-model-canvas canvas')!,r=canvas.getBoundingClientRect(),c=new T.PerspectiveCamera(46,r.width/r.height,.03,50000);c.position.set(10.4,8.5,11.4);c.lookAt(4,1.3,3);c.updateMatrixWorld();const p=new T.Vector3(x,y,z).project(c);return{x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};
},{x,y,z});}
async function drag(page:Page,from:{x:number;y:number},to:{x:number;y:number},release=true){await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});if(release)await page.mouse.up();}

test('golden 3D record, plan-height retention, cancellation, undo/reopen and complete frozen archive',async({page})=>{
  test.setTimeout(90_000);const original=await start(page);
  await page.getByRole('button',{name:'3D model',exact:true}).click();await expect(page.locator('canvas[data-rendered=true]')).toBeVisible();await page.getByRole('button',{name:'Edit surfaces',exact:true}).click();
  const first=await modelPoint(page,5.5,.4,6),last=await modelPoint(page,3.5,1.5,6);await page.mouse.click(first.x,first.y);
  await page.getByRole('button',{name:'Affected area',exact:true}).click();await expect(page.getByRole('button',{name:'Record moisture',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Record fire damage',exact:true})).toBeVisible();await page.getByRole('button',{name:'Record moisture',exact:true}).click();
  await drag(page,first,last);await revision(page,2);const recorded=(await saved(page)).document.affectedAreas![0];expect(recorded.surface).toMatchObject({kind:'wall',wallID:'w2',side:'negative'});
  await page.getByRole('button',{name:'2D plan',exact:true}).click();await expect(page.locator('[data-affected-handle]')).toHaveCount(2);
  const handle=page.locator('[data-affected-handle="end"]'),box=(await handle.boundingBox())!,from={x:box.x+box.width/2,y:box.y+box.height/2},a=await planPoint(page,3.5,6),b=await planPoint(page,3,6);
  await drag(page,from,{x:from.x+b.x-a.x,y:from.y+b.y-a.y});await revision(page,3);
  const adjusted=(await saved(page)).document,old=domainBounds(asDomain(recorded.footprint)),now=domainBounds(asDomain(adjusted.affectedAreas![0].footprint));expect(now.minV).toBe(old.minV);expect(now.maxV).toBe(old.maxV);expect(now.maxU).toBeGreaterThan(old.maxU);
  const held=(await handle.boundingBox())!,startHandle={x:held.x+held.width/2,y:held.y+held.height/2};await drag(page,startHandle,{x:startHandle.x+40,y:startHandle.y},false);await expect(page.locator('[data-affected-preview]')).toHaveCount(1);await page.keyboard.press('Escape');await page.mouse.up();expect((await saved(page)).document).toEqual(adjusted);
  await page.getByRole('button',{name:'Undo',exact:true}).click();await revision(page,4);expect((await saved(page)).document.affectedAreas).toEqual([recorded]);
  await page.getByRole('button',{name:'Redo',exact:true}).click();await revision(page,5);expect((await saved(page)).document.affectedAreas).toEqual(adjusted.affectedAreas);
  await page.reload();await page.locator('.spatial-project-card').filter({hasText:original.title}).click();await revision(page,5);
  const archive=await page.evaluate(async()=>{const dp='/src/data/index.ts',bp='/src/data/bytes.ts',data=await import(dp),bytes=await import(bp),store=new data.SpatialWebStore('auxilium-spatial-local-v1');try{const [entry]=await store.list(),f=await store.freeze(entry.documentID,entry.revision),out=await data.exportRevision(f,'local-document'),received=await data.importDocument(out.bytes,out.filename);return{bytes:out.bytes.length,exact:bytes.stableJSON(received)===bytes.stableJSON(f.document),revision:received.revision,hash:await bytes.sha256(bytes.jsonBytes(received)),frozenHash:f.hash};}finally{store.close();}});
  expect(archive.bytes).toBeGreaterThan(0);expect(archive.exact).toBe(true);expect(archive.revision).toBe(5);expect(archive.hash).toBe(archive.frozenHash);
  await mkdir(evidence,{recursive:true});await page.screenshot({path:resolve(evidence,'affected-areas-plan.png'),fullPage:true});
});

test('mobile explicit wall range, floor/ceiling distinction and idle navigation',async({page})=>{
  await page.setViewportSize({width:390,height:844});const d=await start(page,fixture(true));
  await page.getByRole('button',{name:'Objects',exact:true}).click();await page.locator('.spatial-object-list button').filter({hasText:'Wall 3'}).click();await page.getByRole('button',{name:'Affected area',exact:true}).click();await page.getByRole('button',{name:'Record moisture',exact:true}).click();
  await expect(page.getByLabel('Affected bottom',{exact:true})).toHaveValue('');await expect(page.getByLabel('Affected top',{exact:true})).toHaveValue('');
  await page.getByLabel('Affected bottom',{exact:true}).fill('.3');await page.getByLabel('Affected top',{exact:true}).fill('1.7');await page.getByRole('button',{name:'Confirm vertical range',exact:true}).click();
  await drag(page,await planPoint(page,6,6),await planPoint(page,3,6));await revision(page,2);const wall=(await saved(page)).document.affectedAreas![0];expect(domainBounds(asDomain(wall.footprint))).toMatchObject({minV:.3,maxV:1.7});
  for(const [kind,surface] of [['fire','floor'],['moisture','ceiling']] as const){
    await page.getByRole('button',{name:'Objects',exact:true}).click();await page.locator('.spatial-object-list button').filter({hasText:'Synthetic room'}).click();await page.getByRole('button',{name:'Affected area',exact:true}).click();await page.getByLabel('Affected surface',{exact:true}).selectOption({label:surface==='floor'?'Floor, room':'Ceiling, room'});await page.getByRole('button',{name:kind==='fire'?'Record fire damage':'Record moisture',exact:true}).click();
    await drag(page,await planPoint(page,1,1),await planPoint(page,2.5,2.5));await revision(page,kind==='fire'?3:4);
  }
  const records=(await saved(page)).document.affectedAreas!;expect(records.map(a=>a.surface.kind)).toEqual(['wall','floor','ceiling']);expect(records.every(a=>a.measurementStatus==='unverified')).toBe(true);
  await page.getByRole('button',{name:'3D model',exact:true}).click();await expect(page.locator('canvas[data-rendered=true]')).toBeVisible();await page.getByRole('button',{name:'Walk through',exact:true}).click();await expect(page.getByRole('button',{name:'Exit walking',exact:true})).toBeVisible();expect((await saved(page)).document.revision).toBe(4);
  const diagnostics=()=>page.evaluate(async()=>{const p='/src/ui/rendererDiagnostics.ts';return(await import(p)).rendererDiagnostics();});await page.waitForTimeout(100);const before=await diagnostics();await page.waitForTimeout(150);const after=await diagnostics();expect(after.active[0].renderFrames).toBe(before.active[0].renderFrames);expect((await saved(page)).document.floors[0].id).toBe(d.floors[0].id);
  await mkdir(evidence,{recursive:true});await page.screenshot({path:resolve(evidence,'affected-areas-mobile.png'),fullPage:true});
});
