import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "原油ETF持仓报告｜USO",
  description:
    "基于USCF官方数据的USO原油ETF持仓、桶等值敞口与历史数据报告。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
