"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type StatsResponse = {
  summary: {
    totalClosed: number;
    wins: number;
    losses: number;
    winRate: number;
    expectancyR: number;
    openPositions: number;
  };
  equityCurve: { index: number; cumulativeR: number; date: string }[];
  recentClosed: any[];
};

export default function Dashboard() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--muted)" }}>กำลังโหลดสถิติ...</p>;
  if (!data) return <p style={{ color: "var(--sell)" }}>โหลดสถิติไม่สำเร็จ</p>;

  const { summary, equityCurve, recentClosed } = data;

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>สถิติการเทรด</h1>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="stat-label">Win Rate</div>
          <div className="stat-value" style={{ color: summary.winRate >= 50 ? "var(--buy)" : "var(--sell)" }}>
            {summary.winRate}%
          </div>
        </div>
        <div className="card">
          <div className="stat-label">ปิดแล้วทั้งหมด</div>
          <div className="stat-value">{summary.totalClosed}</div>
        </div>
        <div className="card">
          <div className="stat-label">Win / Loss</div>
          <div className="stat-value">
            <span style={{ color: "var(--buy)" }}>{summary.wins}</span>
            {" / "}
            <span style={{ color: "var(--sell)" }}>{summary.losses}</span>
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Expectancy (R เฉลี่ย/ไม้)</div>
          <div className="stat-value">{summary.expectancyR}R</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Equity Curve (สะสมเป็นหน่วย R)</h3>
        {equityCurve.length === 0 ? (
          <p className="empty-state">ยังไม่มีเทรดที่ปิดจบ — รอสัญญาณชน TP/SL ก่อน</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={equityCurve}>
              <CartesianGrid stroke="#232e3f" strokeDasharray="3 3" />
              <XAxis dataKey="index" stroke="#7c8798" fontSize={12} />
              <YAxis stroke="#7c8798" fontSize={12} />
              <Tooltip
                contentStyle={{ background: "#1a2330", border: "1px solid #232e3f", borderRadius: 8 }}
                labelStyle={{ color: "#7c8798" }}
              />
              <Line type="monotone" dataKey="cumulativeR" stroke="#2dd4bf" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <h3 style={{ margin: "20px 24px 0" }}>ประวัติเทรดล่าสุด</h3>
        {recentClosed.length === 0 ? (
          <p className="empty-state">ยังไม่มีประวัติ</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>คู่เงิน</th>
                <th>ทิศทาง</th>
                <th>ผลลัพธ์</th>
                <th>เข้า</th>
                <th>ปิด</th>
                <th>วันที่</th>
              </tr>
            </thead>
            <tbody>
              {recentClosed.map((s: any) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.symbol}</td>
                  <td>
                    <span className={`badge ${s.direction === "BUY" ? "badge-buy" : "badge-sell"}`}>
                      {s.direction}
                    </span>
                  </td>
                  <td style={{ color: s.status === "WIN" ? "var(--buy)" : "var(--sell)", fontWeight: 600 }}>
                    {s.status}
                  </td>
                  <td className="mono">{s.entryPrice.toFixed(5)}</td>
                  <td className="mono">{s.closePrice?.toFixed(5)}</td>
                  <td className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>
                    {s.closedAt ? new Date(s.closedAt).toLocaleDateString("th-TH") : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
