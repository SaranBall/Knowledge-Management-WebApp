/**
 * PERSIST-01C-3 B1 — เอกสาร (km.documents) + ACL (km.document_allowed_departments)
 *
 * อ้างอิง: Preflight 01C-3 (Q-1 (ก), Q-2 (ก)), Approval Package FS-02 (ACL Owner-first, ordinal 0),
 *          FS-06 (parsedExcelSheets = Ordered JSONB array), Master V6 §21.9 D / B-14 (TX-11, TX-12), OD-FK-03
 * - คอลัมน์ snake_case ↔ ช่อง camelCase · NULL = ไม่ใส่ Key · ไม่คืน collection_order
 * - ลำดับรายการ = collection_order DESC (เดิม db_documents.unshift)
 * - ACL อ่านพร้อมเอกสารใน Query เดียว (ไม่ N+1) เรียงตาม ordinal
 * - ทุก Query ใช้ Parameter; ชื่อคอลัมน์มาจากรายการคงที่ในไฟล์นี้เท่านั้น
 */
import type { PoolClient } from "pg";
import { query } from "../db";
import { markDbError } from "../dbErrors";
import { toTextOrNull } from "./users";
import type { DocumentItem } from "../../types";

// ---------------------------------------------------------------------------
// ช่อง ↔ คอลัมน์
// ---------------------------------------------------------------------------

/** ช่องข้อความ (TEXT) */
const TEXT_FIELDS = [
  ["departmentId", "department_id"],
  ["title", "title"],
  ["description", "description"],
  ["type", "type"],
  ["owner", "owner"],
  ["effectiveDate", "effective_date"],
  ["status", "status"],
  ["approvedBy", "approved_by"],
  ["fileUrl", "file_url"],
  ["realFileUrl", "real_file_url"],
  ["fileType", "file_type"],
  ["exampleText", "example_text"],
  ["exampleImage", "example_image"],
  ["exampleVideo", "example_video"],
  ["createdAt", "created_at"],
] as const;

type TextField = (typeof TEXT_FIELDS)[number][0];

/** ค่าที่เก็บของทุกช่อง (นอกจาก id และ ACL) — ผลของ toDocumentFields */
export type DocumentFields = Record<TextField, string | null> & {
  revision: number | null;
  approvedAt: string | null;
  parsedExcelSheets: unknown; // ค่าที่ Encode แล้ว (FS-06 Array หรือ { raw }) หรือ null
  views: number;
  downloads: number;
  tags: string[] | null;
};

export interface DocumentRow {
  id: string;
  department_id: string;
  title: string | null;
  description: string | null;
  type: string | null;
  owner: string | null;
  revision: number | null;
  effective_date: string | null;
  status: string;
  approved_by: string | null;
  approved_at: Date | string | null;
  file_url: string | null;
  real_file_url: string | null;
  file_type: string | null;
  example_text: string | null;
  example_image: string | null;
  example_video: string | null;
  parsed_excel_sheets: unknown;
  views: number;
  downloads: number;
  created_at: string | null;
  tags: string[] | null;
  /** ACL ตาม ordinal (จาก Subquery) */
  allowed_ids?: string[] | null;
}

