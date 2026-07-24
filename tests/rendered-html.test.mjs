import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://oil-etf-report.example/", {
      headers: {
        accept: "text/html",
        host: "oil-etf-report.example",
        "x-forwarded-host": "oil-etf-report.example",
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
}

test("server-renders the production USO report", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>原油ETF持仓报告｜USO<\/title>/i);
  assert.match(html, /原油ETF持仓报告/);
  assert.match(html, /当前原油名义敞口/);
  assert.match(html, /2,628\.03/);
  assert.match(html, /资产净值变化一览/);
  assert.match(html, /溢折价监控/);
  assert.match(html, /数据口径与来源/);
  assert.match(
    html,
    /https:\/\/oil-etf-report\.example\/og\.png/,
  );
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("frozen snapshot is internally consistent and source-backed", async () => {
  const payload = JSON.parse(
    await readFile(
      new URL("../public/data/uso-snapshot.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(payload.fund.symbol, "USO");
  assert.equal(payload.fund.asOfDate, payload.history.dateTo);
  assert.equal(payload.history.records, payload.history.rows.length);
  assert.ok(payload.history.rows.length >= 1_200);
  assert.ok(payload.current.oilBarrelEquivalent > 20_000_000);
  assert.ok(payload.current.netAssets > 1_000_000_000);
  assert.ok(
    payload.holdings.some(
      (holding) =>
        holding.holdingType === "Futures" &&
        holding.name.includes("WTI CRUDE FUTURE"),
    ),
  );

  for (let index = 0; index < payload.history.rows.length; index += 1) {
    const row = payload.history.rows[index];
    assert.ok(row.nav > 0);
    assert.ok(row.netAssets > 0);
    if (index > 0) {
      assert.ok(row.date > payload.history.rows[index - 1].date);
    }
  }

  assert.ok(
    payload.sources.every((source) => source.url.startsWith("https://")),
  );
});

test("manual refresh script does not persist the public API token", async () => {
  const script = await readFile(
    new URL("../scripts/fetch-uso-snapshot.mjs", import.meta.url),
    "utf8",
  );
  const snapshot = await readFile(
    new URL("../public/data/uso-snapshot.json", import.meta.url),
    "utf8",
  );

  assert.match(script, /historicalnav\/USO\/inception-today/);
  assert.match(script, /holding\/USO\/full/);
  assert.doesNotMatch(snapshot, /Bearer |var token|eyJhbGciOi/);
});
