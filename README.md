# Personal Investment Price Alert

ระบบส่วนตัวสำหรับหุ้นและ ETF สหรัฐ (NYSE / NASDAQ / NYSE Arca) ทุกวันเวลา 19:00 น. ไทย ระบบดึงราคาปิดล่าสุดจาก Twelve Data เทียบกับ **ราคาปิดวันซื้อขายแรกของเดือน** แล้วส่ง LINE ให้คุณเมื่อราคาลดลงถึงเกณฑ์ % ที่ตั้งไว้ของหุ้นตัวนั้น เดือนละไม่เกิน 1 ครั้งต่อหุ้น ใช้ช่วยเฝ้าจังหวะ DCA ระบบไม่ซื้อขายเอง และไม่ให้คำแนะนำการลงทุน

รันบน Cloudflare (Worker + Cron + D1) ตามแพ็กเกจฟรี ไม่ต้องเปิดเครื่องของคุณ

เอกสารอื่น: [RUNBOOK.md](RUNBOOK.md) (ดูแลประจำ แก้ปัญหา โควต้า) · [SPEC.md](SPEC.md) (กติกาและการตัดสินใจทั้งหมด) · [CONTEXT.md](CONTEXT.md) (ศัพท์)

---

## 1. ใช้งานประจำวัน

ทุกคำสั่งรันที่โฟลเดอร์โปรเจกต์ **ต้องใส่ `--remote`** เพื่อทำกับระบบจริงบน Cloudflare ถ้าไม่ใส่ จะทำกับฐานข้อมูลทดลองในเครื่องคุณ (แยกจากของจริง)

| ต้องการ | คำสั่ง |
|---|---|
| ดูสถานะทั้งหมด | `npm run assets -- status --remote` |
| ดูรายการหุ้น | `npm run assets -- list --remote` |
| เพิ่มหุ้น (เกณฑ์ %) | `npm run assets -- add NVDA 8 --remote` |
| เพิ่ม ETF | `npm run assets -- add VOO 5 --etf --remote` |
| เปลี่ยนเกณฑ์ | `npm run assets -- edit NVDA --threshold 10 --remote` |
| พักติดตาม (เก็บประวัติ) | `npm run assets -- disable NVDA --remote` |
| ติดตามต่อ | `npm run assets -- enable NVDA --remote` |
| ลบถาวรพร้อมประวัติทั้งหมด | `npm run assets -- remove NVDA --yes --remote` |
| ส่ง LINE ทดสอบ | `npm run line-test` |
| สำรองข้อมูล | `npm run backup` |

กติกาที่ควรรู้
- เกณฑ์ต้องมากกว่า 0 และน้อยกว่า 100 เช่น `5` คือราคาลดลง 5% จากราคาอ้างอิงของเดือนนี้
- **ETF ต้องใส่ `--etf` เสมอ** ไม่เช่นนั้นจะถูกบันทึกเป็นหุ้นธรรมดา (ยังไม่มีคำสั่งแก้ภายหลัง ถ้าลืมให้ `remove` แล้ว `add` ใหม่)
- `add` ใช้ Twelve Data 1 credit เพื่อตรวจว่า symbol มีจริงและอยู่ตลาดสหรัฐ
- หุ้นที่เพิ่มจะได้ราคาแรกตอนรอบ 19:00 ถัดไป หรือสั่งทันทีด้วย `npm run fetch -- --remote` (1 credit ต่อหุ้นที่ยังไม่ตรวจวันนี้)

### อ่านผล `status`
```text
SYMBOL ACTIVE PRICE DATE  PRICE  REF     TARGET  DROP%  ALERT
AAPL   yes    2026-11-06  349.51 338.32  321.40  -3.31  -
```
`PRICE` ราคาปิดล่าสุดและวันที่ · `REF` ราคาอ้างอิงของเดือนนี้ · `TARGET` ราคาที่ถ้าตกถึงจะแจ้ง · `DROP%` ติดลบแปลว่าอยู่เหนืออ้างอิง · `ALERT` สถานะแจ้งเตือนล่าสุด (`Sent` ส่งแล้ว, `Pending` รอส่ง, `Failed` ลองใหม่รอบถัดไป) ส่วน **Last runs** ควรมีรอบใหม่ทุกวัน

