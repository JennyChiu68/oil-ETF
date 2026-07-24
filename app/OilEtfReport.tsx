"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type HistoryRow = {
  date: string;
  nav: number;
  navChange: number;
  navChangePct: number;
  netAssets: number;
  netAssetsChange: number;
  netAssetsChangePct: number;
};

type Holding = {
  category: string;
  name: string;
  ticker: string;
  quantity: number;
  price: number | null;
  marketValue: number | null;
  weight: number | null;
  holdingType: string;
};

type Snapshot = {
  generatedAtUtc: string;
  fund: {
    symbol: string;
    name: string;
    nameZh: string;
    sponsor: string;
    exchange: string;
    inceptionDate: string;
    asOfDate: string;
    benchmark: string;
    benchmarkZh: string;
    contractVenue: string;
  };
  current: {
    nav: number;
    navChange: number;
    navChangePct: number;
    netAssets: number;
    sharesOutstanding: number;
    sharesCreatedRedeemed: number;
    marketPrice: number;
    premiumDiscountPct: number;
    bid: number;
    ask: number;
    oilBarrelEquivalent: number;
    futuresBarrelEquivalent: number;
    swapBarrelEquivalent: number;
    oilNotional: number;
    oilExposurePctOfNav: number;
    collateralValue: number;
    barrelEquivalentType: string;
  };
  holdings: Holding[];
  history: {
    dateFrom: string;
    dateTo: string;
    records: number;
    rows: HistoryRow[];
  };
  methodology: {
    headline: string;
    netAssets: string;
    assetChangeBarrels: string;
    dataMode: string;
  };
  sources: Array<{
    label: string;
    url: string;
    covers: string;
  }>;
};

type FundSymbol = "USO" | "BNO";
type ChartMetric = "nav" | "netAssets";
type ChartRange = "1m" | "1y" | "3y" | "5y";
type AnalysisPeriod = "month" | "year" | "5y" | "custom";
type AnalysisUnit = "barrels" | "amount";
type MatrixMode = "month" | "week" | "year";

const RANGE_LABELS: Record<ChartRange, string> = {
  "1m": "1个月",
  "1y": "1年",
  "3y": "3年",
  "5y": "5年",
};

const PERIOD_LABELS: Record<AnalysisPeriod, string> = {
  month: "本月",
  year: "本年",
  "5y": "近5年",
  custom: "自定义",
};

function addYears(dateString: string, years: number) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateString: string, months: number) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function formatDateCn(date: string, withYear = true) {
  const [year, month, day] = date.split("-");
  return withYear
    ? `${year}年${Number(month)}月${Number(day)}日`
    : `${Number(month)}月${Number(day)}日`;
}

