/**
 * PERSIST-01C-0 — API Regression harness (ตัวยิง)
 *
 * ใช้: npx tsx scripts/api-regression/run.ts [--suite main|01c1|01c2|01c3|01c4] <ชื่อรอบ>
 *   main (ค่าเริ่มต้น) = ชุดหลัก 306 Request — ห้ามแก้ เพื่อให้ยังเทียบกับ baseline ได้
 *   01c1               = กรณีเพิ่มของ PERSIST-01C-1 (§D) — รันแยกรอบบนฐานที่ล้างแล้ว
 *   01c2               = กรณีเพิ่มของ PERSIST-01C-2 (§D, Employee Master) — รันแยกรอบบนฐานที่ล้างแล้ว
 *   01c3               = กรณีเพิ่มของ PERSIST-01C-3 (§D, เอกสาร + ACL + ไฟล์) — รันแยกรอบบนฐานที่ล้างแล้ว
 *                        อัปโหลดไฟล์ทดสอบจริง (ชื่อไฟล์อยู่ใน summary.json → uploadedTestFiles) — ดูวิธีลบใน README
 *   01c4               = กรณีเพิ่มของ PERSIST-01C-4 (§D, ความรู้และการโต้ตอบ 7 ตาราง) — รันแยกรอบบนฐานที่ล้างแล้ว (ไม่อัปโหลดไฟล์)
 *
 * Environment (ตั้งใน Terminal เอง — ห้ามเขียนลงไฟล์):
 *   HARNESS_BASE_URL        ค่าเริ่มต้น http://localhost:3000
 *   HARNESS_ADMIN_ID        รหัสพนักงานของ Admin เริ่มต้น
 *   HARNESS_ADMIN_PASSWORD  รหัสผ่านของ Admin เริ่มต้น
 *
 * Server ต้องอยู่ในสถานะเริ่มต้นสะอาด (เพิ่งเปิด มีผู้ใช้เพียง Admin เริ่มต้น)
 * ผลแต่ละ Request ถูก Normalize แล้วเขียนเป็น JSON ลง out/<ชื่อรอบ>/
 * ไม่เขียนรหัสผ่านหรือ Token จริงลงไฟล์หรือ Console
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = path.join(HERE, "out");

// ---------------------------------------------------------------------------
// Normalize
// ---------------------------------------------------------------------------

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// ID ที่ระบบสร้าง: <prefix>-<epoch ms>[-hex6] หรือ <prefix>-<uuid>
const PREFIXED_ID_RE = new RegExp(
  `(?<![A-Za-z0-9_-])(?:km-log|usr|doc|kb|qs|exp|ex|prog|cert|att|ts|sl|sr|cr|res|log|r|c)-(?:${UUID}|\\d{13}(?:-[0-9a-f]{6})?)(?![A-Za-z0-9_])`,
  "g",
);
const BARE_UUID_RE = new RegExp(
  `(?<![A-Za-z0-9])${UUID}(?![A-Za-z0-9])`,
  "g",
);
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BCRYPT_RE = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g;
const ISO_RE =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const DATE_RE = /(?<![\d-])\d{4}-\d{2}-\d{2}(?!\d)/g;
const EPOCH_STR_RE = /(?<!\d)1\d{12}(?!\d)/g;
// ข้อความ 429 มีจำนวนวินาทีที่เหลือ (ขึ้นกับจังหวะเวลา)
const RETRY_RE = /(กรุณารออีก )\d+( วินาที)/g;

function isEpochMs(n: number): boolean {
  return Number.isInteger(n) && n >= 1e12 && n < 1e13;
}

class Normalizer {
  private labels = new Map<string, string>();

  constructor(
    private secrets: string[],
    private adminId: string,
  ) {}

  private label(raw: string): string {
    let l = this.labels.get(raw);
    if (!l) {
      l = `<ID:${this.labels.size + 1}>`;
      this.labels.set(raw, l);
    }
    return l;
  }

  str(input: string): string {
    let s = input;
    for (const secret of this.secrets) {
      if (secret && s.includes(secret)) s = s.split(secret).join("<LEAKED_SECRET>");
    }
    s = s.replace(JWT_RE, "<TOKEN>");
    s = s.replace(BCRYPT_RE, "<BCRYPT_HASH>");
    s = s.replace(PREFIXED_ID_RE, (m) => this.label(m));
    s = s.replace(BARE_UUID_RE, (m) => this.label(m));
    s = s.replace(ISO_RE, "<TS>");
    s = s.replace(DATE_RE, "<DATE>");
    s = s.replace(EPOCH_STR_RE, "<TS>");
    s = s.replace(RETRY_RE, "$1<N>$2");
    if (this.adminId.length >= 4) {
      s = s.split(this.adminId).join("<ADMIN_ID>");
    } else if (s === this.adminId) {
      s = "<ADMIN_ID>";
    }
    return s;
  }

  // เดิน Object ตามลำดับ Key ที่เรียงแล้ว — ป้าย ID จึงไม่ขึ้นกับลำดับ Key ของ Response
  value(v: unknown, key?: string): unknown {
    if (key !== undefined && /^password$/i.test(key) && v !== undefined && v !== null) {
      return "<PASSWORD>";
    }
    if (key === "token" && typeof v === "string") return "<TOKEN>";
    if (typeof v === "string") return this.str(v);
    if (typeof v === "number") return isEpochMs(v) ? "<TS>" : v;
    if (Array.isArray(v)) return v.map((x) => this.value(x));
    if (v && typeof v === "object") {
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).sort()) {
        out[this.str(k)] = this.value(src[k], k);
      }
      return this.sortShuffledMatching(out);
    }
    return v;
  }

  // stripQuizAnswers สลับตัวเลือกฝั่งขวาของข้อ Matching แบบสุ่ม → เรียงก่อนบันทึก
  private sortShuffledMatching(o: Record<string, unknown>): Record<string, unknown> {
    if (
      o.type === "Matching" &&
      Array.isArray(o.pairs) &&
      o.pairs.every((p: any) => p && p.right === "") &&
      Array.isArray(o.options)
    ) {
      o.options = [...(o.options as unknown[])].sort((a, b) =>
        String(a).localeCompare(String(b)),
      );
    }
    return o;
  }
}

// ---------------------------------------------------------------------------
// HTTP + บันทึกผล
// ---------------------------------------------------------------------------

type Actor = "anon" | "bogus" | "admin" | "editor" | "viewer" | "temp" | "c1u2";

interface Res {
  status: number;
  kind: "json" | "text" | "empty";
  body: any;
}

interface RecordFile {
  seq: number;
  name: string;
  route: string;
  actor: Actor;
  method: string;
  path: unknown;
  requestBody: unknown;
  status: number;
  responseKind: Res["kind"];
  responseBody: unknown;
}

const SUITES = ["main", "01c1", "01c2", "01c3", "01c4"] as const;
type Suite = (typeof SUITES)[number];
const USAGE = "ใช้: npx tsx scripts/api-regression/run.ts [--suite main|01c1|01c2|01c3|01c4] <ชื่อรอบ>  (a-z A-Z 0-9 . _ -)";

function parseArgs(argv: string[]): { suite: Suite; runName: string } {
  let suite: string = "main";
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--suite") suite = argv[++i] ?? "";
    else if (argv[i].startsWith("--")) return fail(`ไม่รู้จักตัวเลือก ${argv[i]}`);
    else positional.push(argv[i]);
  }
  if (!(SUITES as readonly string[]).includes(suite)) return fail(`ไม่รู้จักชุด "${suite}"`);
  if (positional.length !== 1 || !/^[A-Za-z0-9._-]+$/.test(positional[0])) return fail("");
  return { suite: suite as Suite, runName: positional[0] };

  function fail(msg: string): never {
    if (msg) console.error(msg);
    console.error(USAGE);
    process.exit(2);
  }
}
const { suite: SUITE, runName } = parseArgs(process.argv.slice(2));
const BASE_URL = (process.env.HARNESS_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_ID = process.env.HARNESS_ADMIN_ID || "";
const ADMIN_PASSWORD = process.env.HARNESS_ADMIN_PASSWORD || "";
if (!ADMIN_ID || !ADMIN_PASSWORD) {
  console.error("ต้องตั้ง HARNESS_ADMIN_ID และ HARNESS_ADMIN_PASSWORD ใน Terminal ก่อนรัน");
  process.exit(2);
}
const OUT_DIR = path.join(OUT_ROOT, runName);
if (fs.existsSync(OUT_DIR)) {
  console.error(`มีโฟลเดอร์ผลของรอบ "${runName}" อยู่แล้ว — ลบเองหรือใช้ชื่อรอบใหม่`);
  process.exit(2);
}

// รหัสผ่านของผู้ใช้ที่ Harness สร้าง: สุ่มใหม่ทุกรอบ ไม่เขียนลงไฟล์
const randomPassword = () => crypto.randomBytes(12).toString("base64url");
const PW = {
  editor: randomPassword(),
  viewer: randomPassword(),
  temp: randomPassword(),
  wrong: randomPassword(),
  c1u1: randomPassword(),
  c1u2: randomPassword(),
};

const norm = new Normalizer(
  [ADMIN_PASSWORD, ...Object.values(PW)],
  ADMIN_ID,
);
const tokens: Partial<Record<Actor, string>> = {};
const routeCounts = new Map<string, number>();
const unexpected: Array<{ seq: number; name: string; expected: number; actual: number }> = [];
// ข้อตรวจเนื้อหา Response (ใช้ในชุด 01c1) — ข้อความต้องไม่มีค่าลับ
const checkFailures: Array<{ seq: number; check: string }> = [];
function check(desc: string, ok: boolean) {
  if (!ok) checkFailures.push({ seq, check: desc });
  console.log(`     ${ok ? "check ok" : "CHECK FAIL"}: ${desc}`);
}
let seq = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
}

async function step(
  name: string,
  route: string,
  actor: Actor,
  urlPath: string,
  body: unknown,
  expect: number,
): Promise<Res> {
  seq++;
  const method = route.split(" ")[0];
  const headers: Record<string, string> = {};
  if (actor === "bogus") headers.Authorization = "Bearer not.a.valid-token";
  else if (actor !== "anon" && tokens[actor]) headers.Authorization = `Bearer ${tokens[actor]}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  // ID แบบ <prefix>-<Date.now()> ของ Server บางตัวไม่กันชน — เว้นระยะเล็กน้อยระหว่าง Request
  await sleep(3);

  let res: Res;
  try {
    const r = await fetch(BASE_URL + urlPath, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await r.text();
    if (text === "") res = { status: r.status, kind: "empty", body: null };
    else {
      try {
        res = { status: r.status, kind: "json", body: JSON.parse(text) };
      } catch {
        res = { status: r.status, kind: "text", body: text.slice(0, 4000) };
      }
    }
  } catch (e: any) {
    // ข้อความ Error ของ fetch ไม่มีค่าลับ
    res = { status: -1, kind: "text", body: `FETCH_FAILED: ${e?.name || "Error"}` };
  }

  const rec: RecordFile = {
    seq,
    name,
    route,
    actor,
    method,
    path: norm.value(urlPath),
    requestBody: body === undefined ? null : norm.value(body),
    status: res.status,
    responseKind: res.kind,
    responseBody: norm.value(res.body),
  };
  const file = path.join(OUT_DIR, `${String(seq).padStart(3, "0")}_${slug(name)}.json`);
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + "\n", "utf-8");

  routeCounts.set(route, (routeCounts.get(route) || 0) + 1);
  const ok = res.status === expect;
  if (!ok) unexpected.push({ seq, name, expected: expect, actual: res.status });
  console.log(`${ok ? "  ok" : "  !!"} ${String(seq).padStart(3, "0")} ${res.status} ${route}  [${actor}] ${name}${ok ? "" : `  (คาด ${expect})`}`);
  return res;
}

const idOf = (r: Res): string =>
  r.body && typeof r.body.id === "string" ? r.body.id : "MISSING-ID";

async function login(actor: Actor, name: string, employeeId: string, password: string, expect: number) {
  const r = await step(name, "POST /api/login", "anon", "/api/login", { employeeId, password }, expect);
  if (r.status === 200 && typeof r.body?.token === "string") tokens[actor] = r.body.token;
  return r;
}

// ---------------------------------------------------------------------------
// สถานการณ์
// ---------------------------------------------------------------------------

const EMP = { editor: "HRN-EDITOR01", viewer: "HRN-VIEWER01", temp: "HRN-TEMP01" };
const NOPE = {
  user: "usr-0000000000000",
  doc: "doc-0000000000000",
  course: "c-0000000000000",
  expert: "exp-0000000000000",
  kb: "kb-0000000000000",
  cr: "cr-0000000000000",
  qs: "qs-00000000-0000-4000-8000-000000000000",
  ts: "ts-00000000-0000-4000-8000-000000000000",
  upload: "/uploads/00000000-0000-4000-8000-000000000000.pdf",
  uploadMedia: "/uploads/00000000-0000-4000-8000-000000000001.mp4",
};

async function scenario() {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const H = 3600_000;

  // --- 0. ไม่มี Token / Token ผิด ---
  await step("auth.noToken", "GET /api/users", "anon", "/api/users", undefined, 401);
  await step("auth.invalidToken", "GET /api/users", "bogus", "/api/users", undefined, 401);

  // --- 1. login / register ---
  await step("login.missingFields", "POST /api/login", "anon", "/api/login", {}, 400);
  await step("login.unknownEmployee", "POST /api/login", "anon", "/api/login", { employeeId: "HRN-NOBODY", password: "x" }, 401);
  await step("login.admin.wrongPassword", "POST /api/login", "anon", "/api/login", { employeeId: ADMIN_ID, password: PW.wrong }, 401);
  const adminLogin = await login("admin", "login.admin", ADMIN_ID, ADMIN_PASSWORD, 200);
  if (adminLogin.status !== 200) throw new Error("ABORT: Admin login ไม่สำเร็จ — ตรวจ HARNESS_ADMIN_ID / HARNESS_ADMIN_PASSWORD");
  const adminId: string = adminLogin.body?.user?.id || "MISSING-ID";
  await step("register.disabled", "POST /api/register", "anon", "/api/register", { employeeId: "HRN-SELF", password: "x" }, 403);
  for (let i = 1; i <= 5; i++) {
    await step(`login.rateLimit.fail${i}`, "POST /api/login", "anon", "/api/login", { employeeId: "HRN-LOCK", password: "x" }, 401);
  }
  await step("login.rateLimit.locked", "POST /api/login", "anon", "/api/login", { employeeId: "HRN-LOCK", password: "x" }, 429);

  // --- 2. users ---
  const initialUsers = await step("users.list.initial", "GET /api/users", "admin", "/api/users", undefined, 200);
  if (!Array.isArray(initialUsers.body) || initialUsers.body.length !== 1) {
    throw new Error("ABORT: Server ไม่อยู่ในสถานะเริ่มต้นสะอาด (ผู้ใช้ไม่ใช่ 1 คน) — รีสตาร์ท Server แล้วรันใหม่ด้วยชื่อรอบใหม่");
  }
  const mkUser = (emp: string, name: string, role: string, departmentId: string, position: string, password: string) => ({
    name,
    employeeId: emp,
    departmentId,
    position,
    role,
    email: `${emp.toLowerCase()}@example.invalid`,
    phone: "000-000-0000",
    status: "Active",
    startDate: "2026-01-15",
    password,
  });
  const editorRes = await step("users.create.editor", "POST /api/users", "admin", "/api/users",
    mkUser(EMP.editor, "Harness Editor", "Editor", "d-pd", "ผู้จัดการฝ่ายผลิต", PW.editor), 200);
  const viewerRes = await step("users.create.viewer", "POST /api/users", "admin", "/api/users",
    mkUser(EMP.viewer, "Harness Viewer", "Viewer", "d-pd-dl", "ช่าง", PW.viewer), 200);
  const tempRes = await step("users.create.temp", "POST /api/users", "admin", "/api/users",
    mkUser(EMP.temp, "Harness Temp", "Viewer", "d-hr", "เจ้าหน้าที่ธุรการ", PW.temp), 200);
  const editorId = idOf(editorRes);
  const viewerId = idOf(viewerRes);
  const tempId = idOf(tempRes);
  await login("editor", "login.editor", EMP.editor, PW.editor, 200);
  await login("viewer", "login.viewer", EMP.viewer, PW.viewer, 200);
  await login("temp", "login.temp", EMP.temp, PW.temp, 200);
  await step("users.create.byEditor", "POST /api/users", "editor", "/api/users", mkUser("HRN-X1", "X", "Viewer", "d-hr", "x", "x"), 403);
  await step("users.create.byViewer", "POST /api/users", "viewer", "/api/users", mkUser("HRN-X2", "X", "Viewer", "d-hr", "x", "x"), 403);
  await step("users.list.admin", "GET /api/users", "admin", "/api/users", undefined, 200);
  await step("users.list.editor", "GET /api/users", "editor", "/api/users", undefined, 200);
  await step("users.list.viewer", "GET /api/users", "viewer", "/api/users", undefined, 200);
  await step("users.update.viewer", "PUT /api/users/:id", "admin", `/api/users/${viewerId}`, { position: "หัวหน้าทีม", phone: "011-111-1111" }, 200);
  await step("users.update.notFound", "PUT /api/users/:id", "admin", `/api/users/${NOPE.user}`, { position: "x" }, 200);
  await step("users.update.byEditor", "PUT /api/users/:id", "editor", `/api/users/${viewerId}`, { position: "x" }, 403);
  await step("users.suspend.temp", "PUT /api/users/:id", "admin", `/api/users/${tempId}`, { status: "Suspended" }, 200);
  await step("auth.suspendedToken", "GET /api/users", "temp", "/api/users", undefined, 403);
  await step("login.temp.suspended", "POST /api/login", "anon", "/api/login", { employeeId: EMP.temp, password: PW.temp }, 403);
  await step("users.terminate.temp", "PUT /api/users/:id", "admin", `/api/users/${tempId}`, { status: "Terminated" }, 200);
  await step("login.temp.terminated", "POST /api/login", "anon", "/api/login", { employeeId: EMP.temp, password: PW.temp }, 403);
  await step("auth.terminatedToken", "GET /api/users", "temp", "/api/users", undefined, 403);
  await step("users.delete.byViewer", "DELETE /api/users/:id", "viewer", `/api/users/${tempId}`, undefined, 403);

  // --- 3. employee_master ---
  const em = (employeeId: string, name: string, departmentId: string) => ({
    employeeId, name, departmentId, position: "ช่าง", startDate: "2020-05-01", level: "O1",
    email: `${employeeId.toLowerCase()}@example.invalid`, phone: "000-000-0000", status: "Imported",
    isDeptResolved: true,
  });
  await step("employeeMaster.list.empty", "GET /api/employee_master", "admin", "/api/employee_master", undefined, 200);
  await step("employeeMaster.list.byViewer", "GET /api/employee_master", "viewer", "/api/employee_master", undefined, 403);
  await step("employeeMaster.replace.admin", "POST /api/employee_master", "admin", "/api/employee_master",
    { employeeMaster: [em("HRN-E001", "พนักงาน หนึ่ง", "d-pd-dl"), em("HRN-E002", "พนักงาน สอง", "d-unknown")] }, 200);
  await step("employeeMaster.merge.editor", "POST /api/employee_master", "editor", "/api/employee_master",
    { employeeMaster: [em("HRN-E002", "พนักงาน สอง (แก้)", "d-wh"), em("HRN-E003", "พนักงาน สาม", "d-qa")] }, 200);
  await step("employeeMaster.invalidPayload", "POST /api/employee_master", "admin", "/api/employee_master", { employeeMaster: "x" }, 400);
  await step("employeeMaster.post.byViewer", "POST /api/employee_master", "viewer", "/api/employee_master", { employeeMaster: [] }, 403);
  await step("employeeMaster.list.editor", "GET /api/employee_master", "editor", "/api/employee_master", undefined, 200);

  // --- 4. documents ---
  const doc = (title: string, departmentId: string, extra: Record<string, unknown> = {}) => ({
    title,
    description: `${title} — คำอธิบาย`,
    type: "WI",
    departmentId,
    owner: "Harness",
    fileType: "PDF",
    revision: 1,
    tags: ["harness"],
    createdAt: iso(now),
    ...extra,
  });
  const docA = idOf(await step("documents.create.admin.hr", "POST /api/documents", "admin", "/api/documents", doc("HRN เอกสาร HR ภายใน", "d-hr", { allowedDepartmentIds: [] }), 200));
  const docB = idOf(await step("documents.create.admin.dl", "POST /api/documents", "admin", "/api/documents", doc("HRN Laminator Setup WI", "d-pd-dl"), 200));
  const docQP = idOf(await step("documents.create.admin.qp", "POST /api/documents", "admin", "/api/documents",
    doc("HRN QP Procedure", "d-pd-dl", { type: "QP", parsedExcelSheets: [{ name: "Sheet1", rows: [["a", "b"], ["1", "2"]] }] }), 200));
  const docE = idOf(await step("documents.create.admin.shared", "POST /api/documents", "admin", "/api/documents",
    doc("HRN Shared Safety Notice", "d-hr", { allowedDepartmentIds: ["d-pd-dl"] }), 200));
  await step("documents.create.invalidDept", "POST /api/documents", "admin", "/api/documents", doc("HRN bad", "d-nope"), 400);
  await step("documents.create.invalidAllowed", "POST /api/documents", "admin", "/api/documents", doc("HRN bad", "d-hr", { allowedDepartmentIds: ["d-nope"] }), 400);
  await step("documents.create.allowedNotArray", "POST /api/documents", "admin", "/api/documents", doc("HRN bad", "d-hr", { allowedDepartmentIds: "d-hr" }), 400);
  await step("documents.create.fileNotFound", "POST /api/documents", "admin", "/api/documents", doc("HRN bad file", "d-hr", { fileUrl: NOPE.upload }), 404);
  const docC = idOf(await step("documents.create.editor", "POST /api/documents", "editor", "/api/documents", doc("HRN Editor Draft", "d-hr"), 200));
  await step("documents.create.editor.invalidAllowed", "POST /api/documents", "editor", "/api/documents", doc("HRN bad", "d-pd", { allowedDepartmentIds: ["d-nope"] }), 400);
  await step("documents.create.byViewer", "POST /api/documents", "viewer", "/api/documents", doc("HRN viewer", "d-pd-dl"), 403);
  await step("documents.list.admin", "GET /api/documents", "admin", "/api/documents", undefined, 200);
  await step("documents.list.editor", "GET /api/documents", "editor", "/api/documents", undefined, 200);
  await step("documents.list.viewer", "GET /api/documents", "viewer", "/api/documents", undefined, 200);
  await step("documents.stats.admin", "GET /api/documents/stats", "admin", "/api/documents/stats", undefined, 200);
  await step("documents.stats.viewer", "GET /api/documents/stats", "viewer", "/api/documents/stats", undefined, 200);
  await step("documents.update.editor.own", "PUT /api/documents/:id", "editor", `/api/documents/${docC}`,
    { title: "HRN Editor Draft (แก้)", status: "Published", tags: ["harness", "edited"] }, 200);
  await step("documents.update.editor.crossDept", "PUT /api/documents/:id", "editor", `/api/documents/${docA}`, { title: "x" }, 403);
  await step("documents.update.notFound", "PUT /api/documents/:id", "editor", `/api/documents/${NOPE.doc}`, { title: "x" }, 404);
  await step("documents.update.byViewer", "PUT /api/documents/:id", "viewer", `/api/documents/${docB}`, { title: "x" }, 403);
  await step("documents.update.admin.invalidDept", "PUT /api/documents/:id", "admin", `/api/documents/${docB}`, { departmentId: "d-nope" }, 400);
  await step("documents.update.admin.invalidAllowed", "PUT /api/documents/:id", "admin", `/api/documents/${docB}`, { allowedDepartmentIds: ["d-nope"] }, 400);
  await step("documents.update.admin", "PUT /api/documents/:id", "admin", `/api/documents/${docB}`,
    { revision: 2, tags: ["harness", "rev2"], description: "HRN Laminator Setup WI — Rev.2", approvedBy: "FORGED" }, 200);
  await step("documents.approve.byEditor", "POST /api/documents/:id/approve", "editor", `/api/documents/${docC}/approve`, undefined, 403);
  await step("documents.approve.admin", "POST /api/documents/:id/approve", "admin", `/api/documents/${docC}/approve`, { approverName: "FORGED" }, 200);
  await step("documents.approve.notFound", "POST /api/documents/:id/approve", "admin", `/api/documents/${NOPE.doc}/approve`, undefined, 200);
  await step("documents.view.viewer.sameDept", "POST /api/documents/:id/view", "viewer", `/api/documents/${docB}/view`, undefined, 200);
  await step("documents.view.editor.mainToSub", "POST /api/documents/:id/view", "editor", `/api/documents/${docB}/view`, undefined, 200);
  await step("documents.view.viewer.crossDept", "POST /api/documents/:id/view", "viewer", `/api/documents/${docA}/view`, undefined, 403);
  await step("documents.view.viewer.allowedList", "POST /api/documents/:id/view", "viewer", `/api/documents/${docE}/view`, undefined, 200);
  await step("documents.view.viewer.subToMain", "POST /api/documents/:id/view", "viewer", `/api/documents/${docC}/view`, undefined, 403);
  await step("documents.view.viewer.qp", "POST /api/documents/:id/view", "viewer", `/api/documents/${docQP}/view`, undefined, 200);
  await step("documents.view.admin.qp", "POST /api/documents/:id/view", "admin", `/api/documents/${docQP}/view`, undefined, 200);
  await step("documents.view.notFound", "POST /api/documents/:id/view", "viewer", `/api/documents/${NOPE.doc}/view`, undefined, 404);
  await step("documents.download.viewer", "POST /api/documents/:id/download", "viewer", `/api/documents/${docB}/download`, undefined, 200);
  await step("documents.download.viewer.crossDept", "POST /api/documents/:id/download", "viewer", `/api/documents/${docA}/download`, undefined, 403);
  await step("documents.download.viewer.qp", "POST /api/documents/:id/download", "viewer", `/api/documents/${docQP}/download`, undefined, 403);
  await step("documents.download.admin.qp", "POST /api/documents/:id/download", "admin", `/api/documents/${docQP}/download`, undefined, 200);
  await step("documents.download.notFound", "POST /api/documents/:id/download", "viewer", `/api/documents/${NOPE.doc}/download`, undefined, 404);
  await step("documents.list.viewer.after", "GET /api/documents", "viewer", "/api/documents", undefined, 200);
  await step("documents.list.editor.after", "GET /api/documents", "editor", "/api/documents", undefined, 200);
  await step("documents.stats.admin.after", "GET /api/documents/stats", "admin", "/api/documents/stats", undefined, 200);

  // --- 5. kb_articles ---
  const kb = (title: string, type: string, extra: Record<string, unknown> = {}) => ({
    title, type,
    problem: `${title} — ปัญหา`,
    solution: `${title} — วิธีแก้`,
    cause: "สาเหตุตัวอย่าง",
    tags: ["film", "harness"],
    relatedWIs: ["WI-HRN-001"],
    status: "Approved", // Server ต้องไม่เชื่อ
    id: "kb-forged",
    ...extra,
  });
  const kbViewer = idOf(await step("kb.create.viewer", "POST /api/kb_articles", "viewer", "/api/kb_articles", kb("HRN วิธีแก้ฟิล์มย่น", "Troubleshooting"), 200));
  const kbEditor = idOf(await step("kb.create.editor", "POST /api/kb_articles", "editor", "/api/kb_articles", kb("HRN Best Practice เครื่องพิมพ์", "Best Practice", { prevention: "ตรวจทุกกะ" }), 200));
  const kbAdmin = idOf(await step("kb.create.admin", "POST /api/kb_articles", "admin", "/api/kb_articles", kb("HRN Kaizen ลดของเสีย", "Kaizen"), 200));
  await step("kb.create.missingTitle", "POST /api/kb_articles", "viewer", "/api/kb_articles", kb("", "FAQ"), 400);
  await step("kb.create.badType", "POST /api/kb_articles", "viewer", "/api/kb_articles", kb("HRN bad", "Other"), 400);
  await step("kb.create.tagsNotArray", "POST /api/kb_articles", "viewer", "/api/kb_articles", kb("HRN bad", "FAQ", { tags: "x" }), 400);
  await step("kb.create.causeWrongType", "POST /api/kb_articles", "viewer", "/api/kb_articles", kb("HRN bad", "FAQ", { cause: 5 }), 400);
  await step("kb.list.viewer", "GET /api/kb_articles", "viewer", "/api/kb_articles", undefined, 200);
  await step("kb.list.admin", "GET /api/kb_articles", "admin", "/api/kb_articles", undefined, 200);
  await step("kb.approve.byEditor", "POST /api/kb_articles/:id/approve", "editor", `/api/kb_articles/${kbViewer}/approve`, undefined, 403);
  await step("kb.approve.admin", "POST /api/kb_articles/:id/approve", "admin", `/api/kb_articles/${kbViewer}/approve`, undefined, 200);
  await step("kb.like.viewer", "POST /api/kb_articles/:id/like", "viewer", `/api/kb_articles/${kbViewer}/like`, undefined, 200);
  await step("kb.like.notFound", "POST /api/kb_articles/:id/like", "viewer", `/api/kb_articles/${NOPE.kb}/like`, undefined, 200);
  const kbAdminBody = { ...kb("HRN Kaizen ลดของเสีย (แก้)", "Kaizen"), id: kbAdmin, status: "Approved", views: 0, likes: 0 };
  await step("kb.update.admin", "PUT /api/kb_articles/:id", "admin", `/api/kb_articles/${kbAdmin}`, kbAdminBody, 200);
  await step("kb.update.byEditor", "PUT /api/kb_articles/:id", "editor", `/api/kb_articles/${kbAdmin}`, kbAdminBody, 403);
  await step("kb.list.viewer.after", "GET /api/kb_articles", "viewer", "/api/kb_articles", undefined, 200);

  // --- 6. experts ---
  const expertBody = {
    name: "HRN Expert", position: "Engineer", departmentId: "d-en", skills: ["Laminator", "Kaizen"],
    experienceYears: 10, phone: "000-000-0000", email: "hrn.expert@example.invalid", availability: "Available",
  };
  await step("experts.list.viewer.empty", "GET /api/experts", "viewer", "/api/experts", undefined, 200);
  const expertId = idOf(await step("experts.create.admin", "POST /api/experts", "admin", "/api/experts", expertBody, 200));
  await step("experts.create.byEditor", "POST /api/experts", "editor", "/api/experts", expertBody, 403);
  await step("experts.update.admin", "PUT /api/experts/:id", "admin", `/api/experts/${expertId}`, { ...expertBody, id: expertId, availability: "Busy" }, 200);
  await step("experts.update.byViewer", "PUT /api/experts/:id", "viewer", `/api/experts/${expertId}`, { ...expertBody, id: expertId }, 403);
  await step("experts.list.viewer", "GET /api/experts", "viewer", "/api/experts", undefined, 200);

  // --- 7. contact_requests ---
  const cr = (userId: string | undefined, extra: Record<string, unknown> = {}) => ({
    ...(userId === undefined ? {} : { userId }),
    expertId: expertId,
    topic: "HRN สอบถามการตั้งค่าเครื่อง",
    message: "รายละเอียดคำถามจาก Harness",
    status: "Replied", // Server ต้องไม่เชื่อ
    ...extra,
  });
  const crViewer = idOf(await step("contact.create.viewer", "POST /api/contact_requests", "viewer", "/api/contact_requests", cr(viewerId), 200));
  await step("contact.create.viewer.otherUser", "POST /api/contact_requests", "viewer", "/api/contact_requests", cr(editorId), 403);
  await step("contact.create.viewer.noUserId", "POST /api/contact_requests", "viewer", "/api/contact_requests", cr(undefined), 403);
  await step("contact.create.missingTopic", "POST /api/contact_requests", "viewer", "/api/contact_requests", cr(viewerId, { topic: "" }), 400);
  await step("contact.create.expertNotFound", "POST /api/contact_requests", "viewer", "/api/contact_requests", cr(viewerId, { expertId: NOPE.expert }), 404);
  await step("contact.create.editor", "POST /api/contact_requests", "editor", "/api/contact_requests", cr(editorId, { topic: "HRN คำถามจาก Editor" }), 200);
  await step("contact.list.viewer", "GET /api/contact_requests", "viewer", "/api/contact_requests", undefined, 200);
  await step("contact.list.editor", "GET /api/contact_requests", "editor", "/api/contact_requests", undefined, 200);
  await step("contact.reply.editor", "POST /api/contact_requests/:id/reply", "editor", `/api/contact_requests/${crViewer}/reply`, { replyMessage: "คำตอบจาก Harness" }, 200);
  await step("contact.reply.byViewer", "POST /api/contact_requests/:id/reply", "viewer", `/api/contact_requests/${crViewer}/reply`, { replyMessage: "x" }, 403);
  await step("contact.reply.notFound", "POST /api/contact_requests/:id/reply", "editor", `/api/contact_requests/${NOPE.cr}/reply`, { replyMessage: "x" }, 200);

  // --- 8. custom_resources ---
  const resourceBody = { title: "HRN Resource", content: "เนื้อหาอ้างอิงสำหรับ AI", sourceType: "Text", addedBy: "Harness", createdAt: iso(now) };
  await step("customResources.list.viewer.empty", "GET /api/custom_resources", "viewer", "/api/custom_resources", undefined, 200);
  const resourceId = idOf(await step("customResources.create.admin", "POST /api/custom_resources", "admin", "/api/custom_resources", resourceBody, 200));
  await step("customResources.create.byEditor", "POST /api/custom_resources", "editor", "/api/custom_resources", resourceBody, 403);
  await step("customResources.list.viewer", "GET /api/custom_resources", "viewer", "/api/custom_resources", undefined, 200);

  // --- 9. ratings ---
  const rating = (userId: string, docOrKBId: string, extra: Record<string, unknown> = {}) => ({
    userId, docOrKBId, rating: 4, comment: "HRN ความเห็น", id: "r-forged", userName: "forged", ...extra,
  });
  await step("ratings.create.viewer.doc", "POST /api/ratings", "viewer", "/api/ratings", rating(viewerId, docB), 200);
  await step("ratings.create.viewer.kbApproved", "POST /api/ratings", "viewer", "/api/ratings", rating(viewerId, kbAdmin, { rating: 5 }), 200);
  await step("ratings.create.viewer.kbPending", "POST /api/ratings", "viewer", "/api/ratings", rating(viewerId, kbEditor), 403);
  await step("ratings.create.viewer.docCrossDept", "POST /api/ratings", "viewer", "/api/ratings", rating(viewerId, docA), 403);
  await step("ratings.create.viewer.notFound", "POST /api/ratings", "viewer", "/api/ratings", rating(viewerId, NOPE.doc), 404);
  await step("ratings.create.viewer.badRating", "POST /api/ratings", "viewer", "/api/ratings", rating(viewerId, docB, { rating: 6 }), 400);
  await step("ratings.create.viewer.emptyComment", "POST /api/ratings", "viewer", "/api/ratings", rating(viewerId, docB, { comment: "  " }), 400);
  await step("ratings.create.viewer.otherUser", "POST /api/ratings", "viewer", "/api/ratings", rating(editorId, docB), 403);
  await step("ratings.create.admin.doc", "POST /api/ratings", "admin", "/api/ratings", rating(adminId, docA, { rating: 3 }), 200);
  await step("ratings.create.editor.doc", "POST /api/ratings", "editor", "/api/ratings", rating(editorId, docC, { rating: 2 }), 200);
  await step("ratings.list.viewer", "GET /api/ratings", "viewer", "/api/ratings", undefined, 200);
  await step("ratings.list.editor", "GET /api/ratings", "editor", "/api/ratings", undefined, 200);
  await step("ratings.list.admin", "GET /api/ratings", "admin", "/api/ratings", undefined, 200);

  // --- 10. search_logs ---
  const GAP_KEYWORD = "ไม่มีผลลัพธ์ HRN-GAP";
  await step("searchLogs.create.viewer.docHit", "POST /api/search_logs", "viewer", "/api/search_logs", { keyword: "Laminator", hasResult: false }, 200);
  await step("searchLogs.create.viewer.gap", "POST /api/search_logs", "viewer", "/api/search_logs", { keyword: GAP_KEYWORD, hasResult: true }, 200);
  await step("searchLogs.create.viewer.kbHit", "POST /api/search_logs", "viewer", "/api/search_logs", { keyword: "kaizen" }, 200);
  await step("searchLogs.create.editor.gap", "POST /api/search_logs", "editor", "/api/search_logs", { keyword: "HRN-GAP-2" }, 200);
  await step("searchLogs.create.empty", "POST /api/search_logs", "viewer", "/api/search_logs", { keyword: "   " }, 400);
  await step("searchLogs.create.wrongType", "POST /api/search_logs", "viewer", "/api/search_logs", { keyword: 5 }, 400);
  await step("searchLogs.list.admin", "GET /api/search_logs", "admin", "/api/search_logs", undefined, 200);
  await step("searchLogs.list.byViewer", "GET /api/search_logs", "viewer", "/api/search_logs", undefined, 403);

  // --- 11. search_resolutions ---
  await step("searchResolutions.list.admin.empty", "GET /api/search_resolutions", "admin", "/api/search_resolutions", undefined, 200);
  await step("searchResolutions.list.byEditor", "GET /api/search_resolutions", "editor", "/api/search_resolutions", undefined, 403);
  await step("searchResolutions.create.admin", "POST /api/search_resolutions", "admin", "/api/search_resolutions",
    { keyword: GAP_KEYWORD, action: "เขียนบทความ KB ใหม่", assignedTo: "HRN Expert", resolvedBy: "FORGED" }, 200);
  await step("searchResolutions.create.duplicate", "POST /api/search_resolutions", "admin", "/api/search_resolutions",
    { keyword: GAP_KEYWORD, action: "ซ้ำ" }, 409);
  await step("searchResolutions.create.notAGap", "POST /api/search_resolutions", "admin", "/api/search_resolutions",
    { keyword: "Laminator", action: "x" }, 404);
  await step("searchResolutions.create.missingAction", "POST /api/search_resolutions", "admin", "/api/search_resolutions",
    { keyword: "HRN-GAP-2", action: "  " }, 400);
  await step("searchResolutions.create.missingKeyword", "POST /api/search_resolutions", "admin", "/api/search_resolutions",
    { action: "x" }, 400);
  await step("searchResolutions.create.byEditor", "POST /api/search_resolutions", "editor", "/api/search_resolutions",
    { keyword: "HRN-GAP-2", action: "x" }, 403);
  await step("searchResolutions.list.admin", "GET /api/search_resolutions", "admin", "/api/search_resolutions", undefined, 200);

  // --- 12. courses ---
  const MATCH_KEY = JSON.stringify({ L1: "R1", L2: "R2", L3: "R3" });
  const course = (title: string, quiz: unknown[], extra: Record<string, unknown> = {}) => ({
    title,
    description: `${title} — คำอธิบาย`,
    type: "General",
    targetPositions: ["ช่าง"],
    lessons: [{ id: "l1", title: "บทที่ 1", content: "เนื้อหา", durationMinutes: 10, mediaType: "Video", mediaUrl: "https://example.com/hrn.mp4" }],
    quiz,
    minPassScore: 60,
    durationHours: "0.5",
    durationMinutes: 30,
    tags: ["harness"],
    isApproved: true, // Server ต้องไม่เชื่อ (POST)
    ...extra,
  });
  const quiz1 = [
    { id: "q1", question: "ข้อใดถูก", type: "SingleChoice", options: ["A", "B", "C"], correctAnswer: "B" },
    { id: "q2", question: "จริงหรือไม่", type: "TrueFalse", options: ["True", "False"], correctAnswer: "True" },
    { id: "q3", question: "จับคู่", type: "Matching", pairs: [{ left: "L1", right: "R1" }, { left: "L2", right: "R2" }, { left: "L3", right: "R3" }], correctAnswer: MATCH_KEY },
  ];
  const quiz2 = [
    { id: "s1", question: "ใช่หรือไม่", type: "SingleChoice", options: ["ใช่", "ไม่ใช่"], correctAnswer: "ใช่" },
    { id: "e1", question: "อธิบาย", type: "Essay", correctAnswer: "" },
  ];
  const quiz3 = [{ id: "x1", question: "เลือก", type: "SingleChoice", options: ["1", "2"], correctAnswer: "2" }];
  const quiz5 = [{ id: "e1", question: "เรียงความ", type: "Essay", correctAnswer: "" }];
  const course1Res = await step("courses.create.admin.objective", "POST /api/courses", "admin", "/api/courses", course("HRN หลักสูตรความปลอดภัย", quiz1), 200);
  const course1 = idOf(course1Res);
  const course2 = idOf(await step("courses.create.admin.essay", "POST /api/courses", "admin", "/api/courses", course("HRN หลักสูตรมีข้อเขียน", quiz2, { minPassScore: 50, type: "Onboarding" }), 200));
  const course3Body = course("HRN หลักสูตรของ Editor", quiz3, { durationMinutes: 15 });
  const course3Res = await step("courses.create.editor", "POST /api/courses", "editor", "/api/courses", course3Body, 200);
  const course3 = idOf(course3Res);
  const course4 = idOf(await step("courses.create.admin.noQuiz", "POST /api/courses", "admin", "/api/courses", course("HRN หลักสูตรไม่มีข้อสอบ", []), 200));
  const course5 = idOf(await step("courses.create.admin.essayOnly", "POST /api/courses", "admin", "/api/courses", course("HRN หลักสูตรเรียงความ", quiz5, { minPassScore: 50 }), 200));
  await step("courses.create.fixedId", "POST /api/courses", "admin", "/api/courses", course("HRN หลักสูตร Fixed ID", quiz3, { id: "HRN_FIXED_01" }), 200);
  await step("courses.create.duplicateId", "POST /api/courses", "admin", "/api/courses", course("HRN ซ้ำ", quiz3, { id: "HRN_FIXED_01" }), 409);
  await step("courses.create.invalidId", "POST /api/courses", "admin", "/api/courses", course("HRN bad", quiz3, { id: "bad id!" }), 400);
  await step("courses.create.arrayBody", "POST /api/courses", "admin", "/api/courses", [], 400);
  await step("courses.create.badMediaScheme", "POST /api/courses", "admin", "/api/courses",
    course("HRN bad media", quiz3, { lessons: [{ id: "l1", title: "x", content: "x", durationMinutes: 1, mediaUrl: "javascript:alert(1)" }] }), 400);
  await step("courses.create.lessonsNotArray", "POST /api/courses", "admin", "/api/courses", course("HRN bad lessons", quiz3, { lessons: "x" }), 400);
  await step("courses.create.mediaFileNotFound", "POST /api/courses", "admin", "/api/courses",
    course("HRN missing media", quiz3, { lessons: [{ id: "l1", title: "x", content: "x", durationMinutes: 1, mediaUrl: NOPE.uploadMedia }] }), 404);
  await step("courses.create.byViewer", "POST /api/courses", "viewer", "/api/courses", course("HRN viewer", quiz3), 403);
  await step("courses.list.viewer", "GET /api/courses", "viewer", "/api/courses", undefined, 200);
  await step("courses.list.editor", "GET /api/courses", "editor", "/api/courses", undefined, 200);
  const course3Full = { ...course3Body, id: course3, createdByRole: "Editor", isApproved: true, title: "HRN หลักสูตรของ Editor (แก้)" };
  await step("courses.update.editor", "PUT /api/courses/:id", "editor", `/api/courses/${course3}`, course3Full, 200);
  await step("courses.update.notFound", "PUT /api/courses/:id", "editor", `/api/courses/${NOPE.course}`, course3Full, 404);
  await step("courses.update.byViewer", "PUT /api/courses/:id", "viewer", `/api/courses/${course3}`, course3Full, 403);
  await step("courses.update.badMedia", "PUT /api/courses/:id", "editor", `/api/courses/${course3}`,
    { ...course3Full, lessons: [{ id: "l1", title: "x", content: "x", durationMinutes: 1, mediaUrl: "ftp://x" }] }, 400);

  // --- 13. submit-quiz ---
  await step("quiz.submit.notApproved", "POST /api/courses/:id/submit-quiz", "viewer", `/api/courses/${course3}/submit-quiz`, { answers: { x1: "2" } }, 403);
  await step("courses.update.admin.approve", "PUT /api/courses/:id", "admin", `/api/courses/${course3}`, { ...course3Full, isApproved: true }, 200);
  await step("quiz.submit.courseNotFound", "POST /api/courses/:id/submit-quiz", "viewer", `/api/courses/${NOPE.course}/submit-quiz`, { answers: {} }, 404);
  await step("quiz.submit.noQuiz", "POST /api/courses/:id/submit-quiz", "viewer", `/api/courses/${course4}/submit-quiz`, { answers: {} }, 400);
  await step("quiz.submit.invalidAnswers", "POST /api/courses/:id/submit-quiz", "viewer", `/api/courses/${course1}/submit-quiz`, { answers: "abc" }, 400);
  await step("quiz.submit.viewer.perfect", "POST /api/courses/:id/submit-quiz", "viewer", `/api/courses/${course1}/submit-quiz`,
    { answers: { q1: "B", q2: "True", q3: MATCH_KEY }, score: 0 }, 200);
  await step("quiz.submit.viewer.fail", "POST /api/courses/:id/submit-quiz", "viewer", `/api/courses/${course1}/submit-quiz`,
    { answers: { q1: "B", q2: "False", q3: JSON.stringify({ L1: "R2", L2: "R1", L3: "R3" }) } }, 200);
  await step("quiz.submit.viewer.passAgain", "POST /api/courses/:id/submit-quiz", "viewer", `/api/courses/${course1}/submit-quiz`,
    { answers: { q1: "B", q2: "True", q3: "{}" } }, 200);
  await step("quiz.submit.editor.noAnswers", "POST /api/courses/:id/submit-quiz", "editor", `/api/courses/${course1}/submit-quiz`, {}, 200);
  await step("quiz.submit.editor.course3", "POST /api/courses/:id/submit-quiz", "editor", `/api/courses/${course3}/submit-quiz`, { answers: { x1: "2" } }, 200);
  const subViewerEssay = await step("quiz.submit.viewer.essay", "POST /api/courses/:id/submit-quiz", "viewer", `/api/courses/${course2}/submit-quiz`,
    { answers: { s1: "ใช่", e1: "คำตอบเรียงความของผู้เรียน" } }, 200);
  await step("quiz.submit.viewer.alreadyPending", "POST /api/courses/:id/submit-quiz", "viewer", `/api/courses/${course2}/submit-quiz`,
    { answers: { s1: "ใช่", e1: "อีกครั้ง" } }, 409);
  await step("quiz.submit.editor.essayBlank", "POST /api/courses/:id/submit-quiz", "editor", `/api/courses/${course2}/submit-quiz`,
    { answers: { s1: "ใช่", e1: "   " } }, 200);
  const subAdminEssay = await step("quiz.submit.admin.essay", "POST /api/courses/:id/submit-quiz", "admin", `/api/courses/${course2}/submit-quiz`,
    { answers: { s1: "ไม่ใช่", e1: "คำตอบของ Admin" } }, 200);
  const subViewerEssayOnly = await step("quiz.submit.viewer.essayOnly", "POST /api/courses/:id/submit-quiz", "viewer", `/api/courses/${course5}/submit-quiz`,
    { answers: { e1: "เรียงความ" } }, 200);
  const subId = (r: Res) => (r.body && typeof r.body.submissionId === "string" ? r.body.submissionId : "MISSING-ID");
  await step("quizSubmissions.list.viewer", "GET /api/quiz_submissions", "viewer", "/api/quiz_submissions", undefined, 200);
  await step("quizSubmissions.list.editor", "GET /api/quiz_submissions", "editor", "/api/quiz_submissions", undefined, 200);

  // --- 14. grade ---
  const viewerEssaySub = subId(subViewerEssay);
  await step("grade.byViewer", "POST /api/quiz_submissions/:id/grade", "viewer", `/api/quiz_submissions/${viewerEssaySub}/grade`, { grades: [{ questionId: "e1", correct: true }] }, 403);
  await step("grade.notFound", "POST /api/quiz_submissions/:id/grade", "editor", `/api/quiz_submissions/${NOPE.qs}/grade`, { grades: [] }, 404);
  await step("grade.incomplete", "POST /api/quiz_submissions/:id/grade", "editor", `/api/quiz_submissions/${viewerEssaySub}/grade`, { grades: [] }, 400);
  await step("grade.nonBoolean", "POST /api/quiz_submissions/:id/grade", "editor", `/api/quiz_submissions/${viewerEssaySub}/grade`, { grades: [{ questionId: "e1", correct: "yes" }] }, 400);
  await step("grade.selfReview", "POST /api/quiz_submissions/:id/grade", "admin", `/api/quiz_submissions/${subId(subAdminEssay)}/grade`, { grades: [{ questionId: "e1", correct: true }] }, 403);
  await step("grade.editor.viewerEssay", "POST /api/quiz_submissions/:id/grade", "editor", `/api/quiz_submissions/${viewerEssaySub}/grade`,
    { grades: [{ questionId: "e1", correct: true, comment: "  ดีมาก  " }] }, 200);
  await step("grade.alreadyFinalized", "POST /api/quiz_submissions/:id/grade", "editor", `/api/quiz_submissions/${viewerEssaySub}/grade`,
    { grades: [{ questionId: "e1", correct: true }] }, 409);
  await step("grade.editor.adminEssay", "POST /api/quiz_submissions/:id/grade", "editor", `/api/quiz_submissions/${subId(subAdminEssay)}/grade`,
    { grades: [{ questionId: "e1", correct: false }] }, 200);
  await step("quizSubmissions.list.admin", "GET /api/quiz_submissions", "admin", "/api/quiz_submissions", undefined, 200);

  // --- 15. exam_results ---
  await step("examResults.list.viewer", "GET /api/exam_results", "viewer", "/api/exam_results", undefined, 200);
  await step("examResults.list.editor", "GET /api/exam_results", "editor", "/api/exam_results", undefined, 200);
  const manualExam = { employeeName: "Harness Viewer", employeeId: EMP.viewer, courseId: course4, courseTitle: "HRN หลักสูตรไม่มีข้อสอบ", score: 75.5, pass: true, date: "2026-11-01" };
  await step("examResults.create.admin", "POST /api/exam_results", "admin", "/api/exam_results", manualExam, 200);
  await step("examResults.create.byEditor", "POST /api/exam_results", "editor", "/api/exam_results", manualExam, 403);
  await step("examResults.list.viewer.after", "GET /api/exam_results", "viewer", "/api/exam_results", undefined, 200);

  // --- 16. user_progress ---
  await step("progress.list.viewer", "GET /api/user_progress", "viewer", "/api/user_progress", undefined, 200);
  await step("progress.list.admin", "GET /api/user_progress", "admin", "/api/user_progress", undefined, 200);
  await step("progress.start.viewer", "POST /api/user_progress", "viewer", "/api/user_progress",
    { userId: viewerId, courseId: course4, status: "Completed", score: 100 }, 200);
  await step("progress.start.viewer.again", "POST /api/user_progress", "viewer", "/api/user_progress", { userId: viewerId, courseId: course4 }, 200);
  await step("progress.start.viewer.badCourse", "POST /api/user_progress", "viewer", "/api/user_progress", { userId: viewerId, courseId: NOPE.course }, 400);
  await step("progress.start.viewer.otherUser", "POST /api/user_progress", "viewer", "/api/user_progress", { userId: editorId, courseId: course4 }, 403);
  await step("progress.upsert.admin", "POST /api/user_progress", "admin", "/api/user_progress",
    { userId: editorId, courseId: course4, status: "Learning", startDate: "2026-11-01T08:00:00.000Z", attemptsCount: 0, totalStudyMinutes: 5 }, 200);
  await step("progress.list.viewer.after", "GET /api/user_progress", "viewer", "/api/user_progress", undefined, 200);

  // --- 17. user_certificates ---
  await step("certificates.list.viewer", "GET /api/user_certificates", "viewer", "/api/user_certificates", undefined, 200);
  await step("certificates.list.admin", "GET /api/user_certificates", "admin", "/api/user_certificates", undefined, 200);

  // --- 18. km_contribution_logs ---
  await step("kmLogs.list.viewer", "GET /api/km_contribution_logs", "viewer", "/api/km_contribution_logs", undefined, 200);
  await step("kmLogs.list.editor", "GET /api/km_contribution_logs", "editor", "/api/km_contribution_logs", undefined, 200);
  await step("kmLogs.create.admin", "POST /api/km_contribution_logs", "admin", "/api/km_contribution_logs",
    { userId: viewerId, points: 15, activityType: "KB_CONTRIBUTION", description: "HRN ปรับแต้มด้วยมือ" }, 200);
  await step("kmLogs.create.unknownUser", "POST /api/km_contribution_logs", "admin", "/api/km_contribution_logs", { userId: NOPE.user, points: 5 }, 400);
  await step("kmLogs.create.badPoints", "POST /api/km_contribution_logs", "admin", "/api/km_contribution_logs", { userId: viewerId, points: "abc" }, 400);
  await step("kmLogs.create.byEditor", "POST /api/km_contribution_logs", "editor", "/api/km_contribution_logs", { userId: viewerId, points: 5 }, 403);

  // --- 19. leaderboard ---
  await step("leaderboard.viewer", "GET /api/leaderboard", "viewer", "/api/leaderboard", undefined, 200);

  // --- 20. learning/stats ---
  await step("learningStats.viewer", "GET /api/learning/stats", "viewer", "/api/learning/stats", undefined, 200);
  await step("learningStats.editor", "GET /api/learning/stats", "editor", "/api/learning/stats", undefined, 200);
  await step("learningStats.admin", "GET /api/learning/stats", "admin", "/api/learning/stats", undefined, 200);

  // --- 21. user_competencies ---
  await step("competencies.list.viewer", "GET /api/user_competencies", "viewer", "/api/user_competencies", undefined, 200);
  await step("competencies.list.admin", "GET /api/user_competencies", "admin", "/api/user_competencies", undefined, 200);
  await step("competencies.update.badLevel", "PUT /api/user_competencies/:userId/:skillId", "admin", `/api/user_competencies/${viewerId}/skill-1`, { actualLevel: 5 }, 400);
  await step("competencies.update.notFound", "PUT /api/user_competencies/:userId/:skillId", "admin", `/api/user_competencies/${viewerId}/skill-1`, { actualLevel: 2 }, 404);
  await step("competencies.update.byEditor", "PUT /api/user_competencies/:userId/:skillId", "editor", `/api/user_competencies/${viewerId}/skill-1`, { actualLevel: 2 }, 403);

  // --- 22. training_sessions ---
  const session = (name: string, startMs: number, endMs: number, extra: Record<string, unknown> = {}) => ({
    courseId: course1, sessionName: name, location: "ห้องประชุม 1", instructor: "HRN Instructor",
    startsAt: iso(startMs), endsAt: iso(endMs), courseTitle: "FORGED", token: "forged", ...extra,
  });
  const activeRes = await step("training.create.editor.active", "POST /api/training_sessions", "editor", "/api/training_sessions", session("HRN คาบปัจจุบัน", now - H, now + 2 * H), 200);
  const futureRes = await step("training.create.admin.future", "POST /api/training_sessions", "admin", "/api/training_sessions", session("HRN คาบอนาคต", now + 24 * H, now + 26 * H), 200);
  const expiredRes = await step("training.create.admin.expired", "POST /api/training_sessions", "admin", "/api/training_sessions", session("HRN คาบที่ผ่านไปแล้ว", now - 3 * H, now - 2 * H), 200);
  await step("training.create.missingFields", "POST /api/training_sessions", "admin", "/api/training_sessions", { courseId: course1, sessionName: "x" }, 400);
  await step("training.create.badRange", "POST /api/training_sessions", "admin", "/api/training_sessions", session("HRN bad", now + H, now), 400);
  await step("training.create.courseNotFound", "POST /api/training_sessions", "admin", "/api/training_sessions", session("HRN bad", now, now + H, { courseId: NOPE.course }), 400);
  await step("training.create.byViewer", "POST /api/training_sessions", "viewer", "/api/training_sessions", session("HRN viewer", now, now + H), 403);
  await step("training.list.viewer", "GET /api/training_sessions", "viewer", "/api/training_sessions", undefined, 200);
  await step("training.list.editor", "GET /api/training_sessions", "editor", "/api/training_sessions", undefined, 200);
  const tokenOf = (r: Res) => (r.body && typeof r.body.token === "string" ? r.body.token : "missing-token");

  // --- 23. checkin ---
  await step("checkin.viewer", "POST /api/checkin", "viewer", "/api/checkin", { token: tokenOf(activeRes), userId: "forged" }, 200);
  await step("checkin.viewer.again", "POST /api/checkin", "viewer", "/api/checkin", { token: tokenOf(activeRes) }, 200);
  await step("checkin.editor", "POST /api/checkin", "editor", "/api/checkin", { token: tokenOf(activeRes) }, 200);
  await step("checkin.invalidToken", "POST /api/checkin", "viewer", "/api/checkin", { token: "not-a-session-token" }, 404);
  await step("checkin.missingToken", "POST /api/checkin", "viewer", "/api/checkin", {}, 404);
  await step("checkin.notStarted", "POST /api/checkin", "viewer", "/api/checkin", { token: tokenOf(futureRes) }, 403);
  await step("checkin.expired", "POST /api/checkin", "viewer", "/api/checkin", { token: tokenOf(expiredRes) }, 403);

  // --- 24. attendance_logs ---
  await step("attendance.list.viewer", "GET /api/attendance_logs", "viewer", "/api/attendance_logs", undefined, 200);
  await step("attendance.list.admin", "GET /api/attendance_logs", "admin", "/api/attendance_logs", undefined, 200);
  const manualAtt = {
    userId: adminId, userName: "Admin (manual)", employeeId: ADMIN_ID, department: "d-it", position: "ผู้ดูแลระบบ",
    sessionId: idOf(futureRes), sessionName: "HRN คาบอนาคต", courseId: course1, courseTitle: "HRN หลักสูตรความปลอดภัย",
  };
  await step("attendance.create.admin", "POST /api/attendance_logs", "admin", "/api/attendance_logs", manualAtt, 200);
  await step("attendance.create.admin.duplicate", "POST /api/attendance_logs", "admin", "/api/attendance_logs", { ...manualAtt, userName: "dup" }, 200);
  await step("attendance.create.byEditor", "POST /api/attendance_logs", "editor", "/api/attendance_logs", manualAtt, 403);
  await step("attendance.list.admin.beforeClear", "GET /api/attendance_logs", "admin", "/api/attendance_logs", undefined, 200);
  await step("attendance.clear.byEditor", "DELETE /api/attendance_logs", "editor", "/api/attendance_logs", undefined, 403);
  await step("attendance.clear.admin", "DELETE /api/attendance_logs", "admin", "/api/attendance_logs", undefined, 200);
  await step("attendance.list.admin.afterClear", "GET /api/attendance_logs", "admin", "/api/attendance_logs", undefined, 200);

  // --- 25. system_audit_logs ---
  await step("audit.list.admin", "GET /api/system_audit_logs", "admin", "/api/system_audit_logs", undefined, 200);
  await step("audit.list.byEditor", "GET /api/system_audit_logs", "editor", "/api/system_audit_logs", undefined, 403);
  await step("audit.create.viewer.downloadCert", "POST /api/system_audit_logs", "viewer", "/api/system_audit_logs", { action: "DOWNLOAD_CERTIFICATE", details: "forged" }, 200);
  await step("audit.create.viewer.adminAction", "POST /api/system_audit_logs", "viewer", "/api/system_audit_logs", { action: "UPDATE_MEMBER", details: "x" }, 403);
  await step("audit.create.admin.updateMember", "POST /api/system_audit_logs", "admin", "/api/system_audit_logs", { action: "UPDATE_MEMBER", details: "HRN แก้ไขข้อมูลสมาชิก", performedBy: "FORGED" }, 200);
  await step("audit.create.admin.emptyDetails", "POST /api/system_audit_logs", "admin", "/api/system_audit_logs", { action: "APPROVE_MEMBER", details: "  " }, 400);
  await step("audit.create.admin.serverOnlyAction", "POST /api/system_audit_logs", "admin", "/api/system_audit_logs", { action: "GRADE_ESSAY", details: "x" }, 400);
  await step("audit.create.arrayBody", "POST /api/system_audit_logs", "admin", "/api/system_audit_logs", [], 400);
  await step("audit.list.admin.after", "GET /api/system_audit_logs", "admin", "/api/system_audit_logs", undefined, 200);

  // --- 26. DELETE ---
  await step("training.delete.editor.othersSession", "DELETE /api/training_sessions/:id", "editor", `/api/training_sessions/${idOf(futureRes)}`, undefined, 403);
  await step("training.delete.editor.own", "DELETE /api/training_sessions/:id", "editor", `/api/training_sessions/${idOf(activeRes)}`, undefined, 200);
  await step("training.delete.admin", "DELETE /api/training_sessions/:id", "admin", `/api/training_sessions/${idOf(expiredRes)}`, undefined, 200);
  await step("training.delete.notFound", "DELETE /api/training_sessions/:id", "admin", `/api/training_sessions/${NOPE.ts}`, undefined, 404);
  await step("customResources.delete.byViewer", "DELETE /api/custom_resources/:id", "viewer", `/api/custom_resources/${resourceId}`, undefined, 403);
  await step("customResources.delete.admin", "DELETE /api/custom_resources/:id", "admin", `/api/custom_resources/${resourceId}`, undefined, 200);
  await step("experts.delete.byEditor", "DELETE /api/experts/:id", "editor", `/api/experts/${expertId}`, undefined, 403);
  await step("experts.delete.admin", "DELETE /api/experts/:id", "admin", `/api/experts/${expertId}`, undefined, 200);
  await step("kb.delete.byEditor", "DELETE /api/kb_articles/:id", "editor", `/api/kb_articles/${kbEditor}`, undefined, 403);
  await step("kb.delete.admin", "DELETE /api/kb_articles/:id", "admin", `/api/kb_articles/${kbEditor}`, undefined, 200);
  await step("courses.delete.byEditor", "DELETE /api/courses/:id", "editor", `/api/courses/${course5}`, undefined, 403);
  await step("courses.delete.admin", "DELETE /api/courses/:id", "admin", `/api/courses/${course5}`, undefined, 200);
  await step("grade.courseDeleted", "POST /api/quiz_submissions/:id/grade", "editor", `/api/quiz_submissions/${subId(subViewerEssayOnly)}/grade`,
    { grades: [{ questionId: "e1", correct: true }] }, 404);
  await step("courses.delete.notFound", "DELETE /api/courses/:id", "admin", `/api/courses/${NOPE.course}`, undefined, 200);
  await step("documents.delete.byEditor", "DELETE /api/documents/:id", "editor", `/api/documents/${docC}`, undefined, 403);
  await step("documents.delete.admin", "DELETE /api/documents/:id", "admin", `/api/documents/${docC}`, undefined, 200);
  await step("documents.delete.notFound", "DELETE /api/documents/:id", "admin", `/api/documents/${NOPE.doc}`, undefined, 404);
  await step("users.delete.byEditor", "DELETE /api/users/:id", "editor", `/api/users/${tempId}`, undefined, 403);
  await step("users.delete.admin", "DELETE /api/users/:id", "admin", `/api/users/${tempId}`, undefined, 200);
  await step("auth.deletedUserToken", "GET /api/users", "temp", "/api/users", undefined, 401);

  // --- 27. สถานะสุดท้าย (Admin) ---
  const finals: Array<[string, string]> = [
    ["users", "/api/users"], ["employee_master", "/api/employee_master"], ["documents", "/api/documents"],
    ["documents_stats", "/api/documents/stats"], ["kb_articles", "/api/kb_articles"], ["experts", "/api/experts"],
    ["contact_requests", "/api/contact_requests"], ["custom_resources", "/api/custom_resources"], ["ratings", "/api/ratings"],
    ["search_logs", "/api/search_logs"], ["search_resolutions", "/api/search_resolutions"], ["courses", "/api/courses"],
    ["quiz_submissions", "/api/quiz_submissions"], ["exam_results", "/api/exam_results"], ["user_progress", "/api/user_progress"],
    ["user_certificates", "/api/user_certificates"], ["km_contribution_logs", "/api/km_contribution_logs"],
    ["leaderboard", "/api/leaderboard"], ["learning_stats", "/api/learning/stats"], ["user_competencies", "/api/user_competencies"],
    ["training_sessions", "/api/training_sessions"], ["attendance_logs", "/api/attendance_logs"], ["system_audit_logs", "/api/system_audit_logs"],
  ];
  for (const [label, p] of finals) {
    await step(`final.${label}`, `GET ${p}`, "admin", p, undefined, 200);
  }
  // Viewer มองสถานะสุดท้ายบางส่วน (ตัวกรองตามบทบาท)
  await step("final.viewer.courses", "GET /api/courses", "viewer", "/api/courses", undefined, 200);
  await step("final.viewer.documents", "GET /api/documents", "viewer", "/api/documents", undefined, 200);
  await step("final.viewer.leaderboard", "GET /api/leaderboard", "viewer", "/api/leaderboard", undefined, 200);
}

// ---------------------------------------------------------------------------
// ชุด 01c1 — PERSIST-01C-1 §D (แผนกจาก DB, C-05, E-1.2/E-2, F-01, F-06)
// Status/รหัส Error ที่คาด = พฤติกรรมหลัง 01C-1 (โค้ด Memory เดิมจะไม่ผ่านหลายข้อ — ตั้งใจ)
// ---------------------------------------------------------------------------

async function scenario01c1() {
  const errOf = (r: Res) => (r.body && typeof r.body.error === "string" ? r.body.error : undefined);
  const C1 = { viewer: "HRN-C1-VIEWER", u1: "HRN-C1-USER01", u2: "HRN-C1-USER02", other: "HRN-C1-OTHER" };
  const mk = (emp: string, name: string, departmentId: string | undefined, password: string, extra: Record<string, unknown> = {}) => ({
    name,
    employeeId: emp,
    ...(departmentId === undefined ? {} : { departmentId }),
    position: "ช่าง",
    role: "Viewer",
    email: `${emp.toLowerCase()}@example.invalid`,
    phone: "000-000-0000",
    status: "Active",
    startDate: "2026-01-15",
    password,
    ...extra,
  });
  const findUser = (r: Res, id: string) => (Array.isArray(r.body) ? r.body.find((u: any) => u?.id === id) : undefined);

  // --- GET /api/departments ---
  await step("c1.departments.noToken", "GET /api/departments", "anon", "/api/departments", undefined, 401);
  const adminLogin = await login("admin", "c1.login.admin", ADMIN_ID, ADMIN_PASSWORD, 200);
  if (adminLogin.status !== 200) throw new Error("ABORT: Admin login ไม่สำเร็จ — ตรวจ HARNESS_ADMIN_ID / HARNESS_ADMIN_PASSWORD");
  const initialUsers = await step("c1.users.list.initial", "GET /api/users", "admin", "/api/users", undefined, 200);
  if (!Array.isArray(initialUsers.body) || initialUsers.body.length !== 1) {
    throw new Error("ABORT: ฐานไม่อยู่ในสถานะเริ่มต้นสะอาด (ผู้ใช้ไม่ใช่ 1 คน) — ล้างฐานแล้วเปิด Server ใหม่ แล้วรันด้วยชื่อรอบใหม่");
  }
  const depts = await step("c1.departments.admin", "GET /api/departments", "admin", "/api/departments", undefined, 200);
  const list: any[] = Array.isArray(depts.body) ? depts.body : [];
  check("departments: ได้ Array 20 รายการ", Array.isArray(depts.body) && list.length === 20);
  check(
    "departments: ทุกรายการมี Key ตรง {id,parentId,name,code}",
    list.length > 0 && list.every((d) => d && Object.keys(d).sort().join(",") === "code,id,name,parentId"),
  );
  check(
    "departments: id/name/code เป็นข้อความ และ parentId เป็น null หรือข้อความ",
    list.length > 0 &&
      list.every((d) => typeof d.id === "string" && typeof d.name === "string" && typeof d.code === "string" &&
        (d.parentId === null || typeof d.parentId === "string")),
  );
  check("departments: แผนกหลัก 14 / แผนกย่อย 6", list.filter((d) => d?.parentId === null).length === 14 && list.filter((d) => typeof d?.parentId === "string").length === 6);
  check("departments: d-pd-dl มี parentId = d-pd", list.some((d) => d?.id === "d-pd-dl" && d?.parentId === "d-pd"));

  await step("c1.users.create.viewer", "POST /api/users", "admin", "/api/users", mk(C1.viewer, "C1 Viewer", "d-pd-dl", PW.viewer), 200);
  await login("viewer", "c1.login.viewer", C1.viewer, PW.viewer, 200);
  const deptsViewer = await step("c1.departments.viewer", "GET /api/departments", "viewer", "/api/departments", undefined, 200);
  check("departments (Viewer): ได้ 20 รายการ", Array.isArray(deptsViewer.body) && deptsViewer.body.length === 20);

  // --- POST /api/users ---
  const badDept = await step("c1.users.create.invalidDept", "POST /api/users", "admin", "/api/users",
    mk("HRN-C1-BADDEPT", "C1 Bad Dept", "Select Department", PW.c1u1), 400);
  check("POST users แผนก \"Select Department\" → INVALID_DEPARTMENT", errOf(badDept) === "INVALID_DEPARTMENT");
  const u1Res = await step("c1.users.create.u1", "POST /api/users", "admin", "/api/users", mk(C1.u1, "C1 User 1", "d-qa", PW.c1u1), 200);
  const u1Id = idOf(u1Res);
  const dupId = await step("c1.users.create.duplicateId", "POST /api/users", "admin", "/api/users",
    mk(C1.other, "C1 Dup Id", "d-qa", PW.c1u2, { id: u1Id }), 409);
  check("POST users id ซ้ำ → DUPLICATE_USER_ID", errOf(dupId) === "DUPLICATE_USER_ID");
  const dupEmpCase = await step("c1.users.create.duplicateEmployeeIdCase", "POST /api/users", "admin", "/api/users",
    mk(C1.u1.toLowerCase(), "C1 Dup Emp", "d-qa", PW.c1u2), 409);
  check("POST users employeeId ซ้ำต่างตัวพิมพ์ → DUPLICATE_EMPLOYEE_ID", errOf(dupEmpCase) === "DUPLICATE_EMPLOYEE_ID");
  const u2Res = await step("c1.users.create.u2", "POST /api/users", "admin", "/api/users", mk(C1.u2, "C1 User 2", "d-wh", PW.c1u2), 200);
  const u2Id = idOf(u2Res);
  await login("c1u2", "c1.login.u2", C1.u2, PW.c1u2, 200);

  // --- PUT /api/users/:id ---
  const hijack = await step("c1.users.update.bodyIdIgnored", "PUT /api/users/:id", "admin", `/api/users/${u1Id}`,
    { id: "usr-hijack-01c1", position: "หัวหน้าทีม" }, 200);
  check("PUT users ส่ง id อื่นใน Body → Response id ไม่เปลี่ยน", hijack.body?.id === u1Id);
  const afterHijack = await step("c1.users.list.afterBodyId", "GET /api/users", "admin", "/api/users", undefined, 200);
  check("PUT users ส่ง id อื่น → ผู้ใช้เดิมยังอยู่ที่ id เดิม และไม่มี id ใหม่",
    findUser(afterHijack, u1Id)?.position === "หัวหน้าทีม" && !findUser(afterHijack, "usr-hijack-01c1"));
  const putBadDept = await step("c1.users.update.invalidDept", "PUT /api/users/:id", "admin", `/api/users/${u1Id}`, { departmentId: "d-nope" }, 400);
  check("PUT users แผนกผิด → INVALID_DEPARTMENT", errOf(putBadDept) === "INVALID_DEPARTMENT");
  const putDupEmp = await step("c1.users.update.duplicateEmployeeId", "PUT /api/users/:id", "admin", `/api/users/${u1Id}`, { employeeId: C1.u2 }, 409);
  check("PUT users employeeId ชนคนอื่น → DUPLICATE_EMPLOYEE_ID", errOf(putDupEmp) === "DUPLICATE_EMPLOYEE_ID");
  const putDupEmpCase = await step("c1.users.update.duplicateEmployeeIdCase", "PUT /api/users/:id", "admin", `/api/users/${u1Id}`, { employeeId: C1.u2.toLowerCase() }, 409);
  check("PUT users employeeId ชนคนอื่นต่างตัวพิมพ์ → DUPLICATE_EMPLOYEE_ID", errOf(putDupEmpCase) === "DUPLICATE_EMPLOYEE_ID");

  // --- DELETE /api/users/:id (F-01: Terminated ไม่ลบแถว) ---
  const del = await step("c1.users.delete.u2", "DELETE /api/users/:id", "admin", `/api/users/${u2Id}`, undefined, 200);
  check("DELETE users → { success: true }", JSON.stringify(del.body) === JSON.stringify({ success: true }));
  const loginDeleted = await step("c1.login.u2.afterDelete", "POST /api/login", "anon", "/api/login", { employeeId: C1.u2, password: PW.c1u2 }, 403);
  check("Login ผู้ใช้ที่ถูก DELETE → TERMINATED", errOf(loginDeleted) === "TERMINATED");
  const oldToken = await step("c1.auth.u2.oldTokenAfterDelete", "GET /api/users", "c1u2", "/api/users", undefined, 403);
  check("Token เดิมของผู้ใช้ที่ถูก DELETE → ACCOUNT_DISABLED", errOf(oldToken) === "ACCOUNT_DISABLED");
  const afterDelete = await step("c1.users.list.afterDelete", "GET /api/users", "admin", "/api/users", undefined, 200);
  check("GET users หลัง DELETE ยังเห็นผู้ใช้นั้นด้วย status Terminated", findUser(afterDelete, u2Id)?.status === "Terminated");
  const reuseEmp = await step("c1.users.create.terminatedEmployeeId", "POST /api/users", "admin", "/api/users",
    mk(C1.u2, "C1 Reuse Terminated", "d-wh", PW.c1u1), 409);
  check("POST users ใช้ employeeId ของคนที่ถูก DELETE → DUPLICATE_EMPLOYEE_ID", errOf(reuseEmp) === "DUPLICATE_EMPLOYEE_ID");
  // employeeId ว่าง / มีแต่ช่องว่าง → เก็บเป็น NULL — สร้าง 2 คนที่ไม่มี employeeId ต้องสำเร็จทั้งคู่
  const noEmpA = await step("c1.users.create.noEmployeeId.empty", "POST /api/users", "admin", "/api/users",
    mk("", "C1 No EmpId A", "d-hr", PW.c1u1), 200);
  check("POST users employeeId \"\" → สำเร็จ และ Response ไม่มี employeeId",
    noEmpA.status === 200 && noEmpA.body && !("employeeId" in noEmpA.body));
  const noEmpB = await step("c1.users.create.noEmployeeId.spaces", "POST /api/users", "admin", "/api/users",
    mk("   ", "C1 No EmpId B", "d-hr", PW.c1u1), 200);
  check("POST users employeeId มีแต่ช่องว่าง (คนที่สอง) → สำเร็จ และ Response ไม่มี employeeId",
    noEmpB.status === 200 && noEmpB.body && !("employeeId" in noEmpB.body));
  const afterNoEmp = await step("c1.users.list.afterNoEmployeeId", "GET /api/users", "admin", "/api/users", undefined, 200);
  const a = findUser(afterNoEmp, idOf(noEmpA));
  const b = findUser(afterNoEmp, idOf(noEmpB));
  check("GET users เห็นทั้ง 2 คน (id ต่างกัน) และไม่มี employeeId ทั้งคู่",
    !!a && !!b && a.id !== b.id && !("employeeId" in a) && !("employeeId" in b));

  // km_contribution_logs: ผู้ใช้ Terminated = ไม่พบผู้ใช้ → 400 รหัสเดิม
  const kmTerminated = await step("c1.kmLogs.create.terminatedUser", "POST /api/km_contribution_logs", "admin", "/api/km_contribution_logs",
    { userId: u2Id, points: 5, activityType: "KB_CONTRIBUTION", description: "HRN-C1" }, 400);
  check("POST km_contribution_logs ผู้ใช้ Terminated → INVALID_INPUT", errOf(kmTerminated) === "INVALID_INPUT");

  const delNotFound = await step("c1.users.delete.notFound", "DELETE /api/users/:id", "admin", `/api/users/${NOPE.user}`, undefined, 200);
  check("DELETE users ไม่พบ → { success: true }", JSON.stringify(delNotFound.body) === JSON.stringify({ success: true }));

  // --- Reactivate ---
  await step("c1.users.reactivate.u2", "PUT /api/users/:id", "admin", `/api/users/${u2Id}`, { status: "Active" }, 200);
  const relogin = await login("c1u2", "c1.login.u2.afterReactivate", C1.u2, PW.c1u2, 200);
  check("Reactivate แล้ว Login ได้ (ได้ Token)", relogin.status === 200 && typeof relogin.body?.token === "string");
  await step("c1.auth.u2.newToken", "GET /api/users", "c1u2", "/api/users", undefined, 200);

  // --- system_audit_logs ---
  const viewerAudit = await step("c1.audit.create.viewer.adminAction", "POST /api/system_audit_logs", "viewer", "/api/system_audit_logs",
    { action: "UPDATE_MEMBER", details: "x" }, 403);
  check("Viewer บันทึก Audit action ของ Admin → FORBIDDEN", errOf(viewerAudit) === "FORBIDDEN");
  await step("c1.audit.create.admin", "POST /api/system_audit_logs", "admin", "/api/system_audit_logs",
    { action: "UPDATE_MEMBER", details: "HRN-C1 แก้ไขข้อมูลสมาชิก" }, 200);
  const audits = await step("c1.audit.list.admin", "GET /api/system_audit_logs", "admin", "/api/system_audit_logs", undefined, 200);
  check("GET audit มีรายการที่เพิ่งบันทึกเป็นรายการแรก (ใหม่สุดก่อน)",
    Array.isArray(audits.body) && audits.body[0]?.details === "HRN-C1 แก้ไขข้อมูลสมาชิก");

  // สถานะสุดท้าย
  await step("c1.final.users", "GET /api/users", "admin", "/api/users", undefined, 200);
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ชุด 01c2 — PERSIST-01C-2 §D (Employee Master บน DB: TX-09, B-17, Q-1 (ก), Q-2 (ข), FS-05, R9)
// Status/ผลที่คาด = พฤติกรรมหลัง 01C-2 (โค้ด Memory เดิมจะไม่ผ่าน Q-2 — ตั้งใจ)
// ---------------------------------------------------------------------------

async function scenario01c2() {
  const EM = "/api/employee_master";
  const errOf = (r: Res) => (r.body && typeof r.body.error === "string" ? r.body.error : undefined);
  const listOf = (r: Res): any[] => (Array.isArray(r.body) ? r.body : []);
  // แถว Employee Master 9 ช่องเป็นข้อความทั้งหมด (แบบที่ UI ส่ง)
  const em = (employeeId: string, name: string, departmentId: string, extra: Record<string, unknown> = {}) => ({
    employeeId,
    name,
    departmentId,
    position: "ช่าง",
    startDate: "2020-05-01",
    level: "O1",
    email: `${employeeId.toLowerCase()}@example.invalid`,
    phone: "000-000-0000",
    status: "Imported",
    ...extra,
  });
  const sortKeys = (o: any) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  const canon = (list: any[]) => JSON.stringify(list.map(sortKeys));
  const noInternalKeys = (list: any[]) =>
    list.every((r) => r && !("row_id" in r) && !("rowId" in r) && !("sort_order" in r) && !("sortOrder" in r));

  // --- สิทธิ์ ---
  await step("c2.em.get.noToken", "GET /api/employee_master", "anon", EM, undefined, 401);
  const adminLogin = await login("admin", "c2.login.admin", ADMIN_ID, ADMIN_PASSWORD, 200);
  if (adminLogin.status !== 200) throw new Error("ABORT: Admin login ไม่สำเร็จ — ตรวจ HARNESS_ADMIN_ID / HARNESS_ADMIN_PASSWORD");
  const initialUsers = await step("c2.users.list.initial", "GET /api/users", "admin", "/api/users", undefined, 200);
  if (!Array.isArray(initialUsers.body) || initialUsers.body.length !== 1) {
    throw new Error("ABORT: ฐานไม่อยู่ในสถานะเริ่มต้นสะอาด (ผู้ใช้ไม่ใช่ 1 คน) — ล้างฐานแล้วเปิด Server ใหม่ แล้วรันด้วยชื่อรอบใหม่");
  }
  const initialEm = await step("c2.em.get.initial", "GET /api/employee_master", "admin", EM, undefined, 200);
  if (listOf(initialEm).length !== 0) {
    throw new Error("ABORT: Employee Master ไม่ว่างตอนเริ่ม — ล้างฐานแล้วเปิด Server ใหม่");
  }
  const depts = await step("c2.departments.admin", "GET /api/departments", "admin", "/api/departments", undefined, 200);
  const realDeptIds = new Set(listOf(depts).map((d: any) => d?.id));
  const isReal = (id: unknown) => realDeptIds.has(String(id ?? ""));
  // Reference: อัลกอริทึมเดิมของ Editor (findIndex แถวแรก + แทนทั้งแถว + push) บนค่าระดับ API
  const refMerge = (base: any[], incoming: any[]) => {
    const merged = base.map((r) => ({ ...r }));
    for (const inc of incoming) {
      const row = { ...inc, isDeptResolved: isReal(inc.departmentId) };
      const idx = merged.findIndex((e) => e.employeeId === row.employeeId);
      if (idx !== -1) merged[idx] = row;
      else merged.push(row);
    }
    return merged;
  };
  const withResolved = (rows: any[]) => rows.map((r) => ({ ...r, isDeptResolved: isReal(r.departmentId) }));

  const mkUser = (emp: string, name: string, role: string, departmentId: string, password: string) => ({
    name, employeeId: emp, departmentId, position: "ช่าง", role,
    email: `${emp.toLowerCase()}@example.invalid`, phone: "000-000-0000", status: "Active", startDate: "2026-01-15", password,
  });
  await step("c2.users.create.editor", "POST /api/users", "admin", "/api/users", mkUser("HRN-C2-EDITOR", "C2 Editor", "Editor", "d-pd", PW.editor), 200);
  await step("c2.users.create.viewer", "POST /api/users", "admin", "/api/users", mkUser("HRN-C2-VIEWER", "C2 Viewer", "Viewer", "d-pd-dl", PW.viewer), 200);
  await login("editor", "c2.login.editor", "HRN-C2-EDITOR", PW.editor, 200);
  await login("viewer", "c2.login.viewer", "HRN-C2-VIEWER", PW.viewer, 200);
  await step("c2.em.get.viewer", "GET /api/employee_master", "viewer", EM, undefined, 403);
  await step("c2.em.post.viewer", "POST /api/employee_master", "viewer", EM, { employeeMaster: [] }, 403);

  // --- Admin Replace 3 แถว (รหัสซ้ำ 2 แถว) — isDeptResolved ที่ Client ส่งกลับด้าน Server ต้องไม่เชื่อ ---
  const replace3 = [
    em("E-DUP", "Dup A", "d-pd-dl", { isDeptResolved: false }),
    em("E-ONE", "One", "d-nope", { isDeptResolved: true }),
    em("E-DUP", "Dup B", "d-qa", { isDeptResolved: false }),
  ];
  const r3 = await step("c2.em.admin.replace3", "POST /api/employee_master", "admin", EM, { employeeMaster: replace3 }, 200);
  const r3List = listOf(r3);
  check("Admin Replace 3 แถว → ลำดับตาม Payload (Dup A, One, Dup B)",
    r3List.map((r) => r?.name).join("|") === "Dup A|One|Dup B");
  check("Admin Replace → Response ไม่มี row_id / sort_order", r3List.length === 3 && noInternalKeys(r3List));
  check("Admin Replace → isDeptResolved ตามแผนกจริง (true, false, true) ไม่เชื่อค่าที่ Client ส่ง",
    r3List.map((r) => r?.isDeptResolved).join(",") === "true,false,true");
  const afterReplace = await step("c2.em.get.afterReplace3", "GET /api/employee_master", "admin", EM, undefined, 200);
  check("GET หลัง Admin Replace = Response ของ Replace", canon(listOf(afterReplace)) === canon(r3List));

  // --- Editor ส่งรหัสที่ซ้ำในฐาน → แก้เฉพาะแถวแรก, แทนทั้งแถว, ตำแหน่งเดิม ---
  const e1 = await step("c2.em.editor.updateFirstDuplicate", "POST /api/employee_master", "editor", EM,
    { employeeMaster: [{ employeeId: "E-DUP", name: "Dup A (แก้)", departmentId: "d-wh" }] }, 200);
  const e1List = listOf(e1);
  check("Editor แก้รหัสซ้ำ → แถวแรก (ตำแหน่ง 0) ถูกแทน", e1List[0]?.name === "Dup A (แก้)" && e1List[0]?.departmentId === "d-wh");
  check("Editor แก้รหัสซ้ำ → แทนทั้งแถว (ช่องที่ไม่ส่งหายไป)",
    !!e1List[0] && Object.keys(e1List[0]).sort().join(",") === "departmentId,employeeId,isDeptResolved,name");
  check("Editor แก้รหัสซ้ำ → แถวที่สอง (Dup B) ไม่เปลี่ยน และจำนวนแถวเท่าเดิม",
    e1List.length === 3 && canon([e1List[2]]) === canon([r3List[2]]) && canon([e1List[1]]) === canon([r3List[1]]));
  check("Editor แก้รหัสซ้ำ → ตรงกับอัลกอริทึมเดิม", canon(e1List) === canon(refMerge(r3List, [{ employeeId: "E-DUP", name: "Dup A (แก้)", departmentId: "d-wh" }])));

  // --- Editor ส่งรหัสใหม่ซ้ำ 2 ครั้งในคำขอเดียว → เพิ่มแถวเดียว ค่าเป็นของรายการหลัง ---
  const newTwice = [em("E-NEW", "New first", "d-hr"), em("E-NEW", "New second", "d-hr")];
  const e2 = await step("c2.em.editor.newCodeTwice", "POST /api/employee_master", "editor", EM, { employeeMaster: newTwice }, 200);
  const e2List = listOf(e2);
  check("Editor รหัสใหม่ซ้ำ 2 ครั้ง → เพิ่มแถวเดียวต่อท้าย ค่าเป็นของรายการหลัง",
    e2List.length === 4 && e2List.filter((r) => r?.employeeId === "E-NEW").length === 1 && e2List[3]?.name === "New second");
  check("Editor รหัสใหม่ซ้ำ → ตรงกับอัลกอริทึมเดิม", canon(e2List) === canon(refMerge(e1List, newTwice)));

  // --- Editor ส่ง Array ว่าง / ส่งไม่ครบ → ไม่มีแถวหาย ---
  const e3 = await step("c2.em.editor.emptyArray", "POST /api/employee_master", "editor", EM, { employeeMaster: [] }, 200);
  check("Editor ส่ง [] → ไม่มีแถวหาย (เหมือนก่อนยิง)", canon(listOf(e3)) === canon(e2List));
  const subset = [em("E-ONE", "One (แก้)", "d-nope")];
  const e4 = await step("c2.em.editor.subset", "POST /api/employee_master", "editor", EM, { employeeMaster: subset }, 200);
  const e4List = listOf(e4);
  check("Editor ส่งบางแถว → แถวอื่นไม่หาย (4 แถว) และแก้เฉพาะแถวที่ส่ง",
    e4List.length === 4 && e4List[1]?.name === "One (แก้)" && canon(e4List) === canon(refMerge(e2List, subset)));

  // --- Q-1 (ก): มีแถว "9001" แล้ว Editor ส่ง employeeId: 9001 (ตัวเลข) → แก้แถวเดิม ไม่เพิ่มใหม่ ---
  const e5 = await step("c2.em.editor.append9001", "POST /api/employee_master", "editor", EM,
    { employeeMaster: [em("9001", "Num as text", "d-it")] }, 200);
  const e5List = listOf(e5);
  check("Editor เพิ่มแถว \"9001\"", e5List.length === 5 && e5List[4]?.employeeId === "9001");
  const e6 = await step("c2.em.editor.number9001", "POST /api/employee_master", "editor", EM,
    { employeeMaster: [{ ...em("9001", "Num as number", "d-it"), employeeId: 9001 }] }, 200);
  const e6List = listOf(e6);
  check("Q-1: employeeId 9001 (ตัวเลข) ตรงกับ \"9001\" → แก้แถวเดิม ไม่เพิ่มใหม่",
    e6List.length === 5 && e6List[4]?.employeeId === "9001" && e6List[4]?.name === "Num as number");

  // --- Q-2 (ข): แถวที่ไม่ใช่ Plain object → 400 INVALID_PAYLOAD ทั้งคำขอ ไม่เขียนอะไร ---
  const beforeQ2 = await step("c2.em.get.beforeQ2", "GET /api/employee_master", "admin", EM, undefined, 200);
  const q2Cases: Array<[string, Actor, unknown[]]> = [
    ["objectThenNull", "admin", [em("Q2-A", "Q2 A", "d-hr"), null]],
    ["number", "admin", [1]],
    ["string", "admin", ["x"]],
    ["array", "admin", [[]]],
    ["editor.objectThenNull", "editor", [em("Q2-B", "Q2 B", "d-hr"), null]],
  ];
  for (const [label, actor, payload] of q2Cases) {
    const r = await step(`c2.em.q2.${label}`, "POST /api/employee_master", actor, EM, { employeeMaster: payload }, 400);
    check(`Q-2 ${label} → 400 { error: "INVALID_PAYLOAD" }`,
      JSON.stringify(r.body) === JSON.stringify({ error: "INVALID_PAYLOAD" }));
  }
  const notArray = await step("c2.em.notArray", "POST /api/employee_master", "admin", EM, { employeeMaster: "x" }, 400);
  check("employeeMaster ไม่ใช่ Array → 400 INVALID_PAYLOAD (เดิม)", errOf(notArray) === "INVALID_PAYLOAD");
  const afterQ2 = await step("c2.em.get.afterQ2", "GET /api/employee_master", "admin", EM, undefined, 200);
  check("Q-2: GET หลังยิงคำขอผิดรูปแบบ = เหมือนก่อนยิง", canon(listOf(afterQ2)) === canon(listOf(beforeQ2)));

  // --- Admin Replace [] → GET [] ---
  await step("c2.em.admin.replaceEmpty", "POST /api/employee_master", "admin", EM, { employeeMaster: [] }, 200);
  const afterEmpty = await step("c2.em.get.afterReplaceEmpty", "GET /api/employee_master", "admin", EM, undefined, 200);
  check("Admin Replace [] → GET ได้ []", Array.isArray(afterEmpty.body) && afterEmpty.body.length === 0);

  // --- Concurrency (1): Admin Replace + Editor Merge พร้อมกัน 10 รอบ ---
  const orders = { adminFirst: 0, editorFirst: 0 };
  for (let round = 1; round <= 10; round++) {
    const s0 = [em("E1", `s0-1 r${round}`, "d-hr"), em("E2", `s0-2 r${round}`, "d-qa")];
    const x = [em("E1", `x-1 r${round}`, "d-hr"), em("E3", `x-3 r${round}`, "d-wh")];
    const y = [em("E1", `y-1 r${round}`, "d-en"), em("E4", `y-4 r${round}`, "d-it")];
    await step(`c2.cc1.r${round}.setup`, "POST /api/employee_master", "admin", EM, { employeeMaster: s0 }, 200);
    const [ra, re] = await Promise.all([
      step(`c2.cc1.r${round}.adminReplace`, "POST /api/employee_master", "admin", EM, { employeeMaster: x }, 200),
      step(`c2.cc1.r${round}.editorMerge`, "POST /api/employee_master", "editor", EM, { employeeMaster: y }, 200),
    ]);
    const fin = await step(`c2.cc1.r${round}.final`, "GET /api/employee_master", "admin", EM, undefined, 200);
    const adminFirst = canon(refMerge(withResolved(x), y)); // Admin ก่อน แล้ว Editor Merge
    const editorFirst = canon(withResolved(x)); // Editor ก่อน แล้ว Admin แทนทั้งก้อน
    const finCanon = canon(listOf(fin));
    if (finCanon === adminFirst) orders.adminFirst++;
    if (finCanon === editorFirst) orders.editorFirst++;
    check(`Concurrency(1) รอบ ${round}: ผลสุดท้ายตรงกับ Admin→Editor หรือ Editor→Admin`,
      finCanon === adminFirst || finCanon === editorFirst);
    check(`Concurrency(1) รอบ ${round}: Response ของ Admin = ชุดของ Admin เสมอ`, canon(listOf(ra)) === canon(withResolved(x)));
    check(`Concurrency(1) รอบ ${round}: Response ของ Editor = Merge บนสถานะก่อนหน้าที่ถูกต้อง`,
      canon(listOf(re)) === canon(refMerge(withResolved(s0), y)) || canon(listOf(re)) === adminFirst);
  }
  console.log(`     ลำดับที่เกิดจริงใน Concurrency(1): Admin ก่อน ${orders.adminFirst} รอบ, Editor ก่อน ${orders.editorFirst} รอบ`);

  // --- Concurrency (2): Editor Append รหัสต่างกัน 2 คำขอพร้อมกัน 10 รอบ → ได้ครบทั้งคู่ ไม่มีแถวหาย ---
  await step("c2.cc2.setup", "POST /api/employee_master", "admin", EM, { employeeMaster: [em("BASE-1", "Base 1", "d-hr")] }, 200);
  let expectedIds: string[] = ["BASE-1"];
  for (let round = 1; round <= 10; round++) {
    const a = em(`APP-A-${round}`, `Append A r${round}`, "d-hr");
    const b = em(`APP-B-${round}`, `Append B r${round}`, "d-qa");
    await Promise.all([
      step(`c2.cc2.r${round}.editorA`, "POST /api/employee_master", "editor", EM, { employeeMaster: [a] }, 200),
      step(`c2.cc2.r${round}.editorB`, "POST /api/employee_master", "editor", EM, { employeeMaster: [b] }, 200),
    ]);
    const fin = await step(`c2.cc2.r${round}.final`, "GET /api/employee_master", "admin", EM, undefined, 200);
    const ids = listOf(fin).map((r) => r?.employeeId);
    expectedIds = [...expectedIds, a.employeeId, b.employeeId];
    check(`Concurrency(2) รอบ ${round}: ได้ครบทุกแถว (${expectedIds.length}) ไม่มีแถวหายหรือซ้ำ`,
      ids.length === expectedIds.length && new Set(ids).size === ids.length && expectedIds.every((id) => ids.includes(id)));
    check(`Concurrency(2) รอบ ${round}: แถวเดิมยังอยู่ตามลำดับเดิม (2 แถวใหม่อยู่ท้าย)`,
      ids.slice(0, expectedIds.length - 2).join("|") === expectedIds.slice(0, -2).join("|"));
    // ลำดับของ 2 แถวที่ยิงพร้อมกันขึ้นกับว่าใครได้ล็อกก่อน — ปรับ expectedIds ให้ตรงกับลำดับจริงเพื่อตรวจรอบถัดไป
    expectedIds = ids.length === expectedIds.length ? ids : expectedIds;
  }

  await step("c2.final.employee_master", "GET /api/employee_master", "admin", EM, undefined, 200);
}

// ---------------------------------------------------------------------------
// ชุด 01c3 — PERSIST-01C-3 §D (เอกสาร + ACL บน DB: FS-02, FS-06, TX-11, TX-12, Q-1 (ก), Q-2 (ก), Q-3 (ก))
// Status/ผลที่คาด = พฤติกรรมหลัง 01C-3 (โค้ด Memory เดิมจะไม่ผ่าน Q-2 — ตั้งใจ)
// อัปโหลดไฟล์ทดสอบจริง — ชื่อไฟล์ทุกไฟล์บันทึกใน summary.json → uploadedTestFiles เพื่อให้ Owner ลบเอง
// ---------------------------------------------------------------------------

const uploadedTestFiles: string[] = [];

async function scenario01c3() {
  const DOCS = "/api/documents";
  const errOf = (r: Res) => (r.body && typeof r.body.error === "string" ? r.body.error : undefined);
  const listOf = (r: Res): any[] => (Array.isArray(r.body) ? r.body : []);
  const idsOf = (r: Res) => listOf(r).map((d) => d?.id);
  const sameSet = (a: unknown[], b: unknown[]) =>
    a.length === b.length && new Set(a).size === a.length && b.every((x) => a.includes(x));
  const now = Date.now();
  const doc = (title: string, departmentId: string, extra: Record<string, unknown> = {}) => ({
    title,
    description: `${title} — คำอธิบาย`,
    type: "WI",
    departmentId,
    owner: "Harness",
    fileType: "PDF",
    revision: 1,
    tags: ["harness-c3"],
    createdAt: new Date(now).toISOString(),
    ...extra,
  });
  // step ที่ยอมรับ Status ได้หลายค่า (ใช้กับคำขอพร้อมกัน) — ตัดรายการ unexpected ของขั้นนั้นออกเมื่อ Status อยู่ในชุดที่ยอมรับ
  const stepOneOf = async (name: string, route: string, actor: Actor, urlPath: string, body: unknown, allowed: number[]) => {
    const r = await step(name, route, actor, urlPath, body, allowed[0]);
    if (allowed.includes(r.status)) {
      for (let i = unexpected.length - 1; i >= 0; i--) {
        if (unexpected[i].name === name) unexpected.splice(i, 1);
      }
    }
    return r;
  };

  // --- เริ่มต้น / ผู้ใช้ ---
  const adminLogin = await login("admin", "c3.login.admin", ADMIN_ID, ADMIN_PASSWORD, 200);
  if (adminLogin.status !== 200) throw new Error("ABORT: Admin login ไม่สำเร็จ — ตรวจ HARNESS_ADMIN_ID / HARNESS_ADMIN_PASSWORD");
  const initialUsers = await step("c3.users.list.initial", "GET /api/users", "admin", "/api/users", undefined, 200);
  if (!Array.isArray(initialUsers.body) || initialUsers.body.length !== 1) {
    throw new Error("ABORT: ฐานไม่อยู่ในสถานะเริ่มต้นสะอาด (ผู้ใช้ไม่ใช่ 1 คน) — ล้างฐานแล้วเปิด Server ใหม่ แล้วรันด้วยชื่อรอบใหม่");
  }
  const initialDocs = await step("c3.documents.list.initial", "GET /api/documents", "admin", DOCS, undefined, 200);
  if (listOf(initialDocs).length !== 0) throw new Error("ABORT: มีเอกสารอยู่แล้วตอนเริ่ม — ล้างฐานแล้วเปิด Server ใหม่");
  const mkUser = (emp: string, name: string, role: string, departmentId: string, password: string) => ({
    name, employeeId: emp, departmentId, position: "ช่าง", role,
    email: `${emp.toLowerCase()}@example.invalid`, phone: "000-000-0000", status: "Active", startDate: "2026-01-15", password,
  });
  await step("c3.users.create.editor", "POST /api/users", "admin", "/api/users", mkUser("HRN-C3-EDITOR", "C3 Editor", "Editor", "d-pd", PW.editor), 200);
  await step("c3.users.create.viewer", "POST /api/users", "admin", "/api/users", mkUser("HRN-C3-VIEWER", "C3 Viewer", "Viewer", "d-pd-dl", PW.viewer), 200);
  await login("editor", "c3.login.editor", "HRN-C3-EDITOR", PW.editor, 200);
  await login("viewer", "c3.login.viewer", "HRN-C3-VIEWER", PW.viewer, 200);

  // --- สิทธิ์การเห็นเอกสาร (Viewer d-pd-dl / Editor d-pd) ---
  const dDL = idOf(await step("c3.doc.create.dl", "POST /api/documents", "admin", DOCS, doc("C3 DL published", "d-pd-dl"), 200));
  const dPD = idOf(await step("c3.doc.create.pd", "POST /api/documents", "admin", DOCS, doc("C3 PD published", "d-pd"), 200));
  const dSIB = idOf(await step("c3.doc.create.sibling", "POST /api/documents", "admin", DOCS, doc("C3 BM sibling", "d-pd-bm"), 200));
  const dHR = idOf(await step("c3.doc.create.hr", "POST /api/documents", "admin", DOCS, doc("C3 HR published", "d-hr"), 200));
  const dED = idOf(await step("c3.doc.create.editorPending", "POST /api/documents", "editor", DOCS, doc("C3 Editor pending", "d-hr"), 200));
  const viewerList = await step("c3.doc.list.viewer", "GET /api/documents", "viewer", DOCS, undefined, 200);
  check("Viewer (d-pd-dl) เห็นเฉพาะ Published ที่มีสิทธิ์: DL เท่านั้น (ไม่เห็น PD ย่อย→หลัก, BM พี่น้อง, HR, Pending)",
    sameSet(idsOf(viewerList), [dDL]));
  const editorList = await step("c3.doc.list.editor", "GET /api/documents", "editor", DOCS, undefined, 200);
  check("Editor (d-pd) เห็น PD, DL และ BM (หลัก→ย่อย) รวม Pending ของตัวเอง แต่ไม่เห็น HR",
    sameSet(idsOf(editorList), [dDL, dPD, dSIB, dED]));
  check("ทุกเอกสารใน GET มี accessible: true", [...listOf(viewerList), ...listOf(editorList)].every((d) => d?.accessible === true));

  // --- ACL Owner-first (FS-02) ---
  const acl = await step("c3.acl.create.shuffledDup", "POST /api/documents", "admin", DOCS,
    doc("C3 ACL", "d-hr", { allowedDepartmentIds: ["d-qa", "d-pd-dl", "d-qa", "d-hr", "d-it"] }), 200);
  check("ACL: Owner ก่อน ตามด้วยลำดับที่ส่ง ไม่ซ้ำ",
    JSON.stringify(acl.body?.allowedDepartmentIds) === JSON.stringify(["d-hr", "d-qa", "d-pd-dl", "d-it"]));
  const dACL = idOf(acl);
  const aclPut = await step("c3.acl.update.changeDept", "PUT /api/documents/:id", "admin", `${DOCS}/${dACL}`, { departmentId: "d-wh" }, 200);
  check("ACL: Admin PUT เปลี่ยนแผนก → แผนกใหม่อยู่ลำดับแรก",
    aclPut.body?.departmentId === "d-wh" &&
      JSON.stringify(aclPut.body?.allowedDepartmentIds) === JSON.stringify(["d-wh", "d-hr", "d-qa", "d-pd-dl", "d-it"]));
  const aclList = await step("c3.acl.list.admin", "GET /api/documents", "admin", DOCS, undefined, 200);
  check("ACL: GET อ่านกลับได้ลำดับเดียวกับ Response ของ PUT",
    JSON.stringify(listOf(aclList).find((d) => d?.id === dACL)?.allowedDepartmentIds) === JSON.stringify(aclPut.body?.allowedDepartmentIds));

  // --- parsedExcelSheets (FS-06, Q-1 ก) ---
  const sheets: Record<string, unknown> = {
    "สรุป": [["รายการ", "จำนวน"], ["ฟิล์ม", 12], ["", null]],
    "2024": [[1, 2.5, ""], [0, -3, "x"]],
    A: [["a"]],
    "Sheet10 ชื่อยาวกว่าชีตอื่นมาก": [[]],
    Sheet2: [["b", 0]],
  };
  const sentKeys = Object.keys(sheets);
  const qpObj = await step("c3.sheets.create.object", "POST /api/documents", "admin", DOCS,
    doc("C3 QP sheets object", "d-pd-dl", { type: "QP", parsedExcelSheets: sheets }), 200);
  const dQP = idOf(qpObj);
  check("parsedExcelSheets (Object): Object.keys ของ Response = Object.keys ของค่าที่ส่ง",
    JSON.stringify(Object.keys(qpObj.body?.parsedExcelSheets ?? {})) === JSON.stringify(sentKeys));
  check("parsedExcelSheets (Object): ค่าทุกชีตเหมือนที่ส่ง (ตัวเลข/ว่าง/null)",
    JSON.stringify(qpObj.body?.parsedExcelSheets) === JSON.stringify(sheets));
  const sheetsArray = [{ name: "Sheet1", rows: [["a", "b"], ["1", "2"]] }];
  const qpArr = await step("c3.sheets.create.array", "POST /api/documents", "admin", DOCS,
    doc("C3 QP sheets array", "d-pd-dl", { type: "QP", parsedExcelSheets: sheetsArray }), 200);
  const dQPArr = idOf(qpArr);
  check("parsedExcelSheets (Array): ได้ Array เดิม", JSON.stringify(qpArr.body?.parsedExcelSheets) === JSON.stringify(sheetsArray));
  const adminList = await step("c3.sheets.list.admin", "GET /api/documents", "admin", DOCS, undefined, 200);
  const qpInList = listOf(adminList).find((d) => d?.id === dQP);
  check("parsedExcelSheets: GET (Admin) อ่านกลับได้ Object.keys และค่าเดิม",
    JSON.stringify(Object.keys(qpInList?.parsedExcelSheets ?? {})) === JSON.stringify(sentKeys) &&
      JSON.stringify(qpInList?.parsedExcelSheets) === JSON.stringify(sheets));
  check("parsedExcelSheets (Array): GET (Admin) ได้ Array เดิม",
    JSON.stringify(listOf(adminList).find((d) => d?.id === dQPArr)?.parsedExcelSheets) === JSON.stringify(sheetsArray));
  const viewerQP = await step("c3.sheets.list.viewer", "GET /api/documents", "viewer", DOCS, undefined, 200);
  const editorQP = await step("c3.sheets.list.editor", "GET /api/documents", "editor", DOCS, undefined, 200);
  check("QP: Viewer/Editor ไม่เห็น parsedExcelSheets ใน GET",
    [...listOf(viewerQP), ...listOf(editorQP)].filter((d) => d?.type === "QP").length >= 2 &&
      [...listOf(viewerQP), ...listOf(editorQP)].filter((d) => d?.type === "QP").every((d) => !("parsedExcelSheets" in d)));
  const viewerViewQP = await step("c3.sheets.view.viewer", "POST /api/documents/:id/view", "viewer", `${DOCS}/${dQP}/view`, undefined, 200);
  check("QP: Viewer view ไม่เห็น parsedExcelSheets", viewerViewQP.status === 200 && !("parsedExcelSheets" in (viewerViewQP.body ?? {})));

  // --- Q-2 (ก): ชนิดข้อมูลผิด → แปลง/ทิ้ง ไม่ใช่ 500 ---
  const q2 = await step("c3.q2.create.wrongTypes", "POST /api/documents", "admin", DOCS,
    { title: 5, description: "C3 Q2", type: "WI", departmentId: "d-hr", owner: "Harness", revision: "abc", tags: "x", createdAt: new Date(now).toISOString() }, 200);
  check("Q-2 POST: title 5 → \"5\"", q2.body?.title === "5");
  check("Q-2 POST: revision \"abc\" → ไม่มี Key", !!q2.body && !("revision" in q2.body));
  check("Q-2 POST: tags \"x\" → ไม่มี Key", !!q2.body && !("tags" in q2.body));
  const dQ2 = idOf(q2);
  const q2Put = await step("c3.q2.update.wrongTypes", "PUT /api/documents/:id", "admin", `${DOCS}/${dQ2}`, { title: 7, revision: "abc", tags: "y" }, 200);
  check("Q-2 PUT: ชนิดผิดถูกข้ามแบบเดิม (title ยังเป็น \"5\") และไม่ใช่ 500", q2Put.status === 200 && q2Put.body?.title === "5");

  // --- approve id ไม่มีจริง → 200 null ---
  const apNone = await step("c3.approve.notFound", "POST /api/documents/:id/approve", "admin", `${DOCS}/doc-0000000000000/approve`, undefined, 200);
  check("approve id ไม่มีจริง → 200 null", apNone.status === 200 && apNone.kind === "json" && apNone.body === null);

  // --- TX-12: view / download พร้อมกัน 20 คำขอ → +20 พอดี ---
  const dCNT = idOf(await step("c3.tx12.create", "POST /api/documents", "admin", DOCS, doc("C3 counter", "d-pd-dl"), 200));
  const views = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    step(`c3.tx12.view.${String(i + 1).padStart(2, "0")}`, "POST /api/documents/:id/view", "viewer", `${DOCS}/${dCNT}/view`, undefined, 200)));
  const viewValues = views.map((r) => r.body?.views).sort((a, b) => a - b);
  check("TX-12 view: ทุกคำขอ 200 และค่า views ที่ตอบกลับเป็น 1..20 ไม่ซ้ำ",
    views.every((r) => r.status === 200) && JSON.stringify(viewValues) === JSON.stringify(Array.from({ length: 20 }, (_, i) => i + 1)));
  const downloads = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    step(`c3.tx12.download.${String(i + 1).padStart(2, "0")}`, "POST /api/documents/:id/download", "admin", `${DOCS}/${dCNT}/download`, undefined, 200)));
  check("TX-12 download: ทุกคำขอ 200", downloads.every((r) => r.status === 200));
  const cnt = await step("c3.tx12.list.admin", "GET /api/documents", "admin", DOCS, undefined, 200);
  const cntDoc = listOf(cnt).find((d) => d?.id === dCNT);
  check("TX-12: views = 20 และ downloads = 20 พอดี", cntDoc?.views === 20 && cntDoc?.downloads === 20);

  // --- ไฟล์ (Q-3 ก): อัปโหลด PDF เล็ก แล้วทดสอบ files/sign, /uploads, การผูกพร้อมกัน, การจองถูกคืน, ORPHANED_FILE ---
  const pdfBase64 = Buffer.from("%PDF-1.4\n% HRN-C3 test file\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf-8").toString("base64");
  const upload = async (label: string) => {
    const r = await step(`c3.file.upload.${label}`, "POST /api/upload", "admin", "/api/upload", { filename: `hrn-c3-${label}.pdf`, fileData: pdfBase64 }, 200);
    const name = typeof r.body?.filename === "string" ? r.body.filename : "missing-file";
    if (name !== "missing-file") uploadedTestFiles.push(name);
    return name;
  };
  const withFile = (name: string) => ({ fileUrl: `/uploads/${name}`, realFileUrl: `/uploads/${name}` });
  const sign = (label: string, actor: Actor, filename: string, expect: number) =>
    step(`c3.file.sign.${label}`, "POST /api/files/sign", actor, "/api/files/sign", { filename }, expect);

  const fDL = await upload("dl");
  const dFileDL = idOf(await step("c3.file.bind.dl", "POST /api/documents", "admin", DOCS, doc("C3 file DL", "d-pd-dl", withFile(fDL)), 200));
  const signDL = await sign("viewer.dl", "viewer", fDL, 200);
  check("files/sign: Viewer ได้ URL ของไฟล์เอกสาร d-pd-dl", typeof signDL.body?.url === "string" && signDL.body.url.startsWith(`/uploads/${fDL}?t=`));
  const getDL = await step("c3.file.get.viewerToken", "GET /uploads/:filename", "anon",
    typeof signDL.body?.url === "string" ? signDL.body.url : `/uploads/${fDL}`, undefined, 200);
  check("GET /uploads/<ไฟล์>?t=<token> → 200", getDL.status === 200);

  const fHR = await upload("hr");
  await step("c3.file.bind.hr", "POST /api/documents", "admin", DOCS, doc("C3 file HR", "d-hr", withFile(fHR)), 200);
  const signHR = await sign("viewer.hr", "viewer", fHR, 403);
  check("files/sign: ไฟล์ของเอกสาร d-hr → Viewer 403 FORBIDDEN", errOf(signHR) === "FORBIDDEN");

  const fQP = await upload("qp");
  await step("c3.file.bind.qp", "POST /api/documents", "admin", DOCS, doc("C3 file QP", "d-pd-dl", { type: "QP", ...withFile(fQP) }), 200);
  const signQPv = await sign("viewer.qp", "viewer", fQP, 403);
  check("files/sign: เอกสาร QP → Viewer 403 QP_RESTRICTED", errOf(signQPv) === "QP_RESTRICTED");
  const signQPa = await sign("admin.qp", "admin", fQP, 200);
  check("files/sign: เอกสาร QP → Admin ได้ URL", typeof signQPa.body?.url === "string");
  const getQP = await step("c3.file.get.adminToken.qp", "GET /uploads/:filename", "anon",
    typeof signQPa.body?.url === "string" ? signQPa.body.url : `/uploads/${fQP}`, undefined, 200);
  check("GET /uploads (QP, Token ของ Admin) → 200", getQP.status === 200);

  // TX-11: ผูกไฟล์เดียวกันพร้อมกัน 5 คำขอ → 200 หนึ่งเดียว ที่เหลือ 409
  const fRace = await upload("race");
  const race = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    stepOneOf(`c3.file.race.${i + 1}`, "POST /api/documents", "admin", DOCS, doc(`C3 race ${i + 1}`, "d-pd-dl", withFile(fRace)), [200, 409])));
  check("TX-11: ผูกไฟล์เดียวกันพร้อมกัน 5 คำขอ → 200 หนึ่งเดียว ที่เหลือ 409 DUPLICATE_FILE_BINDING",
    race.filter((r) => r.status === 200).length === 1 &&
      race.filter((r) => r.status === 409 && errOf(r) === "DUPLICATE_FILE_BINDING").length === 4);
  const raceList = await step("c3.file.race.list", "GET /api/documents", "admin", DOCS, undefined, 200);
  check("TX-11: GET มีเอกสารที่ผูกไฟล์นี้ 1 ฉบับ",
    listOf(raceList).filter((d) => d?.realFileUrl === `/uploads/${fRace}`).length === 1);

  // ผูกล้มเพราะ ACL ผิด (400) → ไฟล์ไม่ถูกจองค้าง ผูกกับเอกสารอื่นได้
  const fFree = await upload("free");
  const badAcl = await step("c3.file.bind.badAcl", "POST /api/documents", "admin", DOCS,
    doc("C3 bad ACL", "d-pd-dl", { allowedDepartmentIds: ["d-nope"], ...withFile(fFree) }), 400);
  check("ผูกไฟล์แต่ ACL ผิด → 400 INVALID_DEPARTMENT_ACCESS", errOf(badAcl) === "INVALID_DEPARTMENT_ACCESS");
  const reBind = await step("c3.file.bind.afterBadAcl", "POST /api/documents", "admin", DOCS, doc("C3 rebind", "d-pd-dl", withFile(fFree)), 200);
  check("ไฟล์เดิมผูกกับเอกสารอื่นได้ (ไม่ถูกจองค้าง)", reBind.status === 200 && reBind.body?.realFileUrl === `/uploads/${fFree}`);

  // จองไฟล์แล้ว DB ล้มเหลว (title มี \u0000 ซึ่ง PostgreSQL ไม่รับ) → 500 INTERNAL_ERROR เท่านั้น → การจองถูกคืน ผูกไฟล์เดิมได้
  const fNul = await upload("nul");
  const nul = await step("c3.file.bind.nulTitle", "POST /api/documents", "admin", DOCS,
    doc("C3 NUL \u0000 title", "d-pd-dl", withFile(fNul)), 500);
  check("DB ล้มหลังจองไฟล์ → 500 และ Body = { error: INTERNAL_ERROR, message: เกิดข้อผิดพลาดภายในระบบ } เท่านั้น",
    nul.status === 500 &&
      JSON.stringify(nul.body) === JSON.stringify({ error: "INTERNAL_ERROR", message: "เกิดข้อผิดพลาดภายในระบบ" }));
  const nulRebind = await step("c3.file.bind.afterNul", "POST /api/documents", "admin", DOCS, doc("C3 rebind after NUL", "d-pd-dl", withFile(fNul)), 200);
  check("หลัง DB ล้ม การจองถูกคืน → ผูกไฟล์เดิมกับเอกสารใหม่ได้ 200",
    nulRebind.status === 200 && nulRebind.body?.realFileUrl === `/uploads/${fNul}`);

  // DELETE เอกสาร → files/sign 403 ORPHANED_FILE
  await step("c3.file.delete.dl", "DELETE /api/documents/:id", "admin", `${DOCS}/${dFileDL}`, undefined, 200);
  const signOrphan = await sign("admin.afterDelete", "admin", fDL, 403);
  check("DELETE เอกสาร → files/sign 403 ORPHANED_FILE", errOf(signOrphan) === "ORPHANED_FILE");

  // --- PUT + DELETE เอกสารเดียวกันพร้อมกัน 10 รอบ → ไม่มี 500 · ผลสุดท้ายไม่มีเอกสารนั้น ---
  for (let round = 1; round <= 10; round++) {
    const dR = idOf(await step(`c3.race.r${round}.create`, "POST /api/documents", "admin", DOCS, doc(`C3 put-delete r${round}`, "d-pd-dl"), 200));
    const [rp, rd] = await Promise.all([
      stepOneOf(`c3.race.r${round}.put`, "PUT /api/documents/:id", "admin", `${DOCS}/${dR}`, { title: `C3 put-delete r${round} (แก้)` }, [200, 404]),
      stepOneOf(`c3.race.r${round}.delete`, "DELETE /api/documents/:id", "admin", `${DOCS}/${dR}`, undefined, [200]),
    ]);
    const after = await step(`c3.race.r${round}.list`, "GET /api/documents", "admin", DOCS, undefined, 200);
    check(`PUT+DELETE พร้อมกัน รอบ ${round}: ไม่มี 500 (PUT ${rp.status}, DELETE ${rd.status}) และไม่เหลือเอกสารนั้น`,
      rp.status !== 500 && rd.status !== 500 && [200, 404].includes(rp.status) && rd.status === 200 && !idsOf(after).includes(dR));
  }

  await step("c3.final.documents", "GET /api/documents", "admin", DOCS, undefined, 200);
  await step("c3.final.documents_stats", "GET /api/documents/stats", "admin", `${DOCS}/stats`, undefined, 200);
}

// ---------------------------------------------------------------------------
// ชุด 01c4 — PERSIST-01C-4 §D (kb_articles, experts, contact_requests, custom_resources, ratings,
// search_logs, search_resolutions บน DB: E-2, F-05, F-06, TX-08, TX-12, C-15, Q-2 (ก))
// Status/ผลที่คาด = พฤติกรรมหลัง 01C-4 (โค้ด Memory เดิมจะไม่ผ่าน E-2 / F-06 / Q-2 / C-15 / TX-08 \u0000 — ตั้งใจ)
// ชุดนี้ไม่อัปโหลดไฟล์
// ---------------------------------------------------------------------------

async function scenario01c4() {
  const KB = "/api/kb_articles";
  const EXP = "/api/experts";
  const CR = "/api/contact_requests";
  const RES = "/api/custom_resources";
  const RT = "/api/ratings";
  const SL = "/api/search_logs";
  const SR = "/api/search_resolutions";
  const AUDIT = "/api/system_audit_logs";
  const errOf = (r: Res) => (r.body && typeof r.body.error === "string" ? r.body.error : undefined);
  const listOf = (r: Res): any[] => (Array.isArray(r.body) ? r.body : []);
  const idsOf = (r: Res) => listOf(r).map((x) => x?.id);
  const findIn = (r: Res, id: string) => listOf(r).find((x) => x?.id === id);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const INVALID_PAYLOAD = { error: "INVALID_PAYLOAD" };
  const DUPLICATE_ID = { error: "DUPLICATE_ID", message: "รหัส (id) นี้มีอยู่ในระบบแล้ว" };
  const INTERNAL = { error: "INTERNAL_ERROR", message: "เกิดข้อผิดพลาดภายในระบบ" };
  // step ที่ยอมรับ Status ได้หลายค่า (คำขอพร้อมกัน) — ตัดรายการ unexpected ของขั้นนั้นเมื่อ Status อยู่ในชุดที่ยอมรับ
  const stepOneOf = async (name: string, route: string, actor: Actor, urlPath: string, body: unknown, allowed: number[]) => {
    const r = await step(name, route, actor, urlPath, body, allowed[0]);
    if (allowed.includes(r.status)) {
      for (let i = unexpected.length - 1; i >= 0; i--) {
        if (unexpected[i].name === name) unexpected.splice(i, 1);
      }
    }
    return r;
  };

  // --- เริ่มต้น / ผู้ใช้ ---
  const adminLogin = await login("admin", "c4.login.admin", ADMIN_ID, ADMIN_PASSWORD, 200);
  if (adminLogin.status !== 200) throw new Error("ABORT: Admin login ไม่สำเร็จ — ตรวจ HARNESS_ADMIN_ID / HARNESS_ADMIN_PASSWORD");
  const initialUsers = await step("c4.users.list.initial", "GET /api/users", "admin", "/api/users", undefined, 200);
  if (!Array.isArray(initialUsers.body) || initialUsers.body.length !== 1) {
    throw new Error("ABORT: ฐานไม่อยู่ในสถานะเริ่มต้นสะอาด (ผู้ใช้ไม่ใช่ 1 คน) — ล้างฐานแล้วเปิด Server ใหม่ แล้วรันด้วยชื่อรอบใหม่");
  }
  for (const [label, p] of [["kb", KB], ["experts", EXP], ["custom_resources", RES], ["ratings", RT], ["search_logs", SL]] as const) {
    const r = await step(`c4.${label}.list.initial`, `GET ${p}`, "admin", p, undefined, 200);
    if (listOf(r).length !== 0) throw new Error(`ABORT: ${label} ไม่ว่างตอนเริ่ม — ล้างฐานแล้วเปิด Server ใหม่`);
  }
  const mkUser = (emp: string, name: string, role: string, departmentId: string, password: string) => ({
    name, employeeId: emp, departmentId, position: "ช่าง", role,
    email: `${emp.toLowerCase()}@example.invalid`, phone: "000-000-0000", status: "Active", startDate: "2026-01-15", password,
  });
  await step("c4.users.create.editor", "POST /api/users", "admin", "/api/users", mkUser("HRN-C4-EDITOR", "C4 Editor", "Editor", "d-pd", PW.editor), 200);
  const viewerRes = await step("c4.users.create.viewer", "POST /api/users", "admin", "/api/users", mkUser("HRN-C4-VIEWER", "C4 Viewer", "Viewer", "d-pd-dl", PW.viewer), 200);
  const viewerId = idOf(viewerRes);
  await login("editor", "c4.login.editor", "HRN-C4-EDITOR", PW.editor, 200);
  await login("viewer", "c4.login.viewer", "HRN-C4-VIEWER", PW.viewer, 200);

  const kbBody = (title: string, extra: Record<string, unknown> = {}) => ({
    title, type: "Troubleshooting", problem: `${title} — ปัญหา`, solution: `${title} — วิธีแก้`,
    cause: "สาเหตุ", tags: ["c4"], relatedWIs: ["WI-C4"], ...extra,
  });
  const expertBody = (name: string, extra: Record<string, unknown> = {}) => ({
    name, position: "Engineer", departmentId: "d-en", skills: ["Laminator"], experienceYears: 7,
    phone: "000-000-0000", email: "c4.expert@example.invalid", availability: "Available", ...extra,
  });

  // --- E-2: POST experts / custom_resources ด้วย id ที่มีแล้ว → 409 DUPLICATE_ID · ไม่ส่ง id → id ใหม่ ---
  const exFixed = await step("c4.e2.experts.create.fixedId", "POST /api/experts", "admin", EXP, expertBody("C4 Expert Fixed", { id: "exp-c4-fixed" }), 200);
  check("E-2 experts: สร้างด้วย id ของ Client ได้ id นั้น", exFixed.body?.id === "exp-c4-fixed");
  const exDup = await step("c4.e2.experts.create.duplicateId", "POST /api/experts", "admin", EXP, expertBody("C4 Expert Dup", { id: "exp-c4-fixed" }), 409);
  check("E-2 experts: id ซ้ำ → 409 DUPLICATE_ID (Body ตรง)", same(exDup.body, DUPLICATE_ID));
  const exAuto = await step("c4.e2.experts.create.noId", "POST /api/experts", "admin", EXP, expertBody("C4 Expert Auto"), 200);
  check("E-2 experts: ไม่ส่ง id → ได้ id ใหม่ (exp-…)",
    typeof exAuto.body?.id === "string" && exAuto.body.id.startsWith("exp-") && exAuto.body.id !== "exp-c4-fixed");
  const exList1 = await step("c4.e2.experts.list", "GET /api/experts", "admin", EXP, undefined, 200);
  check("E-2 experts: GET ไม่มีแถวซ้ำ (exp-c4-fixed 1 แถว และชื่อเป็นของรายการแรก)",
    listOf(exList1).filter((e) => e?.id === "exp-c4-fixed").length === 1 && findIn(exList1, "exp-c4-fixed")?.name === "C4 Expert Fixed");
  check("experts เรียง ASC ตามลำดับที่สร้าง (Fixed ก่อน Auto)",
    same(idsOf(exList1), ["exp-c4-fixed", exAuto.body?.id]));

  const resBody = (title: string, extra: Record<string, unknown> = {}) => ({
    title, content: "เนื้อหา", sourceType: "Text", addedBy: "Harness", createdAt: new Date().toISOString(), ...extra,
  });
  const rsFixed = await step("c4.e2.resources.create.fixedId", "POST /api/custom_resources", "admin", RES, resBody("C4 Res Fixed", { id: "res-c4-fixed" }), 200);
  check("E-2 custom_resources: สร้างด้วย id ของ Client ได้ id นั้น", rsFixed.body?.id === "res-c4-fixed");
  const rsDup = await step("c4.e2.resources.create.duplicateId", "POST /api/custom_resources", "admin", RES, resBody("C4 Res Dup", { id: "res-c4-fixed" }), 409);
  check("E-2 custom_resources: id ซ้ำ → 409 DUPLICATE_ID (Body ตรง)", same(rsDup.body, DUPLICATE_ID));
  const rsAuto = await step("c4.e2.resources.create.noId", "POST /api/custom_resources", "admin", RES, resBody("C4 Res Auto"), 200);
  check("E-2 custom_resources: ไม่ส่ง id → ได้ id ใหม่ (res-…)",
    typeof rsAuto.body?.id === "string" && rsAuto.body.id.startsWith("res-") && rsAuto.body.id !== "res-c4-fixed");

  // --- F-05: custom_resources ค่าดิบ (ไม่ใช่ String / null / ช่องไม่รู้จัก / ไม่ส่ง addedBy) ---
  const rsRaw = await step("c4.f05.resources.create.raw", "POST /api/custom_resources", "admin", RES,
    { title: 5, content: null, sourceType: "URL", foo: { a: 1 } }, 200);
  const rsRawId: string = typeof rsRaw.body?.id === "string" ? rsRaw.body.id : "missing";
  const rsList = await step("c4.f05.resources.list", "GET /api/custom_resources", "admin", RES, undefined, 200);
  const raw = findIn(rsList, rsRawId);
  check("F-05: GET ได้ title: 5 (ตัวเลข), content: null, foo เดิม และไม่มี Key addedBy",
    !!raw && raw.title === 5 && "content" in raw && raw.content === null && same(raw.foo, { a: 1 }) && raw.sourceType === "URL" && !("addedBy" in raw));
  check("custom_resources ใหม่สุดก่อน (Raw, Auto, Fixed)", same(idsOf(rsList), [rsRawId, rsAuto.body?.id, "res-c4-fixed"]));

  // --- Q-2: Body เป็น Array → 400 INVALID_PAYLOAD (4 เส้น) ---
  const kbForPut = await step("c4.kb.create.admin", "POST /api/kb_articles", "admin", KB, kbBody("C4 KB Put"), 200);
  const kbPutId: string = typeof kbForPut.body?.id === "string" ? kbForPut.body.id : "missing";
  const q2Cases: Array<[string, string, string]> = [
    ["experts.post", "POST /api/experts", EXP],
    ["experts.put", "PUT /api/experts/:id", `${EXP}/exp-c4-fixed`],
    ["kb.put", "PUT /api/kb_articles/:id", `${KB}/${kbPutId}`],
    ["resources.post", "POST /api/custom_resources", RES],
  ];
  for (const [label, route, p] of q2Cases) {
    const r = await step(`c4.q2.arrayBody.${label}`, route, "admin", p, [], 400);
    check(`Q-2 ${label}: Body เป็น Array → 400 { error: "INVALID_PAYLOAD" }`, same(r.body, INVALID_PAYLOAD));
  }
  const exQ2 = await step("c4.q2.experts.create.wrongTypes", "POST /api/experts", "admin", EXP,
    expertBody("C4 Expert Q2", { experienceYears: "x", skills: "a" }), 200);
  const exQ2List = await step("c4.q2.experts.list", "GET /api/experts", "admin", EXP, undefined, 200);
  const exQ2Row = findIn(exQ2List, exQ2.body?.id);
  check("Q-2 experts: experienceYears \"x\" → ไม่มี Key · skills \"a\" → ไม่มี Key",
    !!exQ2Row && !("experienceYears" in exQ2Row) && !("skills" in exQ2Row));

  // --- F-06 + PUT แทนทั้งก้อน + PUT ไม่พบ ---
  const kbPutBody = { ...kbBody("C4 KB Put (แก้)"), id: "kb-hijack-c4", status: "Approved", views: 0, likes: 0 }; // ไม่ส่ง author / createdAt
  const kbPut = await step("c4.f06.kb.update.bodyId", "PUT /api/kb_articles/:id", "admin", `${KB}/${kbPutId}`, kbPutBody, 200);
  const kbAfterPut = await step("c4.f06.kb.list", "GET /api/kb_articles", "admin", KB, undefined, 200);
  const kbRow = findIn(kbAfterPut, kbPutId);
  check("F-06 kb: GET ยังมี id เดิม และไม่มี id ใหม่จาก Body", !!kbRow && !findIn(kbAfterPut, "kb-hijack-c4"));
  check("PUT kb แทนทั้งก้อน: ไม่ส่ง author / createdAt → ช่องนั้นหายจาก GET", !!kbRow && !("author" in kbRow) && !("createdAt" in kbRow) && kbRow.title === "C4 KB Put (แก้)");
  check("PUT kb พบ → ตอบค่าที่อ่านกลับ (id เดิม)", kbPut.body?.id === kbPutId);
  const kbCountBefore = listOf(kbAfterPut).length;
  const kbMissingBody = { ...kbBody("C4 KB Missing"), id: "kb-0000000000000" };
  const kbPutMissing = await step("c4.kb.update.notFound", "PUT /api/kb_articles/:id", "admin", `${KB}/kb-0000000000000`, kbMissingBody, 200);
  check("PUT kb ไม่พบ → 200 + Body ที่ส่ง", same(kbPutMissing.body, kbMissingBody));
  const kbAfterMissing = await step("c4.kb.list.afterNotFound", "GET /api/kb_articles", "admin", KB, undefined, 200);
  check("PUT kb ไม่พบ → GET ไม่มีแถวใหม่", listOf(kbAfterMissing).length === kbCountBefore && !findIn(kbAfterMissing, "kb-0000000000000"));

  const exPut = await step("c4.f06.experts.update.bodyId", "PUT /api/experts/:id", "admin", `${EXP}/exp-c4-fixed`,
    expertBody("C4 Expert Fixed (แก้)", { id: "exp-hijack-c4" }), 200);
  const exAfterPut = await step("c4.f06.experts.list", "GET /api/experts", "admin", EXP, undefined, 200);
  check("F-06 experts: GET ยังมี id เดิม (ชื่อใหม่) และไม่มี id ใหม่จาก Body",
    findIn(exAfterPut, "exp-c4-fixed")?.name === "C4 Expert Fixed (แก้)" && !findIn(exAfterPut, "exp-hijack-c4") && exPut.body?.id === "exp-c4-fixed");
  const exMissingBody = expertBody("C4 Expert Missing", { id: "exp-0000000000000" });
  const exPutMissing = await step("c4.experts.update.notFound", "PUT /api/experts/:id", "admin", `${EXP}/exp-0000000000000`, exMissingBody, 200);
  check("PUT experts ไม่พบ → 200 + Body ที่ส่ง", same(exPutMissing.body, exMissingBody));
  const exAfterMissing = await step("c4.experts.list.afterNotFound", "GET /api/experts", "admin", EXP, undefined, 200);
  check("PUT experts ไม่พบ → GET ไม่มีแถวใหม่", listOf(exAfterMissing).length === listOf(exAfterPut).length && !findIn(exAfterMissing, "exp-0000000000000"));

  // --- approve / like / reply id ไม่มีจริง → 200 Body ว่าง ---
  const apNone = await step("c4.kb.approve.notFound", "POST /api/kb_articles/:id/approve", "admin", `${KB}/kb-0000000000000/approve`, undefined, 200);
  check("approve id ไม่มีจริง → 200 Body ว่าง", apNone.status === 200 && apNone.kind === "empty");
  const likeNone = await step("c4.kb.like.notFound", "POST /api/kb_articles/:id/like", "viewer", `${KB}/kb-0000000000000/like`, undefined, 200);
  check("like id ไม่มีจริง → 200 Body ว่าง", likeNone.status === 200 && likeNone.kind === "empty");
  const replyNone = await step("c4.contact.reply.notFound", "POST /api/contact_requests/:id/reply", "editor", `${CR}/cr-0000000000000/reply`, { replyMessage: "x" }, 200);
  check("reply id ไม่มีจริง → 200 Body ว่าง", replyNone.status === 200 && replyNone.kind === "empty");

  // --- contact_requests: ใหม่สุดก่อน · reply ที่ไม่ใช่ String (Q-2) ---
  const crBody = (topic: string) => ({ userId: viewerId, expertId: "exp-c4-fixed", topic, message: `${topic} — รายละเอียด` });
  const cr1 = await step("c4.contact.create.first", "POST /api/contact_requests", "viewer", CR, crBody("C4 คำถาม 1"), 200);
  const cr2 = await step("c4.contact.create.second", "POST /api/contact_requests", "viewer", CR, crBody("C4 คำถาม 2"), 200);
  const crList = await step("c4.contact.list.viewer", "GET /api/contact_requests", "viewer", CR, undefined, 200);
  check("contact_requests ใหม่สุดก่อน", same(idsOf(crList), [cr2.body?.id, cr1.body?.id]));
  const replyObj = await step("c4.q2.contact.reply.object", "POST /api/contact_requests/:id/reply", "editor", `${CR}/${cr1.body?.id}/reply`, { replyMessage: { a: 1 } }, 200);
  check("Q-2 reply: replyMessage {a:1} → ข้อความ JSON และ status Replied",
    replyObj.body?.replyMessage === '{"a":1}' && replyObj.body?.status === "Replied");

  // --- kb ใหม่สุดก่อน + TX-12 like พร้อมกัน 20 ---
  const kbLike = await step("c4.tx12.kb.create", "POST /api/kb_articles", "admin", KB, kbBody("C4 KB Like"), 200);
  const kbLikeId: string = typeof kbLike.body?.id === "string" ? kbLike.body.id : "missing";
  const kbOrder = await step("c4.kb.list.order", "GET /api/kb_articles", "admin", KB, undefined, 200);
  check("kb_articles ใหม่สุดก่อน (KB Like ก่อน KB Put)", same(idsOf(kbOrder), [kbLikeId, kbPutId]));
  const likes = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    step(`c4.tx12.like.${String(i + 1).padStart(2, "0")}`, "POST /api/kb_articles/:id/like", "viewer", `${KB}/${kbLikeId}/like`, undefined, 200)));
  const likeValues = likes.map((r) => r.body?.likes).sort((a, b) => a - b);
  check("TX-12 like: ทุกคำขอ 200 และค่า likes ที่ตอบกลับเป็น 1..20 ไม่ซ้ำ",
    likes.every((r) => r.status === 200) && same(likeValues, Array.from({ length: 20 }, (_, i) => i + 1)));
  const kbAfterLikes = await step("c4.tx12.kb.list", "GET /api/kb_articles", "admin", KB, undefined, 200);
  check("TX-12: likes = 20 พอดี", findIn(kbAfterLikes, kbLikeId)?.likes === 20);

  // --- C-15: search_logs พร้อมกัน 20 คำขอ (คำค้นเดียวกัน) → id ไม่ซ้ำ ---
  const C15 = "HRN-C4-C15-คำค้นพร้อมกัน";
  const logs = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    step(`c4.c15.searchLog.${String(i + 1).padStart(2, "0")}`, "POST /api/search_logs", "viewer", SL, { keyword: C15 }, 200)));
  check("C-15: search_logs พร้อมกัน 20 คำขอ → 200 ทั้งหมด", logs.every((r) => r.status === 200));
  const slList = await step("c4.c15.searchLogs.list", "GET /api/search_logs", "admin", SL, undefined, 200);
  const c15Ids = listOf(slList).filter((l) => l?.keyword === C15).map((l) => l.id);
  check("C-15: GET มี 20 แถวของคำค้นนี้ และ id ไม่ซ้ำ 20 รายการ", c15Ids.length === 20 && new Set(c15Ids).size === 20);

  // --- TX-08: ปิด Gap เดียวกันพร้อมกัน 5 คำขอ → 200×1 / 409×4 และ Audit RESOLVE_GAP เพิ่ม 1 แถว ---
  const GAP = "HRN-C4-GAP-ไม่มีผลลัพธ์";
  await step("c4.tx08.gap.searchLog", "POST /api/search_logs", "viewer", SL, { keyword: GAP }, 200);
  const auditCount = (r: Res, kw: string) =>
    listOf(r).filter((a) => a?.action === "RESOLVE_GAP" && typeof a?.details === "string" && a.details.includes(kw)).length;
  const auditBefore = await step("c4.tx08.audit.before", "GET /api/system_audit_logs", "admin", AUDIT, undefined, 200);
  const resolves = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    stepOneOf(`c4.tx08.resolve.${i + 1}`, "POST /api/search_resolutions", "admin", SR,
      { keyword: GAP, action: `C4 มาตรการ ${i + 1}`, assignedTo: "C4 Expert" }, [200, 409])));
  check("TX-08: ปิด Gap เดียวกันพร้อมกัน 5 คำขอ → 200×1 และ 409 ALREADY_RESOLVED ×4",
    resolves.filter((r) => r.status === 200).length === 1 &&
      resolves.filter((r) => r.status === 409 && errOf(r) === "ALREADY_RESOLVED").length === 4);
  const auditAfter = await step("c4.tx08.audit.after", "GET /api/system_audit_logs", "admin", AUDIT, undefined, 200);
  check("TX-08: Audit RESOLVE_GAP ของ keyword นี้เพิ่ม 1 แถว", auditCount(auditAfter, GAP) - auditCount(auditBefore, GAP) === 1);
  const srList = await step("c4.tx08.resolutions.list", "GET /api/search_resolutions", "admin", SR, undefined, 200);
  check("TX-08: มี Resolution ของ keyword นี้ 1 แถว", listOf(srList).filter((s) => s?.keyword === GAP).length === 1);

  // TX-08: action มี \u0000 → 500 INTERNAL_ERROR เท่านั้น และไม่มีทั้ง Resolution และ Audit ของ keyword นั้น
  const NUL_GAP = "HRN-C4-NUL-GAP";
  await step("c4.tx08.nul.searchLog", "POST /api/search_logs", "viewer", SL, { keyword: NUL_GAP }, 200);
  const nul = await step("c4.tx08.nul.resolve", "POST /api/search_resolutions", "admin", SR, { keyword: NUL_GAP, action: "C4 \u0000 มาตรการ" }, 500);
  check("TX-08 \\u0000: 500 และ Body = INTERNAL_ERROR เท่านั้น", nul.status === 500 && same(nul.body, INTERNAL));
  const srAfterNul = await step("c4.tx08.nul.resolutions.list", "GET /api/search_resolutions", "admin", SR, undefined, 200);
  const auditAfterNul = await step("c4.tx08.nul.audit.list", "GET /api/system_audit_logs", "admin", AUDIT, undefined, 200);
  check("TX-08 \\u0000: ไม่มี Resolution และไม่มี Audit ของ keyword นั้น",
    !listOf(srAfterNul).some((s) => s?.keyword === NUL_GAP) && auditCount(auditAfterNul, NUL_GAP) === 0);

  // --- ratings: เอกสารที่ถูกลบภายหลัง (Orphan) → Admin เห็น / Viewer ไม่เห็น · Rating ของ KB → ทุก role ที่เห็น KB ---
  const docRes = await step("c4.ratings.doc.create", "POST /api/documents", "admin", "/api/documents",
    { title: "C4 doc for rating", description: "d", type: "WI", departmentId: "d-pd-dl", owner: "Harness", fileType: "PDF", revision: 1, createdAt: new Date().toISOString() }, 200);
  const docId: string = typeof docRes.body?.id === "string" ? docRes.body.id : "missing";
  const rDoc = await step("c4.ratings.create.doc", "POST /api/ratings", "viewer", RT, { userId: viewerId, docOrKBId: docId, rating: 4, comment: "C4 เอกสาร" }, 200);
  const rKb = await step("c4.ratings.create.kb", "POST /api/ratings", "viewer", RT, { userId: viewerId, docOrKBId: kbLikeId, rating: 5, comment: "C4 KB" }, 200);
  await step("c4.ratings.doc.delete", "DELETE /api/documents/:id", "admin", `/api/documents/${docId}`, undefined, 200);
  const rtAdmin = await step("c4.ratings.list.admin", "GET /api/ratings", "admin", RT, undefined, 200);
  const rtViewer = await step("c4.ratings.list.viewer", "GET /api/ratings", "viewer", RT, undefined, 200);
  const rtEditor = await step("c4.ratings.list.editor", "GET /api/ratings", "editor", RT, undefined, 200);
  check("ratings: Rating ของเอกสารที่ถูกลบ → Admin เห็น", !!findIn(rtAdmin, rDoc.body?.id));
  check("ratings: Rating ของเอกสารที่ถูกลบ → Viewer / Editor ไม่เห็น", !findIn(rtViewer, rDoc.body?.id) && !findIn(rtEditor, rDoc.body?.id));
  check("ratings: Rating ของ KB (Approved) → Admin / Editor / Viewer เห็น",
    !!findIn(rtAdmin, rKb.body?.id) && !!findIn(rtEditor, rKb.body?.id) && !!findIn(rtViewer, rKb.body?.id));
  check("ratings: docOrKBId ใน GET = id เป้าหมายเดิม", findIn(rtAdmin, rKb.body?.id)?.docOrKBId === kbLikeId && findIn(rtAdmin, rDoc.body?.id)?.docOrKBId === docId);
  check("ratings ใหม่สุดก่อน (KB ก่อน เอกสาร)", same(idsOf(rtAdmin), [rKb.body?.id, rDoc.body?.id]));

  // --- สถานะสุดท้าย ---
  for (const [label, p] of [["kb", KB], ["experts", EXP], ["contact_requests", CR], ["custom_resources", RES], ["ratings", RT], ["search_logs", SL], ["search_resolutions", SR]] as const) {
    await step(`c4.final.${label}`, `GET ${p}`, "admin", p, undefined, 200);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Harness ชุด "${SUITE}" รอบ "${runName}" → ${BASE_URL}`);
  let aborted: string | null = null;
  try {
    if (SUITE === "main") await scenario();
    else if (SUITE === "01c1") await scenario01c1();
    else if (SUITE === "01c2") await scenario01c2();
    else if (SUITE === "01c3") await scenario01c3();
    else await scenario01c4();
  } catch (e: any) {
    aborted = String(e?.message || e);
    console.error(aborted);
  }
  const summary = {
    run: runName,
    suite: SUITE,
    totalRequests: seq,
    aborted,
    unexpectedStatus: unexpected,
    checkFailures,
    // ชุด 01c3 อัปโหลดไฟล์จริงลง public/uploads และ dist/uploads — Owner ลบตามรายการนี้หลังจบรอบ (README)
    ...(SUITE === "01c3" ? { uploadedTestFiles } : {}),
    requestsByRoute: Object.fromEntries([...routeCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf-8");
  console.log(
    `\nรวม ${seq} Request, ${routeCounts.size} Route, Status ไม่ตรงที่คาด ${unexpected.length} รายการ` +
      (SUITE === "main" ? "" : `, ข้อตรวจไม่ผ่าน ${checkFailures.length} ข้อ`),
  );
  if (aborted) process.exit(3);
}

main();
