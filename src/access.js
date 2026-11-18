import { readAccess, writeAccess } from "./db.js";

const encoder = new TextEncoder();
const iterations = 600000;
const randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));
const hex = (bytes) => Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");

async function derive(value, salt, rounds) {
  if (!crypto.subtle) throw new Error("Abra o app por HTTPS ou localhost para usar senha.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds }, key, 256,
  );
  return new Uint8Array(bits);
}
async function verifier(value) {
  const salt = randomBytes(16);
  const hash = await derive(value, salt, iterations);
  return { salt, hash, iterations };
}
async function matches(value, saved) {
  const hash = await derive(value, saved.salt, saved.iterations);
  return hash.reduce((diff, byte, i) => diff | (byte ^ saved.hash[i]), 0) === 0;
}

export function createAccess({ modal, esc, getBusy, setBusy, channel, onUnlock, onLock }) {
  const workspace = document.querySelector("#workspace-ui");
  const screen = document.querySelector("#access-screen");
  const dialog = document.querySelector("#dialog");
  let credential;
  let locked = true;

  function unlock() {
    locked = false;
    screen.hidden = true;
    screen.replaceChildren();
    workspace.hidden = false;
  }

  function bind(form, submit) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (getBusy()) return;
      const button = e.submitter ?? form.querySelector('[type="submit"]');
      const error = form.querySelector(".error");
      button.disabled = true;
      error.textContent = "";
      setBusy(true);
      try {
        await submit(new FormData(form));
      } catch (err) {
        error.textContent = err.message;
      } finally {
        button.disabled = false;
        setBusy(false);
      }
    };
  }

  function renderLock() {
    screen.innerHTML = `<div class="access-card card">
      <span class="brand-icon" aria-hidden="true">◉</span><h1>Cookie Campus</h1>
      <form><label>Senha<input name="password" type="password" autocomplete="current-password" maxlength="128" required></label>
        <p class="error" role="alert"></p><button class="primary" type="submit">Desbloquear</button>
      </form>
      <button class="link-button" type="button" id="recover-access">Esqueci a senha</button>
    </div>`;
    bind(screen.querySelector("form"), async (fd) => {
      const verified = credential;
      if (!await matches(fd.get("password"), verified.password)) throw new Error("Senha incorreta.");
      if ((await readAccess())?.id !== verified.id) throw new Error("A senha mudou em outra aba. Tente novamente.");
      unlock();
      setBusy(false);
      onUnlock();
    });
    screen.querySelector("#recover-access").onclick = () => {
      if (!getBusy()) passwordForm("recover");
    };
  }

  function lock({ notify = false } = {}) {
    if (!credential) return;
    locked = true;
    if (dialog.open) dialog.close();
    onLock();
    workspace.hidden = true;
    screen.hidden = false;
    renderLock();
    if (notify) channel?.postMessage("locked");
  }

  async function refresh() {
    const next = await readAccess();
    if (next?.id === credential?.id && credential !== undefined) return;
    credential = next;
    if (credential) lock();
    else unlock();
  }

  function passwordForm(mode) {
    const recovering = mode === "recover";
    const changing = mode === "change";
    const title = recovering ? "Recuperar acesso" : changing ? "Alterar senha" : "Configurar senha";
    const html = `<form>
      ${recovering ? `<p class="muted">Use o código que você guardou ao configurar a senha. Se perdeu os dois, você pode restaurar seu último backup em outro navegador ou aparelho.</p>
        <label>Código de recuperação<input name="secret" autocapitalize="none" spellcheck="false" maxlength="80" required></label>` : ""}
      ${changing ? '<label>Senha atual<input name="secret" type="password" maxlength="128" autocomplete="current-password" required></label>' : ""}
      <label>Nova senha<input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label>
      <label>Confirme a nova senha<input name="confirmation" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label>
      <p class="muted">Use pelo menos 8 caracteres. O bloqueio vale para a interface deste navegador, inclusive offline. Os arquivos JSON continuam legíveis.</p>
      <p class="error" role="alert"></p><button class="primary" type="submit">Salvar senha</button>
    </form>`;
    if (recovering) {
      screen.innerHTML = `<div class="access-card card"><h1>${title}</h1>${html}
        <button class="link-button" type="button" id="back-to-unlock">Voltar para a senha</button></div>`;
      screen.querySelector("#back-to-unlock").onclick = () => { if (!getBusy()) renderLock(); };
    } else modal(title, html);
    const container = recovering ? screen : dialog;
    const current = credential;
    bind(container.querySelector("form"), async (fd) => {
      if (fd.get("password") !== fd.get("confirmation")) throw new Error("As senhas são diferentes.");
      if (changing && !await matches(fd.get("secret"), current.password))
        throw new Error("Senha atual incorreta.");
      if (recovering && !await matches(fd.get("secret").toLowerCase().replace(/[\s-]/g, ""), current.recovery))
        throw new Error("Código de recuperação incorreto.");

      const code = hex(randomBytes(16));
      const [password, recovery] = await Promise.all([verifier(fd.get("password")), verifier(code)]);
      const next = { id: crypto.randomUUID(), password, recovery };
      await writeAccess(next, current?.id ?? null);
      credential = next;
      channel?.postMessage("access-changed");
      const formatted = code.match(/.{4}/g).join("-");
      const result = `<p>Guarde este código fora do app. Ele permite trocar a senha e será exibido uma vez.</p>
        <p class="recovery-code"><code>${esc(formatted)}</code></p>
        <button class="primary wide" id="saved-code">Guardei o código</button>`;
      if (recovering) screen.innerHTML = `<div class="access-card card"><h1>Senha atualizada</h1>${result}</div>`;
      else modal("Senha salva", result);
      container.querySelector("#saved-code").onclick = () => {
        if (recovering) {
          unlock();
          onUnlock();
        } else lock({ notify: true });
      };
    });
  }

  return {
    get locked() { return locked; },
    get enabled() { return Boolean(credential); },
    refresh, lock, passwordForm,
  };
}
