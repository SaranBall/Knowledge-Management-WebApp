/**
 * PERSIST-01C-0 — จำแนก Error ของ PostgreSQL ตาม SQLSTATE
 *
 * ไฟล์นี้ไม่ตัดสิน HTTP status — แต่ละ Route ตัดสินเองจากผลที่ได้ (ขั้น 01C-1 เป็นต้นไป)
 * PostgreSQL 18: ON DELETE RESTRICT ส่ง 23001, FK ตอน Insert/Update ส่ง 23503, UNIQUE ส่ง 23505
 */

export type DbErrorKind =
  | "unique"
  | "foreign_key"
  | "restrict"
  | "check"
  | "not_null"
  | "other";

export interface DbErrorInfo {
  kind: DbErrorKind;
  /** ชื่อ Constraint ที่ PostgreSQL รายงาน (ถ้ามี) */
  constraint?: string;
  /** SQLSTATE 5 ตัวอักษร — มีเฉพาะ Error ที่มาจาก PostgreSQL */
  sqlstate?: string;
}

const KIND_BY_SQLSTATE: Readonly<Record<string, DbErrorKind>> = {
  "23505": "unique",
  "23503": "foreign_key",
  "23001": "restrict",
  "23514": "check",
  "23502": "not_null",
};

const SQLSTATE_RE = /^[0-9A-Z]{5}$/;

/**
 * Error จาก PostgreSQL (pg DatabaseError) มี `code` เป็น SQLSTATE และ `severity` เสมอ
 * ใช้ `severity` แยกจาก Error ของระบบที่ `code` บังเอิญยาว 5 ตัว (เช่น `EPIPE`)
 */
export function classifyDbError(err: unknown): DbErrorInfo {
  if (!err || typeof err !== "object") return { kind: "other" };
  const e = err as { code?: unknown; severity?: unknown; constraint?: unknown };
  if (
    typeof e.code !== "string" ||
    !SQLSTATE_RE.test(e.code) ||
    typeof e.severity !== "string"
  ) {
    return { kind: "other" };
  }
  const info: DbErrorInfo = {
    kind: KIND_BY_SQLSTATE[e.code] ?? "other",
    sqlstate: e.code,
  };
  if (typeof e.constraint === "string" && e.constraint) {
    info.constraint = e.constraint;
  }
  return info;
}
