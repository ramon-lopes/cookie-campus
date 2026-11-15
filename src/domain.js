export const METHODS = ["Pix", "Dinheiro", "Débito", "Crédito"];
export const initial = () => ({
  version: 1,
  flavors: [
    "Nutella",
    "Ninho com Nutella",
    "Red Nutella",
    "Red Ninho",
    "Oreo com Nutella",
    "Black Bueno",
  ].map((name, i) => ({ id: `f${i}`, name, price: 1200, active: true })),
  days: [],
  reservations: [],
  sales: [],
  payments: [],
  events: [],
  operations: [],
});
const fail = (m) => {
  throw new Error(m);
};
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
const requireInt = (n, min = 0) =>
  integer(n, min) || fail("Informe uma quantidade inteira válida.");
export const opened = (s) => s.days.find((d) => !d.closedAt);
export function localDate(at = new Date()) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Old labels were UTC dates. Derive their commercial date without rewriting stored history.
export const businessDate = (day) =>
  day.businessDate || localDate(day.openedAt);
export function stock(s, dayId, flavorId) {
  const moves = s.events.filter(
    (e) => e.dayId === dayId && e.flavorId === flavorId,
  );
  const received = moves
    .filter((e) => e.kind === "receive")
    .reduce((a, e) => a + e.qty, 0);
  const losses = moves
    .filter((e) => e.kind === "loss")
    .reduce((a, e) => a + e.qty, 0);
  const adjustments = moves
    .filter((e) => e.kind === "adjust")
    .reduce((a, e) => a + e.qty, 0);
  const sold = s.sales
    .filter((v) => v.dayId === dayId && !v.voidedAt)
    .flatMap((v) => v.items)
    .filter((i) => i.flavorId === flavorId)
    .reduce((a, i) => a + i.qty, 0);
  const reserved = s.reservations
    .filter((r) => r.dayId === dayId && r.status === "pending")
    .flatMap((r) => r.items)
    .filter((i) => i.flavorId === flavorId)
    .reduce((a, i) => a + i.qty, 0);
  return {
    received,
    losses,
    adjustments,
    sold,
    reserved,
    available: received + adjustments - losses - sold - reserved,
  };
}
export const total = (items) => items.reduce((a, i) => a + i.qty * i.price, 0);
export function financial(s, dayId) {
  const sales = s.sales.filter(
    (v) => (!dayId || v.dayId === dayId) && !v.voidedAt,
  );
  const payments = s.payments.filter(
    (p) =>
      (!dayId || p.dayId === dayId) &&
      !s.sales.find((v) => v.id === p.saleId)?.voidedAt,
  );
  const collected = s.payments.filter((p) => !dayId || p.dayId === dayId);
  // Legacy voids assumed a completed refund. Keep that interpretation explicit.
  const refunds = s.sales
    .filter((v) => v.voidedAt)
    .flatMap((v) => {
      const p = s.payments.find((p) => p.saleId === v.id);
      return p && (v.refund?.status === "paid" || !v.refund)
        ? [
            {
              amount: p.amount,
              method: v.refund?.method || p.method,
              dayId: v.refund?.dayId || v.dayId,
            },
          ]
        : [];
    })
    .filter((r) => !dayId || r.dayId === dayId);
  const sum = (xs) => xs.reduce((a, x) => a + x.amount, 0);
  return {
    gross: sales.reduce((a, v) => a + total(v.items), 0),
    units: sales.reduce(
      (a, v) => a + v.items.reduce((b, i) => b + i.qty, 0),
      0,
    ),
    pending: sales.reduce(
      (a, v) =>
        a +
        total(v.items) -
        s.payments
          .filter((p) => p.saleId === v.id)
          .reduce((b, p) => b + p.amount, 0),
      0,
    ),
    received: sum(payments),
    methods: Object.fromEntries(
      METHODS.map((m) => [m, sum(payments.filter((p) => p.method === m))]),
    ),
    collected: sum(collected),
    refunded: sum(refunds),
    cashNet: sum(collected) - sum(refunds),
    cashMethods: Object.fromEntries(
      METHODS.map((m) => [
        m,
        sum(collected.filter((p) => p.method === m)) -
          sum(refunds.filter((p) => p.method === m)),
      ]),
    ),
    refundPending: s.sales
      .filter(
        (v) => v.refund?.status === "pending" && (!dayId || v.dayId === dayId),
      )
      .reduce((a, v) => a + total(v.items), 0),
    voided: s.sales
      .filter((v) => v.voidedAt && (!dayId || v.dayId === dayId))
      .reduce((a, v) => a + total(v.items), 0),
  };
}
function itemsFor(s, items, dayId) {
  if (!Array.isArray(items) || !items.length)
    fail("Selecione pelo menos um sabor.");
  const merged = new Map();
  for (const i of items) {
    requireInt(i.qty, 1);
    merged.set(i.flavorId, (merged.get(i.flavorId) || 0) + i.qty);
  }
  return [...merged].map(([flavorId, qty]) => {
    const f = s.flavors.find((f) => f.id === flavorId && f.active);
    if (!f) fail("Sabor indisponível.");
    if (stock(s, dayId, flavorId).available < qty)
      fail(`Estoque insuficiente: ${f.name}.`);
    return { flavorId, name: f.name, qty, price: f.price };
  });
}
export function apply(state, cmd) {
  if (!cmd.id || typeof cmd.id !== "string")
    fail("Operação sem identificador.");
  if (state.operations.includes(cmd.id)) return state;
  const s = structuredClone(state),
    at = cmd.at || new Date().toISOString();
  let d = opened(s);
  const needDay = () => {
    if (!d) fail("Abra um dia de vendas primeiro.");
    return d;
  };
  const pay = (v, method) => {
    if (!METHODS.includes(method)) fail("Forma de pagamento inválida.");
    s.payments.push({
      id: cmd.id + "p",
      saleId: v.id,
      dayId: needDay().id,
      method,
      amount: total(v.items),
      at,
    });
  };
  switch (cmd.type) {
    case "flavor": {
      const name = String(cmd.name || "").trim();
      if (!name || name.length > 80)
        fail("Informe um nome de até 80 caracteres.");
      requireInt(cmd.price, 1);
      const f = s.flavors.find((f) => f.id === cmd.flavorId);
      if (f)
        Object.assign(f, {
          name,
          price: cmd.price,
          active: cmd.active !== false,
        });
      else s.flavors.push({ id: cmd.id, name, price: cmd.price, active: true });
      break;
    }
    case "open": {
      if (d) fail("Já existe um dia aberto.");
      d = {
        id: cmd.id,
        label: localDate(at),
        businessDate: localDate(at),
        openedAt: at,
        closedAt: null,
      };
      s.days.push(d);
      for (const i of cmd.items || []) {
        requireInt(i.qty);
        if (!s.flavors.some((f) => f.id === i.flavorId && f.active))
          fail("Sabor inválido.");
        if (i.qty)
          s.events.push({
            id: cmd.id + i.flavorId,
            dayId: d.id,
            flavorId: i.flavorId,
            kind: "receive",
            qty: i.qty,
            reason: "Estoque inicial",
            at,
          });
      }
      break;
    }
    case "move": {
      needDay();
      if (!s.flavors.some((f) => f.id === cmd.flavorId))
        fail("Sabor inválido.");
      if (!["receive", "loss", "adjust"].includes(cmd.kind))
        fail("Movimento inválido.");
      requireInt(cmd.qty, cmd.kind === "adjust" ? -1000000 : 1);
      if (!cmd.qty) fail("Quantidade não pode ser zero.");
      if (!String(cmd.reason || "").trim()) fail("Descreva o motivo.");
      s.events.push({
        id: cmd.id,
        dayId: d.id,
        flavorId: cmd.flavorId,
        kind: cmd.kind,
        qty: cmd.qty,
        reason: cmd.reason,
        at,
      });
      if (stock(s, d.id, cmd.flavorId).available < 0)
        fail("Movimento deixaria o estoque negativo ou consumiria reservas.");
      break;
    }
    case "reserve": {
      needDay();
      if (
        !String(cmd.customer || "").trim() ||
        !String(cmd.location || "").trim()
      )
        fail("Informe cliente e retirada.");
      s.reservations.push({
        id: cmd.id,
        dayId: d.id,
        customer: cmd.customer.trim(),
        location: cmd.location.trim(),
        items: itemsFor(s, cmd.items, d.id),
        status: "pending",
        at,
      });
      break;
    }
    case "edit-reservation": {
      needDay();
      const r = s.reservations.find((r) => r.id === cmd.reservationId);
      if (!r || r.status !== "pending" || r.dayId !== d.id)
        fail("Só é possível editar reservas pendentes do dia aberto.");
      if (cmd.expectedRevision !== (r.revision || 0))
        fail(
          "Esta reserva mudou em outra aba. Feche e abra a edição novamente.",
        );
      if (
        !String(cmd.customer || "").trim() ||
        !String(cmd.location || "").trim()
      )
        fail("Informe cliente e retirada.");
      const before = structuredClone(r);
      // Release only this reservation inside the cloned transaction state.
      r.status = "editing";
      const priceState = structuredClone(s);
      for (const old of before.items) {
        const f = priceState.flavors.find((f) => f.id === old.flavorId);
        f.active = true;
        f.price = old.price;
      }
      const next = itemsFor(priceState, cmd.items, d.id);
      Object.assign(r, {
        items: next,
        customer: cmd.customer.trim(),
        location: cmd.location.trim(),
        status: "pending",
        revision: (r.revision || 0) + 1,
        updatedAt: at,
      });
      s.events.push({
        id: cmd.id + "edit",
        kind: "audit",
        action: "reservation-edited",
        dayId: d.id,
        at,
        before,
        after: structuredClone(r),
      });
      break;
    }
    case "sale": {
      needDay();
      const v = {
        id: cmd.id,
        dayId: d.id,
        items: itemsFor(s, cmd.items, d.id),
        customer: String(cmd.customer || "").trim(),
        at,
      };
      s.sales.push(v);
      if (cmd.method !== "Pendente") pay(v, cmd.method);
      break;
    }
    case "complete":
    case "cancel": {
      needDay();
      const r = s.reservations.find((r) => r.id === cmd.reservationId);
      if (!r || r.status !== "pending" || r.dayId !== d.id)
        fail("Reserva já processada ou inválida.");
      r.status = cmd.type === "cancel" ? "cancelled" : "completed";
      r.finishedAt = at;
      if (cmd.type === "complete") {
        const v = {
          id: cmd.id,
          dayId: d.id,
          reservationId: r.id,
          items: structuredClone(r.items),
          customer: r.customer,
          at,
        };
        s.sales.push(v);
        if (cmd.method !== "Pendente") pay(v, cmd.method);
      }
      break;
    }
    case "payment": {
      needDay();
      const v = s.sales.find((v) => v.id === cmd.saleId && !v.voidedAt);
      if (!v || s.payments.some((p) => p.saleId === v.id))
        fail("Venda já recebida ou inválida.");
      pay(v, cmd.method);
      break;
    }
    case "void": {
      needDay();
      const v = s.sales.find((v) => v.id === cmd.saleId && !v.voidedAt);
      if (!v) fail("Venda já estornada ou inválida.");
      if (v.dayId !== d.id)
        fail("Só é possível estornar vendas do dia aberto.");
      if (!String(cmd.reason || "").trim())
        fail("Informe o motivo do estorno.");
      v.voidedAt = at;
      v.voidReason = cmd.reason;
      if (s.payments.some((p) => p.saleId === v.id))
        v.refund = { status: "pending" };
      break;
    }
    case "refund": {
      needDay();
      const v = s.sales.find(
        (v) =>
          v.id === cmd.saleId && v.voidedAt && v.refund?.status === "pending",
      );
      if (!v) fail("Reembolso já registrado ou inválido.");
      if (!METHODS.includes(cmd.method)) fail("Forma de reembolso inválida.");
      v.refund = { status: "paid", method: cmd.method, dayId: d.id, at };
      break;
    }
    case "close": {
      needDay();
      if (
        s.reservations.some((r) => r.dayId === d.id && r.status === "pending")
      )
        fail("Conclua ou cancele as reservas pendentes.");
      for (const f of s.flavors) {
        requireInt(cmd.counts?.[f.id]);
        if (cmd.counts[f.id] !== stock(s, d.id, f.id).available)
          fail(
            `Divergência em ${f.name}. Registre uma perda ou ajuste antes de fechar.`,
          );
      }
      d.closedAt = at;
      d.counts = structuredClone(cmd.counts);
      break;
    }
    default:
      fail("Operação desconhecida.");
  }
  s.operations.push(cmd.id);
  s.events.push({
    id: cmd.id + "audit",
    kind: "audit",
    action: cmd.type,
    at,
    dayId: d?.id || null,
  });
  validate(s);
  return s;
}
export function validate(s) {
  if (!s || s.version !== 1) fail("Versão de backup incompatível.");
  for (const k of [
    "flavors",
    "days",
    "reservations",
    "sales",
    "payments",
    "events",
    "operations",
  ])
    if (!Array.isArray(s[k])) fail("Backup incompleto.");
  const unique = (xs) => new Set(xs).size === xs.length;
  for (const k of [
    "flavors",
    "days",
    "reservations",
    "sales",
    "payments",
    "events",
  ])
    if (
      !unique(s[k].map((x) => x.id)) ||
      s[k].some((x) => typeof x.id !== "string")
    )
      fail("Identificadores inválidos.");
  if (!unique(s.operations) || s.operations.some((x) => typeof x !== "string"))
    fail("Operações inválidas.");
  if (s.days.filter((d) => !d.closedAt).length > 1)
    fail("Mais de um dia aberto.");
  const day = (id) => s.days.some((d) => d.id === id),
    flavor = (id) => s.flavors.some((f) => f.id === id);
  const date = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
  for (const f of s.flavors)
    if (
      typeof f.name !== "string" ||
      !f.name.trim() ||
      !integer(f.price, 1) ||
      typeof f.active !== "boolean"
    )
      fail("Sabor inválido no backup.");
  for (const d of s.days)
    if (
      typeof d.openedAt !== "string" ||
      !Number.isFinite(Date.parse(d.openedAt)) ||
      (d.closedAt && !Number.isFinite(Date.parse(d.closedAt)))
    )
      fail("Dia inválido.");
  for (const v of [...s.sales, ...s.reservations]) {
    if (
      !day(v.dayId) ||
      !date(v.at) ||
      typeof v.customer !== "string" ||
      !Array.isArray(v.items) ||
      !v.items.length
    )
      fail("Itens ou dia inválidos.");
    for (const i of v.items)
      if (
        !flavor(i.flavorId) ||
        !integer(i.qty, 1) ||
        !integer(i.price, 1) ||
        typeof i.name !== "string"
      )
        fail("Item inválido.");
    if (!Number.isSafeInteger(total(v.items))) fail("Total fora do limite.");
  }
  for (const r of s.reservations) {
    if (
      !["pending", "completed", "cancelled"].includes(r.status) ||
      typeof r.customer !== "string" ||
      typeof r.location !== "string"
    )
      fail("Reserva inválida.");
    const matches = s.sales.filter((v) => v.reservationId === r.id);
    if (
      (r.status === "completed" && matches.length !== 1) ||
      (r.status !== "completed" && matches.length)
    )
      fail("Reserva inconsistente.");
  }
  for (const v of s.sales) {
    if (v.reservationId) {
      const r = s.reservations.find((r) => r.id === v.reservationId);
      if (
        !r ||
        r.dayId !== v.dayId ||
        JSON.stringify(r.items) !== JSON.stringify(v.items)
      )
        fail("Venda de reserva inconsistente.");
    }
    if (v.voidedAt && !v.voidReason) fail("Estorno sem motivo.");
  }
  for (const p of s.payments) {
    const v = s.sales.find((v) => v.id === p.saleId);
    if (
      !v ||
      !date(p.at) ||
      !day(p.dayId) ||
      !METHODS.includes(p.method) ||
      p.amount !== total(v.items)
    )
      fail("Pagamento inválido.");
  }
  for (const v of s.sales)
    if (v.refund) {
      if (
        !v.voidedAt ||
        !s.payments.some((p) => p.saleId === v.id) ||
        !["pending", "paid"].includes(v.refund.status)
      )
        fail("Reembolso inválido.");
      if (
        v.refund.status === "paid" &&
        (!date(v.refund.at) ||
          !day(v.refund.dayId) ||
          !METHODS.includes(v.refund.method))
      )
        fail("Reembolso inválido.");
    }
  for (const r of s.reservations)
    if (r.revision !== undefined && !integer(r.revision))
      fail("Revisão de reserva inválida.");
  for (const d of s.days)
    if (
      d.businessDate !== undefined &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(d.businessDate) ||
        !date(d.businessDate + "T12:00:00"))
    )
      fail("Data comercial inválida.");
  if (!unique(s.payments.map((p) => p.saleId))) fail("Pagamento duplicado.");
  for (const e of s.events) {
    if (!date(e.at)) fail("Data de evento inválida.");
    if (e.kind === "audit") continue;
    if (
      !day(e.dayId) ||
      !flavor(e.flavorId) ||
      typeof e.reason !== "string" ||
      !["receive", "loss", "adjust"].includes(e.kind) ||
      !integer(e.qty, e.kind === "adjust" ? -1000000 : 1)
    )
      fail("Movimento inválido.");
  }
  for (const d of s.days)
    if (d.closedAt) {
      if (!d.counts || typeof d.counts !== "object" || Array.isArray(d.counts))
        fail("Fechamento sem contagem.");
      for (const [id, count] of Object.entries(d.counts))
        if (
          !flavor(id) ||
          !integer(count) ||
          count !== stock(s, d.id, id).available
        )
          fail("Contagem inválida.");
      for (const e of s.events.filter(
        (e) => e.dayId === d.id && e.kind !== "audit",
      ))
        if (d.counts[e.flavorId] === undefined) fail("Contagem incompleta.");
    }
  for (const d of s.days) {
    if (
      d.closedAt &&
      s.reservations.some((r) => r.dayId === d.id && r.status === "pending")
    )
      fail("Dia fechado com reservas.");
    for (const f of s.flavors) {
      const st = stock(s, d.id, f.id);
      if (!Number.isSafeInteger(st.available) || st.available < 0)
        fail("Estoque inválido.");
      if (
        d.closedAt &&
        d.counts?.[f.id] !== undefined &&
        d.counts[f.id] !== st.available
      )
        fail("Fechamento inconsistente.");
    }
  }
  return s;
}
export function parseBackup(text) {
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    fail("Arquivo JSON inválido.");
  }
  if (!b || b.format !== "cookies-campus" || !b.data)
    fail("Formato de backup inválido.");
  return validate(b.data);
}
export const backup = (s) =>
  JSON.stringify(
    {
      format: "cookies-campus",
      exportedAt: new Date().toISOString(),
      data: validate(s),
    },
    null,
    2,
  );
