# Forex Signal Desk

ระบบวิเคราะห์เทรนด์ Forex หาจุดเข้า-ออก (Trend-following + RSI Pullback, RR 1:2), เก็บสถิติ,
และแจ้งเตือนทางอีเมลอัตโนมัติ — สร้างด้วย Next.js 14 + Prisma + Postgres (Supabase)

> ⚠️ **สำคัญ**: กลยุทธ์นี้ยังไม่ได้ผ่านการ backtest จริงจากผม อัตราชนะ 70% ที่ตั้งเป็นเป้าหมาย
> ต้องพิสูจน์ด้วยการทดสอบย้อนหลัง (backtest) และเทรดกระดาษ (paper trade) อย่างน้อย 1-2 เดือน
> ก่อนใช้เงินจริง ห้ามใช้เงินจริงทันทีโดยไม่ทดสอบ

---

## 1. โครงสร้างระบบ

```
├── lib/
│   ├── indicators.ts   → คำนวณ EMA, RSI, ATR, ADX
│   ├── forexData.ts    → ดึงราคาจาก Twelve Data API
│   ├── strategy.ts     → ตรรกะ entry/exit (แก้พารามิเตอร์ตรงนี้ได้)
│   ├── email.ts        → ส่งอีเมลแจ้งเตือนผ่าน Resend
│   └── db.ts           → Prisma client
├── app/
│   ├── api/scan/        → cron: หา signal ใหม่ (จำกัด 1-2 ไม้/วัน)
│   ├── api/monitor/      → cron: เช็คว่าราคาชน TP/SL หรือยัง
│   ├── api/stats/        → คืนสถิติ win rate, equity curve
│   ├── page.tsx          → หน้าแรก แสดงสัญญาณที่เปิดอยู่
│   └── dashboard/page.tsx → หน้าสถิติ + กราฟ equity curve
├── prisma/schema.prisma → ตาราง Signal เก็บทุกออเดอร์และผลลัพธ์
└── .github/workflows/cron.yml → ยิง cron ทุกชั่วโมงฟรีผ่าน GitHub Actions
```

