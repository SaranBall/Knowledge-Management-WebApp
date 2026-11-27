// PERSIST-01C-4 C2 — Unit test ของ repos/kbArticles.ts (ไม่ต่อฐานข้อมูล)
//   npx tsx --test src/server/repos/kbArticles.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  approveKbArticle,
  likeKbArticle,
  listKbArticles,
  replaceKbArticle,
  rowToKbArticle,
  toKbFields,
} from "./kbArticles";
import { fakeExecutor } from "./testFakeExecutor";

const nullRow = (id: string) => ({
  id, title: null, type: null, problem: null, cause: null, solution: null, prevention: null,
  related_wis: null, tags: null, author: null, author_title: null, author_dept: null,
  views: null, likes: null, status: null, created_at: null,
});

describe("rowToKbArticle", () => {
  it("ทุกช่องเป็น NULL → มีเฉพาะ id", () => {
    assert.deepEqual(rowToKbArticle(nullRow("kb-1")), { id: "kb-1" });
  });

  it("แถวครบ → camelCase · views/likes เป็นตัวเลข · Array ถูกคัดลอก · ไม่มี collection_order", () => {
    const row = {
      ...nullRow("kb-2"), title: "T", type: "FAQ", problem: "P", cause: "C", solution: "S", prevention: "V",
      related_wis: ["WI-1"], tags: ["a"], author: "A", author_title: "AT", author_dept: "AD",
      views: 3, likes: 0, status: "Approved", created_at: "2026-11-27T00:00:00.000Z", collection_order: "9",
    };
    const a = rowToKbArticle(row);
    assert.deepEqual(a, {
      id: "kb-2", title: "T", type: "FAQ", problem: "P", cause: "C", solution: "S", prevention: "V",
      relatedWIs: ["WI-1"], tags: ["a"], author: "A", authorTitle: "AT", authorDept: "AD",
      views: 3, likes: 0, status: "Approved", createdAt: "2026-11-27T00:00:00.000Z",
    });
    (a.tags as string[]).push("x");
    assert.deepEqual(row.tags, ["a"]);
    assert.ok(Object.keys(a).every((k) => !k.includes("_")));
  });

  it("Array ว่างคงเป็น [] (ไม่ใช่ NULL)", () => {
    assert.deepEqual(rowToKbArticle({ ...nullRow("kb-3"), tags: [], related_wis: [] }), { id: "kb-3", tags: [], relatedWIs: [] });
  });
});

describe("toKbFields (Q-2 ก)", () => {
  it("ช่องข้อความ → toTextOrNull · TEXT[] ไม่ใช่ Array → null · views/likes จำนวนเต็มจำกัด", () => {
    const f = toKbFields({ title: 5, tags: "x", relatedWIs: [1, null, "a"], views: "3", likes: 2.7, status: "Approved" });
    assert.equal(f.title, "5");
    assert.equal(f.tags, null);
    assert.deepEqual(f.relatedWIs, ["1", "a"]);
    assert.equal(f.views, null);
    assert.equal(f.likes, 2);
    assert.equal(f.status, "Approved");
    assert.equal(f.author, null);
  });

  it("ช่องนอก Type และ id ไม่เก็บ", () => {
    const f = toKbFields({ id: "kb-x", foo: 1, title: "T" }) as unknown as Record<string, unknown>;
    assert.equal("id" in f, false);
    assert.equal("foo" in f, false);
    assert.equal(f.title, "T");
  });
});

describe("SQL ของ kbArticles", () => {
  it("listKbArticles เรียง collection_order DESC (ใหม่สุดก่อน)", async () => {
    const { calls, exec } = fakeExecutor();
    await listKbArticles(exec);
    assert.match(calls[0].text, /ORDER BY collection_order DESC/);
  });

  it("replaceKbArticle: WHERE id = $1 ด้วย id ใน URL (F-06) และไม่แก้คอลัมน์ id · ช่องที่ไม่ส่ง = NULL", async () => {
    const { calls, exec } = fakeExecutor();
    await replaceKbArticle(exec, "kb-url", toKbFields({ id: "kb-body", title: "T" }));
    assert.match(calls[0].text, /WHERE id = \$1/);
    assert.equal(calls[0].params[0], "kb-url");
    assert.doesNotMatch(calls[0].text.split("WHERE")[0], /\bid = /);
    assert.ok(calls[0].params.includes(null));
    assert.equal(calls[0].params.includes("kb-body"), false);
  });

  it("likeKbArticle ใช้ likes = likes + 1 (TX-12) · approve ตั้ง Approved · ไม่พบแถว → undefined", async () => {
    const like = fakeExecutor();
    assert.equal(await likeKbArticle(like.exec, "kb-1"), undefined);
    assert.match(like.calls[0].text, /likes = likes \+ 1/);
    const ap = fakeExecutor();
    assert.equal(await approveKbArticle(ap.exec, "kb-1"), undefined);
    assert.match(ap.calls[0].text, /status = 'Approved'/);
  });
});
