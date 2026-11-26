// PERSIST-01C-1 C2 — departmentUtils หลัง setDepartments() ต้องให้ผลเหมือนข้อมูลเดิม 20 แผนก
//   npx tsx --test src/utils/departmentUtils.test.ts
//
// แหล่งข้อมูลเดียวคือ db/migrations/0002_seed_departments.sql (Q3) — Test อ่านและ Parse ไฟล์นั้น
// (หัวไฟล์ 0002 ระบุว่าเป็น 20 รายการจาก DEPARTMENTS_FLAT เดิม ลำดับเดิม)
// "ผลเดิม" ตรวจด้วย (ก) Reference implementation = ตรรกะเดิมของไฟล์ก่อน 01C-1 ทำงานบนข้อมูลชุดเดียวกัน
// และ (ข) ค่าคาดหวังที่เขียนตรง ๆ สำหรับความสัมพันธ์ Main → Sub

import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Department,
  getAllDepartmentsFlat,
  getDepartmentByCode,
  getDepartmentById,
  getMainDepartmentNames,
  getMainDepartmentOf,
  getMainDepartments,
  getPositionsForDepartment,
  getSubDepartments,
  isSameDepartmentBranch,
  setDepartments,
} from "./departmentUtils";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.resolve(HERE, "../../db/migrations/0002_seed_departments.sql");

function parseSeed(sql: string): Department[] {
  const re = /\(\s*'([^']*)'\s*,\s*(NULL|'([^']*)')\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g;
  const out: Department[] = [];
  for (const m of sql.matchAll(re)) {
    out.push({ id: m[1], parentId: m[2] === "NULL" ? null : m[3], code: m[4], name: m[5] });
  }
  return out;
}

// --- Reference implementation: ตรรกะเดิม (ก่อน 01C-1) บน Array ที่ส่งเข้าไป ---
const ref = {
  main: (all: Department[]) =>
    all.filter((d) => d.parentId === null).sort((a, b) => a.name.localeCompare(b.name, "th")),
  sub: (all: Department[], key: string) => {
    const main = all.find((d) => d.id === key || d.code === key);
    if (!main) return [];
    return all.filter((d) => d.parentId === main.id).sort((a, b) => a.name.localeCompare(b.name, "th"));
  },
  byId: (all: Department[], id: string) => all.find((d) => d.id === id),
  byCode: (all: Department[], code: string) => all.find((d) => d.code === code),
  mainOf: (all: Department[], id: string) => {
    const d = all.find((x) => x.id === id);
    if (!d) return undefined;
    if (d.parentId === null) return d;
    return all.find((x) => x.id === d.parentId);
  },
  flat: (all: Department[]) => [...all].sort((a, b) => a.name.localeCompare(b.name, "th")),
};

let seed: Department[] = [];

describe("departmentUtils ก่อน setDepartments()", () => {
  it("ยังไม่มีแผนก → ฟังก์ชันคืนผลว่าง/undefined (ไม่มีข้อมูลฝังในไฟล์แล้ว)", () => {
    assert.deepEqual(getAllDepartmentsFlat(), []);
    assert.deepEqual(getMainDepartments(), []);
    assert.deepEqual(getMainDepartmentNames(), []);
    assert.equal(getDepartmentById("d-pd"), undefined);
  });
});

