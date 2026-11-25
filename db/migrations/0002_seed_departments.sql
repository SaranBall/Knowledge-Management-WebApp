-- =====================================================================
-- KM-RMP Portal — 0002: Seed departments (20 รายการจาก src/utils/departmentUtils.ts DEPARTMENTS_FLAT)
-- ชื่อแผนกย่อยเป็นภาษาอังกฤษล้วนตามที่ Owner แก้ใน departmentUtils.ts (2026-11-25, ยืนยันแบบ ก)
-- อ้างอิง: F-08 (คง 20 ID เดิม), Addendum §21.23 §3 (Seed cut-over)
--
--   psql -U postgres -d km_rmp -v ON_ERROR_STOP=1 -f db/migrations/0002_seed_departments.sql
--
-- รันซ้ำได้: ON CONFLICT (id) DO NOTHING — ไม่ทับแถวที่มีอยู่แล้ว
-- (ยังไม่ตัดสิน G-3 ว่าแหล่งข้อมูลแผนกหลักคือโค้ดหรือ DB จึงเลือก "ใส่เฉพาะที่ยังไม่มี"
--  เพื่อไม่ทับค่าที่อาจถูกแก้ใน DB ภายหลัง; ถ้า G-3 เลือกให้โค้ดเป็นหลัก แอปจะซิงก์เอง)
-- =====================================================================

\set ON_ERROR_STOP on
\encoding UTF8

BEGIN;

SET LOCAL ROLE km_owner;

-- Main departments (14) — ต้องมาก่อน Sub เพราะ FK parent_id
INSERT INTO km.departments (id, parent_id, code, name) VALUES
  ('d-hr', NULL, 'HR', 'Human Resources'),
  ('d-cs', NULL, 'CS', 'Customer Service'),
  ('d-af', NULL, 'AF', 'Accounting & Finance'),
  ('d-pm', NULL, 'PM', 'Procurement'),
  ('d-qs', NULL, 'QS', 'Quality & Safety Systems'),
  ('d-fc', NULL, 'FC', 'Production Management Office'),
  ('d-qa', NULL, 'QA', 'Quality Assurance & Control'),
  ('d-wh', NULL, 'WH', 'Warehouse'),
  ('d-en', NULL, 'EN', 'Engineering'),
  ('d-sm', NULL, 'SM', 'Sales & Marketing'),
  ('d-tc', NULL, 'TC', 'Technical'),
  ('d-pc', NULL, 'PC', 'Planning & Production Control'),
  ('d-pd', NULL, 'PD', 'Production'),
  ('d-it', NULL, 'IT', 'Information Technology')
ON CONFLICT (id) DO NOTHING;

-- Sub-departments ใต้ d-pd (6)
INSERT INTO km.departments (id, parent_id, code, name) VALUES
  ('d-pd-dl', 'd-pd', 'DL', 'Dry-Lamination'),
  ('d-pd-bm', 'd-pd', 'BM', 'Bag-Making'),
  ('d-pd-sl', 'd-pd', 'SL', 'Slitting'),
  ('d-pd-pt', 'd-pd', 'PT', 'Printing'),
  ('d-pd-in', 'd-pd', 'IN', 'Inspection'),
  ('d-pd-sp', 'd-pd', 'PS', 'Powder Spray')
ON CONFLICT (id) DO NOTHING;

-- ตรวจผลสำหรับรายงาน: ต้องได้ main = 14, sub = 6
SELECT count(*) FILTER (WHERE parent_id IS NULL)     AS main_departments,
       count(*) FILTER (WHERE parent_id IS NOT NULL) AS sub_departments
FROM km.departments;

COMMIT;
