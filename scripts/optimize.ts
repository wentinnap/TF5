/**
 * Parameter Optimizer — ลองทุกชุดค่าพารามิเตอร์ที่เป็นไปได้ แล้วบอกว่าชุดไหนให้ผลดีที่สุดจริง
 * (แทนที่จะเดาปรับทีละค่าแล้วทดสอบทีละรอบแบบ manual)
 *
 * รันด้วย: npx tsx scripts/optimize.ts EUR/USD
 * หรือ:    npx tsx scripts/optimize.ts EUR/USD 1h 2000
 */
import "dotenv/config";
import { fetchCandles, Candle } from "../lib/forexData";
import { ema, rsi, atr, adx } from "../lib/indicators";

const EMA_FAST_PERIOD = 50;
const EMA_SLOW_PERIOD = 200;
const RSI_PERIOD = 14;
const ATR_PERIOD = 14;
const ADX_PERIOD = 14;
const MIN_HISTORY = EMA_SLOW_PERIOD + 5;
const MIN_TRADES_FOR_RANKING = 15; // ต้องมีไม้อย่างน้อยเท่านี้ถึงจะเชื่อถือได้ทางสถิติ

type Params = {
  adxThreshold: number;
  rsiLow: number;
  rsiHigh: number;
  atrMult: number;
  rr: number;
  useSlopeFilter: boolean;
  useDistanceFilter: boolean;
};

type Result = Params & {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancy: number;
  totalR: number;
  maxDrawdown: number;
};

const SLOPE_LOOKBACK = 10;
const DISTANCE_ATR_MULT = 3;

function simulate(candles: Candle[], indicators: ReturnType<typeof computeIndicators>, params: Params): number[] {
  const { closes, emaFastArr, emaSlowArr, rsiArr, adxArr, atrArr } = indicators;
  const rMultiples: number[] = [];
  let i = MIN_HISTORY;

  while (i < candles.length - 1) {
    const emaFastNow = emaFastArr[i];
    const emaSlowNow = emaSlowArr[i];
    const emaSlowRef = emaSlowArr[i - SLOPE_LOOKBACK];
    const rsiNow = rsiArr[i];
    const rsiPrev = rsiArr[i - 1];
    const adxNow = adxArr[i];
    const atrNow = atrArr[i];
    const price = closes[i];
    const candle = candles[i];

    if ([emaFastNow, emaSlowNow, emaSlowRef, rsiNow, rsiPrev, adxNow, atrNow].some((v) => Number.isNaN(v))) {
      i++;
      continue;
    }

    const trend: "up" | "down" = emaFastNow > emaSlowNow ? "up" : "down";
    const adxOk = adxNow > params.adxThreshold;
    const slopeOk = !params.useSlopeFilter || (trend === "up" ? emaSlowNow > emaSlowRef : emaSlowNow < emaSlowRef);
    const distanceOk = !params.useDistanceFilter || Math.abs(price - emaFastNow) <= DISTANCE_ATR_MULT * atrNow;
    const pullbackOk =
      trend === "up"
        ? rsiPrev < params.rsiLow && rsiNow >= params.rsiLow
        : rsiPrev > params.rsiHigh && rsiNow <= params.rsiHigh;
    const candleConfirmOk = trend === "up" ? candle.close > candle.open : candle.close < candle.open;

    if (!(adxOk && slopeOk && distanceOk && pullbackOk && candleConfirmOk)) {
      i++;
      continue;
    }

    const direction = trend === "up" ? "BUY" : "SELL";
    const stopLoss = direction === "BUY" ? price - params.atrMult * atrNow : price + params.atrMult * atrNow;
    const riskDistance = Math.abs(price - stopLoss);
    const takeProfit = direction === "BUY" ? price + params.rr * riskDistance : price - params.rr * riskDistance;

    let outcome: "WIN" | "LOSS" | "OPEN" = "OPEN";
    let closeIndex = -1;
    for (let j = i + 1; j < candles.length; j++) {
      const c = candles[j];
      if (direction === "BUY") {
        if (c.low <= stopLoss) { outcome = "LOSS"; closeIndex = j; break; }
        if (c.high >= takeProfit) { outcome = "WIN"; closeIndex = j; break; }
      } else {
        if (c.high >= stopLoss) { outcome = "LOSS"; closeIndex = j; break; }
        if (c.low <= takeProfit) { outcome = "WIN"; closeIndex = j; break; }
      }
    }

    if (outcome !== "OPEN") {
      rMultiples.push(outcome === "WIN" ? params.rr : -1);
    }
    i = closeIndex >= 0 ? closeIndex + 1 : candles.length;
  }

  return rMultiples;
}

function computeIndicators(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  return {
    closes,
    emaFastArr: ema(closes, EMA_FAST_PERIOD),
    emaSlowArr: ema(closes, EMA_SLOW_PERIOD),
    rsiArr: rsi(closes, RSI_PERIOD),
    adxArr: adx(highs, lows, closes, ADX_PERIOD),
    atrArr: atr(highs, lows, closes, ATR_PERIOD),
  };
}

