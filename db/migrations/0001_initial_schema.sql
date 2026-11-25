-- =====================================================================
-- KM-RMP Portal — 0001: Initial schema (26 ตาราง)
-- อ้างอิง: persist/PERSIST-01B_Final_ERD_2026-11-24.md (Rev.2, Owner Approved 2026-11-25)
--          Master V6 + Addenda §21.20–§21.24
--
-- รันด้วย Superuser ต่อฐาน km_rmp (สร้าง Object ในนาม km_owner ผ่าน SET ROLE):
--   psql -U postgres -d km_rmp -v ON_ERROR_STOP=1 -f db/migrations/0001_initial_schema.sql
--
-- ทั้งไฟล์อยู่ใน Transaction เดียว — ผิดพลาดจุดใดจะไม่มีอะไรถูกสร้าง
-- ก่อนรัน: ต้องรัน db/probe/e3_score_check.sql ให้ผ่านก่อน (E-3)
--   ถ้า Probe ไม่ผ่าน ให้แก้ quiz_submissions_score_ck เป็น
--   CHECK (score IS NULL OR (score >= 0 AND score <= 100)) แล้วรายงาน Owner
--
-- กฎทั่วไป (ERD §1):
--   R1 ID = TEXT · R2 NOT NULL เฉพาะที่ทุก Writer เขียนเสมอ · R3 ไม่มี ENUM/CHECK ที่แคบกว่า Source
--   R4 collection_order = BIGINT IDENTITY (unshift → อ่าน DESC, push → อ่าน ASC)
--   R5 เวลา Server = TIMESTAMPTZ, ค่าวันที่จาก Client = TEXT · R8 คะแนน = DOUBLE PRECISION
--   R10 FK เฉพาะที่อนุมัติ (E-1); ที่เหลือเป็น Logical reference
-- ชื่อ Constraint ตั้งชัดเจนเพื่อให้ Adapter แปลง Error → HTTP (เช่น 409) ได้
-- =====================================================================

\set ON_ERROR_STOP on
\encoding UTF8

BEGIN;

SET LOCAL ROLE km_owner;

CREATE SCHEMA km AUTHORIZATION km_owner;

SET LOCAL search_path = km;

-- ---------------------------------------------------------------------
-- Helper: Hash ของข้อความแบบ Case-sensitive สำหรับ UNIQUE ของ keyword (FS-07, C-01)
-- convert_to() เป็น STABLE จึงห่อเป็น IMMUTABLE — ถูกต้องเพราะ km_rmp เป็น UTF8 ตายตัว
-- (ไม่ใช้ keyword::bytea เพราะตีความ Backslash เป็น Escape และ Error กับบางค่า)
-- ---------------------------------------------------------------------
CREATE FUNCTION km.text_sha256(t text) RETURNS bytea
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$ SELECT sha256(convert_to(t, 'UTF8')) $$;

-- =====================================================================
-- 4.1 Master / Configuration
-- =====================================================================

