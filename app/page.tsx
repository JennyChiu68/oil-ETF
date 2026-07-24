import type { Metadata } from "next";
import { headers } from "next/headers";
import snapshot from "@/public/data/uso-snapshot.json";
import { OilEtfReport } from "./OilEtfReport";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);

  return {
    metadataBase: base,
    title: "原油ETF持仓报告｜USO",
    description:
      "基于USCF官方数据的USO原油ETF持仓、桶等值敞口、历史净值、资产变化与溢折价监控。",
    openGraph: {
      type: "website",
      locale: "zh_CN",
      title: "原油ETF持仓报告｜USO",
      description:
        "USO原油名义敞口、当前持仓结构与近5年官方历史数据。",
      images: [
        {
          url: new URL("/og.png", base).toString(),
          width: 1200,
          height: 630,
          alt: "原油ETF持仓报告",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "原油ETF持仓报告｜USO",
      description:
        "USO原油名义敞口、当前持仓结构与近5年官方历史数据。",
      images: [new URL("/og.png", base).toString()],
    },
  };
}

export default function Home() {
  return <OilEtfReport snapshot={snapshot} />;
}
