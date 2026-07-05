// รวมฟังก์ชันคำนวณ indicator พื้นฐานที่ใช้ในกลยุทธ์
// ทุกฟังก์ชันรับ array เรียงจาก "เก่าสุด -> ใหม่สุด" และคืน array ความยาวเท่าเดิม
// (ช่วงต้นที่คำนวณยังไม่ได้จะเป็น NaN)

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = new Array(values.length).fill(NaN);
  let prev: number | null = null;

  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      // ใช้ค่าเฉลี่ยธรรมดาของ period แรกเป็นจุดเริ่มต้น
      const slice = values.slice(0, period);
      prev = slice.reduce((a, b) => a + b, 0) / period;
      result[i] = prev;
    } else if (i >= period && prev !== null) {
      prev = values[i] * k + prev * (1 - k);
      result[i] = prev;
    }
  }
  return result;
}

export function rsi(closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

/**
 * ADX (Average Directional Index) — วัด "ความแรง" ของเทรนด์ (ไม่บอกทิศทาง)
 * ค่า > 25 มักถือว่าเทรนด์กำลังชัดเจน / < 20 คือตลาดแกว่ง (sideway)
 * ใช้เป็นตัวกรองไม่ให้เข้าไม้ตอนตลาดไม่มีทิศทางชัด ซึ่งเป็นสาเหตุหลักของ false signal
 */
export function adx(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const len = highs.length;
  const plusDM: number[] = new Array(len).fill(0);
  const minusDM: number[] = new Array(len).fill(0);
  const tr: number[] = new Array(len).fill(0);

  for (let i = 1; i < len; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }

  const result: number[] = new Array(len).fill(NaN);
  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  const dxValues: number[] = new Array(len).fill(NaN);

  for (let i = 1; i <= period; i++) {
    smoothTR += tr[i];
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
  }

  for (let i = period; i < len; i++) {
    if (i > period) {
      smoothTR = smoothTR - smoothTR / period + tr[i];
      smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
      smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
    }
    const plusDI = (smoothPlusDM / smoothTR) * 100;
    const minusDI = (smoothMinusDM / smoothTR) * 100;
    const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;
    dxValues[i] = dx;
  }

  // ADX = ค่าเฉลี่ยเคลื่อนที่ (Wilder) ของ DX
  let prevAdx: number | null = null;
  let dxSum = 0;
  let dxCount = 0;
  for (let i = period; i < len; i++) {
    if (Number.isNaN(dxValues[i])) continue;
    if (dxCount < period) {
      dxSum += dxValues[i];
      dxCount++;
      if (dxCount === period) {
        prevAdx = dxSum / period;
        result[i] = prevAdx;
      }
    } else if (prevAdx !== null) {
      prevAdx = (prevAdx * (period - 1) + dxValues[i]) / period;
      result[i] = prevAdx;
    }
  }
  return result;
}

export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number[] {
  const trueRanges: number[] = [];
  for (let i = 0; i < highs.length; i++) {
    if (i === 0) {
      trueRanges.push(highs[i] - lows[i]);
      continue;
    }
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  // ATR = ค่าเฉลี่ยเคลื่อนที่ (Wilder smoothing) ของ True Range
  const result: number[] = new Array(closes.length).fill(NaN);
  let prevAtr: number | null = null;
  for (let i = 0; i < trueRanges.length; i++) {
    if (i === period - 1) {
      const slice = trueRanges.slice(0, period);
      prevAtr = slice.reduce((a, b) => a + b, 0) / period;
      result[i] = prevAtr;
    } else if (i >= period && prevAtr !== null) {
      prevAtr = (prevAtr * (period - 1) + trueRanges[i]) / period;
      result[i] = prevAtr;
    }
  }
  return result;
}
