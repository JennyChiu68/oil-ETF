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
  assert.match(html, /2,591\.62/);
  assert.match(html, /持仓变化一览/);
  assert.match(html, /按桶/);
  assert.match(html, /按美元/);
  assert.match(html, /-327\.39/);
  assert.match(html, /已剔除油价涨跌/);
  assert.match(html, /申赎驱动的持仓变化估算/);
  assert.ok(
    html.indexOf("<h2>持仓变化一览</h2>") <
      html.indexOf("<h2>当前持仓</h2>"),
    "持仓变化应排在当前持仓之前",
  );
  assert.match(html, /2026年9月到期/);
  assert.match(html, /原油敞口构成/);
  assert.match(html, /查看合约明细/);
  assert.doesNotMatch(html, /原油相关名义市值/);
  assert.doesNotMatch(html, /现金与等价物 \/ NAV/);
  assert.doesNotMatch(html, /<h2>关键数据<\/h2>/);
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
    assert.equal(payload.schemaVersion, 2);
    assert.equal(payload.fund.asOfDate, payload.history.dateTo);
    assert.equal(payload.history.records, payload.history.rows.length);
    assert.ok(payload.history.rows.length >= 1_200);
    assert.ok(payload.history.shareInferenceMaxResidualPctOfBasket < 0.1);
    assert.ok(payload.current.oilBarrelEquivalent > 5_000_000);
    assert.ok(payload.current.netAssets > 500_000_000);
    assert.ok(
      payload.holdings.some(
        (holding) => holding.holdingType === "Futures",
      ),
    );
    const futuresHoldings = payload.holdings.filter(
      (item) => item.holdingType === "Futures",
    );
    for (const holding of futuresHoldings) {
      assert.equal(
        holding.marketValue,
        holding.quantity * 1_000 * holding.price,
      );
      assert.equal(holding.barrelEquivalent, holding.quantity * 1_000);
    }
    const futuresBarrels = futuresHoldings.reduce(
      (sum, holding) => sum + holding.barrelEquivalent,
      0,
    );
    const futuresNotional = futuresHoldings.reduce(
      (sum, holding) => sum + holding.marketValue,
      0,
    );
    const futuresReferencePrice = futuresNotional / futuresBarrels;
    assert.ok(
      Math.abs(
        payload.current.futuresReferencePrice - futuresReferencePrice,
      ) < 0.0001,
    );
    const swapBarrels = payload.holdings
      .filter((holding) => holding.holdingType === "Swap")
      .reduce(
        (sum, holding) =>
          sum + holding.marketValue / futuresReferencePrice,
        0,
      );
    assert.ok(
      Math.abs(payload.current.swapBarrelEquivalent - swapBarrels) < 0.01,
    );
    assert.ok(
      Math.abs(
        payload.current.oilBarrelEquivalent -
          futuresBarrels -
          swapBarrels,
      ) < 0.01,
    );
    assert.ok(
      Math.abs(
        payload.current.barrelsPerShare -
          payload.current.oilBarrelEquivalent /
            payload.current.sharesOutstanding,
      ) < 0.00000001,
    );
    assert.equal(
      payload.current.creationBasketShares,
      symbol === "uso" ? 100_000 : 50_000,
    );
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
        assert.equal(
          row.sharesOutstandingChange,
          row.sharesOutstandingEstimate -
            payload.history.rows[index - 1].sharesOutstandingEstimate,
        );
        assert.ok(
          Math.abs(
            row.barrelEquivalentChange -
              row.sharesOutstandingChange *
                payload.current.barrelsPerShare,
          ) < 0.02,
        );
      }
      assert.equal(
        Math.abs(
          (row.sharesOutstandingEstimate -
            payload.current.sharesOutstanding) %
            payload.current.creationBasketShares,
        ),
        0,
      );
      assert.ok(
        Math.abs(
          row.sharesOutstandingEstimate - row.netAssets / row.nav,
        ) <
          payload.current.creationBasketShares / 2,
      );
      assert.ok(
        Math.abs(
          row.oilBarrelEquivalentEstimate -
            row.sharesOutstandingEstimate *
              payload.current.barrelsPerShare,
        ) < 0.2,
      );
    }

    assert.ok(
      payload.sources.every((source) => source.url.startsWith("https://")),
    );
    assert.match(
      payload.methodology.assetChangeBarrels,
      /剔除油价涨跌/,
    );

    const latest = payload.history.rows.at(-1);
    assert.equal(
      latest.sharesOutstandingEstimate,
      payload.current.sharesOutstanding,
    );
    assert.ok(
      Math.abs(
        latest.oilBarrelEquivalentEstimate -
          payload.current.oilBarrelEquivalent,
      ) < 0.01,
    );
    assert.ok(Number.isFinite(latest.barrelEquivalentChange));
    assert.ok(
      payload.history.rows.some(
        (row) =>
          Math.abs(row.netAssetsChange) > 1_000_000 &&
          row.sharesOutstandingChange === 0 &&
          row.barrelEquivalentChange === 0,
      ),
      `${symbol.toUpperCase()}应能剔除只有资产价格变化、没有申赎的交易日`,
    );
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
  assert.match(script, /creationBasketShares/);
  assert.match(script, /futuresReferencePrice/);
  assert.doesNotMatch(snapshot, /Bearer |var token|eyJhbGciOi/);
  assert.doesNotMatch(bnoSnapshot, /Bearer |var token|eyJhbGciOi/);
});

test("change matrix excludes the first observation outside the selected interval", async () => {
  const component = await readFile(
    new URL("../app/OilEtfReport.tsx", import.meta.url),
    "utf8",
  );

  assert.match(component, /analysisRows\.slice\(1\)\.forEach\(\(row\) =>/);

  for (const symbol of ["uso", "bno"]) {
    const payload = JSON.parse(
      await readFile(
        new URL(`../public/data/${symbol}-snapshot.json`, import.meta.url),
        "utf8",
      ),
    );
    const year = payload.fund.asOfDate.slice(0, 4);
    const rows = payload.history.rows.filter((row) =>
      row.date.startsWith(year),
    );
    const intervalChange =
      rows.at(-1).netAssets - rows[0].netAssets;
    const matrixChange = rows
      .slice(1)
      .reduce((sum, row) => sum + row.netAssetsChange, 0);
    const intervalBarrelChange =
      rows.at(-1).oilBarrelEquivalentEstimate -
      rows[0].oilBarrelEquivalentEstimate;
    const matrixBarrelChange = rows
      .slice(1)
      .reduce((sum, row) => sum + row.barrelEquivalentChange, 0);

    assert.ok(Math.abs(intervalChange - matrixChange) < 0.01);
    assert.ok(
      Math.abs(intervalBarrelChange - matrixBarrelChange) < 0.1,
    );
  }
});
