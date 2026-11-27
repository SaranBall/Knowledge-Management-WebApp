/**
 * PERSIST-01C-5 B1 — หลักสูตร (km.courses + km.course_target_departments + km.course_lessons
 * + km.course_quiz_questions)
 *
 * อ้างอิง: Preflight 01C-5 (Q-1..Q-4 = ก, A-Q1..A-Q5 = ก), Final ERD Rev.2, §21.24 §3 (G-8.1, G-12)
 * - NULL = ไม่ใส่ Key · ไม่คืน collection_order / targetPositions
 * - lessons / quiz / targetDepartmentIds เป็น Array เสมอ (ว่าง = []) · isMandatory / issuesCertificate เป็น Boolean เสมอ
 * - ลำดับรายการ = collection_order DESC (เดิม db_courses.unshift) · ลูกตาม ordinal
 * - อ่านหลักสูตร + ลูกทั้ง 3 ตารางใน Statement เดียว (Subquery ต่อแถว — ไม่ N+1, Snapshot เดียวกัน)
 * - เขียน = แทนทั้งก้อน: แถวหลัก + ลบ/ใส่ลูกทั้ง 3 ตาราง (Caller ต้องเรียกใน Transaction เดียว)
 * - ทุก Query ใช้ Parameter; ชื่อคอลัมน์มาจากรายการคงที่ในไฟล์นี้เท่านั้น
 */
import type { Course } from "../../types";
import { toTextOrNull } from "./users";
import {
  type Executor,
  copyArray,
  isPlainObject,
  putIfPresent,
  runQuery,
  toFiniteOrNull,
  toTextArrayOrNull,
} from "./rowHelpers";

// ---------------------------------------------------------------------------
// ค่าเริ่มต้นของช่องใหม่ (ตรงกับ DEFAULT ของ km.courses — ERD §21.24 §3.1 / §3.2)
// ---------------------------------------------------------------------------

export const DEFAULT_IS_MANDATORY = false;
export const DEFAULT_ISSUES_CERTIFICATE = true;

const INT4_MAX = 2147483647;

// ---------------------------------------------------------------------------
// Q-4 (ก): ตรวจช่องใหม่ → 400 INVALID_COURSE พร้อมข้อความระบุชื่อช่อง (A-Q5)
// ---------------------------------------------------------------------------

export interface CourseNewFields {
  targetDepartmentIds: string[];
  isMandatory: boolean;
  issuesCertificate: boolean;
  certificateValidityMonths: number | null;
}

export type CourseNewFieldsResult =
  | { ok: true; value: CourseNewFields }
  | { ok: false; message: string };

/**
 * ตรวจช่องใหม่ของ Body (ไม่ส่ง = ค่าเริ่มต้น):
 * - targetDepartmentIds: Array ของรหัสแผนก (String) ที่มีจริง — ตัดซ้ำ คงลำดับครั้งแรก · ไม่ส่ง = []
 * - isMandatory / issuesCertificate: Boolean ถ้าส่ง · ไม่ส่ง = DEFAULT
 * - certificateValidityMonths: จำนวนเต็ม 1..2147483647 (INTEGER) หรือ null/ไม่ส่ง (= ไม่หมดอายุ)
 */
