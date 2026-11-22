const PREFIX='cookie-campus:'+self.registration.scope+':';
const CACHE=PREFIX+CACHE_VERSION;
self.addEventListener('install', event => {
  const requests = ASSETS.map(asset => new Request(new URL(asset, self.registration.scope), { cache: "reload" }));
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(requests)));
});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||!event.request.url.startsWith(self.registration.scope))return;event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request).then(cached=>cached||fetch(event.request).catch(()=>event.request.mode==='navigate'?cache.match('./index.html'):Response.error()))));});
