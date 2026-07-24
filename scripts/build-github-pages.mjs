import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const clientDir = resolve(projectRoot, "dist/client");
const outputDir = resolve(projectRoot, "pages-dist");
const workerUrl = new URL(
  `../dist/server/index.js?pages=${Date.now()}`,
  import.meta.url,
);
const { default: worker } = await import(workerUrl.href);

const response = await worker.fetch(
  new Request("https://jennychiu68.github.io/", {
    headers: {
      accept: "text/html",
      host: "jennychiu68.github.io",
      "x-forwarded-host": "jennychiu68.github.io",
      "x-forwarded-proto": "https",
    },
  }),
  {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  },
  {
    waitUntil() {},
    passThroughOnException() {},
  },
);

if (!response.ok) {
  throw new Error(`GitHub Pages render failed with ${response.status}`);
}

let html = await response.text();
html = html.replaceAll(
  "https://jennychiu68.github.io/og.png",
  "https://jennychiu68.github.io/oil-ETF/og.png",
);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(clientDir, outputDir, { recursive: true });
await writeFile(resolve(outputDir, "index.html"), html);
await writeFile(resolve(outputDir, "404.html"), html);
await writeFile(resolve(outputDir, ".nojekyll"), "");

const manifest = JSON.parse(
  await readFile(resolve(clientDir, ".vite/manifest.json"), "utf8"),
);
if (!Object.keys(manifest).length) {
  throw new Error("GitHub Pages client manifest is empty");
}

console.log(`Prepared GitHub Pages output at ${outputDir}`);
