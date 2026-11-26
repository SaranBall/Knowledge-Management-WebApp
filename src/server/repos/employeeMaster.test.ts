// PERSIST-01C-2 C2 — Unit test ของ repos/employeeMaster.ts (ไม่ต้องต่อฐานข้อมูล)
//   npx tsx --test src/server/repos/employeeMaster.test.ts
//
// planEditorMerge ต้องให้ผลเหมือน "อัลกอริทึมเดิม" ของ POST /api/employee_master (Editor) ก่อน 01C-2
// ซึ่งคัดลอกมาเป็น Reference ด้านล่าง (findIndex แถวแรก + แทนทั้งแถว + push)
// เทียบหลังแปลงค่าทุกช่องด้วย toTextOrNull เหมือนกันทั้งสองฝั่ง (Q-1 ก)

import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMPLOYEE_FIELD_COLUMNS,
  type EmployeeFields,
  type EmployeeRow,
  type ExistingEmployee,
  planEditorMerge,
  rowToEmployee,
  toEmployeeFields,
} from "./employeeMaster";
import { toTextOrNull } from "./users";
import { getDepartmentById, setDepartments } from "../../utils/departmentUtils";

const FIELDS = EMPLOYEE_FIELD_COLUMNS.map(([f]) => f);

before(() => {
  setDepartments([
    { id: "d-hr", parentId: null, name: "Human Resources", code: "HR" },
    { id: "d-pd", parentId: null, name: "Production", code: "PD" },
    { id: "d-pd-dl", parentId: "d-pd", name: "Dry-Lamination", code: "DL" },
  ]);
});

const nullRow = (rowId: string, sortOrder = "1"): EmployeeRow => ({
  row_id: rowId,
  sort_order: sortOrder,
  employee_id: null,
  name: null,
  department_id: null,
  position: null,
  start_date: null,
  level: null,
  email: null,
  phone: null,
  status: null,
});

// ---------------------------------------------------------------------------
// rowToEmployee / toEmployeeFields
// ---------------------------------------------------------------------------

describe("rowToEmployee", () => {
  it("ทุกช่องเป็น NULL → มีเฉพาะ isDeptResolved=false (ไม่มี Key ของช่องที่เป็น NULL)", () => {
    assert.deepEqual(rowToEmployee(nullRow("em-1")), { isDeptResolved: false });
  });

  it("แถวครบ → camelCase ครบ 9 ช่อง + isDeptResolved และไม่มี row_id / sort_order", () => {
    const e = rowToEmployee({
      row_id: "em-x",
      sort_order: "7",
      employee_id: "E-001",
      name: "ทดสอบ",
      department_id: "d-pd-dl",
      position: "ช่าง",
      start_date: "2020-05-01",
      level: "O1",
      email: "e@example.invalid",
      phone: "000",
      status: "Imported",
    });
    assert.deepEqual(e, {
      employeeId: "E-001",
      name: "ทดสอบ",
      departmentId: "d-pd-dl",
      position: "ช่าง",
      startDate: "2020-05-01",
      level: "O1",
      email: "e@example.invalid",
      phone: "000",
      status: "Imported",
      isDeptResolved: true,
    });
    for (const k of ["row_id", "rowId", "sort_order", "sortOrder"]) assert.equal(k in e, false, k);
  });

  it("isDeptResolved = !!getDepartmentById(String(departmentId ?? \"\")) — แผนกจริง/ไม่จริง/ว่าง/NULL", () => {
    for (const dept of ["d-hr", "d-pd-dl", "d-nope", "", null, "D-HR"]) {
      const e = rowToEmployee({ ...nullRow("em-y"), department_id: dept });
      const expected = !!getDepartmentById(String(dept ?? ""));
      assert.equal(e.isDeptResolved, expected, String(dept));
    }
    assert.equal(rowToEmployee({ ...nullRow("em-z"), department_id: "d-hr" }).isDeptResolved, true);
    assert.equal(rowToEmployee({ ...nullRow("em-z"), department_id: "d-nope" }).isDeptResolved, false);
  });

  it("ข้อความว่าง \"\" ไม่ใช่ NULL → คง Key ไว้", () => {
    const e = rowToEmployee({ ...nullRow("em-w"), employee_id: "", department_id: "" });
    assert.deepEqual(e, { employeeId: "", departmentId: "", isDeptResolved: false });
  });
});

