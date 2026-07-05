import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchLatestPrice } from "@/lib/forexData";
import { sendResultEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const openSignals = await prisma.signal.findMany({
    where: { status: "OPEN" },
  });

  const updates: any[] = [];

  for (const s of openSignals) {
    try {
      const price = await fetchLatestPrice(s.symbol);
      let newStatus: "WIN" | "LOSS" | null = null;

      if (s.direction === "BUY") {
        if (price >= s.takeProfit) newStatus = "WIN";
        else if (price <= s.stopLoss) newStatus = "LOSS";
      } else {
        if (price <= s.takeProfit) newStatus = "WIN";
        else if (price >= s.stopLoss) newStatus = "LOSS";
      }

      if (newStatus) {
        const updated = await prisma.signal.update({
          where: { id: s.id },
          data: { status: newStatus, closePrice: price, closedAt: new Date() },
        });

        // คำนวณสถิติสะสมล่าสุด เพื่อแนบไปกับอีเมลแจ้งผล
        const wins = await prisma.signal.count({ where: { status: "WIN" } });
        const losses = await prisma.signal.count({ where: { status: "LOSS" } });
        const totalClosed = wins + losses;
        const winRate = totalClosed > 0 ? Number(((wins / totalClosed) * 100).toFixed(1)) : 0;

        await sendResultEmail(updated, newStatus, { totalClosed, wins, losses, winRate });
        updates.push({ id: s.id, symbol: s.symbol, newStatus, price });
      }
    } catch (err: any) {
      updates.push({ id: s.id, symbol: s.symbol, error: err.message });
    }
  }

  return NextResponse.json({ checkedAt: new Date().toISOString(), updates });
}