describe("departmentUtils หลัง setDepartments(ข้อมูลจาก 0002)", () => {
  before(() => {
    seed = parseSeed(fs.readFileSync(SEED_FILE, "utf-8"));
    setDepartments(seed);
  });

  it("Parse 0002 ได้ 20 แผนก: หลัก 14 / ย่อย 6 และ id/code ไม่ซ้ำ", () => {
    assert.equal(seed.length, 20);
    assert.equal(seed.filter((d) => d.parentId === null).length, 14);
    assert.equal(seed.filter((d) => d.parentId !== null).length, 6);
    assert.equal(new Set(seed.map((d) => d.id)).size, 20);
    assert.equal(new Set(seed.map((d) => d.code)).size, 20);
  });

  it("getDepartmentById / getDepartmentByCode ตรงกับข้อมูลทุกแผนก", () => {
    for (const d of seed) {
      assert.deepEqual(getDepartmentById(d.id), ref.byId(seed, d.id));
      assert.deepEqual(getDepartmentByCode(d.code), ref.byCode(seed, d.code));
    }
    assert.equal(getDepartmentById("d-nope"), undefined);
    assert.equal(getDepartmentByCode("ZZ"), undefined);
    assert.equal(getDepartmentByCode("PS")?.id, "d-pd-sp");
  });

  it("getMainDepartments: 14 แผนกหลัก เรียงตามชื่อ (localeCompare 'th') เหมือนเดิม", () => {
    const got = getMainDepartments();
    assert.equal(got.length, 14);
    assert.deepEqual(got, ref.main(seed));
    assert.deepEqual(getMainDepartmentNames(), ref.main(seed).map((d) => d.name));
  });

  it("getAllDepartmentsFlat: 20 แผนก เรียงตามชื่อ (localeCompare 'th') เหมือนเดิม", () => {
    assert.deepEqual(getAllDepartmentsFlat(), ref.flat(seed));
  });

  it("Main → Sub: d-pd มีแผนกย่อย 6 แผนก (ทั้งค้นด้วย id และ code) เรียงตามชื่อ", () => {
    const expected = ["d-pd-bm", "d-pd-dl", "d-pd-in", "d-pd-pt", "d-pd-sl", "d-pd-sp"];
    assert.deepEqual(getSubDepartments("d-pd").map((d) => d.id).sort(), expected);
    assert.deepEqual(getSubDepartments("d-pd"), ref.sub(seed, "d-pd"));
    assert.deepEqual(getSubDepartments("PD"), ref.sub(seed, "PD"));
    assert.deepEqual(getSubDepartments("d-hr"), []);
    assert.deepEqual(getSubDepartments("d-nope"), []);
  });

  it("getMainDepartmentOf: แผนกย่อย → d-pd, แผนกหลัก → ตัวเอง, ไม่มีจริง → undefined", () => {
    for (const d of seed) {
      assert.deepEqual(getMainDepartmentOf(d.id), ref.mainOf(seed, d.id));
    }
    assert.equal(getMainDepartmentOf("d-pd-dl")?.id, "d-pd");
    assert.equal(getMainDepartmentOf("d-hr")?.id, "d-hr");
    assert.equal(getMainDepartmentOf("d-nope"), undefined);
  });

  it("isSameDepartmentBranch: สายเดียวกัน / ต่างสาย / ไม่มีจริง", () => {
    assert.equal(isSameDepartmentBranch("d-pd-dl", "d-pd-bm"), true);
    assert.equal(isSameDepartmentBranch("d-pd-dl", "d-pd"), true);
    assert.equal(isSameDepartmentBranch("d-pd", "d-pd-sp"), true);
    assert.equal(isSameDepartmentBranch("d-hr", "d-hr"), true);
    assert.equal(isSameDepartmentBranch("d-hr", "d-pd"), false);
    assert.equal(isSameDepartmentBranch("d-qa", "d-pd-dl"), false);
    assert.equal(isSameDepartmentBranch("d-nope", "d-pd"), false);
    assert.equal(isSameDepartmentBranch("d-nope", "d-nope"), true); // เดิม: id เท่ากันคืน true ก่อนตรวจ
  });

  it("POSITIONS_BY_DEPARTMENT คงเดิม (ไม่ขึ้นกับข้อมูลแผนกจาก DB)", () => {
    assert.deepEqual(getPositionsForDepartment("d-it"), ["เจ้าหน้าที่ IT Support", "เจ้าหน้าที่ Programmer"]);
    assert.deepEqual(getPositionsForDepartment("d-nope"), []);
  });

  it("setDepartments คัดลอกเก็บ — แก้ Array/Object ต้นทางภายหลังไม่กระทบ", () => {
    const list = seed.map((d) => ({ ...d }));
    setDepartments(list);
    list[0].name = "CHANGED";
    list.push({ id: "d-x", parentId: null, name: "X", code: "XX" });
    assert.notEqual(getDepartmentById(list[0].id)?.name, "CHANGED");
    assert.equal(getDepartmentById("d-x"), undefined);
    setDepartments(seed);
  });

  it("ฟังก์ชันที่เรียงลำดับไม่แก้ลำดับภายใน (เรียกซ้ำได้ผลเดิม)", () => {
    const a = getAllDepartmentsFlat().map((d) => d.id);
    getMainDepartments();
    getSubDepartments("d-pd");
    assert.deepEqual(getAllDepartmentsFlat().map((d) => d.id), a);
  });
});
