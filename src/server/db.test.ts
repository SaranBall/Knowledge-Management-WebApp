// PERSIST-01C-0 — Integration test ของ db.ts กับ km_rmp บนเครื่อง Dev
//   npx tsx --test src/server/db.test.ts
// อ่านค่าเชื่อมต่อจาก .env (DB_*) — ไม่มี DB_PASSWORD = ข้ามทั้งชุด
//
// km_app ไม่มีสิทธิ์ TEMP บน km_rmp (db/setup/0000 ถอนสิทธิ์ PUBLIC) จึงทดสอบกับ km.search_logs
// เฉพาะแถวที่ id ขึ้นต้น "test-01c0-" — ลบแถวทดสอบทั้งหมดใน finally ของทุกข้อ
// และข้อสุดท้ายตรวจว่าไม่เหลือแถวทดสอบค้าง

import dotenv from "dotenv";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { checkDatabase, closePool, query, withTransaction } from "./db";
import { classifyDbError } from "./dbErrors";

dotenv.config({ quiet: true });

const SKIP = process.env.DB_PASSWORD
  ? false
  : "ข้าม: ไม่ได้ตั้ง DB_PASSWORD (ใส่ใน .env เพื่อรัน Integration test กับ km_rmp)";

const TEST_ID_PREFIX = "test-01c0-";
const TEST_ID_LIKE = `${TEST_ID_PREFIX}%`; // prefix ไม่มี % หรือ _ จึงใช้กับ LIKE ได้ตรงตัว

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Queryable = { query: pg.PoolClient["query"] };

async function backendPid(client: Queryable): Promise<number> {
  const r = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  return r.rows[0].pid;
}

async function insertTestRow(client: Queryable, id: string): Promise<void> {
  await client.query(
    `INSERT INTO km.search_logs (id, keyword, user_id, "timestamp", has_result)
     VALUES ($1, $2, $3, now(), false)`,
    [id, "test-01c0 keyword", "test-01c0-user"],
  );
}

async function countRowsById(id: string): Promise<number> {
  const r = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM km.search_logs WHERE id = $1",
    [id],
  );
  return r.rows[0].n;
}

async function deleteTestRows(): Promise<void> {
  await query("DELETE FROM km.search_logs WHERE id LIKE $1", [TEST_ID_LIKE]);
}

async function countTestRows(): Promise<number> {
  const r = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM km.search_logs WHERE id LIKE $1",
    [TEST_ID_LIKE],
  );
  return r.rows[0].n;
}

