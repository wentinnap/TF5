export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

/**
 * ดึงแท่งเทียนย้อนหลังจาก Twelve Data
 * symbol เช่น "EUR/USD", interval เช่น "1h"
 * outputsize ต้อง >= 200+ แท่ง เพื่อให้คำนวณ EMA200 ได้แม่นยำ
 */
export async function fetchCandles(
  symbol: string,
  interval: string = "1h",
  outputsize: number = 300
): Promise<Candle[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("ไม่พบ TWELVE_DATA_API_KEY ใน environment");

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(outputsize));
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("order", "ASC"); // เก่าสุด -> ใหม่สุด

  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json();

  if (json.status === "error" || !json.values) {
    throw new Error(
      `Twelve Data error สำหรับ ${symbol}: ${json.message ?? "unknown error"}`
    );
  }

  return json.values.map((v: any) => ({
    time: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
  }));
}

/** ดึงราคาล่าสุด (real-time quote) ใช้ตอนเช็คว่าราคาชน TP/SL หรือยัง */
export async function fetchLatestPrice(symbol: string): Promise<number> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("ไม่พบ TWELVE_DATA_API_KEY ใน environment");

  const url = new URL("https://api.twelvedata.com/price");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json();
  if (!json.price) {
    throw new Error(`ดึงราคาล่าสุดของ ${symbol} ไม่ได้: ${JSON.stringify(json)}`);
  }
  return parseFloat(json.price);
}
