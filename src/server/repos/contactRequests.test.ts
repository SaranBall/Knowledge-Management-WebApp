// PERSIST-01C-4 C2 — Unit test ของ repos/contactRequests.ts (ไม่ต่อฐานข้อมูล)
//   npx tsx --test src/server/repos/contactRequests.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listContactRequests, replyContactRequest, rowToContactRequest } from "./contactRequests";
import { fakeExecutor } from "./testFakeExecutor";

const baseRow = {
  id: "cr-1", user_id: "usr-1", user_name: "U", user_dept: null, expert_id: "exp-1", expert_name: "E",
  topic: "T", message: "M", status: "Sent", reply_message: null,
  created_at: new Date("2026-11-27T01:02:03.456Z"),
};

describe("rowToContactRequest", () => {
  it("NULL → ไม่มี Key · created_at (TIMESTAMPTZ) → ISO · ไม่มี collection_order", () => {
    assert.deepEqual(rowToContactRequest({ ...baseRow, collection_order: "3" }), {
      id: "cr-1", userId: "usr-1", userName: "U", expertId: "exp-1", expertName: "E",
      topic: "T", message: "M", status: "Sent", createdAt: "2026-11-27T01:02:03.456Z",
    });
  });

  it("ตอบแล้ว → replyMessage และ userDept", () => {
    const c = rowToContactRequest({ ...baseRow, user_dept: "d-hr", status: "Replied", reply_message: "ok" });
    assert.equal(c.userDept, "d-hr");
    assert.equal(c.replyMessage, "ok");
    assert.equal(c.status, "Replied");
  });
});

describe("SQL ของ contactRequests", () => {
  it("list: ใหม่สุดก่อน · ระบุ userId = WHERE user_id = $1 (Viewer)", async () => {
    const all = fakeExecutor();
    await listContactRequests(all.exec);
    assert.match(all.calls[0].text, /ORDER BY collection_order DESC/);
    assert.doesNotMatch(all.calls[0].text, /WHERE/);
    const mine = fakeExecutor();
    await listContactRequests(mine.exec, "usr-9");
    assert.match(mine.calls[0].text, /WHERE user_id = \$1 ORDER BY collection_order DESC/);
    assert.deepEqual(mine.calls[0].params, ["usr-9"]);
  });

  it("reply (Q-2 ก): replyMessage {a:1} → ข้อความ JSON · ไม่ส่ง → NULL · ไม่พบ → undefined", async () => {
    const a = fakeExecutor();
    assert.equal(await replyContactRequest(a.exec, "cr-1", { a: 1 }), undefined);
    assert.match(a.calls[0].text, /status = 'Replied'/);
    assert.deepEqual(a.calls[0].params, ["cr-1", '{"a":1}']);
    const b = fakeExecutor();
    await replyContactRequest(b.exec, "cr-1", undefined);
    assert.deepEqual(b.calls[0].params, ["cr-1", null]);
  });
});
