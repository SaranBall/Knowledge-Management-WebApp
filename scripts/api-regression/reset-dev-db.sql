-- =====================================================================
-- PERSIST-01C-1 A3 — ล้างฐานทดสอบ km_rmp บนเครื่อง Dev เท่านั้น
--
-- ห้ามใช้กับเครื่อง Prod · ห้ามคัดลอกโฟลเดอร์ scripts\ ไปเครื่อง Prod
-- Owner รันเองด้วย Superuser postgres (km_app ไม่มีสิทธิ์ TRUNCATE โดยเจตนา):
--   psql -U postgres -d km_rmp -v confirm_dev_reset=YES -f scripts/api-regression/reset-dev-db.sql
--
-- ทำอะไร: TRUNCATE ... RESTART IDENTITY ทุกตารางใน Schema km ยกเว้น km.departments
--         (ข้อมูลแผนกจาก db/migrations/0002 คงอยู่) แล้วแสดงจำนวนแถวหลังล้าง
-- หยุดโดยไม่ล้างอะไร (ERROR ข้อความ ABORT และ psql จบด้วย exit code 3 จาก ON_ERROR_STOP) เมื่อ:
--   - ไม่ได้ส่ง -v confirm_dev_reset หรือค่าไม่ใช่ YES ตรงตัว
--   - ไม่ได้ต่อฐาน km_rmp
-- =====================================================================

\encoding UTF8
\set ON_ERROR_STOP on

\if :{?confirm_dev_reset}
\else
  DO $$ BEGIN RAISE EXCEPTION 'ABORT: run with -v confirm_dev_reset=YES -- nothing was changed'; END $$;
\endif

SELECT (:'confirm_dev_reset' = 'YES') AS dev_reset_confirmed \gset
\if :dev_reset_confirmed
\else
  DO $$ BEGIN RAISE EXCEPTION 'ABORT: confirm_dev_reset must be exactly YES -- nothing was changed'; END $$;
\endif

SELECT (current_database() = 'km_rmp') AS is_km_rmp \gset
\if :is_km_rmp
\else
  DO $$ BEGIN RAISE EXCEPTION 'ABORT: connected database is not km_rmp -- nothing was changed'; END $$;
\endif

\echo 'Resetting km_rmp (all km tables except km.departments) ...'

BEGIN;

-- 25 ตาราง (ทุกตารางใน Schema km ยกเว้น departments) — ระบุชื่อตรง ๆ ตาม db/migrations/0001
TRUNCATE TABLE
  km.users,
  km.employee_master,
  km.documents,
  km.document_allowed_departments,
  km.courses,
  km.course_target_departments,
  km.course_lessons,
  km.course_quiz_questions,
  km.kb_articles,
  km.experts,
  km.stored_files,
  km.quiz_submissions,
  km.exam_results,
  km.user_course_progress,
  km.user_certificates,
  km.user_competencies,
  km.training_sessions,
  km.attendance_logs,
  km.km_contribution_logs,
  km.ratings,
  km.search_logs,
  km.search_resolutions,
  km.contact_requests,
  km.custom_resources,
  km.system_audit_logs
RESTART IDENTITY;

COMMIT;

-- จำนวนแถวหลังล้าง: departments ต้องเหลือ 20, ตารางอื่น 0 (all_ok = true ทุกแถวเมื่อผ่านทั้งหมด)
WITH counts AS (
            SELECT 'departments'                  AS table_name, count(*) AS row_count FROM km.departments
  UNION ALL SELECT 'users',                        count(*) FROM km.users
  UNION ALL SELECT 'employee_master',              count(*) FROM km.employee_master
  UNION ALL SELECT 'documents',                    count(*) FROM km.documents
  UNION ALL SELECT 'document_allowed_departments', count(*) FROM km.document_allowed_departments
  UNION ALL SELECT 'courses',                      count(*) FROM km.courses
  UNION ALL SELECT 'course_target_departments',    count(*) FROM km.course_target_departments
  UNION ALL SELECT 'course_lessons',               count(*) FROM km.course_lessons
  UNION ALL SELECT 'course_quiz_questions',        count(*) FROM km.course_quiz_questions
  UNION ALL SELECT 'kb_articles',                  count(*) FROM km.kb_articles
  UNION ALL SELECT 'experts',                      count(*) FROM km.experts
  UNION ALL SELECT 'stored_files',                 count(*) FROM km.stored_files
  UNION ALL SELECT 'quiz_submissions',             count(*) FROM km.quiz_submissions
  UNION ALL SELECT 'exam_results',                 count(*) FROM km.exam_results
  UNION ALL SELECT 'user_course_progress',         count(*) FROM km.user_course_progress
  UNION ALL SELECT 'user_certificates',            count(*) FROM km.user_certificates
  UNION ALL SELECT 'user_competencies',            count(*) FROM km.user_competencies
  UNION ALL SELECT 'training_sessions',            count(*) FROM km.training_sessions
  UNION ALL SELECT 'attendance_logs',              count(*) FROM km.attendance_logs
  UNION ALL SELECT 'km_contribution_logs',         count(*) FROM km.km_contribution_logs
  UNION ALL SELECT 'ratings',                      count(*) FROM km.ratings
  UNION ALL SELECT 'search_logs',                  count(*) FROM km.search_logs
  UNION ALL SELECT 'search_resolutions',           count(*) FROM km.search_resolutions
  UNION ALL SELECT 'contact_requests',             count(*) FROM km.contact_requests
  UNION ALL SELECT 'custom_resources',             count(*) FROM km.custom_resources
  UNION ALL SELECT 'system_audit_logs',            count(*) FROM km.system_audit_logs
), checked AS (
  SELECT table_name, row_count,
         CASE WHEN table_name = 'departments' THEN row_count = 20 ELSE row_count = 0 END AS ok
  FROM counts
)
SELECT table_name, row_count, ok, bool_and(ok) OVER () AS all_ok, count(*) OVER () AS tables_checked
FROM checked
ORDER BY (table_name <> 'departments'), table_name;
