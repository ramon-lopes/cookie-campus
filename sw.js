const PREFIX='cookie-campus:'+self.registration.scope+':';
const CACHE=PREFIX+'v7';
const ASSETS=['./','./index.html','./styles.css','./src/app.js','./src/domain.js','./src/db.js','./src/operations-ui.js','./src/history-ui.js','./src/access.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png',
  './icons/cookies-black.png','./icons/cookies-nutella.png','./icons/cookies-red.png','./icons/cookies-tradicional.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||!event.request.url.startsWith(self.registration.scope))return;event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request).then(cached=>cached||fetch(event.request).catch(()=>event.request.mode==='navigate'?cache.match('./index.html'):Response.error()))));});
