/**
 * Backtest script — ทดสอบกลยุทธ์ย้อนหลังด้วย generateSignal ตัวเดียวกับที่ระบบจริงใช้
 * รันด้วย: npx tsx scripts/backtest.ts EUR/USD
 * หรือระบุ interval/outputsize เอง: npx tsx scripts/backtest.ts EUR/USD 4h 3000
 */
import "dotenv/config";
import { fetchCandles, Candle } from "../lib/forexData";
import { generateSignal, StrategySignal } from "../lib/strategy";
import { formatPrice } from "../lib/format";

type TradeResult = {
  entryTime: string;
  closeTime: string | null;
  symbol: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  outcome: "WIN" | "LOSS" | "OPEN"; // OPEN = ข้อมูลย้อนหลังหมดก่อนราคาชน TP/SL
  rMultiple: number; // WIN = +2R, LOSS = -1R (ตาม RR 1:2), OPEN = ไม่นับ
};

const MIN_HISTORY = 205; // ต้องมีข้อมูลอย่างน้อยเท่านี้ก่อนเริ่มเช็ค (พอสำหรับ EMA200)

function simulateTrades(symbol: string, candles: Candle[]): TradeResult[] {
  const trades: TradeResult[] = [];
  let i = MIN_HISTORY;

  while (i < candles.length - 1) {
    // จำลองว่า ณ แท่งที่ i คือ "ปัจจุบัน" แล้วเรียกกลยุทธ์เดียวกับระบบจริง
    const windowCandles = candles.slice(0, i + 1);
    const signal: StrategySignal | null = generateSignal(windowCandles);

    if (!signal) {
      i++;
      continue;
    }

    // ไล่หาแท่งถัดไปที่ราคาชน SL หรือ TP — เช็ค SL ก่อนเสมอเพื่อไม่ให้ผลดูดีเกินจริง
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

    trades.push({
      entryTime: candles[i].time,
      closeTime: closeIndex >= 0 ? candles[closeIndex].time : null,
      symbol,
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      outcome,
      rMultiple: outcome === "WIN" ? 2 : outcome === "LOSS" ? -1 : 0,
    });

    // ข้ามไปหลังไม้นี้ปิดแล้ว (ไม่ให้ไม้ซ้อนกัน) ถ้ายังไม่ปิดเลยจนจบข้อมูล ก็จบการวนลูป
    i = closeIndex >= 0 ? closeIndex + 1 : candles.length;
  }

  return trades;
}

function printReport(symbol: string, trades: TradeResult[]) {
  const closed = trades.filter((t) => t.outcome !== "OPEN");
  const wins = closed.filter((t) => t.outcome === "WIN").length;
  const losses = closed.filter((t) => t.outcome === "LOSS").length;
  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) * 100 : 0;
  const expectancy = total > 0 ? closed.reduce((sum, t) => sum + t.rMultiple, 0) / total : 0;

  // คำนวณ max drawdown (หน่วย R) จาก equity curve สะสม
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const t of closed) {
    cumulative += t.rMultiple;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  console.log(`\n===== ผลทดสอบย้อนหลัง: ${symbol} =====`);
  console.log(`จำนวนไม้ทั้งหมดที่ปิดแล้ว: ${total} (เปิดค้าง/ข้อมูลไม่พอ: ${trades.length - total})`);
  console.log(`ชนะ: ${wins} | แพ้: ${losses}`);
  console.log(`Win Rate: ${winRate.toFixed(1)}%`);
  console.log(`Expectancy: ${expectancy.toFixed(2)}R ต่อไม้`);
  console.log(`Max Drawdown: ${maxDrawdown.toFixed(1)}R`);
  console.log(`ผลรวมสะสม: ${cumulative.toFixed(1)}R`);

  console.log(`\nรายละเอียด 10 ไม้ล่าสุด:`);
  for (const t of closed.slice(-10)) {
    console.log(
      `  ${t.entryTime} ${t.direction} @ ${formatPrice(symbol, t.entryPrice)} → ${t.outcome} (${t.rMultiple > 0 ? "+" : ""}${t.rMultiple}R) ปิด ${t.closeTime}`
    );
  }
}

async function main() {
  const symbol = process.argv[2] ?? "EUR/USD";
  const interval = process.argv[3] ?? process.env.FOREX_INTERVAL ?? "1h";
  const outputsize = parseInt(process.argv[4] ?? "2000", 10);

  console.log(`กำลังดึงข้อมูลย้อนหลัง ${outputsize} แท่งของ ${symbol} (TF ${interval})...`);
  const candles = await fetchCandles(symbol, interval, outputsize);
  console.log(`ได้ข้อมูล ${candles.length} แท่ง ตั้งแต่ ${candles[0]?.time} ถึง ${candles[candles.length - 1]?.time}`);

  if (candles.length < MIN_HISTORY + 10) {
    console.error("ข้อมูลย้อนหลังน้อยเกินไป ลองเพิ่ม outputsize หรือเปลี่ยน TF");
    return;
  }

  const trades = simulateTrades(symbol, candles);
  printReport(symbol, trades);
}

main().catch((err) => {
  console.error("เกิดข้อผิดพลาด:", err.message);
  process.exit(1);
});

