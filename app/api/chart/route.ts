import { NextRequest, NextResponse } from "next/server";
import { fetchCandles } from "@/lib/forexData";
import { ema, rsi, adx } from "@/lib/indicators";

export const dynamic = "force-dynamic";

// คืนแท่งเทียนล่าสุดพร้อมเส้น EMA50/EMA200 และ RSI เพื่อเอาไปวาดกราฟฝั่ง client
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "ต้องระบุ ?symbol=EUR/USD" }, { status: 400 });
  }

  try {
    const interval = process.env.FOREX_INTERVAL ?? "1h";
    const candles = await fetchCandles(symbol, interval, 300);

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const emaFast = ema(closes, 50);
    const emaSlow = ema(closes, 200);
    const rsiArr = rsi(closes, 14);
    const adxArr = adx(highs, lows, closes, 14);

    // ส่งแค่ 100 แท่งล่าสุดพอ ไม่งั้นกราฟรกและโหลดช้า
    const sliceStart = Math.max(0, candles.length - 100);
    const chartData = candles.slice(sliceStart).map((c, idx) => {
      const realIdx = sliceStart + idx;
      return {
        time: c.time,
        close: c.close,
        emaFast: emaFast[realIdx] ?? null,
        emaSlow: emaSlow[realIdx] ?? null,
        rsi: rsiArr[realIdx] ?? null,
      };
    });

    const last = closes.length - 1;
    const current = {
      price: closes[last],
      emaFast: emaFast[last],
      emaSlow: emaSlow[last],
      rsi: rsiArr[last],
      adx: adxArr[last],
      trend: emaFast[last] > emaSlow[last] ? "up" : "down",
    };

    return NextResponse.json({ symbol, data: chartData, current });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
