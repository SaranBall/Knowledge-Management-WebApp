// PERSIST-01C-0 — Unit test ของ classifyDbError (ไม่ต้องต่อฐานข้อมูล)
//   npx tsx --test src/server/dbErrors.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyDbError } from "./dbErrors";

// รูปร่างเดียวกับ pg DatabaseError (code = SQLSTATE, severity, constraint)
function pgError(code: string, constraint?: string) {
  const err = new Error("simulated") as Error & {
    code: string;
    severity: string;
    constraint?: string;
  };
  err.code = code;
  err.severity = "ERROR";
  if (constraint !== undefined) err.constraint = constraint;
  return err;
}

describe("classifyDbError — SQLSTATE ที่จำแนก", () => {
  const cases: Array<[string, string]> = [
    ["23505", "unique"],
    ["23503", "foreign_key"],
    ["23001", "restrict"],
    ["23514", "check"],
    ["23502", "not_null"],
  ];
  for (const [code, kind] of cases) {
    it(`${code} → ${kind} พร้อม constraint`, () => {
      assert.deepEqual(classifyDbError(pgError(code, "some_constraint")), {
        kind,
        constraint: "some_constraint",
        sqlstate: code,
      });
    });
  }

  it("ไม่มี constraint → ไม่ใส่ key constraint", () => {
    assert.deepEqual(classifyDbError(pgError("23502")), {
      kind: "not_null",
      sqlstate: "23502",
    });
  });

  it("constraint ว่าง → ไม่ใส่ key constraint", () => {
    assert.deepEqual(classifyDbError(pgError("23505", "")), {
      kind: "unique",
      sqlstate: "23505",
    });
  });
});

describe("classifyDbError — Error อื่นของ PostgreSQL", () => {
  for (const code of ["57P01", "40001", "40P01", "42P01", "22P02", "57014", "23000"]) {
    it(`${code} → other พร้อม sqlstate`, () => {
      assert.deepEqual(classifyDbError(pgError(code)), {
        kind: "other",
        sqlstate: code,
      });
    });
  }
});

describe("classifyDbError — Error ที่ไม่ใช่ของ PostgreSQL", () => {
  const notPg: Array<[string, unknown]> = [
    ["undefined", undefined],
    ["null", null],
    ["string", "23505"],
    ["number", 23505],
    ["Error ธรรมดา", new Error("boom")],
    ["RangeError", new RangeError("x")],
    ["Error ระบบ ECONNREFUSED", Object.assign(new Error("x"), { code: "ECONNREFUSED" })],
    // code ยาว 5 ตัวแต่ไม่มี severity → ไม่ถือเป็น SQLSTATE
    ["Error ระบบ EPIPE", Object.assign(new Error("x"), { code: "EPIPE" })],
    ["code 23505 แต่ไม่มี severity", Object.assign(new Error("x"), { code: "23505" })],
    ["code ตัวเล็ก", Object.assign(new Error("x"), { code: "2350a", severity: "ERROR" })],
    ["code เป็นตัวเลข", Object.assign(new Error("x"), { code: 23505, severity: "ERROR" })],
    ["Object เปล่า", {}],
  ];
  for (const [label, value] of notPg) {
    it(`${label} → other ไม่มี sqlstate`, () => {
      assert.deepEqual(classifyDbError(value), { kind: "other" });
    });
  }
});
