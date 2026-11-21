import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mutate, read } from "../src/db.js";
import { financial, SalePriceChangedError, stock } from "../src/domain.js";

test("Venda Rápida exige rever preços atualizados antes de gravar", async () => {
  const dayId = "day";
  await mutate({
    id: dayId,
    type: "open",
    items: [{ flavorId: "f0", qty: 3 }, { flavorId: "f1", qty: 2 }],
  });
  const command = {
    id: "sale",
    type: "sale",
    expectedDayId: dayId,
    items: [{ flavorId: "f0", qty: 1 }, { flavorId: "f1", qty: 1 }],
    expectedPrices: { f0: 1200, f1: 1200 },
    method: "Pix",
  };

  // Another tab changes both prices. The cart total stays the same.
  await mutate({ id: "price-up", type: "flavor", flavorId: "f0", name: "Nutella", price: 1500 });
  await mutate({ id: "price-down", type: "flavor", flavorId: "f1", name: "Ninho com Nutella", price: 900 });
  const before = await read();
  await assert.rejects(mutate(command), (error) => {
    assert.ok(error instanceof SalePriceChangedError);
    assert.deepEqual(error.items.map(({ price }) => price), [1500, 900]);
    return true;
  });
  assert.deepEqual(await read(), before);

  // Even a previously reviewed price must be checked again in the write transaction.
  await mutate({ id: "price-again", type: "flavor", flavorId: "f0", name: "Nutella", price: 1600 });
  const afterSecondChange = await read();
  await assert.rejects(mutate({ ...command, expectedPrices: { f0: 1500, f1: 900 } }), SalePriceChangedError);
  assert.deepEqual(await read(), afterSecondChange);

  const confirmed = { ...command, expectedPrices: { f0: 1600, f1: 900 } };
  const saved = await mutate(confirmed);
  assert.deepEqual(await mutate(confirmed), saved);
  assert.equal(saved.sales.length, 1);
  assert.deepEqual(saved.sales[0].items.map(({ price }) => price), [1600, 900]);
  assert.equal(saved.payments.length, 1);
  assert.equal(financial(saved, dayId).cashNet, 2500);
  assert.equal(stock(saved, dayId, "f0").available, 2);
  assert.equal(stock(saved, dayId, "f1").available, 1);

  const stable = await mutate({ ...confirmed, id: "stable-price", method: "Pendente" });
  assert.equal(stable.sales.length, 2);
  assert.equal(financial(stable, dayId).pending, 2500);
  assert.equal(financial(stable, dayId).cashNet, 2500);
});
