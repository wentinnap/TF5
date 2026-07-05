import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const heading = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Forex Signal Desk",
  description: "ระบบวิเคราะห์เทรนด์ หาจุดเข้า-ออก และเก็บสถิติเทรด Forex อัตโนมัติ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={`${heading.variable} ${mono.variable}`}>
        <div className="app-shell">
          <header className="topbar">
            <div className="brand">
              <span className="brand-mark">▲▼</span>
              <span className="brand-name">Signal Desk</span>
            </div>
            <nav className="nav">
              <a href="/">สัญญาณล่าสุด</a>
              <a href="/dashboard">สถิติ</a>
            </nav>
          </header>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
