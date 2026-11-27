/**
 * PERSIST-01C-4 B1 — ประวัติการค้นหา (km.search_logs) และการปิดช่องว่างความรู้ (km.search_resolutions)
 * - NULL = ไม่ใส่ Key · TIMESTAMPTZ → toISOString() · ลำดับ collection_order DESC (เดิม unshift) ทั้งสองตาราง
 * - C-15: id ของ search_logs กันชนในฐาน (FS-12) — Route สร้าง/ลองใหม่
 * - search_resolutions: UNIQUE km.text_sha256(keyword) (FS-07, Case-sensitive) — ชนพร้อมกัน = 23505
 */
import type { SearchLog } from "../../types";
import { toTextOrNull } from "./users";
import { type Executor, isoOrUndefined, putIfPresent, runQuery } from "./rowHelpers";

export interface SearchResolution {
  id: string;
  keyword: string;
  action: string;
  assignedTo?: string;
  resolvedBy: string;
  resolvedByName: string;
  resolvedAt: string;
}

// --- search_logs ---

const LOG_COLUMNS = ["id", "keyword", "user_id", `"timestamp"`, "has_result"];
const LOG_SELECT = `SELECT ${LOG_COLUMNS.join(", ")} FROM km.search_logs`;

export type SearchLogRow = Record<string, unknown> & { id: string };

export function rowToSearchLog(row: SearchLogRow): SearchLog {
  const l: Record<string, unknown> = { id: row.id };
  putIfPresent(l, "keyword", row.keyword);
  putIfPresent(l, "userId", row.user_id);
  putIfPresent(l, "timestamp", isoOrUndefined(row.timestamp));
  if (row.has_result !== null && row.has_result !== undefined) l.hasResult = Boolean(row.has_result);
  return l as unknown as SearchLog;
}

/** ใหม่สุดก่อน */
export async function listSearchLogs(executor?: Executor): Promise<SearchLog[]> {
  const r = await runQuery(executor, `${LOG_SELECT} ORDER BY collection_order DESC`);
  return (r.rows as SearchLogRow[]).map(rowToSearchLog);
}

export async function searchLogIdExists(executor: Executor, id: string): Promise<boolean> {
  const r = await runQuery(executor, "SELECT 1 FROM km.search_logs WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

export async function insertSearchLog(executor: Executor, log: SearchLog): Promise<SearchLog> {
  const r = await runQuery(
    executor,
    `INSERT INTO km.search_logs (${LOG_COLUMNS.join(", ")})
     VALUES ($1, $2, $3, $4::timestamptz, $5) RETURNING ${LOG_COLUMNS.join(", ")}`,
    [log.id, log.keyword, log.userId, log.timestamp, log.hasResult],
  );
  return rowToSearchLog(r.rows[0] as SearchLogRow);
}

/** ช่องว่างความรู้จริง = มี search_log ที่ keyword ตรงตัว (Case-sensitive) และไม่มีผลลัพธ์ */
export async function isRealGap(executor: Executor, keyword: string): Promise<boolean> {
  const r = await runQuery(
    executor,
    "SELECT 1 FROM km.search_logs WHERE keyword = $1 AND NOT has_result LIMIT 1",
    [keyword],
  );
  return (r.rowCount ?? 0) > 0;
}

// --- search_resolutions ---

const RES_COLUMNS = ["id", "keyword", "action", "assigned_to", "resolved_by", "resolved_by_name", "resolved_at"];
const RES_SELECT = `SELECT ${RES_COLUMNS.join(", ")} FROM km.search_resolutions`;

export type SearchResolutionRow = Record<string, unknown> & { id: string };

export function rowToSearchResolution(row: SearchResolutionRow): SearchResolution {
  const s: Record<string, unknown> = { id: row.id };
  putIfPresent(s, "keyword", row.keyword);
  putIfPresent(s, "action", row.action);
  putIfPresent(s, "assignedTo", row.assigned_to);
  putIfPresent(s, "resolvedBy", row.resolved_by);
  putIfPresent(s, "resolvedByName", row.resolved_by_name);
  putIfPresent(s, "resolvedAt", isoOrUndefined(row.resolved_at));
  return s as unknown as SearchResolution;
}

/** ใหม่สุดก่อน */
export async function listSearchResolutions(executor?: Executor): Promise<SearchResolution[]> {
  const r = await runQuery(executor, `${RES_SELECT} ORDER BY collection_order DESC`);
  return (r.rows as SearchResolutionRow[]).map(rowToSearchResolution);
}

/** ปิดไปแล้วหรือยัง (เทียบแบบเดียวกับ UNIQUE: km.text_sha256 — Case-sensitive) */
export async function resolutionExists(executor: Executor, keyword: string): Promise<boolean> {
  const r = await runQuery(
    executor,
    "SELECT 1 FROM km.search_resolutions WHERE km.text_sha256(keyword) = km.text_sha256($1) LIMIT 1",
    [keyword],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function insertSearchResolution(executor: Executor, s: SearchResolution): Promise<SearchResolution> {
  const r = await runQuery(
    executor,
    `INSERT INTO km.search_resolutions (${RES_COLUMNS.join(", ")})
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz) RETURNING ${RES_COLUMNS.join(", ")}`,
    [s.id, s.keyword, s.action, toTextOrNull(s.assignedTo), s.resolvedBy, s.resolvedByName, s.resolvedAt],
  );
  return rowToSearchResolution(r.rows[0] as SearchResolutionRow);
}
