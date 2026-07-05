import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const closedSignals = await prisma.signal.findMany({
    where: { status: { in: ["WIN", "LOSS"] } },
    orderBy: { createdAt: "asc" },
  });

  const wins = closedSignals.filter((s) => s.status === "WIN").length;
  const losses = closedSignals.filter((s) => s.status === "LOSS").length;
  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) * 100 : 0;

  // คำนวณ R-multiple ของแต่ละไม้ (WIN = +2R ตาม RR 1:2, LOSS = -1R) แล้วทำ equity curve สะสม
  let cumulativeR = 0;
  const equityCurve = closedSignals.map((s, idx) => {
    const rMultiple = s.status === "WIN" ? 2 : -1;
    cumulativeR += rMultiple;
    return {
      index: idx + 1,
      symbol: s.symbol,
      date: s.closedAt?.toISOString().slice(0, 10) ?? "",
      rMultiple,
      cumulativeR: Number(cumulativeR.toFixed(2)),
    };
  });

  const openSignals = await prisma.signal.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    summary: {
      totalClosed: total,
      wins,
      losses,
      winRate: Number(winRate.toFixed(1)),
      expectancyR: total > 0 ? Number((cumulativeR / total).toFixed(2)) : 0,
      openPositions: openSignals.length,
    },
    equityCurve,
    openSignals,
    recentClosed: closedSignals.slice(-20).reverse(),
  });
}
