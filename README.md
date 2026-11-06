# Personal Investment Price Alert

ระบบส่วนตัวสำหรับหุ้นและ ETF สหรัฐ (NYSE / NASDAQ / NYSE Arca) ทุกวันเวลา 19:00 น. ไทย ระบบดึงราคาปิดล่าสุดจาก Twelve Data เทียบกับ **ราคาปิดวันซื้อขายแรกของเดือน** แล้วส่ง LINE ให้คุณเมื่อราคาลดลงถึงเกณฑ์ % ที่ตั้งไว้ของหุ้นตัวนั้น เดือนละไม่เกิน 1 ครั้งต่อหุ้น ใช้ช่วยเฝ้าจังหวะ DCA ระบบไม่ซื้อขายเอง และไม่ให้คำแนะนำการลงทุน

รันบน Cloudflare (Worker + Cron + D1) ตามแพ็กเกจฟรี ไม่ต้องเปิดเครื่องของคุณ

เอกสารอื่น: [RUNBOOK.md](RUNBOOK.md) (ดูแลประจำ แก้ปัญหา โควต้า) · [SPEC.md](SPEC.md) (กติกาและการตัดสินใจทั้งหมด) · [CONTEXT.md](CONTEXT.md) (ศัพท์)

---

## 1. ตั้งค่าครั้งแรก (สำหรับคนที่นำโปรเจกต์ไปใช้เอง)

ใช้เวลาประมาณ 30–45 นาที ทำตามลำดับ A → E ถ้าคุณเป็นเจ้าของที่ติดตั้งไว้แล้ว ข้ามไปหัวข้อ 2 ได้เลย

**ขั้นตอนเหล่านี้ตรวจกับเอกสารทางการเมื่อ 2026-11-06** แต่ LINE, Cloudflare และ Twelve Data ปรับหน้าเว็บบ่อย ชื่อเมนูหรือปุ่มอาจต่างจากที่เขียนเล็กน้อย ถ้าหาไม่เจอ ให้ดูเอกสารทางการตามลิงก์ในแต่ละขั้น

