import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "原油ETF持仓报告｜USO",
  description:
    "USO与BNO官方当前持仓、期货桶数变化及透明标注的历史模型估算报告。",
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