ถ้ามีอาการผิดปกติ (STALE, HELD, LINE ไม่เข้า, ไม่มีรอบรัน) ดูตารางแก้ปัญหาใน [RUNBOOK.md](RUNBOOK.md)

### สั่งผ่าน LINE (แทนการพิมพ์คำสั่งบนคอมพิวเตอร์)

พิมพ์ข้อความหา LINE Official Account ตัวเดียวกับที่ส่งแจ้งเตือน (พิมพ์เป็นภาษาอังกฤษ ไม่ต้องใส่ `--remote`) ระบบตอบกลับในแชตเดียวกัน

| พิมพ์ | ผล |
|---|---|
| `status` | ราคา ราคาตั้งต้น ราคาเป้าหมาย และตอนนี้ลดไปกี่ % ของทุกตัว |
| `list` | รายการหุ้นและเกณฑ์ |
| `add NVDA 8` / `add VOO 5 etf` | เพิ่มหุ้น เกณฑ์ลด 8% / เพิ่ม ETF (ใส่ `etf` ต่อท้าย) แล้วบอก credit ที่เหลือวันนี้ |
| `edit NVDA 10` | เปลี่ยนเกณฑ์เป็น 10% |
| `disable NVDA` / `enable NVDA` | พักติดตาม (เก็บประวัติ) / ติดตามต่อ |
| `remove NVDA` แล้ว `confirm NVDA` | ลบถาวร ต้องพิมพ์ `confirm` ภายใน 2 นาที |
| `fetch` | ดึงราคาตอนนี้ (สูงสุด 8 ตัวต่อครั้ง พิมพ์ซ้ำเพื่อทำตัวที่เหลือ) แล้วบอก credit ที่เหลือ |
| `help` | รายการคำสั่ง |

**อ่านคำตอบ:** หุ้นแต่ละตัวเป็นบล็อกสั้นๆ บรรทัดละเรื่อง เว้นบรรทัดระหว่างตัว และมีจุดสีนำหน้าให้กวาดตาดูได้ทันที: 🟢 ราคาสูงกว่าราคาตั้งต้น · 🟡 ลดแล้วแต่ยังไม่ถึงเกณฑ์ · 🔴 ถึงเกณฑ์แล้ว · ⚪ ยังไม่มีราคา · ⏸ พักติดตาม เวลารอบล่าสุดแสดงเป็นเวลาไทย

สำรองข้อมูล deploy และ migration ยังทำบนคอมพิวเตอร์เท่านั้น ระบบรับคำสั่งจาก **บัญชี LINE ของคุณคนเดียว** และตรวจลายเซ็นของ LINE ทุกคำขอ คนอื่นที่เพิ่ม Official Account เป็นเพื่อนจะสั่งอะไรไม่ได้

**ตั้งค่าครั้งแรก (ทำครั้งเดียว)**
1. หา **Channel secret** ที่ LINE Developers Console → channel ของคุณ → แท็บ Basic settings แล้วตั้งเป็น secret (วางค่าในเทอร์มินัลเอง)
   ```bash
   npx wrangler secret put LINE_CHANNEL_SECRET
   ```
2. Deploy โค้ดใหม่
   ```bash
   npx wrangler deploy
   ```
3. ที่ LINE Developers Console → แท็บ Messaging API → **Webhook URL** ใส่ `https://price-alert.<subdomain ของคุณ>.workers.dev/line/webhook` กด **Update** แล้วกด **Verify** (ต้องขึ้น Success) จากนั้นเปิด **Use webhook**
4. ที่ LINE Official Account Manager → Settings → Response settings: **ปิด** Auto-response messages (และข้อความทักทายถ้าไม่ต้องการ) และเปิด Webhook ไม่เช่นนั้นข้อความตอบกลับอัตโนมัติของ LINE จะแทรกกับคำตอบของระบบ
5. ลองพิมพ์ `help` ใน LINE ควรได้รายการคำสั่งกลับมา

---

## 2. ติดตั้งบนเครื่องใหม่