-- departments (Seed: 0002) — F-08
CREATE TABLE km.departments (
  id          TEXT        NOT NULL,
  parent_id   TEXT,
  code        TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT departments_pk PRIMARY KEY (id),
  CONSTRAINT departments_parent_fk FOREIGN KEY (parent_id)
    REFERENCES km.departments (id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX departments_code_lower_uq ON km.departments (lower(code));   -- OD-UQ-09

-- users — db_users (push → ASC)
CREATE TABLE km.users (
  id                TEXT   NOT NULL,
  employee_id       TEXT,
  name              TEXT,
  position          TEXT,
  role              TEXT,
  email             TEXT,
  phone             TEXT,
  department_id     TEXT,
  avatar_url        TEXT,
  password_hash     TEXT,
  status            TEXT,
  start_date        TEXT,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT users_pk PRIMARY KEY (id),
  CONSTRAINT users_department_fk FOREIGN KEY (department_id)          -- E-1 (ต้องมี C-05 ใน PERSIST-01C)
    REFERENCES km.departments (id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX users_employee_id_lower_uq ON km.users (lower(employee_id));  -- OD-UQ-01 (NULL หลายแถวได้)

-- employee_master — db_employee_master (sort_order แทน collection_order)
CREATE TABLE km.employee_master (
  row_id         TEXT   NOT NULL,
  sort_order     BIGINT NOT NULL,
  employee_id    TEXT,                 -- ไม่มี UNIQUE (OD-UQ-02)
  name           TEXT,
  position       TEXT,
  level          TEXT,
  email          TEXT,
  phone          TEXT,
  status         TEXT,
  department_id  TEXT,                 -- ref (E-1): เก็บค่าดิบที่ Resolve ไม่ได้
  start_date     TEXT,
  CONSTRAINT employee_master_pk PRIMARY KEY (row_id)
);

-- documents — db_documents (unshift → DESC)
CREATE TABLE km.documents (
  id                   TEXT    NOT NULL,
  department_id        TEXT    NOT NULL,
  title                TEXT,
  description          TEXT,
  type                 TEXT,
  owner                TEXT,
  revision             DOUBLE PRECISION,
  effective_date       TEXT,
  status               TEXT    NOT NULL,
  approved_by          TEXT,
  approved_at          TIMESTAMPTZ,
  file_url             TEXT,
  real_file_url        TEXT,
  file_type            TEXT,
  example_text         TEXT,
  example_image        TEXT,
  example_video        TEXT,
  parsed_excel_sheets  JSONB,
  views                INTEGER NOT NULL DEFAULT 0,
  downloads            INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT,
  tags                 TEXT[],
  collection_order     BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT documents_pk PRIMARY KEY (id),
  CONSTRAINT documents_department_fk FOREIGN KEY (department_id)
    REFERENCES km.departments (id) ON DELETE RESTRICT
);

-- document_allowed_departments (FS-02)
CREATE TABLE km.document_allowed_departments (
  document_id    TEXT    NOT NULL,
  department_id  TEXT    NOT NULL,
  ordinal        INTEGER NOT NULL,
  CONSTRAINT document_allowed_departments_pk PRIMARY KEY (document_id, department_id),
  CONSTRAINT document_allowed_departments_ordinal_uq UNIQUE (document_id, ordinal),
  CONSTRAINT document_allowed_departments_ordinal_ck CHECK (ordinal >= 0),
  CONSTRAINT document_allowed_departments_document_fk FOREIGN KEY (document_id)
    REFERENCES km.documents (id) ON DELETE CASCADE,
  CONSTRAINT document_allowed_departments_department_fk FOREIGN KEY (department_id)
    REFERENCES km.departments (id) ON DELETE RESTRICT
);

-- courses — db_courses (unshift → DESC); target_positions ยกเลิก (§21.24 G-12)
CREATE TABLE km.courses (
  id                           TEXT    NOT NULL,
  title                        TEXT,
  description                  TEXT,
  type                         TEXT,
  badge_key                    TEXT,
  is_mandatory                 BOOLEAN NOT NULL DEFAULT false,   -- §21.24 §3.1
  issues_certificate           BOOLEAN NOT NULL DEFAULT true,    -- §21.24 §3.2
  certificate_validity_months  INTEGER,                          -- NULL = ไม่หมดอายุ
  min_pass_score               DOUBLE PRECISION,
  duration_hours               TEXT,
  duration_minutes             DOUBLE PRECISION,                 -- ใช้คิดขนาดหลักสูตรสำหรับ XP (§21.24 §3.3)
  tags                         TEXT[],
  is_approved                  BOOLEAN,                          -- NULL = Pending (F-04)
  created_by_role              TEXT,
  collection_order             BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT courses_pk PRIMARY KEY (id),
  CONSTRAINT courses_certificate_validity_months_ck
    CHECK (certificate_validity_months IS NULL OR certificate_validity_months > 0)
);

-- course_target_departments (§21.24 §3.1)
CREATE TABLE km.course_target_departments (
  course_id      TEXT    NOT NULL,
  department_id  TEXT    NOT NULL,
  ordinal        INTEGER NOT NULL,
  CONSTRAINT course_target_departments_pk PRIMARY KEY (course_id, department_id),
  CONSTRAINT course_target_departments_ordinal_uq UNIQUE (course_id, ordinal),
  CONSTRAINT course_target_departments_ordinal_ck CHECK (ordinal >= 0),
  CONSTRAINT course_target_departments_course_fk FOREIGN KEY (course_id)
    REFERENCES km.courses (id) ON DELETE CASCADE,
  CONSTRAINT course_target_departments_department_fk FOREIGN KEY (department_id)
    REFERENCES km.departments (id) ON DELETE RESTRICT
);

-- course_lessons — Course.lessons[]
CREATE TABLE km.course_lessons (
  course_id         TEXT    NOT NULL,
  ordinal           INTEGER NOT NULL,
  id                TEXT,               -- Client ID, ไม่ UNIQUE (§21.11 B)
  title             TEXT,
  content           TEXT,
  media_type        TEXT,
  media_url         TEXT,
  duration_minutes  DOUBLE PRECISION,
  CONSTRAINT course_lessons_pk PRIMARY KEY (course_id, ordinal),
  CONSTRAINT course_lessons_ordinal_ck CHECK (ordinal >= 0),
  CONSTRAINT course_lessons_course_fk FOREIGN KEY (course_id)
    REFERENCES km.courses (id) ON DELETE CASCADE
);

-- course_quiz_questions — Course.quiz[]
CREATE TABLE km.course_quiz_questions (
  course_id       TEXT    NOT NULL,
  ordinal         INTEGER NOT NULL,
  question_id     TEXT,                 -- API `id`, ไม่ UNIQUE (Master §2.7)
  question        TEXT,
  type            TEXT,
  correct_answer  TEXT,                 -- F-20
  options         TEXT[],               -- §21.20.B
  pairs           JSONB,
  CONSTRAINT course_quiz_questions_pk PRIMARY KEY (course_id, ordinal),
  CONSTRAINT course_quiz_questions_ordinal_ck CHECK (ordinal >= 0),
  CONSTRAINT course_quiz_questions_course_fk FOREIGN KEY (course_id)
    REFERENCES km.courses (id) ON DELETE CASCADE
);

-- kb_articles — db_kb_articles (unshift → DESC); PUT แทนทั้งก้อน → NULL ได้ทุกคอลัมน์ยกเว้น PK
CREATE TABLE km.kb_articles (
  id                TEXT    NOT NULL,
  title             TEXT,
  type              TEXT,
  problem           TEXT,
  cause             TEXT,
  solution          TEXT,
  prevention        TEXT,
  related_wis       TEXT[],
  tags              TEXT[],
  author            TEXT,
  author_title      TEXT,
  author_dept       TEXT,
  views             INTEGER DEFAULT 0,
  likes             INTEGER DEFAULT 0,
  status            TEXT,
  created_at        TEXT,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT kb_articles_pk PRIMARY KEY (id)
);

-- experts — db_experts (push → ASC)
CREATE TABLE km.experts (
  id                TEXT NOT NULL,
  name              TEXT,
  position          TEXT,
  phone             TEXT,
  email             TEXT,
  avatar_url        TEXT,
  availability      TEXT,
  department_id     TEXT,               -- ref (E-1)
  skills            TEXT[],
  experience_years  DOUBLE PRECISION,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT experts_pk PRIMARY KEY (id)
);

-- stored_files (FS-01; §21.8 A) — ไม่มี FK ไป documents/courses (Invariant 6)
CREATE TABLE km.stored_files (
  id                    TEXT        NOT NULL,
  storage_key           TEXT        NOT NULL,
  stored_name           TEXT        NOT NULL,
  mime_type             TEXT,
  size_bytes            BIGINT,
  sha256                TEXT,                       -- ไม่ UNIQUE
  uploaded_by           TEXT,
  restricted            BOOLEAN,
  uploaded_at           TIMESTAMPTZ,
  binding_status        TEXT        NOT NULL,
  bound_entity_type     TEXT,
  bound_entity_id       TEXT,
  previous_entity_type  TEXT,
  previous_entity_id    TEXT,
  released_reason       TEXT,
  released_at           TIMESTAMPTZ,
  file_status           TEXT        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stored_files_pk PRIMARY KEY (id),
  CONSTRAINT stored_files_storage_key_uq UNIQUE (storage_key),
  CONSTRAINT stored_files_stored_name_uq UNIQUE (stored_name),        -- B-22
  CONSTRAINT stored_files_binding_status_ck
    CHECK (binding_status IN ('unbound', 'bound', 'orphaned')),
  CONSTRAINT stored_files_bound_entity_type_ck
    CHECK (bound_entity_type IS NULL OR bound_entity_type IN ('document', 'course')),
  CONSTRAINT stored_files_file_status_ck
    CHECK (file_status IN ('staging', 'present', 'missing', 'quarantined', 'delete_pending', 'deleted')),
  CONSTRAINT stored_files_binding_consistency_ck                       -- Invariant 4
    CHECK ((binding_status = 'bound') = (bound_entity_type IS NOT NULL AND bound_entity_id IS NOT NULL))
);

-- =====================================================================
-- 4.2 Learning / Quiz
-- =====================================================================

-- quiz_submissions — db_quiz_submissions (unshift → DESC); Snapshot columns = Q3 (Migration ภายหลัง)
CREATE TABLE km.quiz_submissions (
  id                  TEXT        NOT NULL,
  user_id             TEXT        NOT NULL,
  user_name           TEXT        NOT NULL,
  employee_id         TEXT        NOT NULL,
  course_id           TEXT        NOT NULL,   -- ref (history)
  course_title        TEXT        NOT NULL,
  answers             JSONB       NOT NULL,
  auto_correct        INTEGER     NOT NULL,
  auto_total          INTEGER     NOT NULL,
  essay_question_ids  TEXT[]      NOT NULL,
  essay_grades        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  essay_total         INTEGER,                -- NULL = Unknown (§21.21)
  status              TEXT        NOT NULL,
  score               DOUBLE PRECISION,       -- §21.22 D2
  pass                BOOLEAN,
  submitted_at        TIMESTAMPTZ NOT NULL,
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  collection_order    BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT quiz_submissions_pk PRIMARY KEY (id),
  CONSTRAINT quiz_submissions_essay_total_ck CHECK (essay_total IS NULL OR essay_total >= 0),
  CONSTRAINT quiz_submissions_score_ck                                   -- E-3 (ต้องผ่าน Probe ก่อน)
    CHECK (score IS NULL OR (score >= 0 AND score <= 100 AND round(score::numeric, 2) = score::numeric))
);
CREATE UNIQUE INDEX quiz_submissions_pending_uq                          -- OD-UQ-06 → 409 ALREADY_PENDING
  ON km.quiz_submissions (user_id, course_id) WHERE status = 'PendingReview';

-- exam_results — db_exam_results (unshift → DESC) — F-05
CREATE TABLE km.exam_results (
  id                TEXT NOT NULL,
  submission_id     TEXT,
  user_id           TEXT,
  user_name         TEXT,
  employee_id       TEXT,
  employee_name     TEXT,
  course_id         TEXT,
  course_title      TEXT,
  score             DOUBLE PRECISION,
  pass              BOOLEAN,
  date              TEXT,
  answers           JSONB,
  extra_data        JSONB,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT exam_results_pk PRIMARY KEY (id),
  CONSTRAINT exam_results_submission_uq UNIQUE (submission_id)           -- OD-UQ-05 (NULL หลายแถวได้)
);

-- user_course_progress — db_user_progress (push → ASC) — F-05
CREATE TABLE km.user_course_progress (
  id                   TEXT NOT NULL,
  user_id              TEXT,
  course_id            TEXT,
  status               TEXT,
  start_date           TEXT,
  completed_date       TEXT,
  score                DOUBLE PRECISION,
  attempts_count       DOUBLE PRECISION,
  total_study_minutes  DOUBLE PRECISION,
  extra_data           JSONB,
  collection_order     BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT user_course_progress_pk PRIMARY KEY (id),
  CONSTRAINT user_course_progress_user_course_uq UNIQUE (user_id, course_id)   -- OD-UQ-03
);

-- user_certificates — db_user_certificates (push → ASC); ไม่มี UNIQUE (OD-UQ-04 Deferred)
CREATE TABLE km.user_certificates (
  id                TEXT NOT NULL,
  user_id           TEXT NOT NULL,
  employee_id       TEXT NOT NULL,
  title             TEXT NOT NULL,
  type              TEXT NOT NULL,
  course_id         TEXT NOT NULL,
  issue_date        DATE NOT NULL,
  expiry_date       DATE NOT NULL,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT user_certificates_pk PRIMARY KEY (id)
);

-- user_competencies — ว่างจนถึง COMP-01
CREATE TABLE km.user_competencies (
  id                TEXT NOT NULL,
  user_id           TEXT,
  skill_id          TEXT,
  skill_name        TEXT,
  category          TEXT,
  description       TEXT,
  linked_course_id  TEXT,
  linked_doc_id     TEXT,
  expected_level    DOUBLE PRECISION,
  actual_level      DOUBLE PRECISION,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT user_competencies_pk PRIMARY KEY (id),
  CONSTRAINT user_competencies_user_skill_uq UNIQUE (user_id, skill_id)   -- FS-08
);

-- training_sessions — db_training_sessions (unshift → DESC); Token เข้ารหัส (FS-03, Q-FS-1)
CREATE TABLE km.training_sessions (
  id                 TEXT        NOT NULL,
  course_id          TEXT        NOT NULL,   -- ref
  course_title       TEXT        NOT NULL,
  session_name       TEXT        NOT NULL,
  location           TEXT        NOT NULL,
  instructor         TEXT        NOT NULL,
  starts_at          TIMESTAMPTZ NOT NULL,
  ends_at            TIMESTAMPTZ NOT NULL,
  token_hash         TEXT        NOT NULL,
  token_ciphertext   BYTEA       NOT NULL,
  token_nonce        BYTEA       NOT NULL,
  token_auth_tag     BYTEA       NOT NULL,
  token_key_version  INTEGER     NOT NULL,
  created_by         TEXT        NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL,
  collection_order   BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT training_sessions_pk PRIMARY KEY (id),
  CONSTRAINT training_sessions_token_hash_uq UNIQUE (token_hash)        -- FS-09
);

-- attendance_logs — db_attendance_logs (unshift → DESC) — F-05
CREATE TABLE km.attendance_logs (
  id                TEXT NOT NULL,
  user_id           TEXT,
  session_id        TEXT,                -- ref (OD-FK-06)
  user_name         TEXT,
  employee_id       TEXT,
  position          TEXT,
  session_name      TEXT,
  course_id         TEXT,
  course_title      TEXT,
  department        TEXT,                -- Check-in = Department ID (§21.23 §2.4)
  "timestamp"       TEXT,
  deleted_at        TIMESTAMPTZ,         -- Soft delete (TX-07)
  deleted_by        TEXT,
  extra_data        JSONB,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT attendance_logs_pk PRIMARY KEY (id)
);
CREATE UNIQUE INDEX attendance_logs_active_user_session_uq             -- OD-UQ-07
  ON km.attendance_logs (user_id, session_id) WHERE deleted_at IS NULL;

-- km_contribution_logs — db_km_contribution_logs (unshift → DESC)
CREATE TABLE km.km_contribution_logs (
  id                TEXT             NOT NULL,
  user_id           TEXT             NOT NULL,
  user_name         TEXT             NOT NULL,
  points            DOUBLE PRECISION NOT NULL,   -- OD-12
  activity_type     TEXT,
  description       TEXT             NOT NULL,
  "timestamp"       TIMESTAMPTZ      NOT NULL,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT km_contribution_logs_pk PRIMARY KEY (id)
);

-- =====================================================================
-- 4.3 Knowledge / Interaction / Logs
-- =====================================================================

-- ratings — db_ratings (unshift → DESC); target_type ไม่มี CHECK (R3)
CREATE TABLE km.ratings (
  id                TEXT        NOT NULL,
  target_type       TEXT        NOT NULL,
  target_id         TEXT        NOT NULL,
  user_id           TEXT        NOT NULL,
  user_name         TEXT        NOT NULL,
  rating            INTEGER     NOT NULL,
  comment           TEXT,
  created_at        TIMESTAMPTZ NOT NULL,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT ratings_pk PRIMARY KEY (id)
);

-- search_logs — db_search_logs (unshift → DESC); ID ต้องกันชนใน PERSIST-01C (C-15)
CREATE TABLE km.search_logs (
  id                TEXT        NOT NULL,
  keyword           TEXT        NOT NULL,
  user_id           TEXT        NOT NULL,
  "timestamp"       TIMESTAMPTZ NOT NULL,
  has_result        BOOLEAN     NOT NULL,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT search_logs_pk PRIMARY KEY (id)
);

-- search_resolutions — db_search_resolutions (unshift → DESC)
CREATE TABLE km.search_resolutions (
  id                TEXT        NOT NULL,
  keyword           TEXT        NOT NULL,
  action            TEXT        NOT NULL,
  assigned_to       TEXT,
  resolved_by       TEXT        NOT NULL,
  resolved_by_name  TEXT        NOT NULL,
  resolved_at       TIMESTAMPTZ NOT NULL,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT search_resolutions_pk PRIMARY KEY (id)
);
CREATE UNIQUE INDEX search_resolutions_keyword_uq                        -- FS-07: Case-sensitive, ไม่จำกัดความยาว
  ON km.search_resolutions (km.text_sha256(keyword));

-- contact_requests — db_contact_requests (unshift → DESC)
CREATE TABLE km.contact_requests (
  id                TEXT        NOT NULL,
  user_id           TEXT        NOT NULL,
  user_name         TEXT        NOT NULL,
  expert_id         TEXT        NOT NULL,   -- ref (OD-FK-04)
  expert_name       TEXT        NOT NULL,
  user_dept         TEXT,
  topic             TEXT,
  message           TEXT,
  status            TEXT        NOT NULL,
  reply_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT contact_requests_pk PRIMARY KEY (id)
);

-- custom_resources — db_custom_resources (unshift → DESC) — F-05
CREATE TABLE km.custom_resources (
  id                TEXT NOT NULL,
  title             TEXT,
  content           TEXT,
  source_type       TEXT,
  added_by          TEXT,
  created_at        TEXT,
  extra_data        JSONB,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT custom_resources_pk PRIMARY KEY (id)
);

-- system_audit_logs — db_system_audit_logs (unshift → DESC); km_app เขียนได้อย่างเดียว
CREATE TABLE km.system_audit_logs (
  id                TEXT        NOT NULL,
  action            TEXT        NOT NULL,
  details           TEXT        NOT NULL,
  performed_by      TEXT        NOT NULL,
  "timestamp"       TIMESTAMPTZ NOT NULL,
  collection_order  BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT system_audit_logs_pk PRIMARY KEY (id)
);

-- =====================================================================
-- สิทธิ์ของแอป (km_app)
-- ตารางที่เพิ่มใน Migration ถัดไปต้อง GRANT เองในไฟล์นั้น (ไม่ใช้ DEFAULT PRIVILEGES โดยเจตนา)
-- =====================================================================
REVOKE ALL ON SCHEMA km FROM PUBLIC;
GRANT USAGE ON SCHEMA km TO km_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA km TO km_app;
REVOKE UPDATE, DELETE ON km.system_audit_logs FROM km_app;   -- Write-only audit
GRANT USAGE ON ALL SEQUENCES IN SCHEMA km TO km_app;
REVOKE ALL ON FUNCTION km.text_sha256(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION km.text_sha256(text) TO km_app;

COMMIT;
