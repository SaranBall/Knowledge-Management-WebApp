-- =====================================================================
-- KM-RMP Portal — Probe E-3: CHECK ของ quiz_submissions.score ยอมรับทุกคะแนนที่ Q1 ผลิตได้หรือไม่
-- อ้างอิง: Addendum §21.24 E-3, FS-10, §21.22 D2; สูตร Q1: Math.floor(c*10000/t)/100
--
--   psql -U postgres -d km_rmp -v ON_ERROR_STOP=1 -f db/probe/e3_score_check.sql
--
-- ไม่สร้างหรือแก้อะไรถาวร: ใช้ Temp table ใน Transaction แล้ว ROLLBACK
-- ไล่ทุกคู่ t = 1..1000 ข้อ, c = 0..t ข้อถูก (500,500 ค่า)
-- จำลองการส่งค่าจาก Node (pg driver ส่ง Number เป็นข้อความแบบ Shortest round-trip)
--   ด้วยการแปลง float8 → text → float8 อีกรอบ
-- ผลที่ต้องได้: rows_failing_check = 0 และ roundtrip_mismatch = 0
-- =====================================================================

\set ON_ERROR_STOP on
\encoding UTF8

BEGIN;

CREATE TEMP TABLE e3_probe (
  t      integer NOT NULL,
  c      integer NOT NULL,
  score  double precision NOT NULL
) ON COMMIT DROP;

-- c*10000 เป็นจำนวนเต็มแม่นยำ; หารและ floor เป็น float8 (IEEE-754) เหมือน JavaScript
INSERT INTO e3_probe (t, c, score)
SELECT t, c, floor((c * 10000)::float8 / t) / 100::float8
FROM generate_series(1, 1000) AS t,
     LATERAL generate_series(0, t) AS c;

-- เงื่อนไขเดียวกับ quiz_submissions_score_ck ใน 0001
SELECT
  count(*)                                                        AS rows_tested,
  count(*) FILTER (WHERE NOT (score >= 0 AND score <= 100
                              AND round(score::numeric, 2) = score::numeric)) AS rows_failing_check,
  count(*) FILTER (WHERE score::text::float8 <> score)            AS roundtrip_mismatch,
  min(score) AS min_score,
  max(score) AS max_score
FROM e3_probe;

-- ตัวอย่างค่าที่ไม่ผ่าน (ถ้ามี) สูงสุด 20 แถว
SELECT t, c, score, score::numeric AS as_numeric
FROM e3_probe
WHERE NOT (score >= 0 AND score <= 100 AND round(score::numeric, 2) = score::numeric)
ORDER BY t, c
LIMIT 20;

ROLLBACK;
