import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const OFFICIAL_SITE = "https://www.uscfinvestments.com";
const API_ROOT = "https://secure.alpsinc.com/MarketingAPI/api/v1/";
const API_KEY_SCRIPT = `${OFFICIAL_SITE}/site-template/assets/javascript/api_key.php`;
const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const SYMBOLS = ["USO", "BNO"];

function isoDate(value) {
  return String(value).slice(0, 10);
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${label}: local=${actual}, official=${expected}`);
  }
}

function assertClose(actual, expected, tolerance, label) {
  if (
    !Number.isFinite(actual) ||
    !Number.isFinite(expected) ||
    Math.abs(actual - expected) > tolerance
  ) {
    throw new Error(
      `${label}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`,
    );
  }
}

async function getPublicToken() {
  const response = await fetch(API_KEY_SCRIPT);
  assert(response.ok, `USCF token script returned ${response.status}`);
  const body = await response.text();
  const match = body.match(/var token = '([^']+)'/);
  assert(match, "USCF public API token was not found");
  return match[1];
}

async function getJson(path, token) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(response.ok, `${path} returned ${response.status}`);
  return response.json();
}

function holdingKey(row) {
  return [row.holdingType, row.ticker, row.name].join("|");
}

function normalizeOfficialHolding(row) {
  return {
    name: row.name,
    ticker: row.identifiertodisplay || "",
    quantity: round(row.shares, 2),
    price: row.contractprice === null ? null : round(row.contractprice, 4),
    marketValue:
      row.marketvalue === null ? null : round(row.marketvalue, 2),
    weight: row.weight === null ? null : round(row.weight, 6),
    holdingType: row.holdingtype,
  };
}

async function verifySymbol(symbol, token) {
  const localPath = resolve(
    PROJECT_ROOT,
    `public/data/${symbol.toLowerCase()}-snapshot.json`,
  );
  const local = JSON.parse(await readFile(localPath, "utf8"));
  const [dailyPricePayload, holdingsPayload, historyPayload] =
    await Promise.all([
      getJson(`dailyprice/${symbol}`, token),
      getJson(`holding/${symbol}/full`, token),
      getJson(`historicalnav/${symbol}/inception-today`, token),
    ]);

  const daily = dailyPricePayload[0];
  const officialHistory = historyPayload?.[0]?.[symbol];
  assert(daily, `${symbol}: missing official daily price`);
  assert(Array.isArray(officialHistory), `${symbol}: missing official history`);
  assertEqual(local.schemaVersion, 3, `${symbol} schemaVersion`);
  assertEqual(local.fund.symbol, symbol, `${symbol} symbol`);
  assertEqual(
    local.fund.asOfDate,
    isoDate(daily.displaydate),
    `${symbol} current date`,
  );

  const currentChecks = {
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
  };
  for (const [field, expected] of Object.entries(currentChecks)) {
    assertEqual(local.current[field], expected, `${symbol} current.${field}`);
  }

  const officialRowsByDate = new Map(
    officialHistory.map((row) => [isoDate(row.date), row]),
  );
  const fiveYearStart = new Date(`${local.fund.asOfDate}T00:00:00Z`);
  fiveYearStart.setUTCFullYear(fiveYearStart.getUTCFullYear() - 5);
  const expectedOfficialHistory = officialHistory.filter(
    (row) => new Date(row.date) >= fiveYearStart && row.navTotal > 0,
  );
  assertEqual(
    local.history.records,
    local.history.rows.length,
    `${symbol} history count`,
  );
  assertEqual(
    local.history.rows.length,
    expectedOfficialHistory.length,
    `${symbol} five-year official history count`,
  );
  assertEqual(
    new Set(local.history.rows.map((row) => row.date)).size,
    local.history.rows.length,
    `${symbol} unique history dates`,
  );

  for (let index = 0; index < local.history.rows.length; index += 1) {
    const row = local.history.rows[index];
    assertEqual(
      row.date,
      isoDate(expectedOfficialHistory[index].date),
      `${symbol} official history date at row ${index}`,
    );
    const official = officialRowsByDate.get(row.date);
    assert(official, `${symbol} missing official history date ${row.date}`);
    assertEqual(row.nav, round(official.value, 2), `${symbol} ${row.date} NAV`);
    assertEqual(
      row.navChange,
      round(official.change, 2),
      `${symbol} ${row.date} NAV change`,
    );
    assertEqual(
      row.navChangePct,
      round(official.changepercent, 8),
      `${symbol} ${row.date} NAV change pct`,
    );
    assertEqual(
      row.netAssets,
      round(official.navTotal, 2),
      `${symbol} ${row.date} net assets`,
    );
    const prior = local.history.rows[index - 1];
    const expectedAssetChange = prior
      ? round(row.netAssets - prior.netAssets, 2)
      : 0;
    assertEqual(
      row.netAssetsChange,
      expectedAssetChange,
      `${symbol} ${row.date} net assets change`,
    );
    assert(
      Number.isFinite(row.futuresBarrelEquivalentEstimate) &&
        Number.isFinite(row.futuresBarrelEquivalentChange),
      `${symbol} ${row.date} invalid modeled barrel value`,
    );
    assert(
      index === 0 || row.date > local.history.rows[index - 1].date,
      `${symbol} history is not strictly ascending at ${row.date}`,
    );
    assertClose(
      row.sharesOutstandingEstimate,
      row.netAssets / row.nav,
      local.current.creationBasketShares / 2 + 1,
      `${symbol} ${row.date} inferred shares`,
    );
  }

  const officialHoldings = holdingsPayload
    .filter((row) => row.possessionname === "Hold")
    .map(normalizeOfficialHolding)
    .sort((a, b) => holdingKey(a).localeCompare(holdingKey(b)));
  const localHoldings = local.holdings
    .map((row) => ({
      name: row.name,
      ticker: row.ticker,
      quantity: row.quantity,
      price: row.price,
      marketValue: row.marketValue,
      weight: row.weight,
      holdingType: row.holdingType,
    }))
    .sort((a, b) => holdingKey(a).localeCompare(holdingKey(b)));
  assertEqual(
    localHoldings.length,
    officialHoldings.length,
    `${symbol} holdings count`,
  );
  for (let index = 0; index < officialHoldings.length; index += 1) {
    assertEqual(
      JSON.stringify(localHoldings[index]),
      JSON.stringify(officialHoldings[index]),
      `${symbol} holding ${holdingKey(officialHoldings[index])}`,
    );
  }

  const holdingDates = new Set(
    holdingsPayload
      .filter((row) => row.possessionname === "Hold")
      .map((row) => isoDate(row.asofdate)),
  );
  assertEqual(holdingDates.size, 1, `${symbol} holdings date count`);
  assertEqual(
    [...holdingDates][0],
    local.fund.asOfDate,
    `${symbol} holdings versus NAV date`,
  );

  const futures = local.holdings.filter(
    (row) => row.holdingType === "Futures",
  );
  for (const holding of futures) {
    assert(
      Number.isInteger(holding.quantity) && holding.quantity >= 0,
      `${symbol} ${holding.ticker} futures contracts must be non-negative integers`,
    );
    assertEqual(
      holding.barrelEquivalent,
      holding.quantity * 1_000,
      `${symbol} ${holding.ticker} futures barrels`,
    );
    assert(
      Math.abs(
        holding.marketValue -
          holding.quantity * 1_000 * holding.price,
      ) < 0.02,
      `${symbol} ${holding.ticker} futures market value formula`,
    );
  }
  assertEqual(
    local.current.futuresBarrelEquivalent,
    futures.reduce((sum, row) => sum + row.quantity * 1_000, 0),
    `${symbol} current futures barrels`,
  );
  const futuresNotional = futures.reduce(
    (sum, row) => sum + row.marketValue,
    0,
  );
  const futuresReferencePrice =
    futuresNotional / local.current.futuresBarrelEquivalent;
  assertClose(
    local.current.futuresReferencePrice,
    futuresReferencePrice,
    0.0001,
    `${symbol} futures reference price`,
  );
  const swaps = local.holdings.filter((row) => row.holdingType === "Swap");
  const swapBarrels = swaps.reduce(
    (sum, row) => sum + row.marketValue / futuresReferencePrice,
    0,
  );
  assertClose(
    local.current.swapBarrelEquivalent,
    swapBarrels,
    0.01,
    `${symbol} swap barrel estimate`,
  );
  assertClose(
    local.current.oilBarrelEquivalent,
    local.current.futuresBarrelEquivalent +
      local.current.swapBarrelEquivalent,
    0.01,
    `${symbol} total barrel equivalent`,
  );
  const oilPositions = [...futures, ...swaps];
  const oilNotional = oilPositions.reduce(
    (sum, row) => sum + row.marketValue,
    0,
  );
  const oilWeight = oilPositions.reduce(
    (sum, row) => sum + row.weight,
    0,
  );
  assertClose(
    local.current.oilNotional,
    oilNotional,
    0.01,
    `${symbol} oil notional`,
  );
  assertClose(
    local.current.oilExposurePctOfNav,
    oilWeight,
    0.00000001,
    `${symbol} oil exposure rate`,
  );
  assertClose(
    local.current.nav * local.current.sharesOutstanding,
    local.current.netAssets,
    local.current.netAssets * 0.001,
    `${symbol} NAV times shares versus net assets`,
  );
  assertClose(
    local.current.marketPrice,
    round((local.current.bid + local.current.ask) / 2, 2),
    0.01,
    `${symbol} 4pm bid/ask midpoint`,
  );
  assertClose(
    local.current.premiumDiscountPct,
    local.current.marketPrice / local.current.nav - 1,
    0.0002,
    `${symbol} premium/discount`,
  );

  const latestArchive = local.officialHistory.rows.at(-1);
  assertEqual(
    latestArchive.date,
    local.fund.asOfDate,
    `${symbol} latest archive date`,
  );
  assertEqual(
    latestArchive.futuresBarrelEquivalent,
    local.current.futuresBarrelEquivalent,
    `${symbol} latest archive futures barrels`,
  );
  const modelReference = local.officialHistory.rows.find(
    (row) => row.date === local.history.modelReferenceDate,
  );
  assert(modelReference, `${symbol} missing model reference archive`);
  assertClose(
    local.history.modelFuturesBarrelsPerShare,
    modelReference.futuresBarrelEquivalent /
      modelReference.sharesOutstanding,
    0.00000001,
    `${symbol} modeled futures barrels per share`,
  );
  assertEqual(
    JSON.stringify(latestArchive.futuresPositions),
    JSON.stringify(
      futures.map((row) => ({
        name: row.name,
        ticker: row.ticker,
        contracts: row.quantity,
        barrels: row.quantity * 1_000,
      })),
    ),
    `${symbol} latest archived futures positions`,
  );
  assertEqual(
    JSON.stringify(latestArchive.swapPositions),
    JSON.stringify(
      swaps.map((row) => ({
        name: row.name,
        ticker: row.ticker,
        marketValue: row.marketValue,
        barrelEquivalentEstimate: round(row.barrelEquivalent, 2),
      })),
    ),
    `${symbol} latest archived swap positions`,
  );

  return {
    symbol,
    asOfDate: local.fund.asOfDate,
    officialHistoryRowsMatched: local.history.rows.length,
    currentHoldingsRowsMatched: local.holdings.length,
    officialArchiveRows: local.officialHistory.rows.length,
    futuresBarrels: local.current.futuresBarrelEquivalent,
  };
}

async function main() {
  const token = await getPublicToken();
  const reports = [];
  for (const symbol of SYMBOLS) {
    reports.push(await verifySymbol(symbol, token));
  }
  console.log(JSON.stringify({ status: "verified", reports }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
