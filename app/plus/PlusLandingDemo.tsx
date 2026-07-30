"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import oilHero from "@/public/oil-hero-barrel.png";
import vipBadge from "@/public/vip-badge.svg";

type FundSymbol = "USO" | "BNO";

export type PlusPreviewFund = {
  symbol: string;
  benchmark: string;
  benchmarkZh: string;
  asOfDate: string;
  totalBarrels: number;
  futuresBarrels: number;
  swapBarrels: number;
  latestChange: number;
  nav: number;
  rows: Array<{
    date: string;
    change: number;
  }>;
};

type PlusLandingDemoProps = {
  funds: Record<FundSymbol, PlusPreviewFund>;
};

function formatWanBarrels(value: number, digits = 2) {
  return `${(value / 10_000).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatSignedWanBarrels(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatWanBarrels(value, 2)}万桶`;
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${year}.${month}.${day}`;
}

function formatShortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

export function PlusLandingDemo({ funds }: PlusLandingDemoProps) {
  const [activeSymbol, setActiveSymbol] = useState<FundSymbol>("USO");
  const [showCheckout, setShowCheckout] = useState(false);
  const activeFund = funds[activeSymbol];

  const maxChange = useMemo(
    () =>
      Math.max(
        ...activeFund.rows.slice(0, 4).map((row) => Math.abs(row.change)),
        1,
      ),
    [activeFund],
  );

  useEffect(() => {
    if (!showCheckout) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowCheckout(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showCheckout]);

  return (
    <main className="plus-j-page" id="top">
      <header className="plus-j-nav">
        <Link className="plus-j-back" href="/" aria-label="返回原油ETF报告" />
        <strong>原油ETF持仓报告</strong>
        <button
          className="plus-j-capsule"
          type="button"
          onClick={() => setShowCheckout(true)}
          aria-label="开通Plus"
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      <section className="plus-j-hero">
        <div className="plus-j-hero-copy">
          <p>
            <Image src={vipBadge} width={15} height={15} alt="" />
            金十数据PLUS专享
          </p>
          <h1>原油ETF持仓报告</h1>
          <span>看懂机构仓位，不只看油价涨跌</span>
        </div>
        <Image
          className="plus-j-oil-hero"
          src={oilHero}
          width={144}
          height={144}
          priority
          alt=""
        />
        <div className="plus-j-fund-switch" role="tablist" aria-label="原油品种切换">
          {(["USO", "BNO"] as FundSymbol[]).map((symbol) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeSymbol === symbol}
              className={activeSymbol === symbol ? "active" : ""}
              key={symbol}
              onClick={() => setActiveSymbol(symbol)}
            >
              {symbol === "USO" ? "WTI原油" : "布伦特原油"}
            </button>
          ))}
        </div>
      </section>

      <section className="plus-j-intro">
        <span className="plus-j-badge">PLUS会员专享</span>
        <h2>每天多看一层机构持仓变化</h2>
        <p>
          USO与BNO官方持仓每日更新，默认换算成更直观的桶数，帮助你快速判断机构增持或减持。
        </p>
      </section>

      <section className="plus-j-preview">
        <div className="plus-j-preview-heading">
          <div>
            <span>今日数据预览</span>
            <small>截至 {formatDate(activeFund.asOfDate)}</small>
          </div>
          <strong>{activeFund.symbol}</strong>
        </div>

        <div className="plus-j-headline">
          <span>当前名义原油敞口</span>
          <strong>
            {formatWanBarrels(activeFund.totalBarrels)}
            <small>万桶等值</small>
          </strong>
        </div>

        <div className="plus-j-metrics">
          <article>
            <span>期货桶等值</span>
            <strong>{formatWanBarrels(activeFund.futuresBarrels, 1)}万</strong>
          </article>
          <article>
            <span>最新持仓变化</span>
            <strong className={activeFund.latestChange >= 0 ? "up" : "down"}>
              {formatSignedWanBarrels(activeFund.latestChange)}
            </strong>
          </article>
          <article>
            <span>单位净值</span>
            <strong>${activeFund.nav.toFixed(2)}</strong>
          </article>
        </div>

        <div className="plus-j-chart">
          <div className="plus-j-chart-title">
            <strong>近期持仓日变化</strong>
            <span>按桶</span>
          </div>
          <div className="plus-j-zero" aria-hidden="true" />
          {activeFund.rows.slice(0, 4).map((row, index) => {
            const isPositive = row.change >= 0;
            const width = Math.max((Math.abs(row.change) / maxChange) * 42, 2);
            return (
              <div
                className={`plus-j-chart-row ${index > 1 ? "locked" : ""}`}
                key={`${activeSymbol}-${row.date}`}
              >
                <span>{formatShortDate(row.date)}</span>
                <div>
                  <i
                    className={isPositive ? "up" : "down"}
                    style={{
                      width: `${width}%`,
                      left: isPositive ? "50%" : `${50 - width}%`,
                    }}
                  />
                </div>
                <strong className={isPositive ? "up" : "down"}>
                  {formatSignedWanBarrels(row.change)}
                </strong>
              </div>
            );
          })}
          <button
            className="plus-j-lock"
            type="button"
            onClick={() => setShowCheckout(true)}
          >
            <span className="plus-j-lock-icon" aria-hidden="true" />
            <span>
              <strong>开通Plus查看完整数据</strong>
              <small>完整日变化 · 五年历史 · 持仓结构</small>
            </span>
          </button>
        </div>
      </section>

      <section className="plus-j-benefits">
        <h2>开通Plus可解锁</h2>
        <div>
          <article>
            <strong>每日</strong>
            <span>官方持仓更新</span>
          </article>
          <article>
            <strong>5年</strong>
            <span>历史变化追踪</span>
          </article>
          <article>
            <strong>双品种</strong>
            <span>WTI与Brent</span>
          </article>
          <article>
            <strong>双单位</strong>
            <span>按桶与按美元</span>
          </article>
        </div>
      </section>

      <p className="plus-j-disclaimer">
        数据用于客观展示，不构成投资建议。最终权益与价格以正式会员页为准。
      </p>

      <nav className="plus-j-bottom" aria-label="Plus会员操作">
        <a href="#top">
          <span className="plus-j-icon preview" aria-hidden="true" />
          <em>查看预览</em>
        </a>
        <button type="button" onClick={() => setShowCheckout(true)}>
          <span className="plus-j-icon crown" aria-hidden="true" />
          <em>立即开通Plus</em>
        </button>
      </nav>

      {showCheckout ? (
        <>
          <div
            className="plus-j-sheet-mask"
            role="presentation"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setShowCheckout(false);
            }}
          />
          <section
            className="plus-j-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plus-j-sheet-title"
          >
            <div className="plus-j-sheet-bar">
              <button type="button" onClick={() => setShowCheckout(false)}>
                取消
              </button>
              <h2 id="plus-j-sheet-title">开通Plus会员</h2>
              <span />
            </div>
            <div className="plus-j-sheet-body">
              <Image src={vipBadge} width={36} height={36} alt="" />
              <strong>此处接入现有Plus开通流程</strong>
              <p>正式上线时跳转到登录、套餐选择或现有收银台。</p>
              <button type="button" onClick={() => setShowCheckout(false)}>
                我知道了
              </button>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
