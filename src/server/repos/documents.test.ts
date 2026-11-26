// PERSIST-01C-3 C2 — Unit test ของ repos/documents.ts (ไม่ต้องต่อฐานข้อมูล)
//   npx tsx --test src/server/repos/documents.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  type DocumentRow,
  decodeParsedExcelSheets,
  encodeParsedExcelSheets,
  rowToDocument,
  toDocumentFields,
} from "./documents";

const nullRow = (id: string): DocumentRow => ({
  id,
  department_id: "d-hr",
  title: null,
  description: null,
  type: null,
  owner: null,
  revision: null,
  effective_date: null,
  status: "Published",
  approved_by: null,
  approved_at: null,
  file_url: null,
  real_file_url: null,
  file_type: null,
  example_text: null,
  example_image: null,
  example_video: null,
  parsed_excel_sheets: null,
  views: 0,
  downloads: 0,
  created_at: null,
  tags: null,
});

/** จำลองการเก็บใน JSONB: ผ่าน JSON และสลับลำดับ Key ภายใน Object (JSONB ไม่รักษาลำดับ Key) */
function viaJsonb(v: unknown): unknown {
  const shuffleKeys = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(shuffleKeys);
    if (x && typeof x === "object") {
      const keys = Object.keys(x as object).reverse();
      return Object.fromEntries(keys.map((k) => [k, shuffleKeys((x as Record<string, unknown>)[k])]));
    }
    return x;
  };
  return shuffleKeys(JSON.parse(JSON.stringify(v)));
}

// ---------------------------------------------------------------------------
// rowToDocument
// ---------------------------------------------------------------------------

describe("rowToDocument", () => {
  it("ช่องที่เป็น NULL → ไม่มี Key · views/downloads เป็นตัวเลข · ACL ว่างเป็น []", () => {
    assert.deepEqual(rowToDocument(nullRow("doc-1"), []), {
      id: "doc-1",
      departmentId: "d-hr",
      status: "Published",
      views: 0,
      downloads: 0,
      allowedDepartmentIds: [],
    });
  });

  it("แถวครบ → camelCase ครบ · approvedAt เป็น ISO · revision เป็น number · ACL ตามลำดับที่ส่ง (ordinal)", () => {
    const d = rowToDocument(
      {
        id: "doc-2",
        department_id: "d-pd-dl",
        title: "T",
        description: "D",
        type: "QP",
        owner: "O",
        revision: 2.5,
        effective_date: "2026-01-01",
        status: "Pending Approval",
        approved_by: "AM001",
        approved_at: new Date("2026-11-26T01:02:03.456Z"),
        file_url: "/uploads/a.pdf",
        real_file_url: "/uploads/a.pdf",
        file_type: "PDF",
        example_text: "x",
        example_image: "i",
        example_video: "v",
        parsed_excel_sheets: [{ ordinal: 0, name: "S1", rows: [[1]] }],
        views: 7,
        downloads: 3,
        created_at: "2026-11-26T00:00:00.000Z",
        tags: ["a", "b"],
        allowed_ids: ["ignored-by-mapper"],
      },
      ["d-pd-dl", "d-hr", "d-qa"],
    );
    assert.deepEqual(d, {
      id: "doc-2",
      departmentId: "d-pd-dl",
      title: "T",
      description: "D",
      type: "QP",
      owner: "O",
      revision: 2.5,
      effectiveDate: "2026-01-01",
      status: "Pending Approval",
      approvedBy: "AM001",
      approvedAt: "2026-11-26T01:02:03.456Z",
      fileUrl: "/uploads/a.pdf",
      realFileUrl: "/uploads/a.pdf",
      fileType: "PDF",
      exampleText: "x",
      exampleImage: "i",
      exampleVideo: "v",
      parsedExcelSheets: { S1: [[1]] },
      views: 7,
      downloads: 3,
      createdAt: "2026-11-26T00:00:00.000Z",
      tags: ["a", "b"],
      allowedDepartmentIds: ["d-pd-dl", "d-hr", "d-qa"],
    });
  });

  it("ไม่มี collection_order / Key แบบ snake_case หลุดออกไป", () => {
    const d = rowToDocument({ ...nullRow("doc-3"), ...({ collection_order: "9" } as object) } as DocumentRow, ["d-hr"]);
    const keys = Object.keys(d);
    assert.equal(keys.includes("collection_order"), false);
    assert.equal(keys.includes("collectionOrder"), false);
    assert.ok(keys.every((k) => !k.includes("_")), keys.join(","));
  });

  it("ข้อความว่าง \"\" ไม่ใช่ NULL → คง Key", () => {
    const d = rowToDocument({ ...nullRow("doc-4"), title: "", example_text: "" }, ["d-hr"]);
    assert.equal(d.title, "");
    assert.equal(d.exampleText, "");
  });

  it("ไม่แก้ Array ACL / tags ที่ส่งเข้ามา (คัดลอก)", () => {
    const acl = ["d-hr"];
    const row = { ...nullRow("doc-5"), tags: ["t"] };
    const d = rowToDocument(row, acl);
    (d.allowedDepartmentIds as string[]).push("x");
    (d.tags as string[]).push("y");
    assert.deepEqual(acl, ["d-hr"]);
    assert.deepEqual(row.tags, ["t"]);
  });
});

