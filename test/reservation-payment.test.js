import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, backup, financial, initial, parseBackup, PICKUP_LOCATIONS, stock } from "../src/domain.js";
import { read, mutate, restore } from "../src/db.js";

const firstAt = "2026-11-19T14:00:00-03:00";
const secondAt = "2026-11-20T14:00:00-03:00";
const items = [{ flavorId: "f0", qty: 2 }, { flavorId: "f4", qty: 1 }];
const first = {
  type: "open", id: "dia-1", at: firstAt,
  items: [{ flavorId: "f0", qty: 5 }, { flavorId: "f4", qty: 3 }],
};
const second = { type: "open", id: "dia-2", at: secondAt };
const reserve = {
  type: "reserve", id: "reserva", customer: "Cliente fictício",
  location: "Bloco I Central", items, at: firstAt,
};
const receipt = {
  type: "reservation-payment", id: "adiantamento", reservationId: reserve.id,
  expectedRevision: 0, method: "Pix", at: "2026-11-19T15:00:00-03:00",
  receivedAt: "2026-11-19T14:30:00-03:00",
};
const pickup = {
  type: "complete", id: "retirada", reservationId: reserve.id, expectedRevision: 1,
};
const cancel = { type: "cancel", id: "cancelar", reservationId: reserve.id, expectedRevision: 1 };
const reserved = () => apply(apply(initial(), first), reserve);
const prepaid = () => apply(reserved(), receipt);
const ledger = (state, dayId) => {
  const { gross, collected, refunded, cashNet, pending, refundPending, voided } = financial(state, dayId);
  return { gross, collected, refunded, cashNet, pending, refundPending, voided };
};
function closeFirst(state) {
  const counts = Object.fromEntries(state.flavors.map((f) => [f.id, stock(state, first.id, f.id).available]));
  return apply(state, {
    type: "close", id: "fechamento", at: "2026-11-19T19:00:00-03:00", counts, carryover: { f0: 3, f4: 2 },
  });
}

test("novas reservas exigem local da lista; local legado permanece até ser trocado", () => {
  assert.deepEqual(PICKUP_LOCATIONS, [
    "Bloco C", "Bloco D", "Bloco I Central", "Bloco K", "Educação Física",
    "Farmácia", "Odonto", "Pátio/Cantina",
  ]);
  for (const location of ["", "Selecione o local", "Restaurante"]) {
    assert.throws(() => apply(apply(initial(), first), { ...reserve, location }), /Selecione o local/);
  }
  const legacy = reserved();
  legacy.reservations[0].location = "  Portaria antiga  ";
  const edit = {
    type: "edit-reservation", id: "editar", reservationId: reserve.id, expectedRevision: 0,
    customer: "Cliente fictício editado", items,
  };
  let state = apply(parseBackup(backup(legacy)), edit);
  assert.equal(state.reservations[0].location, legacy.reservations[0].location);
  state = apply(state, { ...edit, id: "mudar-local", expectedRevision: 1, location: "Farmácia" });
  assert.equal(state.reservations[0].location, "Farmácia");
});

test("Pix e retirada no mesmo dia reutilizam o pagamento, com valor, data e estoque estáveis", () => {
  const before = reserved();
  assert.throws(() => apply(before, { ...receipt, receivedAt: "2026-11-20T15:00:00-03:00" }), /data de recebimento/);
  const paid = apply(before, receipt);
  assert.equal(apply(paid, receipt), paid);
  assert.throws(() => apply(paid, { ...receipt, id: "outra-tentativa" }), /já paga/);
  assert.throws(() => apply(paid, { ...cancel, expectedRevision: 0 }), /reserva mudou/);
  assert.equal(paid.sales.length, 0);
  assert.deepEqual(ledger(paid, first.id), {
    gross: 0, collected: 3600, refunded: 0, cashNet: 3600, pending: 0, refundPending: 0, voided: 0,
  });
  assert.equal(stock(paid, first.id, "f0").reserved, 2);
  const edit = {
    type: "edit-reservation", id: "editar-pago", reservationId: reserve.id, expectedRevision: 1,
    customer: "Cliente fictício editado", location: "Odonto",
  };
  assert.throws(() => apply(paid, { ...edit, items: [{ flavorId: "f0", qty: 1 }] }), /já estão confirmados/);
  const updated = apply(paid, edit);
  const command = { ...pickup, expectedRevision: 2 };
  const done = apply(updated, command);
  assert.equal(apply(done, command), done);
  assert.throws(() => apply(done, { ...command, id: "nova-retirada" }), /já processada/);
  assert.deepEqual(done.payments, [{ ...paid.payments[0], saleId: pickup.id }]);
  assert.equal(done.payments[0].at, receipt.receivedAt);
  assert.deepEqual(ledger(done, first.id), { ...ledger(paid, first.id), gross: 3600 });
  assert.deepEqual([stock(done, first.id, "f0").available, stock(done, first.id, "f0").sold], [3, 2]);
  assert.deepEqual(parseBackup(backup(done)), done);
});

