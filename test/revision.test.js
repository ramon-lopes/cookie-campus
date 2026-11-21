import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apply,initial,stock,financial,localDate,businessDate,validate,backup,parseBackup} from '../src/domain.js';
import {isPrivateData} from '../scripts/check-data.mjs';
let seq=0;
const run=(s,type,data={})=>apply(s,{id:`revision-${++seq}`,type,...data});
const setup=()=>run(initial(),'open',{items:[{flavorId:'f0',qty:5},{flavorId:'f1',qty:3}]});
const reserved=()=>run(setup(),'reserve',{customer:'Ana',location:'Bloco I Central',items:[{flavorId:'f0',qty:2}]});
const edit=(s,items,extra={})=>run(s,'edit-reservation',{reservationId:s.reservations[0].id,expectedRevision:s.reservations[0].revision||0,customer:'Bia',location:'Bloco K',items,...extra});
test('editar reserva libera os itens próprios, troca sabores e mantém auditoria',()=>{
 const before=reserved(),s=edit(before,[{flavorId:'f0',qty:4},{flavorId:'f1',qty:2}]),r=s.reservations[0];
 assert.equal(r.customer,'Bia');assert.equal(r.location,'Bloco K');assert.equal(r.revision,1);
 assert.equal(stock(s,r.dayId,'f0').available,1);assert.equal(stock(s,r.dayId,'f1').available,1);
 assert.deepEqual(s.events.find(e=>e.action==='reservation-edited').before,before.reservations[0]);
 const swapped=edit(s,[{flavorId:'f1',qty:3}]);assert.equal(stock(swapped,r.dayId,'f0').available,5);assert.equal(stock(swapped,r.dayId,'f1').available,0);
});
test('editar acima do estoque não altera reserva nem disponibilidade',()=>{const s=reserved(),copy=structuredClone(s);assert.throws(()=>edit(s,[{flavorId:'f0',qty:1},{flavorId:'f1',qty:4}]),/Estoque insuficiente/);assert.deepEqual(s,copy);});
test('edição não consome unidades de outra reserva e não aceita revisão antiga',()=>{let s=reserved();s=run(s,'reserve',{customer:'Outra',location:'Bloco C',items:[{flavorId:'f0',qty:3}]});assert.throws(()=>edit(s,[{flavorId:'f0',qty:3}]));s=edit(s,[{flavorId:'f0',qty:1}]);assert.throws(()=>edit(s,[{flavorId:'f0',qty:2}],{expectedRevision:0}),/outra aba/);});
test('preço original em sabores mantidos, preço atual em sabores adicionados',()=>{let s=reserved();s=run(s,'flavor',{flavorId:'f0',name:'Nutella',price:1500});s=run(s,'flavor',{flavorId:'f1',name:'Ninho',price:1600});s=edit(s,[{flavorId:'f0',qty:3},{flavorId:'f1',qty:1}]);assert.deepEqual(s.reservations[0].items.map(i=>i.price),[1200,1600]);s=run(s,'complete',{reservationId:s.reservations[0].id,method:'Pix'});assert.equal(financial(s).gross,5200);assert.throws(()=>edit(s,[{flavorId:'f0',qty:1}]),/pendentes/);});
test('edição duplicada é idempotente e cancelamento libera quantidades editadas',()=>{const s=reserved(),cmd={id:'same-edit',type:'edit-reservation',reservationId:s.reservations[0].id,expectedRevision:0,customer:'Ana',location:'Pátio/Cantina',items:[{flavorId:'f1',qty:3}]};const updated=apply(apply(s,cmd),cmd);assert.equal(updated.reservations[0].revision,1);const cancelled=run(updated,'cancel',{reservationId:cmd.reservationId});assert.equal(stock(cancelled,s.days[0].id,'f1').available,3);assert.throws(()=>edit(cancelled,[{flavorId:'f0',qty:1}]));});
test('data comercial usa fuso local; meia-noite mantém dia aberto original',()=>{
 const previous=process.env.TZ;process.env.TZ='America/Sao_Paulo';try{
  const at='2026-11-16T01:30:00.000Z';assert.equal(localDate(at),'2026-11-15');
  let s=run(initial(),'open',{at,items:[{flavorId:'f0',qty:2}]});assert.equal(s.days[0].businessDate,'2026-11-15');assert.equal(s.days[0].label,'2026-11-15');
  s=run(s,'sale',{at:'2026-11-16T04:00:00.000Z',items:[{flavorId:'f0',qty:1}],method:'Pix'});assert.equal(s.sales[0].dayId,s.days[0].id);assert.equal(businessDate(s.days[0]),'2026-11-15');
  assert.equal(businessDate({openedAt:at,label:'2026-11-16'}),'2026-11-15');
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
function close(s){return run(s,'close',{counts:Object.fromEntries(s.flavors.map(f=>[f.id,stock(s,s.days.at(-1).id,f.id).available]))});}
test('pagamento de dia anterior entra no caixa novo sem novo faturamento',()=>{let s=run(setup(),'sale',{items:[{flavorId:'f0',qty:1}],method:'Pendente'});const old=s.days[0].id,v=s.sales[0];s=close(s);assert.throws(()=>run(s,'payment',{saleId:v.id,method:'Pix'}),/Abra um dia/);s=run(s,'open',{items:[]});const next=s.days[1].id;s=run(s,'payment',{saleId:v.id,method:'Dinheiro'});assert.equal(financial(s,old).gross,1200);assert.equal(financial(s,old).cashNet,0);assert.equal(financial(s,next).gross,0);assert.equal(financial(s,next).cashNet,1200);assert.equal(financial(s).pending,0);});
test('estorno não presume reembolso; saída efetiva pode ocorrer em outro dia',()=>{let s=run(setup(),'sale',{items:[{flavorId:'f0',qty:2}],method:'Pix'});const v=s.sales[0],old=s.days[0].id;s=run(s,'void',{saleId:v.id,reason:'Devolução'});assert.equal(financial(s).gross,0);assert.equal(financial(s).voided,2400);assert.equal(financial(s).collected,2400);assert.equal(financial(s).cashNet,2400);assert.equal(financial(s).refundPending,2400);s=close(s);s=run(s,'open',{items:[]});s=run(s,'refund',{saleId:v.id,method:'Dinheiro'});assert.equal(financial(s).cashNet,0);assert.equal(financial(s,old).cashNet,2400);assert.equal(financial(s,s.days[1].id).cashNet,-2400);assert.equal(financial(s).cashMethods.Pix,2400);assert.equal(financial(s).cashMethods.Dinheiro,-2400);assert.equal(financial(s).refundPending,0);assert.throws(()=>run(s,'refund',{saleId:v.id,method:'Pix'}));assert.deepEqual(parseBackup(backup(s)),s);});
test('estorno legado mantém compatibilidade sem reescrever dados',()=>{let s=run(setup(),'sale',{items:[{flavorId:'f0',qty:1}],method:'Pix'});s=run(s,'void',{saleId:s.sales[0].id,reason:'Legado'});delete s.sales[0].refund;delete s.days[0].businessDate;const copy=structuredClone(s);validate(s);assert.equal(financial(s).cashNet,0);assert.equal(financial(s).refunded,1200);assert.deepEqual(s,copy);});
test('backup malformado, referências e reembolso inválidos são rejeitados',()=>{for(const text of ['null','{','[]','{"format":"cookies-campus","data":{}}'])assert.throws(()=>parseBackup(text));const s=run(setup(),'sale',{items:[{flavorId:'f0',qty:1}],method:'Pix'});s.sales[0].refund={status:'paid',method:'Pix',dayId:'missing',at:new Date().toISOString()};assert.throws(()=>validate(s));});
test('proteção detecta backup renomeado e permite metadados npm',()=>{assert.equal(isPrivateData('dados.txt',backup(initial())),true);assert.equal(isPrivateData('dados.json',JSON.stringify(initial())),true);assert.equal(isPrivateData('backups/clientes.txt','qualquer'),true);assert.equal(isPrivateData('package.json','{"name":"cookies-campus"}'),false);});
