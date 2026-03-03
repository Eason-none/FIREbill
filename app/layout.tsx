import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FIRE 助手",
  description: "真实时薪驱动的记账与双周复盘 MVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
