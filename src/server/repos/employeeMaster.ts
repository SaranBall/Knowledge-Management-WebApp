/**
 * PERSIST-01C-2 B1 — ทะเบียนพนักงานกลาง (km.employee_master)
 *
 * อ้างอิง: Preflight 01C-2 (Q-1 (ก), Q-2 (ข)), Master V6 §21.9 C (TX-09), Ledger B-17, OD-UQ-02, FS-05, ERD R9
 * - คอลัมน์ snake_case ↔ ช่อง camelCase 9 ช่อง · NULL = ไม่ใส่ Key
 * - ไม่คืน row_id / sort_order (FS-05) · isDeptResolved คำนวณตอนอ่าน (R9)
 * - ลำดับ = sort_order ASC, row_id ASC (row_id เป็นตัวตัดสินสำรองเท่านั้น)
 * - ทุก Query ใช้ Parameter; ชื่อคอลัมน์มาจากรายการคงที่ในไฟล์นี้เท่านั้น
 */
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { query } from "../db";
import { markDbError } from "../dbErrors";
import { toTextOrNull } from "./users";
import { getDepartmentById } from "../../utils/departmentUtils";
import type { EmployeeMaster } from "../../types";

/** ช่องของ API ↔ คอลัมน์ (9 ช่อง) */
export const EMPLOYEE_FIELD_COLUMNS = [
  ["employeeId", "employee_id"],
  ["name", "name"],
  ["departmentId", "department_id"],
  ["position", "position"],
  ["startDate", "start_date"],
  ["level", "level"],
  ["email", "email"],
  ["phone", "phone"],
  ["status", "status"],
] as const;

export type EmployeeField = (typeof EMPLOYEE_FIELD_COLUMNS)[number][0];
/** ค่าที่เก็บของ 9 ช่อง (ข้อความหรือ NULL) */
export type EmployeeFields = Record<EmployeeField, string | null>;

export interface EmployeeRow {
  row_id: string;
  sort_order: string; // BIGINT → pg คืนเป็นข้อความ
  employee_id: string | null;
  name: string | null;
  department_id: string | null;
  position: string | null;
  start_date: string | null;
  level: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
}

const SELECT_COLUMNS =
  "row_id, sort_order, employee_id, name, department_id, position, start_date, level, email, phone, status";

/** แถว → Object API (ไม่มี row_id / sort_order) — isDeptResolved คิดแบบเดียวกับโค้ดเดิม */
export function rowToEmployee(row: EmployeeRow): EmployeeMaster {
  const e: Record<string, unknown> = {};
  for (const [field, column] of EMPLOYEE_FIELD_COLUMNS) {
    const v = row[column];
    if (v !== null && v !== undefined) e[field] = v;
  }
  e.isDeptResolved = !!getDepartmentById(String(e.departmentId ?? ""));
  return e as unknown as EmployeeMaster;
}

/** Object จาก Payload → ค่าที่เก็บ 9 ช่อง (ช่องที่ไม่ส่ง = NULL; ช่องอื่นนอก 9 ช่อง รวม isDeptResolved ไม่เก็บ) */
export function toEmployeeFields(input: Record<string, unknown>): EmployeeFields {
  const out = {} as EmployeeFields;
  for (const [field] of EMPLOYEE_FIELD_COLUMNS) {
    out[field] = Object.prototype.hasOwnProperty.call(input, field)
      ? toTextOrNull(input[field])
      : null;
  }
  return out;
}

function rowToFields(row: EmployeeRow): EmployeeFields {
  const out = {} as EmployeeFields;
  for (const [field, column] of EMPLOYEE_FIELD_COLUMNS) out[field] = row[column];
  return out;
}

export interface ExistingEmployee {
  rowId: string;
  fields: EmployeeFields;
}

export interface EditorMergePlan {
  /** แถวเดิมที่ต้องแทนทั้งแถว (ค่าสุดท้ายของแต่ละ row_id ตามลำดับในฐาน) */
  updates: Array<{ rowId: string; fields: EmployeeFields }>;
  /** แถวใหม่ต่อท้าย ตามลำดับที่ Append (ค่าสุดท้ายหลังแถวซ้ำใน Payload เดียวกัน) */
  inserts: EmployeeFields[];
}

/**
 * Editor Merge ตามอัลกอริทึมเดิม (B-17) — ฟังก์ชันบริสุทธิ์ ไม่แก้ Input
 * วนตามลำดับ Payload: หาแถวแรก (ตามลำดับ) ที่ employeeId ตรงกัน → แทนทั้งแถว คงตำแหน่ง/row_id;
 * ไม่เจอ → Append (แถวที่ Append แล้วให้แถวถัดไปใน Payload เดียวกันหาเจอ)
 * การเทียบ (Q-1 ก): ทั้งสองฝั่งเป็นค่าหลัง toTextOrNull แล้วเทียบตรงตัว —
 * null ตรงกับ null (IS NOT DISTINCT FROM), 123 ตรงกับ "123", ตัวพิมพ์ต่าง = ไม่ตรง, "" ตรงกับ "" เท่านั้น
 */
