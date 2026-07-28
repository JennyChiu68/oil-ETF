import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
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
    creationBasketShares: 100_000,
    contractSpecUrl:
      "https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.contractSpecs.html",
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
    creationBasketShares: 50_000,
    contractSpecUrl:
      "https://www.ice.com/products/219/Brent-Crude-Futures",
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

async function readPreviousSnapshot(outputFile) {
  try {
    return JSON.parse(await readFile(outputFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function mergeHistoryWithOfficialArchive({
  freshModelRows,
  modelFrozenThrough,
  preservedRows = [],
  officialRows = [],
}) {
  const officialByDate = new Map(
    officialRows.map((row) => [row.date, row]),
  );
  const preservedRowsByDate = new Map(
    preservedRows.map((row) => [row.date, row]),
  );

  function mergePreservedModel(row, index) {
    const preserved = preservedRowsByDate.get(row.date);
    if (!preserved) return row;

    return {
      ...row,
      sharesOutstandingEstimate: preserved.sharesOutstandingEstimate,
      sharesOutstandingChange:
        index === 0 ? 0 : preserved.sharesOutstandingChange,
      futuresBarrelEquivalentEstimate:
        preserved.futuresBarrelEquivalentEstimate,
      futuresBarrelEquivalentChange:
        index === 0 ? 0 : preserved.futuresBarrelEquivalentChange,
      changeBasis: preserved.changeBasis,
    };
  }

  return freshModelRows.map((row, index, rows) => {
    if (row.date <= modelFrozenThrough) {
      return mergePreservedModel(row, index);
    }

    const observation = officialByDate.get(row.date);
    if (!observation) {
      return mergePreservedModel(row, index);
    }

    const previousDate = rows[index - 1]?.date;
    const previousObservation = previousDate
      ? officialByDate.get(previousDate)
      : null;
    const previousRow = rows[index - 1];
    const sharesOutstandingChange = previousObservation
      ? observation.sharesOutstanding -
        previousObservation.sharesOutstanding
      : previousRow
        ? observation.sharesOutstanding -
          previousRow.sharesOutstandingEstimate
        : 0;
    const preservedChange = preservedRowsByDate.get(
      row.date,
    )?.futuresBarrelEquivalentChange;
    return {
      ...row,
      sharesOutstandingEstimate: observation.sharesOutstanding,
      sharesOutstandingChange,
      futuresBarrelEquivalentEstimate:
        observation.futuresBarrelEquivalent,
      futuresBarrelEquivalentChange: previousObservation
        ? round(
            observation.futuresBarrelEquivalent -
              previousObservation.futuresBarrelEquivalent,
            2,
          )
        : (preservedChange ?? row.futuresBarrelEquivalentChange),
      changeBasis: previousObservation ? "official" : "estimated-gap",
    };
  });
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
  const outputFile = resolve(OUTPUT_DIR, `${symbol.toLowerCase()}-snapshot.json`);
  const previousSnapshot = await readPreviousSnapshot(outputFile);
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
  if (
    previousSnapshot?.fund?.asOfDate &&
    asOfDate < previousSnapshot.fund.asOfDate
  ) {
    throw new Error(
      `USCF ${symbol} date ${asOfDate} is older than the published snapshot ${previousSnapshot.fund.asOfDate}`,
    );
  }
  const holdingAsOfDates = Array.from(
    new Set(
      holdingsPayload
        .filter((row) => row.possessionname === "Hold" && row.asofdate)
        .map((row) => isoDate(row.asofdate)),
    ),
  );
  if (
    holdingAsOfDates.length !== 1 ||
    holdingAsOfDates[0] !== asOfDate
  ) {
    throw new Error(
      `USCF ${symbol} holdings date ${holdingAsOfDates.join(",") || "missing"} does not match NAV date ${asOfDate}`,
    );
  }

  const fiveYearStart = new Date(`${asOfDate}T00:00:00Z`);
  fiveYearStart.setUTCFullYear(fiveYearStart.getUTCFullYear() - 5);
  const filteredHistory = history
    .filter((row) => new Date(row.date) >= fiveYearStart && row.navTotal > 0)
    .map((row) => ({
      ...row,
      normalizedDate: isoDate(row.date),
    }));
  const historyDates = filteredHistory.map((row) => row.normalizedDate);
  if (
    historyDates.length === 0 ||
    new Set(historyDates).size !== historyDates.length ||
    historyDates.some(
      (date, index) => index > 0 && date <= historyDates[index - 1],
    ) ||
    historyDates.at(-1) !== asOfDate
  ) {
    throw new Error(
      `USCF ${symbol} historical NAV dates are missing, duplicated, unsorted, or do not end on ${asOfDate}`,
    );
  }
  const baseHistoryRows = filteredHistory.map(
    (row, index, filtered) => {
      const prior = filtered[index - 1];
      const netAssetsChange = prior ? row.navTotal - prior.navTotal : 0;
      const netAssetsChangePct =
        prior && prior.navTotal
          ? netAssetsChange / prior.navTotal
          : 0;

      return {
        date: row.normalizedDate,
        nav: round(row.value, 2),
        navChange: round(row.change, 2),
        navChangePct: round(row.changepercent, 8),
        netAssets: round(row.navTotal, 2),
        netAssetsChange: round(netAssetsChange, 2),
        netAssetsChangePct: round(netAssetsChangePct, 8),
      };
    },
  );

  const rawHoldings = holdingsPayload
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

  const futuresPositions = rawHoldings.filter(
    (row) => row.holdingType === "Futures",
  );
  const futuresBarrelEquivalent = futuresPositions
    .reduce((sum, row) => sum + row.quantity * 1000, 0);
  const futuresNotional = futuresPositions.reduce(
    (sum, row) => sum + (row.marketValue || 0),
    0,
  );
  const futuresReferencePrice =
    futuresBarrelEquivalent > 0
      ? futuresNotional / futuresBarrelEquivalent
      : null;
  const holdings = rawHoldings.map((row) => ({
    ...row,
    barrelEquivalent:
      row.holdingType === "Futures"
        ? row.quantity * 1000
        : row.holdingType === "Swap" &&
            futuresReferencePrice &&
            row.marketValue !== null
          ? row.marketValue / futuresReferencePrice
          : null,
  }));
  const oilPositions = holdings.filter(
    (row) => row.holdingType === "Futures" || row.holdingType === "Swap",
  );
  const swapBarrelEquivalent = oilPositions
    .filter((row) => row.holdingType === "Swap")
    .reduce((sum, row) => sum + (row.barrelEquivalent || 0), 0);
  const oilBarrelEquivalent =
    futuresBarrelEquivalent + swapBarrelEquivalent;
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
  const sharesOutstanding = round(daily.so, 0);
  const barrelsPerShare =
    sharesOutstanding > 0 ? oilBarrelEquivalent / sharesOutstanding : 0;
  const futuresBarrelsPerShare =
    sharesOutstanding > 0
      ? futuresBarrelEquivalent / sharesOutstanding
      : 0;
  const hasFrozenModel = previousSnapshot?.schemaVersion >= 3;
  const modelFrozenThrough = hasFrozenModel
    ? previousSnapshot.history.modelFrozenThrough
    : asOfDate;
  const modelReferenceDate = hasFrozenModel
    ? modelFrozenThrough
    : (previousSnapshot?.fund?.asOfDate ?? asOfDate);
  const archivedModelReference =
    previousSnapshot?.officialHistory?.rows?.find(
      (row) => row.date === modelReferenceDate,
    );
  const modelFuturesBarrelsPerShare = archivedModelReference
    ? archivedModelReference.futuresBarrelEquivalent /
      archivedModelReference.sharesOutstanding
    : hasFrozenModel
      ? previousSnapshot.history.modelFuturesBarrelsPerShare
      : (previousSnapshot?.current?.futuresBarrelsPerShare ??
        futuresBarrelsPerShare);
  let priorSharesOutstandingEstimate = null;
  const freshModelRows = baseHistoryRows.map((row) => {
    const rawSharesOutstanding = row.netAssets / row.nav;
    const sharesOutstandingEstimate =
      sharesOutstanding +
      Math.round(
        (rawSharesOutstanding - sharesOutstanding) /
          config.creationBasketShares,
      ) *
        config.creationBasketShares;
    const sharesOutstandingChange =
      priorSharesOutstandingEstimate === null
        ? 0
        : sharesOutstandingEstimate - priorSharesOutstandingEstimate;
    priorSharesOutstandingEstimate = sharesOutstandingEstimate;

    return {
      ...row,
      sharesOutstandingEstimate: round(sharesOutstandingEstimate, 0),
      sharesOutstandingChange: round(sharesOutstandingChange, 0),
      futuresBarrelEquivalentEstimate: round(
        sharesOutstandingEstimate * modelFuturesBarrelsPerShare,
        2,
      ),
      futuresBarrelEquivalentChange: round(
        sharesOutstandingChange * modelFuturesBarrelsPerShare,
        2,
      ),
      changeBasis: "estimated",
    };
  });

  const generatedAtUtc = new Date().toISOString();
  const officialObservation = {
    date: asOfDate,
    fetchedAtUtc: generatedAtUtc,
    source: "USCF official holdings",
    sharesOutstanding,
    futuresBarrelEquivalent: round(futuresBarrelEquivalent, 2),
    swapBarrelEquivalentEstimate: round(swapBarrelEquivalent, 2),
    oilBarrelEquivalent: round(oilBarrelEquivalent, 2),
    barrelEquivalentType:
      swapBarrelEquivalent > 0 ? "official-futures-plus-estimated-swap" : "official-futures",
    futuresPositions: futuresPositions.map((row) => ({
      name: row.name,
      ticker: row.ticker,
      contracts: row.quantity,
      barrels: round(row.quantity * 1000, 2),
    })),
    swapPositions: holdings
      .filter((row) => row.holdingType === "Swap")
      .map((row) => ({
        name: row.name,
        ticker: row.ticker,
        marketValue: row.marketValue,
        barrelEquivalentEstimate: round(row.barrelEquivalent || 0, 2),
      })),
  };
  const officialRowsByDate = new Map(
    (previousSnapshot?.officialHistory?.rows ?? []).map((row) => [
      row.date,
      row,
    ]),
  );
  officialRowsByDate.set(asOfDate, officialObservation);
  const officialRows = Array.from(officialRowsByDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const historyRows = mergeHistoryWithOfficialArchive({
    freshModelRows,
    modelFrozenThrough,
    preservedRows:
      previousSnapshot?.schemaVersion >= 3
        ? previousSnapshot.history.rows
        : [],
    officialRows,
  });
  const shareInferenceMaxResidual = Math.max(
    ...historyRows.map((row) =>
      Math.abs(row.sharesOutstandingEstimate - row.netAssets / row.nav),
    ),
    0,
  );

  const snapshot = {
    schemaVersion: 3,
    generatedAtUtc,
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
      sharesOutstanding,
      sharesCreatedRedeemed: round(daily.cr, 0),
      marketPrice: round(daily.marketvalue, 2),
      premiumDiscountPct: round(daily.premiumpercent, 8),
      bid: round(daily.bid, 2),
      ask: round(daily.ask, 2),
      oilBarrelEquivalent: round(oilBarrelEquivalent, 2),
      futuresBarrelEquivalent: round(futuresBarrelEquivalent, 2),
      swapBarrelEquivalent: round(swapBarrelEquivalent, 2),
      futuresReferencePrice:
        futuresReferencePrice === null
          ? null
          : round(futuresReferencePrice, 4),
      barrelsPerShare: round(barrelsPerShare, 8),
      futuresBarrelsPerShare: round(futuresBarrelsPerShare, 8),
      creationBasketShares: config.creationBasketShares,
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
      modelFrozenThrough,
      modelReferenceDate,
      modelFuturesBarrelsPerShare: round(
        modelFuturesBarrelsPerShare,
        8,
      ),
      officialArchiveStarts: officialRows[0]?.date,
      officialDailyChanges: historyRows.filter(
        (row) => row.changeBasis === "official",
      ).length,
      shareInferenceMaxResidual: round(shareInferenceMaxResidual, 2),
      shareInferenceMaxResidualPctOfBasket: round(
        shareInferenceMaxResidual / config.creationBasketShares,
        8,
      ),
      rows: historyRows,
    },
    officialHistory: {
      dateFrom: officialRows[0]?.date,
      dateTo: officialRows.at(-1)?.date,
      records: officialRows.length,
      rows: officialRows,
    },
    methodology: {
      headline:
        swapBarrelEquivalent > 0
          ? `当前名义桶等值 = ${config.benchmark}期货合约数量×1,000桶/手 + 掉期名义市值÷同日基金期货持仓的桶数加权结算价。期货部分为合约规格直接换算，掉期部分为价格折算；均不代表实物库存。`
          : `名义桶等值 = ${config.benchmark}期货合约数量×1,000桶/手。当前持仓不含掉期，桶数可按交易所标准合约规格精确换算，但不代表基金持有实物原油。`,
      netAssets:
        "历史总资产净值（Net Assets）和单位净值（NAV）均来自USCF官方历史净值接口；总资产变化包含市场价格变动、申赎及费用影响，不等同于净资金流。",
      assetChangeBarrels:
        `历史期货持仓变化采用模型估算：先用每日总净资产÷NAV反推流通份额，再以${modelFrozenThrough}官方流通份额为锚，按${symbol}每篮子${config.creationBasketShares.toLocaleString("en-US")}份的官方最小申赎单位取整；每日份额变化×最近一个已保存官方快照（${modelReferenceDate}）的每份期货桶数。该方法剔除油价涨跌造成的资产变化，但不包含展期或主动调仓。`,
      officialArchive:
        `自${officialRows[0]?.date}起保存USCF官方每日合约级持仓。形成相邻两个交易日的官方快照后，期货桶数变化直接按“当日各期货合约手数×1,000桶－上一交易日各期货合约手数×1,000桶”计算；漏抓日期不会把跨日差额冒充为单日变化。USO掉期继续单独作为名义桶当量估算，不计入官方期货桶数变化。`,
      dataMode:
        "页面端不会轮询。运行 npm run data:refresh 会保留既有官方归档、追加当日USCF官方持仓，并冻结已发布的历史估算。",
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
        covers: `基金目标、申赎机制及每篮子${config.creationBasketShares.toLocaleString("en-US")}份的官方单位`,
      },
      {
        label: `${config.contractVenue} ${config.benchmark}期货合约规格`,
        url: config.contractSpecUrl,
        covers: "每手期货对应1,000桶的交易所标准合约规格",
      },
    ],
  };

  return { outputFile, previousSnapshot, snapshot };
}

function stableSnapshotJson(snapshot) {
  if (!snapshot) return "";
  const comparable = structuredClone(snapshot);
  comparable.generatedAtUtc = "";
  for (const row of comparable.officialHistory?.rows ?? []) {
    row.fetchedAtUtc = "";
  }
  return JSON.stringify(comparable);
}

async function writeSnapshots(results) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const staged = [];
  try {
    for (const { outputFile, snapshot } of results) {
      const temporaryFile = `${outputFile}.${process.pid}.${Date.now()}.tmp`;
      const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
      await writeFile(temporaryFile, serialized, {
        encoding: "utf8",
        flag: "wx",
      });
      JSON.parse(await readFile(temporaryFile, "utf8"));
      staged.push({ outputFile, temporaryFile, snapshot });
    }
    for (const { outputFile, temporaryFile } of staged) {
      await rename(temporaryFile, outputFile);
    }
  } catch (error) {
    await Promise.all(
      staged.map(({ temporaryFile }) =>
        unlink(temporaryFile).catch(() => undefined),
      ),
    );
    throw error;
  }

  for (const { outputFile, snapshot } of staged) {
    console.log(
      `Wrote ${outputFile} (${snapshot.history.records} rows, as of ${snapshot.fund.asOfDate})`,
    );
  }
}

async function main() {
  const token = await getPublicToken();
  const results = await Promise.all(
    FUNDS.map((fund) => buildFundSnapshot(fund, token)),
  );
  const asOfDates = new Set(
    results.map(({ snapshot }) => snapshot.fund.asOfDate),
  );
  if (asOfDates.size !== 1) {
    throw new Error(
      `USCF USO/BNO dates do not match: ${[...asOfDates].join(", ")}`,
    );
  }
  const hasMeaningfulChange = results.some(
    ({ previousSnapshot, snapshot }) =>
      stableSnapshotJson(previousSnapshot) !== stableSnapshotJson(snapshot),
  );
  if (!hasMeaningfulChange) {
    console.log(
      `No new USCF data for ${results[0].snapshot.fund.asOfDate}; snapshots unchanged`,
    );
    return;
  }
  await writeSnapshots(results);
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
