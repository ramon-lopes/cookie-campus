import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {read,restore,recoveryCopies,mutate,connect,recoveryCopy} from '../src/db.js';
import {initial} from '../src/domain.js';
const confirmed=async data=>restore(data,{confirmed:true,expectedState:JSON.stringify(await read())});
test('restauração exige consentimento e detecta estado alterado por outra aba',async()=>{
 const original=await read();await assert.rejects(restore(initial()),/explicitamente/);await assert.rejects(restore(initial(),{confirmed:false,expectedState:JSON.stringify(original)}));assert.deepEqual(await read(),original);
 await mutate({id:'changed',type:'flavor',name:'Novo',price:1300});
 await assert.rejects(restore(initial(),{confirmed:true,expectedState:JSON.stringify(original)}),/mudaram/);assert.equal((await read()).flavors.length,7);assert.equal((await recoveryCopies()).length,0);
});
test('restaurações sucessivas preservam todas as cópias e a chave legada',async()=>{
 const db=await connect(),legacy=initial();await new Promise((resolve,reject)=>{const tx=db.transaction('app','readwrite');tx.objectStore('app').put(legacy,'before-restore');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 const first=await read();await confirmed(initial());const second=await read();await mutate({id:'second',type:'flavor',name:'Outro',price:1400});const third=await read();await confirmed(second);
 const copies=await recoveryCopies();assert.equal(copies.length,3);assert.deepEqual(await recoveryCopy(),legacy);assert.ok(copies.some(c=>JSON.stringify(c.data)===JSON.stringify(first)));assert.ok(copies.some(c=>JSON.stringify(c.data)===JSON.stringify(third)));
});
test('falha ao gravar cópia ou estado desfaz toda a restauração',async()=>{
 const before=await read(),copies=await recoveryCopies();
 const add=IDBObjectStore.prototype.add;
 try{IDBObjectStore.prototype.add=function(){throw new DOMException('Sem espaço','QuotaExceededError');};await assert.rejects(confirmed(initial()),/Sem espaço/);}finally{IDBObjectStore.prototype.add=add;}
 assert.deepEqual(await read(),before);assert.deepEqual(await recoveryCopies(),copies);
 const put=IDBObjectStore.prototype.put;
 try{IDBObjectStore.prototype.put=function(value,key){if(key==='state'){this.transaction.abort();return;}return put.call(this,value,key);};await assert.rejects(confirmed(initial()),/cancelada/);}finally{IDBObjectStore.prototype.put=put;}
 assert.deepEqual(await read(),before);assert.deepEqual(await recoveryCopies(),copies);
});
test('arquivo inválido não cria cópia nem substitui dados',async()=>{const before=await read(),copies=await recoveryCopies();await assert.rejects(confirmed({...initial(),version:2}));assert.deepEqual(await read(),before);assert.deepEqual(await recoveryCopies(),copies);});
test('edição de reserva disputa estoque na mesma transação',async()=>{await confirmed(initial());await mutate({id:'editday',type:'open',items:[{flavorId:'f0',qty:2},{flavorId:'f1',qty:1}]});await mutate({id:'r',type:'reserve',customer:'A',location:'K',items:[{flavorId:'f0',qty:1}]});const results=await Promise.allSettled([mutate({id:'edit-r',type:'edit-reservation',reservationId:'r',expectedRevision:0,customer:'A',location:'K',items:[{flavorId:'f1',qty:1}]}),mutate({id:'competing',type:'sale',method:'Pix',items:[{flavorId:'f1',qty:1}]})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const state=await read();assert.equal(state.reservations[0].items[0].flavorId,'f1');assert.equal(state.sales.length,0);});
