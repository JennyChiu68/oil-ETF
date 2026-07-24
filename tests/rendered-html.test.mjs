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

test("server-renders the production USO and BNO report", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>原油ETF持仓报告｜WTI USO・Brent BNO<\/title>/i,
  );
  assert.match(html, /原油ETF持仓报告/);
  assert.match(html, /当前名义原油敞口/);
  assert.match(html, /美国布伦特原油基金/);
  assert.match(html, /2,628\.03/);
  assert.match(html, /资产净值变化一览/);
  assert.match(html, /按桶/);
  assert.match(html, /按美元/);
  assert.match(html, /-159\.70/);
  assert.match(html, /并非历史逐日真实合约增减/);
  assert.ok(
    html.indexOf("<h2>资产净值变化一览</h2>") <
      html.indexOf("<h2>持仓结构</h2>"),
    "资产变化应排在合约持仓结构之前",
  );
  assert.doesNotMatch(html, /溢折价监控/);
  assert.doesNotMatch(html, /极值与展期监控/);
  assert.doesNotMatch(html, /数据口径与来源/);
  assert.match(
    html,
    /https:\/\/oil-etf-report\.example\/og\.png/,
  );
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("both frozen snapshots are internally consistent and source-backed", async () => {
  for (const symbol of ["uso", "bno"]) {
    const payload = JSON.parse(
      await readFile(
        new URL(`../public/data/${symbol}-snapshot.json`, import.meta.url),
        "utf8",
      ),
    );

    assert.equal(payload.fund.symbol, symbol.toUpperCase());
    assert.equal(payload.fund.asOfDate, payload.history.dateTo);
    assert.equal(payload.history.records, payload.history.rows.length);
    assert.ok(payload.history.rows.length >= 1_200);
    assert.ok(payload.current.oilBarrelEquivalent > 5_000_000);
    assert.ok(payload.current.netAssets > 500_000_000);
    assert.ok(
      payload.holdings.some(
        (holding) => holding.holdingType === "Futures",
      ),
    );
    for (const holding of payload.holdings.filter(
      (item) => item.holdingType === "Futures",
    )) {
      assert.equal(
        holding.marketValue,
        holding.quantity * 1_000 * holding.price,
      );
    }
    assert.ok(
      Math.abs(
        payload.current.nav * payload.current.sharesOutstanding -
          payload.current.netAssets,
      ) /
        payload.current.netAssets <
        0.001,
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
    assert.match(
      payload.methodology.assetChangeBarrels,
      /不代表历史逐日真实合约增减/,
    );

    const latest = payload.history.rows.at(-1);
    const latestBarrelEquivalentChange =
      (latest.netAssetsChange * payload.current.oilBarrelEquivalent) /
      payload.current.netAssets;
    assert.ok(Number.isFinite(latestBarrelEquivalentChange));
  }

  const bno = JSON.parse(
    await readFile(
      new URL("../public/data/bno-snapshot.json", import.meta.url),
      "utf8",
    ),
  );
  const bnoFutures = bno.holdings.filter(
    (holding) => holding.holdingType === "Futures",
  );
  const contractualBarrels = bnoFutures.reduce(
    (sum, holding) => sum + holding.quantity * 1_000,
    0,
  );
  assert.equal(bno.current.swapBarrelEquivalent, 0);
  assert.equal(bno.current.barrelEquivalentType, "contractual");
  assert.equal(bno.current.oilBarrelEquivalent, contractualBarrels);
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
  const bnoSnapshot = await readFile(
    new URL("../public/data/bno-snapshot.json", import.meta.url),
    "utf8",
  );

  assert.match(script, /historicalnav\/\$\{symbol\}\/inception-today/);
  assert.match(script, /holding\/\$\{symbol\}\/full/);
  assert.doesNotMatch(snapshot, /Bearer |var token|eyJhbGciOi/);
  assert.doesNotMatch(bnoSnapshot, /Bearer |var token|eyJhbGciOi/);
});
