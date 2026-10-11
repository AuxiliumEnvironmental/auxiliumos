import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import ts from 'typescript';
import { chromium } from '@playwright/test';

// Exercise the actual integration adapter with a synthetic host and a probe
// child. Full editing is tested elsewhere; these cases isolate authority races.
const adapter = resolve('../integration/SpatialPage.tsx');
const runtime = `import React,{createContext,useContext,useMemo,useState} from 'react';
const Runtime=createContext(null); let identity='profile-a', allowed=true, delay=false, deferred;
export const useRuntime=()=>useContext(Runtime);
export function Host({children}) {
 const [profile,setProfile]=useState(identity),[development,setDevelopment]=useState(true);
 const api=useMemo(()=>({loadRuntimeContext:async()=>{if(delay){delay=false;return new Promise((resolve,reject)=>{deferred={resolve,reject};});}if(!allowed)throw Error('Current account denied');return {status:'ready',context:{profileId:identity,development:true}};}}),[]);
 return <Runtime.Provider value={{api,state:{status:'ready',context:{profileId:profile,development}}}}>
 <button onClick={()=>{delay=true;}}>Delay next check</button>
 <button onClick={()=>{identity='profile-b';setProfile(identity);}}>Switch profile</button>
 <button onClick={()=>{allowed=false;}}>Deny current account</button>
 <button onClick={()=>{deferred?.reject(Error('Old account denied'));}}>Reject old check</button>
 <button onClick={()=>setDevelopment(false)}>Disable development context</button>{children}</Runtime.Provider>;
}`;
const probe = `import React from 'react';export function SpatialWorkspace({context}){return <div><output aria-label="Current profile">{context.profileID}</output><button onClick={()=>void context.assertAccess().catch(()=>{})}>Check authority</button></div>;}`;
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{Host}from'synthetic-host';import{SpatialPage}from'${adapter}';createRoot(document.getElementById('root')).render(<Host><SpatialPage/></Host>);`;
const modules = { '\0synthetic-host.tsx':runtime, '\0probe-workspace.tsx':probe, '\0adapter-entry.tsx':entry, '\0empty-style': '' };
const plugin = {
 name:'actual-os-adapter-test',
 resolveId(source, importer) {
  if(source==='/adapter-entry.tsx')return '\0adapter-entry.tsx';
  if(source==='synthetic-host')return '\0synthetic-host.tsx';
  if(importer===adapter){
   if(source==='../lib/runtime')return '\0synthetic-host.tsx';
   if(source.endsWith('spatial-workspace.js'))return '\0probe-workspace.tsx';
   if(source.endsWith('.css'))return '\0empty-style';
  }
 },
 load(id){if(Object.hasOwn(modules,id))return ts.transpileModule(modules[id],{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;},
 configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url!=='/')return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><div id="root"></div><script type="module" src="/adapter-entry.tsx"></script>');});}
};
const server=await createServer({configFile:false,plugins:[plugin],resolve:{dedupe:['react','react-dom']},server:{host:'127.0.0.1',port:4182,strictPort:true,fs:{allow:[resolve('..')]}}});
await server.listen();let browser;
const evidence={suite:'Actual OS adapter authority race regression',passed:false,cases:[],scope:'Synthetic runtime and probe child; not signed-in OS behavior',inputs:{}};
for(const name of ['../integration/SpatialPage.tsx','tests/integration/os-adapter.mjs','package-lock.json'])evidence.inputs[name]=createHash('sha256').update(await readFile(name)).digest('hex');
try {
 browser=await chromium.launch({executablePath:process.env.SPATIAL_BROWSER_EXECUTABLE,args:['--no-sandbox']});
 for(const denyCurrent of [false,true]){
  const page=await browser.newPage();await page.goto('http://127.0.0.1:4182/');
  await page.getByRole('button',{name:'Delay next check',exact:true}).click();
  await page.getByRole('button',{name:'Check authority',exact:true}).click();
  await page.getByRole('button',{name:'Switch profile',exact:true}).click();
  assert.equal(await page.getByLabel('Current profile').innerText(),'profile-b');
  if(denyCurrent){await page.getByRole('button',{name:'Deny current account',exact:true}).click();await page.getByRole('button',{name:'Check authority',exact:true}).click();await page.getByRole('heading',{name:'Spatial access unavailable'}).waitFor();}
  await page.getByRole('button',{name:'Reject old check',exact:true}).click();
  // Wait for React's next committed frame, not an arbitrary timer.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  if(denyCurrent) assert.equal(await page.getByRole('heading',{name:'Spatial access unavailable'}).count(),1);
  else assert.equal(await page.getByLabel('Current profile').innerText(),'profile-b');
  evidence.cases.push(denyCurrent?'Old denial cannot clear current denial':'Old denial cannot hide new profile');await page.close();
 }
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4182/');
 await page.getByRole('button',{name:'Disable development context'}).click();
 await page.getByRole('heading',{name:'Spatial access unavailable'}).waitFor();
 assert.equal(await page.getByLabel('Current profile').count(),0);evidence.cases.push('No workspace mounted for nondevelopment context');
 evidence.passed=true;evidence.browser=browser.version();
}catch(error){evidence.error=String(error);process.exitCode=1;}
finally{
 for(const [name,hash] of Object.entries(evidence.inputs))if(createHash('sha256').update(await readFile(name)).digest('hex')!==hash){evidence.passed=false;evidence.error='Inputs changed during run';process.exitCode=1;}
 await mkdir('tests/integration/artifacts',{recursive:true});await writeFile('tests/integration/artifacts/os-adapter.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));await browser?.close();await server.close();
}
