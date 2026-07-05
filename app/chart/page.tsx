"use client";

import { useEffect, useState } from "react";
import PriceChart from "@/components/PriceChart";

type CurrentSnapshot = {
  price: number;
  rsi: number;
  adx: number;
  trend: "up" | "down";
};

export default function ChartPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [current, setCurrent] = useState<CurrentSnapshot | null>(null);
  const [chartKey, setChartKey] = useState(0); // ใช้บังคับให้ PriceChart re-fetch เมื่อเปลี่ยนคู่เงิน

  // โหลดรายชื่อคู่เงินจาก env ตอนเปิดหน้าครั้งแรก
  useEffect(() => {
    fetch("/api/symbols")
      .then((r) => r.json())
      .then((res) => {
        setSymbols(res.symbols);
        if (res.symbols.length > 0) setSelected(res.symbols[0]);
      });
  }, []);

  // ดึงค่าปัจจุบัน (เทรนด์/RSI/ADX) แยกจาก PriceChart เพื่อโชว์เป็นสรุปด้านบน
  useEffect(() => {
    if (!selected) return;
    fetch(`/api/chart?symbol=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.error) setCurrent(res.current);
      });
    setChartKey((k) => k + 1);
  }, [selected]);

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>กราฟราคา</h1>
      <p style={{ color: "var(--muted)", marginTop: 0, marginBottom: 24 }}>
        ดูเทรนด์และแนวโน้มของแต่ละคู่เงินได้ตลอดเวลา ไม่ต้องรอมีสัญญาณ
      </p>

      <div style={{ marginBottom: 20 }}>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            background: "var(--surface-2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 14,
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {symbols.map((sym) => (
            <option key={sym} value={sym}>
              {sym}
            </option>
          ))}
        </select>
      </div>

      {current && (
        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="stat-label">ราคาปัจจุบัน</div>
            <div className="stat-value">{current.price.toFixed(5)}</div>
          </div>
          <div className="card">
            <div className="stat-label">เทรนด์ (EMA50 vs 200)</div>
            <div className="stat-value" style={{ color: current.trend === "up" ? "var(--buy)" : "var(--sell)" }}>
              {current.trend === "up" ? "ขาขึ้น" : "ขาลง"}
            </div>
          </div>
          <div className="card">
            <div className="stat-label">ADX (ความแรงเทรนด์)</div>
            <div className="stat-value" style={{ color: current.adx > 25 ? "var(--buy)" : "var(--muted)" }}>
              {current.adx.toFixed(1)}
              {current.adx <= 25 && (
                <span style={{ fontSize: 12, marginLeft: 6, color: "var(--muted)" }}>ยังไม่แรงพอ</span>
              )}
            </div>
          </div>
          <div className="card">
            <div className="stat-label">RSI</div>
            <div className="stat-value">{current.rsi.toFixed(1)}</div>
          </div>
        </div>
      )}

      {selected && (
        <div className="card">
          <PriceChart key={chartKey} symbol={selected} />
        </div>
      )}
    </div>
  );
}
