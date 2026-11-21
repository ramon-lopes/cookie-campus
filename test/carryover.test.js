import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { read, mutate, restore, readAccess, writeAccess } from "../src/db.js";
import { apply, backup, businessDate, financial, initial, nextOpening, parseBackup, stock } from "../src/domain.js";

process.env.TZ = "America/Sao_Paulo";

const counts = (state, dayId) =>
  Object.fromEntries(state.flavors.map((f) => [f.id, stock(state, dayId, f.id).available]));
const nutella = (qty) => [{ flavorId: "f0", qty }];
const first = { type: "open", id: "dia-17", at: "2026-11-17T14:00:00-03:00", items: nutella(5) };

test("17 → 18/11: confirmação de três sobras + cinco recebidas sem mover as vendas", () => {
  let s = apply(initial(), first);
  s = apply(s, { id: "venda-17", type: "sale", items: nutella(2), method: "Pix" });
  s = apply(s, { id: "fechar-17", type: "close", counts: counts(s, first.id), carryover: { f0: 3 } });
  const opening = { id: "dia-18", type: "open", at: "2026-11-18T14:00:00-03:00", items: nutella(5) };
  s = apply(s, opening);
  assert.deepEqual(s.days.map(businessDate), ["2026-11-17", "2026-11-18"]);
  const { carried, received, available } = stock(s, opening.id, "f0");
  assert.deepEqual([carried, received, available], [3, 5, 8]);
  const transfer = s.events.find((e) => e.kind === "carryover");
  assert.equal(transfer.sourceDayId, first.id);
  assert.equal(transfer.dayId, opening.id);
  assert.equal(stock(s, first.id, "f0").available, 3);
  s = apply(s, { id: "venda-18", type: "sale", items: nutella(1), method: "Pendente" });
  assert.equal(financial(s, first.id).gross, 2400);
  assert.equal(financial(s, opening.id).gross, 1200);
  assert.deepEqual(parseBackup(backup(s)), s);
  const duplicate = structuredClone(s);
  duplicate.events.push({ ...transfer, id: "transferencia-duplicada" });
  assert.throws(() => parseBackup(JSON.stringify({ format: "cookies-campus", data: duplicate })), /Reaproveitamento inconsistente/);
});

test("somente a seleção confirmada passa à próxima venda após um intervalo", () => {
  let s = apply(initial(), first);
  assert.throws(() => apply(s, {
    id: "fechamento-invalido", type: "close", counts: counts(s, first.id), carryover: { f0: 6 },
  }), /acima da contagem física/);
  s = apply(s, { id: "fechar", type: "close", counts: counts(s, first.id), carryover: { f0: 2 } });
  s = apply(s, { id: "uma-semana", type: "open", at: "2026-11-24T14:00:00-03:00" });
  assert.equal(stock(s, "uma-semana", "f0").available, 2);
  assert.equal(stock(s, first.id, "f0").available, 5);
});

test("reserva ocupa o estoque livre, bloqueia novas operações e pode ser concluída", () => {
  let s = apply(initial(), first);
  const request = { id: "reserva", type: "reserve", customer: "Cliente teste", location: "Pátio/Cantina", items: nutella(5) };
  s = apply(s, request);
  assert.equal(stock(s, first.id, "f0").available, 0);
  assert.throws(() => apply(s, { id: "venda", type: "sale", items: nutella(1), method: "Pix" }), /Estoque insuficiente/);
  assert.throws(() => apply(s, { ...request, id: "reserva-extra", items: nutella(1) }), /Estoque insuficiente/);
  assert.throws(() => apply(s, { id: "fechar", type: "close", counts: counts(s, first.id) }), /reservas pendentes/);
  s = apply(s, { id: "retirada", type: "complete", reservationId: request.id, method: "Pix" });
  assert.equal(stock(s, first.id, "f0").sold, 5);
  assert.equal(stock(s, first.id, "f0").reserved, 0);
});

test("pagamento e devolução pendentes sobrevivem à abertura seguinte", () => {
  let s = apply(initial(), first);
  s = apply(s, { id: "a-receber", type: "sale", items: nutella(1), method: "Pendente" });
  s = apply(s, { id: "paga", type: "sale", items: nutella(1), method: "Pix" });
  s = apply(s, { id: "estorno", type: "void", saleId: "paga", reason: "Pedido cancelado" });
  s = apply(s, { id: "fechar", type: "close", counts: counts(s, first.id), carryover: { f0: 4 } });
  s = apply(s, { id: "dia-18", type: "open", at: "2026-11-18T14:00:00-03:00" });
  assert.deepEqual([financial(s).pending, financial(s).refundPending], [1200, 1200]);
  s = apply(s, { id: "recebimento", type: "payment", saleId: "a-receber", method: "Pix" });
  s = apply(s, { id: "devolucao", type: "refund", saleId: "paga", method: "Dinheiro" });
  const oldDay = financial(s, first.id), newDay = financial(s, "dia-18");
  assert.deepEqual([oldDay.gross, oldDay.cashNet, newDay.gross, newDay.collected, newDay.refunded, newDay.cashNet],
    [1200, 1200, 0, 1200, 1200, 0]);
  assert.deepEqual([financial(s).pending, financial(s).refundPending], [0, 0]);
  assert.equal(stock(s, "dia-18", "f0").available, 4);
});

test("restauração valida o formato legado, preserva sessões da mesma data e a senha local", async () => {
  let s = apply(initial(), first);
  s = apply(s, { id: "fechar-legado", type: "close", counts: counts(s, first.id) });
  delete s.days[0].carryover;
  delete s.days[0].businessDate;
  s = apply(s, { ...first, id: "outro-17", items: [] });
  const access = { id: "teste", password: { salt: new Uint8Array(16), hash: new Uint8Array(32) } };
  await writeAccess(access, null);
  await assert.rejects(writeAccess({ id: "outra-aba" }, null), /mudou em outra aba/);
  const oldBackup = JSON.stringify({ format: "cookies-campus", data: s });
  const restored = await restore(parseBackup(oldBackup), { confirmed: true, expectedState: JSON.stringify(await read()) });
  assert.deepEqual(restored, s);
  assert.deepEqual(await readAccess(), access);
  assert.equal(stock(restored, "outro-17", "f0").available, 0);
});

test("IndexedDB impede consumo concorrente, repetido e reenvio de formulário antigo", async () => {
  let s = apply(initial(), first);
  s = apply(s, { id: "fechar", type: "close", counts: counts(s, first.id), carryover: { f0: 3 } });
  await restore(s, { confirmed: true, expectedState: JSON.stringify(await read()) });
  const opening = {
    id: "dia-18", type: "open", expectedDayId: null, expectedPreviousDayId: nextOpening(s).previousDayId,
    at: "2026-11-18T14:00:00-03:00", items: nutella(5),
  };
  const [accepted, conflict] = await Promise.allSettled([mutate(opening), mutate({ ...opening, id: "outra-aba" })]);
  assert.equal(accepted.status, "fulfilled");
  assert.equal(conflict.status, "rejected");
  assert.deepEqual(await mutate(opening), await read());
  assert.equal(stock(await read(), opening.id, "f0").available, 8);
  await mutate({ type: "close", id: "fechar-18", counts: counts(await read(), opening.id) });
  await assert.rejects(mutate({ ...opening, id: "formulario-antigo" }), /histórico de dias mudou/);
  assert.equal((await read()).events.filter((e) => e.kind === "carryover").length, 1);
});
