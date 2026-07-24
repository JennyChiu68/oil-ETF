import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OFFICIAL_SITE = "https://www.uscfinvestments.com";
const API_ROOT = "https://secure.alpsinc.com/MarketingAPI/api/v1/";
const API_KEY_SCRIPT = `${OFFICIAL_SITE}/site-template/assets/javascript/api_key.php`;
const OUTPUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../public/data",
);

const FUNDS = [
  {
    symbol: "USO",
    name: "United States Oil Fund, LP",
    nameZh: "美国原油基金",
    benchmark: "WTI",
    benchmarkZh: "WTI原油",
    contractVenue: "NYMEX",
    secUrl:
      "https://www.sec.gov/Archives/edgar/data/1327068/000110465926021501/uso-20251231x10k.htm",
  },
  {
    symbol: "BNO",
    name: "United States Brent Oil Fund, LP",
    nameZh: "美国布伦特原油基金",
    benchmark: "Brent",
    benchmarkZh: "Brent原油",
    contractVenue: "ICE Futures Europe",
    secUrl:
      "https://www.sec.gov/Archives/edgar/data/1472494/000110465926021521/bno-20251231x10k.htm",
  },
];

function isoDate(value) {
  return String(value).slice(0, 10);
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

async function getPublicToken() {
  const response = await fetch(API_KEY_SCRIPT);
  if (!response.ok) {
    throw new Error(`USCF token script returned ${response.status}`);
  }

  const body = await response.text();
  const match = body.match(/var token = '([^']+)'/);
  if (!match) {
    throw new Error("USCF public API token was not found");
  }
  return match[1];
}

async function getJson(path, token) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json();
}

function holdingCategory(row) {
  if (row.holdingtype === "Futures") return "期货";
  if (row.holdingtype === "Swap") return "掉期";
  if (
    row.holdingtype === "Cash" ||
    row.holdingtype === "Cash Equivalent"
  ) {
    return "现金及等价物";
  }
  if (row.holdingtypeabbrev === "GOVT") return "美国国债";
  return row.holdingtype || "其他";
}

