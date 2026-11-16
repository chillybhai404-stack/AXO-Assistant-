const V='axo-v20';
self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/')) return;
  // static files: show cached copy instantly, refresh in background; pages: network first
  if(u.pathname.startsWith('/static/')){
    e.respondWith(caches.open(V).then(async c=>{const hit=await c.match(e.request);const net=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r;}).catch(()=>hit);return hit||net;}));
  } else {
    e.respondWith(fetch(e.request).then(r=>{if(r.ok&&u.pathname==='/'){const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp));}return r;}).catch(()=>caches.match(e.request)));
  }
});
