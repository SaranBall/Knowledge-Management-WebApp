-- =====================================================================
-- KM-RMP Portal — Verify schema หลังรัน 0001 + 0002
--   psql -U postgres -d km_rmp -v ON_ERROR_STOP=1 -f db/verify/verify_schema.sql
--
-- ทุกการทดสอบอยู่ใน Transaction เดียวแล้ว ROLLBACK — ไม่ทิ้งข้อมูลทดสอบไว้
-- ผ่าน = เห็น NOTICE "PASS ..." ครบทุกข้อและจบด้วย "ALL CHECKS PASSED"
-- ไม่ผ่าน = Script หยุดที่ข้อแรกที่ FAIL พร้อมข้อความ
-- =====================================================================

\set ON_ERROR_STOP on
\encoding UTF8

BEGIN;

-- ---------------------------------------------------------------------
-- S: โครงสร้าง
-- ---------------------------------------------------------------------
DO $$
DECLARE
  expected text[] := ARRAY[
    'attendance_logs','contact_requests','course_lessons','course_quiz_questions',
    'course_target_departments','courses','custom_resources','departments',
    'document_allowed_departments','documents','employee_master','exam_results',
    'experts','kb_articles','km_contribution_logs','quiz_submissions','ratings',
    'search_logs','search_resolutions','stored_files','system_audit_logs',
    'training_sessions','user_certificates','user_competencies',
    'user_course_progress','users'];
  actual text[];
BEGIN
  SELECT array_agg(table_name::text ORDER BY table_name) INTO actual
  FROM information_schema.tables
  WHERE table_schema = 'km' AND table_type = 'BASE TABLE';
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL S01 tables: expected % got %', expected, actual;
  END IF;
  RAISE NOTICE 'PASS S01 26 tables present';

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'km' AND tableowner <> 'km_owner') THEN
    RAISE EXCEPTION 'FAIL S02 some tables not owned by km_owner';
  END IF;
  RAISE NOTICE 'PASS S02 all tables owned by km_owner';

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'km' AND table_name = 'courses' AND column_name = 'target_positions') THEN
    RAISE EXCEPTION 'FAIL S03 courses.target_positions must not exist (§21.24 G-12)';
  END IF;
  RAISE NOTICE 'PASS S03 courses.target_positions absent';

  IF (SELECT count(*) FROM km.departments) <> 20
     OR (SELECT count(*) FROM km.departments WHERE parent_id IS NULL) <> 14 THEN
    RAISE EXCEPTION 'FAIL S04 department seed count';
  END IF;
  RAISE NOTICE 'PASS S04 departments seeded 20 (14 main + 6 sub)';

  IF (SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database()) <> 'UTF8' THEN
    RAISE EXCEPTION 'FAIL S05 database encoding is not UTF8';
  END IF;
  RAISE NOTICE 'PASS S05 encoding UTF8 (collate=%)',
    (SELECT datcollate FROM pg_database WHERE datname = current_database());

  -- S06 ชื่อแผนกตรงกับ departmentUtils.ts (ภาษาอังกฤษล้วน) และ Client encoding รับภาษาไทยได้ถูกต้อง
  IF (SELECT name FROM km.departments WHERE id = 'd-pd-dl') IS DISTINCT FROM 'Dry-Lamination'
     OR (SELECT name FROM km.departments WHERE id = 'd-pd-sp') IS DISTINCT FROM 'Powder Spray' THEN
    RAISE EXCEPTION 'FAIL S06a department names differ from departmentUtils.ts';
  END IF;
  IF octet_length('ทดสอบ') <> 15 THEN
    RAISE EXCEPTION 'FAIL S06b Thai text not received as UTF-8 (client encoding?)';
  END IF;
  RAISE NOTICE 'PASS S06 department names match source; Thai text received as UTF-8';
END $$;

-- ข้อมูลตั้งต้นสำหรับการทดสอบ
INSERT INTO km.documents (id, department_id, status) VALUES ('t-doc-1', 'd-pd', 'Published');
INSERT INTO km.courses (id) VALUES ('t-course-1');