describe("toEmployeeFields", () => {
  it("เก็บเฉพาะ 9 ช่อง (ช่องอื่นและ isDeptResolved ที่ Client ส่ง ไม่เก็บ) ช่องที่ไม่ส่ง = null", () => {
    const f = toEmployeeFields({ employeeId: "E1", name: "A", isDeptResolved: true, extra: "x", row_id: "hack" });
    assert.deepEqual(Object.keys(f).sort(), [...FIELDS].sort());
    assert.equal(f.employeeId, "E1");
    assert.equal(f.name, "A");
    assert.equal(f.departmentId, null);
    assert.equal(f.status, null);
  });

  it("แปลงค่าด้วย toTextOrNull: ตัวเลข → ข้อความ, null → null, \"\" คงเดิม", () => {
    const f = toEmployeeFields({ employeeId: 123, name: null, level: "", phone: false });
    assert.equal(f.employeeId, "123");
    assert.equal(f.name, null);
    assert.equal(f.level, "");
    assert.equal(f.phone, "false");
  });
});

// ---------------------------------------------------------------------------
// planEditorMerge — กรณีเจาะจง
// ---------------------------------------------------------------------------

const fieldsOf = (partial: Partial<Record<string, unknown>>): EmployeeFields => toEmployeeFields(partial);
const existingOf = (rows: Array<Partial<Record<string, unknown>>>): ExistingEmployee[] =>
  rows.map((r, i) => ({ rowId: `em-${i + 1}`, fields: fieldsOf(r) }));

/** ผลลัพธ์สุดท้ายเมื่อใช้แผนกับรายการเดิม (ลำดับเดิม + แทนตาม rowId + ต่อท้าย) */
function applyPlan(existing: readonly ExistingEmployee[], incoming: Record<string, unknown>[]): EmployeeFields[] {
  const plan = planEditorMerge(existing, incoming);
  const byRow = new Map(plan.updates.map((u) => [u.rowId, u.fields]));
  return [...existing.map((e) => byRow.get(e.rowId) ?? e.fields), ...plan.inserts];
}

