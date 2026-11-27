// PERSIST-01C-4 C2 — Unit test ของ repos/rowHelpers.ts
//   npx tsx --test src/server/repos/rowHelpers.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clientIdOf,
  copyArray,
  isPlainObject,
  isoOrUndefined,
  putIfPresent,
  setOwn,
  toFiniteOrNull,
  toIntegerOrNull,
  toTextArrayOrNull,
} from "./rowHelpers";

describe("rowHelpers", () => {
  it("toTextArrayOrNull: ไม่ใช่ Array → null · สมาชิกไม่ใช่ String → ข้อความ · สมาชิก null ตัดทิ้ง", () => {
    assert.equal(toTextArrayOrNull("a"), null);
    assert.equal(toTextArrayOrNull(undefined), null);
    assert.equal(toTextArrayOrNull(null), null);
    assert.deepEqual(toTextArrayOrNull([]), []);
    assert.deepEqual(toTextArrayOrNull(["a", 1, null, true, { k: 1 }, ""]), ["a", "1", "true", '{"k":1}', ""]);
  });

  it("toFiniteOrNull: ตัวเลขจำกัดเท่านั้น", () => {
    assert.equal(toFiniteOrNull(7.5), 7.5);
    assert.equal(toFiniteOrNull(0), 0);
    for (const v of ["x", "3", NaN, Infinity, -Infinity, null, undefined, true]) {
      assert.equal(toFiniteOrNull(v), null, String(v));
    }
  });

  it("toIntegerOrNull: ตัดทศนิยม · ค่าที่ไม่ใช่ตัวเลขจำกัด → null", () => {
    assert.equal(toIntegerOrNull(3), 3);
    assert.equal(toIntegerOrNull(2.7), 2);
    assert.equal(toIntegerOrNull(-2.7), -2);
    assert.equal(toIntegerOrNull("3"), null);
    assert.equal(toIntegerOrNull(NaN), null);
  });

  it("isPlainObject: Object ธรรมดาเท่านั้น", () => {
    assert.equal(isPlainObject({}), true);
    assert.equal(isPlainObject(Object.create(null)), true);
    for (const v of [[], null, undefined, "x", 1, true, new Date()]) {
      assert.equal(isPlainObject(v), false, String(v));
    }
  });

  it("clientIdOf: truthy → ข้อความ · falsy → undefined (ให้ Server สร้าง)", () => {
    assert.equal(clientIdOf({ id: "exp-1" }), "exp-1");
    assert.equal(clientIdOf({ id: 5 }), "5");
    for (const v of [undefined, null, "", 0, false]) {
      assert.equal(clientIdOf({ id: v }), undefined, String(v));
    }
  });

  it("setOwn: \"__proto__\" เป็น Own property ไม่เปลี่ยน Prototype", () => {
    const o: Record<string, unknown> = {};
    setOwn(o, "__proto__", { evil: true });
    assert.equal(Object.getPrototypeOf(o), Object.prototype);
    assert.deepEqual(Object.keys(o), ["__proto__"]);
    assert.equal((o as { evil?: boolean }).evil, undefined);
  });

  it("putIfPresent / isoOrUndefined / copyArray", () => {
    const o: Record<string, unknown> = {};
    putIfPresent(o, "a", null);
    putIfPresent(o, "b", undefined);
    putIfPresent(o, "c", "");
    putIfPresent(o, "d", 0);
    assert.deepEqual(o, { c: "", d: 0 });
    assert.equal(isoOrUndefined(new Date("2026-11-27T01:02:03.456Z")), "2026-11-27T01:02:03.456Z");
    assert.equal(isoOrUndefined(null), undefined);
    const src = ["a"];
    const copy = copyArray(src)!;
    copy.push("b");
    assert.deepEqual(src, ["a"]);
    assert.equal(copyArray(null), undefined);
  });
});
