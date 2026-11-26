// PERSIST-01C-0 — Unit test ของ classifyDbError (ไม่ต้องต่อฐานข้อมูล)
//   npx tsx --test src/server/dbErrors.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyDbError, isDbError, markDbError } from "./dbErrors";

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

// 01C-1: เครื่องหมาย "มาจากฐานข้อมูล" สำหรับตอบ 500 แบบทั่วไป
describe("markDbError / isDbError", () => {
  it("Error ของ PostgreSQL (มี SQLSTATE + severity) → isDbError true แม้ไม่ได้ทำเครื่องหมาย", () => {
    assert.equal(isDbError(pgError("23505")), true);
  });
  it("Error การเชื่อมต่อ (ไม่มี SQLSTATE) ที่ทำเครื่องหมายแล้ว → true", () => {
    const err = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    assert.equal(isDbError(err), false);
    assert.equal(markDbError(err), err);
    assert.equal(isDbError(err), true);
  });
  it("เครื่องหมายไม่เปลี่ยนผลของ classifyDbError และไม่โผล่ใน Key/JSON", () => {
    const err = markDbError(pgError("23503", "users_department_fk"));
    assert.deepEqual(classifyDbError(err), { kind: "foreign_key", constraint: "users_department_fk", sqlstate: "23503" });
    assert.deepEqual(Object.keys(err).sort(), ["code", "constraint", "severity"]);
  });
  it("Error ธรรมดา / ค่าที่ไม่ใช่ Object → false และ markDbError ไม่พัง", () => {
    assert.equal(isDbError(new Error("x")), false);
    assert.equal(isDbError(undefined), false);
    assert.equal(isDbError("23505"), false);
    assert.equal(markDbError(undefined), undefined);
    assert.equal(markDbError("x"), "x");
    const frozen = Object.freeze(new Error("frozen"));
    assert.equal(markDbError(frozen), frozen);
    assert.equal(isDbError(frozen), false);
  });
});
