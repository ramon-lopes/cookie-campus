import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { checkRepositoryData } from "./check-data.mjs";

const staticFiles = [
  "index.html", "styles.css", "manifest.webmanifest",
  "src/app.js", "src/domain.js", "src/db.js", "src/operations-ui.js", "src/history-ui.js", "src/access.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "icons/cookies-black.png", "icons/cookies-nutella.png", "icons/cookies-red.png", "icons/cookies-tradicional.png",
];
const worker = "sw.js";
const component = "src/stock-cards.jsx";
const bundle = "src/stock-cards.js";
const allowed = new Set([...staticFiles, bundle, worker]);

async function checkOutput(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory() && (name === "src" || name === "icons")) {
      await checkOutput(join(directory, entry.name), name + "/");
    } else if (!entry.isFile() || !allowed.has(name)) {
      throw new Error(`Arquivo não permitido no build: ${name}. Mova-o para fora da pasta de saída antes de publicar.`);
    }
  }
}

export async function buildApp(output = "dist") {
  await checkRepositoryData([...staticFiles, worker, component]);
  await mkdir(output, { recursive: true });
  await checkOutput(output);

  const result = await build({
    configFile: false,
    publicDir: false,
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      target: "safari15.4",
      rolldownOptions: { input: component, preserveEntrySignatures: "strict" },
    },
  });
  const [chunk, ...extra] = (Array.isArray(result) ? result : [result]).flatMap(({ output }) => output);
  if (extra.length || chunk?.type !== "chunk") {
    throw new Error("Esperava um único módulo JavaScript dos cards de estoque.");
  }
  const files = new Map(await Promise.all(staticFiles.map(async (file) => [file, await readFile(file)])));
  files.set(bundle, chunk.code);

  const assets = ["./", ...Array.from(files.keys(), (file) => `./${file}`)];
  const workerSource = await readFile(worker, "utf8");
  const hash = createHash("sha256").update(workerSource);
  for (const [file, content] of files) {
    hash.update(file).update(createHash("sha256").update(content).digest());
  }
  const version = hash.digest("hex").slice(0, 16);
  files.set(worker, `const CACHE_VERSION = "${version}";\nconst ASSETS = ${JSON.stringify(assets)};\n${workerSource}`);

  for (const [file, content] of files) {
    const destination = join(output, file);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildApp();
  console.log("Aplicação estática preparada em dist/");
}
