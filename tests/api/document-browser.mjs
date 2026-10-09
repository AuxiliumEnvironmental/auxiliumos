import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Real app and provider only. No intercepted responses, session injection,
// screenshots, traces, HAR, storage-state export, or credential artifacts.
export const DOCUMENT_UI_ORIGIN = 'http://127.0.0.1:4179';
const root = fileURLToPath(new URL('../../', import.meta.url));
function childEnvironment() {
  return Object.fromEntries(['PATH','HOME','TMPDIR','TMP','TEMP','SystemRoot','WINDIR','LD_LIBRARY_PATH','PLAYWRIGHT_BROWSERS_PATH']
    .filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
}
export async function startDocumentBrowser(config) {
  assert.ok(!process.env.DEBUG && !process.env.PWDEBUG, 'Disable browser debug logging before hosted acceptance.');
  let occupied = false;
  try { await fetch(DOCUMENT_UI_ORIGIN, {signal: AbortSignal.timeout(500)}); occupied = true; } catch {}
  assert.ok(!occupied, 'The connected-browser port is occupied; an existing app will not be reused.');
  let browser, server, unexpectedEgress = false;
  const step = async (name, run) => { try { return await run(); } catch { throw new Error(`Connected browser failed at ${name}; credentials and provider details omitted.`); } };
  async function close() {
    let closed = true;
    try { await browser?.close(); } catch { closed = false; }
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = new Promise(resolve => server.once('exit', resolve));
      server.kill('SIGTERM'); await Promise.race([exited, delay(3000)]);
      if (server.exitCode === null && server.signalCode === null) { server.kill('SIGKILL'); await Promise.race([exited, delay(3000)]); }
      closed = closed && (server.exitCode !== null || server.signalCode !== null);
    }
    assert.ok(closed, 'Owned browser/app shutdown was not verified.');
  }
  try {
    server = spawn(process.execPath, [fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url)),
      '--config','web/vite.config.ts','--host','127.0.0.1','--port','4179','--strictPort'],
    {cwd: root, stdio:'ignore', env:{...childEnvironment(),VITE_SUPABASE_URL:config.url,VITE_SUPABASE_PUBLISHABLE_KEY:config.publishableKey}});
    let failed = false, ready = false; server.on('error', () => { failed = true; });
    for (let n=0;n<100;n++) {
      assert.ok(!failed && server.exitCode === null, 'Owned application startup failed.');
      try { const r=await fetch(DOCUMENT_UI_ORIGIN,{signal:AbortSignal.timeout(500)}); ready=r.ok && (await r.text()).includes('/src/main.tsx'); } catch {}
      if (ready) break; await delay(150);
    }
    assert.ok(ready, 'Owned application startup timed out.');
    browser = await chromium.launch({headless:true, env:childEnvironment(), executablePath:process.env.AUXILIUMOS_BROWSER_EXECUTABLE || undefined,args:['--disable-dev-shm-usage']});
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
    context.setDefaultTimeout(15000);
    await context.route('**/*',async route=>{
      const request=route.request();
      if (![DOCUMENT_UI_ORIGIN,config.url].includes(new URL(request.url()).origin)
        || Object.values(request.headers()).some(value=>value.includes(config.serviceRoleKey))) {
        unexpectedEgress=true;await route.abort('blockedbyclient');
      } else await route.continue();
    });
    const page=await context.newPage();
    const rpcResponse=name=>page.waitForResponse(r=>r.url()===`${config.url}/rest/v1/rpc/${name}`&&r.request().method()==='POST');
    return {
      close,
      signIn:(email,password)=>step('password sign-in',async()=>{
        await page.goto(DOCUMENT_UI_ORIGIN);
        await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
        const pending=page.waitForResponse(r=>r.url()===`${config.url}/auth/v1/token?grant_type=password`&&r.request().method()==='POST');
        await page.getByRole('button',{name:'Sign in',exact:true}).click();const response=await pending;
        assert.ok(response.ok());const signed=await response.json();
        await expect(page.getByRole('heading',{name:'Accounts',exact:true})).toBeVisible();
        return signed;
      }),
      intake:(doc,profileId,runId)=>step('account/facility access, request submission and triage',async()=>{
        await page.goto(`${DOCUMENT_UI_ORIGIN}/facilities?account=${doc.account_id}`);
        await expect(page.getByRole('heading',{name:'Facilities',exact:true})).toBeVisible();
        await expect(page.getByLabel('Account',{exact:true})).toHaveValue(doc.account_id);
        await page.goto(`${DOCUMENT_UI_ORIGIN}/intake?account=${doc.account_id}`);
        await page.getByRole('button',{name:'New request',exact:true}).click();
        await page.getByLabel('Facility',{exact:true}).selectOption(doc.facility_id);
        await page.getByLabel('Request title',{exact:true}).fill(`Connected browser ${runId}`);
        await page.getByLabel('Original request wording',{exact:true}).fill('Synthetic connected development request. No real client data or PHI.');
        await page.getByLabel('Issue',{exact:true}).selectOption('ISSUE-019');await page.getByLabel('Intent',{exact:true}).selectOption('INTENT-016');
        const submitted=rpcResponse('submit_project_request');await page.getByRole('button',{name:'Submit request',exact:true}).click();
        const response=await submitted;assert.ok(response.ok());const receipt=await response.json();
        await page.getByLabel('Assignee',{exact:true}).selectOption(profileId);
        await page.getByLabel('Request status',{exact:true}).selectOption('intake_completeness_review');
        await page.getByLabel('Next action',{exact:true}).fill('Synthetic development review; no work authorization.');
        await page.getByRole('button',{name:'Save triage',exact:true}).click();
        await expect(page.getByRole('status').filter({hasText:'Triage changes saved'})).toBeVisible();
        return receipt.request_id;
      }),
      upload:(doc,bytes)=>step('private upload and immutable finalization',async()=>{
        await page.goto(`${DOCUMENT_UI_ORIGIN}/documents?account=${doc.account_id}`);
        await page.getByLabel('Facility',{exact:true}).selectOption(doc.facility_id);
        await page.getByLabel('Synthetic UTF-8 text file',{exact:true}).setInputFiles({name:'connected-synthetic.txt',mimeType:'text/plain',buffer:Buffer.from(bytes)});
        await page.getByRole('checkbox',{name:'I am uploading a synthetic fixture with no PHI or real client data.',exact:true}).check();
        const pending=page.waitForResponse(r=>r.url().startsWith(`${config.url}/functions/v1/private-objects/`)&&r.url().endsWith('/finalize')&&r.request().method()==='POST');
        await page.getByRole('button',{name:'Upload synthetic file',exact:true}).click();
        const response=await pending;assert.ok(response.ok());const receipt=await response.json();
        await expect(page.getByRole('heading',{name:'Current security review status',exact:true})).toBeVisible();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Phone page overflows horizontally.');
        return receipt;
      }),
      adopt:doc=>step('cleared exact-source adoption',async()=>{
        await page.getByRole('button',{name:'Refresh security status',exact:true}).click();
        await page.getByRole('button',{name:`View version history: ${doc.title}`,exact:true}).click();
        await page.getByRole('checkbox',{name:'I understand this creates an immutable internal draft and closes ingest access; it does not approve or release the document.',exact:true}).check();
        const pending=rpcResponse('adopt_private_object');await page.getByRole('button',{name:'Create internal draft',exact:true}).click();
        const response=await pending;assert.ok(response.ok());return {receipt:await response.json(),request:response.request().postDataJSON()};
      }),
      download:(version,shouldAllow)=>step(shouldAllow?'authorized exact-version attachment':'current-authority download denial',async()=>{
        const region=page.getByRole('region',{name:`Secure download for version ${version.version_ordinal}`,exact:true});
        const pending=page.waitForResponse(r=>r.url().includes(`/functions/v1/document-version-content/${version.version_id}/content?`)&&r.request().method()==='GET');
        const downloaded=shouldAllow?page.waitForEvent('download'):null;
        await region.getByRole('button',{name:/^(Request|Retry) secure download$/}).click();
        const response=await pending;assert.equal(response.status(),shouldAllow?200:404);
        if (!shouldAllow) { await expect(region.getByRole('alert')).toBeVisible();return null; }
        const attachment=await downloaded;assert.equal(await attachment.failure(),null);
        const path=await attachment.path();assert.ok(path);const bytes=await readFile(path);
        await expect(region.getByRole('status')).toContainText('Browser handoff initiated');return bytes;
      }),
      verify:()=>step('final browser isolation',async()=>{assert.ok(!unexpectedEgress,'Unexpected egress was blocked.');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}),
    };
  } catch { await close();throw new Error('Connected browser initialization failed; private details omitted.'); }
}
