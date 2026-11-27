# API Regression harness (PERSIST-01C-0)

ยิง API ของ `server.ts` ตามสถานการณ์ที่กำหนด บันทึกผลแบบ Normalize แล้วเทียบระหว่างรอบ
ใช้พิสูจน์ว่าการย้ายข้อมูลจาก Memory ไป PostgreSQL (PERSIST-01C) ไม่เปลี่ยนพฤติกรรม API
อยู่นอก `src/` จึงไม่ถูก Bundle

> **ห้ามคัดลอกโฟลเดอร์ `scripts\` ไปเครื่อง Prod** — มีสคริปต์ล้างฐาน (`reset-dev-db.sql`) และ Harness
> ที่สร้างผู้ใช้/ข้อมูลทดสอบ ใช้บนเครื่อง Dev เท่านั้น

## ชุดทดสอบ

| ชุด | สั่ง | ใช้ทำอะไร |
|---|---|---|
| `main` (ค่าเริ่มต้น) | `run.ts <ชื่อรอบ>` | ชุดหลัก 306 Request — **ห้ามแก้** เพื่อให้ยังเทียบกับ `baseline` ได้ |
| `01c1` | `run.ts --suite 01c1 <ชื่อรอบ>` | กรณีเพิ่มของ PERSIST-01C-1 (§D): `GET /api/departments`, C-05, `id`/`employeeId` ซ้ำ (E-2/E-1.2), F-01 (DELETE = Terminated), F-06, Reactivate · มีข้อตรวจเนื้อหา Response (`check`) — ผลรวมอยู่ใน `summary.json` → `checkFailures` |
| `01c2` | `run.ts --suite 01c2 <ชื่อรอบ>` | กรณีเพิ่มของ PERSIST-01C-2 (§D): Employee Master บน DB — สิทธิ์, Admin Replace (ลำดับ/ไม่มี `row_id`/`sort_order`/`isDeptResolved`), Editor Merge (B-17 แถวแรก/แทนทั้งแถว/รหัสซ้ำในคำขอ/ไม่ลบแถว), Q-1 (`9001` = `"9001"`), Q-2 (แถวไม่ใช่ Object → 400), Replace `[]`, Concurrency 2 แบบ × 10 รอบ (TX-09) |
| `01c3` | `run.ts --suite 01c3 <ชื่อรอบ>` | กรณีเพิ่มของ PERSIST-01C-3 (§D): เอกสาร + ACL บน DB — ACL Owner-first (FS-02), สิทธิ์ Viewer/Editor (หลัก→ย่อย), `parsedExcelSheets` ลำดับชีต (FS-06) + Array (Q-1), ชนิดข้อมูลผิด (Q-2), approve id ไม่มีจริง → `null`, view/download พร้อมกัน 20 คำขอ (TX-12), ไฟล์จริง: files/sign / `/uploads` / QP, ผูกไฟล์เดียวกันพร้อมกัน 5 คำขอ (TX-11), การจองไฟล์ถูกคืน, `ORPHANED_FILE`, PUT+DELETE พร้อมกัน 10 รอบ · **อัปโหลดไฟล์ทดสอบจริง** (ดู "ลบไฟล์ทดสอบของชุด 01c3") |
| `01c4` | `run.ts --suite 01c4 <ชื่อรอบ>` | กรณีเพิ่มของ PERSIST-01C-4 (§D): ความรู้และการโต้ตอบ 7 ตารางบน DB — E-2 `DUPLICATE_ID` (experts / custom_resources), F-06 (PUT kb / experts ด้วย id อื่นใน Body), PUT แทนทั้งก้อน + ไม่พบ → Body, F-05 ค่าดิบของ custom_resources, Q-2 (Body เป็น Array → 400, ช่องผิดชนิด), approve / like / reply ไม่พบ → Body ว่าง, like พร้อมกัน 20 (TX-12), search_logs พร้อมกัน 20 id ไม่ซ้ำ (C-15), ปิด Gap พร้อมกัน 5 + Audit / `\u0000` → 500 ไม่มีทั้งคู่ (TX-08), ratings Orphan / KB, ลำดับ experts ASC และตารางอื่นใหม่สุดก่อน · ไม่อัปโหลดไฟล์ |

ชุด `01c1` คาดพฤติกรรม**หลัง** 01C-1 — ถ้ารันกับโค้ดก่อน 01C-1 จะไม่ผ่านหลายข้อโดยเจตนา (ชุด `01c2` / `01c3` / `01c4` เช่นเดียวกันกับ 01C-2 / 01C-3 / 01C-4)

### ลบไฟล์ทดสอบของชุด 01c3

ชุด `01c3` อัปโหลด PDF เล็ก (ชื่อเป็น UUID) ลง `public\uploads` และ `dist\uploads` ผ่าน `POST /api/upload`
ชื่อไฟล์ทุกไฟล์อยู่ใน `out\<ชื่อรอบ>\summary.json` → `uploadedTestFiles` · `public\uploads` **ไม่อยู่ใน `.gitignore`**
จึงเห็นเป็นไฟล์ Untracked — **ห้าม `git add` ไฟล์เหล่านี้** ลบหลังจบรอบ (Terminal ใดก็ได้ ที่ `C:\RMP_Project\km-rmp-portal`):
```powershell
$run = 'c3-run1'   # ชื่อรอบที่รัน
$s = Get-Content "scripts\api-regression\out\$run\summary.json" -Raw -Encoding utf8 | ConvertFrom-Json
foreach ($f in $s.uploadedTestFiles) {
  foreach ($d in 'public\uploads', 'dist\uploads') {
    foreach ($p in "$d\$f", "$d\$f.meta.json") { if (Test-Path $p) { Remove-Item $p -Force; "ลบ $p" } }
  }
}
git status --short public dist   # ต้องไม่เหลือไฟล์ทดสอบ
```
Server เก็บข้อมูลไฟล์ไว้ใน Memory ด้วย — หลังลบให้รีสตาร์ท Server ก่อนใช้งานต่อ

หลังรันชุด `01c2` ให้ตรวจ `sort_order` ไม่ซ้ำ (อ่านอย่างเดียว ในฐานะ `km_app`):
```powershell
psql -U km_app -d km_rmp -c "SELECT count(*) AS total_rows, count(DISTINCT sort_order) AS distinct_sort_order, count(*) - count(DISTINCT sort_order) AS duplicate_sort_order FROM km.employee_master;"
psql -U km_app -d km_rmp -c "SELECT sort_order, count(*) FROM km.employee_master GROUP BY sort_order HAVING count(*) > 1;"
```
ผลที่ต้องได้: `duplicate_sort_order = 0` และคำสั่งที่สองไม่มีแถว (`total_rows` หลังจบชุด = 21)
แต่ละชุดรันแยกรอบ (ผลแยกโฟลเดอร์) และต้องเริ่มจากฐานที่ล้างแล้วทุกครั้ง

## รอบทดสอบใหม่ (ตั้งแต่ 01C-1 ข้อมูลผู้ใช้อยู่ใน DB — รีสตาร์ท Server อย่างเดียวไม่สะอาด)

1. หยุด Server (Ctrl+C)
2. ล้างฐาน — Owner รันเองด้วย `postgres` (ลบทุกตารางใน Schema `km` ยกเว้น `departments`)
   ```powershell
   psql -U postgres -d km_rmp -v confirm_dev_reset=YES -f scripts/api-regression/reset-dev-db.sql
   ```
   ต้องเห็น `departments` = 20, ตารางอื่น = 0 และ `all_ok` = `t` ทุกแถว
   (ไม่ส่ง `-v confirm_dev_reset=YES` ตรงตัว หรือไม่ได้ต่อ `km_rmp` → `ERROR: ABORT …` ไม่ล้างอะไร และ psql จบด้วย exit code 3)
3. เปิด Server — ตาราง `users` ว่าง Server จึงสร้าง Admin เริ่มต้นจาก `.env` ใหม่
   ```powershell
   npm run dev
   ```
4. รัน Harness ตามหัวข้อถัดไป (ชื่อรอบใหม่ทุกครั้ง)

## วิธีรัน (PowerShell)

1. เปิด Server ในสถานะเริ่มต้นสะอาด (มีผู้ใช้เพียง Admin เริ่มต้น) — ตั้งแต่ 01C-1 ใช้ขั้นตอน "รอบทดสอบใหม่" ด้านบน
   ```powershell
   npm run dev
   ```
   แนะนำให้ตั้ง `INITIAL_ADMIN_EMPLOYEE_ID` / `INITIAL_ADMIN_PASSWORD` ใน `.env` เพื่อให้รหัส Admin เหมือนเดิมทุกครั้งที่เปิด
2. อีก Terminal หนึ่ง ตั้งรหัส Admin ใน Environment ของ Terminal นั้นเอง (ห้ามเขียนลงไฟล์)
   ```powershell
   $env:HARNESS_ADMIN_ID = '<รหัสพนักงาน Admin>'
   $env:HARNESS_ADMIN_PASSWORD = '<รหัสผ่าน Admin>'
   # ไม่บังคับ: $env:HARNESS_BASE_URL = 'http://localhost:3000'
   npx tsx scripts/api-regression/run.ts baseline
   ```
3. เริ่มสถานะสะอาดใหม่ (ก่อน 01C-1: รีสตาร์ท Server · ตั้งแต่ 01C-1: ขั้นตอน "รอบทดสอบใหม่") แล้วรันรอบใหม่ด้วยชื่อใหม่ จากนั้นเทียบ
   ```powershell
   npx tsx scripts/api-regression/run.ts baseline2
   npx tsx scripts/api-regression/compare.ts baseline baseline2
   ```
   `compare` แสดงเฉพาะจุดที่ต่าง — Exit code 0 = ไม่ต่าง, 1 = ต่าง, 2 = ใช้งานผิด

   เมื่อเทียบรอบที่รันต่างวันกัน ใช้ `--ignore-date-dependent` เพื่อข้ามช่องที่ค่าขึ้นกับวันที่รัน
   (ข้ามตอนเทียบเท่านั้น ไม่แก้ไฟล์ผล และแสดงจำนวนจุดที่ข้ามแยกตามกฎ):
   - `daysRemaining` ของใบรับรอง (ทุก Route)
   - `GET /api/learning/stats` → `certificates.valid` / `expiringSoon` / `expired`
   ```powershell
   npx tsx scripts/api-regression/compare.ts --ignore-date-dependent baseline after-01c0
   ```

ผลอยู่ที่ `scripts/api-regression/out/<ชื่อรอบ>/` (อยู่ใน `.gitignore`) — ไฟล์ละหนึ่ง Request
(`method`, `path`, `requestBody`, `status`, `responseBody`) และ `summary.json` (จำนวน Request ต่อ Route,
Status ที่ไม่ตรงกับที่คาด) — ห้ามใช้ชื่อรอบซ้ำ ถ้าต้องรันใหม่ให้ลบโฟลเดอร์เดิมเอง

`run.ts` หยุดเอง (Exit code 3) ถ้า Login Admin ไม่สำเร็จ หรือ Server มีผู้ใช้มากกว่า 1 คนตอนเริ่ม
(Exit code 2 = ใช้งานผิด เช่น ชื่อรอบซ้ำ, ไม่รู้จักชุดหรือตัวเลือก)

## ผู้ใช้ที่ใช้

| บทบาท | ที่มา | แผนก |
|---|---|---|
| Admin | Admin เริ่มต้นจาก Environment | ตาม `.env` |
| Editor | Harness สร้างผ่าน `POST /api/users` (`HRN-EDITOR01`) | `d-pd` (แผนกหลัก) |
| Viewer | Harness สร้างผ่าน `POST /api/users` (`HRN-VIEWER01`) | `d-pd-dl` (แผนกย่อยของ `d-pd`) |
| Temp | Harness สร้าง ใช้ทดสอบบัญชีถูกระงับ/ถูกลบ (`HRN-TEMP01`) | `d-hr` |

รหัสผ่านของผู้ใช้ที่ Harness สร้างสุ่มใหม่ทุกรอบและไม่ถูกบันทึก

## การ Normalize ก่อนบันทึก

| ค่า | แทนด้วย |
|---|---|
| ID ที่ระบบสร้าง (`usr-`, `doc-`, `c-`, `kb-`, `qs-`, `ex-`, `exp-`, `prog-`, `cert-`, `km-log-`, `att-`, `ts-`, `sl-`, `sr-`, `cr-`, `res-`, `log-`, `r-` ตามด้วย Epoch ms หรือ UUID) และ UUID เปล่า | `<ID:n>` ตามลำดับที่พบครั้งแรกในรอบ |
| เวลา ISO 8601 และ Epoch ms | `<TS>` |
| วันที่ `YYYY-MM-DD` | `<DATE>` (ค่าวันที่ของวันนี้ทำให้รอบต่างวันต่างกัน) |
| JWT, ฟิลด์ `token` | `<TOKEN>` |
| ฟิลด์ `password` | `<PASSWORD>` |
| Bcrypt hash | `<BCRYPT_HASH>` |
| รหัสผ่านที่ Harness รู้ ถ้าโผล่ใน Response | `<LEAKED_SECRET>` |
| รหัสพนักงาน Admin | `<ADMIN_ID>` |
| จำนวนวินาทีในข้อความ 429 | `<N>` |
| `options` ของข้อ Matching ที่ Server สลับแบบสุ่มให้ Viewer | เรียงตามตัวอักษร |

Key ใน Object ถูกเรียงก่อนบันทึก และ `compare` ไม่สนลำดับ Key (สนลำดับสมาชิกใน Array)

## Route ที่ยกเว้น

| Route | เหตุผล |
|---|---|
| `POST /api/chat` | Route AI — เรียก Gemini ภายนอก ผลไม่คงที่และต้องใช้ API key; อยู่นอกขอบเขต 01C-0 (ปรับเป็นอ่านผ่าน Repo ใน 01C-8) |
| `POST /api/parse-document` | Route AI — เหตุผลเดียวกัน |
| `POST /api/personalized-path` | Route AI — เหตุผลเดียวกัน |
| `POST /api/upload` | Route ไฟล์ — เขียนไฟล์ลง `public/uploads`/`dist/uploads` และ Sidecar; เป็นงาน PERSIST-02 |
| `POST /api/files/sign` | Route ไฟล์ — งาน PERSIST-02 |
| `GET /uploads/:filename` | Route ไฟล์ — งาน PERSIST-02 |
| `GET *` | มีเฉพาะ `NODE_ENV=production` (ส่ง `index.html`) ไม่ใช่ API; Harness รันกับ `npm run dev` |

กรณีที่ต้องมีไฟล์อัปโหลดจริง (เช่น ผูกไฟล์กับเอกสาร/หลักสูตรสำเร็จ, `DUPLICATE_FILE_BINDING`, `FILE_NOT_BINDABLE`)
ไม่ครอบคลุมด้วยเหตุผลเดียวกัน — ครอบคลุมเฉพาะ `FILE_NOT_FOUND` ที่ไม่ต้องมีไฟล์