function evaluate(params: Params, rMultiples: number[]): Result {
  const wins = rMultiples.filter((r) => r > 0).length;
  const losses = rMultiples.filter((r) => r < 0).length;
  const trades = wins + losses;
  const winRate = trades > 0 ? (wins / trades) * 100 : 0;
  const expectancy = trades > 0 ? rMultiples.reduce((a, b) => a + b, 0) / trades : 0;

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const r of rMultiples) {
    cumulative += r;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  return {
    ...params,
    trades,
    wins,
    losses,
    winRate: Number(winRate.toFixed(1)),
    expectancy: Number(expectancy.toFixed(3)),
    totalR: Number(cumulative.toFixed(1)),
    maxDrawdown: Number(maxDrawdown.toFixed(1)),
  };
}

async function main() {
  const symbol = process.argv[2] ?? "EUR/USD";
  const interval = process.argv[3] ?? process.env.FOREX_INTERVAL ?? "1h";
  const outputsize = parseInt(process.argv[4] ?? "2000", 10);

  console.log(`กำลังดึงข้อมูล ${symbol} (TF ${interval}, ${outputsize} แท่ง)...`);
  const candles = await fetchCandles(symbol, interval, outputsize);
  console.log(`ได้ข้อมูล ${candles.length} แท่ง — เริ่มไล่ทดสอบพารามิเตอร์...\n`);

  if (candles.length < MIN_HISTORY + 10) {
    console.error("ข้อมูลย้อนหลังน้อยเกินไป");
    return;
  }

  const indicators = computeIndicators(candles);

  // ชุดค่าที่จะลอง — ปรับ range ตรงนี้ได้ถ้าอยากลองค่าอื่นเพิ่ม
  const adxThresholds = [15, 20, 25, 30];
  const rsiZones: [number, number][] = [[25, 75], [30, 70], [35, 65], [40, 60]];
  const atrMults = [1.0, 1.5, 2.0, 2.5];
  const rrs = [1.5, 2, 2.5, 3];
  const slopeOptions = [true, false];
  const distanceOptions = [true, false];

  const results: Result[] = [];
  let combosTested = 0;

  for (const adxThreshold of adxThresholds) {
    for (const [rsiLow, rsiHigh] of rsiZones) {
      for (const atrMult of atrMults) {
        for (const rr of rrs) {
          for (const useSlopeFilter of slopeOptions) {
            for (const useDistanceFilter of distanceOptions) {
              const params: Params = { adxThreshold, rsiLow, rsiHigh, atrMult, rr, useSlopeFilter, useDistanceFilter };
              const rMultiples = simulate(candles, indicators, params);
              results.push(evaluate(params, rMultiples));
              combosTested++;
            }
          }
        }
      }
    }
  }

  console.log(`ทดสอบทั้งหมด ${combosTested} ชุดพารามิเตอร์\n`);

  const reliable = results.filter((r) => r.trades >= MIN_TRADES_FOR_RANKING);
  const ranked = (reliable.length > 0 ? reliable : results).sort((a, b) => b.expectancy - a.expectancy);

  console.log(
    `===== TOP 10 พารามิเตอร์ที่ Expectancy ดีที่สุด (ต้องมีไม้ >= ${MIN_TRADES_FOR_RANKING} ถึงจะน่าเชื่อถือ) =====`
  );
  console.log(
    reliable.length === 0
      ? `⚠️ ไม่มีชุดไหนมีไม้ครบ ${MIN_TRADES_FOR_RANKING} เลย (ข้อมูลน้อยไป หรือเงื่อนไขเข้มไป) — โชว์ทุกชุดแทน\n`
      : ""
  );

  for (const r of ranked.slice(0, 10)) {
    console.log(
      `ADX>${r.adxThreshold} RSI[${r.rsiLow}/${r.rsiHigh}] ATR×${r.atrMult} RR1:${r.rr} slope=${r.useSlopeFilter} dist=${r.useDistanceFilter}` +
        ` → ไม้ ${r.trades} | Win ${r.winRate}% | Expectancy ${r.expectancy > 0 ? "+" : ""}${r.expectancy}R | รวม ${r.totalR}R | DD ${r.maxDrawdown}R`
    );
  }

  const best = ranked[0];
  if (best) {
    console.log(`\n===== สรุปชุดที่ดีที่สุด =====`);
    console.log(`ADX_THRESHOLD = ${best.adxThreshold}`);
    console.log(`RSI_PULLBACK_LOW / HIGH = ${best.rsiLow} / ${best.rsiHigh}`);
    console.log(`ATR_SL_MULTIPLIER = ${best.atrMult}`);
    console.log(`RISK_REWARD = ${best.rr}`);
    console.log(`ใช้ Slope Filter = ${best.useSlopeFilter}`);
    console.log(`ใช้ Distance Filter = ${best.useDistanceFilter}`);
    console.log(`→ Expectancy ${best.expectancy}R ต่อไม้ จาก ${best.trades} ไม้ (Win Rate ${best.winRate}%)`);
  }
}

main().catch((err) => {
  console.error("เกิดข้อผิดพลาด:", err.message);
  process.exit(1);
});
