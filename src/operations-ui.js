import { opened, stock, total, METHODS, PICKUP_LOCATIONS, localDate, businessDate, parseBackup,
  financial, reservationPayment, SalePriceChangedError } from "./domain.js";
import { read, restore, recoveryCopies } from "./db.js";
import { displayDate } from "./history-ui.js";

export function createOperationsUI(ctx) {
  const { modal, bindForm, money, esc, stamp, toast, download, openDay, editFlavor, access } = ctx;
  const $ = (s) => document.querySelector(s);
  const options = (pending = false) => [...METHODS, ...(pending ? ["Pendente"] : [])]
    .map((m) => `<option>${m}</option>`).join("");

  function sale(reserve = false, reservationId) {
    const state = ctx.getState(), day = opened(state);
    const reservation = state.reservations.find((r) => r.id === reservationId);
    const paid = reservation && reservationPayment(state, reservation.id);
    if (!day && !paid) return openDay();
    const entries = paid ? [] : state.flavors.flatMap((flavor) => {
      const old = reservation?.items.find((i) => i.flavorId === flavor.id);
      const available = stock(state, day.id, flavor.id).available;
      if (!old && (!flavor.active || !available)) return [];
      return [{ flavor, qty: old?.qty ?? 0, max: available + (old?.qty ?? 0), price: old?.price ?? flavor.price }];
    });
    const title = reservation ? "Editar reserva" : reserve ? "Nova reserva" : "Venda rápida";
    if (!paid && !entries.length) {
      modal(title, '<p class="note">Sem unidades livres. Confira o estoque em Hoje ou conclua uma retirada na aba Reservas.</p>');
      return;
    }
    const controls = entries.map(({ flavor, qty, max, price }, index) =>
      `<div class="picker-row"><div><strong>${esc(flavor.name)}</strong><small><span data-price="${index}">${money(price)}</span> · até ${max} un.</small></div>
        <div class="stepper">
          <button type="button" data-step="-1" data-pick="${index}" aria-label="Diminuir ${esc(flavor.name)}" ${qty ? "" : "disabled"}>−</button>
          <input readonly tabindex="-1" aria-label="Quantidade de ${esc(flavor.name)}" name="qty_${index}" value="${qty}" inputmode="none">
          <button type="button" data-step="1" data-pick="${index}" aria-label="Adicionar ${esc(flavor.name)}" ${qty >= max ? "disabled" : ""}>+</button>
        </div></div>`).join("");
    const customer = `<label>Cliente<input name="customer" value="${esc(reservation?.customer ?? "")}" ${reserve ? "required" : ""} maxlength="100" autocomplete="name"></label>`;
    const location = reservation?.location ?? "";
    const legacyLocation = location && !PICKUP_LOCATIONS.includes(location);
    const locationOptions = PICKUP_LOCATIONS.map((option) =>
      `<option${option === location ? " selected" : ""}>${esc(option)}</option>`).join("");
    const customerFields = reserve
      ? `${customer}<label>Local de retirada<select name="location" ${!reservation || location ? "required" : ""}>
          <option value="" disabled${location ? "" : " selected"}>Selecione o local</option>
          ${legacyLocation ? `<option value="legacy" selected>${esc(location)} (local anterior)</option>` : ""}
          ${locationOptions}</select></label>
        ${paid ? '<p class="muted">Os sabores e as quantidades já foram pagos.</p>'
          : reservation ? '<p class="muted">Sabores já reservados mantêm o preço original.</p>' : ""}`
      : `<details><summary>Adicionar nome do cliente</summary>${customer}</details>`;
    modal(title, `<form class="sale-form">
      <div class="sale-scroll">${paid ? `<p class="receipt">${reservation.items.map((i) =>
        `${i.qty}× ${esc(i.name)}`).join("<br>")}</p>` : `<div class="picker-list">${controls}</div>`}
        ${customerFields}</div>
      <div class="sale-footer">${reserve ? "" : `<label class="sale-method">Pagamento<select name="method" aria-label="Pagamento">${options(true)}</select></label>`}
        <div class="total"><span>Total</span><strong id="sale-total" aria-live="polite">${money(0)}</strong></div>
        <p class="error" role="alert"></p>
        ${reserve ? "" : '<label class="confirmation" hidden><input type="checkbox" name="confirmPrices" required disabled>Conferi os novos preços.</label>'}
        <button class="primary wide" type="submit">${reservation ? "Salvar alterações" : reserve ? "Confirmar reserva" : "Confirmar venda"}</button>
      </div></form>`);

    const form = $("#dialog-body form");
    const priceConfirmation = form.elements.namedItem("confirmPrices");
    const selected = (fd) => entries.flatMap(({ flavor, price }, index) => {
      const qty = Number(fd.get("qty_" + index));
      return qty ? [{ flavorId: flavor.id, qty, price }] : [];
    });
    function update() {
      const items = selected(new FormData(form));
      $("#sale-total").textContent = money(paid ? paid.amount : total(items));
      const waitingForConfirmation = priceConfirmation && !priceConfirmation.disabled && !priceConfirmation.checked;
      form.querySelector("[type=submit]").disabled = ctx.getBusy() || (!paid && !items.length) || Boolean(waitingForConfirmation);
    }
    priceConfirmation?.addEventListener("change", update);
    form.querySelectorAll("[data-pick]").forEach((button) => {
      button.onclick = () => {
        if (ctx.getBusy()) return;
        const index = Number(button.dataset.pick), max = entries[index].max;
        const input = form.elements.namedItem("qty_" + index);
        const qty = Math.max(0, Math.min(max, Number(input.value) + Number(button.dataset.step)));
        input.value = qty;
        const stepper = button.parentElement;
        const decrease = stepper.querySelector('[data-step="-1"]');
        const increase = stepper.querySelector('[data-step="1"]');
        decrease.disabled = qty === 0;
        increase.disabled = qty >= max;
        if (button.disabled) {
          const other = button === increase ? decrease : increase;
          if (!other.disabled) other.focus({ preventScroll: true });
        }
        update();
      };
    });
    bindForm((fd) => {
      const items = paid ? undefined : selected(fd);
      return {
        type: reservation ? "edit-reservation" : reserve ? "reserve" : "sale",
        reservationId: reservation?.id, expectedRevision: reservation?.revision ?? 0,
        items, customer: fd.get("customer"),
        location: fd.get("location") === "legacy" ? location : fd.get("location") ?? location,
        method: fd.get("method"),
        expectedPrices: reserve ? undefined : Object.fromEntries(items.map(({ flavorId, price }) => [flavorId, price])),
      };
    }, undefined, (error) => {
      if (!(error instanceof SalePriceChangedError)) return;
      const prices = new Map(error.items.map(({ flavorId, price }) => [flavorId, price]));
      for (const [index, entry] of entries.entries()) {
        const price = prices.get(entry.flavor.id);
        if (price === undefined) continue;
        entry.price = price;
        form.querySelector(`[data-price="${index}"]`).textContent = money(price);
      }
      priceConfirmation.checked = false;
      priceConfirmation.disabled = false;
      priceConfirmation.closest("label").hidden = false;
      update();
    });
    update();
  }

  function payment(type, id) {
    const state = ctx.getState(), day = opened(state);
    const reservationRefund = type === "reservation-refund";
    const refund = type === "refund" || reservationRefund;
    const complete = type === "complete";
    const prepay = type === "reservation-payment";
    const reservation = complete || prepay || reservationRefund;
    const title = refund ? "Registrar reembolso" : complete ? "Concluir retirada"
      : prepay ? "Registrar pagamento" : "Receber pagamento";
    const entry = (reservation ? state.reservations : state.sales).find((v) => v.id === id);
    if (!entry) return;
    const paid = complete && reservationPayment(state, id);
    if (!day) {
      const guidance = complete ? "Depois de abrir, volte a Reservas e conclua a retirada."
        : prepay ? "Abra um dia para lançar o valor nesse caixa. Em Reservas, registre o pagamento e informe a data em que recebeu."
        : refund ? "A devolução entra no caixa do novo dia. Depois de abrir, volte a Pendências no Histórico."
        : "O pagamento entra no caixa do novo dia. Depois de abrir, volte a Pendências no Histórico.";
      modal("Abra um dia de vendas",
        `<p>${guidance}</p>
        <button class="primary wide" id="open-for-payment">Abrir dia de vendas</button>`);
      $("#open-for-payment").onclick = openDay;
      return;
    }
    const business = businessDate(day);
    const impact = paid ? `Pagamento de ${money(paid.amount)} via ${paid.method} recebido em ${stamp(paid.at)}. Confirme a entrega dos cookies.`
      : `${refund ? "Saída no caixa" : complete ? "Se receber agora, a entrada fica no caixa" : "Entrada no caixa"} de ${displayDate(business)}.`;
    const method = refund ? "reembolso" : "pagamento";
    modal(title, `<form>
      <p><strong>${esc(entry.customer || "Venda no balcão")}</strong> · ${money(total(entry.items))}<br>
      <span class="muted">${reservation ? "Reserva" : "Venda"} de ${stamp(entry.at)}. ${impact}</span></p>
      ${business !== localDate() ? '<p class="note">O dia aberto é anterior à data atual. As operações ficam nesse dia até fechá-lo.</p>' : ""}
      ${refund ? '<p class="note">Confirme depois de devolver efetivamente o dinheiro ao cliente.</p>' : ""}
      ${paid ? "" : `<label>Forma de ${method}<select name="method">${options(complete)}</select></label>`}
      ${prepay ? `<details><summary>Informar data de recebimento anterior</summary>
        <label>Data e hora em que recebeu<input name="receivedAt" type="datetime-local"></label>
        <p class="muted">Se deixar em branco, o app usa o horário atual. O valor entra no caixa aberto.</p>
      </details>` : ""}
      <p class="error" role="alert"></p><button class="primary" type="submit">${refund ? "Confirmar valor devolvido"
        : paid ? "Confirmar retirada" : prepay ? "Confirmar recebimento" : "Confirmar"}</button>
      </form>`);
    bindForm((fd) => {
      const receivedAt = fd.get("receivedAt");
      return {
        type: reservationRefund ? "refund" : type,
        reservationId: reservation ? id : undefined,
        saleId: reservation ? undefined : id,
        expectedRevision: reservation ? entry.revision ?? 0 : undefined,
        method: fd.get("method"),
        receivedAt: receivedAt ? new Date(receivedAt).toISOString() : undefined,
      };
    });
  }

  function settings() {
    const state = ctx.getState();
    modal("Configurações", `<h3>Sabores e preços</h3><div>
      ${state.flavors.map((f) => `<div class="row"><span>${esc(f.name)}<small class="receipt"> · ${money(f.price)}${f.active ? "" : " · inativo"}</small></span>
        <button data-edit="${esc(f.id)}">Editar</button></div>`).join("")}</div>
      <button class="wide" id="add-flavor">＋ Adicionar sabor</button>
      <section class="settings-section"><h3>Senha de acesso</h3>
        <p class="muted">Bloqueio da interface neste navegador. Funciona offline e mantém o JSON legível.</p>
        <div class="actions"><button id="configure-access">${access.enabled ? "Alterar senha" : "Configurar senha"}</button>
          ${access.enabled ? '<button id="lock-access">Bloquear agora</button>' : ""}</div></section>
      <section class="settings-section"><h3>Backup</h3>
        <p class="muted">Confirme o download no app Arquivos ou na pasta Downloads.</p>
        <div class="actions"><button id="export">Exportar backup</button><button id="import">Restaurar JSON</button>
          <button id="recovery">Cópias anteriores à restauração</button></div>
        <input hidden type="file" id="file" accept=".json,application/json">
        <p id="backup-error" class="error" role="alert"></p></section>`);

    $("#dialog-body").querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => editFlavor(b.dataset.edit));
    $("#add-flavor").onclick = () => editFlavor();
    $("#configure-access").onclick = () => access.passwordForm(access.enabled ? "change" : "setup");
    if (access.enabled) $("#lock-access").onclick = () => { if (!ctx.getBusy()) access.lock({ notify: true }); };

    const file = $("#file");
    const error = $("#backup-error");
    const visible = () => file.isConnected && $("#dialog").open && !access.locked;
    $("#export").onclick = async () => {
      try {
        const data = await read();
        if (visible()) {
          download(data);
          toast("Download solicitado. Confira se o arquivo foi salvo.");
        }
      } catch (err) { error.textContent = err.message; }
    };
    $("#import").onclick = () => file.click();
    $("#recovery").onclick = async () => {
      try {
        const copies = await recoveryCopies();
        if (!visible()) return;
        modal("Cópias de recuperação", `<p class="muted">Cada restauração guarda uma cópia independente neste aparelho.
          Para recuperar, exporte a cópia desejada e use Restaurar JSON.</p>
          ${copies.map((c, i) => `<div class="row"><span>${c.at ? stamp(c.at) : "Cópia da versão anterior"} · ${c.data.sales.length} vendas</span><button data-copy="${i}">Exportar</button></div>`).join("") || "<p>Nenhuma restauração realizada.</p>"}`);
        $("#dialog-body").querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => {
          download(copies[Number(b.dataset.copy)].data);
          toast("Download solicitado. Confira se o arquivo foi salvo.");
        });
      } catch (err) { error.textContent = err.message; }
    };
    file.onchange = async () => {
      if (!file.files[0]) return;
      try {
        const data = parseBackup(await file.files[0].text());
        const before = await read();
        if (visible()) previewRestore(data, before);
      } catch (err) { error.textContent = err.message; }
    };
  }

  function previewRestore(data, before) {
    const summary = (snapshot) => {
      const n = financial(snapshot);
      return `${snapshot.days.length} dias, ${snapshot.sales.length} vendas, ${snapshot.reservations.length} reservas.
        Vendas líquidas de estornos ${money(n.gross)} · Caixa líquido ${money(n.cashNet)} · A receber ${money(n.pending)} · A reembolsar ${money(n.refundPending)}.`;
    };
    modal("Conferir restauração", `<p><strong>Dados atuais</strong><br>${summary(before)}</p>
      <p><strong>Arquivo escolhido</strong><br>${summary(data)}</p>
      <p class="note">A restauração substitui os dados operacionais. O aplicativo guarda uma cópia dos dados atuais na mesma gravação e preserva as cópias anteriores. A senha local continua ativa neste aparelho.</p>
      <button id="export-before">Baixar backup dos dados atuais</button>
      <p class="muted" id="download-status">Confira se o backup abriu no app Arquivos ou na pasta Downloads.</p>
      <label class="confirmation"><input type="checkbox" id="restore-consent">Confirmo a substituição dos dados atuais pelo arquivo escolhido.</label>
      <button class="danger wide" id="restore" disabled>Substituir dados e restaurar</button><button id="cancel-restore">Cancelar</button>
      <p class="error" role="alert" id="restore-error"></p>`);
    $("#export-before").onclick = () => {
      try {
        download(before);
        $("#download-status").textContent = "Download solicitado. Verifique o arquivo salvo em Arquivos/Downloads.";
      } catch (err) { $("#restore-error").textContent = err.message; }
    };
    const consent = $("#restore-consent");
    const confirm = $("#restore");
    consent.onchange = () => { confirm.disabled = !consent.checked; };
    $("#cancel-restore").onclick = () => { if (!ctx.getBusy()) $("#dialog").close(); };
    confirm.onclick = async () => {
      if (ctx.getBusy() || access.locked || !consent.checked) return;
      ctx.setBusy(true);
      const controls = $("#dialog-body").querySelectorAll("button, input");
      controls.forEach((el) => { el.disabled = true; });
      try {
        ctx.setState(await restore(data, { confirmed: true, expectedState: JSON.stringify(before) }));
        ctx.channel?.postMessage("changed");
        $("#dialog").close();
        ctx.render();
        toast("Restaurado. Cópia anterior preservada no aparelho.");
      } catch (err) {
        $("#restore-error").textContent = err.message;
      } finally {
        controls.forEach((el) => { el.disabled = false; });
        consent.checked = false;
        confirm.disabled = true;
        ctx.setBusy(false);
      }
    };
  }

  return { sale, payment, settings };
}
