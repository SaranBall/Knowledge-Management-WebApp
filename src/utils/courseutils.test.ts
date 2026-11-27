// PERSIST-01C-5 C2 — getRequiredCoursesForUser (G-8.1 / Q-3 ก)
//   npx tsx --test src/utils/courseutils.test.ts

import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Course } from "../types";
import { setDepartments } from "./departmentUtils";
import { getRequiredCoursesForUser } from "./courseutils";

const course = (id: string, extra: Partial<Course> = {}): Course => ({
  id,
  title: id,
  description: "",
  type: "General",
  targetDepartmentIds: [],
  isMandatory: true,
  issuesCertificate: true,
  lessons: [],
  quiz: [],
  minPassScore: 60,
  isApproved: true,
  ...extra,
});

const ids = (list: Course[]) => list.map((c) => c.id);

describe("getRequiredCoursesForUser", () => {
  before(() => {
    // แผนกหลัก d-pd มีแผนกย่อย d-pd-dl และ d-pd-bm · d-hr เป็นแผนกหลักอีกแผนก
    setDepartments([
      { id: "d-pd", parentId: null, name: "ฝ่ายผลิต", code: "PD" },
      { id: "d-pd-dl", parentId: "d-pd", name: "DL", code: "DL" },
      { id: "d-pd-bm", parentId: "d-pd", name: "BM", code: "BM" },
      { id: "d-hr", parentId: null, name: "HR", code: "HR" },
    ]);
  });

  it("ไม่เลือกแผนก ([]) = บังคับทุกคน", () => {
    const all = course("c-all");
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-hr" }, [all])), ["c-all"]);
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-pd-dl" }, [all])), ["c-all"]);
  });

  it("แผนกตรงกัน → นับ · แผนกอื่น → ไม่นับ", () => {
    const hr = course("c-hr", { targetDepartmentIds: ["d-hr"] });
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-hr" }, [hr])), ["c-hr"]);
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-pd" }, [hr])), []);
  });

  it("หลัก → ย่อย: หลักสูตรของแผนกหลักนับผู้ใช้ในแผนกย่อย", () => {
    const pd = course("c-pd", { targetDepartmentIds: ["d-pd"] });
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-pd-dl" }, [pd])), ["c-pd"]);
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-pd" }, [pd])), ["c-pd"]);
  });

  it("ย่อย → หลัก ไม่นับ · แผนกพี่น้องไม่นับ", () => {
    const dl = course("c-dl", { targetDepartmentIds: ["d-pd-dl"] });
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-pd" }, [dl])), []);
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-pd-bm" }, [dl])), []);
  });

  it("หลายแผนก: ตรงแผนกใดแผนกหนึ่งก็นับ", () => {
    const multi = course("c-multi", { targetDepartmentIds: ["d-hr", "d-pd"] });
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-pd-bm" }, [multi])), ["c-multi"]);
  });

  it("ไม่บังคับ → ไม่นับ (แม้แผนกตรง)", () => {
    const opt = course("c-opt", { isMandatory: false });
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-hr" }, [opt])), []);
  });

  it("ไม่ Approved (false / ไม่มีค่า = Pending) → ไม่นับ", () => {
    const pending = course("c-pending", { isApproved: false });
    const unknown = course("c-unknown", { isApproved: undefined });
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-hr" }, [pending, unknown])), []);
  });

  it("ผู้ใช้ไม่มีแผนก/แผนกไม่รู้จัก → นับเฉพาะหลักสูตรทุกแผนก · คงลำดับรายการเดิม", () => {
    const list = [course("c-2"), course("c-pd", { targetDepartmentIds: ["d-pd"] }), course("c-1")];
    assert.deepEqual(ids(getRequiredCoursesForUser({}, list)), ["c-2", "c-1"]);
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-nope" }, list)), ["c-2", "c-1"]);
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-pd" }, list)), ["c-2", "c-pd", "c-1"]);
  });

  it("targetDepartmentIds ไม่ใช่ Array (ข้อมูลเก่า) → ถือเป็นทุกแผนก · ผู้ใช้ null → []", () => {
    const legacy = { ...course("c-legacy"), targetDepartmentIds: undefined } as unknown as Course;
    assert.deepEqual(ids(getRequiredCoursesForUser({ departmentId: "d-hr" }, [legacy])), ["c-legacy"]);
    assert.deepEqual(getRequiredCoursesForUser(null, [legacy]), []);
  });
});
