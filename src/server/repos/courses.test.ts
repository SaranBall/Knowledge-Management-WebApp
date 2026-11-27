// PERSIST-01C-5 C2 — Unit test ของ repos/courses.ts (ไม่ต่อฐานข้อมูล)
//   npx tsx --test src/server/repos/courses.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ISSUES_CERTIFICATE,
  DEFAULT_IS_MANDATORY,
  type CourseNewFields,
  type CourseRow,
  deleteCourse,
  findCourse,
  insertCourse,
  listCourses,
  replaceCourse,
  rowToCourse,
  toCourseFields,
  validateCourseNewFields,
} from "./courses";
import { fakeExecutor, viaJsonb } from "./testFakeExecutor";

const KNOWN = new Set(["d-pd", "d-pd-dl", "d-qa", "d-hr"]);
const exists = (id: string) => KNOWN.has(id);
const DEFAULTS: CourseNewFields = {
  targetDepartmentIds: [],
  isMandatory: DEFAULT_IS_MANDATORY,
  issuesCertificate: DEFAULT_ISSUES_CERTIFICATE,
  certificateValidityMonths: null,
};

const nullRow = (id: string): CourseRow => ({
  id, title: null, description: null, type: null, badge_key: null, duration_hours: null,
  created_by_role: null, min_pass_score: null, duration_minutes: null, tags: null, is_approved: null,
  is_mandatory: false, issues_certificate: true, certificate_validity_months: null,
  target_department_ids: [], lessons: [], quiz: [],
});

describe("validateCourseNewFields (Q-4 ก)", () => {
  it("ไม่ส่งช่องใหม่ → [] / false / true / null", () => {
    assert.deepEqual(validateCourseNewFields({}, exists), { ok: true, value: DEFAULTS });
    assert.equal(DEFAULT_IS_MANDATORY, false);
    assert.equal(DEFAULT_ISSUES_CERTIFICATE, true);
  });

  it("targetDepartmentIds: ตัดซ้ำ คงลำดับครั้งแรก", () => {
    const r = validateCourseNewFields({ targetDepartmentIds: ["d-qa", "d-pd", "d-qa", "d-hr", "d-pd"] }, exists);
    assert.ok(r.ok);
    assert.deepEqual(r.ok && r.value.targetDepartmentIds, ["d-qa", "d-pd", "d-hr"]);
  });

  it("ค่าถูกต้องทุกช่อง · certificateValidityMonths null = ไม่หมดอายุ", () => {
    const r = validateCourseNewFields(
      { targetDepartmentIds: [], isMandatory: true, issuesCertificate: false, certificateValidityMonths: 12 }, exists);
    assert.deepEqual(r, { ok: true, value: { targetDepartmentIds: [], isMandatory: true, issuesCertificate: false, certificateValidityMonths: 12 } });
    const n = validateCourseNewFields({ certificateValidityMonths: null }, exists);
    assert.deepEqual(n, { ok: true, value: DEFAULTS });
  });

  const bad: Array<[string, Record<string, unknown>, string]> = [
    ["targetDepartmentIds ไม่ใช่ Array", { targetDepartmentIds: "d-pd" }, "targetDepartmentIds"],
    ["targetDepartmentIds = null", { targetDepartmentIds: null }, "targetDepartmentIds"],
    ["รหัสแผนกไม่มีจริง", { targetDepartmentIds: ["d-pd", "d-nope"] }, "targetDepartmentIds"],
    ["รหัสแผนกไม่ใช่ String", { targetDepartmentIds: [5] }, "targetDepartmentIds"],
    ["isMandatory \"yes\"", { isMandatory: "yes" }, "isMandatory"],
    ["isMandatory null", { isMandatory: null }, "isMandatory"],
    ["issuesCertificate 1", { issuesCertificate: 1 }, "issuesCertificate"],
    ["certificateValidityMonths 0", { certificateValidityMonths: 0 }, "certificateValidityMonths"],
    ["certificateValidityMonths 1.5", { certificateValidityMonths: 1.5 }, "certificateValidityMonths"],
    ["certificateValidityMonths -1", { certificateValidityMonths: -1 }, "certificateValidityMonths"],
    ["certificateValidityMonths \"12\"", { certificateValidityMonths: "12" }, "certificateValidityMonths"],
    ["certificateValidityMonths เกิน INTEGER", { certificateValidityMonths: 2147483648 }, "certificateValidityMonths"],
    ["certificateValidityMonths NaN", { certificateValidityMonths: Number.NaN }, "certificateValidityMonths"],
  ];
  for (const [label, body, field] of bad) {
    it(`${label} → ไม่ผ่าน และข้อความมีชื่อช่อง ${field}`, () => {
      const r = validateCourseNewFields(body, exists);
      assert.equal(r.ok, false);
      assert.ok(!r.ok && r.message.includes(field), !r.ok ? r.message : "");
    });
  }
});

