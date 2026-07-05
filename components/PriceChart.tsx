"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";

type ChartPoint = {
  time: string;
  close: number;
  emaFast: number | null;
  emaSlow: number | null;
};

export default function PriceChart({
  symbol,
  entryPrice,
  stopLoss,
  takeProfit,
}: {
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
}) {
  const [data, setData] = useState<ChartPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.error) setError(res.error);
        else setData(res.data);
      })
      .catch((e) => setError(e.message));
  }, [symbol]);

  if (error) {
    return <p style={{ color: "var(--sell)", fontSize: 13 }}>โหลดกราฟไม่สำเร็จ: {error}</p>;
  }
  if (!data) {
    return <p style={{ color: "var(--muted)", fontSize: 13 }}>กำลังโหลดกราฟ...</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#232e3f" strokeDasharray="3 3" />
        <XAxis dataKey="time" stroke="#7c8798" fontSize={11} minTickGap={40} />
        <YAxis stroke="#7c8798" fontSize={11} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{ background: "#1a2330", border: "1px solid #232e3f", borderRadius: 8 }}
          labelStyle={{ color: "#7c8798" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#7c8798" }} />

        {/* เส้นราคาปิดจริง */}
        <Line type="monotone" dataKey="close" name="ราคา" stroke="#e7ebf1" strokeWidth={1.5} dot={false} />
        {/* เส้นเทรนด์ */}
        <Line type="monotone" dataKey="emaFast" name="EMA50" stroke="#fbbf24" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="emaSlow" name="EMA200" stroke="#818cf8" strokeWidth={1} dot={false} />

        {/* จุดเข้า / SL / TP */}
        <ReferenceLine y={entryPrice} stroke="#e7ebf1" strokeDasharray="4 4" label={{ value: "Entry", fill: "#e7ebf1", fontSize: 11, position: "insideTopRight" }} />
        <ReferenceLine y={stopLoss} stroke="#f87171" strokeDasharray="4 4" label={{ value: "SL", fill: "#f87171", fontSize: 11, position: "insideBottomRight" }} />
        <ReferenceLine y={takeProfit} stroke="#2dd4bf" strokeDasharray="4 4" label={{ value: "TP", fill: "#2dd4bf", fontSize: 11, position: "insideTopRight" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