// ---------------------------------------------------------------------------
// encode / decode parsedExcelSheets (FS-06, Q-1 ก)
// ---------------------------------------------------------------------------

describe("encode/decodeParsedExcelSheets", () => {
  it("Object → [{ ordinal, name, rows }] ตามลำดับ Object.keys", () => {
    assert.deepEqual(encodeParsedExcelSheets({ B: [[1]], A: [["x"]] }), [
      { ordinal: 0, name: "B", rows: [[1]] },
      { ordinal: 1, name: "A", rows: [["x"]] },
    ]);
  });

  it("round-trip รักษาลำดับ Object.keys: ชื่อยาวต่างกัน, ชื่อไทย, ชื่อตัวเลข \"2024\", ค่าเซลล์ตัวเลข/ว่าง/null", () => {
    const sheets: Record<string, unknown> = {
      "สรุปยอดประจำเดือน": [["รายการ", "จำนวน"], ["ฟิล์ม", 12], ["", null]],
      "2024": [[1, 2.5, ""], [0, -3, "x"]],
      A: [["a"]],
      "Sheet10 ชื่อยาวกว่าชีตอื่นมาก ๆ": [[]],
      "ก": [[0]],
      Sheet2: [["b", 0]],
      "10": [[10]],
    };
    const back = decodeParsedExcelSheets(viaJsonb(encodeParsedExcelSheets(sheets))) as Record<string, unknown>;
    assert.deepEqual(Object.keys(back), Object.keys(sheets));
    assert.deepEqual(back, sheets);
    assert.equal(JSON.stringify(back), JSON.stringify(sheets));
  });

  it("decode เรียงตาม ordinal แม้ Array ที่เก็บมาสลับลำดับ", () => {
    const stored = [
      { ordinal: 2, name: "C", rows: [[3]] },
      { ordinal: 0, name: "A", rows: [[1]] },
      { ordinal: 1, name: "B", rows: [[2]] },
    ];
    assert.deepEqual(Object.keys(decodeParsedExcelSheets(stored) as object), ["A", "B", "C"]);
  });

  it("ค่าอื่นที่ไม่ใช่ Object (Array ตามชุดหลัก, String, ตัวเลข) → { raw } → ได้ค่าเดิม", () => {
    const arr = [{ name: "Sheet1", rows: [["a", "b"], ["1", "2"]] }];
    assert.deepEqual(encodeParsedExcelSheets(arr), { raw: arr });
    assert.deepEqual(decodeParsedExcelSheets(viaJsonb(encodeParsedExcelSheets(arr))), arr);
    for (const v of ["text", 0, 5, false, true, []]) {
      assert.deepEqual(decodeParsedExcelSheets(viaJsonb(encodeParsedExcelSheets(v))), v, JSON.stringify(v));
    }
  });

  it("null / undefined → เก็บ NULL · decode NULL → undefined (Key หาย)", () => {
    assert.equal(encodeParsedExcelSheets(null), null);
    assert.equal(encodeParsedExcelSheets(undefined), null);
    assert.equal(decodeParsedExcelSheets(null), undefined);
    assert.equal(decodeParsedExcelSheets(undefined), undefined);
  });

  it("Object ว่าง {} → [] → ได้ {} กลับ", () => {
    assert.deepEqual(encodeParsedExcelSheets({}), []);
    assert.deepEqual(decodeParsedExcelSheets([]), {});
  });

  it("ชื่อชีต \"__proto__\" เป็น Own property ไม่เปลี่ยน Prototype", () => {
    const sheets = JSON.parse('{"__proto__": [["x"]], "B": [["y"]]}');
    const back = decodeParsedExcelSheets(viaJsonb(encodeParsedExcelSheets(sheets))) as Record<string, unknown>;
    assert.equal(Object.getPrototypeOf(back), Object.prototype);
    assert.deepEqual(Object.keys(back), ["__proto__", "B"]);
    assert.equal(JSON.stringify(back), JSON.stringify(sheets));
  });
});