### สิ่งที่ต้องมี
- **บัญชี LINE ส่วนตัว** (แอป LINE บนมือถือ) ไว้รับแจ้งเตือนและสั่งงาน
- **อีเมล** สำหรับสมัคร Twelve Data และ Cloudflare
- **คอมพิวเตอร์** ที่ติดตั้ง [Node.js](https://nodejs.org) (ทดสอบกับ v24 ใช้ LTS ล่าสุดได้) และ Git
- บริการที่ใช้ทั้งหมดมีแผนฟรี Twelve Data ระบุว่าแผน Basic ไม่ต้องใช้บัตรเครดิต ส่วน Cloudflare และ LINE ให้ดูเงื่อนไขตอนสมัคร (โควต้าและเงื่อนไขอาจเปลี่ยนได้ ระบบนี้ไม่รับประกันว่าจะฟรีตลอดไป)

### ค่าที่ต้องหามา 4 ตัว
| ชื่อตัวแปร | คืออะไร | หาได้ที่ขั้น |
|---|---|---|
| `TWELVE_DATA_API_KEY` | key สำหรับดึงราคาหุ้น | A |
| `LINE_CHANNEL_ACCESS_TOKEN` | token ให้ระบบส่งข้อความเข้า LINE ของคุณ | B |
| `LINE_USER_ID` | รหัสผู้ใช้ LINE ของคุณ (ขึ้นต้นด้วย `U`) ใช้ล็อกให้ระบบรับคำสั่งจากคุณคนเดียว | B |
| `LINE_CHANNEL_SECRET` | รหัสลับของ channel ใช้ตรวจว่าคำสั่งมาจาก LINE จริง | B |

ทั้ง 4 ตัวเป็นความลับ ห้ามใส่ใน git แชต หรือภาพหน้าจอที่แชร์ต่อ ขอแล้วเก็บไว้ในที่ชั่วคราว (เช่น ไฟล์ข้อความที่ไม่ได้อยู่ในโฟลเดอร์โปรเจกต์) จนกว่าจะถึงขั้น C และ E

### ขั้น A: ขอ `TWELVE_DATA_API_KEY`
1. เปิด [twelvedata.com](https://twelvedata.com) แล้วสมัครสมาชิก (Sign up) ด้วยอีเมล และยืนยันอีเมลตามที่ส่งมา
2. ล็อกอิน แล้วเปิดหน้า **Dashboard** จะเห็น **API key** (ข้อความยาวประมาณ 32 ตัวอักษร) ของคุณ คัดลอกเก็บไว้
3. แผนที่ได้เป็น **Basic (ฟรี)**: 8 request ต่อนาที และ 800 ต่อวัน ซึ่งพอสำหรับหุ้นราว 20 ตัวที่ระบบนี้ออกแบบไว้ (ตรวจแผนและโควต้าล่าสุดที่ [หน้าราคา](https://twelvedata.com/pricing))
4. ข้อกำหนด: แผนฟรีใช้ส่วนตัวเท่านั้น ห้ามแจกจ่ายหรือแสดงข้อมูลต่อสาธารณะ

คุณจะทดสอบ key ได้ในขั้น E (`npm run credits`)

### ขั้น B: ขอค่าจาก LINE (3 ตัว)
LINE เลิกให้สร้าง channel Messaging API โดยตรงใน Developers Console ตั้งแต่ 4 ก.ย. 2024 ต้องสร้าง **LINE Official Account** ก่อน แล้วเปิด Messaging API จากนั้น LINE จะสร้าง channel ให้ ([เอกสารทางการ](https://developers.line.biz/en/docs/messaging-api/getting-started/))

**B1. สร้าง LINE Official Account**
1. เปิด [LINE Official Account Manager](https://manager.line.biz/) ล็อกอินด้วยบัญชี LINE ของคุณ
2. สร้างบัญชี Official Account ใหม่ (ชื่อและประเภทธุรกิจตั้งอะไรก็ได้ ชื่อที่ตั้งคือชื่อที่คุณเห็นในแชตตอนระบบส่งข้อความ ใช้ส่วนตัวคนเดียวได้)

**B2. เปิด Messaging API**
1. ใน Official Account Manager ไปที่ **Settings → Messaging API** แล้วกด **Enable Messaging API**
2. เลือกหรือสร้าง **Provider** (ตั้งชื่ออะไรก็ได้ แต่ **ย้าย channel ไป provider อื่นภายหลังไม่ได้**) แล้วยืนยัน

**B3. เปิด LINE Developers Console แล้วหาค่า**
1. เปิด [LINE Developers Console](https://developers.line.biz/console/) ล็อกอินด้วยบัญชีเดียวกัน เลือก Provider แล้วเลือก channel ที่เพิ่งสร้าง
2. แท็บ **Basic settings**
   - **Channel secret** → คัดลอกเป็น `LINE_CHANNEL_SECRET` (ถ้าออกใหม่ ค่าเก่าจะใช้ไม่ได้ทันที)
   - เลื่อนลงล่างสุด ช่อง **Your user ID** → คัดลอกเป็น `LINE_USER_ID` (ขึ้นต้นด้วย `U` ตามด้วยตัวอักษรรวม 33 ตัว) **ไม่ใช่ LINE ID ที่ใช้ค้นหาเพื่อน**
3. แท็บ **Messaging API** เลื่อนไปที่ **Channel access token (long-lived)** กด **Issue** แล้วคัดลอกเป็น `LINE_CHANNEL_ACCESS_TOKEN` ([เอกสารเรื่อง token](https://developers.line.biz/en/docs/basics/channel-access-token/))
   - token แบบ long-lived ไม่หมดอายุ แต่ถ้ากด Issue ซ้ำ ค่าเก่าจะใช้ไม่ได้ทันที LINE แนะนำให้ใช้ token แบบมีวันหมดอายุเพื่อความปลอดภัย โปรเจกต์นี้ใช้ long-lived เพื่อความง่าย ดังนั้นต้องเก็บให้เป็นความลับ

**B4. เพิ่ม Official Account เป็นเพื่อน (สำคัญ)**
ที่แท็บ **Messaging API** มี **QR code** ให้สแกนด้วยแอป LINE บนมือถือแล้วกดเพิ่มเพื่อน ถ้าไม่เพิ่มเป็นเพื่อน (หรือบล็อกบัญชีนี้) ระบบจะส่งข้อความหาคุณไม่ได้

**B5. ตรวจโควต้าข้อความ:** แผนฟรีของ LINE จำกัดจำนวนข้อความต่อเดือน (เอกสารที่ตรวจไว้ระบุ 200 ข้อความ แต่ยังยืนยันตัวเลขของบัญชีไทยไม่ได้) ดูโควต้าจริงใน Official Account Manager ระบบนี้ใช้เฉพาะตอนมีแจ้งเตือนราคา (ไม่เกิน 1 ข้อความต่อหุ้นต่อเดือน) และตอนกด `fetch` ที่ทำให้เกิดแจ้งเตือน ส่วนคำตอบของคำสั่งทั่วไปเป็น reply ซึ่งไม่นับ

### ขั้น C: สร้างระบบบน Cloudflare
1. สมัครบัญชีฟรีที่ [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) และยืนยันอีเมล
2. เอาโค้ดมาที่เครื่อง แล้วติดตั้งไลบรารี
   ```bash
   git clone <URL ของโปรเจกต์นี้>
   cd <โฟลเดอร์โปรเจกต์>
   npm install
   ```
3. ล็อกอิน Cloudflare (จะเปิดเบราว์เซอร์ให้อนุญาต)
   ```bash
   npx wrangler login
   ```
4. ก๊อปไฟล์ตั้งค่า (`wrangler.toml` ไม่อยู่ใน git เพราะมี id ของคุณ) แล้วสร้างฐานข้อมูล นำ `database_id` ที่ได้ไปใส่แทน `REPLACE_WITH_YOUR_D1_DATABASE_ID`
   ```bash
   cp wrangler.toml.example wrangler.toml
   ```
   ```bash
   npx wrangler d1 create price-alert
   ```
5. ตั้ง secrets ทั้ง 4 ตัว ทีละคำสั่ง แต่ละคำสั่งจะถามค่า ให้วางค่าในเทอร์มินัลเอง
   ```bash
   npx wrangler secret put TWELVE_DATA_API_KEY
   npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
   npx wrangler secret put LINE_USER_ID
   npx wrangler secret put LINE_CHANNEL_SECRET
   ```
   คำสั่งแรกอาจถามว่าจะสร้าง Worker ชื่อ `price-alert` ให้ไหม (ตอบ yes) และอาจให้ตั้ง **workers.dev subdomain** ตอบเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น และอย่าใช้ชื่อจริงหรืออีเมล เพราะจะอยู่ใน URL สาธารณะ (เช่น `pa-48213`)
6. สร้างตารางในฐานข้อมูลจริง แล้ว deploy
   ```bash
   npm run migrate:remote
   npx wrangler deploy
   ```
   `deploy` จะพิมพ์ URL ของ Worker (รูปแบบ `https://price-alert.<subdomain>.workers.dev`) จดไว้ใช้ในขั้น D และนี่คือจุดที่ cron เริ่มทำงานทุกวัน

เวลารันตั้งไว้ที่ 19:00 และ 20:00 น. เวลาไทย (ใน `wrangler.toml` เป็น UTC `0 12 * * *` และ `0 13 * * *`) ถ้าจะเปลี่ยน ให้แก้สองบรรทัดนั้น และแก้ค่า `FINAL_CRON` ใน `src/worker.mjs` ให้ตรงกับรอบหลังด้วย

### ขั้น D: ตั้ง webhook ให้สั่งงานผ่าน LINE ได้
1. ที่ LINE Developers Console → channel ของคุณ → แท็บ **Messaging API** → **Webhook URL** ใส่ `https://price-alert.<subdomain ของคุณ>.workers.dev/line/webhook` กด **Update** แล้วกด **Verify** (ต้องขึ้น Success) จากนั้นเปิด **Use webhook** ([เอกสาร](https://developers.line.biz/en/docs/messaging-api/verify-webhook-url/))
2. ที่ LINE Official Account Manager → Settings → Response settings: **ปิด** Auto-response messages (และข้อความทักทายถ้าไม่ต้องการ) และเปิด Webhook ไม่เช่นนั้นข้อความตอบกลับอัตโนมัติของ LINE จะแทรกกับคำตอบของระบบ
3. พิมพ์ `help` ใน LINE ควรได้รายการคำสั่งกลับมา

ถ้า Verify ไม่ผ่าน: 404 = ยังไม่ได้ deploy หรือพิมพ์ URL ผิด · 503 = ยังไม่ได้ตั้ง `LINE_CHANNEL_SECRET` · 401 = ค่า secret ไม่ตรงกับ Channel secret ของ channel นี้

### ขั้น E: ตั้งค่าบนเครื่อง ทดสอบ และเพิ่มหุ้นตัวแรก
1. สร้างไฟล์ความลับของเครื่องนี้ (ไฟล์นี้ถูก gitignore ไว้แล้ว) แล้วเปิดใส่ค่า ไม่ต้องใส่เครื่องหมายคำพูด
   ```bash
   copy .dev.vars.example .dev.vars
   ```
   (macOS/Linux ใช้ `cp`) ใส่ `TWELVE_DATA_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_USER_ID` (ส่วน `LINE_CHANNEL_SECRET` ใส่เฉพาะเมื่อจะทดสอบ webhook บนเครื่อง)
2. ทดสอบ key ทั้งสองฝั่ง
   ```bash
   npm run credits
   npm run line-test
   ```
   ข้อแรกควรแสดง credit ของ Twelve Data (ถ้า key ผิดจะขึ้นข้อความ error) ข้อสองควรมีข้อความ "✅ ทดสอบการเชื่อมต่อ LINE สำเร็จ" เข้า LINE ของคุณ (ใช้ 1 ข้อความจากโควต้า)
3. เพิ่มหุ้นตัวแรกบนระบบจริง (ใส่ `--remote` เสมอ ETF ใส่ `--etf` ด้วย)
   ```bash
   npm run assets -- add AAPL 5 --remote
   ```
   เลข `5` คือแจ้งเตือนเมื่อราคาลดลง 5% จากราคาปิดวันซื้อขายแรกของเดือน
4. ดึงราคาตอนนี้ แล้วดูสถานะ (หรือรอรอบ 19:00 ที่ระบบรันเอง)
   ```bash
   npm run fetch -- --remote
   npm run assets -- status --remote
   ```
   ควรเห็นราคา ราคาตั้งต้น และราคาเป้าหมายของหุ้นตัวนั้น หลังจากนี้ใช้ได้ตามหัวข้อ 2

ถ้าติดปัญหา ดูตารางแก้ปัญหาใน [RUNBOOK.md](RUNBOOK.md) หรือส่งข้อความ error ไปถามผู้ดูแลโปรเจกต์ (อย่าส่งค่า key ไปด้วย)

---

## 2. ใช้งานประจำวัน

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
| ดู credit ที่เหลือของ Twelve Data | `npm run credits` |
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
| `credits` | ดู credit ที่เหลือของ Twelve Data (วันนี้ และนาทีล่าสุด) ไม่เสีย credit |
| `help` | รายการคำสั่ง |

**อ่านคำตอบ:** หุ้นแต่ละตัวเป็นบล็อกสั้นๆ บรรทัดละเรื่อง เว้นบรรทัดระหว่างตัว และมีจุดสีนำหน้าให้กวาดตาดูได้ทันที: 🟢 ราคาสูงกว่าราคาตั้งต้น · 🟡 ลดแล้วแต่ยังไม่ถึงเกณฑ์ · 🔴 ถึงเกณฑ์แล้ว · ⚪ ยังไม่มีราคา · ⏸ พักติดตาม เวลารอบล่าสุดแสดงเป็นเวลาไทย

สำรองข้อมูล deploy และ migration ยังทำบนคอมพิวเตอร์เท่านั้น ระบบรับคำสั่งจาก **บัญชี LINE ของคุณคนเดียว** และตรวจลายเซ็นของ LINE ทุกคำขอ คนอื่นที่เพิ่ม Official Account เป็นเพื่อนจะสั่งอะไรไม่ได้

การตั้ง webhook ครั้งแรกอยู่ในหัวข้อ 1 ขั้น D (ถ้าเพิ่งอัปเดตโค้ดเดิมที่ยังไม่มีฟีเจอร์นี้ ให้ตั้ง `LINE_CHANNEL_SECRET` ด้วย `npx wrangler secret put LINE_CHANNEL_SECRET` แล้ว `npx wrangler deploy` ก่อนทำขั้น D)

---

## 3. ติดตั้งบนเครื่องใหม่

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
- [Node.js](https://nodejs.org) (ทดสอบกับ v24 ใช้เวอร์ชัน LTS ล่าสุดได้) พร้อม npm
- Git (ถ้าจะใช้ clone)

**2. เอาโค้ดมาที่เครื่องใหม่** เลือกอย่างใดอย่างหนึ่ง
- **ก. ผ่าน GitHub แบบ private (แนะนำ):** ตอนนี้โปรเจกต์ยังไม่มี remote ที่เครื่องเก่า สร้าง repo เปล่าแบบ private บน GitHub แล้วรัน
  ```bash
  git remote add origin <URL ของ repo>
  git push -u origin main
  ```
  ที่เครื่องใหม่: `git clone <URL ของ repo>` แล้ว `cd` เข้าโฟลเดอร์ ไฟล์ความลับทั้งหมดอยู่นอก git อยู่แล้ว (`.gitignore` กัน `.dev.vars`, `.wrangler/`, `backups/`) แต่ตรวจให้แน่ใจว่า repo เป็น **private** เพราะมีข้อมูลการวางแผนของคุณ (`wrangler.toml` ที่มี `database_id` ไม่อยู่ใน git แต่ต้องก๊อปไปเครื่องใหม่เอง)
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
ถ้าย้ายบัญชี Cloudflare ต้องทำตั้งแต่ต้น: `npx wrangler d1 create price-alert` แล้วใส่ `database_id` ใหม่ใน `wrangler.toml` → ตั้ง secrets 4 ตัว (`npx wrangler secret put TWELVE_DATA_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_USER_ID`, `LINE_CHANNEL_SECRET`) → `npm run migrate:remote` → นำข้อมูลเดิมกลับด้วยไฟล์สำรอง (ดูวิธีใน [RUNBOOK.md](RUNBOOK.md)) → `npx wrangler deploy`

---

## 4. โครงสร้างโปรเจกต์

```text
src/        โค้ดที่รันใน Worker (ดึงราคา คำนวณอ้างอิง แจ้งเตือน LINE งานรายวัน คำสั่งผ่านแชต)
scripts/    คำสั่งบนเครื่อง (assets, fetch, notify, backup)
migrations/ โครงสร้างตารางฐานข้อมูล
wrangler.toml.example  แม่แบบตั้งค่า Worker (ก๊อปเป็น wrangler.toml ซึ่งไม่อยู่ใน git) ตั้งค่า Worker, ฐานข้อมูล และเวลา cron (UTC 12:00 และ 13:00)
.dev.vars   ความลับของเครื่องนี้ (ไม่อยู่ใน git)
```

คำสั่งอื่นที่ใช้ตอนพัฒนา: `npm test` (เทสต์), `npm run migrate:remote` (สร้าง/อัปเดตตารางบนของจริง), `npm run dev:worker` (รัน Worker ในเครื่องแล้วจำลอง cron ที่ `/__scheduled?cron=0+13+*+*+*` ใช้ key จริงใน `.dev.vars`)

## 5. ความปลอดภัยของข้อมูล

- ห้ามนำ `.dev.vars`, ไฟล์ใน `backups/` หรือ token ไปใส่ใน git แชต หรืออีเมล
- ไฟล์สำรองมีรายชื่อหุ้นและประวัติของคุณ (ไม่มี secrets) เก็บเป็นส่วนตัว
- Worker มีเส้นทางเดียวที่ตอบ คือ `/line/webhook` สำหรับ LINE ซึ่งปฏิเสธทุกคำขอที่ไม่มีลายเซ็นที่ถูกต้อง (HTTP 401) และไม่ทำอะไรให้ใครนอกจากคุณ ส่วนเส้นทางอื่นตอบ 404
- Channel secret เป็นความลับเหมือน token ห้ามนำไปใส่ใน git หรือแชต ถ้ารั่ว ให้ออกใหม่ที่ LINE Developers Console แล้ว `npx wrangler secret put LINE_CHANNEL_SECRET` อีกครั้ง
- ข้อมูลจาก Twelve Data ใช้ส่วนตัวเท่านั้น ห้ามแจกจ่ายหรือแสดงสาธารณะ
