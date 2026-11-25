/**
 * PERSIST-01C-0 — การเชื่อมต่อ PostgreSQL (km_rmp) ของ Express Backend
 *
 * อ้างอิง: Addendum §21.22 §3 / §3.1 (Pool ใน Process, Transaction helper, Type parser ระดับ Pool)
 *
 * - Pool สร้างครั้งแรกที่ใช้ (lazy) เพราะ server.ts เรียก dotenv.config() หลัง import ทั้งหมด
 * - ทุก Query ต้องใช้ Parameter ($1, $2, ...) เท่านั้น ห้ามต่อ String เข้า SQL
 * - ข้อความ Log/Error ในไฟล์นี้ต้องไม่มีค่าลับ (รหัสผ่าน, Connection string)
 */
import pg from "pg";
import type {
  CustomTypesConfig,
  PoolClient,
  PoolConfig,
  QueryResult,
  QueryResultRow,
} from "pg";

const EXPECTED_USER = "km_app";
const EXPECTED_DATABASE = "km_rmp";
const DATE_OID = 1082; // pg.types.builtins.DATE

// §21.22 §3.1 ข้อ 2: Type parser ระดับ Pool เท่านั้น (ห้าม pg.types.setTypeParser ระดับ Process)
// DATE → คืนข้อความ YYYY-MM-DD ตามที่ DB ส่งมา (ค่าเริ่มต้นของ pg แปลงเป็น Date ตาม Timezone ของ Process
// ซึ่งทำให้วันที่เลื่อนได้) — ชนิดอื่นใช้ Parser เริ่มต้นของ pg
const poolTypes = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid === DATE_OID && (format === undefined || format === "text")) {
      return (value: string) => value;
    }
    return pg.types.getTypeParser(oid, format);
  },
} as CustomTypesConfig;

/** ข้อมูล Error แบบไม่มีค่าลับ สำหรับ Log */
function describeError(err: unknown): Record<string, unknown> {
  const e = err as { name?: unknown; code?: unknown; message?: unknown };
  return {
    name: typeof e?.name === "string" ? e.name : undefined,
    code: typeof e?.code === "string" ? e.code : undefined,
    message: typeof e?.message === "string" ? e.message : String(err),
  };
}

function buildPoolConfig(): PoolConfig {
  const password = process.env.DB_PASSWORD;
  if (!password) {
    throw new Error(
      "ไม่ได้ตั้งค่า DB_PASSWORD — กรุณาใส่รหัสผ่านของ km_app ในไฟล์ .env",
    );
  }
  const port = Number(process.env.DB_PORT || 5432);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("ค่า DB_PORT ไม่ถูกต้อง");
  }
  return {
    host: process.env.DB_HOST || "localhost",
    port,
    database: process.env.DB_NAME || EXPECTED_DATABASE,
    user: process.env.DB_USER || EXPECTED_USER,
    password,
    max: 10,
    application_name: "km-rmp-portal",
    statement_timeout: 15000,
    types: poolTypes,
  };
}

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (pool) return pool;
  const p = new pg.Pool(buildPoolConfig());
  // Error ของ Client ที่ว่างอยู่ใน Pool (เช่น Backend ถูกตัด) — บันทึกแล้วปล่อยให้ Pool ทิ้ง Client นั้นเอง
  // ต้องมีเสมอ ไม่เช่นนั้น Process ของ Node จะล่ม (§21.22 §3.1 ข้อ 1)
  p.on("error", (err) => {
    console.error("[db] idle client error", describeError(err));
  });
  pool = p;
  return p;
}

/** Query ผ่าน Pool — `text` ต้องเป็น SQL คงที่ และส่งค่าผ่าน `params` เท่านั้น */
export function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  return getPool().query<R>(text, params);
}

/**
 * รัน `fn` ใน Transaction เดียว (§21.22 §3.1 ข้อ 1)
 *
 * connect → แนบ client.on('error') ตลอดช่วงที่ถือ Client → BEGIN → fn → COMMIT
 * Error → ROLLBACK (ถ้า Client ยังใช้ได้) → release(err) ถ้า Client เสีย / release() ถ้าปกติ
 * → ถอด Listener → โยน Error เดิมต่อ
 *
 * หมายเหตุ: pg-pool แนบ Listener ของตัวเองคืนตอน release เสมอ จึงถอดของเราหลัง release ได้อย่างปลอดภัย
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  let clientError: Error | undefined;
  const onClientError = (err: Error) => {
    clientError = err;
    console.error("[db] client error during transaction", describeError(err));
  };
  client.on("error", onClientError);

  let brokenClient: Error | undefined;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    if (clientError) {
      brokenClient = clientError;
    } else {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        // ROLLBACK ไม่สำเร็จ = Client อยู่ในสถานะที่ไม่แน่นอน → ทิ้ง Client
        brokenClient =
          rollbackErr instanceof Error
            ? rollbackErr
            : new Error("ROLLBACK failed");
        console.error("[db] rollback failed", describeError(rollbackErr));
      }
    }
    throw err;
  } finally {
    // Error ระหว่าง COMMIT/BEGIN ที่ทำให้ Client เสีย ก็ถูกจับผ่าน clientError เช่นกัน
    const releaseErr = brokenClient ?? clientError;
    if (releaseErr) client.release(releaseErr);
    else client.release();
    client.removeListener("error", onClientError);
  }
}

/**
 * ตรวจฐานข้อมูลตอนเริ่ม Server — ไม่ผ่าน = โยน Error (ข้อความไม่มีค่าลับ)
 * - ผู้ใช้ km_app ต่อฐาน km_rmp
 * - ตาราง km.departments มีข้อมูลอย่างน้อย 1 แถว (seed แล้ว)
 */
export async function checkDatabase(): Promise<void> {
  let who: { current_user: string; current_database: string } | undefined;
  let departments = 0;
  try {
    who = (
      await query<{ current_user: string; current_database: string }>(
        "SELECT current_user, current_database()",
      )
    ).rows[0];
    departments = (
      await query<{ n: number }>("SELECT count(*)::int AS n FROM km.departments")
    ).rows[0]?.n;
  } catch (err) {
    const d = describeError(err);
    throw new Error(
      `เชื่อมต่อหรือตรวจฐานข้อมูลไม่สำเร็จ${d.code ? ` [${d.code}]` : ""}: ${d.message}`,
    );
  }
  if (
    who?.current_user !== EXPECTED_USER ||
    who?.current_database !== EXPECTED_DATABASE
  ) {
    throw new Error(
      `ฐานข้อมูลไม่ถูกต้อง: ต้องเป็นผู้ใช้ ${EXPECTED_USER} บนฐาน ${EXPECTED_DATABASE} ` +
        `(ได้ ${who?.current_user ?? "?"} / ${who?.current_database ?? "?"})`,
    );
  }
  if (!(departments >= 1)) {
    throw new Error("ตาราง km.departments ไม่มีข้อมูล — ยังไม่ได้รัน seed แผนก");
  }
}

/** ปิด Pool (ใช้ตอนหยุด Server หรือจบการทดสอบ) */
export async function closePool(): Promise<void> {
  const p = pool;
  pool = null;
  if (p) await p.end();
}
