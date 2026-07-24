import type { Metadata } from "next";
import { headers } from "next/headers";
import bnoSnapshot from "@/public/data/bno-snapshot.json";
import usoSnapshot from "@/public/data/uso-snapshot.json";
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
    title: "原油ETF持仓报告｜WTI USO・Brent BNO",
    description:
      "USO与BNO官方当前持仓、期货桶数变化、历史模型估算与官方持仓归档报告。",
    openGraph: {
      type: "website",
      locale: "zh_CN",
      title: "原油ETF持仓报告｜WTI USO・Brent BNO",
      description:
        "一页切换查看WTI对应USO与Brent对应BNO的官方当前持仓、历史模型估算与持续归档的官方期货桶数变化。",
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
      title: "原油ETF持仓报告｜WTI USO・Brent BNO",
      description:
        "一页切换查看WTI对应USO与Brent对应BNO的官方当前持仓、历史模型估算与持续归档的官方期货桶数变化。",
      images: [new URL("/og.png", base).toString()],
    },
  };
}

export default function Home() {
  return (
    <OilEtfReport
      snapshots={{
        USO: usoSnapshot,
        BNO: bnoSnapshot,
      }}
    />
  );
}