describe("toCourseFields (Q-2 แบบ 01C-3/01C-4)", () => {
  it("ช่องเดิมผิดชนิด → แปลง · ช่องนอก Schema ไม่เก็บ (targetPositions, id, foo)", () => {
    const f = toCourseFields(
      {
        id: "x", title: 5, description: null, minPassScore: "80", durationMinutes: Infinity, tags: "a",
        isApproved: "yes", targetPositions: ["ช่าง"], foo: 1, createdByRole: "Admin", badgeKey: "safety",
      },
      DEFAULTS,
    ) as unknown as Record<string, unknown>;
    assert.equal(f.title, "5");
    assert.equal(f.description, null);
    assert.equal(f.minPassScore, null);
    assert.equal(f.durationMinutes, null);
    assert.equal(f.tags, null);
    assert.equal(f.isApproved, null);
    assert.equal(f.badgeKey, "safety");
    assert.equal(f.createdByRole, "Admin");
    for (const k of ["id", "targetPositions", "foo"]) assert.equal(k in f, false, k);
  });

  it("lessons / quiz ไม่ใช่ Array → [] · สมาชิกที่ไม่ใช่ Object ถูกข้าม · ช่องย่อยนอก Type ไม่เก็บ", () => {
    const f = toCourseFields({ lessons: "x", quiz: [null, 3, { id: "q1", extra: 1, options: "A", pairs: { a: 1 } }] }, DEFAULTS);
    assert.deepEqual(f.lessons, []);
    assert.deepEqual(f.quiz, [{ id: "q1", question: null, type: null, correctAnswer: null, options: null, pairs: null }]);
  });

  it("ช่องใหม่มาจากผลของ Q-4 (ไม่ส่ง → DEFAULT)", () => {
    const f = toCourseFields({ isMandatory: "ignored" }, DEFAULTS);
    assert.equal(f.isMandatory, false);
    assert.equal(f.issuesCertificate, true);
    assert.equal(f.certificateValidityMonths, null);
    assert.deepEqual(f.targetDepartmentIds, []);
  });
});