export function planEditorMerge(
  existing: readonly ExistingEmployee[],
  incoming: readonly Record<string, unknown>[],
): EditorMergePlan {
  type Slot = { rowId: string | null; fields: EmployeeFields; touched: boolean };
  const working: Slot[] = existing.map((e) => ({
    rowId: e.rowId,
    fields: { ...e.fields },
    touched: false,
  }));
  for (const item of incoming) {
    const fields = toEmployeeFields(item);
    const idx = working.findIndex((s) => s.fields.employeeId === fields.employeeId);
    if (idx !== -1) {
      working[idx] = { rowId: working[idx].rowId, fields, touched: true };
    } else {
      working.push({ rowId: null, fields, touched: true });
    }
  }
  const updates: EditorMergePlan["updates"] = [];
  const inserts: EmployeeFields[] = [];
  for (const s of working) {
    if (s.rowId === null) inserts.push(s.fields);
    else if (s.touched) updates.push({ rowId: s.rowId, fields: s.fields });
  }
  return { updates, inserts };
}

// ---------------------------------------------------------------------------
// Query — ใช้ภายใน withTransaction (Client) หรือ Pool
// ---------------------------------------------------------------------------

export type EmployeeExecutor = { query: PoolClient["query"] } | undefined;

async function run<R extends Record<string, unknown>>(
  executor: EmployeeExecutor,
  text: string,
  params: unknown[] = [],
) {
  try {
    return executor
      ? await executor.query<R>(text, params)
      : await query<R>(text, params);
  } catch (err) {
    throw markDbError(err);
  }
}

async function readRows(executor: EmployeeExecutor): Promise<EmployeeRow[]> {
  const r = await run<EmployeeRow & Record<string, unknown>>(
    executor,
    `SELECT ${SELECT_COLUMNS} FROM km.employee_master ORDER BY sort_order ASC, row_id ASC`,
  );
  return r.rows;
}

/** ทั้ง Collection ตามลำดับ (Object API) — executor ไม่ส่ง = ใช้ Pool */
export async function listEmployeeMaster(
  executor?: EmployeeExecutor,
): Promise<EmployeeMaster[]> {
  return (await readRows(executor)).map(rowToEmployee);
}

/** แถวเดิมตามลำดับ พร้อม row_id (สำหรับ planEditorMerge) */
export async function listExistingForMerge(
  executor: EmployeeExecutor,
): Promise<ExistingEmployee[]> {
  return (await readRows(executor)).map((row) => ({
    rowId: row.row_id,
    fields: rowToFields(row),
  }));
}

/** TX-09: ล็อกตารางสำหรับผู้เขียน (ผู้เขียนชนกันเอง แต่ SELECT ยังอ่านได้) — ต้องอยู่ใน Transaction */
export async function lockEmployeeMaster(executor: EmployeeExecutor): Promise<void> {
  await run(executor, "LOCK TABLE km.employee_master IN SHARE ROW EXCLUSIVE MODE");
}

const newRowId = () => `em-${crypto.randomUUID()}`;

/** เพิ่มหลายแถวในคำสั่งเดียว — sort_order เริ่มที่ firstSortOrder ตามลำดับ */
async function insertRows(
  executor: EmployeeExecutor,
  rows: readonly EmployeeFields[],
  firstSortOrder: bigint,
): Promise<void> {
  if (rows.length === 0) return;
  const rowIds = rows.map(() => newRowId());
  const sortOrders = rows.map((_, i) => (firstSortOrder + BigInt(i)).toString());
  const columns = EMPLOYEE_FIELD_COLUMNS.map(([, c]) => c);
  const arrays = EMPLOYEE_FIELD_COLUMNS.map(([f]) => rows.map((r) => r[f]));
  const unnestArgs = [
    "$1::text[]",
    "$2::bigint[]",
    ...columns.map((_, i) => `$${i + 3}::text[]`),
  ].join(", ");
  await run(
    executor,
    `INSERT INTO km.employee_master (row_id, sort_order, ${columns.join(", ")})
     SELECT * FROM unnest(${unnestArgs})`,
    [rowIds, sortOrders, ...arrays],
  );
}

/** Admin: แทนทั้งก้อน — DELETE ทั้งหมด แล้ว INSERT ใหม่ sort_order = 1..n ตามลำดับ Payload */
export async function replaceAllEmployees(
  executor: EmployeeExecutor,
  rows: readonly EmployeeFields[],
): Promise<void> {
  await run(executor, "DELETE FROM km.employee_master");
  await insertRows(executor, rows, 1n);
}

/** Editor: UPDATE ตาม row_id (คง row_id/sort_order) และ INSERT ต่อท้ายที่ max(sort_order)+1, +2, … */
export async function applyEditorMerge(
  executor: EmployeeExecutor,
  plan: EditorMergePlan,
): Promise<void> {
  if (plan.updates.length > 0) {
    const columns = EMPLOYEE_FIELD_COLUMNS.map(([, c]) => c);
    const sets = columns.map((c) => `${c} = u.${c}`).join(", ");
    const unnestArgs = [
      "$1::text[]",
      ...columns.map((_, i) => `$${i + 2}::text[]`),
    ].join(", ");
    await run(
      executor,
      `UPDATE km.employee_master AS t SET ${sets}
         FROM unnest(${unnestArgs}) AS u(row_id, ${columns.join(", ")})
        WHERE t.row_id = u.row_id`,
      [
        plan.updates.map((u) => u.rowId),
        ...EMPLOYEE_FIELD_COLUMNS.map(([f]) => plan.updates.map((u) => u.fields[f])),
      ],
    );
  }
  if (plan.inserts.length > 0) {
    const r = await run<{ max: string }>(
      executor,
      "SELECT coalesce(max(sort_order), 0)::text AS max FROM km.employee_master",
    );
    await insertRows(executor, plan.inserts, BigInt(r.rows[0].max) + 1n);
  }
}