describe("planEditorMerge — กรณีเจาะจง", () => {
  it("รหัสซ้ำในฐาน → แก้เฉพาะแถวแรก แทนทั้งแถว (ช่องที่ไม่ส่ง = null) แถวที่สองไม่เปลี่ยน", () => {
    const existing = existingOf([
      { employeeId: "E-DUP", name: "A", position: "ช่าง" },
      { employeeId: "E-ONE", name: "One" },
      { employeeId: "E-DUP", name: "B", position: "ช่าง" },
    ]);
    const plan = planEditorMerge(existing, [{ employeeId: "E-DUP", name: "A2" }]);
    assert.deepEqual(plan.inserts, []);
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0].rowId, "em-1");
    assert.deepEqual(plan.updates[0].fields, fieldsOf({ employeeId: "E-DUP", name: "A2" }));
    assert.equal(plan.updates[0].fields.position, null);
  });

  it("รหัสใหม่ซ้ำ 2 ครั้งในคำขอเดียว → เพิ่มแถวเดียว ค่าเป็นของรายการหลัง", () => {
    const plan = planEditorMerge(existingOf([{ employeeId: "E1" }]), [
      { employeeId: "E-NEW", name: "first" },
      { employeeId: "E-NEW", name: "second" },
    ]);
    assert.deepEqual(plan.updates, []);
    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.inserts[0].name, "second");
  });

  it("Payload ว่าง → ไม่มีอะไรเปลี่ยน (ไม่ลบแถว)", () => {
    assert.deepEqual(planEditorMerge(existingOf([{ employeeId: "E1" }, { employeeId: "E2" }]), []), {
      updates: [],
      inserts: [],
    });
  });

  it("Q-1: ตัวเลข 123 ตรงกับ \"123\" ในฐาน → แก้แถวเดิม ไม่เพิ่มใหม่", () => {
    const plan = planEditorMerge(existingOf([{ employeeId: "123", name: "text" }]), [{ employeeId: 123, name: "number" }]);
    assert.deepEqual(plan.inserts, []);
    assert.equal(plan.updates.length, 1);
    assert.deepEqual(plan.updates[0], { rowId: "em-1", fields: fieldsOf({ employeeId: "123", name: "number" }) });
  });

  it("ตัวพิมพ์ต่างกัน = ไม่ตรง → เพิ่มใหม่", () => {
    const plan = planEditorMerge(existingOf([{ employeeId: "E1" }]), [{ employeeId: "e1" }]);
    assert.deepEqual(plan.updates, []);
    assert.equal(plan.inserts.length, 1);
  });

  it("null/ไม่ส่ง ตรงกับ NULL (IS NOT DISTINCT FROM) และ \"\" ตรงกับ \"\" เท่านั้น", () => {
    const existing = existingOf([{ name: "no id" }, { employeeId: "", name: "empty id" }]);
    const a = planEditorMerge(existing, [{ name: "no id 2" }]);
    assert.equal(a.updates[0]?.rowId, "em-1");
    const b = planEditorMerge(existing, [{ employeeId: null, name: "null id" }]);
    assert.equal(b.updates[0]?.rowId, "em-1");
    const c = planEditorMerge(existing, [{ employeeId: "", name: "empty 2" }]);
    assert.equal(c.updates[0]?.rowId, "em-2");
    const d = planEditorMerge(existingOf([{ employeeId: "" }]), [{ name: "no id" }]);
    assert.deepEqual(d.updates, []);
    assert.equal(d.inserts.length, 1);
  });

  it("แถวที่ Append แล้ว ให้แถวถัดไปใน Payload เดียวกันหาเจอ แม้มีรหัสอื่นคั่น", () => {
    const final = applyPlan(existingOf([{ employeeId: "E1", name: "old" }]), [
      { employeeId: "N1", name: "n1-a" },
      { employeeId: "E1", name: "new" },
      { employeeId: "N1", name: "n1-b" },
    ]);
    assert.deepEqual(final.map((f) => `${f.employeeId}:${f.name}`), ["E1:new", "N1:n1-b"]);
  });

  it("ไม่แก้ Input (existing / incoming ที่ freeze ไว้)", () => {
    const existing = Object.freeze(existingOf([{ employeeId: "E1", name: "a" }]).map((e) => Object.freeze({ ...e, fields: Object.freeze({ ...e.fields }) })));
    const incoming = Object.freeze([Object.freeze({ employeeId: "E1", name: "b" }), Object.freeze({ employeeId: "E2" })]);
    assert.doesNotThrow(() => planEditorMerge(existing, incoming));
    assert.equal(existing[0].fields.name, "a");
  });
});

// ---------------------------------------------------------------------------
// planEditorMerge เทียบกับอัลกอริทึมเดิม บนข้อมูลสุ่ม
// ---------------------------------------------------------------------------

/** อัลกอริทึมเดิม (server.ts ก่อน 01C-2) — คัดลอกตรรกะ Editor merge มาทั้งก้อน */
function referenceEditorMerge(db_employee_master: any[], incomingMaster: any[]): any[] {
  const employeeMaster = incomingMaster.map((e: any) => ({
    ...e,
    isDeptResolved: !!getDepartmentById(String(e?.departmentId ?? "")),
  }));
  const merged = [...db_employee_master];
  employeeMaster.forEach((incoming) => {
    const idx = merged.findIndex((e) => e.employeeId === incoming.employeeId);
    if (idx !== -1) {
      merged[idx] = incoming;
    } else {
      merged.push(incoming);
    }
  });
  return merged;
}

/** แปลงทุกช่องด้วย toTextOrNull (Q-1 ก) → Object 9 ช่องที่ค่าเป็น string | null */
function normalize(row: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of FIELDS) out[f] = Object.prototype.hasOwnProperty.call(row, f) ? toTextOrNull(row[f]) : null;
  return out;
}

// PRNG แบบกำหนด Seed (mulberry32) — ผลซ้ำได้ทุกครั้ง
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ID_POOL: unknown[] = ["E1", "E2", "E3", "e1", "", "123", 123, null, undefined, "ABSENT"];
const VALUE_POOL: unknown[] = ["a", "b", "ช่าง", "", null, 7, "ABSENT"];

function randomRow(r: () => number): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const pick = (pool: unknown[]) => pool[Math.floor(r() * pool.length)];
  const id = pick(ID_POOL);
  if (id !== "ABSENT") row.employeeId = id;
  for (const f of FIELDS) {
    if (f === "employeeId") continue;
    const v = pick(VALUE_POOL);
    if (v !== "ABSENT") row[f] = v;
  }
  if (r() < 0.2) row.isDeptResolved = r() < 0.5;
  if (r() < 0.1) row.departmentId = pick(["d-hr", "d-pd-dl", "d-nope"]);
  return row;
}

