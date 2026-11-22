import { test } from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import vm from "node:vm";
import { buildApp } from "../scripts/build.mjs";

test("PWA: build, precache completo e fallback offline sob o caminho do Pages", async (t) => {
  const output = await mkdtemp(join(tmpdir(), "cookie-campus-pwa-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  const previousBundle = join(output, "src", "stock-cards.js");
  await mkdir(join(output, "src"));
  await writeFile(previousBundle, "// Bundle da versão anterior");
  await buildApp(output);
  await assert.rejects(access(previousBundle), { code: "ENOENT" });

  const scope = "https://test.example/cookie-campus/";
  const prefix = "cookie-campus:" + scope + ":";
  const currentCache = new Set();
  const cached = new Map();
  const events = {};
  const removed = [];
  const cache = {
    async addAll(requests) {
      for (const request of requests) {
        assert.equal(request.cache, "reload");
        assert.ok(request.url.startsWith(scope));
        const path = request.url.slice(scope.length) || "index.html";
        cached.set(request.url, await readFile(join(output, path), "utf8"));
      }
    },
    async match(request) {
      return cached.get(new URL(request.url ?? request, scope).href);
    },
  };
  const context = {
    self: {
      registration: { scope },
      addEventListener: (type, callback) => { events[type] = callback; },
      clients: { claim: async () => {} },
    },
    caches: {
      open: async (key) => { currentCache.add(key); return cache; },
      keys: async () => ["cookie-campus-v2", prefix + "v7", "cookie-campus:https://test.example/other/:v2", ...currentCache],
      delete: async (key) => removed.push(key),
    },
    URL, Request, Response,
    fetch: async () => { throw new Error("offline"); },
  };
  vm.runInNewContext(await readFile(join(output, "sw.js"), "utf8"), context);
  const extend = (type) => new Promise((resolve) => events[type]({ waitUntil: resolve }));
  await extend("install");

  const files = await readdir(output, { recursive: true, withFileTypes: true });
  const expected = files.filter((entry) => entry.isFile() && entry.name !== "sw.js")
    .map((entry) => relative(output, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .map((path) => new URL(path, scope).href);
  assert.deepEqual([...cached.keys()].sort(), [scope, ...expected].sort());
  const reactBundle = scope + "src/react-ui.js";
  assert.match(cached.get(reactBundle), /mountStockCards/);
  assert.match(cached.get(reactBundle), /mountHistorySummary/);
  assert.match(cached.get(scope + "src/app.js"), /from "\.\/react-ui\.js"/);
  assert.ok(cached.has(scope + "icons/cookies-nutella.png"));
  assert.equal(currentCache.size, 1);
  assert.match([...currentCache][0].slice(prefix.length), /^[0-9a-f]{16}$/);

  await extend("activate");
  assert.deepEqual(removed, [prefix + "v7"]);
  const offline = (url, mode) => new Promise((resolve) => events.fetch({
    request: { method: "GET", url, mode },
    respondWith: resolve,
  }));
  assert.equal(await offline(reactBundle, "cors"), cached.get(reactBundle));
  assert.equal(await offline(scope + "unknown", "navigate"), cached.get(scope + "index.html"));

  const manifest = JSON.parse(cached.get(scope + "manifest.webmanifest"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) await access(join(output, icon.src));
});