// ---------------------------------------------------------------------------
// toDocumentFields (Q-2 ก)
// ---------------------------------------------------------------------------

describe("toDocumentFields", () => {
  it("ช่องข้อความใช้ toTextOrNull: ตัวเลข → ข้อความ, null/ไม่ส่ง → null, \"\" คงเดิม", () => {
    const f = toDocumentFields({ title: 5, description: null, owner: "", status: "Published", departmentId: "d-hr" });
    assert.equal(f.title, "5");
    assert.equal(f.description, null);
    assert.equal(f.owner, "");
    assert.equal(f.type, null);
    assert.equal(f.status, "Published");
  });

  it("revision: ตัวเลขจำกัดเท่านั้น (\"abc\" / \"3\" / NaN / Infinity / null → null)", () => {
    assert.equal(toDocumentFields({ revision: 2 }).revision, 2);
    assert.equal(toDocumentFields({ revision: 2.5 }).revision, 2.5);
    assert.equal(toDocumentFields({ revision: 0 }).revision, 0);
    for (const v of ["abc", "3", NaN, Infinity, -Infinity, null, undefined, true]) {
      assert.equal(toDocumentFields({ revision: v }).revision, null, String(v));
    }
  });

  it("tags: ไม่ใช่ Array → null · สมาชิกที่ไม่ใช่ String → toTextOrNull · สมาชิกที่เป็น null ตัดทิ้ง", () => {
    assert.equal(toDocumentFields({ tags: "x" }).tags, null);
    assert.equal(toDocumentFields({}).tags, null);
    assert.deepEqual(toDocumentFields({ tags: ["a", 1, null, true, { k: 1 }, ""] }).tags, ["a", "1", "true", '{"k":1}', ""]);
    assert.deepEqual(toDocumentFields({ tags: [] }).tags, []);
  });

  it("parsedExcelSheets ถูก Encode · views/downloads จำนวนเต็ม (ค่าอื่น = 0)", () => {
    const f = toDocumentFields({ parsedExcelSheets: { S: [[1]] }, views: 3, downloads: "9" });
    assert.deepEqual(f.parsedExcelSheets, [{ ordinal: 0, name: "S", rows: [[1]] }]);
    assert.equal(f.views, 3);
    assert.equal(f.downloads, 0);
    assert.equal(toDocumentFields({}).parsedExcelSheets, null);
  });

  it("ช่องนอกรายการไม่เก็บ (id, accessible, allowedDepartmentIds, ช่องแปลก ๆ)", () => {
    const f = toDocumentFields({ id: "doc-x", accessible: true, allowedDepartmentIds: ["d-hr"], hack: "x", title: "T" });
    const keys = Object.keys(f);
    for (const k of ["id", "accessible", "allowedDepartmentIds", "hack"]) assert.equal(keys.includes(k), false, k);
    assert.equal(f.title, "T");
  });

  it("round-trip: toDocumentFields → แถว → rowToDocument ได้ค่าเดิม (ค่าที่เป็น String อยู่แล้ว)", () => {
    const input = {
      departmentId: "d-pd-dl",
      title: "C3",
      description: "desc",
      type: "WI",
      owner: "Harness",
      revision: 1,
      status: "Published",
      approvedBy: "AM001",
      approvedAt: "2026-11-26T01:02:03.456Z",
      fileType: "PDF",
      createdAt: "2026-11-26T00:00:00.000Z",
      tags: ["harness"],
      parsedExcelSheets: { "2024": [[1]], สรุป: [["a"]] },
      views: 0,
      downloads: 0,
    };
    const f = toDocumentFields(input);
    const row: DocumentRow = {
      ...nullRow("doc-rt"),
      department_id: f.departmentId as string,
      title: f.title,
      description: f.description,
      type: f.type,
      owner: f.owner,
      revision: f.revision,
      status: f.status as string,
      approved_by: f.approvedBy,
      approved_at: new Date(f.approvedAt as string),
      file_type: f.fileType,
      created_at: f.createdAt,
      tags: f.tags,
      parsed_excel_sheets: viaJsonb(f.parsedExcelSheets),
      views: f.views,
      downloads: f.downloads,
    };
    assert.deepEqual(rowToDocument(row, ["d-pd-dl"]), { id: "doc-rt", ...input, allowedDepartmentIds: ["d-pd-dl"] });
  });
});