describe("planEditorMerge เทียบกับอัลกอริทึมเดิม (ข้อมูลสุ่ม)", () => {
  const DATASETS = 600;

  it(`${DATASETS} ชุด: ผลสุดท้ายตรงกันทุกชุด (รหัสซ้ำในฐาน/ใน Payload, ไม่มี employeeId, "", ตัวเลข)`, () => {
    const r = rng(0x01c2);
    let withDbDup = 0;
    let withPayloadDup = 0;
    let withMissingId = 0;
    let withEmptyId = 0;
    let withNumericId = 0;
    for (let n = 0; n < DATASETS; n++) {
      const dbRows = Array.from({ length: Math.floor(r() * 7) }, () => normalize(randomRow(r)));
      const payload = Array.from({ length: Math.floor(r() * 7) }, () => randomRow(r));

      const ids = dbRows.map((d) => d.employeeId);
      if (new Set(ids).size < ids.length) withDbDup++;
      const pIds = payload.map((p) => toTextOrNull(p.employeeId));
      if (new Set(pIds).size < pIds.length) withPayloadDup++;
      if (payload.some((p) => !("employeeId" in p) || p.employeeId === null)) withMissingId++;
      if (payload.some((p) => p.employeeId === "")) withEmptyId++;
      if (payload.some((p) => typeof p.employeeId === "number")) withNumericId++;

      // Reference: ทำงานบนค่าที่แปลงแล้วทั้งสองฝั่ง แล้วตัด isDeptResolved ออกก่อนเทียบช่องข้อมูล
      const ref = referenceEditorMerge(dbRows.map((d) => ({ ...d })), payload.map(normalize)).map((row) => {
        const { isDeptResolved, ...rest } = row;
        return normalize(rest);
      });

      const existing: ExistingEmployee[] = dbRows.map((d, i) => ({ rowId: `em-${i}`, fields: d as EmployeeFields }));
      const plan = planEditorMerge(existing, payload);
      const got = applyPlan(existing, payload).map((f) => normalize(f));

      assert.deepEqual(got, ref, `dataset ${n}`);
      // แผนต้องสอดคล้อง: rowId ไม่ซ้ำ, อยู่ในฐานจริง, จำนวนแถวรวม = ผลอ้างอิง
      const rowIds = plan.updates.map((u) => u.rowId);
      assert.equal(new Set(rowIds).size, rowIds.length, `dataset ${n} duplicate rowId`);
      assert.ok(rowIds.every((id) => existing.some((e) => e.rowId === id)), `dataset ${n} unknown rowId`);
      assert.equal(existing.length + plan.inserts.length, ref.length, `dataset ${n} length`);
    }
    // ต้องครอบกรณีที่ Prompt กำหนดจริง
    assert.ok(withDbDup > 50, `รหัสซ้ำในฐาน ${withDbDup}`);
    assert.ok(withPayloadDup > 50, `รหัสซ้ำใน Payload ${withPayloadDup}`);
    assert.ok(withMissingId > 50, `ไม่มี employeeId ${withMissingId}`);
    assert.ok(withEmptyId > 50, `employeeId "" ${withEmptyId}`);
    assert.ok(withNumericId > 50, `employeeId ตัวเลข ${withNumericId}`);
  });

  it("isDeptResolved ของแถวที่ถูกแตะตรงกับ Reference เมื่ออ่านกลับผ่าน rowToEmployee", () => {
    const r = rng(0xbeef);
    for (let n = 0; n < 200; n++) {
      const payload = Array.from({ length: 1 + Math.floor(r() * 4) }, () => randomRow(r));
      const ref = referenceEditorMerge([], payload.map(normalize));
      const plan = planEditorMerge([], payload);
      const got = plan.inserts.map((f, i) =>
        rowToEmployee({
          row_id: `em-${i}`,
          sort_order: String(i + 1),
          employee_id: f.employeeId,
          name: f.name,
          department_id: f.departmentId,
          position: f.position,
          start_date: f.startDate,
          level: f.level,
          email: f.email,
          phone: f.phone,
          status: f.status,
        }).isDeptResolved,
      );
      assert.deepEqual(got, ref.map((x) => x.isDeptResolved), `dataset ${n}`);
    }
  });
});
