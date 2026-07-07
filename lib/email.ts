import { Resend } from "resend";
import { StrategySignal } from "./strategy";
import type { Signal } from "@prisma/client";
import { formatPrice } from "./format";

export async function sendSignalEmail(symbol: string, signal: StrategySignal) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;
  const to = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !from || !to) {
    console.warn("ยังไม่ได้ตั้งค่า RESEND_API_KEY/ALERT_EMAIL_FROM/ALERT_EMAIL_TO — ข้ามการส่งอีเมล");
    return;
  }

  const resend = new Resend(apiKey);
  const directionThai = signal.direction === "BUY" ? "ซื้อ (BUY)" : "ขาย (SELL)";
  const emoji = signal.direction === "BUY" ? "🟢" : "🔴";

  await resend.emails.send({
    from,
    to,
    subject: `${emoji} สัญญาณใหม่: ${directionThai} ${symbol}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px;">
        <h2>${emoji} ${directionThai} ${symbol}</h2>
        <table style="border-collapse: collapse; width: 100%;">
          <tr><td style="padding:6px 0;color:#666;">ราคาเข้า (Entry)</td><td style="text-align:right;font-weight:bold;">${formatPrice(symbol, signal.entryPrice)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Stop Loss</td><td style="text-align:right;color:#c0392b;">${formatPrice(symbol, signal.stopLoss)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Take Profit</td><td style="text-align:right;color:#27ae60;">${formatPrice(symbol, signal.takeProfit)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">RSI</td><td style="text-align:right;">${signal.rsi.toFixed(1)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">ATR</td><td style="text-align:right;">${signal.atr.toFixed(5)}</td></tr>
        </table>
        <p style="color:#666;font-size:14px;margin-top:12px;">${signal.reason}</p>
        <p style="color:#999;font-size:12px;">⚠️ เป็นสัญญาณจากระบบอัตโนมัติ ไม่ใช่คำแนะนำการลงทุน กรุณาตรวจสอบและบริหารความเสี่ยงเอง</p>
      </div>
    `,
  });
}

/** ส่งอีเมลแจ้งผลลัพธ์เมื่อไม้ปิด (ชนกำไร/ชนขาดทุน) พร้อมสรุปสถิติสะสม */
export async function sendResultEmail(
  signal: Pick<Signal, "symbol" | "direction" | "entryPrice" | "stopLoss" | "takeProfit" | "closePrice">,
  status: "WIN" | "LOSS",
  stats: { totalClosed: number; wins: number; losses: number; winRate: number }
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;
  const to = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !from || !to) {
    console.warn("ยังไม่ได้ตั้งค่าอีเมล — ข้ามการแจ้งเตือนผลลัพธ์");
    return;
  }

  const resend = new Resend(apiKey);
  const isWin = status === "WIN";
  const emoji = isWin ? "✅" : "❌";
  const label = isWin ? "ชนะ (WIN)" : "แพ้ (LOSS)";
  const color = isWin ? "#27ae60" : "#c0392b";

  await resend.emails.send({
    from,
    to,
    subject: `${emoji} ปิดไม้: ${label} — ${signal.symbol}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px;">
        <h2 style="color:${color};">${emoji} ${signal.symbol} — ${label}</h2>
        <table style="border-collapse: collapse; width: 100%;">
          <tr><td style="padding:6px 0;color:#666;">ทิศทาง</td><td style="text-align:right;font-weight:bold;">${signal.direction}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">ราคาเข้า</td><td style="text-align:right;">${formatPrice(signal.symbol, signal.entryPrice)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">ราคาปิด</td><td style="text-align:right;font-weight:bold;color:${color};">${signal.closePrice != null ? formatPrice(signal.symbol, signal.closePrice) : "-"}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
        <p style="color:#333;font-size:14px;">
          สถิติสะสม: ชนะ ${stats.wins} / แพ้ ${stats.losses} จากทั้งหมด ${stats.totalClosed} ไม้ —
          <strong>Win Rate ${stats.winRate}%</strong>
        </p>
      </div>
    `,
  });
}
