/**
 * PERSIST-01C-4 B1 — แหล่งข้อมูลเสริมของ AI (km.custom_resources) — F-05 Raw Known Field (§21.20 A)
 * - ช่องที่รู้จัก (title, content, sourceType, addedBy, createdAt) ที่เป็น String → คอลัมน์
 * - ช่องที่รู้จักแต่ไม่ใช่ String (รวม null ที่ส่งมาตรง ๆ) และช่องที่ไม่รู้จัก (ยกเว้น id) → extra_data (JSONB)
 * - อ่านกลับ = คอลัมน์ + extra_data → ได้ค่าเดิมทุกช่อง แยก "ไม่ส่ง" กับ null ได้ · extra_data ว่าง → NULL
 * - ลำดับ collection_order DESC (เดิม unshift) · ไม่คืน collection_order
 */
import type { CustomResource } from "../../types";
import { type Executor, isPlainObject, runQuery, setOwn } from "./rowHelpers";

const KNOWN_FIELDS = [
  ["title", "title"],
  ["content", "content"],
  ["sourceType", "source_type"],
  ["addedBy", "added_by"],
  ["createdAt", "created_at"],
] as const;

type KnownField = (typeof KNOWN_FIELDS)[number][0];

export interface CustomResourceStored {
  columns: Record<KnownField, string | null>;
  /** ค่าที่เก็บใน extra_data (null = SQL NULL) */
  extra: Record<string, unknown> | null;
}

const COLUMNS = ["id", ...KNOWN_FIELDS.map(([, c]) => c), "extra_data"];
const SELECT = `SELECT ${COLUMNS.join(", ")} FROM km.custom_resources`;

export type CustomResourceRow = Record<string, unknown> & { id: string };

/** Body → คอลัมน์ + extra_data (ฟังก์ชันบริสุทธิ์) */
export function encodeCustomResource(input: Record<string, unknown>): CustomResourceStored {
  const columns = {} as Record<KnownField, string | null>;
  const extra: Record<string, unknown> = {};
  const known = new Set<string>(KNOWN_FIELDS.map(([f]) => f));
  for (const [f] of KNOWN_FIELDS) {
    const has = Object.prototype.hasOwnProperty.call(input, f);
    const v = has ? input[f] : undefined;
    if (typeof v === "string") {
      columns[f] = v;
    } else {
      columns[f] = null;
      if (has && v !== undefined) setOwn(extra, f, v); // ค่าดิบที่ไม่ใช่ String (รวม null)
    }
  }
  for (const key of Object.keys(input)) {
    if (key === "id" || known.has(key)) continue;
    if (input[key] !== undefined) setOwn(extra, key, input[key]); // ช่องที่ไม่รู้จัก
  }
  return { columns, extra: Object.keys(extra).length > 0 ? extra : null };
}

/** แถว → Object API: คอลัมน์ที่ไม่ใช่ NULL + ค่าจาก extra_data (ทับคอลัมน์ที่เป็น NULL) */
export function rowToCustomResource(row: CustomResourceRow): CustomResource {
  const r: Record<string, unknown> = { id: row.id };
  for (const [f, c] of KNOWN_FIELDS) {
    if (row[c] !== null && row[c] !== undefined) r[f] = row[c];
  }
  const extra = row.extra_data;
  if (isPlainObject(extra)) {
    for (const key of Object.keys(extra)) {
      if (key === "id") continue;
      setOwn(r, key, extra[key]);
    }
  }
  return r as unknown as CustomResource;
}

/** ใหม่สุดก่อน */
export async function listCustomResources(executor?: Executor): Promise<CustomResource[]> {
  const r = await runQuery(executor, `${SELECT} ORDER BY collection_order DESC`);
  return (r.rows as CustomResourceRow[]).map(rowToCustomResource);
}

export async function customResourceIdExists(executor: Executor, id: string): Promise<boolean> {
  const r = await runQuery(executor, "SELECT 1 FROM km.custom_resources WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function insertCustomResource(
  executor: Executor,
  id: string,
  stored: CustomResourceStored,
): Promise<CustomResource> {
  const r = await runQuery(
    executor,
    `INSERT INTO km.custom_resources (${COLUMNS.join(", ")})
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING ${COLUMNS.join(", ")}`,
    [
      id,
      ...KNOWN_FIELDS.map(([f]) => stored.columns[f]),
      // JSONB ต้องส่งเป็นข้อความ JSON เอง (pg แปลง JS Array/Object เองไม่ตรงกับ JSON เสมอ)
      stored.extra === null ? null : JSON.stringify(stored.extra),
    ],
  );
  return rowToCustomResource(r.rows[0] as CustomResourceRow);
}

export async function deleteCustomResource(executor: Executor, id: string): Promise<void> {
  await runQuery(executor, "DELETE FROM km.custom_resources WHERE id = $1", [id]);
}
