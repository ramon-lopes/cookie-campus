import {createOperationsUI} from './operations-ui.js';
import {
  opened,
  stock,
  financial,
  total,
  METHODS,
  backup,
  localDate,
  businessDate,
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
let state,
  tab = "hoje",
  busy = false;
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
  if (!dialog.open) dialog.showModal();
}
$("#dismiss").onclick = () => {
  if (!busy) dialog.close();
};
dialog.addEventListener("cancel", (e) => {
  if (busy) e.preventDefault();
});
const methodOptions = (pending = true) =>
  [...METHODS, ...(pending ? ["Pendente"] : [])]
    .map((m) => `<option>${m}</option>`)
    .join("");
function form(content, label = "Salvar") {
  return `<form>${content}<p class="error" role="alert"></p><button class="primary" type="submit">${label}</button></form>`;
}
function bindForm(make) {
  const f = $("#dialog-body form"),
    id = crypto.randomUUID();
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const b = f.querySelector("[type=submit]");
    b.disabled = true;
    try {
      state = await mutate({ ...make(new FormData(f)), id });
      channel?.postMessage("changed");
      dialog.close();
      render();
      toast("Salvo com sucesso.");
    } catch (err) {
      f.querySelector(".error").textContent = err.message;
    } finally {
      busy = false;
      b.disabled = false;
    }
  };
}
function quantities(initial = false) {
  const d = opened(state);
  return `<div class="form-items">${state.flavors
    .filter((f) => f.active)
    .map((f) => {
      const q = d ? stock(state, d.id, f.id).available : 0;
      return `<label class="quantity"><span>${esc(f.name)}<small>${money(f.price)}${!initial ? ` · ${q} disponíveis` : ""}</small></span><input aria-label="Quantidade de ${esc(f.name)}" name="qty_${f.id}" type="number" inputmode="numeric" min="0" ${initial ? "" : `max="${q}"`} step="1" value="0"></label>`;
    })
    .join("")}</div>`;
}
function selected(fd) {
  return state.flavors
    .map((f) => ({ flavorId: f.id, qty: Number(fd.get("qty_" + f.id) || 0) }))
    .filter((i) => i.qty > 0);
}
function openDay() {
  modal(
    "Abrir dia de vendas",
    form(
      `<p class="muted">Conte os cookies disponíveis para começar. As sobras do dia anterior devem entrar nesta contagem.</p>${quantities(true)}`,
      "Abrir dia",
    ),
  );
  bindForm((fd) => ({ type: "open", items: selected(fd) }));
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
  modal(
    "Cancelar reserva",
    form(
      "<p>Os cookies reservados voltarão a ficar disponíveis.</p>",
      "Cancelar reserva",
    ),
  );
  bindForm(() => ({ type: "cancel", reservationId: id }));
}
function voidSale(id) {
  modal(
    "Estornar venda",
    form(
      '<p class="note">O estorno cancela a venda e devolve os cookies ao estoque. Se houve pagamento, ele continua como entrada de caixa e gera um reembolso pendente. Depois de devolver o dinheiro, registre o reembolso no Histórico.</p><label>Motivo<input name="reason" required maxlength="200"></label>',
      "Confirmar estorno",
    ),
  );
  bindForm((fd) => ({ type: "void", saleId: id, reason: fd.get("reason") }));
}
function closeDay() {
  const d = opened(state);
  modal(
    "Conferir e fechar",
    form(
      `<p class="muted">Informe o estoque físico. Resolva reservas e registre perdas ou ajustes antes do fechamento.</p>${state.flavors.map((f) => `<label class="close-count"><span>${esc(f.name)}<small class="muted"> · esperado: ${stock(state, d.id, f.id).available}</small><span class="diff" data-diff="${esc(f.id)}"></span></span><input name="${esc(f.id)}" type="number" inputmode="numeric" min="0" step="1" required></label>`).join("")}<div class="day-total">Vendas: ${money(financial(state, d.id).gross)} · Caixa líquido: ${money(financial(state, d.id).cashNet)} · A reembolsar: ${money(financial(state, d.id).refundPending)}</div>`,
      "Fechar dia",
    ),
  );
  $("#dialog-body form").oninput = (e) => {
    const f = state.flavors.find((f) => f.id === e.target.name);
    if (f) {
      const diff = Number(e.target.value) - stock(state, d.id, f.id).available;
      $("#dialog-body").querySelector(
        `[data-diff="${CSS.escape(f.id)}"]`,
      ).textContent = diff
        ? ` Diferença: ${diff > 0 ? "+" : ""}${diff}`
        : " Conferido";
    }
  };
  bindForm((fd) => ({
    type: "close",
    counts: Object.fromEntries([...fd].map(([k, v]) => [k, Number(v)])),
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
function settings(){return ui.settings();}
function refundLabel(v,paid){if(!paid)return 'Sem pagamento recebido; não há reembolso.';if(!v.refund)return 'Registro antigo: reembolso presumido pela versão anterior, sem confirmação registrada.';if(v.refund.status==='pending')return 'Reembolso pendente — o dinheiro ainda consta no caixa.';return 'Reembolsado por '+esc(v.refund.method)+' em '+stamp(v.refund.at)+'.';}
function pendingPanel(){const pending=state.sales.filter(v=>!v.voidedAt&&!state.payments.some(p=>p.saleId===v.id));return '<section class="card" style="margin-top:16px"><h2>Pendências de todos os dias</h2>'+pending.map(v=>'<div class="row"><div><strong>'+esc(v.customer||'Venda no balcão')+'</strong><p class="receipt">'+stamp(v.at)+' · '+money(total(v.items))+'</p></div><button data-payment="'+esc(v.id)+'">Receber</button></div>').join('')+(pending.length?'':'<p class="muted">Nenhum pagamento pendente.</p>')+'</section>'; }
function dayWarning(d){return businessDate(d)!==localDate()?'<p class="note" role="status">Dia operacional de <strong>'+businessDate(d)+'</strong> ainda aberto. Vendas e recebimentos continuam nesse dia até você conferir, fechar e abrir outro.</p>':'';}
function render() {
  const d = opened(state),
    f = financial(state, d?.id),
    today = new Date().toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "hoje") {
    $("#app").innerHTML =
      `<div class="heading"><div><div class="eyebrow">${esc(today)}</div><h1>Vamos vender cookies?</h1><div class="muted">Seu negócio, na palma da mão.</div></div><span class="pill">${d ? "● Dia aberto" : "○ Dia fechado"}</span></div>${
        d
          ? `${dayWarning(d)}<section class="hero"><div><h2>A próxima venda começa aqui.</h2><p>Escolha o sabor, receba e pronto.</p></div><button id="quick">＋ Venda rápida</button></section><div class="metrics"><div class="metric"><small>Vendas do dia</small><strong>${money(f.gross)}</strong></div><div class="metric"><small>Cookies vendidos</small><strong>${f.units} <span class="unit">un.</span></strong></div><div class="metric"><small>A receber do dia</small><strong>${money(f.pending)}</strong></div></div><div class="section-title"><h2>Seus cookies</h2><button id="move">＋ Movimentar estoque</button></div><div class="grid">${state.flavors
              .filter(
                (fl) =>
                  fl.active ||
                  stock(state, d.id, fl.id).available ||
                  stock(state, d.id, fl.id).reserved,
              )
              .map((fl) => {
                const q = stock(state, d.id, fl.id);
                return `<article class="card"><div class="stock-top"><span class="cookie" aria-hidden="true">⠿</span><div><h3>${esc(fl.name)}${fl.active ? "" : " (inativo)"}</h3><div class="price">${money(fl.price)}</div></div></div><div class="stock-info"><div><strong>${q.available}</strong><span>disponíveis</span></div><div class="minor"><strong>${q.reserved}</strong><span>reservados</span></div><div class="minor"><strong>${q.sold}</strong><span>vendidos</span></div></div></article>`;
              })
              .join(
                "",
              )}</div><div class="actions"><button id="share">↗ Divulgar no WhatsApp</button><button id="close">Conferir e fechar dia</button></div><p class="muted">Caixa líquido do dia: <strong>${money(f.cashNet)}</strong>. Pendências de todos os dias: <strong>${money(financial(state).pending)}</strong>.</p>`
          : `<section class="empty"><h2>Uma nova fornada, um novo dia.</h2><p class="muted">Abra o dia com a contagem dos cookies que você trouxe.</p><button class="primary" id="open">＋ Abrir dia de vendas</button></section>`
      }`;
    $("#quick")?.addEventListener("click", () => sale());
    $("#open")?.addEventListener("click", openDay);
    $("#move")?.addEventListener("click", move);
    $("#share")?.addEventListener("click", share);
    $("#close")?.addEventListener("click", closeDay);
  }
  if (tab === "reservas") {
    const rs = state.reservations.filter((r) => r.status === "pending");
    $("#app").innerHTML =
      `<div class="heading"><div><div class="eyebrow">Separados com carinho</div><h1>Reservas</h1></div><span class="pill">${rs.length} pendentes</span></div><button class="primary wide" id="reserve">＋ Nova reserva</button><div class="stack" style="margin-top:20px">${rs.length ? rs.map((r) => `<article class="card"><div class="row"><h3>${esc(r.customer)}</h3><span class="tag">${esc(r.location)}</span></div><p class="receipt">${r.items.map((i) => `${i.qty}× ${esc(i.name)}`).join("<br>")}</p><strong>${money(total(r.items))}</strong><div class="actions"><button data-edit-reservation="${esc(r.id)}">Editar</button><button data-cancel="${esc(r.id)}">Cancelar</button><button class="primary" data-complete="${esc(r.id)}">Concluir retirada</button></div></article>`).join("") : '<div class="empty"><h2>Tudo em dia.</h2><p class="muted">Suas próximas reservas aparecem aqui.</p></div>'}</div>`;
    $("#reserve").onclick = () => sale(true);
    document
      .querySelectorAll("[data-cancel]")
      .forEach((b) => (b.onclick = () => cancel(b.dataset.cancel)));
    document
      .querySelectorAll("[data-complete]")
      .forEach(
        (b) => (b.onclick = () => payment("complete", b.dataset.complete)),
      );
  }
  if (tab === "historico") {
    const all = financial(state);
    $("#app").innerHTML =
      `<div class="heading"><div><div class="eyebrow">Cada cookie conta</div><h1>Histórico</h1></div><button id="backup">Backup</button></div><div class="day-total">Vendas após estornos: ${money(all.gross)} · ${all.units} unidades<br>Estornos: ${money(all.voided)} · A receber: ${money(all.pending)}<br>Entradas: ${money(all.collected)} · Reembolsos: ${money(all.refunded)}<br>Caixa líquido: ${money(all.cashNet)} · A reembolsar: ${money(all.refundPending)}</div>${pendingPanel()}${
        [...state.days]
          .reverse()
          .map((day) => {
            const n = financial(state, day.id);
            return `<details ${day.id === d?.id ? "open" : ""}><summary>${businessDate(day)} · ${day.closedAt ? "Fechado" : "Aberto"} — ${money(n.gross)}</summary><div class="card"><p class="receipt">${n.units} vendidos · Entradas: ${money(n.collected)} · Reembolsos: ${money(n.refunded)} · Caixa líquido: ${money(n.cashNet)}<br>Vendas estornadas: ${money(n.voided)} · A reembolsar: ${money(n.refundPending)}<br>${METHODS.map((m) => `${m}: ${money(n.cashMethods[m])}`).join(" · ")}<br>A receber destas vendas: ${money(n.pending)}</p>${
              state.sales
                .filter((v) => v.dayId === day.id)
                .slice()
                .reverse()
                .map((v) => {
                  const paid = state.payments.find((p) => p.saleId === v.id);
                  return `<div class="row"><div><h3>${esc(v.customer || "Venda no balcão")} ${v.voidedAt ? '<span class="tag">Estornada</span>' : ""}</h3><p class="receipt">${v.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(", ")}<br>${stamp(v.at)} · ${paid ? `${esc(paid.method)} · recebido ${stamp(paid.at)}` : "Pagamento pendente"}</p><strong>${v.voidedAt ? `<del>${money(total(v.items))}</del>` : money(total(v.items))}</strong>${v.voidedAt ? `<p class="receipt">Estorno: ${esc(v.voidReason)} · ${stamp(v.voidedAt)}<br>${refundLabel(v,paid)}</p>` : ""}<div class="actions">${v.refund?.status==="pending"?`<button data-refund="${esc(v.id)}">Registrar reembolso</button>`:""}${!paid && !v.voidedAt ? `<button data-payment="${esc(v.id)}">Receber</button>` : ""}${!v.voidedAt && day.id === d?.id ? `<button class="danger" data-void="${esc(v.id)}">Estornar</button>` : ""}</div></div></div>`;
                })
                .join("") || '<p class="muted">Nenhuma venda neste dia.</p>'
            }<details><summary>Estoque e movimentações</summary>${state.flavors
              .map((fl) => {
                const q = stock(state, day.id, fl.id);
                return `<p class="receipt">${esc(fl.name)}: ${q.received} recebidos, ${q.adjustments} ajustes, ${q.losses} perdas, ${q.sold} vendidos, ${q.available} restantes.</p>`;
              })
              .join("")}${state.events
              .filter((e) => e.dayId === day.id && e.kind !== "audit")
              .map(
                (e) =>
                  `<p class="receipt">${stamp(e.at)} · ${esc(state.flavors.find((f) => f.id === e.flavorId)?.name)} · ${{ receive: "Recebimento", loss: "Perda", adjust: "Ajuste" }[e.kind]}: ${e.qty} · ${esc(e.reason)}</p>`,
              )
              .join(
                "",
              )}</details><details><summary>Reservas processadas</summary>${
              state.reservations
                .filter((r) => r.dayId === day.id && r.status !== "pending")
                .map(
                  (r) =>
                    `<p class="receipt">${esc(r.customer)} · ${esc(r.location)} · ${r.status === "completed" ? "Concluída" : "Cancelada"} · ${stamp(r.finishedAt)}</p>`,
                )
                .join("") || '<p class="muted">Nenhuma.</p>'
            }</details></div></details>`;
          })
          .join("") ||
        '<p class="empty">Seu histórico aparecerá após abrir o primeiro dia.</p>'
      }`;
    $("#backup").onclick = () => download(state);
    document
      .querySelectorAll("[data-payment]")
      .forEach(
        (b) => (b.onclick = () => payment("payment", b.dataset.payment)),
      );
    document
      .querySelectorAll("[data-void]")
      .forEach((b) => (b.onclick = () => voidSale(b.dataset.void)));
  }
}
const ui=createOperationsUI({getState:()=>state,setState:v=>state=v,getBusy:()=>busy,setBusy:v=>busy=v,modal,bindForm,money,esc,stamp,toast,download,openDay,editFlavor,render,channel});
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      tab = b.dataset.tab;
      render();
      window.scrollTo(0, 0);
    }),
);
$("#settings").onclick = settings;
document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.editReservation)sale(true,b.dataset.editReservation);if(b?.dataset.refund)payment('refund',b.dataset.refund);});
function connection() {
  $("#connection").textContent = navigator.onLine
    ? "● Dados salvos neste aparelho"
    : "● Sem internet · continue vendendo offline";
}
window.addEventListener("online", connection);
window.addEventListener("offline", connection);
async function refresh() {
  if (!busy) {
    state = await read();
    render();
  }
}
if (channel) channel.onmessage = () => refresh().catch((e) => toast(e.message));
setInterval(()=>{if(!dialog.open&&!busy&&state)render();},60000);
window.addEventListener("focus", () =>
  refresh().catch((e) => toast(e.message)),
);
try {
  state = await read();
  render();
  connection();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("./sw.js")
      .catch(() => toast("Modo offline indisponível. Use HTTPS ou localhost."));
} catch (e) {
  $("#app").textContent =
    "Não foi possível abrir o banco de dados: " + e.message;
}