describe("rowToCourse", () => {
  it("ทุกช่องเป็น NULL → มี id + ช่องที่เป็น Array/Boolean เสมอ", () => {
    assert.deepEqual(rowToCourse(nullRow("c-1")), {
      id: "c-1", isMandatory: false, issuesCertificate: true, targetDepartmentIds: [], lessons: [], quiz: [],
    });
  });

  it("ลูกเป็น NULL/ไม่มี → Array ว่าง · ไม่มี collection_order / targetPositions", () => {
    const row = { ...nullRow("c-2"), target_department_ids: null, lessons: null, quiz: undefined, collection_order: "7", target_positions: ["x"] };
    const c = rowToCourse(row) as unknown as Record<string, unknown>;
    assert.deepEqual(c.lessons, []);
    assert.deepEqual(c.quiz, []);
    assert.deepEqual(c.targetDepartmentIds, []);
    for (const k of ["collection_order", "collectionOrder", "targetPositions", "target_positions"]) assert.equal(k in c, false, k);
  });

  it("แถวครบ: camelCase · ลำดับบท/ข้อ/แผนกตามที่ได้ (ordinal) · pairs ผ่าน JSONB ลำดับสมาชิกคงเดิม · NULL ในลูก → ไม่มี Key", () => {
    const pairs = [{ left: "L3", right: "R3" }, { left: "L1", right: "R1" }];
    const row: CourseRow = {
      ...nullRow("c-3"), title: "T", description: "D", type: "General", badge_key: "safety", duration_hours: "1 ชม.",
      created_by_role: "Editor", min_pass_score: 60, duration_minutes: 90, tags: ["a", "b"], is_approved: false,
      is_mandatory: true, issues_certificate: false, certificate_validity_months: 24,
      target_department_ids: ["d-qa", "d-pd"],
      lessons: [
        { id: "l-b", title: "B", content: "x", media_type: "Text", media_url: null, duration_minutes: 7.5 },
        { id: "l-a", title: null, content: null, media_type: "PDF", media_url: "/uploads/a.pdf", duration_minutes: null },
      ],
      quiz: [
        { question_id: "q-z", question: "Q", type: "SingleChoice", correct_answer: "B", options: ["B", "A"], pairs: null },
        { question_id: "q-m", question: "M", type: "Matching", correct_answer: "{}", options: null, pairs: viaJsonb(pairs) },
      ],
    };
    const c = rowToCourse(row);
    assert.deepEqual(JSON.parse(JSON.stringify(c)), {
      id: "c-3", title: "T", description: "D", type: "General", badgeKey: "safety", durationHours: "1 ชม.",
      createdByRole: "Editor", minPassScore: 60, durationMinutes: 90, tags: ["a", "b"], isApproved: false,
      isMandatory: true, issuesCertificate: false, certificateValidityMonths: 24, targetDepartmentIds: ["d-qa", "d-pd"],
      lessons: [
        { id: "l-b", title: "B", content: "x", mediaType: "Text", durationMinutes: 7.5 },
        { id: "l-a", mediaType: "PDF", mediaUrl: "/uploads/a.pdf" },
      ],
      quiz: [
        { id: "q-z", question: "Q", type: "SingleChoice", correctAnswer: "B", options: ["B", "A"] },
        { id: "q-m", question: "M", type: "Matching", correctAnswer: "{}", pairs },
      ],
    });
    // คัดลอก ไม่ใช้ Array เดิมของแถว
    (c.tags as string[]).push("z");
    assert.deepEqual(row.tags, ["a", "b"]);
    assert.ok(Object.keys(c).every((k) => !k.includes("_")));
  });
});

