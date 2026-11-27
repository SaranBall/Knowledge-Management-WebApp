/**
 * PERSIST-01C-4 B1 — ความเห็นและคะแนน (km.ratings)
 * - target_type = "document" | "kb" ตามที่ POST หาเจอ (Document-first) · API คืน docOrKBId = target_id
 * - GET ยังหาเป้าหมายตอนอ่านด้วย target_id แบบเดิม (เป้าหมายถูกลบ = Orphan) — OD-FK-07
 * - NULL = ไม่ใส่ Key · created_at → toISOString() · ลำดับ collection_order DESC (เดิม unshift)
 */
import type { RatingAndComment } from "../../types";
import { toTextOrNull } from "./users";
import { type Executor, isoOrUndefined, putIfPresent, runQuery } from "./rowHelpers";

export type RatingTargetType = "document" | "kb";

const COLUMNS = ["id", "target_type", "target_id", "user_id", "user_name", "rating", "comment", "created_at"];
const SELECT = `SELECT ${COLUMNS.join(", ")} FROM km.ratings`;

export type RatingRow = Record<string, unknown> & { id: string };

export function rowToRating(row: RatingRow): RatingAndComment {
  const r: Record<string, unknown> = { id: row.id };
  putIfPresent(r, "docOrKBId", row.target_id);
  putIfPresent(r, "userId", row.user_id);
  putIfPresent(r, "userName", row.user_name);
  if (row.rating !== null && row.rating !== undefined) r.rating = Number(row.rating);
  putIfPresent(r, "comment", row.comment);
  putIfPresent(r, "createdAt", isoOrUndefined(row.created_at));
  return r as unknown as RatingAndComment;
}

/** ใหม่สุดก่อน */
export async function listRatings(executor?: Executor): Promise<RatingAndComment[]> {
  const r = await runQuery(executor, `${SELECT} ORDER BY collection_order DESC`);
  return (r.rows as RatingRow[]).map(rowToRating);
}

export async function ratingIdExists(executor: Executor, id: string): Promise<boolean> {
  const r = await runQuery(executor, "SELECT 1 FROM km.ratings WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

/** ค่าทุกช่องมาจาก Route (Validate แล้ว) */
export async function insertRating(
  executor: Executor,
  rating: RatingAndComment,
  targetType: RatingTargetType,
): Promise<RatingAndComment> {
  const r = await runQuery(
    executor,
    `INSERT INTO km.ratings (${COLUMNS.join(", ")})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
     RETURNING ${COLUMNS.join(", ")}`,
    [
      rating.id, targetType, rating.docOrKBId, rating.userId, rating.userName,
      rating.rating, toTextOrNull(rating.comment), rating.createdAt,
    ],
  );
  return rowToRating(r.rows[0] as RatingRow);
}
