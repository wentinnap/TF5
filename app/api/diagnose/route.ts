import { NextResponse } from "next/server";
import { fetchCandles } from "@/lib/forexData";
import { diagnoseConditions } from "@/lib/strategy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const symbols = (process.env.FOREX_SYMBOLS ?? "EUR/USD,GBP/USD,USD/JPY,AUD/USD")
    .split(",")
    .map((s) => s.trim());
  const interval = process.env.FOREX_INTERVAL ?? "1h";
  const outputsize = parseInt(process.env.FOREX_OUTPUTSIZE ?? "400", 10);

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const candles = await fetchCandles(symbol, interval, outputsize);
        const diagnosis = diagnoseConditions(candles);
        return { symbol, ...diagnosis };
      } catch (err: any) {
        return { symbol, hasEnoughData: false, error: err.message };
      }
    })
  );

  return NextResponse.json({ checkedAt: new Date().toISOString(), interval, results });
}

