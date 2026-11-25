/**
 * PERSIST-01C-0 — API Regression harness (ตัวยิง)
 *
 * ใช้: npx tsx scripts/api-regression/run.ts <ชื่อรอบ>
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

type Actor = "anon" | "bogus" | "admin" | "editor" | "viewer" | "temp";

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

const runName = process.argv[2];
if (!runName || !/^[A-Za-z0-9._-]+$/.test(runName)) {
  console.error("ใช้: npx tsx scripts/api-regression/run.ts <ชื่อรอบ>  (a-z A-Z 0-9 . _ -)");
  process.exit(2);
}
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
};

const norm = new Normalizer(
  [ADMIN_PASSWORD, PW.editor, PW.viewer, PW.temp, PW.wrong],
  ADMIN_ID,
);
const tokens: Partial<Record<Actor, string>> = {};
const routeCounts = new Map<string, number>();
const unexpected: Array<{ seq: number; name: string; expected: number; actual: number }> = [];
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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Harness รอบ "${runName}" → ${BASE_URL}`);
  let aborted: string | null = null;
  try {
    await scenario();
  } catch (e: any) {
    aborted = String(e?.message || e);
    console.error(aborted);
  }
  const summary = {
    run: runName,
    totalRequests: seq,
    aborted,
    unexpectedStatus: unexpected,
    requestsByRoute: Object.fromEntries([...routeCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf-8");
  console.log(`\nรวม ${seq} Request, ${routeCounts.size} Route, Status ไม่ตรงที่คาด ${unexpected.length} รายการ`);
  if (aborted) process.exit(3);
}

main();