ระบบจริงอยู่บน Cloudflare อยู่แล้ว (รันเองทุกวัน) การย้ายเครื่อง **ไม่กระทบการทำงาน** เครื่องใหม่มีไว้จัดการหุ้น ดูสถานะ และแก้โค้ดเท่านั้น และ **ไม่ต้อง deploy ใหม่หรือตั้ง secrets บน Cloudflare ซ้ำ** ถ้าไม่ได้แก้โค้ด

### สิ่งที่ต้องย้ายเอง และสิ่งที่ไม่ต้อง
| อะไร | อยู่ที่ไหน | เครื่องใหม่ต้องทำอะไร |
|---|---|---|
| โค้ด | โฟลเดอร์โปรเจกต์ (git) | คัดลอกหรือ clone มา (ข้อ 2) |
| ข้อมูลหุ้น ราคา แจ้งเตือน | ฐานข้อมูลบน Cloudflare | ไม่ต้องย้าย ล็อกอินแล้วเข้าถึงได้เลย |
| secrets ของระบบจริง (Twelve Data, LINE) | Cloudflare | ไม่ต้องทำอะไร |
| `.dev.vars` (key สำหรับคำสั่งบนเครื่อง) | ไฟล์ในเครื่องเก่า **ไม่อยู่ใน git** | สร้างใหม่ (ข้อ 4) |
| ฐานข้อมูลทดลองในเครื่อง (`.wrangler/`) | เครื่องเก่า | ไม่ต้องย้าย สร้างใหม่ได้ (ข้อ 6) |
| ไฟล์สำรอง (`backups/`) | เครื่องเก่า **ไม่อยู่ใน git** | คัดลอกไปเก็บเองถ้าต้องการ |

### ขั้นตอน

