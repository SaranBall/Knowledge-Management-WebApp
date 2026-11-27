// PERSIST-01C-4 C2 — Unit test ของ repos/searchLogs.ts (search_logs + search_resolutions, ไม่ต่อฐานข้อมูล)
//   npx tsx --test src/server/repos/searchLogs.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isRealGap,
  listSearchLogs,
  listSearchResolutions,
  resolutionExists,
  rowToSearchLog,
  rowToSearchResolution,
} from "./searchLogs";
import { fakeExecutor } from "./testFakeExecutor";

describe("rowToSearchLog / rowToSearchResolution", () => {
  it("search_log: timestamp → ISO · has_result → boolean · ไม่มี collection_order", () => {
    assert.deepEqual(
      rowToSearchLog({ id: "sl-1", keyword: "k", user_id: "usr-1", timestamp: new Date("2026-11-27T01:02:03.456Z"), has_result: false, collection_order: "1" }),
      { id: "sl-1", keyword: "k", userId: "usr-1", timestamp: "2026-11-27T01:02:03.456Z", hasResult: false },
    );
  });

  it("resolution: assigned_to NULL → ไม่มี Key · resolved_at → ISO", () => {
    const s = rowToSearchResolution({
      id: "sr-1", keyword: "k", action: "a", assigned_to: null, resolved_by: "AM001",
      resolved_by_name: "Admin", resolved_at: new Date("2026-11-27T01:02:03.456Z"),
    });
    assert.deepEqual(s, { id: "sr-1", keyword: "k", action: "a", resolvedBy: "AM001", resolvedByName: "Admin", resolvedAt: "2026-11-27T01:02:03.456Z" });
  });
});

describe("SQL ของ searchLogs", () => {
  it("ทั้งสองตารางใหม่สุดก่อน", async () => {
    const a = fakeExecutor();
    await listSearchLogs(a.exec);
    assert.match(a.calls[0].text, /FROM km\.search_logs ORDER BY collection_order DESC/);
    const b = fakeExecutor();
    await listSearchResolutions(b.exec);
    assert.match(b.calls[0].text, /FROM km\.search_resolutions ORDER BY collection_order DESC/);
  });

  it("isRealGap: keyword ตรงตัว (Case-sensitive) และไม่มีผลลัพธ์", async () => {
    const { calls, exec } = fakeExecutor();
    assert.equal(await isRealGap(exec, "Kw"), false);
    assert.match(calls[0].text, /keyword = \$1 AND NOT has_result/);
    assert.deepEqual(calls[0].params, ["Kw"]);
  });

  it("resolutionExists เทียบแบบเดียวกับ UNIQUE (km.text_sha256) — FS-07", async () => {
    const { calls, exec } = fakeExecutor([{ "?column?": 1 }]);
    assert.equal(await resolutionExists(exec, "Kw"), true);
    assert.match(calls[0].text, /km\.text_sha256\(keyword\) = km\.text_sha256\(\$1\)/);
  });
});
