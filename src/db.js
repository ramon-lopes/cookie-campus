import { initial, apply, validate } from "./domain.js";
let connection;
export function connect() {
  return (connection ||= new Promise((resolve, reject) => {
    const r = indexedDB.open("cookies-campus", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("app");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(new Error("Feche outras abas para atualizar o banco."));
  }));
}
export async function read() {
  const db = await connect();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("app", "readonly");
    const r = tx.objectStore("app").get("state");
    r.onsuccess = () => resolve(r.result || initial());
    r.onerror = () => reject(r.error);
  });
}
export async function mutate(command) {
  return transaction((s) => apply(s, command));
}
export async function readAccess() {
  const db = await connect();
  return new Promise((resolve, reject) => {
    const request = db.transaction("app", "readonly").objectStore("app").get("local-access");
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}
export async function writeAccess(next, expectedId) {
  const db = await connect();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("app", "readwrite"), store = tx.objectStore("app");
    let conflict;
    const request = store.get("local-access");
    request.onsuccess = () => {
      if ((request.result?.id ?? null) !== expectedId) {
        conflict = new Error("A configuração de senha mudou em outra aba. Abra a tela novamente.");
        tx.abort();
        return;
      }
      store.put(next, "local-access");
    };
    tx.oncomplete = resolve;
    tx.onabort = () => reject(conflict || tx.error || new Error("Não foi possível salvar a senha."));
  });
}
export async function restore(data, { confirmed = false, expectedState } = {}) {
  if (confirmed !== true || typeof expectedState !== "string")
    throw new Error("Confirme explicitamente a substituição dos dados.");
  const snapshot = structuredClone(validate(data));
  return transaction((before) => {
    if (JSON.stringify(before) !== expectedState)
      throw new Error(
        "Os dados mudaram desde a conferência. Cancele e confira a restauração novamente.",
      );
    return snapshot;
  }, true);
}
export async function recoveryCopy() {
  const db = await connect();
  return new Promise((resolve, reject) => {
    const r = db
      .transaction("app", "readonly")
      .objectStore("app")
      .get("before-restore");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function recoveryCopies() {
  const db = await connect();
  return new Promise((resolve, reject) => {
    const rows = [],
      tx = db.transaction("app", "readonly"),
      r = tx.objectStore("app").openCursor();
    r.onsuccess = () => {
      const c = r.result;
      if (!c) return;
      if (String(c.key).startsWith("recovery:")) rows.push(c.value);
      else if (c.key === "before-restore")
        rows.push({ id: "legacy", at: null, data: c.value });
      c.continue();
    };
    tx.oncomplete = () => resolve(rows);
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => {};
  });
}
async function transaction(fn, recovery = false) {
  const db = await connect();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("app", "readwrite"),
      store = tx.objectStore("app");
    let result, error;
    const r = store.get("state");
    r.onsuccess = () => {
      try {
        const before = r.result || initial();
        result = fn(before);
        if (recovery) {
          const id = crypto.randomUUID();
          store.add(
            { id, at: new Date().toISOString(), data: before },
            "recovery:" + id,
          );
        }
        store.put(result, "state");
      } catch (e) {
        error = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(error || tx.error || new Error("Gravação cancelada."));
    tx.onerror = () => {};
  });
}
