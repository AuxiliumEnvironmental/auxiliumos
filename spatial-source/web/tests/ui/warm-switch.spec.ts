import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { stressFixture } from './stressFixture';

test.use({baseURL:process.env.SPATIAL_TEST_URL??'http://127.0.0.1:4175',viewport:{width:1440,height:1000}});
const diagnostics=(page:Page)=>page.evaluate(async()=>{const path='/src/ui/rendererDiagnostics.ts';return(await import(path)).rendererDiagnostics();});
async function openModel(page:Page){await page.getByRole('button',{name:'3D model',exact:true}).click();await expect(page.locator('.spatial-model-canvas canvas[data-rendered=true]')).toBeVisible();}
async function openPlan(page:Page){await page.getByRole('button',{name:'2D plan',exact:true}).click();await expect(page.locator('.spatial-plan')).toBeVisible();await expect(page.locator('.spatial-model')).toBeHidden();}

test('warm renderer stays idle and applies the current edited geometry and shared selection on reactivation',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open example'}).click();await openModel(page);
  const initial=await diagnostics(page);expect(initial.active).toHaveLength(1);
  await openPlan(page);const hidden=await diagnostics(page);expect(hidden.active[0]).toMatchObject({id:initial.active[0].id,visible:false});
  await expect(page.getByRole('button',{name:'Walk through'})).toHaveCount(0);await expect(page.locator('.spatial-model')).toHaveAttribute('inert','');
  await page.locator('.spatial-object-list button').filter({hasText:'Door 1'}).click();await page.getByRole('combobox',{name:'Opening type',exact:true}).selectOption('window');await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  await page.waitForTimeout(250);expect((await diagnostics(page)).active[0]).toMatchObject({id:hidden.active[0].id,renderFrames:hidden.active[0].renderFrames});
  const firstVisibleFrame=await page.evaluate(()=>{const previous=document.querySelector('.spatial-model-canvas canvas')!;const button=[...document.querySelectorAll('button')].find(item=>item.textContent==='3D model')!;button.click();return new Promise<{previousConnected:boolean;currentCanvas:boolean}>(resolve=>{const sample=()=>{if(document.querySelector('.spatial-model')!.getClientRects().length){resolve({previousConnected:previous.isConnected,currentCanvas:!!document.querySelector('.spatial-model-canvas canvas')});return;}requestAnimationFrame(sample);};requestAnimationFrame(sample);});});expect(firstVisibleFrame).toEqual({previousConnected:false,currentCanvas:true});
  await expect(page.locator('.spatial-model-canvas canvas[data-rendered=true]')).toBeVisible();const changed=await diagnostics(page);expect(changed.active).toHaveLength(1);expect(changed.active[0].id).not.toBe(initial.active[0].id);expect(changed.released.every((r:{geometries:number;textures:number})=>r.geometries===0&&r.textures===0)).toBe(true);await expect(page.locator('.spatial-inspector h2')).toHaveText('Window 1');
  await page.getByRole('button',{name:'Walk through',exact:true}).click();const canvas=page.locator('.spatial-model-canvas canvas');for(let i=0;i<17;i++)await canvas.press('ArrowRight');const box=await canvas.boundingBox();await page.mouse.click(box!.x+box!.width/2,box!.y+box!.height/2);await expect(page.getByRole('combobox',{name:'Start in',exact:true})).toHaveValue('room-a');await expect(page.locator('.spatial-model-message')).toContainText('Movement stopped');
});

