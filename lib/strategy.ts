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
const ATR_SL_MULTIPLIER = 2.0; // ระยะ SL = 2.0 เท่าของ ATR (กว้างขึ้นจากเดิม 1.5 กันโดนสะบัดออกจาก noise ปกติ)
const RISK_REWARD = 2; // TP = 2 เท่าของระยะ SL (RR 1:2)
const RSI_PULLBACK_LOW = 35; // ขาขึ้น: รอ RSI ย่อลงต่ำกว่านี้แล้วดีดกลับ (เข้มขึ้นจากเดิม 40 ให้ pullback ลึกจริง)
const RSI_PULLBACK_HIGH = 65; // ขาลง: รอ RSI ขึ้นเกินนี้แล้วร่วงกลับ (เข้มขึ้นจากเดิม 60)
const ADX_PERIOD = 14;
const ADX_THRESHOLD = 30; // เข้มขึ้นจากเดิม 25 ต้องเทรนด์แรงจริงๆ ถึงเข้า
const EMA_SLOPE_LOOKBACK = 10; // ใช้เช็คว่า EMA200 มีความชันต่อเนื่องมากี่แท่ง (ยืนยันว่าเทรนด์ยั่งยืน ไม่ใช่เพิ่งตัดกัน)
const MAX_DISTANCE_FROM_EMA_ATR = 3; // ถ้าราคาห่างจาก EMA50 เกินกี่เท่าของ ATR ถือว่า "ไล่ราคา" เกินไป ไม่เข้า

export type Diagnosis = {
  hasEnoughData: boolean;
  price?: number;
  trend?: "up" | "down";
  emaFast?: number;
  emaSlow?: number;
  adx?: number;
  adxOk?: boolean;
  slopeOk?: boolean;
  distanceOk?: boolean;
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
  const atrArr = atr(highs, lows, closes, ATR_PERIOD);

  const last = closes.length - 1;
  const prev = last - 1;
  const slopeRef = last - EMA_SLOPE_LOOKBACK;

  const emaFastNow = emaFastArr[last];
  const emaSlowNow = emaSlowArr[last];
  const emaSlowRef = emaSlowArr[slopeRef];
  const rsiNow = rsiArr[last];
  const rsiPrev = rsiArr[prev];
  const adxNow = adxArr[last];
  const atrNow = atrArr[last];
  const entryPriceNow = closes[last];
  const lastCandle = candles[last];

  if ([emaFastNow, emaSlowNow, emaSlowRef, rsiNow, rsiPrev, adxNow, atrNow].some((v) => Number.isNaN(v))) {
    return { hasEnoughData: false };
  }

  const trend: "up" | "down" = emaFastNow > emaSlowNow ? "up" : "down";
  const adxOk = adxNow > ADX_THRESHOLD;

  // เทรนด์ต้องยั่งยืนจริง: EMA200 ต้องมีความชันไปทางเดียวกับเทรนด์ต่อเนื่องมาหลายแท่ง
  const slopeOk = trend === "up" ? emaSlowNow > emaSlowRef : emaSlowNow < emaSlowRef;

  // ไม่ไล่ราคา: ราคาต้องไม่ห่างจาก EMA50 เกินไป (ป้องกันเข้าตอนท้ายเทรนด์)
  const distanceOk = Math.abs(entryPriceNow - emaFastNow) <= MAX_DISTANCE_FROM_EMA_ATR * atrNow;

  const pullbackOk =
    trend === "up"
      ? rsiPrev < RSI_PULLBACK_LOW && rsiNow >= RSI_PULLBACK_LOW
      : rsiPrev > RSI_PULLBACK_HIGH && rsiNow <= RSI_PULLBACK_HIGH;

  const candleConfirmOk = trend === "up" ? lastCandle.close > lastCandle.open : lastCandle.close < lastCandle.open;

  const blockedBy: string[] = [];
  if (!adxOk) blockedBy.push(`ADX ${adxNow.toFixed(1)} ยังไม่เกิน ${ADX_THRESHOLD} (เทรนด์ยังไม่แรงพอ)`);
  if (!slopeOk) blockedBy.push(`EMA${EMA_SLOW_PERIOD} ยังไม่มีความชันต่อเนื่องตามเทรนด์ (อาจเพิ่งตัดกันไม่นาน)`);
  if (!distanceOk) blockedBy.push(`ราคาห่างจาก EMA${EMA_FAST_PERIOD} เกิน ${MAX_DISTANCE_FROM_EMA_ATR}xATR แล้ว (ไล่ราคาเกินไป)`);
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
    slopeOk,
    distanceOk,
    rsi: rsiNow,
    rsiPrev,
    pullbackOk,
    candleConfirmOk,
    wouldSignal: adxOk && slopeOk && distanceOk && pullbackOk && candleConfirmOk,
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
  const diagnosis = diagnoseConditions(candles);
  if (!diagnosis.hasEnoughData || !diagnosis.wouldSignal) return null;

  const { trend, adx: adxNow, rsi: rsiNow, rsiPrev, emaFast, emaSlow } = diagnosis;
  const price = diagnosis.price!;

  // คำนวณ ATR ใหม่อีกครั้งสำหรับ SL/TP (diagnoseConditions ไม่ได้ส่ง atr ออกมาโดยตรง)
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const atrArr = atr(highs, lows, closes, ATR_PERIOD);
  const atrNow = atrArr[closes.length - 1];

  if (trend === "up") {
    const stopLoss = price - ATR_SL_MULTIPLIER * atrNow;
    const riskDistance = price - stopLoss;
    const takeProfit = price + RISK_REWARD * riskDistance;
    return {
      direction: "BUY",
      entryPrice: price,
      stopLoss,
      takeProfit,
      rsi: rsiNow!,
      atr: atrNow,
      adx: adxNow!,
      emaFast: emaFast!,
      emaSlow: emaSlow!,
      reason: `เทรนด์ขึ้นแรงและยั่งยืน (ADX ${adxNow!.toFixed(1)}) RSI ดีดกลับจาก ${rsiPrev!.toFixed(
        1
      )} ผ่านโซน ${RSI_PULLBACK_LOW} พร้อมแท่งเทียนยืนยัน ไม่ไล่ราคา — เข้าซื้อตามเทรนด์หลัง pullback`,
    };
  } else {
    const stopLoss = price + ATR_SL_MULTIPLIER * atrNow;
    const riskDistance = stopLoss - price;
    const takeProfit = price - RISK_REWARD * riskDistance;
    return {
      direction: "SELL",
      entryPrice: price,
      stopLoss,
      takeProfit,
      rsi: rsiNow!,
      atr: atrNow,
      adx: adxNow!,
      emaFast: emaFast!,
      emaSlow: emaSlow!,
      reason: `เทรนด์ลงแรงและยั่งยืน (ADX ${adxNow!.toFixed(1)}) RSI ร่วงกลับจาก ${rsiPrev!.toFixed(
        1
      )} ผ่านโซน ${RSI_PULLBACK_HIGH} พร้อมแท่งเทียนยืนยัน ไม่ไล่ราคา — เข้าขายตามเทรนด์หลัง pullback`,
    };
  }
}
