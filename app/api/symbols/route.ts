import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const symbols = (process.env.FOREX_SYMBOLS ?? "EUR/USD,GBP/USD,USD/JPY,AUD/USD")
    .split(",")
    .map((s) => s.trim());
  return NextResponse.json({ symbols });
}