describe("db.ts กับ km_rmp", { skip: SKIP }, () => {
  after(async () => {
    await closePool();
  });

  it("1. checkDatabase() ผ่าน (km_app / km_rmp / km.departments ≥ 1)", async () => {
    await checkDatabase();
  });

  it("2a. withTransaction: COMMIT แล้วข้อมูลอยู่", async () => {
    const id = `${TEST_ID_PREFIX}commit`;
    try {
      await withTransaction(async (c) => {
        await insertTestRow(c, id);
      });
      assert.equal(await countRowsById(id), 1);
    } finally {
      await deleteTestRows();
    }
  });

  it("2b. withTransaction: Error กลางทาง ROLLBACK แล้วข้อมูลไม่อยู่", async () => {
    const id = `${TEST_ID_PREFIX}rollback`;
    try {
      let insertedInTx = 0;
      await assert.rejects(
        withTransaction(async (c) => {
          await insertTestRow(c, id);
          // ยืนยันว่าแถวถูกเขียนจริงภายใน Transaction ก่อน Error
          const r = await c.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM km.search_logs WHERE id = $1",
            [id],
          );
          insertedInTx = r.rows[0].n;
          throw new Error("boom-01c0");
        }),
        /boom-01c0/,
      );
      assert.equal(insertedInTx, 1, "ภายใน Transaction ต้องเห็นแถวที่เพิ่ง Insert");
      assert.equal(await countRowsById(id), 0);
    } finally {
      await deleteTestRows();
    }
  });

  it("3. DATE คืนเป็นข้อความ '2026-11-25' (Parser ระดับ Pool) และไม่เปลี่ยน Parser ระดับ Process", async () => {
    const r = await query<{ d: unknown }>("SELECT '2026-11-25'::date AS d");
    assert.equal(r.rows[0].d, "2026-11-25");
    // Parser ระดับ Process ของ pg ยังเป็นค่าเริ่มต้น (แปลง DATE เป็น Date object)
    assert.ok(pg.types.getTypeParser(1082, "text")("2026-11-25") instanceof Date);
  });

  it("4. Backend ถูกตัดระหว่าง withTransaction → Error ถึงโค้ด, Process ไม่ล่ม, Query ถัดไปทำงานได้", async () => {
    let pidInTx = 0;
    let terminated: boolean | undefined;
    await assert.rejects(
      withTransaction(async (c) => {
        pidInTx = await backendPid(c);
        // Connection ที่สองจาก Pool ตัด Backend ของ Transaction นี้ (km_app ทำได้กับ Session ของตัวเอง)
        const t = await query<{ ok: boolean }>("SELECT pg_terminate_backend($1) AS ok", [pidInTx]);
        terminated = t.rows[0].ok;
        await sleep(300);
        await c.query("SELECT 1");
      }),
      (err: unknown) => !(err instanceof assert.AssertionError),
    );
    assert.equal(terminated, true, "pg_terminate_backend ต้องคืน true");
    await sleep(300); // เผื่อ Event ที่มาช้า — ถ้าไม่มี Listener Process จะล่มตรงนี้
    const r = await query<{ pid: number; one: number }>("SELECT pg_backend_pid() AS pid, 1 AS one");
    assert.equal(r.rows[0].one, 1);
    assert.notEqual(r.rows[0].pid, pidInTx);
  });

  it("5. classifyDbError กับ Error จริง: Insert id ซ้ำใน km.search_logs → unique / search_logs_pk", async () => {
    const id = `${TEST_ID_PREFIX}duplicate`;
    try {
      await assert.rejects(
        withTransaction(async (c) => {
          await insertTestRow(c, id);
          await insertTestRow(c, id);
        }),
        (err: unknown) => {
          assert.deepEqual(classifyDbError(err), {
            kind: "unique",
            constraint: "search_logs_pk",
            sqlstate: "23505",
          });
          return true;
        },
      );
    } finally {
      await deleteTestRows();
    }
  });

  // 01C-1 B1: ถอด Listener ของ withTransaction ก่อนคืน Client — Error ของผู้ใช้ Client คนถัดไป
  // (หรือของ Client ที่ว่างอยู่ใน Pool) ต้องไม่ไปถึง Listener ของ Transaction ที่จบไปแล้ว
  for (const mode of ["COMMIT", "ROLLBACK"] as const) {
    it(`6. withTransaction (${mode}) ถอด Listener ของตัวเองก่อนคืน Client`, async () => {
      let held: pg.PoolClient | undefined;
      let duringTx: Function[] = [];
      let atRelease: Function[] | undefined;
      const p = withTransaction(async (c) => {
        held = c;
        duringTx = c.listeners("error");
        // จับรายการ Listener ณ วินาทีที่ withTransaction เรียก release() (ลำดับเดิมของ 01C-0 จะยังเห็น Listener ของเรา)
        const originalRelease = c.release;
        c.release = ((err?: Error | boolean) => {
          atRelease = c.listeners("error");
          return originalRelease.call(c, err);
        }) as typeof c.release;
        if (mode === "ROLLBACK") throw new Error("boom-b1");
      });
      if (mode === "COMMIT") await p;
      else await assert.rejects(p, /boom-b1/);

      assert.ok(held, "ต้องได้ Client");
      assert.ok(duringTx.length >= 1, "ระหว่าง Transaction ต้องมี Listener อย่างน้อย 1 ตัว");
      assert.ok(atRelease, "withTransaction ต้องเรียก release()");
      assert.equal(
        duringTx.some((fn) => atRelease!.includes(fn)),
        false,
        "ณ ตอนเรียก release() Listener ของ Transaction ต้องถูกถอดไปแล้ว",
      );
      const afterRelease = held!.listeners("error");
      assert.ok(afterRelease.length >= 1, "หลังคืน Client ต้องมี Listener ของ Pool (ไม่มีช่วงที่ไม่มี Listener)");
      assert.equal(
        duringTx.some((fn) => afterRelease.includes(fn)),
        false,
        "Listener ที่แนบระหว่าง Transaction ต้องถูกถอดแล้ว",
      );

      // Error ที่เกิดกับ Client หลังคืน → ไปที่ Listener ของ Pool เท่านั้น ไม่ใช่ของ Transaction ที่จบแล้ว
      const logged: string[] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => {
        logged.push(String(args[0]));
      };
      try {
        held!.emit("error", new Error("simulated-next-user-error"));
      } finally {
        console.error = original;
      }
      assert.equal(logged.includes("[db] client error during transaction"), false, logged.join(" | "));
      assert.ok(logged.includes("[db] idle client error"), logged.join(" | "));
      // Pool ทิ้ง Client ที่เสียไปแล้ว — Query ถัดไปต้องทำงานได้
      const r = await query<{ one: number }>("SELECT 1 AS one");
      assert.equal(r.rows[0].one, 1);
    });
  }

  it("ท้ายสุด: ไม่มีแถวทดสอบ test-01c0-% ค้างใน km.search_logs", async () => {
    assert.equal(await countTestRows(), 0);
  });
});
