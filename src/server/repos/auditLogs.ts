/**
 * PERSIST-01C-1 B4 — System audit log ใน km.system_audit_logs
 *
 * - ลำดับรายการ = collection_order DESC (เดิม db_system_audit_logs.unshift → ใหม่สุดก่อน)
 * - insertAuditLog รับได้ทั้ง Pool (ค่าเริ่มต้น) และ Client ภายใน withTransaction
 * - km_app เขียนได้อย่างเดียว (ไม่มีสิทธิ์ UPDATE/DELETE ตารางนี้)
 */
import type { PoolClient } from "pg";
import { query } from "../db";
import { markDbError } from "../dbErrors";
import type { SystemAuditLog } from "../../types";

interface AuditRow {
  id: string;
  action: string;
  details: string;
  performed_by: string;
  timestamp: Date | string;
}

export function rowToAuditLog(row: AuditRow): SystemAuditLog {
  return {
    id: row.id,
    action: row.action,
    details: row.details,
    performedBy: row.performed_by,
    // TIMESTAMPTZ → Date (Parser เริ่มต้นของ pg) → ISO 8601 แบบเดิม (toISOString)
    timestamp:
      row.timestamp instanceof Date
        ? row.timestamp.toISOString()
        : String(row.timestamp),
  };
}

export type AuditExecutor = { query: PoolClient["query"] };

/** เขียน Audit log หนึ่งรายการ — `executor` ไม่ส่ง = ใช้ Pool */
export async function insertAuditLog(
  executor: AuditExecutor | undefined,
  log: SystemAuditLog,
): Promise<void> {
  const text = `INSERT INTO km.system_audit_logs (id, action, details, performed_by, "timestamp")
                VALUES ($1, $2, $3, $4, $5)`;
  const params = [log.id, log.action, log.details, log.performedBy, log.timestamp];
  try {
    if (executor) await executor.query(text, params);
    else await query(text, params);
  } catch (err) {
    throw markDbError(err);
  }
}

export async function listAuditLogs(): Promise<SystemAuditLog[]> {
  try {
    const r = await query<AuditRow>(
      `SELECT id, action, details, performed_by, "timestamp"
         FROM km.system_audit_logs
        ORDER BY collection_order DESC`,
    );
    return r.rows.map(rowToAuditLog);
  } catch (err) {
    throw markDbError(err);
  }
}
