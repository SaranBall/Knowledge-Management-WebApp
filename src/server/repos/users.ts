/**
 * PERSIST-01C-1 B3 — ผู้ใช้ใน km.users + Mapper (แถว ↔ Object API)
 *
 * - คอลัมน์ snake_case ↔ ช่อง camelCase
 * - password_hash ↔ `password` ใช้ภายใน Server เท่านั้น (Route ต้อง sanitize ก่อนส่ง)
 * - ค่า NULL ของช่องที่ไม่บังคับ = ไม่ใส่ Key (ให้ JSON เหมือน Object ใน Memory เดิม)
 * - ลำดับรายการ = collection_order ASC (เดิม db_users.push)
 * - ทุก Query ใช้ Parameter; ชื่อคอลัมน์มาจากรายการคงที่ในไฟล์นี้เท่านั้น
 */
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { query } from "../db";
import { markDbError } from "../dbErrors";
import type { User } from "../../types";

export interface UserRow {
  id: string;
  employee_id: string | null;
  name: string | null;
  position: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  department_id: string | null;
  avatar_url: string | null;
  password_hash: string | null;
  status: string | null;
  start_date: string | null;
}

/** ช่องของ API ที่เขียนได้ ↔ คอลัมน์ (ไม่รวม id และ password ที่จัดการแยก) */
export const USER_FIELD_COLUMNS = [
  ["employeeId", "employee_id"],
  ["name", "name"],
  ["position", "position"],
  ["role", "role"],
  ["email", "email"],
  ["phone", "phone"],
  ["departmentId", "department_id"],
  ["avatarUrl", "avatar_url"],
  ["status", "status"],
  ["startDate", "start_date"],
] as const;

export type UserField = (typeof USER_FIELD_COLUMNS)[number][0];

const SELECT_COLUMNS =
  "id, employee_id, name, position, role, email, phone, department_id, avatar_url, password_hash, status, start_date";

/** แถว → User (password = hash สำหรับใช้ภายใน Server เท่านั้น) */
export function rowToUser(row: UserRow): User {
  const u: Record<string, unknown> = { id: row.id };
  for (const [field, column] of USER_FIELD_COLUMNS) {
    const v = row[column];
    if (v !== null && v !== undefined) u[field] = v;
  }
  if (row.password_hash !== null && row.password_hash !== undefined) {
    u.password = row.password_hash;
  }
  return u as unknown as User;
}

/** ตัด `password` (hash) ออกก่อนส่งให้ Client — เดิมอยู่ใน server.ts */
export function sanitizeUser<T extends { password?: string }>(user: T) {
  const { password, ...rest } = user;
  return rest;
}

/** ค่าจาก Body → ค่าที่เก็บในคอลัมน์ TEXT (undefined/null = NULL) */
export function toTextOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

type Executor = { query: PoolClient["query"] } | undefined;

async function run<R extends QueryResultRow>(
  text: string,
  params: unknown[],
  executor?: Executor,
): Promise<QueryResult<R>> {
  try {
    return executor
      ? await executor.query<R>(text, params)
      : await query<R>(text, params);
  } catch (err) {
    throw markDbError(err);
  }
}

export async function listUsers(): Promise<User[]> {
  const r = await run<UserRow>(
    `SELECT ${SELECT_COLUMNS} FROM km.users ORDER BY collection_order ASC`,
    [],
  );
  return r.rows.map(rowToUser);
}

export async function countUsers(): Promise<number> {
  const r = await run<{ n: number }>("SELECT count(*)::int AS n FROM km.users", []);
  return r.rows[0].n;
}

export async function findUserById(id: string): Promise<User | undefined> {
  const r = await run<UserRow>(
    `SELECT ${SELECT_COLUMNS} FROM km.users WHERE id = $1`,
    [id],
  );
  return r.rows[0] ? rowToUser(r.rows[0]) : undefined;
}

/**
 * requireAuth: ตรงตัวตามเดิม `(id && u.id === id) || (employeeId && u.employeeId === employeeId)`
 * ค่าที่เป็น falsy ส่งเป็น NULL (ไม่ตรงกับแถวใด) และคืนแถวแรกตามลำดับเดิม
 */
