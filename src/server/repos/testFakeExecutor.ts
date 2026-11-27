// PERSIST-01C-4 — Executor ปลอมสำหรับ Unit test ของ Repo (บันทึก SQL/Parameter ไม่ต่อฐานข้อมูล)
// ใช้เฉพาะในไฟล์ *.test.ts

export interface RecordedCall {
  text: string;
  params: unknown[];
}

export function fakeExecutor(rows: Record<string, unknown>[] = []) {
  const calls: RecordedCall[] = [];
  const exec = {
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return { rows, rowCount: rows.length };
    },
  };
  // ชนิดของ Executor จริงคือ { query: PoolClient["query"] } — Test ใช้เฉพาะรูปร่าง (text, params) → { rows, rowCount }
  return { calls, exec: exec as never };
}

/** จำลอง JSONB: ผ่าน JSON และสลับลำดับ Key ภายใน Object (JSONB ไม่รักษาลำดับ Key) */
export function viaJsonb(v: unknown): unknown {
  const shuffle = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(shuffle);
    if (x && typeof x === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(x as object).reverse()) {
        Object.defineProperty(out, k, {
          value: shuffle((x as Record<string, unknown>)[k]),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      return out;
    }
    return x;
  };
  return shuffle(JSON.parse(JSON.stringify(v)));
}
