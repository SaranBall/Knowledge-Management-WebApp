/**
 * PERSIST-01C-1 B2 — แผนกจาก km.departments (§21.25: แผนก = DB, โหลดเข้า Cache ตอนเริ่ม Server)
 */
import { query } from "../db";
import type { Department } from "../../utils/departmentUtils";

interface DepartmentRow {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
}

export function rowToDepartment(row: DepartmentRow): Department {
  return {
    id: row.id,
    parentId: row.parent_id ?? null,
    name: row.name,
    code: row.code,
  };
}

/** อ่านแผนกทั้งหมด เรียงตาม id */
export async function loadDepartments(): Promise<Department[]> {
  const r = await query<DepartmentRow>(
    "SELECT id, parent_id, code, name FROM km.departments ORDER BY id",
  );
  return r.rows.map(rowToDepartment);
}
