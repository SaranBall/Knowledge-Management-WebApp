/**
 * PERSIST-01C-4 — Helper ร่วมของ Repo กลุ่มความรู้และการโต้ตอบ (kb, experts, contact, custom_resources,
 * ratings, search_logs) — ฟังก์ชันบริสุทธิ์ยกเว้น runQuery
 * กติกาเดียวกับ 01C-1..3: NULL = ไม่ใส่ Key · TIMESTAMPTZ → toISOString() · TEXT[] คัดลอก Array
 */
import type { PoolClient, QueryResult } from "pg";
import { query } from "../db";
import { markDbError } from "../dbErrors";
import { toTextOrNull } from "./users";

export type Executor = { query: PoolClient["query"] } | undefined;

/** Query ผ่าน Client ของ Transaction หรือ Pool — Error ถูกทำเครื่องหมายว่ามาจาก DB */
export async function runQuery(
  executor: Executor,
  text: string,
  params: unknown[] = [],
): Promise<QueryResult> {
  try {
    return executor ? await executor.query(text, params) : await query(text, params);
  } catch (err) {
    throw markDbError(err);
  }
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** สร้าง Own data property เสมอ — กันชื่อช่อง "__proto__" ไปเปลี่ยน Prototype */
export function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

/** ใส่ Key เฉพาะเมื่อค่าไม่ใช่ NULL/undefined */
export function putIfPresent(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== null && value !== undefined) target[key] = value;
}

/** TIMESTAMPTZ (Date) → ISO 8601 · NULL → undefined */
export function isoOrUndefined(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  return v instanceof Date ? v.toISOString() : String(v);
}

/** TEXT[] → คัดลอก Array · NULL → undefined */
export function copyArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? [...v] : undefined;
}

/** Q-2 (ก): ช่อง TEXT[] — ไม่ใช่ Array → NULL · สมาชิกที่ไม่ใช่ String → toTextOrNull · สมาชิก NULL ตัดทิ้ง */
export function toTextArrayOrNull(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.map((x) => toTextOrNull(x)).filter((x): x is string => x !== null);
}

/** Q-2 (ก): ตัวเลขจำกัด (Number.isFinite) เท่านั้น นอกนั้น NULL */
export function toFiniteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Q-2 (ก): จำนวนเต็ม (คอลัมน์ INTEGER) — ตัวเลขจำกัดตัดทศนิยม นอกนั้น NULL */
export function toIntegerOrNull(v: unknown): number | null {
  const n = toFiniteOrNull(v);
  return n === null ? null : Math.trunc(n);
}

/** id ที่ Client ส่งมา: เดิมใช้เมื่อ truthy (`if (!body.id)` = ให้ Server สร้าง) */
export function clientIdOf(body: Record<string, unknown>): string | undefined {
  return body.id ? (toTextOrNull(body.id) as string) : undefined;
}
