import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import vm from 'node:vm';
test('PWA: recursos locais, instalação e resposta offline do Service Worker',async()=>{
 const code=await readFile('sw.js','utf8'),events={},cached=new Map();
 const cache={addAll:async assets=>{for(const path of assets){await access(path==='./'?'index.html':path);cached.set(path,{body:path});}},match:async req=>cached.get(typeof req==='string'?req:new URL(req.url).pathname.replace('/repo/','./'))};
 const removed=[];
 const context={self:{registration:{scope:'https://test.example/repo/'},addEventListener:(type,fn)=>events[type]=fn,clients:{claim:async()=>{}}},caches:{open:async()=>cache,keys:async()=>['cookie-campus-v2','cookie-campus:https://test.example/repo/:v2','cookie-campus:https://test.example/other/:v2'],delete:async key=>removed.push(key)},URL,Response,fetch:async()=>{throw Error('offline');}};
 vm.runInNewContext(code,context);
 let work;events.install({waitUntil:p=>work=p});await work;
 for(const asset of ['./index.html','./styles.css','./manifest.webmanifest','./src/app.js','./src/domain.js','./src/db.js','./src/operations-ui.js','./src/history-ui.js','./src/access.js'])assert.ok(cached.has(asset),asset);
 for(const flavor of ['black','nutella','red','tradicional'])assert.ok(cached.has(`./icons/cookies-${flavor}.png`),flavor);
 events.activate({waitUntil:p=>work=p});await work;assert.deepEqual(removed,['cookie-campus:https://test.example/repo/:v2']);
 events.fetch({request:{method:'GET',url:'https://test.example/repo/src/app.js',mode:'cors'},respondWith:p=>work=p});assert.equal((await work).body,'./src/app.js');
 events.fetch({request:{method:'GET',url:'https://test.example/repo/unknown',mode:'navigate'},respondWith:p=>work=p});assert.equal((await work).body,'./index.html');
 const manifest=JSON.parse(await readFile('manifest.webmanifest','utf8'));assert.equal(manifest.start_url,'./');assert.equal(manifest.display,'standalone');for(const icon of manifest.icons)await access(icon.src);
});