function formatNumber(value: number, digits = 2) {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatSigned(value: number, digits = 2, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}${suffix}`;
}

function formatUsd(value: number) {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatHundredMillion(value: number, digits = 2) {
  return `${formatNumber(value / 100_000_000, digits)}亿美元`;
}

function formatQuantity(value: number, type: string) {
  if (type === "Futures") return `${formatNumber(value, 0)} 手`;
  if (type === "Swap") return `${formatNumber(value / 10_000, 2)} 万桶等值`;
  return formatUsd(value);
}

function metricValue(row: HistoryRow, metric: ChartMetric) {
  return metric === "nav" ? row.nav : row.netAssets / 100_000_000;
}

function chartStartDate(latest: string, range: ChartRange) {
  if (range === "1m") return addMonths(latest, -1);
  if (range === "1y") return addYears(latest, -1);
  if (range === "3y") return addYears(latest, -3);
  return addYears(latest, -5);
}

function isoWeek(dateString: string) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
}

function HistoryCanvas({
  rows,
  metric,
}: {
  rows: HistoryRow[];
  metric: ChartMetric;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows.length < 2) return;

    const draw = () => {
      const width = Math.max(canvas.clientWidth, 280);
      const height = 214;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);

      const values = rows.map((row) => metricValue(row, metric));
      const rawMin = Math.min(...values);
      const rawMax = Math.max(...values);
      const valuePadding = Math.max((rawMax - rawMin) * 0.12, rawMax * 0.01);
      const min = rawMin - valuePadding;
      const max = rawMax + valuePadding;
      const plot = { left: 10, right: width - 10, top: 16, bottom: 172 };
      const xAt = (index: number) =>
        plot.left +
        (index / Math.max(rows.length - 1, 1)) * (plot.right - plot.left);
      const yAt = (value: number) =>
        plot.bottom -
        ((value - min) / Math.max(max - min, 1)) *
          (plot.bottom - plot.top);

      context.clearRect(0, 0, width, height);
      context.strokeStyle = "rgba(34, 42, 35, 0.09)";
      context.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) {
        const y = plot.top + (i * (plot.bottom - plot.top)) / 3;
        context.beginPath();
        context.moveTo(plot.left, y);
        context.lineTo(plot.right, y);
        context.stroke();
      }

      const lineColor = metric === "nav" ? "#d78b2d" : "#313e35";
      const fill = context.createLinearGradient(0, plot.top, 0, plot.bottom);
      fill.addColorStop(
        0,
        metric === "nav"
          ? "rgba(215, 139, 45, 0.28)"
          : "rgba(49, 62, 53, 0.22)",
      );
      fill.addColorStop(1, "rgba(255, 255, 255, 0)");

      context.beginPath();
      values.forEach((value, index) => {
        const x = xAt(index);
        const y = yAt(value);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.lineTo(plot.right, plot.bottom);
      context.lineTo(plot.left, plot.bottom);
      context.closePath();
      context.fillStyle = fill;
      context.fill();

      context.beginPath();
      values.forEach((value, index) => {
        const x = xAt(index);
        const y = yAt(value);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = lineColor;
      context.lineWidth = 2.25;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();

      const latestX = xAt(values.length - 1);
      const latestY = yAt(values[values.length - 1]);
      context.beginPath();
      context.arc(latestX, latestY, 4.5, 0, Math.PI * 2);
      context.fillStyle = "#ffffff";
      context.fill();
      context.strokeStyle = lineColor;
      context.lineWidth = 2.5;
      context.stroke();

      context.fillStyle = "#7b807b";
      context.font =
        '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      context.textBaseline = "top";
      context.textAlign = "left";
      context.fillText(rows[0].date.slice(2), plot.left, 188);
      context.textAlign = "center";
      const middle = Math.floor((rows.length - 1) / 2);
      context.fillText(rows[middle].date.slice(2), xAt(middle), 188);
      context.textAlign = "right";
      context.fillText(rows.at(-1)?.date.slice(2) ?? "", plot.right, 188);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [metric, rows]);

  const values = rows.map((row) => metricValue(row, metric));
  const latest = values.at(-1) ?? 0;
  const first = values[0] ?? 0;
  const change = first ? latest / first - 1 : 0;

  return (
    <div className="history-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="history-canvas"
        aria-label={`${metric === "nav" ? "单位净值" : "总资产净值"}趋势，区间变化${formatSigned(change * 100, 2, "%")}`}
        role="img"
      />
      <div className="chart-foot">
        <span>{rows.length}个交易日</span>
        <strong className={change >= 0 ? "up" : "down"}>
          区间 {formatSigned(change * 100, 2, "%")}
        </strong>
      </div>
    </div>
  );
}

export function OilEtfReport({
  snapshots,
}: {
  snapshots: Record<FundSymbol, Snapshot>;
}) {
  const [activeSymbol, setActiveSymbol] = useState<FundSymbol>("USO");

  return (
    <OilEtfFundReport
      key={activeSymbol}
      snapshot={snapshots[activeSymbol]}
      activeSymbol={activeSymbol}
      onSymbolChange={setActiveSymbol}
    />
  );
}

function OilEtfFundReport({
  snapshot,
  activeSymbol,
  onSymbolChange,
}: {
  snapshot: Snapshot;
  activeSymbol: FundSymbol;
  onSymbolChange: (symbol: FundSymbol) => void;
}) {
  const latestDate = snapshot.history.dateTo;
  const [chartRange, setChartRange] = useState<ChartRange>("1y");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("netAssets");
  const [holdingView, setHoldingView] = useState<"structure" | "table">(
    "structure",
  );
  const [analysisPeriod, setAnalysisPeriod] =
    useState<AnalysisPeriod>("year");
  const [analysisUnit, setAnalysisUnit] = useState<AnalysisUnit>("barrels");
  const [matrixMode, setMatrixMode] = useState<MatrixMode>("month");
  const [customStart, setCustomStart] = useState(snapshot.history.dateFrom);
  const [customEnd, setCustomEnd] = useState(snapshot.history.dateTo);
  const [appliedCustom, setAppliedCustom] = useState({
    start: snapshot.history.dateFrom,
    end: snapshot.history.dateTo,
  });
  const [visibleDays, setVisibleDays] = useState(12);
  const barrelEquivalentPerUsd =
    snapshot.current.oilBarrelEquivalent / snapshot.current.netAssets;

  const chartRows = useMemo(() => {
    const start = chartStartDate(latestDate, chartRange);
    return snapshot.history.rows.filter((row) => row.date >= start);
  }, [chartRange, latestDate, snapshot.history.rows]);

  const analysisRows = useMemo(() => {
    let start = snapshot.history.dateFrom;
    let end = snapshot.history.dateTo;
    if (analysisPeriod === "month") {
      start = `${latestDate.slice(0, 7)}-01`;
    } else if (analysisPeriod === "year") {
      start = `${latestDate.slice(0, 4)}-01-01`;
    } else if (analysisPeriod === "custom") {
      start = appliedCustom.start;
      end = appliedCustom.end;
    }
    return snapshot.history.rows.filter(
      (row) => row.date >= start && row.date <= end,
    );
  }, [
    analysisPeriod,
    appliedCustom.end,
    appliedCustom.start,
    latestDate,
    snapshot.history.dateFrom,
    snapshot.history.dateTo,
    snapshot.history.rows,
  ]);

  const analysisStats = useMemo(() => {
    if (analysisRows.length < 2) {
      return { net: 0, up: 0, down: 0, biggestUp: null, biggestDown: null };
    }
    const daily = analysisRows.slice(1).map((row) => ({
      row,
      value:
        analysisUnit === "barrels"
          ? (row.netAssetsChange * barrelEquivalentPerUsd) / 10_000
          : row.netAssetsChange / 100_000_000,
    }));
    const first = analysisRows[0];
    const last = analysisRows.at(-1) ?? first;
    const net =
      analysisUnit === "barrels"
        ? ((last.netAssets - first.netAssets) * barrelEquivalentPerUsd) /
          10_000
        : (last.netAssets - first.netAssets) / 100_000_000;
    const up = daily
      .filter((item) => item.value > 0)
      .reduce((sum, item) => sum + item.value, 0);
    const down = daily
      .filter((item) => item.value < 0)
      .reduce((sum, item) => sum + Math.abs(item.value), 0);
    const sorted = [...daily].sort((a, b) => a.value - b.value);
    return {
      net,
      up,
      down,
      biggestDown: sorted[0] ?? null,
      biggestUp: sorted.at(-1) ?? null,
    };
  }, [
    analysisRows,
    analysisUnit,
    barrelEquivalentPerUsd,
  ]);

  const matrixYears = useMemo(
    () =>
      Array.from(
        new Set(analysisRows.map((row) => Number(row.date.slice(0, 4)))),
      ).sort((a, b) => b - a),
    [analysisRows],
  );
  const [matrixYear, setMatrixYear] = useState(Number(latestDate.slice(0, 4)));
  const activeMatrixYear = matrixYears.includes(matrixYear)
    ? matrixYear
    : (matrixYears[0] ?? Number(latestDate.slice(0, 4)));

  const matrixItems = useMemo(() => {
    const grouped = new Map<
      string,
      { label: string; rows: HistoryRow[]; order: number }
    >();
    analysisRows.forEach((row) => {
      const year = Number(row.date.slice(0, 4));
      if (matrixMode !== "year" && year !== activeMatrixYear) return;
      let key = String(year);
      let label = `${year}`;
      let order = year;
      if (matrixMode === "month") {
        const month = Number(row.date.slice(5, 7));
        key = `${year}-${String(month).padStart(2, "0")}`;
        label = `${month}月`;
        order = month;
      } else if (matrixMode === "week") {
        const week = isoWeek(row.date);
        key = `${year}-W${String(week).padStart(2, "0")}`;
        label = `W${week}`;
        order = week;
      }
      const current = grouped.get(key) ?? { label, rows: [], order };
      current.rows.push(row);
      grouped.set(key, current);
    });

    const entries = Array.from(grouped.entries())
      .map(([key, group]) => {
        const value =
          analysisUnit === "barrels"
            ? group.rows.reduce(
                (sum, row) =>
                  sum +
                  (row.netAssetsChange * barrelEquivalentPerUsd) / 10_000,
                0,
              )
            : group.rows.reduce(
                (sum, row) => sum + row.netAssetsChange / 100_000_000,
                0,
              );
        return { key, label: group.label, order: group.order, value };
      })
      .sort((a, b) => a.order - b.order);

    if (matrixMode === "month") {
      return Array.from({ length: 12 }, (_, index) => {
        const found = entries.find((item) => item.order === index + 1);
        return (
          found ?? {
            key: `${activeMatrixYear}-${index + 1}`,
            label: `${index + 1}月`,
            order: index + 1,
            value: null,
          }
        );
      });
    }
    if (matrixMode === "week") {
      const maxWeek = Math.max(...entries.map((item) => item.order), 0);
      return Array.from({ length: maxWeek }, (_, index) => {
        const found = entries.find((item) => item.order === index + 1);
        return (
          found ?? {
            key: `${activeMatrixYear}-W${index + 1}`,
            label: `W${index + 1}`,
            order: index + 1,
            value: null,
          }
        );
      });
    }
    return entries;
  }, [
    activeMatrixYear,
    analysisRows,
    analysisUnit,
    barrelEquivalentPerUsd,
    matrixMode,
  ]);

  const matrixMax = Math.max(
    ...matrixItems.map((item) =>
      item.value === null ? 0 : Math.abs(item.value),
    ),
    0.0001,
  );

  const dailyRows = useMemo(
    () =>
      [...analysisRows]
        .slice(1)
        .reverse()
        .map((row) => ({
          row,
          value:
            analysisUnit === "barrels"
              ? (row.netAssetsChange * barrelEquivalentPerUsd) / 10_000
              : row.netAssetsChange / 100_000_000,
        })),
    [
      analysisRows,
      analysisUnit,
      barrelEquivalentPerUsd,
    ],
  );
  const dailyMax = Math.max(
    ...dailyRows.map((item) => Math.abs(item.value)),
    0.0001,
  );

  const applyCustomRange = (event: FormEvent) => {
    event.preventDefault();
    if (
      customStart >= snapshot.history.dateFrom &&
      customEnd <= snapshot.history.dateTo &&
      customStart <= customEnd
    ) {
      setAppliedCustom({ start: customStart, end: customEnd });
      setAnalysisPeriod("custom");
      setVisibleDays(12);
    }
  };

  const analysisSuffix =
    analysisUnit === "barrels" ? "万桶等值" : "亿美元";

  return (
    <main className="report-shell">
      <div className="report-phone">
        <header className="topbar">
          <a href="#top" className="topbar-home" aria-label="回到报告顶部">
            <span />
          </a>
          <strong>原油ETF持仓报告</strong>
          <span className="topbar-live">冻结版</span>
        </header>

        <nav className="fund-switch" aria-label="原油ETF品种切换">
          {(["USO", "BNO"] as FundSymbol[]).map((symbol) => {
            const isActive = activeSymbol === symbol;
            const label = symbol === "USO" ? "WTI" : "Brent";
            return (
              <button
                type="button"
                key={symbol}
                className={isActive ? "active" : ""}
                aria-pressed={isActive}
                onClick={() => onSymbolChange(symbol)}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <section
          className={`hero-card ${activeSymbol === "BNO" ? "brent" : "wti"}`}
          id="top"
        >
          <div className="hero-glow" aria-hidden="true" />
          <div className="hero-heading">
            <div>
              <p className="eyebrow">
                {snapshot.fund.symbol} · {snapshot.fund.benchmark.toUpperCase()} OIL
                EXPOSURE
              </p>
              <h1>原油ETF持仓报告</h1>
              <p className="source-line">
                公布机构：{snapshot.fund.name}（USCF）
              </p>
            </div>
            <div className="oil-mark" aria-hidden="true">
              <span />
            </div>
          </div>

          <div className="headline-label">
            当前名义原油敞口
            {snapshot.current.barrelEquivalentType === "estimated"
              ? " · 含掉期估算"
              : " · 合约规格换算"}
          </div>
          <div className="headline-value">
            <strong>
              {formatNumber(
                snapshot.current.oilBarrelEquivalent / 10_000,
                2,
              )}
            </strong>
            <span>万桶等值</span>
          </div>
          <div className="hero-meta">
            <span>名义桶等值 · 非实物库存</span>
            <span>时间：{formatDateCn(snapshot.fund.asOfDate)}</span>
          </div>

          <div className="hero-kpis">
            <div>
              <span>期货桶等值</span>
              <strong>
                {formatNumber(
                  snapshot.current.futuresBarrelEquivalent / 10_000,
                  1,
                )}
                万桶
              </strong>
            </div>
            <div>
              <span>
                {snapshot.current.swapBarrelEquivalent > 0
                  ? "掉期估算"
                  : "掉期持仓"}
              </span>
              {snapshot.current.swapBarrelEquivalent > 0 ? (
                <strong>
                  约
                  {formatNumber(
                    snapshot.current.swapBarrelEquivalent / 10_000,
                    1,
                  )}
                  万桶
                </strong>
              ) : (
                <strong>当前无</strong>
              )}
            </div>
            <div>
              <span>资产敞口率</span>
              <strong>
                {formatNumber(
                  snapshot.current.oilExposurePctOfNav * 100,
                  2,
                )}
                %
              </strong>
            </div>
          </div>

          <div className="hero-chart">
            <div className="chart-toolbar">
              <div className="segmented dark">
                {(["netAssets", "nav"] as ChartMetric[]).map((metric) => (
                  <button
                    type="button"
                    key={metric}
                    className={chartMetric === metric ? "active" : ""}
                    onClick={() => setChartMetric(metric)}
                  >
                    {metric === "netAssets" ? "总资产" : "单位净值"}
                  </button>
                ))}
              </div>
              <div className="current-chart-value">
                <span>{chartMetric === "netAssets" ? "最新" : "NAV"}</span>
                <strong>
                  {chartMetric === "netAssets"
                    ? formatHundredMillion(snapshot.current.netAssets)
                    : formatUsd(snapshot.current.nav)}
                </strong>
              </div>
            </div>
            <HistoryCanvas rows={chartRows} metric={chartMetric} />
            <div className="range-tabs" aria-label="趋势时间范围">
              {(Object.keys(RANGE_LABELS) as ChartRange[]).map((range) => (
                <button
                  type="button"
                  key={range}
                  className={chartRange === range ? "active" : ""}
                  onClick={() => setChartRange(range)}
                >
                  {RANGE_LABELS[range]}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card snapshot-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">LATEST SNAPSHOT</p>
              <h2>关键数据</h2>
            </div>
            <span className="date-badge">
              {snapshot.fund.asOfDate.replaceAll("-", ".")}
            </span>
          </div>
          <div className="summary-grid">
            <div className="summary-box">
              <span>单位净值</span>
              <strong>{formatUsd(snapshot.current.nav)}</strong>
              <small className="up">
                {formatSigned(snapshot.current.navChangePct * 100, 2, "%")}
              </small>
            </div>
            <div className="summary-box">
              <span>总资产净值</span>
              <strong>
                {formatNumber(snapshot.current.netAssets / 100_000_000, 2)}亿
              </strong>
              <small>美元</small>
            </div>
            <div className="summary-box">
              <span>流通份额</span>
              <strong>
                {formatNumber(
                  snapshot.current.sharesOutstanding / 10_000,
                  2,
                )}
                万
              </strong>
              <small>基金份额</small>
            </div>
            <div className="summary-box">
              <span>申赎记录规模</span>
              <strong>
                {formatNumber(
                  Math.abs(snapshot.current.sharesCreatedRedeemed) / 10_000,
                  0,
                )}
                万
              </strong>
              <small>份 · 不解读方向</small>
            </div>
          </div>
        </section>

        <section className="card holdings-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">PORTFOLIO</p>
              <h2>持仓结构</h2>
            </div>
            <div className="view-switch" aria-label="持仓展示方式">
              <button
                type="button"
                className={holdingView === "structure" ? "active" : ""}
                onClick={() => setHoldingView("structure")}
              >
                图表
              </button>
              <button
                type="button"
                className={holdingView === "table" ? "active" : ""}
                onClick={() => setHoldingView("table")}
              >
                表格
              </button>
            </div>
          </div>

          {holdingView === "structure" ? (
            <div className="exposure-panel">
              <div className="exposure-total">
                <span>原油相关名义市值</span>
                <strong>
                  {formatHundredMillion(snapshot.current.oilNotional)}
                </strong>
              </div>
              <div className="meter-item">
                <div>
                  <span>原油合约名义敞口 / NAV</span>
                  <strong>
                    {formatNumber(
                      snapshot.current.oilExposurePctOfNav * 100,
                      2,
                    )}
                    %
                  </strong>
                </div>
                <div className="meter-track">
                  <span
                    className="meter-fill oil"
                    style={{
                      width: `${Math.min(
                        snapshot.current.oilExposurePctOfNav * 100,
                        100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
              <div className="meter-item">
                <div>
                  <span>现金与等价物 / NAV</span>
                  <strong>
                    {formatNumber(
                      (snapshot.current.collateralValue /
                        snapshot.current.netAssets) *
                        100,
                      2,
                    )}
                    %
                  </strong>
                </div>
                <div className="meter-track">
                  <span
                    className="meter-fill cash"
                    style={{
                      width: `${Math.min(
                        (snapshot.current.collateralValue /
                          snapshot.current.netAssets) *
                          100,
                        100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
              <div className="position-cards">
                {snapshot.holdings
                  .filter(
                    (holding) =>
                      holding.holdingType === "Futures" ||
                      holding.holdingType === "Swap",
                  )
                  .map((holding) => (
                    <article key={`${holding.name}-${holding.ticker}`}>
                      <div>
                        <span className="position-type">
                          {holding.category}
                        </span>
                        <small>{holding.ticker}</small>
                      </div>
                      <h3>{holding.name}</h3>
                      <div className="position-meta">
                        <span>
                          {formatQuantity(holding.quantity, holding.holdingType)}
                        </span>
                        <strong>
                          {formatHundredMillion(holding.marketValue ?? 0)}
                        </strong>
                      </div>
                    </article>
                  ))}
              </div>
            </div>
          ) : (
            <div className="holding-table-wrap">
              <table className="holding-table">
                <thead>
                  <tr>
                    <th>持仓</th>
                    <th>数量</th>
                    <th>市值</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.holdings.map((holding) => (
                    <tr key={`${holding.name}-${holding.ticker}`}>
                      <td>
                        <strong>{holding.name}</strong>
                        <span>
                          {holding.category} · {holding.ticker || "USD"}
                        </span>
                      </td>
                      <td>
                        {formatQuantity(
                          holding.quantity,
                          holding.holdingType,
                        )}
                      </td>
                      <td>
                        {formatHundredMillion(holding.marketValue ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="inline-note">
            期货名义市值与抵押资产会同时列示，因此持仓权重合计可能超过100%。
          </p>
        </section>

        <section className="card analysis-card">
          <div className="section-heading analysis-heading">
            <div>
              <p className="section-kicker">ASSET CHANGE</p>
              <h2>资产净值变化一览</h2>
            </div>
            <div className="unit-switch" aria-label="资产变化计价单位">
              <button
                type="button"
                className={analysisUnit === "barrels" ? "active" : ""}
                onClick={() => setAnalysisUnit("barrels")}
              >
                按桶
              </button>
              <button
                type="button"
                className={analysisUnit === "amount" ? "active" : ""}
                onClick={() => setAnalysisUnit("amount")}
              >
                按美元
              </button>
            </div>
          </div>

          <div className="period-tabs" aria-label="统计周期">
            {(["month", "year", "5y"] as AnalysisPeriod[]).map((period) => (
              <button
                type="button"
                key={period}
                className={analysisPeriod === period ? "active" : ""}
                onClick={() => {
                  setAnalysisPeriod(period);
                  setVisibleDays(12);
                }}
              >
                {PERIOD_LABELS[period]}
              </button>
            ))}
          </div>

          <details className="date-filter" open={analysisPeriod === "custom"}>
            <summary>
              自定义日期
              <span>
                {analysisPeriod === "custom"
                  ? `${appliedCustom.start} 至 ${appliedCustom.end}`
                  : "可选"}
              </span>
            </summary>
            <form onSubmit={applyCustomRange}>
              <label>
                开始
                <input
                  type="date"
                  min={snapshot.history.dateFrom}
                  max={snapshot.history.dateTo}
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                />
              </label>
              <label>
                结束
                <input
                  type="date"
                  min={snapshot.history.dateFrom}
                  max={snapshot.history.dateTo}
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                />
              </label>
              <button type="submit">应用</button>
            </form>
          </details>

          <div className="analysis-range">
            <span>
              {analysisRows[0]?.date ?? "--"} 至{" "}
              {analysisRows.at(-1)?.date ?? "--"}
            </span>
            <span>{analysisRows.length}个交易日</span>
          </div>

          <div className="summary-grid analysis-summary">
            <div className="summary-box">
              <span>区间净变化</span>
              <strong className={analysisStats.net >= 0 ? "up" : "down"}>
                {formatSigned(analysisStats.net, 2)}
              </strong>
              <small>{analysisSuffix}</small>
            </div>
            <div className="summary-box">
              <span>交易日</span>
              <strong>{analysisRows.length}</strong>
              <small>天</small>
            </div>
            <div className="summary-box">
              <span>增加合计</span>
              <strong className="up">
                {formatNumber(analysisStats.up, 2)}
              </strong>
              <small>{analysisSuffix}</small>
            </div>
            <div className="summary-box">
              <span>减少合计</span>
              <strong className="down">
                {formatNumber(analysisStats.down, 2)}
              </strong>
              <small>{analysisSuffix}</small>
            </div>
          </div>

          <div className="matrix-head">
            <div>
              <h3>变化矩阵</h3>
              <span>红=增加 · 绿=减少</span>
            </div>
            <div className="matrix-controls">
              {matrixMode !== "year" && matrixYears.length > 1 ? (
                <select
                  value={activeMatrixYear}
                  onChange={(event) => setMatrixYear(Number(event.target.value))}
                  aria-label="矩阵年份"
                >
                  {matrixYears.map((year) => (
                    <option key={year} value={year}>
                      {year}年
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="mini-tabs">
                {(["month", "week", "year"] as MatrixMode[]).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    className={matrixMode === mode ? "active" : ""}
                    onClick={() => setMatrixMode(mode)}
                  >
                    {mode === "month" ? "月" : mode === "week" ? "周" : "年"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={`matrix-grid ${matrixMode}`}>
            {matrixItems.map((item) => {
              const intensity =
                item.value === null
                  ? 0
                  : Math.min(Math.abs(item.value) / matrixMax, 1);
              const alpha = 0.12 + intensity * 0.58;
              const background =
                item.value === null
                  ? "#f0f1ef"
                  : item.value >= 0
                    ? `rgba(205, 72, 61, ${alpha})`
                    : `rgba(45, 126, 78, ${alpha})`;
              return (
                <div
                  className="matrix-cell"
                  key={item.key}
                  style={{ background }}
                  title={
                    item.value === null
                      ? `${item.label}：无数据`
                      : `${item.label}：${formatSigned(item.value, 2, analysisSuffix)}`
                  }
                >
                  <span>{item.label}</span>
                  <strong>
                    {item.value === null
                      ? "—"
                      : formatSigned(
                          item.value,
                          matrixMode === "week" ? 1 : 2,
                        )}
                  </strong>
                </div>
              );
            })}
          </div>
          <p className="inline-note">
            按桶为资产变化的折算桶等值，采用当前组合“名义桶数 /
            总净资产”统一换算；并非历史逐日真实合约增减。切换按美元可查看USCF官方资产变化原值。
          </p>
        </section>

        <section className="card daily-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">DAILY DETAIL</p>
              <h2>区间日变化</h2>
            </div>
            <div className="daily-heading-tools">
              <span className="date-badge">{PERIOD_LABELS[analysisPeriod]}</span>
              <div className="unit-switch" aria-label="区间日变化计价单位">
                <button
                  type="button"
                  className={analysisUnit === "barrels" ? "active" : ""}
                  onClick={() => setAnalysisUnit("barrels")}
                >
                  按桶
                </button>
                <button
                  type="button"
                  className={analysisUnit === "amount" ? "active" : ""}
                  onClick={() => setAnalysisUnit("amount")}
                >
                  按美元
                </button>
              </div>
            </div>
          </div>
          <ul className="daily-list">
            {dailyRows.slice(0, visibleDays).map(({ row, value }) => {
              const isHigh = row.date === analysisStats.biggestUp?.row.date;
              const isLow = row.date === analysisStats.biggestDown?.row.date;
              return (
                <li key={row.date}>
                  <div className="daily-date">
                    <strong>{formatDateCn(row.date, false)}</strong>
                    <span>{row.date.slice(0, 4)}</span>
                    {isHigh ? <em className="up-tag">区间最高</em> : null}
                    {isLow ? <em className="down-tag">区间最低</em> : null}
                  </div>
                  <div className="daily-bar">
                    <span
                      className={value >= 0 ? "positive" : "negative"}
                      style={{
                        width: `${Math.max(
                          3,
                          (Math.abs(value) / dailyMax) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="daily-value">
                    <strong className={value >= 0 ? "up" : "down"}>
                      {formatSigned(value, 2)}
                    </strong>
                    <span>{analysisSuffix}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {visibleDays < dailyRows.length ? (
            <button
              type="button"
              className="load-more"
              onClick={() => setVisibleDays((count) => count + 12)}
            >
              加载更多
            </button>
          ) : null}
          <p className="inline-note">
            桶数为资产净值变化的单位换算，包含油价、申赎、抵押品收益和费用影响，不代表基金当日实际买卖的原油桶数。
          </p>
        </section>

        <footer className="report-footer">
          <strong>
            {snapshot.fund.symbol} · {snapshot.fund.benchmarkZh}ETF持仓报告
          </strong>
          <p>
            数据截至 {snapshot.fund.asOfDate} · 历史区间{" "}
            {snapshot.history.dateFrom}—{snapshot.history.dateTo} ·{" "}
            {snapshot.history.records}个交易日
          </p>
          <p>本报告仅作客观数据展示，不构成任何投资建议。</p>
        </footer>
      </div>
    </main>
  );
}
