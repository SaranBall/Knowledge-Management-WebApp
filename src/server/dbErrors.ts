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

// 01C-1: ทำเครื่องหมาย Error ที่มาจากการเรียกฐานข้อมูล (รวม Error การเชื่อมต่อที่ไม่มี SQLSTATE)
// เพื่อให้ Route ตอบ 500 แบบทั่วไปโดยไม่ส่ง err.message ของ DB ให้ Client — ไม่แก้ตัว Error เดิม
// (ใช้ Symbol แบบ non-enumerable จึงไม่กระทบ classifyDbError หรือการ Log)
const DB_ERROR_MARK = Symbol.for("km-rmp.dbError");

/** ทำเครื่องหมายว่า Error นี้มาจากการเรียกฐานข้อมูล แล้วคืน Error เดิม */
export function markDbError<T>(err: T): T {
  if (err && typeof err === "object" && !Object.isFrozen(err)) {
    Object.defineProperty(err, DB_ERROR_MARK, { value: true, enumerable: false });
  }
  return err;
}

/** Error มาจากฐานข้อมูลหรือไม่ (ถูกทำเครื่องหมาย หรือเป็น Error ของ PostgreSQL ที่มี SQLSTATE) */
export function isDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ((err as Record<symbol, unknown>)[DB_ERROR_MARK] === true) return true;
  return classifyDbError(err).sqlstate !== undefined;
}

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
