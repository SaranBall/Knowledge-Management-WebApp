-- =====================================================================
-- KM-RMP Portal — 0000: Roles + Database (ระดับ Server)
-- อ้างอิง: Final ERD Rev.2 (Owner Approved 2026-11-25), Addendum §21.22, §21.24 E-4
--
-- รันด้วย Superuser (postgres) ต่อฐาน `postgres`:
--   psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/setup/0000_create_roles_and_database.sql
--
-- ไฟล์นี้ไม่มีรหัสผ่าน — ตั้งรหัสผ่านหลังรันด้วยคำสั่งแบบโต้ตอบ (ไม่แสดงบนจอ):
--   psql -U postgres -d postgres -c "\password km_owner"
--   psql -U postgres -d postgres -c "\password km_app"
-- (หรือเปิด psql แล้วพิมพ์ \password km_owner / \password km_app)
--
-- รันซ้ำได้: ข้าม Role/Database ที่มีอยู่แล้ว
-- Collation/Locale: ใช้ค่าเริ่มต้นของ Cluster (E-4) — Dev และ Prod ต้องติดตั้ง PostgreSQL ด้วย Locale เดียวกัน
-- =====================================================================

\set ON_ERROR_STOP on
\encoding UTF8

-- Roles -----------------------------------------------------------------
-- km_owner : เจ้าของ Schema `km` ใช้รัน Migration
-- km_app   : บัญชีที่แอปใช้ (DML เท่านั้น, สิทธิ์รายตารางกำหนดใน 0001)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'km_owner') THEN
    CREATE ROLE km_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'km_app') THEN
    CREATE ROLE km_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;

-- Database ----------------------------------------------------------------
SELECT 'CREATE DATABASE km_rmp OWNER km_owner ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'km_rmp')
\gexec

REVOKE ALL ON DATABASE km_rmp FROM PUBLIC;
GRANT CONNECT ON DATABASE km_rmp TO km_app;

ALTER ROLE km_owner IN DATABASE km_rmp SET search_path = km;
ALTER ROLE km_app   IN DATABASE km_rmp SET search_path = km;

-- แสดงผลสำหรับรายงาน (ไม่มีข้อมูลลับ)
SELECT datname, pg_encoding_to_char(encoding) AS encoding, datcollate, datctype
FROM pg_database WHERE datname = 'km_rmp';
