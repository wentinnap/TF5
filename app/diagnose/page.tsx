"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";

type DiagnosisRow = {
  symbol: string;
  hasEnoughData: boolean;
  price?: number;
  trend?: "up" | "down";
  adx?: number;
  adxOk?: boolean;
  rsi?: number;
  pullbackOk?: boolean;
  candleConfirmOk?: boolean;
  wouldSignal?: boolean;
  blockedBy?: string[];
  error?: string;
};

function CheckIcon({ ok }: { ok?: boolean }) {
  return <span style={{ color: ok ? "var(--buy)" : "var(--muted)" }}>{ok ? "✓" : "✗"}</span>;
}

export default function DiagnosePage() {
  const [rows, setRows] = useState<DiagnosisRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string>("");

  function load() {
    setLoading(true);
    fetch("/api/diagnose")
      .then((r) => r.json())
      .then((res) => {
        setRows(res.results);
        setCheckedAt(res.checkedAt);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>ตรวจสอบเงื่อนไข</h1>
      <p style={{ color: "var(--muted)", marginTop: 0, marginBottom: 20 }}>
        ดูว่าแต่ละคู่เงินตอนนี้ผ่าน/ไม่ผ่านเงื่อนไขไหนบ้าง (ไม่บันทึกลง DB ไม่ส่งอีเมล ใช้ดูเฉยๆ)
      </p>

      <button
        onClick={load}
        disabled={loading}
        style={{
          background: "var(--surface-2)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 16px",
          fontSize: 13,
          cursor: "pointer",
          marginBottom: 16,
        }}
      >
        {loading ? "กำลังโหลด..." : "รีเฟรช"}
      </button>

      {checkedAt && (
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 0 }}>
          เช็คล่าสุด: {new Date(checkedAt).toLocaleString("th-TH")}
        </p>
      )}

      {!rows ? (
        <p style={{ color: "var(--muted)" }}>กำลังโหลด...</p>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>คู่เงิน</th>
                <th>ราคา</th>
                <th>เทรนด์</th>
                <th>ADX &gt; 25</th>
                <th>RSI Pullback</th>
                <th>แท่งยืนยัน</th>
                <th>จะออก Signal?</th>
                <th>สาเหตุที่ยังไม่ผ่าน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol}>
                  <td style={{ fontWeight: 600 }}>{r.symbol}</td>
                  {r.error ? (
                    <td colSpan={7} style={{ color: "var(--sell)" }}>
                      ดึงข้อมูลไม่สำเร็จ: {r.error}
                    </td>
                  ) : !r.hasEnoughData ? (
                    <td colSpan={7} style={{ color: "var(--muted)" }}>
                      ข้อมูลย้อนหลังยังไม่พอคำนวณ (ต้องการอย่างน้อย ~205 แท่ง)
                    </td>
                  ) : (
                    <>
                      <td className="mono">{formatPrice(r.symbol, r.price!)}</td>
                      <td style={{ color: r.trend === "up" ? "var(--buy)" : "var(--sell)" }}>
                        {r.trend === "up" ? "ขาขึ้น" : "ขาลง"}
                      </td>
                      <td className="mono">
                        <CheckIcon ok={r.adxOk} /> {r.adx?.toFixed(1)}
                      </td>
                      <td className="mono">
                        <CheckIcon ok={r.pullbackOk} /> RSI {r.rsi?.toFixed(1)}
                      </td>
                      <td>
                        <CheckIcon ok={r.candleConfirmOk} />
                      </td>
                      <td>
                        <span className={`badge ${r.wouldSignal ? "badge-buy" : "badge-open"}`}>
                          {r.wouldSignal ? "ผ่านครบ!" : "ยังไม่ผ่าน"}
                        </span>
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: 12, maxWidth: 260 }}>
                        {r.blockedBy && r.blockedBy.length > 0 ? r.blockedBy.join(" • ") : "-"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