test("retirada no próximo dia reconhece a venda e usa o estoque separado no primeiro", () => {
  let state = closeFirst(prepaid());
  assert.equal(state.reservations[0].status, "pending");
  assert.throws(() => apply(state, pickup), /Abra um dia/);
  state = apply(state, second);
  state = apply(state, { ...pickup, at: secondAt });
  assert.deepEqual(state.days[0].counts, closeFirst(prepaid()).days[0].counts);
  assert.equal(state.reservations[0].finishedDayId, second.id);
  assert.equal(state.sales[0].dayId, second.id);
  assert.equal(state.payments[0].dayId, first.id);
  const openingStock = stock(state, second.id, "f0");
  assert.deepEqual([openingStock.available, openingStock.carried, openingStock.fulfilledFromHeld], [3, 3, 2]);
  assert.deepEqual([financial(state, first.id).gross, financial(state, first.id).cashNet], [0, 3600]);
  assert.deepEqual([financial(state, second.id).gross, financial(state, second.id).cashNet], [3600, 0]);
  assert.deepEqual(parseBackup(backup(state)), state);

  state = apply(state, { type: "void", id: "estorno", saleId: pickup.id, reason: "Devolução fictícia", at: secondAt });
  assert.equal(stock(state, first.id, "f0").available, 3);
  assert.equal(stock(state, second.id, "f0").available, 5);
  assert.equal(stock(state, second.id, "f4").available, 3);
  assert.equal(financial(state, second.id).refundPending, 3600);
  assert.equal(financial(state, second.id).voided, 3600);
  assert.equal(financial(state, first.id).voided, 0);
});

test("pagamento na retirada continua em um passo e admite pagamento pendente", () => {
  const before = reserved();
  const cash = apply(before, { ...pickup, expectedRevision: 0, method: "Dinheiro" });
  assert.equal(cash.payments[0].saleId, cash.sales[0].id);
  assert.equal(financial(cash, first.id).cashMethods.Dinheiro, 3600);
  const unpaid = apply(before, { ...pickup, expectedRevision: 0, method: "Pendente" });
  assert.equal(unpaid.payments.length, 0);
  assert.equal(financial(unpaid).pending, 3600);
  assert.equal(stock(unpaid, first.id, "f0").available, 3);
});

test("cancelamento libera somente os itens reservados; caixa muda após a devolução", () => {
  const paid = prepaid();
  const sameDay = apply(paid, cancel);
  assert.equal(stock(sameDay, first.id, "f0").available, 5);
  let state = apply(apply(closeFirst(paid), second), { ...cancel, at: secondAt });
  assert.equal(apply(state, cancel), state);
  assert.throws(() => apply(state, { ...cancel, id: "novo-cancelamento" }), /já processada/);
  assert.equal(state.sales.length, 0);
  assert.equal(state.payments.length, 1);
  assert.deepEqual([stock(state, second.id, "f0").returned, stock(state, second.id, "f4").returned], [2, 1]);
  assert.deepEqual([stock(state, second.id, "f0").available, stock(state, second.id, "f4").available], [5, 3]);
  assert.equal(stock(state, first.id, "f0").available, 3);
  assert.equal(financial(state, second.id).refundPending, 3600);
  assert.equal(financial(state, second.id).cashNet, 0);
  const refund = { type: "refund", id: "reembolso", reservationId: reserve.id, method: "Dinheiro", at: secondAt };
  state = apply(state, refund);
  assert.equal(apply(state, refund), state);
  assert.throws(() => apply(state, { ...refund, id: "novo-reembolso" }), /já registrado/);
  assert.equal(financial(state, second.id).cashNet, -3600);
  assert.equal(financial(state, first.id).cashNet, 3600);
  assert.equal(financial(state).refundPending, 0);
  assert.equal(financial(state).voided, 0);
  assert.deepEqual(parseBackup(backup(state)), state);
});

