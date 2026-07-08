/**
 * Parameter Sweep — ทดสอบหลายชุดค่าพารามิเตอร์อัตโนมัติ แทนการเดาทีละค่า
 * รันด้วย: npx tsx scripts/sweep.ts EUR/USD
 * หรือ: npx tsx scripts/sweep.ts XAU/USD 1h 2000
 */
import "dotenv/config";
import { fetchCandles, Candle } from "../lib/forexData";
import { generateSignal, StrategyParams, DEFAULT_PARAMS } from "../lib/strategy";

type SweepResult = {
  params: Partial<StrategyParams>;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancy: number;
  maxDrawdown: number;
  cumulativeR: number;
};

const MIN_HISTORY = 205;
const MIN_TRADES_FOR_SIGNIFICANCE = 15; // ตัดชุดที่มีไม้น้อยเกินไปทิ้ง (สถิติไม่น่าเชื่อถือ)

function simulate(candles: Candle[], params: StrategyParams): SweepResult {
  let i = MIN_HISTORY;
  const rMultiples: number[] = [];

  while (i < candles.length - 1) {
    const windowCandles = candles.slice(0, i + 1);
    const signal = generateSignal(windowCandles, params);

    if (!signal) {
      i++;
      continue;
    }

    let outcome: "WIN" | "LOSS" | "OPEN" = "OPEN";
    let closeIndex = -1;

    for (let j = i + 1; j < candles.length; j++) {
      const c = candles[j];
      if (signal.direction === "BUY") {
        if (c.low <= signal.stopLoss) {
          outcome = "LOSS";
          closeIndex = j;
          break;
        }
        if (c.high >= signal.takeProfit) {
          outcome = "WIN";
          closeIndex = j;
          break;
        }
      } else {
        if (c.high >= signal.stopLoss) {
          outcome = "LOSS";
          closeIndex = j;
          break;
        }
        if (c.low <= signal.takeProfit) {
          outcome = "WIN";
          closeIndex = j;
          break;
        }
      }
    }

    if (outcome !== "OPEN") {
      rMultiples.push(outcome === "WIN" ? params.riskReward : -1);
    }
    i = closeIndex >= 0 ? closeIndex + 1 : candles.length;
  }

  const wins = rMultiples.filter((r) => r > 0).length;
  const losses = rMultiples.filter((r) => r < 0).length;
  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) * 100 : 0;
  const expectancy = total > 0 ? rMultiples.reduce((a, b) => a + b, 0) / total : 0;

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const r of rMultiples) {
    cumulative += r;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  return {
    params: {},
    totalTrades: total,
    wins,
    losses,
    winRate,
    expectancy,
    maxDrawdown,
    cumulativeR: cumulative,
  };
}

async function main() {
  const symbol = process.argv[2] ?? "EUR/USD";
  const interval = process.argv[3] ?? process.env.FOREX_INTERVAL ?? "1h";
  const outputsize = parseInt(process.argv[4] ?? "2000", 10);

  console.log(`กำลังดึงข้อมูลย้อนหลัง ${outputsize} แท่งของ ${symbol} (TF ${interval})...`);
  const candles = await fetchCandles(symbol, interval, outputsize);
  console.log(`ได้ข้อมูล ${candles.length} แท่ง — เริ่มทดสอบหลายชุดพารามิเตอร์...\n`);

  // ชุดค่าที่จะลอง — ปรับ/เพิ่มช่วงค่าตรงนี้ได้ตามต้องการ
  const adxThresholds = [20, 25, 30];
  const rsiZones: [number, number][] = [
    [30, 70],
    [35, 65],
    [40, 60],
    [45, 55],
  ];
  const atrMultipliers = [1.0, 1.5, 2.0, 2.5];
  const slopeLookbacks = [0, 10]; // 0 = ปิดตัวกรองเทรนด์ยั่งยืน, 10 = เปิดใช้
  const riskRewards = [1.5, 2, 3];

  const results: SweepResult[] = [];
  let combosTested = 0;

  for (const adxThreshold of adxThresholds) {
    for (const [rsiPullbackLow, rsiPullbackHigh] of rsiZones) {
      for (const atrSlMultiplier of atrMultipliers) {
        for (const emaSlopeLookback of slopeLookbacks) {
          for (const riskReward of riskRewards) {
            const params: StrategyParams = {
              ...DEFAULT_PARAMS,
              adxThreshold,
              rsiPullbackLow,
              rsiPullbackHigh,
              atrSlMultiplier,
              emaSlopeLookback,
              riskReward,
            };
            const result = simulate(candles, params);
            result.params = { adxThreshold, rsiPullbackLow, rsiPullbackHigh, atrSlMultiplier, emaSlopeLookback, riskReward };
            results.push(result);
            combosTested++;
          }
        }
      }
    }
  }

  console.log(`ทดสอบทั้งหมด ${combosTested} ชุดพารามิเตอร์`);

  const significant = results.filter((r) => r.totalTrades >= MIN_TRADES_FOR_SIGNIFICANCE);
  console.log(
    `ชุดที่มีจำนวนไม้ >= ${MIN_TRADES_FOR_SIGNIFICANCE} ไม้ (พอเชื่อถือทางสถิติได้): ${significant.length} ชุด\n`
  );

  const sorted = significant.sort((a, b) => b.expectancy - a.expectancy);
  const top10 = sorted.slice(0, 10);

  console.log(`===== ${symbol} (TF ${interval}) — 10 ชุดพารามิเตอร์ที่ดีที่สุด (เรียงตาม Expectancy) =====\n`);
  top10.forEach((r, idx) => {
    console.log(
      `${idx + 1}. ADX>${r.params.adxThreshold} | RSI ${r.params.rsiPullbackLow}/${r.params.rsiPullbackHigh} | ATR×${r.params.atrSlMultiplier} | SlopeFilter=${r.params.emaSlopeLookback! > 0 ? "เปิด" : "ปิด"} | RR 1:${r.params.riskReward}`
    );
    console.log(
      `   Trades: ${r.totalTrades} | Win Rate: ${r.winRate.toFixed(1)}% | Expectancy: ${r.expectancy.toFixed(
        2
      )}R | MaxDD: ${r.maxDrawdown.toFixed(1)}R | สะสม: ${r.cumulativeR.toFixed(1)}R\n`
    );
  });

  if (top10.length === 0) {
    console.log("ไม่มีชุดพารามิเตอร์ไหนมีจำนวนไม้พอให้เชื่อถือได้เลย — ลองเพิ่ม outputsize ให้มีข้อมูลย้อนหลังมากขึ้น");
  } else {
    const best = top10[0];
    console.log("===== สรุป: ชุดที่ดีที่สุด =====");
    console.log(JSON.stringify(best.params, null, 2));
  }
}

main().catch((err) => {
  console.error("เกิดข้อผิดพลาด:", err.message);
  process.exit(1);
});
