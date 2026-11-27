/**
 * PERSIST-01C-4 B1 — คำถามถึงผู้เชี่ยวชาญ (km.contact_requests)
 * - NULL = ไม่ใส่ Key · ไม่คืน collection_order · ลำดับ collection_order DESC (เดิม unshift)
 * - created_at TIMESTAMPTZ → toISOString() · expert_id เป็น ref ไม่มี FK (OD-FK-04)
 */
import type { ContactRequest } from "../../types";
import { toTextOrNull } from "./users";
import { type Executor, isoOrUndefined, putIfPresent, runQuery } from "./rowHelpers";

const COLUMNS = [
  "id", "user_id", "user_name", "user_dept", "expert_id", "expert_name",
  "topic", "message", "status", "reply_message", "created_at",
];
const SELECT = `SELECT ${COLUMNS.join(", ")} FROM km.contact_requests`;

export type ContactRow = Record<string, unknown> & { id: string };

export function rowToContactRequest(row: ContactRow): ContactRequest {
  const c: Record<string, unknown> = { id: row.id };
  putIfPresent(c, "userId", row.user_id);
  putIfPresent(c, "userName", row.user_name);
  putIfPresent(c, "userDept", row.user_dept);
  putIfPresent(c, "expertId", row.expert_id);
  putIfPresent(c, "expertName", row.expert_name);
  putIfPresent(c, "topic", row.topic);
  putIfPresent(c, "message", row.message);
  putIfPresent(c, "status", row.status);
  putIfPresent(c, "replyMessage", row.reply_message);
  putIfPresent(c, "createdAt", isoOrUndefined(row.created_at));
  return c as unknown as ContactRequest;
}

/** ใหม่สุดก่อน · userId ระบุ = เฉพาะของผู้ใช้นั้น (Viewer) */
export async function listContactRequests(executor: Executor, userId?: string): Promise<ContactRequest[]> {
  const r =
    userId === undefined
      ? await runQuery(executor, `${SELECT} ORDER BY collection_order DESC`)
      : await runQuery(executor, `${SELECT} WHERE user_id = $1 ORDER BY collection_order DESC`, [userId]);
  return (r.rows as ContactRow[]).map(rowToContactRequest);
}

export async function contactRequestIdExists(executor: Executor, id: string): Promise<boolean> {
  const r = await runQuery(executor, "SELECT 1 FROM km.contact_requests WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

/** ค่าทุกช่องมาจาก Route (Validate แล้ว) */
export async function insertContactRequest(executor: Executor, req: ContactRequest): Promise<ContactRequest> {
  const r = await runQuery(
    executor,
    `INSERT INTO km.contact_requests (${COLUMNS.join(", ")})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz)
     RETURNING ${COLUMNS.join(", ")}`,
    [
      req.id, req.userId, req.userName, toTextOrNull(req.userDept), req.expertId, req.expertName,
      toTextOrNull(req.topic), toTextOrNull(req.message), req.status, toTextOrNull(req.replyMessage), req.createdAt,
    ],
  );
  return rowToContactRequest(r.rows[0] as ContactRow);
}

/** ตอบคำถาม: status = Replied, reply_message = toTextOrNull(replyMessage) (Q-2 ก) · ไม่พบ → undefined */
export async function replyContactRequest(
  executor: Executor,
  id: string,
  replyMessage: unknown,
): Promise<ContactRequest | undefined> {
  const r = await runQuery(
    executor,
    `UPDATE km.contact_requests SET status = 'Replied', reply_message = $2 WHERE id = $1
     RETURNING ${COLUMNS.join(", ")}`,
    [id, toTextOrNull(replyMessage)],
  );
  const row = r.rows[0] as ContactRow | undefined;
  return row ? rowToContactRequest(row) : undefined;
}
