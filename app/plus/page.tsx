import type { Metadata } from "next";
import bnoSnapshot from "@/public/data/bno-snapshot.json";
import usoSnapshot from "@/public/data/uso-snapshot.json";
import { PlusLandingDemo, type PlusPreviewFund } from "./PlusLandingDemo";

export const metadata: Metadata = {
  title: "原油ETF持仓报告 Plus｜会员权益介绍",
  description:
    "开通Plus，解锁USO与BNO原油ETF完整持仓变化、五年历史、持仓结构及桶数与美元双单位分析。",
};

function toPreviewFund(
  snapshot: typeof usoSnapshot | typeof bnoSnapshot,
): PlusPreviewFund {
  const rows = snapshot.history.rows.slice(-6).reverse();
  const latest = rows[0];

  return {
    symbol: snapshot.fund.symbol,
    benchmark: snapshot.fund.benchmark,
    benchmarkZh: snapshot.fund.benchmarkZh,
    asOfDate: snapshot.fund.asOfDate,
    totalBarrels: snapshot.current.oilBarrelEquivalent,
    futuresBarrels: snapshot.current.futuresBarrelEquivalent,
    swapBarrels: snapshot.current.swapBarrelEquivalent,
    latestChange: latest.futuresBarrelEquivalentChange,
    nav: snapshot.current.nav,
    rows: rows.map((row) => ({
      date: row.date,
      change: row.futuresBarrelEquivalentChange,
    })),
  };
}

export default function PlusPage() {
  return (
    <PlusLandingDemo
      funds={{
        USO: toPreviewFund(usoSnapshot),
        BNO: toPreviewFund(bnoSnapshot),
      }}
    />
  );
}