-- ---------------------------------------------------------------------
-- C: Constraint ปฏิเสธข้อมูลผิดได้จริง
-- ---------------------------------------------------------------------
DO $$
BEGIN
  -- C01 FK users.department_id (E-1)
  BEGIN
    INSERT INTO km.users (id, department_id) VALUES ('t-u-bad', 'Select Department');
    RAISE EXCEPTION 'FAIL C01 users accepted unknown department';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS C01 users.department_id FK';
  END;

  -- C02 employee_id ซ้ำแบบไม่สนตัวพิมพ์ (OD-UQ-01); NULL หลายแถวได้
  INSERT INTO km.users (id, employee_id, department_id) VALUES ('t-u-1', 'EMP001', 'd-hr');
  INSERT INTO km.users (id) VALUES ('t-u-n1'), ('t-u-n2');
  BEGIN
    INSERT INTO km.users (id, employee_id) VALUES ('t-u-2', 'emp001');
    RAISE EXCEPTION 'FAIL C02 duplicate employee_id (case-insensitive) accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS C02 users.employee_id unique lower() + multiple NULL';
  END;

  -- C03 ลบแผนกที่มีผู้ใช้อ้างถึงไม่ได้ (RESTRICT)
  BEGIN
    DELETE FROM km.departments WHERE id = 'd-hr';
    RAISE EXCEPTION 'FAIL C03 referenced department deleted';
  -- PostgreSQL 18 รายงาน ON DELETE RESTRICT เป็น restrict_violation (23001); รุ่นเก่าเป็น foreign_key_violation (23503)
  EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN RAISE NOTICE 'PASS C03 department delete restricted (SQLSTATE %)', SQLSTATE;
  END;

  -- C04 departments.code ซ้ำแบบไม่สนตัวพิมพ์ (OD-UQ-09)
  BEGIN
    INSERT INTO km.departments (id, code, name) VALUES ('t-d-x', 'hr', 'dup');
    RAISE EXCEPTION 'FAIL C04 duplicate department code accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS C04 departments.code unique lower()';
  END;

  -- C05 ACL: แผนกไม่มีจริง / ordinal ซ้ำ / CASCADE เมื่อลบเอกสาร
  INSERT INTO km.document_allowed_departments VALUES ('t-doc-1', 'd-pd', 0), ('t-doc-1', 'd-pd-dl', 1);
  BEGIN
    INSERT INTO km.document_allowed_departments VALUES ('t-doc-1', 'nope', 2);
    RAISE EXCEPTION 'FAIL C05a ACL unknown department accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS C05a ACL department FK';
  END;
  BEGIN
    INSERT INTO km.document_allowed_departments VALUES ('t-doc-1', 'd-hr', 1);
    RAISE EXCEPTION 'FAIL C05b ACL duplicate ordinal accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS C05b ACL ordinal unique';
  END;

  -- C06 course_target_departments FK + CHECK ของอายุใบรับรอง
  INSERT INTO km.course_target_departments VALUES ('t-course-1', 'd-wh', 0);
  BEGIN
    INSERT INTO km.course_target_departments VALUES ('t-course-1', 'nope', 1);
    RAISE EXCEPTION 'FAIL C06a course target unknown department accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS C06a course_target_departments FK';
  END;
  BEGIN
    UPDATE km.courses SET certificate_validity_months = 0 WHERE id = 't-course-1';
    RAISE EXCEPTION 'FAIL C06b certificate_validity_months = 0 accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS C06b certificate_validity_months > 0';
  END;
  IF (SELECT is_mandatory OR NOT issues_certificate FROM km.courses WHERE id = 't-course-1') THEN
    RAISE EXCEPTION 'FAIL C06c course defaults';
  END IF;
  RAISE NOTICE 'PASS C06c course defaults is_mandatory=false issues_certificate=true';

  -- C07 คะแนน (E-3)
  INSERT INTO km.quiz_submissions (id, user_id, user_name, employee_id, course_id, course_title,
    answers, auto_correct, auto_total, essay_question_ids, status, score, submitted_at)
  VALUES ('t-qs-1', 't-u-1', 'n', 'EMP001', 't-course-1', 'c', '{"__proto__":"x"}', 2, 3, '{}',
    'Finalized', 66.66, now());
  BEGIN
    UPDATE km.quiz_submissions SET score = 66.666 WHERE id = 't-qs-1';
    RAISE EXCEPTION 'FAIL C07a score with 3 decimals accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS C07a score decimals CHECK';
  END;
  BEGIN
    UPDATE km.quiz_submissions SET score = 100.01 WHERE id = 't-qs-1';
    RAISE EXCEPTION 'FAIL C07b score > 100 accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS C07b score range CHECK';
  END;
  IF (SELECT answers ->> '__proto__' FROM km.quiz_submissions WHERE id = 't-qs-1') IS DISTINCT FROM 'x' THEN
    RAISE EXCEPTION 'FAIL C07c answers __proto__ key not preserved';
  END IF;
  RAISE NOTICE 'PASS C07c answers JSONB keeps __proto__ key';

  -- C08 Pending ซ้ำ (OD-UQ-06)
  INSERT INTO km.quiz_submissions (id, user_id, user_name, employee_id, course_id, course_title,
    answers, auto_correct, auto_total, essay_question_ids, status, submitted_at)
  VALUES ('t-qs-2', 't-u-1', 'n', 'EMP001', 't-course-1', 'c', '{}', 0, 1, '{}', 'PendingReview', now());
  BEGIN
    INSERT INTO km.quiz_submissions (id, user_id, user_name, employee_id, course_id, course_title,
      answers, auto_correct, auto_total, essay_question_ids, status, submitted_at)
    VALUES ('t-qs-3', 't-u-1', 'n', 'EMP001', 't-course-1', 'c', '{}', 0, 1, '{}', 'PendingReview', now());
    RAISE EXCEPTION 'FAIL C08 second PendingReview accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS C08 one PendingReview per user+course';
  END;

  -- C09 search_resolutions.keyword: ซ้ำตรงตัวไม่ได้ / ต่างตัวพิมพ์ได้ / Backslash และข้อความยาวได้
  INSERT INTO km.search_resolutions (id, keyword, action, resolved_by, resolved_by_name, resolved_at)
  VALUES ('t-sr-1', 'Motor', 'a', 'x', 'x', now()),
         ('t-sr-2', 'motor', 'a', 'x', 'x', now()),
         ('t-sr-3', E'C:\\path\\x41', 'a', 'x', 'x', now()),
         ('t-sr-4', repeat('ก', 20000), 'a', 'x', 'x', now());
  BEGIN
    INSERT INTO km.search_resolutions (id, keyword, action, resolved_by, resolved_by_name, resolved_at)
    VALUES ('t-sr-5', 'Motor', 'a', 'x', 'x', now());
    RAISE EXCEPTION 'FAIL C09 duplicate keyword accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS C09 keyword unique case-sensitive (backslash + 20,000-char Thai ok)';
  END;

  -- C10 stored_files: bound ต้องมี entity / unbound ห้ามมี entity
  BEGIN
    INSERT INTO km.stored_files (id, storage_key, stored_name, binding_status, file_status)
    VALUES ('t-f-1', 'k1', 'n1', 'bound', 'present');
    RAISE EXCEPTION 'FAIL C10a bound without entity accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS C10a stored_files bound requires entity';
  END;
  BEGIN
    INSERT INTO km.stored_files (id, storage_key, stored_name, binding_status, file_status,
      bound_entity_type, bound_entity_id)
    VALUES ('t-f-2', 'k2', 'n2', 'unbound', 'present', 'document', 't-doc-1');
    RAISE EXCEPTION 'FAIL C10b unbound with entity accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS C10b stored_files unbound forbids entity';
  END;

  -- C11 Attendance: ซ้ำได้เมื่อแถวเดิมถูก Soft delete (OD-UQ-07)
  INSERT INTO km.attendance_logs (id, user_id, session_id, deleted_at) VALUES ('t-a-1', 't-u-1', 's1', now());
  INSERT INTO km.attendance_logs (id, user_id, session_id) VALUES ('t-a-2', 't-u-1', 's1');
  BEGIN
    INSERT INTO km.attendance_logs (id, user_id, session_id) VALUES ('t-a-3', 't-u-1', 's1');
    RAISE EXCEPTION 'FAIL C11 duplicate active attendance accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS C11 attendance unique among non-deleted';
  END;

  -- C12 ลบเอกสาร → ACL ถูกลบตาม (CASCADE)
  DELETE FROM km.documents WHERE id = 't-doc-1';
  IF EXISTS (SELECT 1 FROM km.document_allowed_departments WHERE document_id = 't-doc-1') THEN
    RAISE EXCEPTION 'FAIL C12 ACL rows not cascaded';
  END IF;
  RAISE NOTICE 'PASS C12 document delete cascades ACL';

  -- C13 collection_order เพิ่มขึ้นตามลำดับการ Insert
  IF (SELECT collection_order FROM km.search_resolutions WHERE id = 't-sr-1')
     >= (SELECT collection_order FROM km.search_resolutions WHERE id = 't-sr-4') THEN
    RAISE EXCEPTION 'FAIL C13 collection_order not increasing';
  END IF;
  RAISE NOTICE 'PASS C13 collection_order increases with insert order';
