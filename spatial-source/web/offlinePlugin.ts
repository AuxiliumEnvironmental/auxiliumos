import type { Plugin } from 'vite';
// Only the standalone build installs this worker. The OS library never registers
// one, so it cannot cache OS authentication responses or business records.
export function offlineWorkspace(): Plugin {
  return { name: 'spatial-offline-assets', apply: 'build', generateBundle(_options, bundle) {
    const files = [...new Set(['index.html', ...Object.keys(bundle).filter(name => !name.endsWith('.map'))])];
    const fingerprint = files.join('|');
    let hash = 2166136261;
    for (const char of fingerprint) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const version = `auxilium-spatial-shell-v1-${(hash >>> 0).toString(16)}`;
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE=${JSON.stringify(version)};
const ASSETS=${JSON.stringify(files)};
const ROOT=new URL('./',self.location.href);
const URLS=ASSETS.map(path=>new URL(path,ROOT).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('auxilium-spatial-shell-v1-')&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname))return;
  const key=url.origin+url.pathname;
  if(URLS.includes(key))event.respondWith(caches.open(CACHE).then(cache=>cache.match(key)).then(value=>value||fetch(event.request)));
  else if(event.request.mode==='navigate'&&(url.pathname===ROOT.pathname||url.pathname===ROOT.pathname+'index.html'))event.respondWith(caches.open(CACHE).then(cache=>cache.match(new URL('index.html',ROOT).href)).then(value=>value||fetch(event.request)));
});
` });
  } };
}
