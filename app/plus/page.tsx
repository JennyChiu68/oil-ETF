import type { Metadata } from "next";
import { PlusLandingDemo } from "./PlusLandingDemo";

export const metadata: Metadata = {
  title: "原油ETF持仓报告 Plus｜会员权益介绍",
  description:
    "开通Plus，解锁USO与BNO原油ETF完整持仓变化、五年历史、持仓结构及桶数与美元双单位分析。",
};

export default function PlusPage() {
  return <PlusLandingDemo />;
}
