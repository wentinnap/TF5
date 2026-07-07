import { Candle } from "./forexData";
import { ema, rsi, atr, adx } from "./indicators";

export type StrategySignal = {
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  rsi: number;
  atr: number;
  adx: number;
  emaFast: number;
  emaSlow: number;
  reason: string;
};

// ปรับพารามิเตอร์ตรงนี้ได้ตาม backtest ที่ทำจริง
const EMA_FAST_PERIOD = 50;
const EMA_SLOW_PERIOD = 200;
const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
const ATR_SL_MULTIPLIER = 1.5; // ระยะ SL = 1.5 เท่าของ ATR
const RISK_REWARD = 2; // TP = 2 เท่าของระยะ SL (RR 1:2)
const RSI_PULLBACK_LOW = 40; // ขาขึ้น: รอ RSI ย่อลงต่ำกว่านี้แล้วดีดกลับ
const RSI_PULLBACK_HIGH = 60; // ขาลง: รอ RSI ขึ้นเกินนี้แล้วร่วงกลับ
const ADX_PERIOD = 14;
const ADX_THRESHOLD = 25; // ต้องเทรนด์แรงเกินนี้ถึงจะพิจารณาเข้า (กรองตลาด sideway ออก)

export type Diagnosis = {
  hasEnoughData: boolean;
  price?: number;
  trend?: "up" | "down";
  emaFast?: number;
  emaSlow?: number;
  adx?: number;
  adxOk?: boolean;
  rsi?: number;
  rsiPrev?: number;
  pullbackOk?: boolean; // RSI เพิ่งย่อ/เด้งกลับตามเทรนด์แล้วหรือยัง
  candleConfirmOk?: boolean;
  wouldSignal?: boolean;
  blockedBy?: string[]; // รายการเงื่อนไขที่ยังไม่ผ่าน (ไว้โชว์ debug)
};

/**
 * ตรวจสอบทีละเงื่อนไขว่าคู่เงินนี้ผ่าน/ไม่ผ่านอะไรบ้าง โดยไม่สร้าง signal จริง
 * ใช้สำหรับหน้า debug ("ทำไมยังไม่มี signal") ให้เห็นสาเหตุตรงๆ แทนการเดา
 */