**หลักการทำงาน:** วันละครั้ง GitHub Actions จะยิง `/api/scan` → ดึงราคาแท่ง**รายวัน** (TF ยาว)
ของแต่ละคู่เงิน → คำนวณ EMA/RSI/ATR/**ADX** → เข้าเงื่อนไขก็ต่อเมื่อ (1) เทรนด์ชัด (EMA50/200 ตัดกัน)
(2) **ADX > 25** ยืนยันว่าเทรนด์แรงจริง ไม่ใช่ตลาดแกว่ง (3) RSI เพิ่งย่อ/เด้งกลับจาก pullback
(4) แท่งเทียนล่าสุดปิดยืนยันทิศทาง — ครบทั้ง 4 เงื่อนไขถึงจะบันทึกลง DB และส่งอีเมลทันที
โดยเช็คโควต้า 1-2 signal/วันก่อนทุกครั้ง

อีก workflow หนึ่งยิง `/api/monitor` ทุก 30 นาทีเพื่อเช็คว่าออเดอร์ที่เปิดอยู่ชน TP หรือ SL แล้วหรือยัง
พอชนปุ๊บจะอัปเดตสถานะเป็น WIN/LOSS **และส่งอีเมลแจ้งผลทันที** พร้อมสรุป win rate สะสม ณ ตอนนั้น
ไปคำนวณกราฟ equity curve ให้อัตโนมัติที่หน้า `/dashboard`

---

## 2. เตรียม Service ฟรีทั้งหมด (ทำครั้งเดียว)

### 2.1 Supabase (ฐานข้อมูล Postgres)
1. สมัครที่ https://supabase.com → สร้าง New Project (จำรหัสผ่าน database ที่ตั้งไว้)
2. ไปที่ **Project Settings → Database**
3. คัดลอก **Connection string** สองแบบ:
   - "Connection pooling" (พอร์ต 6543) → ใช้เป็น `DATABASE_URL`
   - "Direct connection" (พอร์ต 5432) → ใช้เป็น `DIRECT_URL`

### 2.2 Twelve Data (ข้อมูลราคา Forex)
1. สมัครฟรีที่ https://twelvedata.com → หน้า Dashboard จะมี API Key ให้ทันที
2. Free tier: 800 requests/วัน, 8 requests/นาที — สแกน 4 คู่เงินทุกชั่วโมง (96 requests/วัน) สบายมาก

### 2.3 Resend (ส่งอีเมล)
1. สมัครฟรีที่ https://resend.com
2. ถ้ายังไม่มีโดเมนของตัวเอง ใช้ domain ทดสอบ `onboarding@resend.dev` เป็น `ALERT_EMAIL_FROM`
   ได้เลย (จำกัดส่งได้เฉพาะอีเมลที่ยืนยันตัวตนกับบัญชี Resend) หรือผูกโดเมนตัวเองภายหลังก็ได้
3. คัดลอก API Key จากหน้า **API Keys**

---

## 3. รันทดสอบในเครื่องตัวเอง

```bash
# ติดตั้ง dependencies
npm install

# คัดลอกไฟล์ env แล้วกรอกค่าจริงตามข้อ 2
cp .env.example .env

# สร้างตารางในฐานข้อมูลจริงตาม schema.prisma
npx prisma db push

# รัน dev server
npm run dev
```

เปิด http://localhost:3000 จะเห็นหน้าสัญญาณ (ว่างเปล่าตอนแรกเพราะยังไม่มี signal)

**ทดสอบสแกนด้วยมือ** (จำลอง cron):
```bash
curl http://localhost:3000/api/scan -H "Authorization: Bearer <CRON_SECRET ที่ตั้งใน .env>"
```
ถ้าเงื่อนไขกลยุทธ์ตรง จะเห็น signal ใหม่ที่หน้าแรกและได้รับอีเมล

---

## 4. Deploy ขึ้น Vercel

1. Push โค้ดขึ้น GitHub repo ของตัวเอง
2. เข้า https://vercel.com → **Add New Project** → เลือก repo นี้
3. ก่อนกด Deploy ให้ตั้งค่า **Environment Variables** (ใส่ทุกตัวจาก `.env.example` ด้วยค่าจริง):
   `DATABASE_URL`, `DIRECT_URL`, `TWELVE_DATA_API_KEY`, `RESEND_API_KEY`,
   `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`, `CRON_SECRET`, `FOREX_SYMBOLS`, `MAX_SIGNALS_PER_DAY`
4. กด **Deploy** — Vercel จะรัน `npm run build` ซึ่งรวม `prisma generate` ให้อัตโนมัติ
5. หลัง deploy สำเร็จ จะได้ URL เช่น `https://forex-signal-app.vercel.app`

**สร้างตารางในฐานข้อมูล production** (รันครั้งเดียวจากเครื่องตัวเอง โดยชี้ไปที่ Supabase จริง
ซึ่งก็คือฐานข้อมูลเดียวกับที่ทดสอบไปแล้วในข้อ 3 — ถ้าทำข้อ 3 ไปแล้วข้ามขั้นตอนนี้ได้เลย)

---

## 5. ตั้งค่า Cron ให้ยิงอัตโนมัติ (ใช้ GitHub Actions ฟรี)

ทำไมไม่ใช้ Vercel Cron? แผนฟรีของ Vercel จำกัดความถี่ของ cron ค่อนข้างมาก
GitHub Actions ฟรีและยืดหยุ่นกว่าสำหรับเคสนี้

1. ไปที่ repo บน GitHub → **Settings → Secrets and variables → Actions**
2. เพิ่ม secrets 2 ตัว:
   - `APP_URL` = URL ของแอปที่ deploy แล้ว (เช่น `https://forex-signal-app.vercel.app`)
   - `CRON_SECRET` = ค่าเดียวกับที่ตั้งใน Environment Variables ของ Vercel
3. ไฟล์ `.github/workflows/cron.yml` ที่ให้มาจะเริ่มทำงานอัตโนมัติทันทีที่ push ขึ้น GitHub:
   - `/api/scan` วันละครั้ง (22:00 UTC ≈ หลังแท่งรายวันเพิ่งปิด) — เหมาะกับกลยุทธ์ TF ยาว
   - `/api/monitor` ทุก 30 นาที — เช็ค TP/SL ถี่กว่าปกติเพราะราคาชนได้ตลอดเวลาไม่ว่า entry จะมาจาก TF ไหน
4. ปรับเวลา scan ได้ที่ค่า cron `"0 22 * * *"` ในไฟล์ workflow ให้ตรงกับช่วงที่แท่งรายวันของ
   Twelve Data ปิดจริง (ลองสังเกตจากข้อมูลที่ดึงมาเทียบเวลาก็ได้)
5. ทดสอบได้ทันทีโดยไม่ต้องรอ: ไปที่แท็บ **Actions** ของ repo → เลือก workflow →
   **Run workflow** (ปุ่ม manual trigger)

---

## 6. ปรับแต่งกลยุทธ์ / พารามิเตอร์

แก้ได้ที่ `lib/strategy.ts` ทั้งหมด:
- `EMA_FAST_PERIOD` / `EMA_SLOW_PERIOD` — ความไวของเส้นเทรนด์ (ค่าเริ่มต้น 50/200 เหมาะกับ TF รายวัน)
- `ADX_THRESHOLD` — ความแรงของเทรนด์ที่ยอมรับ (ยิ่งสูง ยิ่งกรองเข้มขึ้น แต่ signal จะน้อยลง)
- `RSI_PULLBACK_LOW` / `RSI_PULLBACK_HIGH` — ความลึกของ pullback ที่รอ
- `ATR_SL_MULTIPLIER` — ระยะ stop loss (ยิ่งมาก ยิ่งเผื่อความผันผวน แต่ขาดทุนต่อไม้มากขึ้น)
- `RISK_REWARD` — อัตราส่วน TP:SL (ตอนนี้ตั้ง 2 = RR 1:2 ตามที่ขอ)
- `FOREX_SYMBOLS`, `FOREX_INTERVAL` (TF), `MAX_SIGNALS_PER_DAY` แก้ได้จาก Environment Variables
  เลยไม่ต้องแก้โค้ด — ถ้าอยากลองสั้นกว่ารายวัน เปลี่ยน `FOREX_INTERVAL` เป็น `"4h"` ได้ แต่ปรับ
  ความถี่ cron scan ให้ถี่ขึ้นตามด้วย

**แนะนำก่อนใช้เงินจริง:** ทำ backtest กับข้อมูลย้อนหลังอย่างน้อย 6-12 เดือนของแต่ละคู่เงิน
ด้วยตรรกะเดียวกันใน `strategy.ts` (ดึงข้อมูลย้อนหลังมาไล่ทีละแท่งแทนการยิง cron จริง) เพื่อดู
win rate/expectancy จริงก่อนเชื่อตัวเลขเป้าหมาย

---

## 7. หน้าเว็บที่ใช้งานได้

- `/` — สัญญาณที่เปิดอยู่ตอนนี้ (entry, SL, TP, เหตุผล)
- `/dashboard` — win rate, expectancy, equity curve, ประวัติเทรด
"# TF5" 
"# TF5" 
"# TF5" 