export function validateCourseNewFields(
  body: Record<string, unknown>,
  departmentExists: (id: string) => boolean,
): CourseNewFieldsResult {
  const fail = (message: string): CourseNewFieldsResult => ({ ok: false, message });

  const rawDepts = body.targetDepartmentIds;
  const targetDepartmentIds: string[] = [];
  if (rawDepts !== undefined) {
    if (!Array.isArray(rawDepts)) {
      return fail("targetDepartmentIds ต้องเป็นรายการรหัสแผนก (Array)");
    }
    for (const d of rawDepts) {
      if (typeof d !== "string" || !departmentExists(d)) {
        return fail("targetDepartmentIds มีรหัสแผนกที่ไม่ถูกต้องหรือไม่มีอยู่ในระบบ");
      }
      if (!targetDepartmentIds.includes(d)) targetDepartmentIds.push(d);
    }
  }

  const readBool = (key: "isMandatory" | "issuesCertificate", fallback: boolean): boolean | null => {
    const v = body[key];
    if (v === undefined) return fallback;
    return typeof v === "boolean" ? v : null;
  };
  const isMandatory = readBool("isMandatory", DEFAULT_IS_MANDATORY);
  if (isMandatory === null) return fail("isMandatory ต้องเป็น true หรือ false");
  const issuesCertificate = readBool("issuesCertificate", DEFAULT_ISSUES_CERTIFICATE);
  if (issuesCertificate === null) return fail("issuesCertificate ต้องเป็น true หรือ false");

  const rawMonths = body.certificateValidityMonths;
  let certificateValidityMonths: number | null = null;
  if (rawMonths !== undefined && rawMonths !== null) {
    if (
      typeof rawMonths !== "number" ||
      !Number.isInteger(rawMonths) ||
      rawMonths < 1 ||
      rawMonths > INT4_MAX
    ) {
      return fail(
        "certificateValidityMonths ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป หรือเว้นว่าง (null) เมื่อไม่หมดอายุ",
      );
    }
    certificateValidityMonths = rawMonths;
  }

  return {
    ok: true,
    value: { targetDepartmentIds, isMandatory, issuesCertificate, certificateValidityMonths },
  };
}

// ---------------------------------------------------------------------------
// ช่อง ↔ คอลัมน์
// ---------------------------------------------------------------------------

const TEXT_FIELDS = [
  ["title", "title"],
  ["description", "description"],
  ["type", "type"],
  ["badgeKey", "badge_key"],
  ["durationHours", "duration_hours"],
  ["createdByRole", "created_by_role"],
] as const;
const NUMBER_FIELDS = [
  ["minPassScore", "min_pass_score"],
  ["durationMinutes", "duration_minutes"],
] as const;

type TextField = (typeof TEXT_FIELDS)[number][0];
type NumberField = (typeof NUMBER_FIELDS)[number][0];

export interface LessonFields {
  id: string | null;
  title: string | null;
  content: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  durationMinutes: number | null;
}

export interface QuizQuestionFields {
  id: string | null;
  question: string | null;
  type: string | null;
  correctAnswer: string | null;
  options: string[] | null;
  /** ค่า JSON ของ pairs (Array) หรือ null — เก็บเป็น JSONB */
  pairs: unknown[] | null;
}

/** ค่าที่เก็บของทุกช่อง (นอกจาก id) — ผลของ toCourseFields */
export type CourseFields = Record<TextField, string | null> &
  Record<NumberField, number | null> & {
    tags: string[] | null;
    isApproved: boolean | null;
    isMandatory: boolean;
    issuesCertificate: boolean;
    certificateValidityMonths: number | null;
    targetDepartmentIds: string[];
    lessons: LessonFields[];
    quiz: QuizQuestionFields[];
  };

const toBooleanOrNull = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** Q-2 แบบ 01C-3/01C-4: บทเรียน 1 บท (ช่องนอก Type ไม่เก็บ) */
export function toLessonFields(input: Record<string, unknown>): LessonFields {
  return {
    id: toTextOrNull(input.id),
    title: toTextOrNull(input.title),
    content: toTextOrNull(input.content),
    mediaType: toTextOrNull(input.mediaType),
    mediaUrl: toTextOrNull(input.mediaUrl),
    durationMinutes: toFiniteOrNull(input.durationMinutes),
  };
}

/** Q-2 แบบ 01C-3/01C-4: ข้อสอบ 1 ข้อ · pairs ไม่ใช่ Array → NULL (ช่องนอก Type ไม่เก็บ) */
export function toQuizQuestionFields(input: Record<string, unknown>): QuizQuestionFields {
  return {
    id: toTextOrNull(input.id),
    question: toTextOrNull(input.question),
    type: toTextOrNull(input.type),
    correctAnswer: toTextOrNull(input.correctAnswer),
    options: toTextArrayOrNull(input.options),
    pairs: Array.isArray(input.pairs) ? input.pairs : null,
  };
}

/**
 * Object หลักสูตรที่ Route เตรียมแล้ว + ช่องใหม่ที่ผ่าน Q-4 → ค่าที่เก็บ
 * - ช่องข้อความ: toTextOrNull · ตัวเลข: ตัวเลขจำกัดเท่านั้น · tags: toTextArrayOrNull · isApproved: Boolean หรือ NULL
 * - lessons / quiz ไม่ใช่ Array → ไม่มีลูก · สมาชิกที่ไม่ใช่ Object → ข้าม (lessons ถูกตรวจโดย scanLessonMedia แล้ว)
 * - ช่องนอก Schema ไม่เก็บ (รวม targetPositions, id ของ Body)
 */