test('warm view suspension cancels held walking and restores an operable orbit and portal walk',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open example'}).click();await openModel(page);const id=(await diagnostics(page)).active[0].id;
  await page.getByRole('button',{name:'Walk through',exact:true}).click();await page.getByRole('button',{name:'Walk forward',exact:true}).dispatchEvent('pointerdown',{pointerId:8});
  await page.getByRole('button',{name:'2D plan',exact:true}).press('Enter');await expect(page.locator('.spatial-model')).toBeHidden();const hidden=await diagnostics(page);await page.waitForTimeout(300);expect((await diagnostics(page)).active[0].renderFrames).toBe(hidden.active[0].renderFrames);
  await openModel(page);expect((await diagnostics(page)).active[0].id).toBe(id);await expect(page.getByRole('button',{name:'Orbit',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('combobox',{name:'Start in',exact:true}).selectOption('room-a');await page.getByRole('button',{name:'Walk through',exact:true}).click();const canvas=page.locator('.spatial-model-canvas canvas');for(let i=0;i<14;i++)await canvas.press('w');await expect(page.getByRole('combobox',{name:'Start in',exact:true})).toHaveValue('room-b');await canvas.press('Escape');await expect(page.getByRole('button',{name:'Orbit',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('warm renderer recovers a lost context and releases all resources on actual document close',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open example'}).click();await openModel(page);const first=(await diagnostics(page)).active[0].id;
  await page.locator('.spatial-model-canvas canvas').evaluate((canvas:HTMLCanvasElement)=>{const extension=canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context');if(!extension)throw new Error('Test environment lacks context-loss injection');extension.loseContext();});
  await expect(page.locator('.spatial-model-message')).toContainText('graphics context was interrupted');await openPlan(page);await openModel(page);await expect(page.locator('.spatial-model-message')).not.toContainText('interrupted');expect((await diagnostics(page)).active[0].id).not.toBe(first);
  await openPlan(page);await page.getByRole('button',{name:'Auxilium Spatial saved layouts',exact:true}).click();await expect(page.locator('.spatial-model')).toHaveCount(0);const closed=await diagnostics(page);expect(closed.active).toHaveLength(0);expect(closed.released.every((r:{geometries:number;textures:number})=>r.geometries===0&&r.textures===0)).toBe(true);
  await page.locator('.spatial-project-card').filter({hasText:'Courtyard study'}).click();await expect(page.locator('.spatial-model')).toHaveCount(0);await openModel(page);expect((await diagnostics(page)).active).toHaveLength(1);
});

test('warm reactivation retries initial graphics unavailability without an automatic retry loop',async({page})=>{
  await page.addInitScript(()=>{
    const runtime=window as unknown as {allowTestGraphics:boolean;failedContextRequests:number};runtime.allowTestGraphics=false;runtime.failedContextRequests=0;
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type==='webgl2'&&!runtime.allowTestGraphics){runtime.failedContextRequests++;return null;}return Reflect.apply(original,this,[type,...args]);} as typeof original;
  });
  await page.goto('/');await page.getByRole('button',{name:'Open example'}).click();await page.getByRole('button',{name:'3D model',exact:true}).click();await expect(page.locator('.spatial-model-message')).toContainText('3D graphics are unavailable');expect((await diagnostics(page)).active).toHaveLength(0);
  const failures=await page.evaluate(()=>(window as unknown as {failedContextRequests:number}).failedContextRequests);await page.waitForTimeout(250);expect(await page.evaluate(()=>(window as unknown as {failedContextRequests:number}).failedContextRequests)).toBe(failures);
  await openPlan(page);await page.evaluate(()=>{(window as unknown as {allowTestGraphics:boolean}).allowTestGraphics=true;});await openModel(page);await expect(page.getByRole('button',{name:'Walk through',exact:true})).toBeEnabled();expect((await diagnostics(page)).active).toHaveLength(1);await page.getByRole('button',{name:'Auxilium Spatial saved layouts',exact:true}).click();expect((await diagnostics(page)).active).toHaveLength(0);
});

test('warm hidden geometry is released on scope replacement and current authority revocation',async({page})=>{
  await page.goto('/tests/ui/authority.html');await page.getByRole('button',{name:'Open example'}).click();await openModel(page);await openPlan(page);
  await page.getByRole('button',{name:'Switch synthetic profile',exact:true}).click();await expect(page.locator('.spatial-model')).toHaveCount(0);expect((await diagnostics(page)).active).toHaveLength(0);
  await page.getByRole('button',{name:'Open example'}).click();await openModel(page);await openPlan(page);await page.getByRole('button',{name:'Revoke synthetic authority',exact:true}).click();await page.getByRole('button',{name:/Export/}).click();await expect(page.getByRole('heading',{name:'Workspace access is unavailable'})).toBeVisible();await expect(page.locator('.spatial-model')).toHaveCount(0);const revoked=await diagnostics(page);expect(revoked.active).toHaveLength(0);expect(revoked.released.every((r:{geometries:number;textures:number})=>r.geometries===0&&r.textures===0)).toBe(true);
});

test('warm floor replacement discards its hidden renderer instead of retaining a floor cache',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open example'}).click();await openModel(page);const first=(await diagnostics(page)).active[0].id;await openPlan(page);
  await page.getByRole('button',{name:'Manage floors',exact:true}).click();await page.getByLabel('New floor name',{exact:true}).fill('Upper floor');await page.getByRole('button',{name:'Add empty floor',exact:false}).click();await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');await page.getByRole('combobox',{name:'FLOOR',exact:true}).selectOption({label:'Upper floor'});await expect(page.locator('.spatial-model')).toHaveCount(0);expect((await diagnostics(page)).active).toHaveLength(0);
  await page.getByRole('combobox',{name:'FLOOR',exact:true}).selectOption({label:'Ground floor'});await expect(page.locator('.spatial-model')).toHaveCount(0);await openModel(page);expect((await diagnostics(page)).active[0].id).not.toBe(first);
});

test('warm switch timing distinguishes cold creation from reused pilot and geometric stress renderers',async({page,browser})=>{
  test.setTimeout(180000);const records=[];
  const timedSwitch=()=>page.evaluate(()=>new Promise<number>((resolve,reject)=>{const start=performance.now();const button=[...document.querySelectorAll('button')].find(item=>item.textContent==='3D model');if(!button){reject(new Error('Model switch absent'));return;}button.click();const sample=()=>{const canvas=document.querySelector<HTMLCanvasElement>('.spatial-model-canvas canvas');if(canvas?.dataset.rendered==='true'&&canvas.getClientRects().length){requestAnimationFrame(()=>resolve(performance.now()-start));return;}if(performance.now()-start>15000){reject(new Error('First frame timed out'));return;}requestAnimationFrame(sample);};requestAnimationFrame(sample);}));
  for(const workload of ['synthetic-two-room','geometric-stress'] as const){
    await page.goto('/');if(workload==='synthetic-two-room')await page.getByRole('button',{name:'Open example'}).click();else{const fixture=stressFixture();await page.locator('input[type=file]').setInputFiles({name:'warm-stress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});}
    await expect(page.locator('.spatial-save-state')).toContainText('Revision 1');
    const coldMS=await timedSwitch(),initial=await diagnostics(page),samples:number[]=[];const gpu=await page.locator('.spatial-model-canvas canvas').evaluate((canvas:HTMLCanvasElement)=>{const gl=canvas.getContext('webgl2')!,debug=gl.getExtension('WEBGL_debug_renderer_info');return{vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}});
    for(let sample=0;sample<30;sample++){await openPlan(page);await expect(page.locator('.spatial-model-canvas canvas')).toHaveAttribute('data-rendered','false');samples.push(await timedSwitch());expect((await diagnostics(page)).active[0].id).toBe(initial.active[0].id);}
    const sorted=[...samples].sort((a,b)=>a-b);records.push({workload,counts:workload==='synthetic-two-room'?{rooms:2,walls:7,openings:3,overlayMarkers:0}:{rooms:100,walls:1000,openings:500,overlayMarkers:0},coldCreationMS:coldMS,warmSamplesMS:samples,sampleCount:samples.length,sampleP95NearestRankMS:sorted[Math.ceil(sorted.length*.95)-1],medianMS:(sorted[14]+sorted[15])/2,targetMS:500,sampleWithinTarget:sorted[Math.ceil(sorted.length*.95)-1]<=500,gpu,renderer:initial.active[0]});
    await page.getByRole('button',{name:'Auxilium Spatial saved layouts',exact:true}).click();expect((await diagnostics(page)).active).toHaveLength(0);
  }
  await mkdir('tests/ui/artifacts/warm-switch',{recursive:true});await writeFile('tests/ui/artifacts/warm-switch/warm-switch-timing.json',JSON.stringify({browser:browser.version(),environment:'Linux headless Chromium, Vite development build, software WebGL',measurement:'In-page performance.now from programmatic click dispatch to first rendered canvas plus one animation frame. Warm means the current open, unchanged document/floor and its renderer remain allocated; a real close releases them. Each workload starts with separately recorded cold creation.',records,limitations:['Sample percentiles are observations in this exact environment, not physical iPhone acceptance.','The synthetic two-room example is not an agreed field pilot or a physical scan.','The stress workload omits 2000 overlay markers because no shared workspace overlay contract is implemented; full stress acceptance remains open.','Retained buffers trade bounded memory for warm switch latency; actual iPhone memory/thermal/frame-rate profiling remains required.']},null,2));
});