END $$;

-- ---------------------------------------------------------------------
-- P: สิทธิ์ของ km_app
-- ---------------------------------------------------------------------
SET LOCAL ROLE km_app;

DO $$
BEGIN
  INSERT INTO km.system_audit_logs (id, action, details, performed_by, "timestamp")
  VALUES ('t-log-1', 'TEST', 'verify', 'verify', now());
  RAISE NOTICE 'PASS P01 km_app can INSERT audit log';

  BEGIN
    UPDATE km.system_audit_logs SET details = 'changed' WHERE id = 't-log-1';
    RAISE EXCEPTION 'FAIL P02 km_app updated audit log';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS P02 km_app cannot UPDATE audit log';
  END;

  BEGIN
    DELETE FROM km.system_audit_logs WHERE id = 't-log-1';
    RAISE EXCEPTION 'FAIL P03 km_app deleted audit log';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS P03 km_app cannot DELETE audit log';
  END;

  INSERT INTO km.search_resolutions (id, keyword, action, resolved_by, resolved_by_name, resolved_at)
  VALUES ('t-sr-app', 'app-insert', 'a', 'x', 'x', now());
  UPDATE km.courses SET title = 'by app' WHERE id = 't-course-1';
  DELETE FROM km.search_resolutions WHERE id = 't-sr-app';
  RAISE NOTICE 'PASS P04 km_app can INSERT/UPDATE/DELETE app tables (incl. hash index)';

  BEGIN
    CREATE TABLE km.should_fail (x int);
    RAISE EXCEPTION 'FAIL P05 km_app created a table';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS P05 km_app cannot CREATE in schema km';
  END;

  BEGIN
    TRUNCATE km.search_logs;
    RAISE EXCEPTION 'FAIL P06 km_app truncated a table';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS P06 km_app cannot TRUNCATE';
  END;

  RAISE NOTICE 'ALL CHECKS PASSED';
END $$;

ROLLBACK;
