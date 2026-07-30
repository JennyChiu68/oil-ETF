"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const oilHero = "/oil-hero-barrel.png";
const vipBadge = "/vip-badge.svg";

type FundSymbol = "USO" | "BNO";

const previewRows = [
  { label: "最新日", direction: "up", width: 28 },
  { label: "前1日", direction: "down", width: 42 },
  { label: "前2日", direction: "up", width: 16 },
  { label: "前3日", direction: "down", width: 31 },
  { label: "前4日", direction: "up", width: 37 },
  { label: "前5日", direction: "down", width: 21 },
] as const;

export function PlusLandingDemo() {
  const [activeSymbol, setActiveSymbol] = useState<FundSymbol>("USO");
  const [showCheckout, setShowCheckout] = useState(false);

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
          unoptimized
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
            <span>会员页面预览</span>
            <small>核心数据已遮盖 · Plus内每日更新</small>
          </div>
          <strong>{activeSymbol}</strong>
        </div>

        <div className="plus-j-headline plus-j-headline-masked">
          <span>当前名义原油敞口</span>
          <strong aria-label="数据已遮盖">
            <i>••••••</i>
            <small>万桶等值</small>
          </strong>
        </div>

        <div className="plus-j-metrics">
          <article>
            <span>期货桶等值</span>
            <strong className="plus-j-concealed">••••万</strong>
          </article>
          <article>
            <span>最新持仓变化</span>
            <strong className="plus-j-concealed up">+•••万桶</strong>
          </article>
          <article>
            <span>单位净值</span>
            <strong className="plus-j-concealed">$•••</strong>
          </article>
        </div>

        <div className="plus-j-chart">
          <div className="plus-j-chart-title">
            <strong>近期持仓日变化</strong>
            <span>按桶</span>
          </div>
          <div className="plus-j-zero" aria-hidden="true" />
          {previewRows.map((row, index) => (
            <div
              className={`plus-j-chart-row ${index > 1 ? "locked" : ""}`}
              key={`${activeSymbol}-${row.label}`}
            >
              <span>{row.label}</span>
              <div>
                <i
                  className={row.direction}
                  style={{
                    width: `${row.width}%`,
                    left:
                      row.direction === "up" ? "50%" : `${50 - row.width}%`,
                  }}
                />
              </div>
              <strong className={`plus-j-concealed ${row.direction}`}>
                {row.direction === "up" ? "+" : "-"}•••万桶
              </strong>
            </div>
          ))}
          <button
            className="plus-j-lock"
            type="button"
            onClick={() => setShowCheckout(true)}
          >
            <span className="plus-j-lock-icon" aria-hidden="true" />
            <span>
              <strong>开通Plus查看完整数据</strong>
              <small>每日更新 · 完整日变化 · 五年历史</small>
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