export function toCourseFields(input: Record<string, unknown>, extra: CourseNewFields): CourseFields {
  const out = {} as CourseFields;
  for (const [f] of TEXT_FIELDS) out[f] = toTextOrNull(input[f]);
  for (const [f] of NUMBER_FIELDS) out[f] = toFiniteOrNull(input[f]);
  out.tags = toTextArrayOrNull(input.tags);
  out.isApproved = toBooleanOrNull(input.isApproved);
  out.isMandatory = extra.isMandatory;
  out.issuesCertificate = extra.issuesCertificate;
  out.certificateValidityMonths = extra.certificateValidityMonths;
  out.targetDepartmentIds = [...extra.targetDepartmentIds];
  const objects = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter(isPlainObject) : [];
  out.lessons = objects(input.lessons).map(toLessonFields);
  out.quiz = objects(input.quiz).map(toQuizQuestionFields);
  return out;
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

export interface LessonJson {
  id: string | null;
  title: string | null;
  content: string | null;
  media_type: string | null;
  media_url: string | null;
  duration_minutes: number | null;
}

export interface QuizJson {
  question_id: string | null;
  question: string | null;
  type: string | null;
  correct_answer: string | null;
  options: string[] | null;
  pairs: unknown;
}

export type CourseRow = Record<string, unknown> & {
  id: string;
  is_mandatory: boolean;
  issues_certificate: boolean;
  target_department_ids?: string[] | null;
  lessons?: LessonJson[] | null;
  quiz?: QuizJson[] | null;
};

export function lessonFromJson(l: LessonJson): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  putIfPresent(o, "id", l.id);
  putIfPresent(o, "title", l.title);
  putIfPresent(o, "content", l.content);
  if (l.duration_minutes !== null && l.duration_minutes !== undefined) {
    o.durationMinutes = Number(l.duration_minutes);
  }
  putIfPresent(o, "mediaType", l.media_type);
  putIfPresent(o, "mediaUrl", l.media_url);
  return o;
}

export function quizFromJson(q: QuizJson): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  putIfPresent(o, "id", q.question_id);
  putIfPresent(o, "question", q.question);
  putIfPresent(o, "type", q.type);
  putIfPresent(o, "options", copyArray(q.options));
  if (q.pairs !== null && q.pairs !== undefined) {
    // JSONB ไม่รักษาลำดับ Key แต่รักษาลำดับสมาชิกของ Array — คัดลอกลึกผ่าน JSON
    o.pairs = JSON.parse(JSON.stringify(q.pairs));
  }
  putIfPresent(o, "correctAnswer", q.correct_answer);
  return o;
}

