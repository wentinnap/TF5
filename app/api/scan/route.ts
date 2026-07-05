import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchCandles } from "@/lib/forexData";
import { generateSignal } from "@/lib/strategy";
import { sendSignalEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // ป้องกันคนภายนอกยิง endpoint นี้เล่น
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const symbols = (process.env.FOREX_SYMBOLS ?? "EUR/USD,GBP/USD,USD/JPY,AUD/USD")
    .split(",")
    .map((s) => s.trim());
  const maxPerDay = parseInt(process.env.MAX_SIGNALS_PER_DAY ?? "2", 10);

  // นับ signal ที่เกิดขึ้นแล้ววันนี้ (ตามเวลา UTC ของ createdAt)
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const todayCount = await prisma.signal.count({
    where: { createdAt: { gte: startOfDay } },
  });

  const results: any[] = [];
  let remainingQuota = maxPerDay - todayCount;

  if (remainingQuota <= 0) {
    return NextResponse.json({
      message: `ถึงโควต้า ${maxPerDay} signal/วันแล้ว วันนี้ไม่ยิงเพิ่ม`,
      todayCount,
    });
  }

  const interval = process.env.FOREX_INTERVAL ?? "1h"; // TF เริ่มต้น: 1 ชั่วโมง
  const outputsize = parseInt(process.env.FOREX_OUTPUTSIZE ?? "400", 10);

  for (const symbol of symbols) {
    if (remainingQuota <= 0) break;
    try {
      const candles = await fetchCandles(symbol, interval, outputsize);
      const signal = generateSignal(candles);

      if (!signal) {
        results.push({ symbol, signal: null });
        continue;
      }

      const saved = await prisma.signal.create({
        data: {
          symbol,
          direction: signal.direction,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          rsi: signal.rsi,
          atr: signal.atr,
          adx: signal.adx,
          emaFast: signal.emaFast,
          emaSlow: signal.emaSlow,
          reason: signal.reason,
        },
      });

      await sendSignalEmail(symbol, signal);
      remainingQuota -= 1;
      results.push({ symbol, signal: saved });
    } catch (err: any) {
      results.push({ symbol, error: err.message });
    }
  }

  return NextResponse.json({
    scannedAt: new Date().toISOString(),
    todayCountBefore: todayCount,
    results,
  });
}