**1. ติดตั้งโปรแกรม**
- [Node.js](https://nodejs.org) (ผมทดสอบกับ v24 ใช้เวอร์ชัน LTS ล่าสุดได้) พร้อม npm
- Git (ถ้าจะใช้ clone)

**2. เอาโค้ดมาที่เครื่องใหม่** เลือกอย่างใดอย่างหนึ่ง
- **ก. ผ่าน GitHub แบบ private (แนะนำ):** ตอนนี้โปรเจกต์ยังไม่มี remote ที่เครื่องเก่า สร้าง repo เปล่าแบบ private บน GitHub แล้วรัน
  ```bash
  git remote add origin <URL ของ repo>
  git push -u origin main
  ```
  ที่เครื่องใหม่: `git clone <URL ของ repo>` แล้ว `cd` เข้าโฟลเดอร์ ไฟล์ความลับทั้งหมดอยู่นอก git อยู่แล้ว (`.gitignore` กัน `.dev.vars`, `.wrangler/`, `backups/`) แต่ตรวจให้แน่ใจว่า repo เป็น **private** เพราะมีข้อมูลการวางแผนของคุณและ `database_id`
- **ข. คัดลอกโฟลเดอร์:** คัดลอกทั้งโฟลเดอร์ไปเครื่องใหม่ **ยกเว้น** `node_modules/` และ `.wrangler/` (ไม่ต้องเอาไป) ถ้าจะคัดลอก `.dev.vars` ไปด้วย ให้ใช้ช่องทางที่ปลอดภัย (USB หรือ password manager) อย่าส่งทางแชตหรืออีเมล

**3. ติดตั้งไลบรารี**
```bash
npm install
```
อาจมีคำเตือนเรื่อง install scripts ของ `esbuild`/`workerd` ปกติ ถ้า `npm test` ในข้อ 6 ผ่านแสดงว่าไม่เป็นไร

**4. สร้างไฟล์ความลับของเครื่องนี้**
```bash
copy .dev.vars.example .dev.vars
```
(macOS/Linux ใช้ `cp`) เปิดแล้วใส่ค่าเอง ไม่ต้องใส่เครื่องหมายคำพูด
```text
TWELVE_DATA_API_KEY=...
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_USER_ID=...
```
ใช้กับคำสั่งบนเครื่อง ได้แก่ `add` (ตรวจ symbol), `fetch`, `line-test`, `notify` ถ้าจะใช้แค่ดูสถานะ (`status`, `list`) ไม่ต้องมีไฟล์นี้ ค่าหาได้จากแดชบอร์ด Twelve Data และ LINE Developers Console ถ้าค่าหาย สร้าง key/token ใหม่ได้ (ถ้าเปลี่ยนค่า ต้องอัปเดต secrets บน Cloudflare ด้วย `npx wrangler secret put <ชื่อ>`)

**5. ล็อกอิน Cloudflare**
```bash
npx wrangler login
```
ใช้บัญชีเดียวกับที่ deploy ไว้ จะเปิดเบราว์เซอร์ให้อนุญาต

**6. ตรวจว่าใช้ได้**
```bash
npm test
npm run assets -- list --remote
```
ข้อแรกควรผ่านทั้งหมด ข้อที่สองควรเห็นหุ้นที่ติดตามอยู่ตอนนี้ แสดงว่าเครื่องใหม่เข้าถึงระบบจริงได้แล้ว

ถ้าอยากทดลองบนเครื่อง (ไม่แตะของจริง) สร้างฐานข้อมูลทดลองด้วย `npm run migrate:local`

### ถ้าต้อง deploy ใหม่ (เฉพาะเมื่อแก้โค้ด หรือย้ายไปบัญชี Cloudflare ใหม่)
```bash
npx wrangler deploy
```
ถ้าย้ายบัญชี Cloudflare ต้องทำตั้งแต่ต้น: `npx wrangler d1 create price-alert` แล้วใส่ `database_id` ใหม่ใน `wrangler.toml` → ตั้ง secrets 3 ตัว (`npx wrangler secret put TWELVE_DATA_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_USER_ID`) → `npm run migrate:remote` → นำข้อมูลเดิมกลับด้วยไฟล์สำรอง (ดูวิธีใน [RUNBOOK.md](RUNBOOK.md)) → `npx wrangler deploy`

---

## 3. โครงสร้างโปรเจกต์

```text
src/        โค้ดที่รันใน Worker (ดึงราคา คำนวณอ้างอิง แจ้งเตือน LINE งานรายวัน คำสั่งผ่านแชต)
scripts/    คำสั่งบนเครื่อง (assets, fetch, notify, backup)
migrations/ โครงสร้างตารางฐานข้อมูล
wrangler.toml  ตั้งค่า Worker, ฐานข้อมูล และเวลา cron (UTC 12:00 และ 13:00)
.dev.vars   ความลับของเครื่องนี้ (ไม่อยู่ใน git)
```

คำสั่งอื่นที่ใช้ตอนพัฒนา: `npm test` (เทสต์), `npm run migrate:remote` (สร้าง/อัปเดตตารางบนของจริง), `npm run dev:worker` (รัน Worker ในเครื่องแล้วจำลอง cron ที่ `/__scheduled?cron=0+13+*+*+*` ใช้ key จริงใน `.dev.vars`)

## 4. ความปลอดภัยของข้อมูล

- ห้ามนำ `.dev.vars`, ไฟล์ใน `backups/` หรือ token ไปใส่ใน git แชต หรืออีเมล
- ไฟล์สำรองมีรายชื่อหุ้นและประวัติของคุณ (ไม่มี secrets) เก็บเป็นส่วนตัว
- Worker มีเส้นทางเดียวที่ตอบ คือ `/line/webhook` สำหรับ LINE ซึ่งปฏิเสธทุกคำขอที่ไม่มีลายเซ็นที่ถูกต้อง (HTTP 401) และไม่ทำอะไรให้ใครนอกจากคุณ ส่วนเส้นทางอื่นตอบ 404
- Channel secret เป็นความลับเหมือน token ห้ามนำไปใส่ใน git หรือแชต ถ้ารั่ว ให้ออกใหม่ที่ LINE Developers Console แล้ว `npx wrangler secret put LINE_CHANNEL_SECRET` อีกครั้ง
- ข้อมูลจาก Twelve Data ใช้ส่วนตัวเท่านั้น ห้ามแจกจ่ายหรือแสดงสาธารณะ
