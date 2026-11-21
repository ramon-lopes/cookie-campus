import { createOperationsUI } from "./operations-ui.js";
import { displayDate, renderHistory } from "./history-ui.js";
import { createAccess } from "./access.js";
import {
  opened,
  stock,
  financial,
  total,
  backup,
  localDate,
  businessDate,
  nextOpening,
  reservationPayment,
} from "./domain.js";
import { read, mutate } from "./db.js";
const $ = (s) => document.querySelector(s),
  money = (n) =>
    (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const stamp = (s) =>
  new Date(s).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
const clock = (s) => new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
let state,
  tab = "hoje",
  busy = false;
let dialogTrigger;
const dialog = $("#dialog"),
  channel =
    "BroadcastChannel" in window
      ? new BroadcastChannel("cookies-campus")
      : null;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
function modal(title, html) {
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML = html;
  if (!dialog.open) {
    const trigger = document.activeElement;
    dialogTrigger = { id: trigger?.id, disclosure: trigger?.closest("[data-disclosure]")?.dataset.disclosure };
    dialog.showModal();
  } else $("#dismiss").focus({ preventScroll: true });
}
$("#dismiss").onclick = () => {
  if (!busy) dialog.close();
};
dialog.addEventListener("cancel", (e) => {
  if (busy) e.preventDefault();
});
function form(content, label = "Salvar") {
  return `<form>${content}<p class="error" role="alert"></p><button class="primary" type="submit">${label}</button></form>`;
}
function bindForm(make, successMessage = "Salvo com sucesso.") {
  const f = $("#dialog-body form"),
    id = crypto.randomUUID(),
    expectedDayId = opened(state)?.id ?? null;
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (busy || access.locked) return;
    setBusy(true);
    const b = f.querySelector("[type=submit]");
    b.disabled = true;
    try {
      const command = make(new FormData(f));
      state = await mutate({
        ...command, id,
        expectedDayId: command.type === "flavor" ? undefined : expectedDayId,
      });
      channel?.postMessage("changed");
      dialog.close();
      render();
      const disclosure = dialogTrigger?.disclosure;
      const target = (dialogTrigger?.id && document.getElementById(dialogTrigger.id)) ||
        (disclosure && document.querySelector(`[data-disclosure="${CSS.escape(disclosure)}"] > summary`));
      (target || $("#app")).focus({ preventScroll: true });
      toast(successMessage);
    } catch (err) {
      f.querySelector(".error").textContent = err.message;
    } finally {
      setBusy(false);
      b.disabled = false;
    }
  };
}
function openDay() {
  const { previousDayId, source } = nextOpening(state);
  const carriedByFlavor = new Map(Object.entries(source?.carryover ?? {}));
  const flavors = state.flavors.filter((f) => f.active || carriedByFlavor.has(f.id));
  const inputRows = flavors.map((f, index) => {
    const carried = carriedByFlavor.get(f.id) ?? 0;
    return `<fieldset class="stock-form-row">
      <legend>${esc(f.name)}${f.active ? "" : " (inativo)"}</legend>
      <div class="stock-form-values">
        <div class="form-stat"><span>Sobras do dia anterior</span><strong>${carried}</strong></div>
        <label>Recebimento novo
          ${f.active ? `<input aria-label="Recebimento novo de ${esc(f.name)}" name="qty_${index}"
            data-carried="${carried}" type="number" inputmode="numeric" min="0" step="1" placeholder="0">` : "<strong>0</strong>"}
        </label>
        <div class="form-stat"><span>Total disponível</span><output data-total="${index}">${carried}</output></div>
      </div>
    </fieldset>`;
  }).join("");
  modal("Abrir dia de vendas", form(
    `<p class="note">${source
      ? `Sobras confirmadas em <strong>${displayDate(businessDate(source))}</strong>. Informe apenas o recebimento novo.`
      : "Sem sobras confirmadas do último dia de venda. Informe os cookies recebidos para esta abertura."}</p>
      <div class="form-items">${inputRows}</div>`,
    "Abrir dia",
  ));
  const openingForm = $("#dialog-body form");
  openingForm.oninput = (e) => {
    const carried = e.target.dataset.carried;
    if (carried === undefined) return;
    const output = openingForm.querySelector(`[data-total="${e.target.name.slice(4)}"]`);
    output.value = Number(carried) + Number(e.target.value || 0);
  };
  bindForm((fd) => ({
    type: "open",
    expectedPreviousDayId: previousDayId,
    items: flavors.map((f, index) => ({ flavorId: f.id, qty: Number(fd.get("qty_" + index) || 0) }))
      .filter((i) => i.qty > 0),
  }));
}
function sale(reserve=false,id){return ui.sale(reserve,id);}
function move() {
  if (!opened(state)) return openDay();
  modal(
    "Movimentar estoque",
    form(
      `<label>Sabor<select name="flavorId">${state.flavors.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}</select></label><label>Tipo<select name="kind"><option value="receive">Recebimento adicional</option><option value="loss">Perda</option><option value="adjust">Ajuste (+ ou −)</option></select></label><label>Quantidade<input type="number" inputmode="numeric" step="1" name="qty" required value="1"></label><label>Motivo<input name="reason" required maxlength="200" placeholder="Ex.: nova fornada, quebra, contagem"></label>`,
    ),
  );
  bindForm((fd) => ({
    type: "move",
    ...Object.fromEntries(fd),
    qty: Number(fd.get("qty")),
  }));
}
function payment(type,id){return ui.payment(type,id);}
function cancel(id) {
  const r = state.reservations.find((entry) => entry.id === id);
  if (!r) return;
  if (!opened(state)) {
    modal("Abra um dia de vendas",
      `<p>Depois de abrir, volte a Reservas para cancelar e liberar os cookies no estoque disponível.</p>
       <button class="primary wide" id="open-for-cancel">Abrir dia de vendas</button>`);
    $("#open-for-cancel").onclick = openDay;
    return;
  }
  const paid = reservationPayment(state, id);
  modal(
    "Cancelar reserva",
    form(
      `<p>Os cookies reservados voltarão a ficar disponíveis.</p>
       ${paid ? `<p class="note">O recebimento de ${money(paid.amount)} permanece no Histórico.
         Depois de devolver ao cliente, use <strong>Histórico → Reembolsos pendentes</strong>.</p>` : ""}`,
      "Cancelar reserva",
    ),
  );
  bindForm(() => ({ type: "cancel", reservationId: id, expectedRevision: r.revision ?? 0 }),
    paid ? "Reserva cancelada. Reembolso pendente no Histórico." : "Reserva cancelada.");
}
function voidSale(id) {
  const sale = state.sales.find((v) => v.id === id);
  if (!sale) return;
  modal(
    "Estornar venda",
    form(
      `<p><strong>${esc(sale.customer || "Venda no balcão")}</strong> · ${money(total(sale.items))}<br>
        <span class="muted">${stamp(sale.at)} · ${sale.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(", ")}</span></p>
        <p class="note">O estorno recompõe o estoque. Se houve pagamento, ele continua no caixa até você registrar a devolução efetiva no Histórico.</p>
        <label>Motivo<input name="reason" required maxlength="200"></label>`,
      "Confirmar estorno",
    ),
  );
  bindForm((fd) => ({ type: "void", saleId: id, reason: fd.get("reason") }));
}
function closeDay() {
  const day = opened(state);
  const pending = state.reservations.filter((r) => r.status === "pending");
  const unpaid = pending.filter((r) => r.dayId === day.id && !reservationPayment(state, r.id));
  if (unpaid.length) {
    modal("Resolva as reservas", `<p class="note">Há ${unpaid.length} ${unpaid.length === 1 ? "reserva sem pagamento" : "reservas sem pagamento"}.
      Em Reservas, registre os pagamentos recebidos, conclua as retiradas feitas ou cancele as reservas. Depois, volte para fechar o dia.</p>
      <button class="primary wide" id="go-reservations">Ir para Reservas</button>`);
    $("#go-reservations").onclick = () => {
      dialog.close();
      navigate("reservas");
    };
    return;
  }
  const flavors = state.flavors;
  const rows = flavors.map((flavor, index) => {
    const { available } = stock(state, day.id, flavor.id);
    return `<fieldset class="stock-form-row" data-expected="${available}">
      <legend>${esc(flavor.name)}</legend>
      <div class="stock-form-values">
        <div class="form-stat"><span>Saldo no app</span><strong>${available}</strong></div>
        <label>Contagem física<input aria-label="Contagem física de ${esc(flavor.name)}"
          name="count_${index}" data-count type="number" inputmode="numeric" min="0" step="1" required></label>
        <label>Reaproveitar<input aria-label="Reaproveitar ${esc(flavor.name)}"
          name="carry_${index}" data-carry type="number" inputmode="numeric" min="0" max="${available}"
          step="1" value="${available}" required></label>
      </div>
      <p class="diff" data-diff aria-live="polite"></p>
    </fieldset>`;
  }).join("");
  modal("Conferir e fechar", form(
    `<p class="note">Confira a contagem física. Em <strong>Reaproveitar</strong>, confirme quantas unidades entram na próxima abertura. As demais ficam só no saldo deste dia. Lance perdas e divergências em <strong>Movimentar estoque</strong> antes de fechar.</p>
    ${pending.length ? '<p class="note">Guarde os cookies das reservas pagas à parte. Conte apenas os cookies disponíveis e mantenha as reservas abertas até a retirada.</p>' : ""}
    <button type="button" id="move-before-close">Movimentar estoque</button>
    <div class="form-items">${rows}</div>`, "Confirmar fechamento",
  ));
  $("#move-before-close").onclick = move;
  $("#dialog-body form").oninput = (e) => {
    const row = e.target.closest("[data-expected]");
    if (!row) return;
    const count = row.querySelector("[data-count]");
    const carry = row.querySelector("[data-carry]");
    const status = row.querySelector("[data-diff]");
    if (e.target === carry) carry.dataset.edited = "true";
    const difference = Number(count.value) - Number(row.dataset.expected);
    status.textContent = !count.value ? "" : difference
      ? `Diferença de ${difference > 0 ? "+" : ""}${difference}. Registre uma perda ou ajuste.`
      : "Contagem confere.";
    carry.max = count.value || row.dataset.expected;
    if (!carry.dataset.edited && count.value) carry.value = count.value;
  };
  bindForm((fd) => ({
    type: "close",
    counts: Object.fromEntries(flavors.map((f, index) => [f.id, Number(fd.get("count_" + index))])),
    carryover: Object.fromEntries(flavors.map((f, index) => [f.id, Number(fd.get("carry_" + index))])),
  }));
}
function share() {
  const d = opened(state),
    available = state.flavors.filter(
      (f) => f.active && stock(state, d.id, f.id).available > 0,
    );
  const message = [
    "🍪 *Cookies no campus!*",
    "",
    ...available.map(
      (f) =>
        `• ${f.name} — ${money(f.price)} (${stock(state, d.id, f.id).available} disponíveis)`,
    ),
    "",
    "Me chama para reservar! 📍",
  ].join("\n");
  modal(
    "Divulgar no WhatsApp",
    `<label>Mensagem<textarea id="share-text" readonly></textarea></label><button class="primary wide" id="copy">Copiar mensagem</button><p class="muted" id="copy-feedback"></p>`,
  );
  $("#share-text").value = available.length
    ? message
    : "Sem sabores disponíveis neste momento.";
  $("#copy").disabled = !available.length;
  $("#copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("#share-text").value);
      $("#copy-feedback").textContent = "Mensagem copiada. Cole no WhatsApp.";
    } catch {
      $("#share-text").select();
      $("#copy-feedback").textContent =
        "Selecione o texto e use Copiar no menu do aparelho.";
    }
  };
}
function editFlavor(id) {
  const f = state.flavors.find((f) => f.id === id);
  modal(
    f ? "Editar sabor" : "Novo sabor",
    form(
      `<label>Nome<input name="name" value="${esc(f?.name || "")}" maxlength="80" required></label><label>Preço (R$)<input name="price" type="number" inputmode="decimal" min="0.01" step="0.01" value="${f ? (f.price / 100).toFixed(2) : "12.00"}" required></label>${f ? `<label>Disponibilidade<select name="active"><option value="true" ${f.active ? "selected" : ""}>Ativo</option><option value="false" ${!f.active ? "selected" : ""}>Desativado</option></select></label><p class="muted">Preços de vendas e reservas já registradas serão preservados.</p>` : ""}`,
    ),
  );
  bindForm((fd) => ({
    type: "flavor",
    flavorId: id,
    name: fd.get("name"),
    price: Math.round(Number(fd.get("price")) * 100),
    active: fd.get("active") !== "false",
  }));
}
function download(data) {
  const url = URL.createObjectURL(
      new Blob([backup(data)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `cookies-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function dayWarning(d) {
  return businessDate(d) !== localDate()
    ? `<p class="note" role="status">O dia de <strong>${displayDate(businessDate(d))}</strong> segue aberto.
      As operações ficam nesse dia até você fechar e abrir outro.</p>`
    : "";
}
const stockIconsById = new Map([
  ["f0", "nutella"], ["f1", "tradicional"], ["f2", "red"], ["f3", "red"],
  ["f4", "black"], ["f5", "black"], ["6837b8cf-64a6-4e78-8cd1-649d3ba7fce5", "tradicional"],
]);
const stockIconsByName = new Map([
  ["black bueno", "black"], ["laka com oreo", "tradicional"], ["ninho com nutella", "tradicional"],
  ["nutella", "nutella"], ["oreo", "black"], ["oreo com nutella", "black"],
  ["red ninho", "red"], ["red nutella", "red"],
]);
function stockIcon(flavor) {
  const icon = stockIconsById.get(flavor.id) ?? stockIconsByName.get(flavor.name.trim().toLowerCase());
  return icon ? `<img class="stock-icon" src="./icons/cookies-${icon}.png" width="24" height="24" alt="">` : "";
}
function stockCard(flavor, q) {
  const status = q.available ? "disponíveis" : q.reserved ? "Sem unidades livres" : "Esgotado";
  return `<article class="card stock-card">
    <div class="stock-top">${stockIcon(flavor)}
      <div><h3>${esc(flavor.name)}${flavor.active ? "" : " (inativo)"}</h3><div class="price">${money(flavor.price)}</div></div>
    </div>
    <div class="stock-available ${q.available ? "" : "stock-zero"}"><strong>${q.available}</strong><span>${status}</span></div>
    <dl class="stock-info"><div class="${!q.available && q.reserved ? "reserved-highlight" : ""}">
      <dt>Reservados</dt><dd>${q.reserved}</dd></div><div><dt>Vendidos</dt><dd>${q.sold}</dd></div></dl>
  </article>`;
}
function reservationCard(r) {
  const paid = reservationPayment(state, r.id);
  const id = esc(r.id);
  return `<article class="card"><div class="row"><h3>${esc(r.customer)}</h3><span class="tag">${esc(r.location)}</span></div>
    <p class="receipt">${r.items.map((i) => `${i.qty}× ${esc(i.name)}`).join("<br>")}</p>
    <strong>${money(total(r.items))}</strong>
    ${paid ? `<p class="reservation-paid">Pago · Aguardando retirada</p>` : ""}
    <div class="actions"><button class="primary" data-complete="${id}">Concluir retirada</button>
      ${paid ? "" : `<button data-reservation-payment="${id}">Registrar pagamento</button>`}
      <button data-edit-reservation="${id}">Editar</button><button data-cancel="${id}">Cancelar</button>
    </div></article>`;
}
const disclosures = new Map();
function rememberDisclosures() {
  for (const details of $("#app").querySelectorAll("[data-disclosure]"))
    disclosures.set(details.dataset.disclosure, details.open);
}
function navigate(next) {
  tab = next;
  render();
  window.scrollTo(0, 0);
}
function render() {
  if (access.locked || !state) return;
  const d = opened(state);
  const app = $("#app");
  rememberDisclosures();
  document.querySelectorAll("[data-tab]").forEach((b) => {
    const selected = b.dataset.tab === tab;
    b.classList.toggle("active", selected);
    if (selected) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (tab === "hoje") {
    const dayDate = displayDate(d ? businessDate(d) : localDate());
    const title = `<div class="heading"><div><div class="eyebrow">${dayDate}</div><h1>Hoje</h1></div>
      <span class="pill ${d ? "" : "closed-pill"}">${d ? "Dia aberto" : "Sem dia aberto"}</span></div>`;
    if (!d) {
      const { source } = nextOpening(state);
      app.innerHTML = `${title}<section class="empty"><h2>Abrir dia de vendas</h2>
        <p class="muted">${source
          ? `Há sobras confirmadas em ${displayDate(businessDate(source))} prontas para aproveitar.`
          : "Informe os cookies recebidos para começar."}</p>
        <button class="primary" id="open">Abrir dia</button></section>`;
      $("#open").onclick = openDay;
      return;
    }
    const n = financial(state, d.id);
    const cards = state.flavors.map((flavor) => ({ flavor, q: stock(state, d.id, flavor.id) }))
      .filter(({ flavor, q }) => flavor.active || q.available || q.reserved || q.sold)
      .map(({ flavor, q }) => stockCard(flavor, q)).join("");
    app.innerHTML = `${title}${dayWarning(d)}
      <section class="hero" aria-label="Registrar venda"><div><span>Vendas de ${dayDate}</span><strong>${money(n.gross)}</strong></div>
        <button id="quick">＋ Venda rápida</button></section>
      <div class="metrics today-metrics">
        <div class="metric"><small>Cookies vendidos</small><strong>${n.units}</strong></div>
        <div class="metric"><small>Caixa líquido</small><strong>${money(n.cashNet)}</strong></div>
        <div class="metric"><small>A receber do dia</small><strong>${money(n.pending)}</strong></div>
      </div>
      <div class="section-title"><h2>Estoque por sabor</h2><button id="move">Movimentar estoque</button></div>
      <div class="grid stock-grid">${cards}</div>
      <div class="actions"><button id="share">Divulgar no WhatsApp</button><button id="close">Conferir e fechar dia</button></div>`;
    $("#quick").onclick = () => sale();
    $("#move").onclick = move;
    $("#share").onclick = share;
    $("#close").onclick = closeDay;
  } else if (tab === "reservas") {
    const rs = state.reservations.filter((r) => r.status === "pending");
    app.innerHTML = `<div class="heading"><h1>Reservas</h1><span class="pill">${rs.length} pendentes</span></div>
      <button class="primary wide" id="reserve">＋ Nova reserva</button><div class="stack reservations-list">${rs.length
        ? rs.map(reservationCard).join("")
        : '<p class="empty">Nenhuma reserva pendente.</p>'}</div>`;
    $("#reserve").onclick = () => sale(true);
  } else if (tab === "historico") {
    app.innerHTML = renderHistory(state, { money, esc, stamp, clock });
    $("#backup").onclick = () => download(state);
    for (const details of app.querySelectorAll("[data-disclosure]")) {
      if (disclosures.has(details.dataset.disclosure))
        details.open = disclosures.get(details.dataset.disclosure);
    }
  }
}

let pendingSync = false;
let pendingLock = false;
function setBusy(value) {
  busy = value;
  if (busy) return;
  if (pendingLock) access.lock();
  if (pendingSync) queueMicrotask(sync);
  pendingLock = false;
  pendingSync = false;
}
const access = createAccess({
  modal, esc, getBusy: () => busy, setBusy,
  channel, onUnlock: () => refresh().catch((e) => toast(e.message)),
  onLock: () => {
    state = undefined;
    disclosures.clear();
    $("#app").replaceChildren();
    $("#dialog-body").replaceChildren();
    $("#toast").classList.remove("show");
    $("#toast").textContent = "";
  },
});
const ui = createOperationsUI({
  getState: () => state, setState: (value) => { state = value; },
  getBusy: () => busy, setBusy,
  modal, bindForm, money, esc, stamp, toast, download, openDay, editFlavor, render, channel, access,
});
document.querySelectorAll("[data-tab]").forEach((b) => {
  b.onclick = () => navigate(b.dataset.tab);
});
$(".brand").onclick = (e) => {
  e.preventDefault();
  navigate("hoje");
};
$("#settings").onclick = () => ui.settings();
$("#app").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button || access.locked) return;
  const actions = {
    editReservation: (id) => sale(true, id), cancel, complete: (id) => payment("complete", id),
    payment: (id) => payment("payment", id), void: voidSale, refund: (id) => payment("refund", id),
    reservationPayment: (id) => payment("reservation-payment", id),
    reservationRefund: (id) => payment("reservation-refund", id),
  };
  const action = Object.keys(actions).find((name) => Object.hasOwn(button.dataset, name));
  if (action) actions[action](button.dataset[action]);
});
function connection() {
  $("#connection").textContent = navigator.onLine
    ? "● Dados salvos neste aparelho"
    : "● Sem internet · continue vendendo offline";
}
window.addEventListener("online", connection);
window.addEventListener("offline", connection);
let renderedDate;
async function refresh() {
  if (busy) return;
  await access.refresh();
  if (access.locked) return;
  const data = await read();
  if (busy || access.locked) return;
  const date = localDate();
  if (renderedDate === date && JSON.stringify(state) === JSON.stringify(data)) return;
  state = data;
  renderedDate = date;
  render();
}
const sync = () => refresh().catch((e) => toast(e.message));
if (channel) channel.onmessage = ({ data }) => {
  if (busy) {
    pendingSync = true;
    pendingLock ||= data === "locked";
    return;
  }
  if (data === "locked") access.lock();
  else sync();
};
function adjustViewport() {
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty("--visible-height", `${viewport.height}px`);
  document.documentElement.style.setProperty("--keyboard-inset",
    `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", adjustViewport);
  window.visualViewport.addEventListener("scroll", adjustViewport);
  adjustViewport();
}
setInterval(() => { if (!dialog.open && renderedDate !== localDate()) sync(); }, 60000);
window.addEventListener("focus", sync);
try {
  await refresh();
  connection();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js")
      .catch(() => toast("Modo offline indisponível. Use HTTPS ou localhost."));
} catch (e) {
  $(access.locked ? "#access-screen" : "#app").textContent =
    "Não foi possível abrir o banco de dados: " + e.message;
}
