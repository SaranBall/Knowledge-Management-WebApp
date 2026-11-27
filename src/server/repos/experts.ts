/**
 * PERSIST-01C-4 B1 — ผู้เชี่ยวชาญ (km.experts)
 * - NULL = ไม่ใส่ Key · ไม่คืน collection_order · ลำดับ collection_order **ASC** (เดิม push)
 * - PUT แทนทั้งก้อน: ทุกคอลัมน์มาจาก Body (ไม่ส่ง = NULL) ที่ id ใน URL เสมอ (F-06)
 */
import type { Expert } from "../../types";
import { toTextOrNull } from "./users";
import {
  type Executor,
  copyArray,
  putIfPresent,
  runQuery,
  toFiniteOrNull,
  toTextArrayOrNull,
} from "./rowHelpers";

const TEXT_FIELDS = [
  ["name", "name"],
  ["position", "position"],
  ["phone", "phone"],
  ["email", "email"],
  ["avatarUrl", "avatar_url"],
  ["availability", "availability"],
  ["departmentId", "department_id"],
] as const;

type TextField = (typeof TEXT_FIELDS)[number][0];

export type ExpertFields = Record<TextField, string | null> & {
  skills: string[] | null;
  experienceYears: number | null;
};

export type ExpertRow = Record<string, unknown> & { id: string };

const COLUMNS = ["id", ...TEXT_FIELDS.map(([, c]) => c), "skills", "experience_years"];
const CASTS = [...TEXT_FIELDS.map(() => "text"), "text[]", "double precision"];
const SELECT = `SELECT ${COLUMNS.join(", ")} FROM km.experts`;

export function rowToExpert(row: ExpertRow): Expert {
  const e: Record<string, unknown> = { id: row.id };
  for (const [f, c] of TEXT_FIELDS) putIfPresent(e, f, row[c]);
  putIfPresent(e, "skills", copyArray(row.skills));
  if (row.experience_years !== null && row.experience_years !== undefined) {
    e.experienceYears = Number(row.experience_years);
  }
  return e as unknown as Expert;
}

/** Q-2 (ก): Object → ค่าที่เก็บ (ช่องนอก Type ไม่เก็บ, id ไม่อยู่ในนี้) */
export function toExpertFields(input: Record<string, unknown>): ExpertFields {
  const out = {} as ExpertFields;
  for (const [f] of TEXT_FIELDS) out[f] = toTextOrNull(input[f]);
  out.skills = toTextArrayOrNull(input.skills);
  out.experienceYears = toFiniteOrNull(input.experienceYears);
  return out;
}

const valuesOf = (f: ExpertFields) => [...TEXT_FIELDS.map(([k]) => f[k]), f.skills, f.experienceYears];

/** ตามลำดับที่สร้าง (เดิม push) */
export async function listExperts(executor?: Executor): Promise<Expert[]> {
  const r = await runQuery(executor, `${SELECT} ORDER BY collection_order ASC`);
  return (r.rows as ExpertRow[]).map(rowToExpert);
}

export async function findExpert(executor: Executor, id: string): Promise<Expert | undefined> {
  const r = await runQuery(executor, `${SELECT} WHERE id = $1`, [id]);
  const row = r.rows[0] as ExpertRow | undefined;
  return row ? rowToExpert(row) : undefined;
}

export async function expertIdExists(executor: Executor, id: string): Promise<boolean> {
  const r = await runQuery(executor, "SELECT 1 FROM km.experts WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function insertExpert(executor: Executor, id: string, fields: ExpertFields): Promise<Expert> {
  const placeholders = ["$1::text", ...CASTS.map((cast, i) => `$${i + 2}::${cast}`)];
  const r = await runQuery(
    executor,
    `INSERT INTO km.experts (${COLUMNS.join(", ")}) VALUES (${placeholders.join(", ")})
     RETURNING ${COLUMNS.join(", ")}`,
    [id, ...valuesOf(fields)],
  );
  return rowToExpert(r.rows[0] as ExpertRow);
}

/** แทนทุกคอลัมน์ (ไม่ส่ง = NULL) ที่ id ใน URL (F-06) · คืน undefined เมื่อไม่พบ */
export async function replaceExpert(executor: Executor, id: string, fields: ExpertFields): Promise<Expert | undefined> {
  const sets = COLUMNS.slice(1).map((c, i) => `${c} = $${i + 2}::${CASTS[i]}`);
  const r = await runQuery(
    executor,
    `UPDATE km.experts SET ${sets.join(", ")} WHERE id = $1 RETURNING ${COLUMNS.join(", ")}`,
    [id, ...valuesOf(fields)],
  );
  const row = r.rows[0] as ExpertRow | undefined;
  return row ? rowToExpert(row) : undefined;
}

export async function deleteExpert(executor: Executor, id: string): Promise<void> {
  await runQuery(executor, "DELETE FROM km.experts WHERE id = $1", [id]);
}
