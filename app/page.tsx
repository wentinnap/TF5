import { prisma } from "@/lib/db";
import PriceChart from "@/components/PriceChart";

export const dynamic = "force-dynamic";

export default async function Home() {
  const openSignals = await prisma.signal.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>สัญญาณที่เปิดอยู่</h1>
      <p style={{ color: "var(--muted)", marginTop: 0, marginBottom: 24 }}>
        ระบบสแกนอัตโนมัติทุกวัน จำกัดสูงสุด {process.env.MAX_SIGNALS_PER_DAY ?? 2} ไม้/วัน
      </p>

      {openSignals.length === 0 ? (
        <div className="card empty-state">ยังไม่มีสัญญาณที่เปิดอยู่ตอนนี้</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {openSignals.map((s) => (
            <div key={s.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 18 }}>{s.symbol}</span>
                    <span className={`badge ${s.direction === "BUY" ? "badge-buy" : "badge-sell"}`}>
                      {s.direction}
                    </span>
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 13, maxWidth: 480 }}>{s.reason}</div>
                </div>
                <div className="mono" style={{ fontSize: 13, textAlign: "right" }}>
                  <div>Entry <span style={{ color: "var(--text)", fontWeight: 600 }}>{s.entryPrice.toFixed(5)}</span></div>
                  <div>SL <span style={{ color: "var(--sell)", fontWeight: 600 }}>{s.stopLoss.toFixed(5)}</span></div>
                  <div>TP <span style={{ color: "var(--buy)", fontWeight: 600 }}>{s.takeProfit.toFixed(5)}</span></div>
                </div>
              </div>
              <PriceChart
                symbol={s.symbol}
                entryPrice={s.entryPrice}
                stopLoss={s.stopLoss}
                takeProfit={s.takeProfit}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
