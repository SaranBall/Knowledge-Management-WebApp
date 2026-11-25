# API Regression harness (PERSIST-01C-0)

ยิง API ของ `server.ts` ตามสถานการณ์ที่กำหนด บันทึกผลแบบ Normalize แล้วเทียบระหว่างรอบ
ใช้พิสูจน์ว่าการย้ายข้อมูลจาก Memory ไป PostgreSQL (PERSIST-01C) ไม่เปลี่ยนพฤติกรรม API
อยู่นอก `src/` จึงไม่ถูก Bundle

## วิธีรัน (PowerShell)

1. เปิด Server ในสถานะเริ่มต้นสะอาด (เพิ่งเปิด มีผู้ใช้เพียง Admin เริ่มต้น) — ทุกรอบต้องรีสตาร์ท Server ก่อน
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
3. รีสตาร์ท Server แล้วรันรอบใหม่ด้วยชื่อใหม่ จากนั้นเทียบ
   ```powershell
   npx tsx scripts/api-regression/run.ts baseline2
   npx tsx scripts/api-regression/compare.ts baseline baseline2
   ```
   `compare` แสดงเฉพาะจุดที่ต่าง — Exit code 0 = ไม่ต่าง, 1 = ต่าง, 2 = ใช้งานผิด

ผลอยู่ที่ `scripts/api-regression/out/<ชื่อรอบ>/` (อยู่ใน `.gitignore`) — ไฟล์ละหนึ่ง Request
(`method`, `path`, `requestBody`, `status`, `responseBody`) และ `summary.json` (จำนวน Request ต่อ Route,
Status ที่ไม่ตรงกับที่คาด) — ห้ามใช้ชื่อรอบซ้ำ ถ้าต้องรันใหม่ให้ลบโฟลเดอร์เดิมเอง

`run.ts` หยุดเอง (Exit code 3) ถ้า Login Admin ไม่สำเร็จ หรือ Server มีผู้ใช้มากกว่า 1 คนตอนเริ่ม

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
