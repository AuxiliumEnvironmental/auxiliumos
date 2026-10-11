import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { chromium } from '@playwright/test';
const root=resolve('dist'), port=4178;
const server=createServer(async(req,res)=>{
  try {const name=decodeURIComponent(new URL(req.url,`http://localhost:${port}`).pathname);const path=resolve(root,'.'+(name==='/'?'/index.html':name));if(!path.startsWith(root+'/'))throw Error('path');const bytes=await readFile(path);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(port,'127.0.0.1',r));
let browser, activePage;const evidence={suite:'Built standalone app, offline close/reopen',passed:false,sourceBuild:'web/dist',claims:'Chromium synthetic behavior only, no iPhone acceptance'};
async function hashes(directory,result={}){for(const entry of await readdir(directory,{withFileTypes:true})){const name=`${directory}/${entry.name}`;if(entry.isDirectory())await hashes(name,result);else if(entry.isFile())result[name]=createHash('sha256').update(await readFile(name)).digest('hex');}return result;}
evidence.inputs={...await hashes('dist'),...await hashes('src')};
for(const name of ['package-lock.json','offlinePlugin.ts','tests/integration/offline.mjs'])evidence.inputs[name]=createHash('sha256').update(await readFile(name)).digest('hex');
try {
  browser=await chromium.launch({executablePath:process.env.SPATIAL_BROWSER_EXECUTABLE,args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();activePage=page;evidence.phase='initial-create';await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByRole('button',{name:/Open example/}).click();
  await page.getByRole('heading',{name:/Courtyard study/}).waitFor();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready; if(!navigator.serviceWorker.controller) await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
  const cacheState=await page.evaluate(async()=>({names:await caches.keys(),controlled:!!navigator.serviceWorker.controller}));
  await page.close();await context.setOffline(true);
  const reopened=await context.newPage();activePage=reopened;evidence.phase='offline-reopen';await reopened.goto(`http://127.0.0.1:${port}/`);
  await reopened.getByRole('button',{name:/Courtyard study/}).click();
  await reopened.getByRole('heading',{name:/Courtyard study/}).waitFor();
  await reopened.getByRole('button',{name:/Living room/}).click();
  await reopened.getByLabel('Room name').fill('Offline corrected room');
  evidence.phase='offline-correction';
  await reopened.getByRole('button',{name:'Save name',exact:true}).click();
  // The optimistic object label can appear before the IndexedDB transaction
  // commits. Reload only after the application's durable-save acknowledgement.
  await reopened.locator('.spatial-save-state').filter({hasText:'Saved locally'}).filter({hasText:'Revision 2'}).waitFor();
  await reopened.getByRole('button',{name:/Offline corrected room/}).waitFor();
  evidence.phase='reopen-acknowledged-correction';
  await reopened.reload();await reopened.getByRole('button',{name:/Courtyard study/}).click();
  await reopened.getByRole('button',{name:/Offline corrected room/}).waitFor();
  evidence.passed=true;evidence.cacheState=cacheState;evidence.browser=browser.version();
  await mkdir('tests/integration/artifacts',{recursive:true});await reopened.screenshot({path:'tests/integration/artifacts/offline-reopen.png'});
}catch(error){evidence.error=String(error);if(activePage){evidence.failureVisibleState=await activePage.locator('body').innerText().catch(()=>'(unavailable)');await activePage.screenshot({path:'tests/integration/artifacts/offline-failure.png'}).catch(()=>{});}process.exitCode=1;}
finally{for(const[name,hash]of Object.entries(evidence.inputs))if(createHash('sha256').update(await readFile(name)).digest('hex')!==hash){evidence.passed=false;evidence.error='Inputs changed during run';process.exitCode=1;}await mkdir('tests/integration/artifacts',{recursive:true});await writeFile('tests/integration/artifacts/offline.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({...evidence,inputs:Object.keys(evidence.inputs).length}));await browser?.close();await new Promise(r=>server.close(r));}