export function diagnoseConditions(candles: Candle[]): Diagnosis {
  if (candles.length < EMA_SLOW_PERIOD + 5) {
    return { hasEnoughData: false };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const emaFastArr = ema(closes, EMA_FAST_PERIOD);
  const emaSlowArr = ema(closes, EMA_SLOW_PERIOD);
  const rsiArr = rsi(closes, RSI_PERIOD);
  const adxArr = adx(highs, lows, closes, ADX_PERIOD);

  const last = closes.length - 1;
  const prev = last - 1;

  const emaFastNow = emaFastArr[last];
  const emaSlowNow = emaSlowArr[last];
  const rsiNow = rsiArr[last];
  const rsiPrev = rsiArr[prev];
  const adxNow = adxArr[last];
  const lastCandle = candles[last];

  if ([emaFastNow, emaSlowNow, rsiNow, rsiPrev, adxNow].some((v) => Number.isNaN(v))) {
    return { hasEnoughData: false };
  }

  const trend: "up" | "down" = emaFastNow > emaSlowNow ? "up" : "down";
  const adxOk = adxNow > ADX_THRESHOLD;

  const pullbackOk =
    trend === "up"
      ? rsiPrev < RSI_PULLBACK_LOW && rsiNow >= RSI_PULLBACK_LOW
      : rsiPrev > RSI_PULLBACK_HIGH && rsiNow <= RSI_PULLBACK_HIGH;

  const candleConfirmOk = trend === "up" ? lastCandle.close > lastCandle.open : lastCandle.close < lastCandle.open;

  const blockedBy: string[] = [];
  if (!adxOk) blockedBy.push(`ADX ${adxNow.toFixed(1)} ยังไม่เกิน ${ADX_THRESHOLD} (เทรนด์ยังไม่แรงพอ)`);
  if (!pullbackOk)
    blockedBy.push(
      trend === "up"
        ? `RSI ยังไม่เพิ่งย่อ+ดีดกลับผ่านโซน ${RSI_PULLBACK_LOW} (ตอนนี้ ${rsiNow.toFixed(1)})`
        : `RSI ยังไม่เพิ่งเด้ง+ร่วงกลับผ่านโซน ${RSI_PULLBACK_HIGH} (ตอนนี้ ${rsiNow.toFixed(1)})`
    );
  if (!candleConfirmOk) blockedBy.push("แท่งเทียนล่าสุดยังไม่ปิดยืนยันทิศทางเทรนด์");

  return {
    hasEnoughData: true,
    price: closes[last],
    trend,
    emaFast: emaFastNow,
    emaSlow: emaSlowNow,
    adx: adxNow,
    adxOk,
    rsi: rsiNow,
    rsiPrev,
    pullbackOk,
    candleConfirmOk,
    wouldSignal: adxOk && pullbackOk && candleConfirmOk,
    blockedBy,
  };
}

/**
 * วิเคราะห์แท่งเทียนแล้วคืน signal ถ้าเงื่อนไขครบ, หรือ null ถ้ายังไม่เข้าเงื่อนไข
 *
 * ตรรกะ:
 * 1) เทรนด์หลักดูจาก EMA50 เทียบ EMA200 (EMA50 > EMA200 = ขาขึ้น)
 * 2) จุดเข้าดูจาก RSI ที่เพิ่งย่อ (ขาขึ้น) หรือเด้ง (ขาลง) กลับมาตามเทรนด์ — เป็นการเข้าตอน pullback
 *    ไม่ใช่ไล่ราคาตอน breakout ซึ่งช่วยลด false signal ได้ในระดับหนึ่ง
 * 3) SL วางตาม ATR (ปรับตามความผันผวนจริงของคู่เงินนั้น) และ TP กำหนดตาม RR 1:2 ตายตัว
 */
export function generateSignal(candles: Candle[]): StrategySignal | null {
  if (candles.length < EMA_SLOW_PERIOD + 5) return null;

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const emaFastArr = ema(closes, EMA_FAST_PERIOD);
  const emaSlowArr = ema(closes, EMA_SLOW_PERIOD);
  const rsiArr = rsi(closes, RSI_PERIOD);
  const atrArr = atr(highs, lows, closes, ATR_PERIOD);
  const adxArr = adx(highs, lows, closes, ADX_PERIOD);

  const last = closes.length - 1;
  const prev = last - 1;

  const emaFastNow = emaFastArr[last];
  const emaSlowNow = emaSlowArr[last];
  const rsiNow = rsiArr[last];
  const rsiPrev = rsiArr[prev];
  const atrNow = atrArr[last];
  const adxNow = adxArr[last];
  const entryPrice = closes[last];
  const lastCandle = candles[last];

  if ([emaFastNow, emaSlowNow, rsiNow, rsiPrev, atrNow, adxNow].some((v) => Number.isNaN(v))) {
    return null;
  }

  // ต้องเทรนด์แรงพอ (ADX สูงกว่าเกณฑ์) ถึงจะพิจารณาเข้าไม้เลย — กรองตลาดแกว่งออกไปก่อน
  const trendIsStrong = adxNow > ADX_THRESHOLD;
  const isUptrend = emaFastNow > emaSlowNow && trendIsStrong;
  const isDowntrend = emaFastNow < emaSlowNow && trendIsStrong;

  // ยืนยันด้วยแท่งเทียนล่าสุด: แท่งต้องปิดไปในทิศทางเดียวกับเทรนด์ (ไม่ใช่แท่งกลับตัว)
  const bullishCandleConfirm = lastCandle.close > lastCandle.open;
  const bearishCandleConfirm = lastCandle.close < lastCandle.open;

  // ขาขึ้น: เทรนด์แรง + RSI เพิ่งดีดกลับจาก pullback + แท่งล่าสุดปิดเขียวยืนยัน
  const bullishPullback =
    isUptrend &&
    rsiPrev < RSI_PULLBACK_LOW &&
    rsiNow >= RSI_PULLBACK_LOW &&
    bullishCandleConfirm;

  // ขาลง: เทรนด์แรง + RSI เพิ่งร่วงกลับจาก pullback + แท่งล่าสุดปิดแดงยืนยัน
  const bearishPullback =
    isDowntrend &&
    rsiPrev > RSI_PULLBACK_HIGH &&
    rsiNow <= RSI_PULLBACK_HIGH &&
    bearishCandleConfirm;

  if (bullishPullback) {
    const stopLoss = entryPrice - ATR_SL_MULTIPLIER * atrNow;
    const riskDistance = entryPrice - stopLoss;
    const takeProfit = entryPrice + RISK_REWARD * riskDistance;
    return {
      direction: "BUY",
      entryPrice,
      stopLoss,
      takeProfit,
      rsi: rsiNow,
      atr: atrNow,
      adx: adxNow,
      emaFast: emaFastNow,
      emaSlow: emaSlowNow,
      reason: `เทรนด์ขึ้นแรง (EMA${EMA_FAST_PERIOD} > EMA${EMA_SLOW_PERIOD}, ADX ${adxNow.toFixed(
        1
      )}) และ RSI ดีดกลับขึ้นจาก ${rsiPrev.toFixed(
        1
      )} ผ่านโซน ${RSI_PULLBACK_LOW} พร้อมแท่งเทียนยืนยัน — เข้าซื้อตามเทรนด์หลัง pullback`,
    };
  }

  if (bearishPullback) {
    const stopLoss = entryPrice + ATR_SL_MULTIPLIER * atrNow;
    const riskDistance = stopLoss - entryPrice;
    const takeProfit = entryPrice - RISK_REWARD * riskDistance;
    return {
      direction: "SELL",
      entryPrice,
      stopLoss,
      takeProfit,
      rsi: rsiNow,
      atr: atrNow,
      adx: adxNow,
      emaFast: emaFastNow,
      emaSlow: emaSlowNow,
      reason: `เทรนด์ลงแรง (EMA${EMA_FAST_PERIOD} < EMA${EMA_SLOW_PERIOD}, ADX ${adxNow.toFixed(
        1
      )}) และ RSI ร่วงกลับลงจาก ${rsiPrev.toFixed(
        1
      )} ผ่านโซน ${RSI_PULLBACK_HIGH} พร้อมแท่งเทียนยืนยัน — เข้าขายตามเทรนด์หลัง pullback`,
    };
  }

  return null;
}