test("vendas e caixa separam estorno, reembolso posterior e recebimento pendente", () => {
  let state = apply(apply(initial(), first), { type: "sale", id: "mantida", method: "Pendente", items: [{ flavorId: "f0", qty: 1 }], at: firstAt });
  state = apply(state, { type: "sale", id: "paga", method: "Pix", items: [{ flavorId: "f0", qty: 2 }], at: firstAt });
  assert.equal(financial(state, first.id).gross, 3600);
  state = apply(state, { type: "void", id: "estorno", saleId: "paga", reason: "Teste", at: firstAt });
  assert.deepEqual(ledger(state, first.id), {
    gross: 1200, collected: 2400, refunded: 0, cashNet: 2400, pending: 1200, refundPending: 2400, voided: 2400,
  });
  state = apply(closeFirst(state), second);
  assert.throws(() => apply(state, { type: "void", id: "estorno-tardio", saleId: "mantida", reason: "Teste", at: secondAt }), /dia aberto/);
  state = apply(state, { type: "refund", id: "devolvido", saleId: "paga", method: "Pix", at: secondAt });
  assert.equal(financial(state, first.id).cashNet, 2400);
  assert.equal(financial(state, second.id).cashNet, -2400);
  assert.equal(financial(state, second.id).gross, 0);
  assert.equal(financial(state, second.id).voided, 0);
  assert.equal(financial(state).gross, 1200);
  assert.equal(financial(state).cashNet, 0);
});

test("restauração rejeita vínculos duplicados, valor incorreto e retirada sem vínculo", () => {
  const snapshot = prepaid();
  const malformed = (edit) => {
    const s = structuredClone(snapshot);
    edit(s);
    return JSON.stringify({ format: "cookies-campus", data: s });
  };
  assert.throws(() => parseBackup(malformed((s) => s.payments.push({ ...s.payments[0], id: "outro" }))), /duplicado/);
  assert.throws(() => parseBackup(malformed((s) => { s.payments[0].amount = 1; })), /Pagamento inválido/);
  const done = apply(snapshot, pickup);
  delete done.payments[0].saleId;
  assert.throws(() => parseBackup(JSON.stringify({ format: "cookies-campus", data: done })), /Pagamento inválido/);
});

test("IndexedDB aborta pagamento incompleto e grava uma vez após reenvio concorrente", async () => {
  const confirmed = async (data) =>
    restore(parseBackup(backup(data)), { confirmed: true, expectedState: JSON.stringify(await read()) });
  await confirmed(reserved());
  const before = await read();
  const put = IDBObjectStore.prototype.put;
  try {
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (args[1] === "state") this.transaction.abort();
      return request;
    };
    await assert.rejects(mutate(receipt), /cancelada/);
  } finally {
    IDBObjectStore.prototype.put = put;
  }
  assert.deepEqual(await read(), before);
  await Promise.all([mutate(receipt), mutate(receipt)]);
  assert.equal((await read()).payments.length, 1);
  const [firstPickup, duplicatePickup] = await Promise.allSettled([
    mutate(pickup), mutate({ ...pickup, id: "retirada-em-outra-aba" }),
  ]);
  assert.equal(firstPickup.status, "fulfilled");
  assert.equal(duplicatePickup.status, "rejected");
  const persisted = await read();
  assert.equal(persisted.sales.length, 1);
  assert.equal(persisted.payments.length, 1);
  assert.equal(persisted.payments[0].saleId, pickup.id);
  assert.deepEqual(await confirmed(persisted), persisted);
});