describe("SQL ของ courses", () => {
  const fields = () =>
    toCourseFields(
      {
        title: "T",
        lessons: [{ id: "l-2", title: "สอง" }, { id: "l-1", title: "หนึ่ง", durationMinutes: 5 }],
        quiz: [
          { id: "q-b", type: "Matching", pairs: [{ left: "x", right: "y" }], correctAnswer: "{\"x\":\"y\"}" },
          { id: "q-a", type: "SingleChoice", options: ["1", "2"], correctAnswer: "2" },
        ],
      },
      { ...DEFAULTS, targetDepartmentIds: ["d-qa", "d-pd"], isMandatory: true },
    );

  it("listCourses: Statement เดียว เรียง collection_order DESC · ลูกเรียง ordinal (ไม่ N+1)", async () => {
    const { calls, exec } = fakeExecutor();
    assert.deepEqual(await listCourses(exec), []);
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /ORDER BY c\.collection_order DESC/);
    assert.match(calls[0].text, /course_target_departments t[\s\S]*ORDER BY t\.ordinal/);
    assert.match(calls[0].text, /ORDER BY l\.ordinal/);
    assert.match(calls[0].text, /ORDER BY q\.ordinal/);
    assert.doesNotMatch(calls[0].text, /target_positions/);
  });

  it("findCourse forUpdate: ล็อกด้วย FOR UPDATE ก่อนอ่าน · ไม่พบ → undefined", async () => {
    const { calls, exec } = fakeExecutor();
    assert.equal(await findCourse(exec, "c-1", { forUpdate: true }), undefined);
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /FOR UPDATE/);
    assert.deepEqual(calls[0].params, ["c-1"]);
  });

  it("insertCourse: แถวหลัก + แผนก/บท/ข้อ ordinal 0..n ตามลำดับที่ส่ง · pairs เป็นข้อความ JSON + ::jsonb", async () => {
    const { calls, exec } = fakeExecutor();
    await insertCourse(exec, "c-new", fields());
    assert.match(calls[0].text, /^INSERT INTO km\.courses \(id, /);
    assert.equal(calls[0].params[0], "c-new");
    assert.ok(calls[0].params.includes(true)); // is_mandatory
    assert.equal(calls[0].params.includes(undefined), false);
    // ลบลูกเดิมก่อน (แทนทั้งก้อน — INSERT ใหม่ไม่มีลูกอยู่แล้ว)
    assert.match(calls[1].text, /DELETE FROM km\.course_target_departments WHERE course_id = \$1/);
    assert.match(calls[2].text, /DELETE FROM km\.course_lessons WHERE course_id = \$1/);
    assert.match(calls[3].text, /DELETE FROM km\.course_quiz_questions WHERE course_id = \$1/);
    assert.match(calls[4].text, /INSERT INTO km\.course_target_departments/);
    assert.deepEqual(calls[4].params, ["c-new", ["d-qa", "d-pd"], [0, 1]]);
    const lessons = calls[5];
    assert.match(lessons.text, /INSERT INTO km\.course_lessons \(course_id, ordinal, id, title, content, media_type, media_url, duration_minutes\) VALUES \(/);
    assert.deepEqual(lessons.params, ["c-new", 0, "l-2", "สอง", null, null, null, null, 1, "l-1", "หนึ่ง", null, null, null, 5]);
    const quiz = calls[6];
    assert.match(quiz.text, /INSERT INTO km\.course_quiz_questions/);
    assert.match(quiz.text, /::jsonb/);
    assert.deepEqual(quiz.params, [
      "c-new",
      0, "q-b", null, "Matching", "{\"x\":\"y\"}", null, JSON.stringify([{ left: "x", right: "y" }]),
      1, "q-a", null, "SingleChoice", "2", ["1", "2"], null,
    ]);
    assert.equal(calls.length, 7);
  });

  it("ไม่มีลูก → ไม่ INSERT ลูก (แต่ยังลบลูกเดิม)", async () => {
    const { calls, exec } = fakeExecutor();
    await insertCourse(exec, "c-empty", toCourseFields({}, DEFAULTS));
    assert.equal(calls.length, 4);
  });

  it("replaceCourse: UPDATE WHERE id = $1 (id ใน URL) ไม่แก้คอลัมน์ id · ไม่พบแถว → false และไม่แตะลูก", async () => {
    const { calls, exec } = fakeExecutor();
    assert.equal(await replaceCourse(exec, "c-url", fields()), false);
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /^UPDATE km\.courses SET [\s\S]* WHERE id = \$1$/);
    assert.doesNotMatch(calls[0].text.split("WHERE")[0], /\bid = /);
    assert.equal(calls[0].params[0], "c-url");
    assert.doesNotMatch(calls[0].text, /collection_order/);
  });

  it("replaceCourse: พบแถว → ลบ/ใส่ลูกทั้ง 3 ตารางใหม่", async () => {
    const { calls, exec } = fakeExecutor([{ id: "c-url" }]);
    assert.equal(await replaceCourse(exec, "c-url", fields()), true);
    assert.equal(calls.length, 7);
    assert.ok(calls.slice(1).every((c) => c.params[0] === "c-url"));
  });

  it("deleteCourse: DELETE แถวหลักเท่านั้น (ลูกลบตาม CASCADE)", async () => {
    const { calls, exec } = fakeExecutor();
    assert.equal(await deleteCourse(exec, "c-1"), false);
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /^DELETE FROM km\.courses WHERE id = \$1$/);
  });
});
