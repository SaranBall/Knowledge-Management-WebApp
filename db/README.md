# db/ — PostgreSQL schema ของ KM-RMP Portal

อ้างอิง: Final ERD Rev.2 (Owner Approved 2026-11-25) และ Addenda §21.22, §21.24 (เก็บในชุดเอกสารนอก Repo)

ใช้ไฟล์ชุดเดียวกันทั้งเครื่อง Dev และ Prod — รันตามลำดับด้วย Superuser `postgres`

| ลำดับ | ไฟล์ | ต่อฐาน | รันซ้ำได้ |
|---:|---|---|---|
| 1 | `setup/0000_create_roles_and_database.sql` | `postgres` | ได้ |
| 2 | ตั้งรหัสผ่าน: `\password km_owner` และ `\password km_app` ใน psql (ไม่ใส่รหัสในไฟล์หรือ Command line) | `postgres` | — |
| 3 | `probe/e3_score_check.sql` (ต้องได้ `rows_failing_check = 0`) | `km_rmp` | ได้ (ROLLBACK) |
| 4 | `migrations/0001_initial_schema.sql` | `km_rmp` | **ไม่ได้** — รันครั้งเดียว |
| 5 | `migrations/0002_seed_departments.sql` | `km_rmp` | ได้ |
| 6 | `verify/verify_schema.sql` (ต้องจบด้วย `ALL CHECKS PASSED`) | `km_rmp` | ได้ (ROLLBACK) |

ตัวอย่าง (PowerShell บน Windows):

```powershell
psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/setup/0000_create_roles_and_database.sql
psql -U postgres -d postgres          # แล้วพิมพ์ \password km_owner และ \password km_app
psql -U postgres -d km_rmp -v ON_ERROR_STOP=1 -f db/probe/e3_score_check.sql
psql -U postgres -d km_rmp -v ON_ERROR_STOP=1 -f db/migrations/0001_initial_schema.sql
psql -U postgres -d km_rmp -v ON_ERROR_STOP=1 -f db/migrations/0002_seed_departments.sql
psql -U postgres -d km_rmp -v ON_ERROR_STOP=1 -f db/verify/verify_schema.sql
```

ย้อนกลับ (เฉพาะเครื่องที่ยังไม่มีข้อมูลจริง):

```sql
DROP DATABASE km_rmp;
DROP ROLE km_app;
DROP ROLE km_owner;
```

หมายเหตุ
- Locale/Collation ใช้ค่าเริ่มต้นของ Cluster — Dev และ Prod ต้องติดตั้ง PostgreSQL ด้วย Locale เดียวกัน (§21.24 E-4)
- Migration runner ของแอป (PERSIST-01C) จะบันทึก 0001/0002 เป็น Baseline ที่รันแล้ว
- ตารางที่เพิ่มใน Migration ถัดไปต้อง `GRANT` ให้ `km_app` ในไฟล์นั้นเอง