export async function findUserForAuth(
  id: unknown,
  employeeId: unknown,
): Promise<User | undefined> {
  const r = await run<UserRow>(
    `SELECT ${SELECT_COLUMNS} FROM km.users
      WHERE id = $1 OR employee_id = $2
      ORDER BY collection_order ASC
      LIMIT 1`,
    [id ? String(id) : null, employeeId ? String(employeeId) : null],
  );
  return r.rows[0] ? rowToUser(r.rows[0]) : undefined;
}

/** Login: รหัสพนักงานไม่สนตัวพิมพ์ */
export async function findUserByEmployeeIdCaseInsensitive(
  employeeId: string,
): Promise<User | undefined> {
  const r = await run<UserRow>(
    `SELECT ${SELECT_COLUMNS} FROM km.users
      WHERE lower(employee_id) = lower($1)
      ORDER BY collection_order ASC
      LIMIT 1`,
    [employeeId],
  );
  return r.rows[0] ? rowToUser(r.rows[0]) : undefined;
}

export async function userIdExists(id: string): Promise<boolean> {
  const r = await run("SELECT 1 FROM km.users WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

/** รหัสพนักงานถูกใช้แล้วหรือไม่ (ไม่สนตัวพิมพ์ รวมบัญชี Terminated) — ยกเว้นผู้ใช้ `excludeId` */
export async function employeeIdTaken(
  employeeId: string,
  excludeId?: string,
): Promise<boolean> {
  const r = await run(
    `SELECT 1 FROM km.users
      WHERE lower(employee_id) = lower($1)
        AND ($2::text IS NULL OR id <> $2)
      LIMIT 1`,
    [employeeId, excludeId ?? null],
  );
  return (r.rowCount ?? 0) > 0;
}

export interface NewUserValues {
  id: string;
  fields: Partial<Record<UserField, string | null>>;
  passwordHash: string | null;
}

export async function insertUser(values: NewUserValues): Promise<User> {
  const cols = ["id"];
  const params: unknown[] = [values.id];
  for (const [field, column] of USER_FIELD_COLUMNS) {
    cols.push(column);
    params.push(values.fields[field] ?? null);
  }
  cols.push("password_hash");
  params.push(values.passwordHash);
  const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
  const r = await run<UserRow>(
    `INSERT INTO km.users (${cols.join(", ")}) VALUES (${placeholders})
     RETURNING ${SELECT_COLUMNS}`,
    params,
  );
  return rowToUser(r.rows[0]);
}

/**
 * แก้เฉพาะช่องที่ส่งมา (เดิม `{...u, ...body}`) — ไม่แก้ id
 * `passwordHash` undefined = ไม่เปลี่ยนรหัสผ่าน · คืน undefined เมื่อไม่พบผู้ใช้
 */
export async function updateUser(
  id: string,
  fields: Partial<Record<UserField, string | null>>,
  passwordHash?: string,
): Promise<User | undefined> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [field, column] of USER_FIELD_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(fields, field)) {
      params.push(fields[field] ?? null);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (passwordHash !== undefined) {
    params.push(passwordHash);
    sets.push(`password_hash = $${params.length}`);
  }
  if (sets.length === 0) return findUserById(id);
  params.push(id);
  const r = await run<UserRow>(
    `UPDATE km.users SET ${sets.join(", ")} WHERE id = $${params.length}
     RETURNING ${SELECT_COLUMNS}`,
    params,
  );
  return r.rows[0] ? rowToUser(r.rows[0]) : undefined;
}

/** F-01: DELETE ผู้ใช้ = ตั้ง status Terminated (ไม่ลบแถว) */
export async function terminateUser(id: string): Promise<void> {
  await run("UPDATE km.users SET status = 'Terminated' WHERE id = $1", [id]);
}

/** Initial Admin: เพิ่มเฉพาะเมื่อตาราง users ยังว่าง — คืน true เมื่อเพิ่มจริง */
export async function insertInitialAdminIfEmpty(values: NewUserValues): Promise<boolean> {
  const cols = ["id"];
  const params: unknown[] = [values.id];
  for (const [field, column] of USER_FIELD_COLUMNS) {
    cols.push(column);
    params.push(values.fields[field] ?? null);
  }
  cols.push("password_hash");
  params.push(values.passwordHash);
  const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
  const r = await run(
    `INSERT INTO km.users (${cols.join(", ")})
     SELECT ${placeholders}
     WHERE NOT EXISTS (SELECT 1 FROM km.users)`,
    params,
  );
  return (r.rowCount ?? 0) > 0;
}