async function buildFundSnapshot(config, token) {
  const symbol = config.symbol;
  const [dailyPricePayload, holdingsPayload, historyPayload] =
    await Promise.all([
      getJson(`dailyprice/${symbol}`, token),
      getJson(`holding/${symbol}/full`, token),
      getJson(`historicalnav/${symbol}/inception-today`, token),
    ]);

  const daily = dailyPricePayload[0];
  const history = historyPayload?.[0]?.[symbol];
  if (!daily || !Array.isArray(holdingsPayload) || !Array.isArray(history)) {
    throw new Error(`USCF ${symbol} API response shape changed`);
  }

  const asOfDate = isoDate(daily.displaydate);
  const fiveYearStart = new Date(`${asOfDate}T00:00:00Z`);
  fiveYearStart.setUTCFullYear(fiveYearStart.getUTCFullYear() - 5);
  const historyRows = history
    .filter((row) => new Date(row.date) >= fiveYearStart && row.navTotal > 0)
    .map((row, index, filtered) => {
      const prior = filtered[index - 1];
      const netAssetsChange = prior ? row.navTotal - prior.navTotal : 0;
      const netAssetsChangePct =
        prior && prior.navTotal
          ? netAssetsChange / prior.navTotal
          : 0;

      return {
        date: isoDate(row.date),
        nav: round(row.value, 2),
        navChange: round(row.change, 2),
        navChangePct: round(row.changepercent, 8),
        netAssets: round(row.navTotal, 2),
        netAssetsChange: round(netAssetsChange, 2),
        netAssetsChangePct: round(netAssetsChangePct, 8),
      };
    });

  const holdings = holdingsPayload
    .filter((row) => row.possessionname === "Hold")
    .map((row) => ({
      category: holdingCategory(row),
      name: row.name,
      ticker: row.identifiertodisplay || "",
      quantity: round(row.shares, 2),
      price: row.contractprice === null ? null : round(row.contractprice, 4),
      marketValue: row.marketvalue === null ? null : round(row.marketvalue, 2),
      weight: row.weight === null ? null : round(row.weight, 6),
      holdingType: row.holdingtype,
    }));

  const oilPositions = holdings.filter(
    (row) => row.holdingType === "Futures" || row.holdingType === "Swap",
  );
  const futuresBarrelEquivalent = oilPositions
    .filter((row) => row.holdingType === "Futures")
    .reduce((sum, row) => sum + row.quantity * 1000, 0);
  const swapBarrelEquivalent = oilPositions
    .filter((row) => row.holdingType === "Swap")
    .reduce((sum, row) => sum + row.quantity, 0);
  const oilNotional = oilPositions.reduce(
    (sum, row) => sum + (row.marketValue || 0),
    0,
  );
  const oilWeight = oilPositions.reduce(
    (sum, row) => sum + (row.weight || 0),
    0,
  );
  const collateralValue = holdings
    .filter(
      (row) =>
        row.category === "现金及等价物" || row.category === "美国国债",
    )
    .reduce((sum, row) => sum + (row.marketValue || 0), 0);

  const snapshot = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    fund: {
      symbol,
      name: config.name,
      nameZh: config.nameZh,
      sponsor: "United States Commodity Funds, LLC",
      exchange: daily.exchange,
      inceptionDate: isoDate(daily.inceptiondate),
      asOfDate,
      benchmark: config.benchmark,
      benchmarkZh: config.benchmarkZh,
      contractVenue: config.contractVenue,
    },
    current: {
      nav: round(daily.nav, 2),
      navChange: round(daily.navchange, 2),
      navChangePct: round(daily.navpercent, 8),
      netAssets: round(daily.navtotal, 2),
      sharesOutstanding: round(daily.so, 0),
      sharesCreatedRedeemed: round(daily.cr, 0),
      marketPrice: round(daily.marketvalue, 2),
      premiumDiscountPct: round(daily.premiumpercent, 8),
      bid: round(daily.bid, 2),
      ask: round(daily.ask, 2),
      oilBarrelEquivalent: round(
        futuresBarrelEquivalent + swapBarrelEquivalent,
        2,
      ),
      futuresBarrelEquivalent: round(futuresBarrelEquivalent, 2),
      swapBarrelEquivalent: round(swapBarrelEquivalent, 2),
      oilNotional: round(oilNotional, 2),
      oilExposurePctOfNav: round(oilWeight, 8),
      collateralValue: round(collateralValue, 2),
      barrelEquivalentType:
        swapBarrelEquivalent > 0 ? "estimated" : "contractual",
    },
    holdings,
    history: {
      dateFrom: historyRows[0]?.date,
      dateTo: historyRows.at(-1)?.date,
      records: historyRows.length,
      rows: historyRows,
    },
    methodology: {
      headline:
        swapBarrelEquivalent > 0
          ? `名义桶等值 = ${config.benchmark}期货合约数量×1,000桶/手 + 掉期披露数量的标准化估算。期货部分为合约规格直接换算，掉期部分为估算；均不代表实物库存。`
          : `名义桶等值 = ${config.benchmark}期货合约数量×1,000桶/手。当前持仓不含掉期，桶数可按交易所标准合约规格精确换算，但不代表基金持有实物原油。`,
      netAssets:
        "历史总资产净值（Net Assets）和单位净值（NAV）均来自USCF官方历史净值接口；总资产变化包含市场价格变动、申赎及费用影响，不等同于净资金流。",
      assetChangeBarrels:
        "历史资产变化的桶等值 = 当期美元变化×当前名义桶等值÷当前总净资产。该指标只做单位换算，方便与美元切换比较，不代表历史逐日真实合约增减。",
      dataMode:
        "本文件是一次性冻结快照，不会在页面端轮询。运行 npm run data:refresh 可人工生成新快照。",
    },
    sources: [
      {
        label: `USCF ${symbol} 官方持仓`,
        url: `https://www.uscfinvestments.com/holdings/${symbol.toLowerCase()}`,
        covers: "当前期货、掉期、现金及等价物持仓",
      },
      {
        label: `USCF ${symbol} 官方产品页`,
        url: `https://www.uscfinvestments.com/${symbol.toLowerCase()}`,
        covers: "历史NAV、总资产净值、最新净值及申赎",
      },
      {
        label: `${symbol} 2025年Form 10-K（SEC）`,
        url: config.secUrl,
        covers: "基金目标、基准合约及期货型产品风险口径",
      },
    ],
  };

  const outputFile = resolve(OUTPUT_DIR, `${symbol.toLowerCase()}-snapshot.json`);
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(snapshot, null, 2)}\n`);

  console.log(
    `Wrote ${outputFile} (${historyRows.length} rows, as of ${asOfDate})`,
  );

  return snapshot;
}

async function main() {
  const token = await getPublicToken();
  for (const fund of FUNDS) {
    await buildFundSnapshot(fund, token);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
