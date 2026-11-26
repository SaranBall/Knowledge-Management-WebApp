// PERSIST-01C-1 C2 — Unit test ของ Mapper ผู้ใช้ (ไม่ต้องต่อฐานข้อมูล)
//   npx tsx --test src/server/repos/users.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  USER_FIELD_COLUMNS,
  rowToUser,
  sanitizeUser,
  toTextOrNull,
  type UserRow,
} from "./users";

const HASH = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234"; // รูปแบบ bcrypt (ไม่ใช่รหัสจริง)

const nullRow = (id: string): UserRow => ({
  id,
  employee_id: null,
  name: null,
  position: null,
  role: null,
  email: null,
  phone: null,
  department_id: null,
  avatar_url: null,
  password_hash: null,
  status: null,
  start_date: null,
});

const fullRow: UserRow = {
  id: "usr-1700000000000",
  employee_id: "EMP-001",
  name: "ทดสอบ ระบบ",
  position: "ช่าง",
  role: "Viewer",
  email: "t@example.invalid",
  phone: "000-000-0000",
  department_id: "d-pd-dl",
  avatar_url: "data:image/png;base64,AAAA",
  password_hash: HASH,
  status: "Active",
  start_date: "2026-01-15",
};

describe("rowToUser", () => {
  it("ทุกช่องเป็น NULL → มีเฉพาะ id (ไม่มี Key ของช่องที่เป็น NULL)", () => {
    assert.deepEqual(rowToUser(nullRow("usr-x")), { id: "usr-x" });
  });

  it("แถวครบ → camelCase ครบทุกช่อง และ password_hash → password (ภายใน Server)", () => {
    assert.deepEqual(rowToUser(fullRow), {
      id: "usr-1700000000000",
      employeeId: "EMP-001",
      name: "ทดสอบ ระบบ",
      position: "ช่าง",
      role: "Viewer",
      email: "t@example.invalid",
      phone: "000-000-0000",
      departmentId: "d-pd-dl",
      avatarUrl: "data:image/png;base64,AAAA",
      password: HASH,
      status: "Active",
      startDate: "2026-01-15",
    });
  });

  it("ไม่มี Key ชื่อ snake_case หลุดออกไป", () => {
    const keys = Object.keys(rowToUser(fullRow));
    assert.ok(keys.every((k) => !k.includes("_")), keys.join(","));
  });

  it("ค่าข้อความว่าง \"\" ไม่ใช่ NULL → คงไว้ (เหมือนค่าที่เคยเก็บใน Memory)", () => {
    const u = rowToUser({ ...nullRow("usr-y"), status: "", department_id: "" });
    assert.deepEqual(u, { id: "usr-y", status: "", departmentId: "" });
  });

  it("ช่องที่ไม่บังคับบางช่องเป็น NULL → เฉพาะช่องนั้นไม่มี Key", () => {
    const u = rowToUser({ ...fullRow, avatar_url: null, status: null, department_id: null });
    assert.equal("avatarUrl" in u, false);
    assert.equal("status" in u, false);
    assert.equal("departmentId" in u, false);
    assert.equal(u.employeeId, "EMP-001");
  });

  it("USER_FIELD_COLUMNS ครอบทุกคอลัมน์ของ km.users ยกเว้น id / password_hash / collection_order", () => {
    assert.deepEqual(
      USER_FIELD_COLUMNS.map(([, c]) => c).sort(),
      ["avatar_url", "department_id", "email", "employee_id", "name", "phone", "position", "role", "start_date", "status"],
    );
  });
});

describe("password_hash ไม่หลุดไปถึง Client", () => {
  it("sanitizeUser ตัด password ออก และ JSON ไม่มี hash", () => {
    const pub = sanitizeUser(rowToUser(fullRow));
    assert.equal("password" in pub, false);
    assert.equal("password_hash" in pub, false);
    assert.equal(JSON.stringify(pub).includes(HASH), false);
  });

  it("ผู้ใช้ที่ไม่มีรหัสผ่าน → sanitize แล้วไม่มี Key password", () => {
    const pub = sanitizeUser(rowToUser({ ...fullRow, password_hash: null }));
    assert.equal("password" in pub, false);
  });
});

describe("toTextOrNull", () => {
  it("undefined / null → null", () => {
    assert.equal(toTextOrNull(undefined), null);
    assert.equal(toTextOrNull(null), null);
  });
  it("ข้อความคงเดิม (รวมข้อความว่าง)", () => {
    assert.equal(toTextOrNull("abc"), "abc");
    assert.equal(toTextOrNull(""), "");
  });
  it("ตัวเลข / Boolean → ข้อความ, Object → JSON", () => {
    assert.equal(toTextOrNull(5), "5");
    assert.equal(toTextOrNull(false), "false");
    assert.equal(toTextOrNull({ a: 1 }), '{"a":1}');
  });
});
