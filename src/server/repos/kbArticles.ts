/**
 * PERSIST-01C-4 B1 — บทความความรู้ (km.kb_articles)
 * - NULL = ไม่ใส่ Key · ไม่คืน collection_order · ลำดับ collection_order DESC (เดิม unshift)
 * - PUT แทนทั้งก้อน: ทุกคอลัมน์มาจาก Body (ไม่ส่ง = NULL) ที่ id ใน URL เสมอ (F-06)
 * - like = TX-12 Atomic (`likes = likes + 1`) — likes ที่เป็น NULL คงเป็น NULL (เดิม NaN → JSON null)
 */
import type { KBArticle } from "../../types";
import { toTextOrNull } from "./users";
import {
  type Executor,
  copyArray,
  putIfPresent,
  runQuery,
  toIntegerOrNull,
  toTextArrayOrNull,
} from "./rowHelpers";

const TEXT_FIELDS = [
  ["title", "title"],
  ["type", "type"],
  ["problem", "problem"],
  ["cause", "cause"],
  ["solution", "solution"],
  ["prevention", "prevention"],
  ["author", "author"],
  ["authorTitle", "author_title"],
  ["authorDept", "author_dept"],
  ["status", "status"],
  ["createdAt", "created_at"],
] as const;
const ARRAY_FIELDS = [
  ["relatedWIs", "related_wis"],
  ["tags", "tags"],
] as const;
const INT_FIELDS = [
  ["views", "views"],
  ["likes", "likes"],
] as const;

type TextField = (typeof TEXT_FIELDS)[number][0];
type ArrayField = (typeof ARRAY_FIELDS)[number][0];
type IntField = (typeof INT_FIELDS)[number][0];

export type KbFields = Record<TextField, string | null> &
  Record<ArrayField, string[] | null> &
  Record<IntField, number | null>;

export type KbRow = Record<string, unknown> & { id: string };

const COLUMNS = [
  "id",
  ...TEXT_FIELDS.map(([, c]) => c),
  ...ARRAY_FIELDS.map(([, c]) => c),
  ...INT_FIELDS.map(([, c]) => c),
];
const SELECT = `SELECT ${COLUMNS.join(", ")} FROM km.kb_articles`;

export function rowToKbArticle(row: KbRow): KBArticle {
  const a: Record<string, unknown> = { id: row.id };
  for (const [f, c] of TEXT_FIELDS) putIfPresent(a, f, row[c]);
  for (const [f, c] of ARRAY_FIELDS) putIfPresent(a, f, copyArray(row[c]));
  for (const [f, c] of INT_FIELDS) {
    if (row[c] !== null && row[c] !== undefined) a[f] = Number(row[c]);
  }
  return a as unknown as KBArticle;
}

/** Q-2 (ก): Object → ค่าที่เก็บ (ช่องนอก Type ไม่เก็บ, id ไม่อยู่ในนี้) */
export function toKbFields(input: Record<string, unknown>): KbFields {
  const out = {} as KbFields;
  for (const [f] of TEXT_FIELDS) out[f] = toTextOrNull(input[f]);
  for (const [f] of ARRAY_FIELDS) out[f] = toTextArrayOrNull(input[f]);
  for (const [f] of INT_FIELDS) out[f] = toIntegerOrNull(input[f]);
  return out;
}

function valuesOf(fields: KbFields): unknown[] {
  return [
    ...TEXT_FIELDS.map(([f]) => fields[f]),
    ...ARRAY_FIELDS.map(([f]) => fields[f]),
    ...INT_FIELDS.map(([f]) => fields[f]),
  ];
}

const CASTS = [
  ...TEXT_FIELDS.map(() => "text"),
  ...ARRAY_FIELDS.map(() => "text[]"),
  ...INT_FIELDS.map(() => "integer"),
];

/** ใหม่สุดก่อน (เดิม unshift) */
export async function listKbArticles(executor?: Executor): Promise<KBArticle[]> {
  const r = await runQuery(executor, `${SELECT} ORDER BY collection_order DESC`);
  return (r.rows as KbRow[]).map(rowToKbArticle);
}

export async function findKbArticle(executor: Executor, id: string): Promise<KBArticle | undefined> {
  const r = await runQuery(executor, `${SELECT} WHERE id = $1`, [id]);
  const row = r.rows[0] as KbRow | undefined;
  return row ? rowToKbArticle(row) : undefined;
}

export async function kbArticleIdExists(executor: Executor, id: string): Promise<boolean> {
  const r = await runQuery(executor, "SELECT 1 FROM km.kb_articles WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function insertKbArticle(executor: Executor, id: string, fields: KbFields): Promise<KBArticle> {
  const placeholders = ["$1::text", ...CASTS.map((cast, i) => `$${i + 2}::${cast}`)];
  const r = await runQuery(
    executor,
    `INSERT INTO km.kb_articles (${COLUMNS.join(", ")}) VALUES (${placeholders.join(", ")})
     RETURNING ${COLUMNS.join(", ")}`,
    [id, ...valuesOf(fields)],
  );
  return rowToKbArticle(r.rows[0] as KbRow);
}

/** แทนทุกคอลัมน์ (ไม่ส่ง = NULL) ที่ id ใน URL (F-06) · คืน undefined เมื่อไม่พบ */
export async function replaceKbArticle(executor: Executor, id: string, fields: KbFields): Promise<KBArticle | undefined> {
  const data = COLUMNS.slice(1);
  const sets = data.map((c, i) => `${c} = $${i + 2}::${CASTS[i]}`);
  const r = await runQuery(
    executor,
    `UPDATE km.kb_articles SET ${sets.join(", ")} WHERE id = $1 RETURNING ${COLUMNS.join(", ")}`,
    [id, ...valuesOf(fields)],
  );
  const row = r.rows[0] as KbRow | undefined;
  return row ? rowToKbArticle(row) : undefined;
}

export async function deleteKbArticle(executor: Executor, id: string): Promise<void> {
  await runQuery(executor, "DELETE FROM km.kb_articles WHERE id = $1", [id]);
}

export async function approveKbArticle(executor: Executor, id: string): Promise<KBArticle | undefined> {
  const r = await runQuery(
    executor,
    `UPDATE km.kb_articles SET status = 'Approved' WHERE id = $1 RETURNING ${COLUMNS.join(", ")}`,
    [id],
  );
  const row = r.rows[0] as KbRow | undefined;
  return row ? rowToKbArticle(row) : undefined;
}

/** TX-12: `likes = likes + 1` แบบ Atomic · คืนแถวที่อ่านกลับ หรือ undefined เมื่อไม่พบ */
export async function likeKbArticle(executor: Executor, id: string): Promise<KBArticle | undefined> {
  const r = await runQuery(
    executor,
    `UPDATE km.kb_articles SET likes = likes + 1 WHERE id = $1 RETURNING ${COLUMNS.join(", ")}`,
    [id],
  );
  const row = r.rows[0] as KbRow | undefined;
  return row ? rowToKbArticle(row) : undefined;
}