/** แถว (พร้อมลูกที่ Aggregate แล้ว) → Object API */
export function rowToCourse(row: CourseRow): Course {
  const c: Record<string, unknown> = { id: row.id };
  for (const [f, col] of TEXT_FIELDS) putIfPresent(c, f, row[col]);
  for (const [f, col] of NUMBER_FIELDS) {
    if (row[col] !== null && row[col] !== undefined) c[f] = Number(row[col]);
  }
  putIfPresent(c, "tags", copyArray(row.tags));
  putIfPresent(c, "isApproved", row.is_approved);
  c.isMandatory = row.is_mandatory === true;
  c.issuesCertificate = row.issues_certificate !== false;
  if (row.certificate_validity_months !== null && row.certificate_validity_months !== undefined) {
    c.certificateValidityMonths = Number(row.certificate_validity_months);
  }
  c.targetDepartmentIds = Array.isArray(row.target_department_ids) ? [...row.target_department_ids] : [];
  c.lessons = (Array.isArray(row.lessons) ? row.lessons : []).map(lessonFromJson);
  c.quiz = (Array.isArray(row.quiz) ? row.quiz : []).map(quizFromJson);
  return c as unknown as Course;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

const MAIN_COLUMNS = [
  "id",
  ...TEXT_FIELDS.map(([, col]) => col),
  ...NUMBER_FIELDS.map(([, col]) => col),
  "tags",
  "is_approved",
  "is_mandatory",
  "issues_certificate",
  "certificate_validity_months",
];

// json (ไม่ใช่ jsonb) รักษาลำดับ Key ของ json_build_object · json_agg ORDER BY ordinal
const SELECT_COURSE = `
  SELECT ${MAIN_COLUMNS.map((col) => `c.${col}`).join(", ")},
         ARRAY(SELECT t.department_id FROM km.course_target_departments t
                WHERE t.course_id = c.id ORDER BY t.ordinal) AS target_department_ids,
         COALESCE((SELECT json_agg(json_build_object(
                    'id', l.id, 'title', l.title, 'content', l.content,
                    'media_type', l.media_type, 'media_url', l.media_url,
                    'duration_minutes', l.duration_minutes) ORDER BY l.ordinal)
                     FROM km.course_lessons l WHERE l.course_id = c.id), '[]'::json) AS lessons,
         COALESCE((SELECT json_agg(json_build_object(
                    'question_id', q.question_id, 'question', q.question, 'type', q.type,
                    'correct_answer', q.correct_answer, 'options', q.options, 'pairs', q.pairs)
                    ORDER BY q.ordinal)
                     FROM km.course_quiz_questions q WHERE q.course_id = c.id), '[]'::json) AS quiz
    FROM km.courses c`;

/** ทุกหลักสูตร (ใหม่สุดก่อน) พร้อมลูก — Statement เดียว */
export async function listCourses(executor?: Executor): Promise<Course[]> {
  const r = await runQuery(executor, `${SELECT_COURSE} ORDER BY c.collection_order DESC`);
  return (r.rows as CourseRow[]).map(rowToCourse);
}

/** หลักสูตรเดียว · forUpdate = ล็อกแถวใน Transaction (SELECT … FOR UPDATE) ก่อนอ่าน */
export async function findCourse(
  executor: Executor,
  id: string,
  options: { forUpdate?: boolean } = {},
): Promise<Course | undefined> {
  if (options.forUpdate) {
    const locked = await runQuery(executor, "SELECT id FROM km.courses WHERE id = $1 FOR UPDATE", [id]);
    if ((locked.rowCount ?? 0) === 0) return undefined;
  }
  const r = await runQuery(executor, `${SELECT_COURSE} WHERE c.id = $1`, [id]);
  const row = r.rows[0] as CourseRow | undefined;
  return row ? rowToCourse(row) : undefined;
}

export async function courseIdExists(executor: Executor, id: string): Promise<boolean> {
  const r = await runQuery(executor, "SELECT 1 FROM km.courses WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

const WRITE_COLUMNS: Array<{ column: string; cast: string; value: (f: CourseFields) => unknown }> = [
  ...TEXT_FIELDS.map(([field, column]) => ({ column, cast: "text", value: (f: CourseFields) => f[field] })),
  ...NUMBER_FIELDS.map(([field, column]) => ({
    column,
    cast: "double precision",
    value: (f: CourseFields) => f[field],
  })),
  { column: "tags", cast: "text[]", value: (f) => f.tags },
  { column: "is_approved", cast: "boolean", value: (f) => f.isApproved },
  { column: "is_mandatory", cast: "boolean", value: (f) => f.isMandatory },
  { column: "issues_certificate", cast: "boolean", value: (f) => f.issuesCertificate },
  { column: "certificate_validity_months", cast: "integer", value: (f) => f.certificateValidityMonths },
];

const LESSON_COLUMNS: Array<{ column: string; cast: string; value: (l: LessonFields) => unknown }> = [
  { column: "id", cast: "text", value: (l) => l.id },
  { column: "title", cast: "text", value: (l) => l.title },
  { column: "content", cast: "text", value: (l) => l.content },
  { column: "media_type", cast: "text", value: (l) => l.mediaType },
  { column: "media_url", cast: "text", value: (l) => l.mediaUrl },
  { column: "duration_minutes", cast: "double precision", value: (l) => l.durationMinutes },
];

const QUIZ_COLUMNS: Array<{ column: string; cast: string; value: (q: QuizQuestionFields) => unknown }> = [
  { column: "question_id", cast: "text", value: (q) => q.id },
  { column: "question", cast: "text", value: (q) => q.question },
  { column: "type", cast: "text", value: (q) => q.type },
  { column: "correct_answer", cast: "text", value: (q) => q.correctAnswer },
  { column: "options", cast: "text[]", value: (q) => q.options },
  // JSONB ต้องส่งเป็นข้อความ JSON เอง (pg แปลง JS Array เป็น PostgreSQL array ไม่ใช่ JSON)
  { column: "pairs", cast: "jsonb", value: (q) => (q.pairs === null ? null : JSON.stringify(q.pairs)) },
];

/** INSERT หลายแถวในคำสั่งเดียว: (course_id, ordinal, ...คอลัมน์) ตามลำดับสมาชิก */
async function insertChildren<T>(
  executor: Executor,
  table: string,
  courseId: string,
  items: readonly T[],
  columns: Array<{ column: string; cast: string; value: (item: T) => unknown }>,
): Promise<void> {
  if (items.length === 0) return;
  const params: unknown[] = [courseId];
  const tuples = items.map((item, ordinal) => {
    params.push(ordinal);
    const ph = [`$1::text`, `$${params.length}::integer`];
    for (const c of columns) {
      params.push(c.value(item));
      ph.push(`$${params.length}::${c.cast}`);
    }
    return `(${ph.join(", ")})`;
  });
  await runQuery(
    executor,
    `INSERT INTO ${table} (course_id, ordinal, ${columns.map((c) => c.column).join(", ")}) VALUES ${tuples.join(", ")}`,
    params,
  );
}

async function replaceChildren(executor: Executor, id: string, fields: CourseFields): Promise<void> {
  await runQuery(executor, "DELETE FROM km.course_target_departments WHERE course_id = $1", [id]);
  await runQuery(executor, "DELETE FROM km.course_lessons WHERE course_id = $1", [id]);
  await runQuery(executor, "DELETE FROM km.course_quiz_questions WHERE course_id = $1", [id]);
  if (fields.targetDepartmentIds.length > 0) {
    await runQuery(
      executor,
      `INSERT INTO km.course_target_departments (course_id, department_id, ordinal)
       SELECT $1, u.department_id, u.ordinal
         FROM unnest($2::text[], $3::int[]) AS u(department_id, ordinal)`,
      [id, [...fields.targetDepartmentIds], fields.targetDepartmentIds.map((_, i) => i)],
    );
  }
  await insertChildren(executor, "km.course_lessons", id, fields.lessons, LESSON_COLUMNS);
  await insertChildren(executor, "km.course_quiz_questions", id, fields.quiz, QUIZ_COLUMNS);
}

/** เพิ่มหลักสูตร + ลูกทั้ง 3 ตาราง (ต้องอยู่ใน Transaction) · id ชน → Error 23505 courses_pk */
export async function insertCourse(executor: Executor, id: string, fields: CourseFields): Promise<void> {
  const columns = ["id", ...WRITE_COLUMNS.map((c) => c.column)];
  const placeholders = ["$1::text", ...WRITE_COLUMNS.map((c, i) => `$${i + 2}::${c.cast}`)];
  await runQuery(
    executor,
    `INSERT INTO km.courses (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
    [id, ...WRITE_COLUMNS.map((c) => c.value(fields))],
  );
  await replaceChildren(executor, id, fields);
}

/** แทนทั้งก้อน (ไม่ส่ง = NULL / DEFAULT) ที่ id ใน URL · คืน false เมื่อไม่พบแถว (ต้องอยู่ใน Transaction) */
export async function replaceCourse(executor: Executor, id: string, fields: CourseFields): Promise<boolean> {
  const sets = WRITE_COLUMNS.map((c, i) => `${c.column} = $${i + 2}::${c.cast}`);
  const r = await runQuery(
    executor,
    `UPDATE km.courses SET ${sets.join(", ")} WHERE id = $1`,
    [id, ...WRITE_COLUMNS.map((c) => c.value(fields))],
  );
  if ((r.rowCount ?? 0) === 0) return false;
  await replaceChildren(executor, id, fields);
  return true;
}

/** ลบหลักสูตร (ลูกทั้ง 3 ตารางลบตาม CASCADE) · คืน true เมื่อมีแถวถูกลบ */
export async function deleteCourse(executor: Executor, id: string): Promise<boolean> {
  const r = await runQuery(executor, "DELETE FROM km.courses WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}
