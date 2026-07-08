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

export type StrategyParams = {
  emaFastPeriod: number;
  emaSlowPeriod: number;
  rsiPeriod: number;
  atrPeriod: number;
  atrSlMultiplier: number; // ระยะ SL = กี่เท่าของ ATR
  riskReward: number; // TP = กี่เท่าของระยะ SL
  rsiPullbackLow: number; // ขาขึ้น: รอ RSI ย่อลงต่ำกว่านี้แล้วดีดกลับ
  rsiPullbackHigh: number; // ขาลง: รอ RSI ขึ้นเกินนี้แล้วร่วงกลับ
  adxPeriod: number;
  adxThreshold: number; // ต้องเทรนด์แรงเกินนี้ถึงเข้า
  emaSlopeLookback: number; // เช็คว่า EMA slow มีความชันต่อเนื่องมากี่แท่ง (0 = ปิดตัวกรองนี้)
  maxDistanceFromEmaAtr: number; // ราคาห่างจาก EMA fast ได้ไม่เกินกี่เท่าของ ATR (Infinity = ปิดตัวกรองนี้)
};

// ค่าเริ่มต้น — ใช้ได้กับ generateSignal/diagnoseConditions ถ้าไม่ระบุ params เอง
// ปรับค่าพวกนี้ได้จากผลของ scripts/sweep.ts (ทดสอบหลายชุดค่าจริงแล้วเลือกที่ดีที่สุด)
export const DEFAULT_PARAMS: StrategyParams = {
  emaFastPeriod: 50,
  emaSlowPeriod: 200,
  rsiPeriod: 14,
  atrPeriod: 14,
  atrSlMultiplier: 1.5,
  riskReward: 2,
  rsiPullbackLow: 40,
  rsiPullbackHigh: 60,
  adxPeriod: 14,
  adxThreshold: 25,
  emaSlopeLookback: 0, // ปิดไว้เป็นค่าเริ่มต้น (ทดสอบแล้วพบว่าอาจทำให้เข้าช้าเกินไป)
  maxDistanceFromEmaAtr: Infinity, // ปิดไว้เป็นค่าเริ่มต้น
};

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
  pullbackOk?: boolean;
  candleConfirmOk?: boolean;
  wouldSignal?: boolean;
  blockedBy?: string[];
};

/**
 * ตรวจสอบทีละเงื่อนไขว่าคู่เงินนี้ผ่าน/ไม่ผ่านอะไรบ้าง โดยไม่สร้าง signal จริง
 * ใช้สำหรับหน้า debug ("ทำไมยังไม่มี signal") และเป็นแกนกลางให้ generateSignal เรียกใช้ต่อ
 */
