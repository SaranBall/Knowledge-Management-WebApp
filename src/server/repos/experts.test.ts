// PERSIST-01C-4 C2 — Unit test ของ repos/experts.ts (ไม่ต่อฐานข้อมูล)
//   npx tsx --test src/server/repos/experts.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listExperts, replaceExpert, rowToExpert, toExpertFields } from "./experts";
import { fakeExecutor } from "./testFakeExecutor";

const nullRow = (id: string) => ({
  id, name: null, position: null, phone: null, email: null, avatar_url: null,
  availability: null, department_id: null, skills: null, experience_years: null,
});

describe("rowToExpert", () => {
  it("ทุกช่องเป็น NULL → มีเฉพาะ id", () => {
    assert.deepEqual(rowToExpert(nullRow("exp-1")), { id: "exp-1" });
  });

  it("แถวครบ → camelCase · experienceYears เป็นตัวเลข · skills ถูกคัดลอก", () => {
    const row = {
      ...nullRow("exp-2"), name: "N", position: "P", phone: "0", email: "e", avatar_url: "a",
      availability: "Available", department_id: "d-en", skills: ["s"], experience_years: 7.5,
    };
    const e = rowToExpert(row);
    assert.deepEqual(e, {
      id: "exp-2", name: "N", position: "P", phone: "0", email: "e", avatarUrl: "a",
      availability: "Available", departmentId: "d-en", skills: ["s"], experienceYears: 7.5,
    });
    (e.skills as string[]).push("x");
    assert.deepEqual(row.skills, ["s"]);
  });
});

describe("toExpertFields (Q-2 ก)", () => {
  it("experienceYears \"x\" → null · skills \"a\" → null · ตัวเลขจำกัดคงเดิม", () => {
    const f = toExpertFields({ name: 5, experienceYears: "x", skills: "a" });
    assert.equal(f.name, "5");
    assert.equal(f.experienceYears, null);
    assert.equal(f.skills, null);
    assert.equal(toExpertFields({ experienceYears: 10.5 }).experienceYears, 10.5);
    assert.deepEqual(toExpertFields({ skills: ["a", 2, null] }).skills, ["a", "2"]);
  });

  it("ช่องนอก Type และ id ไม่เก็บ", () => {
    const f = toExpertFields({ id: "exp-x", hack: 1 }) as unknown as Record<string, unknown>;
    assert.equal("id" in f, false);
    assert.equal("hack" in f, false);
  });
});

describe("SQL ของ experts", () => {
  it("listExperts เรียง collection_order ASC (ตามลำดับที่สร้าง — เดิม push)", async () => {
    const { calls, exec } = fakeExecutor();
    await listExperts(exec);
    assert.match(calls[0].text, /ORDER BY collection_order ASC/);
  });

  it("listExperts คืนตามลำดับแถวที่ฐานส่งมา", async () => {
    const { exec } = fakeExecutor([nullRow("exp-a"), nullRow("exp-b")]);
    assert.deepEqual((await listExperts(exec)).map((e) => e.id), ["exp-a", "exp-b"]);
  });

  it("replaceExpert: WHERE id = $1 ด้วย id ใน URL (F-06) ไม่ใช้ id ใน Body", async () => {
    const { calls, exec } = fakeExecutor();
    await replaceExpert(exec, "exp-url", toExpertFields({ id: "exp-body", name: "N" }));
    assert.equal(calls[0].params[0], "exp-url");
    assert.equal(calls[0].params.includes("exp-body"), false);
    assert.doesNotMatch(calls[0].text.split("WHERE")[0], /\bid = /);
  });
});