// ---------------------------------------------------------------------------
// parsedExcelSheets (FS-06, Q-1 ก) — ฟังก์ชันบริสุทธิ์
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** สร้าง Own data property เสมอ — กันชื่อชีต "__proto__" ไปเปลี่ยน Prototype */
function setOwn(target: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

/**
 * ค่าจาก API → ค่าที่เก็บใน JSONB
 * - Plain object → [{ ordinal, name, rows }] ตามลำดับ Object.keys (FS-06)
 * - ค่าอื่นที่ไม่ใช่ null/undefined (เช่น Array) → { raw: ค่าเดิม } (แยกได้เพราะรูป FS-06 เป็น Array เสมอ)
 * - null / undefined → null (SQL NULL)
 */
export function encodeParsedExcelSheets(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (isPlainObject(value)) {
    return Object.keys(value).map((name, ordinal) => ({ ordinal, name, rows: value[name] }));
  }
  return { raw: value };
}

/** ค่าใน JSONB → ค่าของ API (กลับด้านของ encodeParsedExcelSheets) · NULL → undefined (Key หาย) */
export function decodeParsedExcelSheets(stored: unknown): unknown {
  if (stored === null || stored === undefined) return undefined;
  if (Array.isArray(stored)) {
    const out: Record<string, unknown> = {};
    const sheets = [...stored].sort(
      (a: any, b: any) => Number(a?.ordinal) - Number(b?.ordinal),
    );
    for (const s of sheets as Array<{ name?: unknown; rows?: unknown }>) {
      setOwn(out, String(s?.name), s?.rows);
    }
    return out;
  }
  if (isPlainObject(stored) && Object.prototype.hasOwnProperty.call(stored, "raw")) {
    return stored.raw;
  }
  return stored;
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

/** แถว + ACL → Object API (NULL = ไม่ใส่ Key, ไม่มี collection_order) */
export function rowToDocument(row: DocumentRow, allowedIds: readonly string[]): DocumentItem {
  const d: Record<string, unknown> = { id: row.id };
  for (const [field, column] of TEXT_FIELDS) {
    const v = row[column];
    if (v !== null && v !== undefined) d[field] = v;
  }
  if (row.revision !== null && row.revision !== undefined) d.revision = Number(row.revision);
  if (row.approved_at !== null && row.approved_at !== undefined) {
    d.approvedAt =
      row.approved_at instanceof Date ? row.approved_at.toISOString() : String(row.approved_at);
  }
  const sheets = decodeParsedExcelSheets(row.parsed_excel_sheets);
  if (sheets !== undefined) d.parsedExcelSheets = sheets;
  d.views = Number(row.views ?? 0);
  d.downloads = Number(row.downloads ?? 0);
  if (row.tags !== null && row.tags !== undefined) d.tags = [...row.tags];
  d.allowedDepartmentIds = [...allowedIds];
  return d as unknown as DocumentItem;
}

/**
 * Object เอกสารที่ Route เตรียมแล้ว → ค่าที่เก็บ (Q-2 ก)
 * - ช่องข้อความ: toTextOrNull (ตัวเลข → ข้อความ, null/ไม่ส่ง → NULL)
 * - revision: ตัวเลขจำกัด (Number.isFinite) เท่านั้น นอกนั้น NULL
 * - tags: ไม่ใช่ Array → NULL · สมาชิกที่ไม่ใช่ String → toTextOrNull · สมาชิกที่เป็น NULL ตัดทิ้ง
 * - parsedExcelSheets: encodeParsedExcelSheets · views/downloads: จำนวนเต็ม (ค่าอื่น = 0)
 * - ช่องนอกรายการไม่เก็บ (ไม่มี extra_data)
 */
export function toDocumentFields(input: Record<string, unknown>): DocumentFields {
  const out = {} as DocumentFields;
  for (const [field] of TEXT_FIELDS) out[field] = toTextOrNull(input[field]);
  const rev = input.revision;
  out.revision = typeof rev === "number" && Number.isFinite(rev) ? rev : null;
  out.approvedAt = toTextOrNull(input.approvedAt);
  out.parsedExcelSheets = encodeParsedExcelSheets(input.parsedExcelSheets);
  const toCount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);
  out.views = toCount(input.views);
  out.downloads = toCount(input.downloads);
  const tags = input.tags;
  out.tags = Array.isArray(tags)
    ? tags.map((t) => toTextOrNull(t)).filter((t): t is string => t !== null)
    : null;
  return out;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export type DocumentExecutor = { query: PoolClient["query"] } | undefined;

async function run(executor: DocumentExecutor, text: string, params: unknown[] = []) {
  try {
    return executor ? await executor.query(text, params) : await query(text, params);
  } catch (err) {
    throw markDbError(err);
  }
}

const SELECT_DOCUMENT = `
  SELECT d.id, d.department_id, d.title, d.description, d.type, d.owner, d.revision,
         d.effective_date, d.status, d.approved_by, d.approved_at, d.file_url, d.real_file_url,
         d.file_type, d.example_text, d.example_image, d.example_video, d.parsed_excel_sheets,
         d.views, d.downloads, d.created_at, d.tags,
         ARRAY(SELECT a.department_id FROM km.document_allowed_departments a
                WHERE a.document_id = d.id ORDER BY a.ordinal) AS allowed_ids
    FROM km.documents d`;

const toDoc = (row: DocumentRow) => rowToDocument(row, row.allowed_ids ?? []);

/** ทุกเอกสาร (ใหม่สุดก่อน) พร้อม ACL — Query เดียว */
export async function listDocuments(executor?: DocumentExecutor): Promise<DocumentItem[]> {
  const r = await run(executor, `${SELECT_DOCUMENT} ORDER BY d.collection_order DESC`);
  return (r.rows as DocumentRow[]).map(toDoc);
}

/** เอกสารเดียว · forUpdate = ล็อกแถวใน Transaction (SELECT … FOR UPDATE) ก่อนอ่าน */
export async function findDocument(
  executor: DocumentExecutor,
  id: string,
  options: { forUpdate?: boolean } = {},
): Promise<DocumentItem | undefined> {
  if (options.forUpdate) {
    const locked = await run(executor, "SELECT id FROM km.documents WHERE id = $1 FOR UPDATE", [id]);
    if ((locked.rowCount ?? 0) === 0) return undefined;
  }
  const r = await run(executor, `${SELECT_DOCUMENT} WHERE d.id = $1`, [id]);
  const row = r.rows[0] as DocumentRow | undefined;
  return row ? toDoc(row) : undefined;
}

export async function documentIdExists(executor: DocumentExecutor, id: string): Promise<boolean> {
  const r = await run(executor, "SELECT 1 FROM km.documents WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

// ลำดับคอลัมน์สำหรับ INSERT / UPDATE (คงที่)
const WRITE_COLUMNS: Array<{ column: string; cast: string; value: (f: DocumentFields) => unknown }> = [
  ...TEXT_FIELDS.map(([field, column]) => ({ column, cast: "text", value: (f: DocumentFields) => f[field] })),
  { column: "revision", cast: "double precision", value: (f) => f.revision },
  { column: "approved_at", cast: "timestamptz", value: (f) => f.approvedAt },
  // JSONB ต้องส่งเป็นข้อความ JSON เอง (pg แปลง JS Array เป็น PostgreSQL array ไม่ใช่ JSON)
  {
    column: "parsed_excel_sheets",
    cast: "jsonb",
    value: (f) => (f.parsedExcelSheets === null ? null : JSON.stringify(f.parsedExcelSheets)),
  },
  { column: "views", cast: "integer", value: (f) => f.views },
  { column: "downloads", cast: "integer", value: (f) => f.downloads },
  { column: "tags", cast: "text[]", value: (f) => f.tags },
];

async function replaceAcl(executor: DocumentExecutor, id: string, allowedIds: readonly string[]) {
  await run(executor, "DELETE FROM km.document_allowed_departments WHERE document_id = $1", [id]);
  if (allowedIds.length === 0) return;
  await run(
    executor,
    `INSERT INTO km.document_allowed_departments (document_id, department_id, ordinal)
     SELECT $1, u.department_id, u.ordinal
       FROM unnest($2::text[], $3::int[]) AS u(department_id, ordinal)`,
    [id, [...allowedIds], allowedIds.map((_, i) => i)],
  );
}

/** เพิ่มเอกสาร + ACL (ordinal 0..n ตามลำดับที่ Normalize แล้ว — Owner ก่อน FS-02) */
export async function insertDocument(
  executor: DocumentExecutor,
  id: string,
  fields: DocumentFields,
  allowedIds: readonly string[],
): Promise<void> {
  const columns = ["id", ...WRITE_COLUMNS.map((c) => c.column)];
  const params = [id, ...WRITE_COLUMNS.map((c) => c.value(fields))];
  const placeholders = ["$1::text", ...WRITE_COLUMNS.map((c, i) => `$${i + 2}::${c.cast}`)];
  await run(
    executor,
    `INSERT INTO km.documents (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
    params,
  );
  await replaceAcl(executor, id, allowedIds);
}

/** แทนค่าทุกช่องของเอกสาร + แทน ACL ทั้งชุด · คืน false เมื่อไม่พบแถว */
export async function updateDocument(
  executor: DocumentExecutor,
  id: string,
  fields: DocumentFields,
  allowedIds: readonly string[],
): Promise<boolean> {
  const sets = WRITE_COLUMNS.map((c, i) => `${c.column} = $${i + 2}::${c.cast}`);
  const r = await run(
    executor,
    `UPDATE km.documents SET ${sets.join(", ")} WHERE id = $1`,
    [id, ...WRITE_COLUMNS.map((c) => c.value(fields))],
  );
  if ((r.rowCount ?? 0) === 0) return false;
  await replaceAcl(executor, id, allowedIds);
  return true;
}

/** TX-12: เพิ่มตัวนับแบบ Atomic (`x = x + 1`) · คืนค่าใหม่ หรือ undefined เมื่อไม่พบแถว */
export async function incrementCounter(
  executor: DocumentExecutor,
  id: string,
  counter: "views" | "downloads",
): Promise<number | undefined> {
  const column = counter === "views" ? "views" : "downloads";
  const r = await run(
    executor,
    `UPDATE km.documents SET ${column} = ${column} + 1 WHERE id = $1 RETURNING ${column} AS value`,
    [id],
  );
  const row = r.rows[0] as { value: number } | undefined;
  return row ? Number(row.value) : undefined;
}

/** ลบเอกสาร (ACL ลบตาม CASCADE, Ratings คงไว้ OD-FK-03) · คืนลิงก์ไฟล์ของแถวที่ลบ หรือ undefined */
export async function deleteDocument(
  executor: DocumentExecutor,
  id: string,
): Promise<{ fileUrl: string | null; realFileUrl: string | null } | undefined> {
  const r = await run(
    executor,
    "DELETE FROM km.documents WHERE id = $1 RETURNING file_url, real_file_url",
    [id],
  );
  const row = r.rows[0] as { file_url: string | null; real_file_url: string | null } | undefined;
  return row ? { fileUrl: row.file_url, realFileUrl: row.real_file_url } : undefined;
}

/** อนุมัติ: ตั้ง Published + ผู้อนุมัติ + เวลา · คืน true เมื่อมีแถว */
export async function approveDocument(
  executor: DocumentExecutor,
  id: string,
  approvedBy: string,
  approvedAt: string,
): Promise<boolean> {
  const r = await run(
    executor,
    `UPDATE km.documents
        SET status = 'Published', approved_by = $2, approved_at = $3::timestamptz
      WHERE id = $1
  RETURNING id`,
    [id, approvedBy, approvedAt],
  );
  return (r.rowCount ?? 0) > 0;
}