export function diagnoseConditions(candles: Candle[], params: StrategyParams = DEFAULT_PARAMS): Diagnosis {
  const p = params;
  if (candles.length < p.emaSlowPeriod + p.emaSlopeLookback + 5) {
    return { hasEnoughData: false };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const emaFastArr = ema(closes, p.emaFastPeriod);
  const emaSlowArr = ema(closes, p.emaSlowPeriod);
  const rsiArr = rsi(closes, p.rsiPeriod);
  const adxArr = adx(highs, lows, closes, p.adxPeriod);
  const atrArr = atr(highs, lows, closes, p.atrPeriod);

  const last = closes.length - 1;
  const prev = last - 1;
  const slopeRef = last - p.emaSlopeLookback;

  const emaFastNow = emaFastArr[last];
  const emaSlowNow = emaSlowArr[last];
  const emaSlowRef = p.emaSlopeLookback > 0 ? emaSlowArr[slopeRef] : emaSlowNow;
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
  const adxOk = adxNow > p.adxThreshold;

  // เทรนด์ต้องยั่งยืนจริง (ถ้าเปิดใช้ตัวกรองนี้): EMA slow ต้องมีความชันไปทางเดียวกับเทรนด์
  const slopeOk = p.emaSlopeLookback <= 0 ? true : trend === "up" ? emaSlowNow > emaSlowRef : emaSlowNow < emaSlowRef;

  // ไม่ไล่ราคา (ถ้าเปิดใช้ตัวกรองนี้): ราคาต้องไม่ห่างจาก EMA fast เกินไป
  const distanceOk =
    !Number.isFinite(p.maxDistanceFromEmaAtr) || Math.abs(entryPriceNow - emaFastNow) <= p.maxDistanceFromEmaAtr * atrNow;

  const pullbackOk =
    trend === "up"
      ? rsiPrev < p.rsiPullbackLow && rsiNow >= p.rsiPullbackLow
      : rsiPrev > p.rsiPullbackHigh && rsiNow <= p.rsiPullbackHigh;

  const candleConfirmOk = trend === "up" ? lastCandle.close > lastCandle.open : lastCandle.close < lastCandle.open;

  const blockedBy: string[] = [];
  if (!adxOk) blockedBy.push(`ADX ${adxNow.toFixed(1)} ยังไม่เกิน ${p.adxThreshold} (เทรนด์ยังไม่แรงพอ)`);
  if (!slopeOk) blockedBy.push(`EMA${p.emaSlowPeriod} ยังไม่มีความชันต่อเนื่องตามเทรนด์`);
  if (!distanceOk) blockedBy.push(`ราคาห่างจาก EMA${p.emaFastPeriod} เกิน ${p.maxDistanceFromEmaAtr}xATR แล้ว`);
  if (!pullbackOk)
    blockedBy.push(
      trend === "up"
        ? `RSI ยังไม่เพิ่งย่อ+ดีดกลับผ่านโซน ${p.rsiPullbackLow} (ตอนนี้ ${rsiNow.toFixed(1)})`
        : `RSI ยังไม่เพิ่งเด้ง+ร่วงกลับผ่านโซน ${p.rsiPullbackHigh} (ตอนนี้ ${rsiNow.toFixed(1)})`
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
 * ใช้ diagnoseConditions เป็นแกนกลาง เพื่อให้ backtest/diagnose/signal จริงตรงกันเป๊ะเสมอ
 */
export function generateSignal(candles: Candle[], params: StrategyParams = DEFAULT_PARAMS): StrategySignal | null {
  const p = params;
  const diagnosis = diagnoseConditions(candles, p);
  if (!diagnosis.hasEnoughData || !diagnosis.wouldSignal) return null;

  const { trend, adx: adxNow, rsi: rsiNow, rsiPrev, emaFast, emaSlow } = diagnosis;
  const price = diagnosis.price!;

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const atrArr = atr(highs, lows, closes, p.atrPeriod);
  const atrNow = atrArr[closes.length - 1];

  if (trend === "up") {
    const stopLoss = price - p.atrSlMultiplier * atrNow;
    const riskDistance = price - stopLoss;
    const takeProfit = price + p.riskReward * riskDistance;
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
      reason: `เทรนด์ขึ้นแรง (ADX ${adxNow!.toFixed(1)}) RSI ดีดกลับจาก ${rsiPrev!.toFixed(
        1
      )} ผ่านโซน ${p.rsiPullbackLow} พร้อมแท่งเทียนยืนยัน — เข้าซื้อตามเทรนด์หลัง pullback`,
    };
  } else {
    const stopLoss = price + p.atrSlMultiplier * atrNow;
    const riskDistance = stopLoss - price;
    const takeProfit = price - p.riskReward * riskDistance;
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
      reason: `เทรนด์ลงแรง (ADX ${adxNow!.toFixed(1)}) RSI ร่วงกลับจาก ${rsiPrev!.toFixed(
        1
      )} ผ่านโซน ${p.rsiPullbackHigh} พร้อมแท่งเทียนยืนยัน — เข้าขายตามเทรนด์หลัง pullback`,
    };
  }
}
