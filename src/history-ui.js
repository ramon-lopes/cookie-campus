import { businessDate, financial, METHODS, opened, reservationPayment, stock, total, usesHeldStock } from "./domain.js";

export function displayDate(date) {
  return date.split("-").reverse().join("/");
}

export function renderHistory(state, { money, esc, stamp, clock }) {
  const all = financial(state);
  const activeDay = opened(state);
  const payments = new Map(state.payments.map((p) => [p.saleId, p]));
  const reservationsById = new Map(state.reservations.map((r) => [r.id, r]));
  const sales = state.sales.slice().reverse();
  const dateOf = (id) => displayDate(businessDate(state.days.find((d) => d.id === id)));
  const buyer = (sale) => esc(sale.customer || "Venda no balcão");

  function dayMetrics(n) {
    return `<dl class="summary-grid">
      <div class="summary-tile cash-tile"><dt>Caixa líquido</dt><dd>${money(n.cashNet)}</dd></div>
      <div class="summary-tile"><dt>A receber</dt><dd>${money(n.pending)}</dd></div>
      <div class="summary-tile"><dt>A reembolsar</dt><dd>${money(n.refundPending)}</dd></div>
    </dl>`;
  }

  function disclosure(key, title, content, { open = false, className = "" } = {}) {
    return `<details class="disclosure ${className}" data-disclosure="${esc(key)}" ${open ? "open" : ""}>
      <summary>${title}</summary><div class="disclosure-body">${content}</div>
    </details>`;
  }

  function cashDetails(n, key) {
    const lines = [
      ["Entradas efetivas", money(n.collected)],
      ["Reembolsos pagos", money(n.refunded)],
    ];
    const rows = (values) => values.map(([label, value]) =>
      `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
    return disclosure(`cash:${key}`, "Detalhar vendas e caixa",
      `<dl class="detail-list">${rows(lines)}</dl>
       <h3>Caixa líquido por meio</h3>
       <dl class="detail-list">${rows(METHODS.map((m) => [m, money(n.cashMethods[m])]))}</dl>
       <h3>Vendas</h3>
       <dl class="detail-list">${rows([
         ["Vendas estornadas", money(n.voided)], ["Unidades vendidas após estornos", n.units],
       ])}</dl>`);
  }

  function pendingGroup(key, title, amount, entries) {
    return disclosure(key, `<span>${title} <small>(${entries.length})</small></span><strong>${money(amount)}</strong>`,
      entries.map(({ entry, action, label, context }) => `<div class="row pending-row">
        <div><strong>${buyer(entry)}</strong><p class="receipt">${context} · ${money(total(entry.items))}</p></div>
        <button data-${action}="${esc(entry.id)}">${label}</button>
      </div>`).join("") || '<p class="muted">Nenhuma pendência.</p>');
  }

  function reservationReceipts(dayId) {
    const receipts = state.payments.filter((p) => p.dayId === dayId && p.reservationId !== undefined).reverse();
    if (!receipts.length) return "";
    return disclosure(`reservation-payments:${dayId}`, `Pagamentos antecipados (${receipts.length})`,
      `<ul class="plain-list">${receipts.map((p) => {
        const r = reservationsById.get(p.reservationId);
        return `<li class="inventory-row">
          <div class="inventory-head"><strong>${buyer(r)}</strong><strong>${money(p.amount)}</strong></div>
          <p class="receipt">${p.method} · Recebido em ${stamp(p.at)}</p>
          <p class="receipt">${r.status === "pending" ? "Pago · Aguardando retirada"
            : r.status === "completed" ? `Retirada em ${stamp(r.finishedAt)}`
            : r.refund.status === "pending" ? "Cancelada · Reembolso pendente"
            : `Reembolso em ${stamp(r.refund.at)} · Caixa de ${dateOf(r.refund.dayId)}`}</p>
        </li>`;
      }).join("")}</ul>`);
  }

  function saleEntry(v) {
    const paid = payments.get(v.id);
    const refund = v.refund;
    const isVoided = Boolean(v.voidedAt);
    let status = paid ? "Recebida" : "Pagamento pendente";
    if (isVoided) status = refund?.status === "pending" ? "Estornada · Reembolso pendente" : "Estornada";
    const lines = [];
    if (paid) lines.push(`Entrada efetiva: ${money(paid.amount)} via ${paid.method} em ${stamp(paid.at)} · Caixa de ${dateOf(paid.dayId)}.`);
    if (isVoided) {
      lines.push(`Estorno em ${stamp(v.voidedAt)} · ${esc(v.voidReason)}`);
      if (refund?.status === "paid") {
        lines.push(`Reembolso efetivo: ${money(paid.amount)} via ${refund.method} em ${stamp(refund.at)} · Caixa de ${dateOf(refund.dayId)}.`);
      } else if (refund?.status === "pending") {
        lines.push("O pagamento ainda consta no caixa. Registre a devolução depois de devolver o dinheiro.");
      } else if (paid) {
        lines.push("Registro antigo com reembolso presumido, sem confirmação de devolução.");
      } else {
        lines.push("Venda estornada sem pagamento recebido.");
      }
    }
    const action = refund?.status === "pending"
      ? `<button data-refund="${esc(v.id)}">Registrar reembolso</button>`
      : !isVoided && !paid ? `<button data-payment="${esc(v.id)}">Receber</button>` : "";
    const canVoid = !isVoided && v.dayId === activeDay?.id;
    return disclosure(`sale:${v.id}`,
      `<span class="sale-main"><strong>${buyer(v)}</strong>
        <span class="sale-items">${v.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(", ")}</span>
        <span class="receipt">${clock(v.at)} · ${paid?.method ?? "Meio a definir"}</span>
        <span class="sale-status ${!paid && !isVoided || refund?.status === "pending" ? "has-pending" : ""}">${status}</span>
      </span><strong class="sale-value">${isVoided ? `<del>${money(total(v.items))}</del>` : money(total(v.items))}</strong>`,
      `<p class="receipt">Registrada em ${stamp(v.at)}.</p>
       ${lines.map((line) => `<p class="receipt">${line}</p>`).join("")}
       ${action || canVoid ? `<div class="actions">${action}
          ${canVoid ? `<button class="danger" data-void="${esc(v.id)}">Estornar</button>` : ""}</div>` : ""}`,
      { className: "sale-entry" });
  }

  function inventory(day, daySales) {
    const moves = state.events.filter((e) => e.dayId === day.id && e.kind !== "audit");
    const carryByFlavor = new Map(Object.entries(day.carryover ?? {}));
    const rows = state.flavors.map((fl) => {
      const q = stock(state, day.id, fl.id);
      const kept = carryByFlavor.get(fl.id) ?? 0;
      return `<li class="inventory-row"><div class="inventory-head">
        <strong>${esc(fl.name)}</strong><span><strong>${q.available}</strong> ${day.closedAt ? "no fechamento" : "disponíveis"}</span>
      </div><div class="inventory-origins"><span>${q.received} novos</span><span>${q.carried} de sobras</span><span>${q.sold} vendidos</span>
        ${q.reserved ? `<span>${q.reserved} ${day.closedAt ? "reservados no fechamento" : "reservados"}</span>` : ""}
        ${q.fulfilledFromHeld ? `<span>${q.fulfilledFromHeld} vendidos de reservas anteriores</span>` : ""}
        ${q.returned ? `<span>${q.returned} devolvidos de reservas anteriores</span>` : ""}
        ${q.losses ? `<span>${q.losses} perdas</span>` : ""}
        ${q.adjustments ? `<span>${q.adjustments > 0 ? "+" : ""}${q.adjustments} em ajustes</span>` : ""}
        ${kept ? `<span>${kept} confirmados para reaproveitar</span>` : ""}
      </div></li>`;
    }).join("");

    const types = { receive: "Recebimento novo", carryover: "Sobras aproveitadas", loss: "Perda", adjust: "Ajuste" };
    const movementRows = moves.map((e) => ({
      at: e.at,
      flavor: state.flavors.find((f) => f.id === e.flavorId).name,
      type: types[e.kind],
      qty: e.kind === "loss" ? -e.qty : e.qty,
      reason: e.kind === "carryover" ? `${e.reason} de ${dateOf(e.sourceDayId)}` : e.reason,
    }));
    for (const v of daySales) {
      const held = usesHeldStock(reservationsById.get(v.reservationId));
      for (const i of v.items) {
        movementRows.push({ at: v.at, flavor: i.name, type: "Venda", qty: held ? null : -i.qty,
          reason: held ? `Retirada de ${i.qty} un. separadas em dia anterior`
            : v.reservationId ? "Retirada de reserva" : "Venda registrada" });
        if (v.voidedAt)
          movementRows.push({ at: v.voidedAt, flavor: i.name, type: "Estorno", qty: i.qty, reason: v.voidReason });
      }
    }
    for (const r of state.reservations.filter((r) => r.status === "cancelled" && usesHeldStock(r) && r.finishedDayId === day.id)) {
      for (const i of r.items) movementRows.push({ at: r.finishedAt, flavor: i.name,
        type: "Retorno ao estoque", qty: i.qty, reason: "Cancelamento de reserva de dia anterior" });
    }
    movementRows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const trail = movementRows.map((e) => `<li class="inventory-row">
      <div class="inventory-head"><strong>${e.type} · ${esc(e.flavor)}</strong>
        ${e.qty === null ? "" : `<strong>${e.qty > 0 ? "+" : ""}${e.qty}</strong>`}</div>
      <p class="receipt">${stamp(e.at)} · ${esc(e.reason)}</p>
    </li>`).join("");
    return `<ul class="plain-list">${rows}</ul>
      ${disclosure(`moves:${day.id}`, `Trilha de movimentações (${movementRows.length})`,
        trail ? `<ul class="plain-list">${trail}</ul>` : '<p class="muted">Nenhuma movimentação.</p>')}`;
  }

  function dayEntry(day, repeatedDate) {
    const n = financial(state, day.id);
    const daySales = sales.filter((v) => v.dayId === day.id);
    const reservations = state.reservations.filter((r) => (r.finishedDayId ?? r.dayId) === day.id && r.status !== "pending")
      .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt));
    const processed = reservations.map((r) => `<li class="inventory-row">
      <div class="inventory-head"><strong>${esc(r.customer)}</strong><span>${r.status === "completed" ? "Concluída"
        : r.refund?.status === "pending" ? "Cancelada · Reembolso pendente" : "Cancelada"}</span></div>
      <p class="receipt">${esc(r.location)} · ${stamp(r.finishedAt)}</p>
      ${r.refund?.status === "paid" ? `<p class="receipt">Reembolso de ${money(reservationPayment(state, r.id).amount)}
        via ${r.refund.method} em ${stamp(r.refund.at)} · Caixa de ${dateOf(r.refund.dayId)}.</p>` : ""}
    </li>`).join("");

    return disclosure(`day:${day.id}`,
      `<span><span class="pill ${day.closedAt ? "closed-pill" : ""}">${day.closedAt ? "Fechado" : "Aberto"}</span>
        ${repeatedDate ? `<small class="day-session">Abertura às ${clock(day.openedAt)}</small>` : ""}</span>
       <span class="day-value"><strong>${money(n.gross)}</strong><small>Vendas líquidas de estornos</small></span>`,
      `${dayMetrics(n)}${cashDetails(n, day.id)}${reservationReceipts(day.id)}
       ${disclosure(`sales:${day.id}`, `Vendas (${daySales.length})`,
          daySales.map(saleEntry).join("") || '<p class="muted">Nenhuma venda neste dia.</p>', { open: day.id === activeDay?.id })}
       ${disclosure(`stock:${day.id}`, "Estoque e movimentações", inventory(day, daySales))}
       ${disclosure(`reservations:${day.id}`, `Reservas processadas (${reservations.length})`,
          processed ? `<ul class="plain-list">${processed}</ul>` : '<p class="muted">Nenhuma reserva processada.</p>')}`,
      { open: day.id === activeDay?.id, className: "day-entry" });
  }

  const byDate = new Map();
  for (const day of state.days.slice().reverse()) {
    const date = businessDate(day);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(day);
  }
  const groups = [...byDate.keys()].sort().reverse().map((date) => {
    const days = byDate.get(date);
    return `<section class="history-group"><h2>${displayDate(date)}</h2>
      ${days.map((d) => dayEntry(d, days.length > 1)).join("")}</section>`;
  }).join("");
  const receivables = sales.filter((v) => !v.voidedAt && !payments.has(v.id))
    .map((entry) => ({ entry, action: "payment", label: "Receber", context: dateOf(entry.dayId) }));
  const refunds = [
    ...sales.filter((v) => v.refund?.status === "pending").map((entry) => ({
      entry, action: "refund", label: "Registrar reembolso", context: `Venda de ${dateOf(entry.dayId)}`,
    })),
    ...state.reservations.filter((r) => r.refund?.status === "pending").map((entry) => ({
      entry, action: "reservation-refund", label: "Registrar reembolso",
      context: `Reserva cancelada em ${dateOf(entry.finishedDayId ?? entry.dayId)}`,
    })),
  ];

  return {
    totals: all,
    overviewDetails: cashDetails(all, "all"),
    entries: `<section class="pending-panel"><h2>Pendências de todos os dias</h2>
        ${pendingGroup("receivables", "Pagamentos pendentes", all.pending, receivables)}
        ${pendingGroup("refunds", "Reembolsos pendentes", all.refundPending, refunds)}
      </section>
      ${groups || '<p class="empty">Seu histórico aparecerá após abrir o primeiro dia.</p>'}`,
  };
}
