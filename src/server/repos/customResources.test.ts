// PERSIST-01C-4 C2 — Unit test ของ repos/customResources.ts (F-05 Raw Known Field, ไม่ต่อฐานข้อมูล)
//   npx tsx --test src/server/repos/customResources.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encodeCustomResource,
  insertCustomResource,
  listCustomResources,
  rowToCustomResource,
} from "./customResources";
import { fakeExecutor, viaJsonb } from "./testFakeExecutor";

/** encode → แถว (extra_data ผ่าน JSONB จำลอง) → decode */
function roundTrip(input: Record<string, unknown>, id = "res-1") {
  const s = encodeCustomResource(input);
  return rowToCustomResource({
    id,
    title: s.columns.title,
    content: s.columns.content,
    source_type: s.columns.sourceType,
    added_by: s.columns.addedBy,
    created_at: s.columns.createdAt,
    extra_data: s.extra === null ? null : viaJsonb(s.extra),
  });
}

describe("encodeCustomResource", () => {
  it("ช่องที่รู้จักเป็น String ทั้งหมด → คอลัมน์ · extra_data = NULL", () => {
    const s = encodeCustomResource({ title: "T", content: "C", sourceType: "Text", addedBy: "A", createdAt: "2026-11-27" });
    assert.deepEqual(s.columns, { title: "T", content: "C", sourceType: "Text", addedBy: "A", createdAt: "2026-11-27" });
    assert.equal(s.extra, null);
  });

  it("ค่าที่ไม่ใช่ String (รวม null) และช่องไม่รู้จัก → extra_data · ไม่ส่ง → ไม่มีทั้งสองที่ · id ไม่เก็บใน extra", () => {
    const s = encodeCustomResource({ id: "res-x", title: 5, content: null, sourceType: "URL", foo: { a: 1 } });
    assert.deepEqual(s.columns, { title: null, content: null, sourceType: "URL", addedBy: null, createdAt: null });
    assert.deepEqual(s.extra, { title: 5, content: null, foo: { a: 1 } });
    assert.equal("addedBy" in (s.extra ?? {}), false);
    assert.equal("id" in (s.extra ?? {}), false);
  });
});

describe("F-05 round-trip (JSONB สลับลำดับ Key)", () => {
  it("{title: 5, content: null, sourceType: URL, foo: {a:1}} ไม่ส่ง addedBy → ได้ค่าเดิมทุกช่อง และไม่มี Key addedBy", () => {
    const back = roundTrip({ title: 5, content: null, sourceType: "URL", foo: { a: 1 } }) as unknown as Record<string, unknown>;
    assert.deepEqual(back, { id: "res-1", title: 5, content: null, sourceType: "URL", foo: { a: 1 } });
    assert.equal("content" in back, true);
    assert.equal("addedBy" in back, false);
  });

  it("แยก \"ไม่ส่ง\" กับ null ได้ทุกช่องที่รู้จัก", () => {
    const back = roundTrip({ title: null, addedBy: null }) as unknown as Record<string, unknown>;
    assert.deepEqual(back, { id: "res-1", title: null, addedBy: null });
    assert.equal("content" in back, false);
    assert.equal("sourceType" in back, false);
  });

  it("ชนิดหลากหลาย: Array, Boolean, ตัวเลข, Object ซ้อน, ข้อความว่าง", () => {
    const input = { title: "", content: ["a", 1], sourceType: true, createdAt: 0, nested: { x: [1, { y: null }] } };
    assert.deepEqual(roundTrip(input), { id: "res-1", ...input });
  });

  it("ชื่อช่อง \"__proto__\" เป็นข้อมูลปกติ ไม่เปลี่ยน Prototype", () => {
    const input = JSON.parse('{"title":"T","__proto__":{"evil":true}}');
    const back = roundTrip(input) as unknown as Record<string, unknown>;
    assert.equal(Object.getPrototypeOf(back), Object.prototype);
    assert.equal((back as { evil?: boolean }).evil, undefined);
    assert.deepEqual(Object.keys(back).sort(), ["__proto__", "id", "title"]);
    assert.equal(JSON.stringify((back as Record<string, unknown>)["__proto__"]), '{"evil":true}');
  });

  it("extra_data ที่มี id ไม่ทับ id ของแถว", () => {
    const back = rowToCustomResource({ id: "res-real", title: "T", content: null, source_type: null, added_by: null, created_at: null, extra_data: { id: "hack" } });
    assert.equal(back.id, "res-real");
  });
});

describe("SQL ของ customResources", () => {
  it("list ใหม่สุดก่อน · insert ส่ง extra_data เป็นข้อความ JSON (::jsonb)", async () => {
    const l = fakeExecutor();
    await listCustomResources(l.exec);
    assert.match(l.calls[0].text, /ORDER BY collection_order DESC/);
    const i = fakeExecutor([{ id: "res-1", title: null, content: null, source_type: null, added_by: null, created_at: null, extra_data: null }]);
    await insertCustomResource(i.exec, "res-1", encodeCustomResource({ foo: [1, 2] }));
    assert.match(i.calls[0].text, /\$7::jsonb/);
    assert.equal(i.calls[0].params[6], '{"foo":[1,2]}');
  });
});
