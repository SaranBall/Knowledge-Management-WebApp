// PERSIST-01C-4 C2 — Unit test ของ repos/ratings.ts (ไม่ต่อฐานข้อมูล)
//   npx tsx --test src/server/repos/ratings.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { insertRating, listRatings, rowToRating } from "./ratings";
import { fakeExecutor } from "./testFakeExecutor";

const row = {
  id: "r-1", target_type: "kb", target_id: "kb-9", user_id: "usr-1", user_name: "U",
  rating: 4, comment: "ดี", created_at: new Date("2026-11-27T01:02:03.456Z"), collection_order: "5",
};

describe("rowToRating", () => {
  it("target_id → docOrKBId · ไม่คืน target_type / collection_order · created_at → ISO", () => {
    assert.deepEqual(rowToRating(row), {
      id: "r-1", docOrKBId: "kb-9", userId: "usr-1", userName: "U", rating: 4, comment: "ดี",
      createdAt: "2026-11-27T01:02:03.456Z",
    });
  });

  it("comment NULL → ไม่มี Key", () => {
    assert.equal("comment" in rowToRating({ ...row, comment: null }), false);
  });
});

describe("SQL ของ ratings", () => {
  it("list ใหม่สุดก่อน", async () => {
    const { calls, exec } = fakeExecutor();
    await listRatings(exec);
    assert.match(calls[0].text, /ORDER BY collection_order DESC/);
  });

  it("insert เก็บ target_type ตามที่ Route หาเจอ และ target_id = docOrKBId", async () => {
    const { calls, exec } = fakeExecutor([row]);
    await insertRating(exec, { id: "r-1", docOrKBId: "doc-1", userId: "usr-1", userName: "U", rating: 5, comment: "c", createdAt: "2026-11-27T00:00:00.000Z" }, "document");
    assert.deepEqual(calls[0].params.slice(0, 3), ["r-1", "document", "doc-1"]);
  });
});
