import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import {
  INITIAL_USERS,
  INITIAL_COURSES,
  INITIAL_KB_ARTICLES,
  INITIAL_EXPERTS,
  INITIAL_RATINGS,
  INITIAL_USER_PROGRESS,
  INITIAL_EXAM_RESULTS,
  INITIAL_SEARCH_LOGS,
  INITIAL_CONTACT_REQUESTS,
} from "./src/data/initialData";
import {
  DEFAULT_AVATAR_URL,
  DEFAULT_LESSON_IMAGE_URL,
} from "./src/utils/assets";
import {
  getDepartmentById,
  getMainDepartmentOf,
  getDepartmentByCode,
  getAllDepartmentsFlat,
} from "./src/utils/departmentUtils";
import {
  getInitialCompetencies,
  getInitialCertificates,
  getInitialKMContributionLogs,
  calculateLeaderboard,
} from "./src/utils/gamificationUtils";
import {
  buildSubmissionGrading,
  computeQuizScore,
  formatScore,
  parseSubmittedAnswers,
  resolveEssayTotal,
} from "./src/utils/quizRules";
import {
  User as UserType,
  DocumentItem,
  Course,
  KBArticle,
  Expert,
  SearchLog,
  UserCourseProgress,
  RatingAndComment,
  ContactRequest,
  CustomResource,
  EmployeeMaster,
  SystemAuditLog,
  UserCompetency,
  UserCertificate,
  KMContributionLog,
  AttendanceLog,
  TrainingSession,
  QuizSubmission,
} from "./src/types";
import { checkDatabase, withTransaction } from "./src/server/db";
import {
  applyEditorMerge,
  listEmployeeMaster,
  listExistingForMerge,
  lockEmployeeMaster,
  planEditorMerge,
  replaceAllEmployees,
  toEmployeeFields,
} from "./src/server/repos/employeeMaster";
import {
  approveDocument,
  deleteDocument,
  documentIdExists,
  findDocument,
  incrementCounter,
  insertDocument,
  listDocuments,
  toDocumentFields,
  updateDocument,
} from "./src/server/repos/documents";
import { classifyDbError, isDbError } from "./src/server/dbErrors";
import { loadDepartments } from "./src/server/repos/departments";
import {
  USER_FIELD_COLUMNS,
  type UserField,
  countUsers,
  employeeIdTaken,
  findUserByEmployeeIdCaseInsensitive,
  findUserById,
  findUserForAuth,
  insertInitialAdminIfEmpty,
  insertUser,
  listUsers,
  sanitizeUser,
  terminateUser,
  toTextOrNull,
  updateUser,
  userIdExists,
} from "./src/server/repos/users";
import { insertAuditLog, listAuditLogs } from "./src/server/repos/auditLogs";
import { setDepartments, type Department } from "./src/utils/departmentUtils";

dotenv.config();

// ข้อ 25: ชื่อโมเดล Gemini ตั้งผ่าน env ได้ — ถ้าตั้ง GEMINI_MODEL จะใช้ค่านั้นเสมอ
// fallback เป็น gemini-3.5-flash เพราะ gemini-2.5-flash ถูกจำกัดสิทธิ์สำหรับโปรเจกต์ที่ไม่เคยใช้
// (ตอบ 404 "no longer available") และ Google แนะนำ 3.5 Flash เป็นตัวแทน
const GEMINI_FALLBACK_MODEL = "gemini-3.5-flash";
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || GEMINI_FALLBACK_MODEL;
if (!process.env.GEMINI_MODEL) {
  console.warn(
    `⚠️ GEMINI_MODEL ไม่ได้ตั้งค่าใน .env — ใช้ค่าเริ่มต้น "${GEMINI_MODEL}"`,
  );
}

// Initialize Gemini SDK lazily with telemetry header requested by standard guidelines
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

const SALT_ROUNDS = 10;

// Mask email/phone สำหรับ Viewer ที่ดูข้อมูลของคนอื่น (ไม่ใช่ตัวเอง)
function sanitizeUserForViewer(user: UserType, viewerId: string) {
  const base = sanitizeUser(user);
  if (user.id === viewerId) return base; // เห็นข้อมูลตัวเองเต็มเสมอ
  return {
    ...base,
    email: "••••@royalmeiwa.com",
    phone: "0XX-XXX-XXXX",
  };
}

// N7: avatar ที่รับจาก client ต้องเป็น data URI ของรูปแรสเตอร์เท่านั้น (ไม่รับ SVG กัน XSS)
const AVATAR_DATA_URI_RE =
  /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const AVATAR_MAX_CHARS = 2_000_000;
function sanitizeAvatarUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > AVATAR_MAX_CHARS) {
    return undefined;
  }
  return AVATAR_DATA_URI_RE.test(raw) ? raw : undefined;
}

// N7: map แผนกที่ AI อ่านได้ -> Department จริงใน departmentUtils (ไม่เดา ถ้าไม่ตรงคืน undefined)
function resolveDepartment(code: unknown, rawName: unknown) {
  const c = String(code ?? "")
    .trim()
    .toUpperCase();
  if (c) {
    const byCode = getDepartmentByCode(c);
    if (byCode) return byCode;
  }
  const n = String(rawName ?? "")
    .trim()
    .toLowerCase();
  if (!n) return undefined;
  const byRawCode = getDepartmentByCode(n.toUpperCase());
  if (byRawCode) return byRawCode;
  return getAllDepartmentsFlat().find(
    (d) =>
      d.name.toLowerCase() === n || d.name.split(" (")[0].toLowerCase() === n,
  );
}

// ============================================================
// --- AUTH: JWT setup + middleware ---
// ============================================================

const isProduction = process.env.NODE_ENV === "production";
if (!process.env.JWT_SECRET) {
  if (isProduction) {
    console.error(
      "❌ FATAL: JWT_SECRET environment variable is missing. Server cannot start in production.",
    );
    process.exit(1);
  } else {
    console.warn(
      "⚠️ [DEV WARNING] JWT_SECRET is not set. Generating temporary random secret for this session. Set JWT_SECRET in .env for persistent sessions.",
    );
  }
}
const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

interface AuthPayload {
  id: string;
  employeeId: string;
  role: string;
}

interface CurrentUserAuth {
  id: string;
  employeeId: string;
  role: string;
  departmentId: string;
  name: string;
  status?: string;
}

// ขยาย express Request ให้เก็บ user ที่ resolve จาก DB ปัจจุบัน
declare global {
  namespace Express {
    interface Request {
      authUser?: CurrentUserAuth;
    }
  }
}

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
}

// 01C-1 B5: Error จากฐานข้อมูล → 500 แบบทั่วไป ไม่ส่ง err.message ของ DB ให้ Client
const INTERNAL_ERROR_BODY = {
  error: "INTERNAL_ERROR",
  message: "เกิดข้อผิดพลาดภายในระบบ",
} as const;

function sendDbFailure(res: express.Response, err: unknown, where: string) {
  const info = classifyDbError(err);
  const e = err as { name?: unknown; code?: unknown };
  console.error("[db] request failed", {
    where,
    kind: info.kind,
    sqlstate: info.sqlstate,
    constraint: info.constraint,
    name: typeof e?.name === "string" ? e.name : undefined,
    code: typeof e?.code === "string" ? e.code : undefined,
  });
  return res.status(500).json(INTERNAL_ERROR_BODY);
}

// ต้อง login (มี token ที่ถูกต้อง) ถึงจะเข้าถึง endpoint นี้ได้
// ความปลอดภัยระดับ Single Source of Truth: resolve role, departmentId, และ status จาก DB ปัจจุบันเสมอ
async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "UNAUTHORIZED", message: "กรุณาเข้าสู่ระบบก่อนใช้งาน" });
  }
  const token = header.slice("Bearer ".length);
  let decoded: AuthPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return res.status(401).json({
      error: "INVALID_TOKEN",
      message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
    });
  }
  let userInDb: UserType | undefined;
  try {
    // Resolve current DB user: DB user is current authority
    userInDb = await findUserForAuth(decoded?.id, decoded?.employeeId);
  } catch (err) {
    return sendDbFailure(res, err, "requireAuth");
  }
  if (!userInDb) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "ไม่พบข้อมูลผู้ใช้ในระบบ หรือบัญชีถูกลบแล้ว",
    });
  }
  if (userInDb.status === "Suspended" || userInDb.status === "Terminated") {
    return res.status(403).json({
      error: "ACCOUNT_DISABLED",
      message: "บัญชีผู้ใช้ถูกระงับสิทธิ์การใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
    });
  }
  req.authUser = {
    id: userInDb.id,
    employeeId: userInDb.employeeId,
    role: userInDb.role,
    departmentId: userInDb.departmentId,
    name: userInDb.name,
    status: userInDb.status,
  };
  next();
}

// Document Department Authorization: Single Source of Truth
function canAccessDocument(
  user: CurrentUserAuth | undefined,
  doc: DocumentItem | undefined,
): boolean {
  if (!user || !doc) return false;
  // Admin bypasses Document Department Access layer
  if (user.role === "Admin") return true;

  // Validate user department exists in system — fail-closed if invalid
  const userDept = getDepartmentById(user.departmentId);
  if (!userDept) return false;

  // Target allowed departments: doc.allowedDepartmentIds + owner doc.departmentId
  const allowedDeptIds =
    Array.isArray(doc.allowedDepartmentIds) &&
    doc.allowedDepartmentIds.length > 0
      ? doc.allowedDepartmentIds
      : [doc.departmentId];

  const targetDepts = Array.from(
    new Set([...allowedDeptIds, doc.departmentId]),
  ).filter(Boolean);

  for (const targetId of targetDepts) {
    // 1. Direct department match
    if (user.departmentId === targetId) return true;

    // 2. Department inheritance: ONE-WAY Main Department -> Sub Department
    // Sibling or Sub -> Main is strictly DENIED
    if (userDept.parentId === null) {
      const targetDept = getDepartmentById(targetId);
      if (targetDept && targetDept.parentId === userDept.id) {
        return true;
      }
    }
  }

  return false;
}

// Normalize allowedDepartmentIds: validate IDs, dedupe, and enforce owner department inclusion
// Throws Error with INVALID_DEPARTMENT_ACCESS on any unrecognized department ID
function normalizeAllowedDepartments(
  ownerDeptId: string,
  rawAllowedIds: unknown,
): string[] {
  const result = new Set<string>();
  const ownerDept = getDepartmentById(ownerDeptId);
  if (!ownerDept) {
    const err: any = new Error(
      `แผนกเจ้าของเอกสาร "${ownerDeptId}" ไม่ถูกต้องหรือไม่พบในระบบ`,
    );
    err.code = "INVALID_DEPARTMENT_ACCESS";
    throw err;
  }
  result.add(ownerDeptId);

  if (rawAllowedIds !== undefined && rawAllowedIds !== null) {
    if (!Array.isArray(rawAllowedIds)) {
      const err: any = new Error(
        "allowedDepartmentIds ต้องเป็น Array ของรหัสแผนก",
      );
      err.code = "INVALID_DEPARTMENT_ACCESS";
      throw err;
    }
    for (const id of rawAllowedIds) {
      if (
        typeof id !== "string" ||
        !id.trim() ||
        !getDepartmentById(id.trim())
      ) {
        const err: any = new Error(
          `รหัสแผนก "${id}" ไม่ถูกต้องหรือไม่พบในระบบ`,
        );
        err.code = "INVALID_DEPARTMENT_ACCESS";
        throw err;
      }
      result.add(id.trim());
    }
  }
  return Array.from(result);
}

// ต้องมี role ที่กำหนดเท่านั้นถึงจะผ่าน (ใช้ต่อจาก requireAuth เสมอ)
function requireRole(...allowedRoles: string[]) {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (!req.authUser || !allowedRoles.includes(req.authUser.role)) {
      return res
        .status(403)
        .json({ error: "FORBIDDEN", message: "คุณไม่มีสิทธิ์ดำเนินการนี้" });
    }
    next();
  };
}

// N10: Admin/Editor เห็นข้อมูลผลเรียนทั้งหมด (ตามที่ UI รายงานต้องใช้) / Viewer เห็นเฉพาะของตัวเอง
function canViewAllLearningData(user: CurrentUserAuth | undefined): boolean {
  return user?.role === "Admin" || user?.role === "Editor";
}
//ตรวจว่า field ที่ระบุ (userId หรือ employeeId) ในbody ตรงกับเจ้าของ token จริง
// Admin bypass ได้เสมอ (เผื่อกรณีแอดมินต้องแก้ไข/บันทึกข้อมูลของคนอื่น)
function requireOwnField(field: "userId" | "employeeId") {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (req.authUser?.role === "Admin") return next();
    const bodyValue = req.body[field];
    const ownValue =
      field === "userId" ? req.authUser?.id : req.authUser?.employeeId;
    if (!bodyValue || bodyValue !== ownValue) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "ไม่สามารถบันทึกหรือแก้ไขข้อมูลแทนผู้อื่นได้",
      });
    }
    next();
  };
}

/**
 * สร้างบัญชี Admin คนแรกใน km.users ตอนเริ่ม Server — เฉพาะเมื่อตาราง users ยังว่าง (มีผู้ใช้แล้ว = ไม่แตะ)
 * P-5: ต้องตั้ง INITIAL_ADMIN_EMPLOYEE_ID และ INITIAL_ADMIN_PASSWORD ใน .env (ไม่ตั้ง = โยน Error → ไม่เปิด Server)
 *      ไม่มีการสุ่มรหัสผ่านและไม่พิมพ์รหัสผ่านลง Console อีกต่อไป
 * INITIAL_ADMIN_DEPARTMENT_ID: ว่าง = d-it (ค่าเริ่มต้นเดิม) · ระบุแล้วต้องเป็นแผนกที่มีจริง
 * ต้องเรียกหลัง setDepartments()
 */
async function ensureInitialAdmin(): Promise<void> {
  if ((await countUsers()) > 0) return;

  const employeeId = process.env.INITIAL_ADMIN_EMPLOYEE_ID;
  const plainPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!employeeId || !plainPassword) {
    throw new Error(
      "ตาราง users ว่าง แต่ไม่ได้ตั้ง INITIAL_ADMIN_EMPLOYEE_ID และ INITIAL_ADMIN_PASSWORD ใน .env — ไม่สามารถสร้าง Admin เริ่มต้นได้",
    );
  }
  const departmentId = process.env.INITIAL_ADMIN_DEPARTMENT_ID || "d-it";
  if (!getDepartmentById(departmentId)) {
    throw new Error(
      `INITIAL_ADMIN_DEPARTMENT_ID "${departmentId}" ไม่ใช่แผนกที่มีในระบบ`,
    );
  }

  const passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
  const inserted = await insertInitialAdminIfEmpty({
    id: `usr-${Date.now()}`,
    fields: {
      name: process.env.INITIAL_ADMIN_NAME || "ผู้ดูแลระบบเริ่มต้น",
      employeeId,
      departmentId,
      position: process.env.INITIAL_ADMIN_POSITION || "ผู้ดูแลระบบ",
      role: "Admin",
      email: process.env.INITIAL_ADMIN_EMAIL || "admin@royalmeiwa.com",
      phone: process.env.INITIAL_ADMIN_PHONE || "02-000-0000",
      avatarUrl: DEFAULT_AVATAR_URL,
      startDate: new Date().toISOString().split("T")[0],
    },
    passwordHash,
  });
  if (!inserted) return; // มีผู้ใช้ถูกเพิ่มระหว่างทาง — ไม่แตะ

  console.log("");
  console.log("========================================================");
  console.log("🔐 ไม่พบบัญชีผู้ใช้ในระบบ — สร้างบัญชี Admin เริ่มต้นแล้ว");
  console.log(`   Employee ID: ${employeeId}`);
  console.log("   Password:    (ตามที่ตั้งไว้ใน .env)");
  console.log("========================================================");
  console.log("");
}

// 01C-1 B3 / C-05: ค่า departmentId จาก Body → ค่าที่เก็บ (undefined/null/"" = NULL) หรือ invalid
function normalizeUserDepartment(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: null };
  }
  const id = typeof raw === "string" ? raw : String(raw);
  return getDepartmentById(id) ? { ok: true, value: id } : { ok: false };
}

const INVALID_USER_DEPARTMENT_BODY = {
  error: "INVALID_DEPARTMENT",
  message: "ไม่พบแผนกที่ระบุ",
} as const;
const DUPLICATE_USER_ID_BODY = {
  error: "DUPLICATE_USER_ID",
  message: "รหัสผู้ใช้ (id) นี้มีอยู่ในระบบแล้ว",
} as const;
const DUPLICATE_EMPLOYEE_ID_BODY = {
  error: "DUPLICATE_EMPLOYEE_ID",
  message: "รหัสพนักงานนี้มีอยู่ในระบบแล้ว (รวมบัญชีที่ถูกยกเลิกการใช้งาน)",
} as const;

// 01C-1 B5: Error ของ DB ใน Route ผู้ใช้ → HTTP
function sendUserWriteError(
  res: express.Response,
  err: unknown,
  where: string,
) {
  const info = classifyDbError(err);
  if (info.kind === "unique" && info.constraint === "users_pk") {
    return res.status(409).json(DUPLICATE_USER_ID_BODY);
  }
  if (
    info.kind === "unique" &&
    info.constraint === "users_employee_id_lower_uq"
  ) {
    return res.status(409).json(DUPLICATE_EMPLOYEE_ID_BODY);
  }
  if (
    info.kind === "foreign_key" &&
    info.constraint === "users_department_fk"
  ) {
    return res.status(400).json(INVALID_USER_DEPARTMENT_BODY);
  }
  return sendDbFailure(res, err, where);
}

/** ช่องของผู้ใช้ที่ Body ส่งมา (เฉพาะช่องที่รู้จัก) → ค่าที่เก็บ — departmentId ต้องผ่าน normalizeUserDepartment ก่อน */
function pickUserFields(
  body: Record<string, unknown>,
  departmentId: string | null | undefined,
): Partial<Record<UserField, string | null>> {
  const out: Partial<Record<UserField, string | null>> = {};
  for (const [field] of USER_FIELD_COLUMNS) {
    if (field === "departmentId") {
      if (departmentId !== undefined) out.departmentId = departmentId;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      out[field] = toTextOrNull(body[field]);
    }
  }
  // 01C-1 (Owner): employeeId ว่างหรือมีแต่ช่องว่าง = ไม่มีรหัสพนักงาน → NULL
  // (Unique index lower(employee_id) ยอมให้ NULL ได้หลายแถว — ค่าที่มีตัวอักษรเก็บตามที่ส่งมา ไม่ trim)
  if (typeof out.employeeId === "string" && out.employeeId.trim() === "") {
    out.employeeId = null;
  }
  return out;
}

// N6: บันทึกการปิดช่องว่างความรู้ (Knowledge Gap) จาก Report D
interface SearchResolution {
  id: string;
  keyword: string; // ตรงกับ SearchLog.keyword แบบดิบ
  action: string; // มาตรการ/SOP ที่ใช้ปิดช่องว่าง
  assignedTo?: string; // ผู้เชี่ยวชาญ/ผู้รับมอบ (ไม่บังคับ)
  resolvedBy: string; // employeeId จาก token
  resolvedByName: string;
  resolvedAt: string;
}

async function startServer() {
  // PERSIST-01C-0: ต้องต่อฐานข้อมูล km_rmp ได้ก่อนเปิด Server (fail closed) — ข้อความไม่มีค่าลับ
  // PERSIST-01C-1: โหลดแผนกจาก DB (§21.25 — 0 แถว = ไม่เปิด) แล้วสร้าง Admin เริ่มต้นถ้าตาราง users ว่าง (P-5)
  let departmentsForApi: Department[] = [];
  try {
    await checkDatabase();
    departmentsForApi = await loadDepartments();
    if (departmentsForApi.length === 0) {
      throw new Error("ตาราง km.departments ไม่มีข้อมูล — ยังไม่ได้รัน seed แผนก");
    }
    setDepartments(departmentsForApi);
    await ensureInitialAdmin();
  } catch (err) {
    console.error(
      "❌ FATAL: เตรียมฐานข้อมูลไม่ผ่าน (ตรวจการเชื่อมต่อ / แผนก / Admin เริ่มต้น) Server ไม่เปิด —",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // --- In-Memory Databases mirroring real SQL/NoSQL schemas ---
  // users และ system_audit_logs อยู่ใน DB แล้ว (01C-1), employee_master (01C-2),
  // documents + ACL (01C-3) — ดู src/server/repos/
  let db_courses: Course[] = [...INITIAL_COURSES];
  let db_kb_articles: KBArticle[] = [...INITIAL_KB_ARTICLES];
  let db_experts: Expert[] = [...INITIAL_EXPERTS];
  let db_ratings: RatingAndComment[] = [...INITIAL_RATINGS];
  let db_user_progress: UserCourseProgress[] = [...INITIAL_USER_PROGRESS];
  let db_exam_results: any[] = [...INITIAL_EXAM_RESULTS];
  let db_search_logs: SearchLog[] = [...INITIAL_SEARCH_LOGS];
  let db_contact_requests: ContactRequest[] = [...INITIAL_CONTACT_REQUESTS];
  let db_custom_resources: CustomResource[] = [];
  let db_user_competencies: UserCompetency[] = INITIAL_USERS.flatMap((u) =>
    getInitialCompetencies(u.id, u.departmentId, u.position),
  );
  let db_user_certificates: UserCertificate[] = INITIAL_USERS.flatMap((u) =>
    getInitialCertificates(u.id, u.employeeId),
  );
  let db_km_contribution_logs: KMContributionLog[] =
    getInitialKMContributionLogs();
  let db_attendance_logs: AttendanceLog[] = [];
  let db_training_sessions: TrainingSession[] = [];
  let db_quiz_submissions: QuizSubmission[] = [];
  let db_search_resolutions: SearchResolution[] = [];

  // --- Quiz: server เป็นผู้ตัดสินคะแนนเท่านั้น ไม่เชื่อค่าที่ client ส่ง ---
  // กฎตรวจ/คิดคะแนนอยู่ที่ src/utils/quizRules.ts (ใช้ร่วมกับ Reviewer preview)

  // D3 / U-06: Generic 500 — ตอนนี้ใช้เฉพาะ Fail closed ของ D1 (catch จุดอื่นยังไม่เปลี่ยน — U-08)
  const QUIZ_INTERNAL_ERROR = {
    error: "INTERNAL_ERROR",
    message: "เกิดข้อผิดพลาดภายในระบบ",
  } as const;

  // ปิดผลสอบ: สร้าง exam_result และตั้ง Completed (เมื่อผ่าน) — เรียกเมื่อไม่มี Essay ที่ตอบแล้ว
  // หรือเมื่อผู้ตรวจให้คะแนน Essay ครบแล้ว
  // `essayTotal` ต้องเป็นค่าที่ทราบแน่นอน (D1): Submit ส่งค่าที่เพิ่งนับ, Grade ส่งผลของ resolveEssayTotal
  // ห้ามใช้ essayQuestionIds.length แทน (P-21: ไม่รวม Essay ที่ไม่ได้ตอบ)
  function finalizeSubmission(
    sub: QuizSubmission,
    course: Course,
    essayTotal: number,
    reviewerEmployeeId?: string,
  ) {
    const essayCorrect = sub.essayGrades.filter((g) => g.correct).length;
    // P-25 / ODR-01 / XP perfect — throw RangeError ถ้า Precondition ไม่ผ่าน (ก่อนแก้ข้อมูลใด ๆ)
    const { score, pass, perfect } = computeQuizScore({
      correctCount: sub.autoCorrect + essayCorrect,
      totalCount: sub.autoTotal + essayTotal,
      minPassScore: course.minPassScore,
    });
    const nowIso = new Date().toISOString();

    sub.status = "Finalized";
    sub.score = score;
    sub.pass = pass;
    if (reviewerEmployeeId) {
      sub.reviewedBy = reviewerEmployeeId;
      sub.reviewedAt = nowIso;
    }

    // เช็คก่อนเพิ่มผลสอบครั้งนี้ ว่าเคยสอบผ่านหลักสูตรนี้มาก่อนหรือไม่ (ใช้กำหนดว่าจะให้ XP)
    const passedBefore = db_exam_results.some(
      (e) =>
        e.employeeId === sub.employeeId &&
        e.courseId === sub.courseId &&
        e.pass,
    );

    db_exam_results.unshift({
      id: `ex-${crypto.randomUUID()}`,
      submissionId: sub.id,
      employeeName: sub.userName,
      employeeId: sub.employeeId,
      courseId: sub.courseId,
      courseTitle: sub.courseTitle,
      score,
      pass,
      date: nowIso.split("T")[0],
    });

    if (pass) {
      const idx = db_user_progress.findIndex(
        (p) => p.userId === sub.userId && p.courseId === sub.courseId,
      );
      if (idx !== -1) {
        db_user_progress[idx] = {
          ...db_user_progress[idx],
          status: "Completed",
          score,
          completedDate: nowIso,
          attemptsCount: db_user_progress[idx].attemptsCount + 1,
        };
      } else {
        db_user_progress.push({
          id: `prog-${crypto.randomUUID()}`,
          userId: sub.userId,
          courseId: sub.courseId,
          status: "Completed",
          score,
          startDate: nowIso,
          completedDate: nowIso,
          attemptsCount: 1,
          totalStudyMinutes: 0,
        });
      }

      // XP: ให้เฉพาะการสอบผ่านครั้งแรกของหลักสูตรนั้น กันเก็บ XP ซ้ำจากการสอบซ้ำ
      if (!passedBefore) {
        // XP perfect = ตอบถูกทุกข้อ (totalCount > 0 && correctCount === totalCount) ไม่ใช่ score === 100
        const isPerfect = perfect;
        db_km_contribution_logs.unshift({
          id: `km-log-${crypto.randomUUID()}`,
          userId: sub.userId,
          userName: sub.userName,
          points: isPerfect ? 30 : 20,
          activityType: isPerfect ? "COURSE_PERFECT" : "COURSE_PASS",
          description: isPerfect
            ? `อบรมผ่านหลักสูตร "${sub.courseTitle}" ด้วยคะแนนเต็ม 100%`
            : `สอบผ่านหลักสูตร "${sub.courseTitle}" ด้วยคะแนน ${formatScore(score)}%`,
          timestamp: nowIso,
        });
      }

      // ออกหรือ ต่ออายุใบรับรองที่ผูกกับหลักสูตรนี้ทุกครั้งที่สอบผ่าน
      const todayStr = nowIso.split("T")[0];
      const nextYearStr = new Date(Date.now() + 365 * 24 * 3600 * 1000)
        .toISOString()
        .split("T")[0];

      const certificateIndex = db_user_certificates.findIndex(
        (cert) => cert.userId === sub.userId && cert.courseId === sub.courseId,
      );

      if (certificateIndex !== -1) {
        // มี Certificate เดิม → ต่ออายุ
        db_user_certificates[certificateIndex] = {
          ...db_user_certificates[certificateIndex],
          issueDate: todayStr,
          expiryDate: nextYearStr,
          status: "Valid" as const,
          daysRemaining: 365,
        };
      } else {
        // ยังไม่มี Certificate → ออกใบใหม่หลังสอบผ่านครั้งแรก
        db_user_certificates.push({
          id: `cert-${crypto.randomUUID()}`,
          userId: sub.userId,
          employeeId: sub.employeeId,
          title: sub.courseTitle,
          type: course.type,
          courseId: sub.courseId,
          issueDate: todayStr,
          expiryDate: nextYearStr,
          status: "Valid" as const,
          daysRemaining: 365,
        });
      }
    }

    return { score, pass };
  }

  // ตัดเฉลยออกจากคอร์สก่อนส่งให้ Viewer
  // Matching: pairs คือเฉลยเอง จึงส่งเฉพาะฝั่งซ้าย และสลับตัวเลือกฝั่งขวาใน options
  function stripQuizAnswers(course: Course): Course {
    return {
      ...course,
      quiz: (course.quiz || []).map((q) => {
        const { correctAnswer, ...rest } = q;
        if (q.type === "Matching" && q.pairs) {
          const rights = q.pairs.map((p) => p.right);
          for (let i = rights.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rights[i], rights[j]] = [rights[j], rights[i]];
          }
          return {
            ...rest,
            correctAnswer: "",
            pairs: q.pairs.map((p) => ({ left: p.left, right: "" })),
            options: rights,
          };
        }
        return { ...rest, correctAnswer: "" };
      }),
    };
  }

  // Add JSON parsing middleware up to 50MB to handle document corpus payloads and file uploads safely
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // ============================================================
  // --- AUTH ENDPOINTS (ไม่ต้อง requireAuth เพราะเป็นทางเข้าระบบ) ---
  // ============================================================

  // --- Simple in-memory rate limiter สำหรับ /api/login ---
  // กัน brute-force PIN 6 หลัก (1,000,000 combinations) โดยไม่ต้องพึ่ง external package
  const loginAttempts = new Map<
    string,
    { count: number; firstAttemptAt: number; lockedUntil?: number }
  >();
  const LOGIN_MAX_ATTEMPTS = 5;
  const LOGIN_WINDOW_MS = 10 * 60 * 1000; // 10 นาที
  const LOGIN_LOCKOUT_MS = 5 * 60 * 1000; // ล็อก 15 นาทีหลังพยายามเกิน

  function getLoginKey(req: express.Request, employeeId: string): string {
    // ผูกกับ employeeId + IP เพื่อไม่ให้คนอื่นโดนล็อกร่วมกันถ้าใช้ NAT/proxy เดียวกัน
    return `${employeeId.toLowerCase()}::${req.ip}`;
  }

  function checkLoginRateLimit(
    req: express.Request,
    employeeId: string,
  ): { allowed: boolean; retryAfterSec?: number } {
    const key = getLoginKey(req, employeeId);
    const now = Date.now();
    const entry = loginAttempts.get(key);

    if (entry?.lockedUntil && entry.lockedUntil > now) {
      return {
        allowed: false,
        retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000),
      };
    }

    if (!entry || now - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
      loginAttempts.set(key, { count: 0, firstAttemptAt: now });
    }
    return { allowed: true };
  }

  function recordLoginFailure(req: express.Request, employeeId: string) {
    const key = getLoginKey(req, employeeId);
    const now = Date.now();
    const entry = loginAttempts.get(key) || { count: 0, firstAttemptAt: now };
    entry.count += 1;
    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
      entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
    }
    loginAttempts.set(key, entry);
  }

  function clearLoginAttempts(req: express.Request, employeeId: string) {
    loginAttempts.delete(getLoginKey(req, employeeId));
  }

  // Login: ตรวจ employeeId + password ที่ server แล้วออก JWT กลับไป
  app.post("/api/login", async (req, res) => {
    try {
      const { employeeId, password } = req.body;
      if (!employeeId || !password) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          message: "กรุณากรอกรหัสพนักงานและรหัสผ่าน",
        });
      }

      const rateCheck = checkLoginRateLimit(req, employeeId);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          error: "TOO_MANY_ATTEMPTS",
          message: `ลองรหัสผ่านผิดหลายครั้งเกินไป กรุณารออีก ${rateCheck.retryAfterSec} วินาทีแล้วลองใหม่`,
        });
      }

      const user = await findUserByEmployeeIdCaseInsensitive(
        String(employeeId),
      );
      if (!user) {
        recordLoginFailure(req, employeeId);
        return res.status(401).json({
          error: "INVALID_CREDENTIALS",
          message: "ไม่พบรหัสพนักงานนี้ในระบบ",
        });
      }
      if (user.status === "Suspended") {
        return res
          .status(403)
          .json({ error: "SUSPENDED", message: "บัญชีถูกระงับสิทธิ์ชั่วคราว" });
      }
      if (user.status === "Terminated") {
        return res
          .status(403)
          .json({ error: "TERMINATED", message: "บัญชีถูกยกเลิกการใช้งาน" });
      }

      const isValid = user.password
        ? await bcrypt.compare(password, user.password)
        : false;
      if (!isValid) {
        recordLoginFailure(req, employeeId);
        return res.status(401).json({
          error: "INVALID_CREDENTIALS",
          message: "รหัสผ่านไม่ถูกต้อง",
        });
      }
      clearLoginAttempts(req, employeeId);
      const token = signToken({
        id: user.id,
        employeeId: user.employeeId,
        role: user.role,
      });

      res.json({ user: sanitizeUser(user), token });
    } catch (err: any) {
      if (isDbError(err)) return sendDbFailure(res, err, "POST /api/login");
      res.status(500).json({ error: err.message });
    }
  });

  // SEC-03A: ปิดการสมัครสมาชิกสาธารณะ — บัญชีใหม่สร้างได้เฉพาะ Admin ผ่าน POST /api/users
  // คง route ไว้เพื่อให้ผู้เรียกเดิมได้ 403 ที่ชัดเจน แทนที่จะเป็น 404/SPA fallback
  app.post("/api/register", (_req, res) => {
    res.status(403).json({
      error: "REGISTRATION_DISABLED",
      message:
        "ระบบปิดการลงทะเบียนด้วยตนเอง กรุณาติดต่อผู้ดูแลระบบเพื่อเปิดบัญชีใช้งาน",
    });
  });
  // --- Secure File Upload API Endpoint & Store (ต้อง login ก่อนอัปโหลด) ---
  interface UploadedFileMeta {
    buffer: Buffer;
    mimeType: string;
    uploadedBy: string; // employeeId ของผู้อัปโหลด
    restricted: boolean; // true = เฉพาะ Admin หรือผู้อัปโหลดเองเท่านั้นที่อ่านได้ (สำหรับไฟล์ QP)
    documentId?: string; // id ของ Document ที่ไฟล์นี้ผูกอยู่ (Server-owned binding)
    courseId?: string; // id ของ Course ที่ไฟล์สื่อนี้ผูกอยู่ (Server-owned binding) หรือ marker "deleted:<id>" / "replaced:<id>"
    uploadedAt: string;
  }
  const uploadedFiles = new Map<string, UploadedFileMeta>();

  const uploadsDirs = [
    path.join(process.cwd(), "public", "uploads"),
    path.join(process.cwd(), "dist", "uploads"),
  ];

  function loadSidecar(storedName: string): UploadedFileMeta | null {
    if (uploadedFiles.has(storedName)) {
      return uploadedFiles.get(storedName)!;
    }
    for (const dir of uploadsDirs) {
      const metaPath = path.join(dir, `${storedName}.meta.json`);
      const filePath = path.join(dir, storedName);
      if (fs.existsSync(metaPath) && fs.existsSync(filePath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          const meta: UploadedFileMeta = {
            buffer: fs.readFileSync(filePath),
            mimeType: raw.mimeType || "application/octet-stream",
            uploadedBy: raw.uploadedBy || "",
            restricted: !!raw.restricted,
            documentId: raw.documentId || undefined,
            courseId: raw.courseId || undefined,
            uploadedAt: raw.uploadedAt || new Date().toISOString(),
          };
          uploadedFiles.set(storedName, meta);
          return meta;
        } catch (e) {
          console.warn("Failed to parse sidecar:", metaPath, e);
        }
      }
    }
    return null;
  }

  function updateSidecar(
    storedName: string,
    updates: Partial<UploadedFileMeta>,
  ) {
    const existing = loadSidecar(storedName);
    if (!existing) return;
    Object.assign(existing, updates);
    uploadedFiles.set(storedName, existing);

    const sidecarJson = JSON.stringify({
      mimeType: existing.mimeType,
      uploadedBy: existing.uploadedBy,
      restricted: existing.restricted,
      documentId: existing.documentId,
      courseId: existing.courseId,
      uploadedAt: existing.uploadedAt,
    });

    uploadsDirs.forEach((dir) => {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const metaPath = path.join(dir, `${storedName}.meta.json`);
        fs.writeFileSync(metaPath, sidecarJson);
      } catch (e) {
        console.warn("Failed to write sidecar:", dir, e);
      }
    });
  }
  // ============================================================
  // --- BUG-04: Course Media binding ---
  // ============================================================
  const COURSE_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
  const STORED_UPLOAD_NAME_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,10}$/i;

  function sidecarJsonOf(meta: UploadedFileMeta): string {
    return JSON.stringify({
      mimeType: meta.mimeType,
      uploadedBy: meta.uploadedBy,
      restricted: meta.restricted,
      documentId: meta.documentId,
      courseId: meta.courseId,
      uploadedAt: meta.uploadedAt,
    });
  }

  // ตั้งค่า courseId ของไฟล์แบบเข้มงวด:
  // - เขียน sidecar ลงทุก directory ที่ "มีไฟล์จริงอยู่" (public/uploads และ/หรือ dist/uploads)
  // - คืน true เฉพาะเมื่อเขียนสำเร็จครบทุก directory เหล่านั้น
  // - ถ้าล้มเหลวบางที่: คืนค่า memory กลับ และเขียน sidecar เดิมทับ directory ที่เขียนสำเร็จไปแล้ว (best-effort)
  //   หากกู้คืนไม่สำเร็จ จะ log ชื่อไฟล์และ directory ที่ต้องตรวจสอบด้วยตนเอง
  // หมายเหตุ: ไม่ใช่ atomic transaction — เป็นเพียง best-effort rollback
  function setFileCourseBinding(
    storedName: string,
    courseId: string | undefined,
  ): boolean {
    const meta = loadSidecar(storedName);
    if (!meta) return false;
    if (meta.courseId === courseId) return true;

    const targets = uploadsDirs.filter((dir) =>
      fs.existsSync(path.join(dir, storedName)),
    );
    if (targets.length === 0) {
      console.error(
        `[COURSE_MEDIA] ไม่พบไฟล์ ${storedName} บนดิสก์ จึงบันทึก sidecar ไม่ได้`,
      );
      return false;
    }

    const previousCourseId = meta.courseId;
    const previousJson = sidecarJsonOf(meta);
    meta.courseId = courseId;
    const nextJson = sidecarJsonOf(meta);

    const written: string[] = [];
    let failed = false;
    for (const dir of targets) {
      try {
        fs.writeFileSync(path.join(dir, `${storedName}.meta.json`), nextJson);
        written.push(dir);
      } catch (e) {
        failed = true;
        console.error(
          `[COURSE_MEDIA] เขียน sidecar ไม่สำเร็จ: ${storedName} ใน ${dir}`,
          e,
        );
      }
    }

    if (!failed) return true;

    meta.courseId = previousCourseId;
    for (const dir of written) {
      try {
        fs.writeFileSync(
          path.join(dir, `${storedName}.meta.json`),
          previousJson,
        );
      } catch (e) {
        console.error(
          `[COURSE_MEDIA] กู้คืน sidecar ไม่สำเร็จ ต้องตรวจสอบด้วยตนเอง: ${storedName} ใน ${dir}`,
          e,
        );
      }
    }
    return false;
  }

  // สแกน lessons[].mediaUrl: คืนชื่อไฟล์ local (/uploads/<uuid>.<ext>) ที่อ้างถึง
  // - URL ภายนอก http(s) และ data URL ที่ตรงกับ DEFAULT_LESSON_IMAGE_URL ของระบบเท่านั้น ผ่านได้และไม่มี binding
  // - รูปแบบอื่น (เช่น javascript:, ../ ใน path) ถูกปฏิเสธ
  type MediaScan =
    | { ok: true; files: Set<string> }
    | { ok: false; message: string };
  function scanLessonMedia(lessons: unknown): MediaScan {
    const files = new Set<string>();
    if (lessons === undefined || lessons === null) return { ok: true, files };
    if (!Array.isArray(lessons)) {
      return {
        ok: false,
        message: "โครงสร้างบทเรียนไม่ถูกต้อง (lessons ต้องเป็นอาร์เรย์)",
      };
    }
    for (const lesson of lessons) {
      if (!lesson || typeof lesson !== "object") {
        return { ok: false, message: "ข้อมูลบทเรียนบางรายการไม่ถูกต้อง" };
      }
      const raw = (lesson as { mediaUrl?: unknown }).mediaUrl;
      if (raw === undefined || raw === null || raw === "") continue;
      if (typeof raw !== "string") {
        return { ok: false, message: "ลิงก์สื่อการสอนต้องเป็นข้อความ" };
      }
      const url = raw.trim();
      if (url.startsWith("/uploads/")) {
        const name = url.slice("/uploads/".length).split("?")[0];
        if (!STORED_UPLOAD_NAME_RE.test(name)) {
          return { ok: false, message: "ลิงก์ไฟล์สื่อในระบบไม่ถูกต้อง" };
        }
        files.add(name);
      } else if (
        /^https?:\/\//i.test(url) ||
        url === DEFAULT_LESSON_IMAGE_URL
      ) {
        continue;
      } else {
        return {
          ok: false,
          message:
            "ลิงก์สื่อการสอนต้องเป็นไฟล์ที่อัปโหลดในระบบ หรือ URL แบบ http/https เท่านั้น",
        };
      }
    }
    return { ok: true, files };
  }

  // ไฟล์ต้องมีอยู่จริงบนดิสก์อย่างน้อยหนึ่ง directory (ตรรกะเดียวกับ targets ใน setFileCourseBinding)
  // ใช้ตรวจก่อนสร้าง binding ใหม่ เพราะ loadSidecar() อาจคืนค่าจาก cache ใน memory แม้ไฟล์บนดิสก์หายไปแล้ว
  function uploadedFileExistsOnDisk(storedName: string): boolean {
    return uploadsDirs.some((dir) => fs.existsSync(path.join(dir, storedName)));
  }

  type CourseMediaFailure = {
    ok: false;
    status: number;
    error: string;
    message: string;
  };

  // ผูก/ปล่อย binding ของไฟล์สื่อตาม lifecycle ของ Course (create / update / delete)
  // ลำดับ: ตรวจสอบทุกไฟล์ก่อน (ยังไม่เขียนอะไร) → ผูกไฟล์ใหม่ → ปล่อยไฟล์ที่เลิกใช้
  // ถ้าขั้นใดล้มเหลว จะย้อนการเปลี่ยนแปลงที่ทำไปแล้วใน request นี้ และคืน failure (caller ต้องไม่บันทึก Course)
  // - update: ไฟล์ที่อ้างอยู่เดิมในคอร์สนี้ (ไฟล์เก่าก่อนมี binding) ไม่ถูกผูกย้อนหลัง
  // - ปล่อยเฉพาะไฟล์ที่ sidecar ผูกกับคอร์สนี้จริง → marker "replaced:<id>" / "deleted:<id>"
  function applyCourseMediaChange(
    courseId: string,
    oldFiles: Set<string>,
    newFiles: Set<string>,
    user: CurrentUserAuth,
    mode: "create" | "update" | "delete",
  ): { ok: true } | CourseMediaFailure {
    const refuse = (
      status: number,
      error: string,
      message: string,
    ): CourseMediaFailure => ({ ok: false, status, error, message });

    const toBind: string[] = [];
    if (mode !== "delete") {
      for (const name of newFiles) {
        const meta = loadSidecar(name);
        // ต้องมี sidecar เสมอ — ไฟล์ที่ไม่มี sidecar ห้ามผ่านแม้ Course เดิมจะอ้างถึง
        if (!meta) {
          return refuse(
            404,
            "FILE_NOT_FOUND",
            "ไม่พบไฟล์สื่อที่แนบในระบบ กรุณาอัปโหลดใหม่",
          );
        }
        // ไฟล์ของเอกสาร/ไฟล์ restricted ห้ามผ่านเด็ดขาด แม้ถูกอ้างอยู่ใน Course เดิมแล้ว
        if (meta.documentId || meta.restricted) {
          return refuse(
            409,
            "FILE_NOT_BINDABLE",
            "ไฟล์นี้ถูกใช้กับเอกสารในระบบแล้ว ไม่สามารถใช้เป็นสื่อของหลักสูตรได้",
          );
        }
        if (mode === "update") {
          if (meta.courseId === courseId) continue; // ผูกกับคอร์สนี้อยู่แล้ว
          // อ้างอยู่เดิมและยังไม่ผูกกับหลักสูตรใด → ไม่ผูกย้อนหลัง
          if (oldFiles.has(name) && !meta.courseId) continue;
        }
        if (meta.courseId) {
          return refuse(
            409,
            "DUPLICATE_FILE_BINDING",
            "ไฟล์นี้ถูกผูกกับหลักสูตรอื่นแล้ว ไม่สามารถนำมาใช้ซ้ำข้ามหลักสูตรได้",
          );
        }
        if (meta.uploadedBy !== user.employeeId && user.role !== "Admin") {
          return refuse(
            403,
            "FORBIDDEN",
            "คุณไม่มีสิทธิ์นำไฟล์ที่ผู้อื่นอัปโหลดมาใช้เป็นสื่อของหลักสูตร",
          );
        }
        // จะสร้าง binding ใหม่ → ไฟล์ต้องมีอยู่จริงบนดิสก์
        if (!uploadedFileExistsOnDisk(name)) {
          return refuse(
            404,
            "FILE_NOT_FOUND",
            "ไม่พบไฟล์สื่อที่แนบในระบบ กรุณาอัปโหลดใหม่",
          );
        }
        toBind.push(name);
      }
    }

    const toRelease: string[] = [];
    for (const name of oldFiles) {
      if (newFiles.has(name)) continue;
      if (loadSidecar(name)?.courseId === courseId) toRelease.push(name);
    }

    const journal: Array<{ name: string; previous: string | undefined }> = [];
    const rollback = () => {
      for (const entry of journal.reverse()) {
        if (!setFileCourseBinding(entry.name, entry.previous)) {
          console.error(
            `[COURSE_MEDIA] ROLLBACK FAILED: ${entry.name} (ควรเป็น courseId=${entry.previous ?? "unbound"}) ต้องตรวจสอบไฟล์ .meta.json ด้วยตนเอง`,
          );
        }
      }
    };

    const releaseMarker =
      mode === "delete" ? `deleted:${courseId}` : `replaced:${courseId}`;
    const steps: Array<{ name: string; next: string }> = [
      ...toBind.map((name) => ({ name, next: courseId })),
      ...toRelease.map((name) => ({ name, next: releaseMarker })),
    ];
    for (const step of steps) {
      const previous = loadSidecar(step.name)?.courseId;
      if (!setFileCourseBinding(step.name, step.next)) {
        rollback();
        return refuse(
          500,
          "COURSE_MEDIA_BINDING_FAILED",
          "บันทึกการผูกไฟล์สื่อกับหลักสูตรไม่สำเร็จ ระบบไม่ได้บันทึกการเปลี่ยนแปลง กรุณาลองใหม่อีกครั้ง",
        );
      }
      journal.push({ name: step.name, previous });
    }
    return { ok: true };
  }

  // สิทธิ์เข้าถึงไฟล์ที่ผูกกับ Course: คืน null = อนุญาต
  // - marker deleted:/replaced: หรือไม่พบ Course ที่ใช้งานอยู่ = orphan → ปฏิเสธ
  // - Course ที่ยังไม่ Approved: เฉพาะ Admin/Editor
  // - Course ที่ Approved: ผู้ใช้ที่ login (และบัญชีใช้งานได้) เปิดได้ — ตรงกับ GET /api/courses ที่ให้ทุก role เห็นคอร์สที่อนุมัติแล้ว
  function courseFileDenial(
    user: CurrentUserAuth,
    meta: UploadedFileMeta,
  ): { status: number; body: { error: string; message: string } } | null {
    const ref = meta.courseId || "";
    const course =
      ref.startsWith("deleted:") || ref.startsWith("replaced:")
        ? undefined
        : db_courses.find((c) => c.id === ref);
    if (!course) {
      return {
        status: 403,
        body: {
          error: "ORPHANED_FILE",
          message:
            "ไม่พบหลักสูตรที่ผูกกับไฟล์นี้ หรือหลักสูตรถูกลบ/เปลี่ยนไฟล์แล้ว",
        },
      };
    }
    if (
      course.isApproved !== true &&
      user.role !== "Admin" &&
      user.role !== "Editor"
    ) {
      return {
        status: 403,
        body: {
          error: "COURSE_NOT_APPROVED",
          message: "หลักสูตรนี้ยังไม่ได้รับการอนุมัติ",
        },
      };
    }
    return null;
  }

  const ALLOWED_UPLOAD_EXTENSIONS: Record<string, string> = {
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    key: "application/octet-stream",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
  };

  app.post(
    "/api/upload",
    requireAuth,
    requireRole("Admin", "Editor"),
    (req, res) => {
      try {
        const { filename, fileData } = req.body;
        if (!filename || !fileData) {
          return res
            .status(400)
            .json({ error: "filename and fileData are required" });
        }
        const ext = filename.split(".").pop()?.toLowerCase() || "";
        const resolvedMimeType = ALLOWED_UPLOAD_EXTENSIONS[ext];
        if (!resolvedMimeType) {
          return res.status(400).json({
            error: "UNSUPPORTED_FILE_TYPE",
            message: `ไม่รองรับไฟล์นามสกุล .${ext}`,
          });
        }
        const buffer = Buffer.from(fileData, "base64");
        // ชื่อไฟล์บนดิสก์เป็น uuid เสมอ — ไม่ใช้ชื่อไฟล์เดิมจาก client
        const storedName = `${crypto.randomUUID()}.${ext}`;
        const uploadedAt = new Date().toISOString();

        const fileMeta: UploadedFileMeta = {
          buffer,
          mimeType: resolvedMimeType,
          uploadedBy: req.authUser!.employeeId,
          restricted: false,
          documentId: undefined, // First binding: ยังไม่ได้ผูกกับเอกสารใด
          courseId: undefined,
          uploadedAt,
        };
        uploadedFiles.set(storedName, fileMeta);

        const metaJson = JSON.stringify({
          restricted: false,
          uploadedBy: req.authUser!.employeeId,
          mimeType: resolvedMimeType,
          documentId: null,
          courseId: null,
          uploadedAt,
        });

        uploadsDirs.forEach((dir) => {
          try {
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(path.join(dir, storedName), buffer);
            fs.writeFileSync(
              path.join(dir, `${storedName}.meta.json`),
              metaJson,
            );
          } catch (e) {
            console.warn("Failed to write file to directory:", dir, e);
          }
        });

        res.json({ url: `/uploads/${storedName}`, filename: storedName });
      } catch (error: any) {
        console.error("Upload error:", error);
        res
          .status(500)
          .json({ error: "Upload failed", message: error.message });
      }
    },
  );

  interface FileToken {
    filename: string;
    id: string;
    employeeId: string;
    role: string;
  }

  function signFileToken(filename: string, user: CurrentUserAuth): string {
    const payload: FileToken = {
      filename,
      id: user.id,
      employeeId: user.employeeId,
      role: user.role,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
  }

  // สร้างลิงก์ชั่วคราวสำหรับฝังใน src/href ที่แนบ Authorization header เองไม่ได้
  // Security invariant 8: resolve file -> owning document -> canAccessDocument before sign
  app.post("/api/files/sign", requireAuth, async (req, res) => {
    try {
      const { filename } = req.body;
      if (
        typeof filename !== "string" ||
        !filename ||
        filename.includes("/") ||
        filename.includes("..")
      ) {
        return res.status(400).json({ error: "INVALID_FILENAME" });
      }

      const currentDbUser = req.authUser!;
      const meta = loadSidecar(filename);
      if (!meta) {
        return res
          .status(404)
          .json({ error: "FILE_NOT_FOUND", message: "ไม่พบไฟล์ที่ระบุในระบบ" });
      }

      // Resolve owning document
      if (meta.documentId) {
        if (
          meta.documentId.startsWith("deleted:") ||
          meta.documentId.startsWith("replaced:")
        ) {
          return res.status(403).json({
            error: "ORPHANED_FILE",
            message:
              "เอกสารที่ผูกกับไฟล์นี้ถูกลบหรือเปลี่ยนไฟล์แล้ว ไม่สามารถเข้าถึงไฟล์ได้",
          });
        }
        // 01C-3: เอกสารเจ้าของไฟล์อ่านจาก DB (ไม่พบ = ORPHANED_FILE เดิม)
        const owningDoc = await findDocument(undefined, meta.documentId);
        if (!owningDoc) {
          return res.status(403).json({
            error: "ORPHANED_FILE",
            message: "ไม่พบเอกสารต้นทางที่ผูกกับไฟล์นี้",
          });
        }
        // Check Document Department Authorization
        if (!canAccessDocument(currentDbUser, owningDoc)) {
          return res.status(403).json({
            error: "FORBIDDEN",
            message: "คุณไม่มีสิทธิ์เข้าถึงเอกสารและไฟล์ของแผนกนี้",
          });
        }
        // Check QP Rule: QP files cannot be downloaded/signed by non-Admin
        if (owningDoc.type === "QP" && currentDbUser.role !== "Admin") {
          return res.status(403).json({
            error: "QP_RESTRICTED",
            message:
              "ระเบียบปฏิบัติงาน (QP) สงวนสิทธิ์การดาวน์โหลดเฉพาะผู้ดูแลระบบ (Admin) เท่านั้น",
          });
        }
      } else if (meta.courseId) {
        const denial = courseFileDenial(currentDbUser, meta);
        if (denial) {
          return res.status(denial.status).json(denial.body);
        }
      } else {
        // Unbound file: only uploader or Admin can sign/access
        if (
          meta.uploadedBy !== currentDbUser.employeeId &&
          currentDbUser.role !== "Admin"
        ) {
          return res.status(403).json({
            error: "FORBIDDEN",
            message: "ไฟล์นี้ยังไม่ได้ผูกกับเอกสาร และคุณไม่ใช่ผู้อัปโหลดไฟล์",
          });
        }
      }

      const token = signFileToken(filename, currentDbUser);
      res.json({ url: `/uploads/${filename}?t=${token}` });
    } catch (err) {
      return sendDbFailure(res, err, "POST /api/files/sign");
    }
  });

  // รับได้ทั้ง Authorization header ปกติ หรือ query token จาก /api/files/sign
  // Resolve current DB user เสมอ
  async function fileRequestAuth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    let rawAuth: { id?: string; employeeId?: string; role?: string } | null =
      null;
    const header = req.headers.authorization;
    if (header && header.startsWith("Bearer ")) {
      try {
        rawAuth = jwt.verify(header.slice("Bearer ".length), JWT_SECRET) as any;
      } catch {
        // continue to query token
      }
    }
    const queryToken = req.query.t;
    if (!rawAuth && typeof queryToken === "string") {
      try {
        const decoded = jwt.verify(queryToken, JWT_SECRET) as FileToken;
        if (decoded.filename !== req.params.filename) {
          return res.status(403).json({ error: "TOKEN_FILE_MISMATCH" });
        }
        rawAuth = decoded;
      } catch {
        return res.status(401).json({
          error: "INVALID_TOKEN",
          message: "ลิงก์หมดอายุ กรุณาเปิดหน้าใหม่",
        });
      }
    }

    if (!rawAuth) {
      return res
        .status(401)
        .json({ error: "UNAUTHORIZED", message: "กรุณาเข้าสู่ระบบก่อนใช้งาน" });
    }

    let userInDb: UserType | undefined;
    try {
      userInDb = await findUserForAuth(rawAuth?.id, rawAuth?.employeeId);
    } catch (err) {
      return sendDbFailure(res, err, "GET /uploads/:filename (auth)");
    }
    if (!userInDb) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    if (userInDb.status === "Suspended" || userInDb.status === "Terminated") {
      return res.status(403).json({ error: "ACCOUNT_DISABLED" });
    }

    req.authUser = {
      id: userInDb.id,
      employeeId: userInDb.employeeId,
      role: userInDb.role,
      departmentId: userInDb.departmentId,
      name: userInDb.name,
      status: userInDb.status,
    };
    next();
  }

  // Serve the uploaded files (Security invariant 9: defense-in-depth authorization check)
  app.get("/uploads/:filename", fileRequestAuth, async (req, res) => {
    const filename = req.params.filename;
    if (filename.endsWith(".meta.json")) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const currentDbUser = req.authUser!;
    const meta = loadSidecar(filename);
    if (!meta) {
      return res.status(404).send("File not found");
    }

    // Defense-in-depth: resolve owning document & verify authorization
    if (meta.documentId) {
      if (
        meta.documentId.startsWith("deleted:") ||
        meta.documentId.startsWith("replaced:")
      ) {
        return res.status(403).json({
          error: "ORPHANED_FILE",
          message: "เอกสารที่ผูกกับไฟล์นี้ถูกลบหรือเปลี่ยนไฟล์แล้ว",
        });
      }
      // 01C-3: เอกสารเจ้าของไฟล์อ่านจาก DB (ไม่พบ = ORPHANED_FILE เดิม)
      let owningDoc: DocumentItem | undefined;
      try {
        owningDoc = await findDocument(undefined, meta.documentId);
      } catch (err) {
        return sendDbFailure(res, err, "GET /uploads/:filename");
      }
      if (!owningDoc) {
        return res.status(403).json({
          error: "ORPHANED_FILE",
          message: "ไม่พบเอกสารต้นทางที่ผูกกับไฟล์นี้",
        });
      }
      if (!canAccessDocument(currentDbUser, owningDoc)) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "คุณไม่มีสิทธิ์เข้าถึงเอกสารและไฟล์ของแผนกนี้",
        });
      }
      if (owningDoc.type === "QP" && currentDbUser.role !== "Admin") {
        return res.status(403).json({
          error: "QP_RESTRICTED",
          message:
            "ระเบียบปฏิบัติงาน (QP) สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น",
        });
      }
    } else if (meta.courseId) {
      const denial = courseFileDenial(currentDbUser, meta);
      if (denial) {
        return res.status(denial.status).json(denial.body);
      }
    } else {
      if (
        meta.uploadedBy !== currentDbUser.employeeId &&
        currentDbUser.role !== "Admin"
      ) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "ไฟล์นี้ยังไม่ได้ผูกกับเอกสาร และคุณไม่ใช่ผู้อัปโหลดไฟล์",
        });
      }
    }

    res.setHeader("Content-Type", meta.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(meta.buffer);
  });

  // SEC-05: Guard ของ /api/chat — จำกัดความยาว query และอัตราคำขอต่อผู้ใช้
  // (in-memory, Fixed Window, แยกตาม req.authUser.id ไม่ใช้ IP)
  const CHAT_QUERY_MAX_LENGTH = 1000;
  const CHAT_RATE_LIMIT_MAX = 10;
  const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
  const chatRateLimits = new Map<
    string,
    { count: number; windowStart: number }
  >();

  // ตรวจและใช้โควตา 1 คำขอ — เรียกหลัง validation ผ่านแล้วเท่านั้น
  function consumeChatQuota(userId: string): {
    allowed: boolean;
    retryAfterSec: number;
  } {
    const now = Date.now();

    // ล้างเฉพาะ window ที่หมดอายุแล้ว (ไม่แตะ window ที่ยังใช้งานอยู่)
    for (const [id, entry] of chatRateLimits) {
      if (now - entry.windowStart >= CHAT_RATE_LIMIT_WINDOW_MS) {
        chatRateLimits.delete(id);
      }
    }

    const entry = chatRateLimits.get(userId);
    if (!entry) {
      chatRateLimits.set(userId, { count: 1, windowStart: now });
      return { allowed: true, retryAfterSec: 0 };
    }

    if (entry.count >= CHAT_RATE_LIMIT_MAX) {
      // เกิน limit: ไม่เพิ่ม counter และไม่ขยับ window
      const remainingMs = entry.windowStart + CHAT_RATE_LIMIT_WINDOW_MS - now;
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil(remainingMs / 1000)),
      };
    }

    entry.count += 1;
    return { allowed: true, retryAfterSec: 0 };
  }

  // --- Secure Server-side Semantic RAG API Endpoint (ต้อง login) ---
  // Server-authoritative context: client ห้ามเป็น authority ของ context/documents/courses/identity
  app.post("/api/chat", requireAuth, async (req, res) => {
    try {
      const rawQuery = (req.body ?? {}).query;
      const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
      if (!query) {
        return res.status(400).json({
          error: "INVALID_QUERY",
          message: "กรุณาพิมพ์คำถามก่อนส่ง",
        });
      }
      if (query.length > CHAT_QUERY_MAX_LENGTH) {
        return res.status(400).json({
          error: "INVALID_QUERY",
          message: `คำถามยาวเกินกำหนด (ไม่เกิน ${CHAT_QUERY_MAX_LENGTH} ตัวอักษร)`,
        });
      }

      const currentDbUser = req.authUser!;

      // SEC-05: ผ่าน validation แล้วจึงนับโควตา (400 ไม่นับ) และตรวจก่อนประกอบ context/เรียก Gemini
      const quota = consumeChatQuota(currentDbUser.id);
      if (!quota.allowed) {
        res.setHeader("Retry-After", String(quota.retryAfterSec));
        return res.status(429).json({
          error: "RATE_LIMITED",
          message: `ส่งคำถามถี่เกินไป กรุณารออีก ${quota.retryAfterSec} วินาทีแล้วลองใหม่อีกครั้ง`,
        });
      }
      // Context is built purely from authorized resources on the server
      // 01C-3: เอกสารอ่านจาก DB แล้วกรอง Published + ACL แบบเดิม
      let allDocs: DocumentItem[];
      try {
        allDocs = await listDocuments();
      } catch (dbErr) {
        return sendDbFailure(res, dbErr, "POST /api/chat");
      }
      const authorizedDocs = allDocs.filter(
        (d) => d.status === "Published" && canAccessDocument(currentDbUser, d),
      );
      const approvedKBs = db_kb_articles.filter((k) => k.status === "Approved");
      const approvedCourses = db_courses.filter((c) => c.isApproved !== false);
      const resources = db_custom_resources;

      // Compile current RMP Knowledge Base as a structured context list
      const serializedRMPContext = [
        ...authorizedDocs.map((d) => ({
          id: d.id,
          title: `[เอกสารระบบ ${d.type}] ${d.title} (Rev.${d.revision})`,
          type: `เอกสารมาตรฐาน ${d.type}`,
          category: d.departmentId || "",
          content: d.exampleText || d.description,
        })),
        ...approvedKBs.map((k) => ({
          id: k.id,
          title: `[ขุมพลังช่าง Kaizen] ${k.title}`,
          type: `คลังสมองช่างเทคนิค`,
          category: k.authorDept,
          content: `ปัญหา: ${k.problem}\nสาเหตุ: ${k.cause || ""}\nวิธีแก้ไข: ${k.solution}\nการป้องกัน: ${k.prevention || ""}\nหมวดหมู่ช่าง: ${k.type}`,
        })),
        ...approvedCourses.flatMap((c) =>
          (c.lessons ?? []).map((l) => ({
            id: `${c.id}-${l.id}`,
            title: `[สอนงาน Onboarding] ${c.title} -> ${l.title}`,
            type: "บทเรียนฝึกอบรม",
            category: c.badgeKey || "Onboarding",
            content: l.content,
          })),
        ),
        ...resources.map((cs) => ({
          id: cs.id,
          title: `[คู่มือเพิ่มเติม] ${cs.title}`,
          type: `คู่มือนอกคลัง (${cs.sourceType})`,
          category: "ส่วนกลาง / สารสนเทศเพิ่มเติม",
          content: cs.content,
        })),
      ];

      const userDeptObj = getDepartmentById(currentDbUser.departmentId);
      const deptName = userDeptObj
        ? userDeptObj.name
        : currentDbUser.departmentId;

      const rmpSystemInstruction = `You are "RMP AI Knowledge Assistant", a state-of-the-art secure semantic RAG system developed for Royal Meiwa Pax Co., Ltd. (บริษัท รอแยล เมอิวะ แพ็คซ์ จำกัด).
Your ultimate mission is to resolve technical questions from operators & engineers while preserving 100% security against hallucinations and preventing industrial machinery accidents (melted barrels, rolls, electric shocks, or manufacturing fires).

User Information: Name: "${currentDbUser.name}", Department: "${deptName}". Always greet or reference them politely in Thai.

🛡️ ABSOLUTE ANTI-HALLUCINATION & ANTI-SLOP GUARDRAILS:
1. Ground your answers ONLY on the real-world RMP technical context passed below.
2. If the answer cannot be found in the provided RMP context, strictly respond in polite Thai explaining that this information is not found in the verified RMP library.
3. Every answer should be respectful, professional, and audit-compliant.
4. Output must be in JSON matching the specified responseSchema. No external text wrapper.
5. If the user asks for specific mechanical parameters (such as extruder barrel temperatures, linespeed, raw material mixtures Co-Polymer ratios / LLDPE / LDPE, safety speed limits, or system configurations) and they are NOT explicitly specified in the context, you must output a safe fallback.
6. CRITICAL: Never invent or calculate machinery temperatures (e.g. heating zones, extrusion degrees) based on standard industrial web guides or standard plastic manufacturing guidelines. Royal Meiwa Pax machinery operates under tailored constraints; a wrong thermal setting can cause safety catastrophes. If values are missing, explicitly state: "⚠️ ระบบตรวจไม่พบอุณหภูมิมาตรฐานสำหรับกรณีนี้บนเว็บบอร์ดอ้างอิงของโรงงานเมอิวะ แพ็คซ์ เพื่อหลีกเลี่ยงเหตุสุญญากาศทางเทคนิคหรือไฟไหม้เครื่องจักรของโรงงาน โปรดติดต่อหัวหน้าช่างหรือแผนกวิศวกรรม"
7. Avoid any system credit footer, metadata mentions, or ports references.

🧠 SMART SEMANTIC KNOWLEDGE MAPPING (SYNONYM RESOLUTION):
1. Users might use terms like "Hot Extrusion", "จุดสะสมความร้อน", "extruder heat", "Barrel temperature", or other casual technical terms.
2. You must understand that these relate to plastic blown film extrusion processes ("กระบวนการขึ้นรูปฟิล์มเป่าพลาสติกหลอมเหลว" / "การสะสมอุณหภูมิความร้อนที่ Barrel", etc.).
3. Map their casual concepts to the verified documents/WI of the factory and synthesize the precise Thai guidelines from those documents.

OUTPUT SCHEMA (Must be strictly valid JSON):
You must return your response conforming to the JSON schema specified in responseSchema:
{
  "responseText": "Your thoroughly response formatted in rich markdown (Thai language is required). Use clean bullet points, warn about risk warnings in red/orange themes if safety issues are related, and provide highly polite advice.",
  "citations": [
    {
      "id": "The exact ID of the source context item",
      "title": "Title of the matched item",
      "type": "Type",
      "content": "Short description of what part was matched"
    }
  ]
}`;

      const response = await getAI().models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            text: `RMP Context Library:\n${JSON.stringify(serializedRMPContext, null, 2)}`,
          },
          { text: `User Query:\n"${query}"` },
        ],
        config: {
          systemInstruction: rmpSystemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              responseText: {
                type: Type.STRING,
                description:
                  "Professional grounded response text in Markdown Thai",
              },
              citations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    type: { type: Type.STRING },
                    content: { type: Type.STRING },
                  },
                  required: ["id", "title", "type", "content"],
                },
              },
            },
            required: ["responseText", "citations"],
          },
        },
      });

      const responseString = response.text || "{}";
      const parsedData = JSON.parse(responseString.trim());
      res.json(parsedData);
    } catch (error: any) {
      console.error("Gemini RAG Server Error:", error);
      // SEC-05: ไม่ส่ง error.message กลับ client — รายละเอียดอยู่ใน server log เท่านั้น
      res.status(500).json({
        error: "RAG Server Error",
        message: "ระบบค้นหาความรู้ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง",
      });
    }
  });

  // --- AI Intelligent Document Parser (for PDF & scanned roster images) — Admin/Editor เท่านั้น ---
  app.post(
    "/api/parse-document",
    requireAuth,
    requireRole("Admin", "Editor"),
    async (req, res) => {
      try {
        const { base64Data, fileType, fileName } = req.body;
        if (
          typeof base64Data !== "string" ||
          !base64Data ||
          typeof fileType !== "string" ||
          !/^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/i.test(
            fileType,
          )
        ) {
          return res.status(400).json({
            error: "INVALID_INPUT",
            message: "รองรับเฉพาะไฟล์ PDF หรือรูปภาพ (PNG, JPG, WEBP, HEIC)",
          });
        }

        // ชื่อไฟล์เป็นข้อมูลจาก client: ตัดอักขระควบคุม/ขึ้นบรรทัดก่อนใส่ prompt
        const safeFileName = String(fileName || "document")
          .replace(/[\r\n"]/g, " ")
          .slice(0, 100);
        const deptList = getAllDepartmentsFlat()
          .map((d) => `${d.code} = ${d.name}`)
          .join("\n");

        const contents = [
          {
            inlineData: {
              data: base64Data,
              mimeType: fileType,
            },
          },
          {
            text: `You are an HR data extraction system for Royal Meiwa Pax Co., Ltd.
Extract employee records from this uploaded file ("${safeFileName}").

STRICT RULES — DO NOT FABRICATE:
1. Return only employees that are actually listed in the document.
2. Copy values exactly as printed. If a field is not present, return an empty string "". Never guess or generate values (no invented employee IDs, emails, phone numbers, levels or dates).
3. Fields:
   - employeeId: the employee code exactly as printed, or "".
   - name: full name as printed (usually Thai).
   - department: the department/section text exactly as printed, or "".
   - departmentCode: ONLY if the printed department clearly matches one entry in the list below, return that entry's code. Otherwise "".
   - position, level, email, phone: as printed, or "".
   - startDate: YYYY-MM-DD only if a full date is printed (if the year is a Buddhist Era year, subtract 543). Otherwise "".
4. status: always "Imported".
5. If the document contains no employee records, return success=false, an empty employees array, and a short Thai explanation in message.
6. Output JSON only, matching the responseSchema.

Valid departments (code = name):
${deptList}`,
          },
        ];

        const response = await getAI().models.generateContent({
          model: GEMINI_MODEL,
          contents: contents,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                success: { type: Type.BOOLEAN },
                employees: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      employeeId: { type: Type.STRING },
                      name: { type: Type.STRING },
                      department: { type: Type.STRING },
                      departmentCode: { type: Type.STRING },
                      position: { type: Type.STRING },
                      startDate: { type: Type.STRING },
                      level: { type: Type.STRING },
                      email: { type: Type.STRING },
                      phone: { type: Type.STRING },
                      status: { type: Type.STRING },
                    },
                    required: [
                      "employeeId",
                      "name",
                      "department",
                      "departmentCode",
                      "position",
                      "startDate",
                      "level",
                      "email",
                      "phone",
                      "status",
                    ],
                  },
                },
                message: { type: Type.STRING },
              },
              required: ["success", "employees"],
            },
          },
        });

        const responseString = response.text || "{}";
        const parsedData = JSON.parse(responseString.trim());
        const rawEmployees: any[] = Array.isArray(parsedData.employees)
          ? parsedData.employees
          : [];
        const str = (v: unknown) => String(v ?? "").trim();
        const employees: EmployeeMaster[] = [];
        const seenIds = new Set<string>();
        for (const raw of rawEmployees) {
          const employeeId = str(raw?.employeeId);
          const name = str(raw?.name);
          // ไม่มีรหัส/ชื่อจริงในเอกสาร = ใช้สร้างบัญชีไม่ได้ ห้ามสร้างแทน
          if (!employeeId || !name) continue;
          const idKey = employeeId.toLowerCase();
          if (seenIds.has(idKey)) continue;
          seenIds.add(idKey);

          const resolved = resolveDepartment(
            raw?.departmentCode,
            raw?.department,
          );
          const rawStart = str(raw?.startDate);
          const startDate =
            /^\d{4}-\d{2}-\d{2}$/.test(rawStart) && !isNaN(Date.parse(rawStart))
              ? rawStart
              : "";

          employees.push({
            employeeId,
            name,
            // รูปแบบเดียวกับเส้นทาง Excel: จับคู่ได้ใช้ id จริง ไม่ได้เก็บข้อความดิบ + isDeptResolved=false
            departmentId: resolved ? resolved.id : str(raw?.department),
            position: str(raw?.position),
            startDate,
            level: str(raw?.level),
            email: str(raw?.email),
            phone: str(raw?.phone),
            status: "Imported",
            isDeptResolved: !!resolved,
          });
        }
        const skipped = rawEmployees.length - employees.length;
        res.json({
          success: employees.length > 0,
          employees,
          message:
            employees.length === 0
              ? str(parsedData.message) ||
                "ไม่พบรายชื่อพนักงานที่มีรหัสและชื่อครบในเอกสารนี้"
              : skipped > 0
                ? `ข้าม ${skipped} แถวที่ไม่มีรหัสพนักงานหรือชื่อในเอกสาร หรือรหัสซ้ำ`
                : undefined,
        });
      } catch (error: any) {
        console.error("AI Document Parse Error:", error);
        res.status(500).json({
          error: "AI Parser Error",
          message: error.message || "Failed to parse document with AI.",
        });
      }
    },
  );

  // --- AI Personalized Career Learning Path Advisor (ต้อง login) ---
  app.post("/api/personalized-path", requireAuth, async (req, res) => {
    try {
      // ดึงข้อมูลตัวจริงจาก DB โดยอิง req.authUser.id เท่านั้น ไม่เชื่อ body ที่ client ส่งมา
      let authUserRecord: UserType | undefined;
      try {
        authUserRecord = await findUserById(req.authUser!.id);
      } catch (dbErr) {
        return sendDbFailure(res, dbErr, "POST /api/personalized-path");
      }
      if (!authUserRecord) {
        return res.status(401).json({
          error: "USER_NOT_FOUND",
          message: "ไม่พบข้อมูลผู้ใช้ในระบบ กรุณาเข้าสู่ระบบใหม่",
        });
      }
      const currentUser = {
        name: authUserRecord.name,
        position: authUserRecord.position,
        departmentId: authUserRecord.departmentId,
        startDate: authUserRecord.startDate,
      };
      const careerGoal = req.body.careerGoal || req.body.targetGoal;
      const competencies =
        req.body.competencies || req.body.myCompetencies || [];
      const courses = req.body.courses || req.body.availableCourses || [];
      const documents = req.body.documents || req.body.availableDocuments || [];

      if (!careerGoal) {
        return res.status(400).json({
          error: "careerGoal (or targetGoal) is required",
        });
      }

      const simpleCourses = (courses || []).map((c: any) => ({
        id: c.id,
        title: c.title,
        targetPositions: c.targetPositions,
      }));
      const simpleWIs = (documents || []).map((d: any) => ({
        id: d.id,
        title: d.title,
        type: d.type,
        department: d.departmentId || d.department || "",
      }));

      const systemInstruction = `You are "RMP AI Career Advisor", an intelligent and compliance-focused training roadmap generator for Royal Meiwa Pax Co., Ltd.
Your job is to recommend a highly personalized career progression roadmap based on current employee profile and target career goals.

User Profile:
- Name: "${currentUser.name}"
- Position: "${currentUser.position}"
- Department: "${currentUser.departmentId || ""}"
- Date Started: "${currentUser.startDate || "Unknown"}"

Current Competencies:
${JSON.stringify(competencies, null, 2)}

Target Career Goal selected by User:
"${careerGoal}"

Available Training Courses in standard RMP catalog:
${JSON.stringify(simpleCourses, null, 2)}

Available Standard Operating Procedures (QP/WI/Forms):
${JSON.stringify(simpleWIs, null, 2)}

🛡️ INSTRUCTIONS:
1. Explain how their current achievements and skills align or have gaps compared to the target "${careerGoal}".
2. Recommend exactly 3 sequential realistic steps to bridge their gaps and reach the career goal.
3. For each step, link actual courses (from the catalog ids) and actual SOPs/WIs (from the available list ids) that they should take/read. Do not invent course ids. If no specific course matches, recommend matching SOP/WI or self-study of factory systems.
4. Your response must be in Thai. Be polite, motivating, professional, and audit-compliant.

Format your output strictly in the requested JSON schema. No additional wrap text outside of JSON.`;

      const response = await getAI().models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ text: "Suggest career learning roadmap path." }],
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              careerGoalExplanation: {
                type: Type.STRING,
                description: "Detailed explanation of candidate's goal in Thai",
              },
              currentTenureAnalysis: {
                type: Type.STRING,
                description:
                  "Analysis of current position, department tenure, and general readiness in Thai",
              },
              recommendedSteps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    step: { type: Type.INTEGER },
                    title: {
                      type: Type.STRING,
                      description: "Step title in Thai",
                    },
                    description: {
                      type: Type.STRING,
                      description: "Detail of step tasks in Thai",
                    },
                    targetSkills: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Skills to target in this step",
                    },
                    recommendedCourses: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description:
                        "Exact Course IDs linked from available courses",
                    },
                    recommendedWIs: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description:
                        "Exact document/WI IDs linked from available SOPs",
                    },
                  },
                  required: [
                    "step",
                    "title",
                    "description",
                    "targetSkills",
                    "recommendedCourses",
                    "recommendedWIs",
                  ],
                },
              },
              expertAdvise: {
                type: Type.STRING,
                description: "Professional advice and encouragement in Thai",
              },
            },
            required: [
              "careerGoalExplanation",
              "currentTenureAnalysis",
              "recommendedSteps",
              "expertAdvise",
            ],
          },
        },
      });

      const responseString = response.text || "{}";
      const parsedData = JSON.parse(responseString.trim());
      res.json(parsedData);
    } catch (error: any) {
      console.error("AI Personalized Path Error:", error);
      res.status(500).json({
        error: "AI Advisor Error",
        message:
          error.message || "Failed to generate personalized career roadmap.",
      });
    }
  });

  // ============================================================
  // --- RESTful API endpoints ---
  // ทุก GET ต้อง requireAuth (อ่านได้เมื่อ login แล้วเท่านั้น)
  // ทุก POST/PUT/DELETE ต้อง requireAuth + requireRole ตามความเหมาะสม
  // ============================================================

  // Users APIs — จัดการได้เฉพาะ Admin เท่านั้น (สมัครเองใช้ /api/register แทน)
  // 01C-1: ผู้ใช้อยู่ใน km.users — Response สร้างจากแถวใน DB ผ่าน Mapper (ช่องที่ไม่มีใน Schema ไม่ถูกส่งกลับ)
  app.get("/api/users", requireAuth, async (req, res) => {
    let users: UserType[];
    try {
      users = await listUsers();
    } catch (err) {
      return sendDbFailure(res, err, "GET /api/users");
    }
    const role = req.authUser!.role;
    if (role === "Admin" || role === "Editor") {
      return res.json(users.map(sanitizeUser));
    }
    // Viewer: mask email/phone ของคนอื่น ยกเว้นตัวเอง
    res.json(users.map((u) => sanitizeUserForViewer(u, req.authUser!.id)));
  });

  const userBodyOf = (body: unknown): Record<string, unknown> =>
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  // FS-12: id ที่ Server สร้าง `usr-<Date.now()>` — ชนแล้วสร้างใหม่ (ไม่ตอบ 409)
  async function generateUserId(): Promise<string> {
    let id = `usr-${Date.now()}`;
    while (await userIdExists(id)) {
      id = `usr-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    }
    return id;
  }

  app.post(
    "/api/users",
    requireAuth,
    requireRole("Admin"),
    async (req, res) => {
      try {
        const body = userBodyOf(req.body);
        // C-05: departmentId ไม่ว่างแต่ไม่มีจริง → 400; ว่าง/ไม่ส่ง → NULL
        const dept = normalizeUserDepartment(body.departmentId);
        if (dept.ok === false) {
          return res.status(400).json(INVALID_USER_DEPARTMENT_BODY);
        }
        // E-2: id ที่ Client ส่งมาซ้ำ → 409 (เดิม `!newUser.id` = ให้ Server สร้าง)
        const clientId = body.id ? (toTextOrNull(body.id) as string) : undefined;
        if (clientId !== undefined && (await userIdExists(clientId))) {
          return res.status(409).json(DUPLICATE_USER_ID_BODY);
        }
        const fields = pickUserFields(body, dept.value);
        // E-1.2 / OD-UQ-01: employeeId ซ้ำ (ไม่สนตัวพิมพ์ รวม Terminated) → 409
        if (fields.employeeId && (await employeeIdTaken(fields.employeeId))) {
          return res.status(409).json(DUPLICATE_EMPLOYEE_ID_BODY);
        }
        const passwordHash = body.password
          ? await bcrypt.hash(body.password as string, SALT_ROUNDS)
          : null;

        for (let attempt = 1; ; attempt++) {
          const id = clientId ?? (await generateUserId());
          try {
            const created = await insertUser({ id, fields, passwordHash });
            return res.json(sanitizeUser(created));
          } catch (err) {
            const info = classifyDbError(err);
            // id ที่ Server สร้างชนกันพร้อมกัน (race) → สร้างใหม่
            if (
              clientId === undefined &&
              info.kind === "unique" &&
              info.constraint === "users_pk" &&
              attempt < 5
            ) {
              continue;
            }
            throw err;
          }
        }
      } catch (err: any) {
        if (isDbError(err)) {
          return sendUserWriteError(res, err, "POST /api/users");
        }
        res.status(500).json({ error: err.message });
      }
    },
  );
  app.put(
    "/api/users/:id",
    requireAuth,
    requireRole("Admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const body = userBodyOf(req.body);
        const existing = await findUserById(id);
        if (!existing) return res.json(null); // ไม่พบผู้ใช้ → 200 null ตามเดิม

        // C-05 เมื่อส่ง departmentId มา
        let departmentId: string | null | undefined;
        if (Object.prototype.hasOwnProperty.call(body, "departmentId")) {
          const dept = normalizeUserDepartment(body.departmentId);
          if (dept.ok === false) {
            return res.status(400).json(INVALID_USER_DEPARTMENT_BODY);
          }
          departmentId = dept.value;
        }
        // F-06: ไม่สนค่า id ใน Body — pickUserFields ไม่รวม id
        const fields = pickUserFields(body, departmentId);
        if (
          fields.employeeId &&
          (await employeeIdTaken(fields.employeeId, id))
        ) {
          return res.status(409).json(DUPLICATE_EMPLOYEE_ID_BODY);
        }
        // รหัสผ่านว่าง = ไม่เปลี่ยน
        const passwordHash = body.password
          ? await bcrypt.hash(body.password as string, SALT_ROUNDS)
          : undefined;
        const saved = await updateUser(id, fields, passwordHash);
        res.json(saved ? sanitizeUser(saved) : null);
      } catch (err: any) {
        if (isDbError(err)) {
          return sendUserWriteError(res, err, "PUT /api/users/:id");
        }
        res.status(500).json({ error: err.message });
      }
    },
  );
  app.delete(
    "/api/users/:id",
    requireAuth,
    requireRole("Admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        // F-01: ไม่ลบแถว — ตั้ง status = Terminated (ไม่พบ = { success: true } ตามเดิม)
        await terminateUser(id);
        res.json({ success: true });
      } catch (err: any) {
        if (isDbError(err)) {
          return sendDbFailure(res, err, "DELETE /api/users/:id");
        }
        res.status(500).json({ error: err.message });
      }
    },
  );

  // §21.25: รายการแผนกจาก DB (โหลดตอนเริ่ม Server)
  app.get("/api/departments", requireAuth, (_req, res) => {
    res.json(
      departmentsForApi.map((d) => ({
        id: d.id,
        parentId: d.parentId,
        name: d.name,
        code: d.code,
      })),
    );
  });

  // Documents APIs
  // GET /api/documents: Role & Department Authorization Enforcement
  // 01C-3: เอกสาร + ACL อยู่ใน km.documents / km.document_allowed_departments (FS-02, FS-06)
  // ทุกเส้นเป็น async — ลำดับการตรวจ Status code ข้อความ Error และ Response เหมือนเดิม
  // Error ใด ๆ → 500 INTERNAL_ERROR (ไม่ส่งข้อความของ DB)
  app.get("/api/documents", requireAuth, async (req, res) => {
    let docs: DocumentItem[];
    try {
      docs = await listDocuments();
    } catch (err) {
      return sendDbFailure(res, err, "GET /api/documents");
    }
    const currentDbUser = req.authUser!;
    const role = currentDbUser.role;

    const sanitizeQP = (doc: DocumentItem): DocumentItem => {
      if (doc.type === "QP" && role !== "Admin") {
        const { parsedExcelSheets, ...rest } = doc;
        return rest as DocumentItem;
      }
      return doc;
    };

    if (role === "Admin") {
      return res.json(
        docs.map((d) => ({ ...sanitizeQP(d), accessible: true })),
      );
    }

    if (role === "Viewer") {
      // Viewer เห็นเฉพาะเอกสารที่ Published และตนเองได้รับอนุญาตตามแผนกเท่านั้น
      const visible = docs.filter(
        (d) => d.status === "Published" && canAccessDocument(currentDbUser, d),
      );
      return res.json(
        visible.map((d) => ({ ...sanitizeQP(d), accessible: true })),
      );
    }

    if (role === "Editor") {
      // Editor: เห็นเฉพาะเอกสารของแผนกที่ตนเองได้รับสิทธิ์เท่านั้น (ทั้ง Draft, Pending, Published)
      // เอกสารข้ามแผนกที่ไม่มีสิทธิ์ จะไม่แสดงในระบบเลยเช่นเดียวกับ Viewer
      const visible = docs.filter((d) => canAccessDocument(currentDbUser, d));
      return res.json(
        visible.map((d) => ({ ...sanitizeQP(d), accessible: true })),
      );
    }

    // Default fallback (role อื่นๆ)
    const fallbackVisible = docs.filter(
      (d) => d.status === "Published" && canAccessDocument(currentDbUser, d),
    );
    res.json(
      fallbackVisible.map((d) => ({ ...sanitizeQP(d), accessible: true })),
    );
  });

  // GET /api/documents/stats: Global Stats (สำหรับ Dashboard KPI ส่วนกลาง)
  // คำนวณใน JS จากรายการเอกสารเดียวกับ GET (ไม่ใช้ SQL aggregate) + KB ใน Memory (ย้ายใน 01C-4)
  app.get("/api/documents/stats", requireAuth, async (req, res) => {
    try {
      const allDocs = await listDocuments();
      const currentMonthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
      const publishedDocs = allDocs.filter((d) => d.status === "Published");
      const pendingDocs = allDocs.filter(
        (d) => d.status === "Pending Approval",
      );
      const approvedKBs = db_kb_articles.filter((k) => k.status === "Approved");

      const docViews = allDocs.reduce((sum, d) => sum + (d.views || 0), 0);
      const docDownloads = allDocs.reduce(
        (sum, d) => sum + (d.downloads || 0),
        0,
      );
      const kbViews = approvedKBs.reduce((sum, k) => sum + (k.views || 0), 0);

      const newDocsThisMonth = publishedDocs.filter((d) =>
        d.createdAt?.startsWith(currentMonthKey),
      ).length;
      const newKBsThisMonth = approvedKBs.filter((k) =>
        k.createdAt?.startsWith(currentMonthKey),
      ).length;

      res.json({
        total: allDocs.length,
        published: publishedDocs.length,
        pending: pendingDocs.length,
        views: docViews + kbViews,
        downloads: docDownloads,
        newThisMonth: newDocsThisMonth + newKBsThisMonth,
        kbApproved: approvedKBs.length,
        kbViews,
      });
    } catch (err) {
      return sendDbFailure(res, err, "GET /api/documents/stats");
    }
  });

  // FS-12 แบบเดียวกับผู้ใช้: id `doc-<Date.now()>` — ชนในฐานแล้วสร้างใหม่ด้วย -hex6 (ไม่ตอบ 409)
  async function generateDocumentId(): Promise<string> {
    let id = `doc-${Date.now()}`;
    while (await documentIdExists(undefined, id)) {
      id = `doc-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    }
    return id;
  }

  // POST /api/documents: First Binding (Server-owned file ownership)
  app.post(
    "/api/documents",
    requireAuth,
    requireRole("Admin", "Editor"),
    async (req, res) => {
      // TX-11 (B-14): ไฟล์ที่ผูกถูก "จอง" ใน Sidecar ทันทีในรอบเดียวกับการตรวจ (ไม่มี await คั่น)
      // แล้วจึงเขียนเอกสาร + ACL ใน Transaction · ล้มเหลว = คืน Sidecar เป็นค่าเดิม
      let reservation: {
        storedName: string;
        previous: { documentId: string | undefined; restricted: boolean };
      } | null = null;
      try {
        const newDoc: DocumentItem = { ...req.body };
        // `accessible` เป็นค่าที่ server คำนวณตอนตอบกลับเท่านั้น ไม่เก็บค่าจาก client
        delete (newDoc as Partial<DocumentItem> & { accessible?: boolean })
          .accessible;
        const currentDbUser = req.authUser!;
        const isAdmin = currentDbUser.role === "Admin";

        // Validate owner department
        if (!isAdmin) {
          newDoc.departmentId = currentDbUser.departmentId;
        } else if (
          !newDoc.departmentId ||
          !getDepartmentById(newDoc.departmentId)
        ) {
          return res.status(400).json({
            error: "INVALID_DEPARTMENT",
            message: "กรุณาระบุรหัสแผนกที่ถูกต้อง",
          });
        }

        // Normalize allowed departments - rejects invalid IDs with 400
        try {
          newDoc.allowedDepartmentIds = normalizeAllowedDepartments(
            newDoc.departmentId,
            newDoc.allowedDepartmentIds,
          );
        } catch (deptErr: any) {
          return res.status(400).json({
            error: "INVALID_DEPARTMENT_ACCESS",
            message: deptErr.message || "รหัสแผนกไม่ถูกต้องหรือไม่พบในระบบ",
          });
        }

        // Server-owned identity: ห้ามใช้ req.body.id เป็น document ID
        // คง format เดิม `doc-<timestamp>` และกัน collision กับฐาน (FS-12)
        newDoc.id = await generateDocumentId();

        // ----- ตั้งแต่นี้ถึงการจองไฟล์ต้องเป็น Synchronous (ไม่มี await) -----
        // Security Invariant: Server-owned file binding (First binding)
        const fileRef = newDoc.realFileUrl || newDoc.fileUrl;
        let attachedStoredName: string | null = null;
        if (fileRef && fileRef.startsWith("/uploads/")) {
          attachedStoredName = fileRef.replace("/uploads/", "").split("?")[0];
          const fileMeta = loadSidecar(attachedStoredName);
          if (!fileMeta) {
            return res.status(404).json({
              error: "FILE_NOT_FOUND",
              message: "ไม่พบไฟล์ที่แนบในระบบ กรุณาอัปโหลดใหม่",
            });
          }
          // Invariant 5 & 7: If file already has a documentId (active or deleted) -> 409 Conflict
          if (fileMeta.documentId || fileMeta.courseId) {
            return res.status(409).json({
              error: "DUPLICATE_FILE_BINDING",
              message:
                "ไฟล์นี้ถูกผูกไว้กับเอกสารอื่นในระบบแล้ว ไม่สามารถผูกซ้ำได้",
            });
          }
          // Invariant 4: Caller must be uploader or Admin
          if (fileMeta.uploadedBy !== currentDbUser.employeeId && !isAdmin) {
            return res.status(403).json({
              error: "FORBIDDEN",
              message: "คุณไม่มีสิทธิ์นำไฟล์ที่ผู้อื่นอัปโหลดมาผูกกับเอกสารนี้",
            });
          }
          // จองไฟล์ทันที (คำขอถัดไปจะเห็นว่าผูกแล้ว → 409 เหมือนเดิม) และจำค่าเดิมไว้คืนเมื่อล้มเหลว
          reservation = {
            storedName: attachedStoredName,
            previous: {
              documentId: fileMeta.documentId,
              restricted: fileMeta.restricted,
            },
          };
          updateSidecar(attachedStoredName, {
            documentId: newDoc.id,
            restricted: newDoc.type === "QP",
          });
        }
        // ----- จบส่วน Synchronous -----

        newDoc.status = isAdmin ? "Published" : "Pending Approval";
        newDoc.approvedBy = isAdmin ? currentDbUser.employeeId : undefined;
        newDoc.approvedAt = isAdmin ? new Date().toISOString() : undefined;
        newDoc.views = 0;
        newDoc.downloads = 0;

        for (let attempt = 1; ; attempt++) {
          try {
            const saved = await withTransaction(async (client) => {
              await insertDocument(
                client,
                newDoc.id,
                toDocumentFields(newDoc as unknown as Record<string, unknown>),
                newDoc.allowedDepartmentIds ?? [],
              );
              return findDocument(client, newDoc.id);
            });
            return res.json({ ...saved, accessible: true });
          } catch (err) {
            const info = classifyDbError(err);
            // id ชนกันพร้อมกัน (race) → สร้าง id ใหม่ และย้ายการจองไปที่ id ใหม่ (Sync)
            if (
              info.kind === "unique" &&
              info.constraint === "documents_pk" &&
              attempt < 5
            ) {
              newDoc.id = `doc-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
              if (reservation) {
                updateSidecar(reservation.storedName, { documentId: newDoc.id });
              }
              continue;
            }
            throw err;
          }
        }
      } catch (err) {
        if (reservation) {
          // คืนการจอง: Sidecar กลับเป็นค่าเดิมก่อนคำขอนี้
          updateSidecar(reservation.storedName, {
            documentId: reservation.previous.documentId,
            restricted: reservation.previous.restricted,
          });
        }
        return sendDbFailure(res, err, "POST /api/documents");
      }
    },
  );

  // PUT /api/documents/:id: Whitelist editable fields & enforce ownership preservation
  app.put(
    "/api/documents/:id",
    requireAuth,
    requireRole("Admin", "Editor"),
    async (req, res) => {
      // §21.8 E: เปลี่ยนแผนกกับ ACL อยู่ใน Transaction เดียว · SELECT … FOR UPDATE กัน PUT ชน DELETE/view
      type Reply = { status: number; body: unknown };
      try {
        const { id } = req.params;
        const currentDbUser = req.authUser!;
        const isAdmin = currentDbUser.role === "Admin";
        const reply = await withTransaction<Reply>(async (client) => {
          const existing = await findDocument(client, id, { forUpdate: true });
          if (!existing) {
            return { status: 404, body: { error: "NOT_FOUND" } };
          }

          // Must be authorized to access this document
          if (!canAccessDocument(currentDbUser, existing)) {
            return {
              status: 403,
              body: {
                error: "FORBIDDEN",
                message: "คุณไม่มีสิทธิ์แก้ไขเอกสารของแผนกนี้",
              },
            };
          }

          // Allow Admin to change owner department if selected incorrectly initially
          let targetDepartmentId = existing.departmentId;
          if (
            isAdmin &&
            typeof req.body.departmentId === "string" &&
            req.body.departmentId.trim()
          ) {
            const newDept = getDepartmentById(req.body.departmentId.trim());
            if (!newDept) {
              return {
                status: 400,
                body: {
                  error: "INVALID_DEPARTMENT",
                  message: "รหัสแผนกไม่ถูกต้องหรือไม่พบในระบบ",
                },
              };
            }
            targetDepartmentId = req.body.departmentId.trim();
          }

          // Whitelist editable fields and normalize departments (reject invalid IDs with 400)
          let normalizedAllowed = existing.allowedDepartmentIds;
          if (
            req.body.allowedDepartmentIds !== undefined ||
            targetDepartmentId !== existing.departmentId
          ) {
            try {
              normalizedAllowed = normalizeAllowedDepartments(
                targetDepartmentId,
                req.body.allowedDepartmentIds !== undefined
                  ? req.body.allowedDepartmentIds
                  : existing.allowedDepartmentIds,
              );
            } catch (deptErr: any) {
              return {
                status: 400,
                body: {
                  error: "INVALID_DEPARTMENT_ACCESS",
                  message: deptErr.message || "รหัสแผนกไม่ถูกต้องหรือไม่พบในระบบ",
                },
              };
            }
          }

          // Approval identity เป็น server-owned: เปลี่ยน approvedBy/approvedAt
          // เฉพาะตอนที่ Admin เปลี่ยนสถานะเป็น Published จริงๆ ในรอบนี้
          // นอกนั้น preserve ค่าเดิม ห้ามรับ approvedBy/approvedAt จาก req.body
          const nextStatus = isAdmin
            ? req.body.status || existing.status
            : existing.status;
          const becomingPublished =
            nextStatus === "Published" && existing.status !== "Published";

          // Security Invariant: File binding is IMMUTABLE via PUT /api/documents/:id.
          // Client cannot control file ownership or change attached files through this endpoint.
          const updatedDoc: DocumentItem = {
            ...existing,
            title:
              typeof req.body.title === "string"
                ? req.body.title
                : existing.title,
            description:
              typeof req.body.description === "string"
                ? req.body.description
                : existing.description,
            owner:
              typeof req.body.owner === "string" && req.body.owner.trim()
                ? req.body.owner.trim()
                : existing.owner,
            allowedDepartmentIds: normalizedAllowed,
            exampleText:
              req.body.exampleText !== undefined
                ? req.body.exampleText
                : existing.exampleText,
            exampleImage:
              req.body.exampleImage !== undefined
                ? req.body.exampleImage
                : existing.exampleImage,
            exampleVideo:
              req.body.exampleVideo !== undefined
                ? req.body.exampleVideo
                : existing.exampleVideo,
            tags: Array.isArray(req.body.tags) ? req.body.tags : existing.tags,
            // Admin-only fields:
            status: nextStatus,
            approvedBy: becomingPublished
              ? currentDbUser.employeeId
              : existing.approvedBy,
            approvedAt: becomingPublished
              ? new Date().toISOString()
              : existing.approvedAt,
            type: isAdmin ? req.body.type || existing.type : existing.type,
            revision:
              isAdmin && typeof req.body.revision === "number"
                ? req.body.revision
                : existing.revision,
            // Immutable file fields: Preserved 100% from existing server state
            fileUrl: existing.fileUrl,
            realFileUrl: existing.realFileUrl,
            fileType: existing.fileType,
            parsedExcelSheets: existing.parsedExcelSheets,
            // Preserved server fields (never overwritten by client PUT):
            views: existing.views,
            downloads: existing.downloads,
            departmentId: targetDepartmentId,
          };

          await updateDocument(
            client,
            id,
            toDocumentFields(updatedDoc as unknown as Record<string, unknown>),
            normalizedAllowed ?? [],
          );
          const saved = await findDocument(client, id);
          return { status: 200, body: { ...saved, accessible: true } };
        });
        return res.status(reply.status).json(reply.body);
      } catch (err) {
        return sendDbFailure(res, err, "PUT /api/documents/:id");
      }
    },
  );

  // POST /api/documents/:id/view: Verify department authorization before incrementing view count
  // TX-12 (B-14): ล็อกแถว (FOR UPDATE) → ตรวจสิทธิ์กับค่าที่ล็อก → `views = views + 1` แบบ Atomic
  app.post("/api/documents/:id/view", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const currentDbUser = req.authUser!;
      const reply = await withTransaction<{ status: number; body: unknown }>(
        async (client) => {
          const doc = await findDocument(client, id, { forUpdate: true });
          if (!doc) {
            return { status: 404, body: { error: "NOT_FOUND" } };
          }
          if (!canAccessDocument(currentDbUser, doc)) {
            return {
              status: 403,
              body: {
                error: "FORBIDDEN",
                message: "คุณไม่มีสิทธิ์เข้าถึงเอกสารนี้",
              },
            };
          }
          doc.views = (await incrementCounter(client, id, "views")) ?? doc.views;
          const role = currentDbUser.role;
          const safe =
            doc.type === "QP" && role !== "Admin"
              ? (({ parsedExcelSheets, ...r }) => r)(doc)
              : doc;
          return { status: 200, body: { ...safe, accessible: true } };
        },
      );
      return res.status(reply.status).json(reply.body);
    } catch (err) {
      return sendDbFailure(res, err, "POST /api/documents/:id/view");
    }
  });

  // POST /api/documents/:id/download: Verify department authorization & QP restriction (TX-12)
  app.post("/api/documents/:id/download", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const currentDbUser = req.authUser!;
      const reply = await withTransaction<{ status: number; body: unknown }>(
        async (client) => {
          const doc = await findDocument(client, id, { forUpdate: true });
          if (!doc) {
            return { status: 404, body: { error: "NOT_FOUND" } };
          }
          if (!canAccessDocument(currentDbUser, doc)) {
            return {
              status: 403,
              body: {
                error: "FORBIDDEN",
                message: "คุณไม่มีสิทธิ์เข้าถึงเอกสารนี้",
              },
            };
          }
          // QP Rule: Non-admin cannot download QP documents
          if (doc.type === "QP" && currentDbUser.role !== "Admin") {
            return {
              status: 403,
              body: {
                error: "QP_RESTRICTED",
                message:
                  "เอกสารระเบียบปฏิบัติงาน (QP) สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น",
              },
            };
          }
          doc.downloads =
            (await incrementCounter(client, id, "downloads")) ?? doc.downloads;
          return { status: 200, body: { ...doc, accessible: true } };
        },
      );
      return res.status(reply.status).json(reply.body);
    } catch (err) {
      return sendDbFailure(res, err, "POST /api/documents/:id/download");
    }
  });

  // DELETE /api/documents/:id: Admin only & mark file as orphaned (Invariant 7)
  app.delete(
    "/api/documents/:id",
    requireAuth,
    requireRole("Admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        // DELETE … RETURNING (ACL ลบตาม CASCADE, Ratings คงไว้ OD-FK-03) — คำสั่งเดียว Commit ทันที
        const removed = await deleteDocument(undefined, id);
        if (!removed) {
          return res.status(404).json({ error: "NOT_FOUND" });
        }
        // Invariant 7: เอกสารถูกลบแล้ว (หลัง COMMIT) จึงค่อยทำไฟล์เป็น Orphan
        // (เดิมทำ Sidecar ก่อน — ถ้า DB ลบไม่สำเร็จไฟล์จะไม่ถูกทำเป็น Orphan ผิด ๆ)
        const fileRef = removed.realFileUrl || removed.fileUrl;
        if (fileRef && fileRef.startsWith("/uploads/")) {
          const storedName = fileRef.replace("/uploads/", "").split("?")[0];
          updateSidecar(storedName, { documentId: `deleted:${id}` });
        }
        res.json({ success: true });
      } catch (err) {
        return sendDbFailure(res, err, "DELETE /api/documents/:id");
      }
    },
  );

  app.post(
    "/api/documents/:id/approve",
    requireAuth,
    requireRole("Admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        // approvedBy มาจาก authenticated user (ผ่าน requireAuth + requireRole("Admin"))
        // เท่านั้น — ไม่อ่าน approverName จาก req.body (client ส่งมาก็ถูก ignore)
        // ใช้ employeeId ให้สอดคล้องกับ POST /api/documents ที่ Admin สร้างแล้ว Published ทันที
        const approverId = req.authUser!.employeeId;
        const updated = await withTransaction(async (client) => {
          const found = await approveDocument(
            client,
            id,
            approverId,
            new Date().toISOString(),
          );
          return found ? findDocument(client, id) : undefined;
        });
        // id ไม่มีจริง → 200 null ตามเดิม
        res.json(updated ? { ...updated, accessible: true } : null);
      } catch (err) {
        return sendDbFailure(res, err, "POST /api/documents/:id/approve");
      }
    },
  );

  // Courses APIs
  app.get("/api/courses", requireAuth, (req, res) => {
    // Viewer ไม่เห็นคอร์สที่ยังไม่อนุมัติ และไม่ได้รับเฉลยข้อสอบ (ตรวจที่ server ผ่าน submit-quiz)
    // Admin/Editor ยังได้เฉลยครบ เพราะต้องใช้แก้ไขหลักสูตรและตรวจข้อ Essay
    if (req.authUser!.role === "Viewer") {
      return res.json(
        db_courses.filter((c) => c.isApproved !== false).map(stripQuizAnswers),
      );
    }
    res.json(db_courses);
  });
  app.post(
    "/api/courses",
    requireAuth,
    requireRole("Admin", "Editor"),
    (req, res) => {
      try {
        const newCourse = req.body;
        if (
          !newCourse ||
          typeof newCourse !== "object" ||
          Array.isArray(newCourse)
        ) {
          return res.status(400).json({
            error: "INVALID_COURSE",
            message: "ข้อมูลหลักสูตรไม่ถูกต้อง",
          });
        }
        if (
          newCourse.id === undefined ||
          newCourse.id === null ||
          newCourse.id === ""
        ) {
          let generatedId = `c-${Date.now()}`;
          while (db_courses.some((c) => c.id === generatedId)) {
            generatedId = `c-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
          }
          newCourse.id = generatedId;
        } else if (
          typeof newCourse.id !== "string" ||
          !COURSE_ID_RE.test(newCourse.id)
        ) {
          return res.status(400).json({
            error: "INVALID_COURSE_ID",
            message: "รหัสหลักสูตรไม่ถูกต้อง",
          });
        }
        if (db_courses.some((c) => c.id === newCourse.id)) {
          return res.status(409).json({
            error: "DUPLICATE_COURSE_ID",
            message: "รหัสหลักสูตรนี้มีอยู่ในระบบแล้ว",
          });
        }
        const mediaScan = scanLessonMedia(newCourse.lessons);
        if (mediaScan.ok === false) {
          return res.status(400).json({
            error: "INVALID_COURSE_MEDIA",
            message: mediaScan.message,
          });
        }
        const mediaResult = applyCourseMediaChange(
          newCourse.id,
          new Set<string>(),
          mediaScan.files,
          req.authUser!,
          "create",
        );
        if (mediaResult.ok === false) {
          return res
            .status(mediaResult.status)
            .json({ error: mediaResult.error, message: mediaResult.message });
        }
        newCourse.isApproved = req.authUser!.role === "Admin";
        newCourse.createdByRole = req.authUser!.role;
        db_courses.unshift(newCourse);
        res.json(newCourse);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  app.put(
    "/api/courses/:id",
    requireAuth,
    requireRole("Admin", "Editor"),
    (req, res) => {
      try {
        const { id } = req.params;
        const existing = db_courses.find((c) => c.id === id);
        if (!existing) {
          return res.status(404).json({ error: "NOT_FOUND" });
        }
        const mediaScan = scanLessonMedia(req.body?.lessons);
        if (mediaScan.ok === false) {
          return res.status(400).json({
            error: "INVALID_COURSE_MEDIA",
            message: mediaScan.message,
          });
        }
        const oldScan = scanLessonMedia(existing.lessons);
        const mediaResult = applyCourseMediaChange(
          id,
          oldScan.ok ? oldScan.files : new Set<string>(),
          mediaScan.files,
          req.authUser!,
          "update",
        );
        if (mediaResult.ok === false) {
          return res
            .status(mediaResult.status)
            .json({ error: mediaResult.error, message: mediaResult.message });
        }
        const isAdmin = req.authUser!.role === "Admin";
        const updatedCourse: Course = {
          ...req.body,
          id,
          isApproved: isAdmin ? req.body.isApproved : existing.isApproved,
        };
        db_courses = db_courses.map((c) => (c.id === id ? updatedCourse : c));
        res.json(updatedCourse);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  app.delete(
    "/api/courses/:id",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        const { id } = req.params;
        const existing = db_courses.find((c) => c.id === id);
        if (existing) {
          const oldScan = scanLessonMedia(existing.lessons);
          const mediaResult = applyCourseMediaChange(
            id,
            oldScan.ok ? oldScan.files : new Set<string>(),
            new Set<string>(),
            req.authUser!,
            "delete",
          );
          if (mediaResult.ok === false) {
            return res
              .status(mediaResult.status)
              .json({ error: mediaResult.error, message: mediaResult.message });
          }
        }
        db_courses = db_courses.filter((c) => c.id !== id);
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ส่งข้อสอบ: server ตรวจเอง — ปรนัย/ถูก-ผิด/จับคู่ตัดสินทันที
  // ถ้ามีข้อ Essay จะเป็น PendingReview จนกว่าผู้ตรวจให้คะแนนครบ (ก้อนที่ 2)
  app.post("/api/courses/:id/submit-quiz", requireAuth, async (req, res) => {
    // 01C-1: อ่านผู้ใช้จาก DB ก่อน — การตรวจและแก้ข้อมูลใน Memory ด้านล่างยังทำต่อเนื่องแบบ Synchronous เหมือนเดิม
    let user: UserType | undefined;
    try {
      user = await findUserById(req.authUser!.id);
    } catch (err) {
      return sendDbFailure(res, err, "POST /api/courses/:id/submit-quiz");
    }
    try {
      const course = db_courses.find((c) => c.id === req.params.id);
      if (!course) {
        return res
          .status(404)
          .json({ error: "NOT_FOUND", message: "ไม่พบหลักสูตร" });
      }
      if (course.isApproved === false && req.authUser!.role !== "Admin") {
        return res.status(403).json({
          error: "COURSE_NOT_APPROVED",
          message: "หลักสูตรนี้ยังไม่ได้รับการอนุมัติ",
        });
      }
      if (
        !user ||
        user.status === "Suspended" ||
        user.status === "Terminated"
      ) {
        return res.status(403).json({
          error: "ACCOUNT_INACTIVE",
          message: "บัญชีนี้ไม่สามารถส่งข้อสอบได้",
        });
      }
      if (!course.quiz || course.quiz.length === 0) {
        return res.status(400).json({
          error: "NO_QUIZ",
          message: "หลักสูตรนี้ยังไม่มีข้อสอบ",
        });
      }
      const alreadyPending = db_quiz_submissions.some(
        (s) =>
          s.userId === user.id &&
          s.courseId === course.id &&
          s.status === "PendingReview",
      );
      if (alreadyPending) {
        return res.status(409).json({
          error: "ALREADY_PENDING",
          message: "คุณส่งข้อสอบหลักสูตรนี้ไปแล้วและกำลังรอผู้ตรวจข้อ Essay",
        });
      }

      // P-21 + ODR-03: ตรวจรูปร่าง answers หลัง ALREADY_PENDING; absent/null = ไม่มีคำตอบ
      const parsed = parseSubmittedAnswers(req.body.answers);
      if (!parsed.ok) {
        return res.status(400).json({
          error: "INVALID_ANSWERS",
          message: "รูปแบบคำตอบไม่ถูกต้อง",
        });
      }
      // Truncate → Unanswered (ได้ 0) → ตรวจถูก/ผิด; Essay ที่ไม่ได้ตอบไม่เข้า essayQuestionIds
      const {
        answers,
        essayQuestionIds,
        autoCorrect,
        autoTotal,
        essayTotal,
      } = buildSubmissionGrading(course.quiz, parsed.answers);

      // ข้อมูลผู้ส่งมาจาก DB ตาม token เสมอ ไม่ใช่จาก body
      const sub: QuizSubmission = {
        id: `qs-${crypto.randomUUID()}`,
        userId: user.id,
        userName: user.name,
        employeeId: user.employeeId,
        courseId: course.id,
        courseTitle: course.title,
        answers,
        autoCorrect,
        autoTotal,
        essayQuestionIds,
        essayGrades: [],
        essayTotal,
        status: "PendingReview",
        submittedAt: new Date().toISOString(),
      };
      db_quiz_submissions.unshift(sub);

      // ไม่มี Essay ที่ตอบแล้ว (รวมกรณีไม่ตอบ Essay เลย) → Finalize ทันที
      if (essayQuestionIds.length === 0) {
        finalizeSubmission(sub, course, essayTotal);
      }

      res.json({
        submissionId: sub.id,
        status: sub.status,
        score: sub.score,
        pass: sub.pass,
        pendingEssayCount: essayQuestionIds.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // รายการข้อสอบที่ส่งเข้ามา — Admin/Editor เห็นทั้งหมด (ทุกแผนก), คนอื่นเห็นเฉพาะของตัวเอง
  app.get("/api/quiz_submissions", requireAuth, (req, res) => {
    const role = req.authUser!.role;
    if (role === "Admin" || role === "Editor") {
      return res.json(db_quiz_submissions);
    }
    res.json(db_quiz_submissions.filter((s) => s.userId === req.authUser!.id));
  });

  // ผู้ตรวจให้คะแนนข้อ Essay ครบทุกข้อในครั้งเดียว → ปิดผลสอบ
  app.post(
    "/api/quiz_submissions/:id/grade",
    requireAuth,
    requireRole("Admin", "Editor"),
    async (req, res) => {
      // 01C-1: อ่านผู้ตรวจจาก DB ก่อน (ใช้แค่ข้อความ Audit) — Guard และ finalize ใน Memory ยังต่อเนื่องแบบ Synchronous
      let reviewer: UserType | undefined;
      try {
        reviewer = await findUserById(req.authUser!.id);
      } catch (err) {
        return sendDbFailure(res, err, "POST /api/quiz_submissions/:id/grade");
      }
      try {
        const sub = db_quiz_submissions.find((s) => s.id === req.params.id);
        if (!sub) {
          return res
            .status(404)
            .json({ error: "NOT_FOUND", message: "ไม่พบรายการข้อสอบ" });
        }
        if (sub.status !== "PendingReview") {
          return res.status(409).json({
            error: "ALREADY_FINALIZED",
            message: "รายการนี้ถูกตรวจและปิดผลไปแล้ว ไม่สามารถตรวจซ้ำได้",
          });
        }
        // ห้ามตรวจงานตัวเอง (กันให้คะแนนตัวเอง)
        if (sub.userId === req.authUser!.id) {
          return res.status(403).json({
            error: "SELF_REVIEW_FORBIDDEN",
            message: "ไม่สามารถตรวจข้อสอบของตัวเองได้",
          });
        }
        const course = db_courses.find((c) => c.id === sub.courseId);
        if (!course) {
          return res.status(404).json({
            error: "COURSE_NOT_FOUND",
            message: "ไม่พบหลักสูตรของข้อสอบนี้ (อาจถูกลบไปแล้ว)",
          });
        }

        // ต้องให้คะแนนครบทุกข้อ Essay พอดี ไม่ขาด ไม่เกิน ไม่ซ้ำ
        const incoming = Array.isArray(req.body.grades) ? req.body.grades : [];
        const grades = incoming.map((g: any) => ({
          questionId: String(g?.questionId || ""),
          correct: g?.correct,
          comment:
            typeof g?.comment === "string"
              ? g.comment.trim().slice(0, 1000) || undefined
              : undefined,
        }));
        const gradedIds = grades.map((g: any) => g.questionId);
        const coversAll =
          gradedIds.length === sub.essayQuestionIds.length &&
          new Set(gradedIds).size === gradedIds.length &&
          sub.essayQuestionIds.every((id) => gradedIds.includes(id));
        if (
          !coversAll ||
          grades.some((g: any) => typeof g.correct !== "boolean")
        ) {
          return res.status(400).json({
            error: "INCOMPLETE_GRADES",
            message: "ต้องให้คะแนนข้อ Essay ให้ครบทุกข้อ (ถูก/ผิด) ก่อนปิดผล",
          });
        }

        // D1(b) + Addendum §21.21 §2.6: ไม่ทราบจำนวน Essay ทั้งหมด → Fail closed
        // ตรวจหลัง Guard 1–5 และก่อนแก้ sub ใด ๆ; Log ไม่มี Body/answers
        const essay = resolveEssayTotal(sub);
        if (essay.known === false) {
          console.error("[quiz] fail closed: essayTotal unresolved", {
            route: "POST /api/quiz_submissions/:id/grade",
            userId: req.authUser!.id,
            submissionId: sub.id,
            reason: essay.reason,
          });
          return res.status(500).json(QUIZ_INTERNAL_ERROR);
        }

        sub.essayGrades = grades;
        const result = finalizeSubmission(
          sub,
          course,
          essay.essayTotal,
          req.authUser!.employeeId,
        );

        // TODO(01C-6, TX-03): Audit ยังไม่อยู่ใน Transaction เดียวกับผลตรวจ — จะรวมเมื่อ quiz_submissions ย้ายขึ้น DB
        // ระหว่างนี้ ถ้าเขียน Audit ไม่สำเร็จ ผลตรวจใน Memory ถูกบันทึกแล้วแต่ตอบ 500
        try {
          await insertAuditLog(undefined, {
            id: `log-${crypto.randomUUID()}`,
            action: "GRADE_ESSAY",
            details: `ตรวจข้อสอบ Essay: ${sub.userName} (${sub.employeeId}) หลักสูตร "${sub.courseTitle}" คะแนน ${formatScore(result.score)}% (${result.pass ? "ผ่าน" : "ไม่ผ่าน"})`,
            performedBy: reviewer
              ? `${reviewer.name} (${reviewer.employeeId})`
              : req.authUser!.employeeId,
            timestamp: new Date().toISOString(),
          });
        } catch (auditErr) {
          return sendDbFailure(res, auditErr, "POST /api/quiz_submissions/:id/grade (audit)");
        }

        res.json(sub);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // KB Articles APIs
  app.get("/api/kb_articles", requireAuth, (req, res) => {
    // Viewer เห็นเฉพาะบทความที่ Approved แล้ว — เดิมกรองแค่ฝั่ง client (TechnicalKB.tsx)
    if (req.authUser!.role === "Viewer") {
      return res.json(
        db_kb_articles.filter((art) => art.status === "Approved"),
      );
    }
    res.json(db_kb_articles);
  });
  app.post("/api/kb_articles", requireAuth, async (req, res) => {
    // ทุก role ที่ login แล้วเสนอความรู้/ร่างบทความได้ (workflow อนุมัติควบคุมที่ /approve)
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const KB_TYPES: KBArticle["type"][] = [
        "Troubleshooting",
        "Best Practice",
        "Lesson Learned",
        "Kaizen",
        "FAQ",
      ];
      const bad = (message: string) =>
        res.status(400).json({ error: "INVALID_KB_ARTICLE", message });

      // --- Validation: รับเฉพาะฟิลด์เนื้อหา ตรวจชนิดและความยาว ---
      const readText = (
        value: unknown,
        max: number,
      ): string | null | undefined => {
        // undefined = ไม่ได้ส่งมา, null = ผิดชนิด/ยาวเกิน, string = ใช้ได้
        if (value === undefined) return undefined;
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        return trimmed.length > max ? null : trimmed;
      };
      const readList = (value: unknown): string[] | null => {
        // undefined = ไม่ได้ส่งมา -> []; null/ชนิดอื่น = ผิดชนิด -> null
        if (value === undefined) return [];
        if (!Array.isArray(value) || value.length > 30) return null;
        const out: string[] = [];
        for (const item of value) {
          if (typeof item !== "string" || item.length > 100) return null;
          const t = item.trim();
          if (t) out.push(t);
        }
        return out;
      };

      const title = readText(body.title, 300);
      const problem = readText(body.problem, 10000);
      const solution = readText(body.solution, 10000);
      const cause = readText(body.cause, 10000);
      const prevention = readText(body.prevention, 10000);
      const tags = readList(body.tags);
      const relatedWIs = readList(body.relatedWIs);

      if (!title || !problem || !solution) {
        return bad(
          "กรุณากรอกหัวข้อ ปัญหา และวิธีแก้ไข (ข้อความ ไม่ว่าง และไม่ยาวเกินกำหนด)",
        );
      }
      if (cause === null || prevention === null) {
        return bad("ข้อมูลสาเหตุหรือวิธีป้องกันไม่ถูกต้องหรือยาวเกินกำหนด");
      }
      if (!KB_TYPES.includes(body.type)) {
        return bad("ประเภทบทความไม่ถูกต้อง");
      }
      if (tags === null || relatedWIs === null) {
        return bad(
          "แท็กและรหัสเอกสารอ้างอิงต้องเป็นรายการข้อความ (สูงสุด 30 รายการ)",
        );
      }

      // --- ฟิลด์ระบบ: มาจากผู้ใช้ที่ server ยืนยันแล้วเท่านั้น ---
      const me = req.authUser!;
      let userRecord: UserType | undefined;
      try {
        userRecord = await findUserById(me.id);
      } catch (dbErr) {
        return sendDbFailure(res, dbErr, "POST /api/kb_articles");
      }
      // หลังจุดนี้ การสร้าง id กันชนและ unshift ทำต่อเนื่องแบบ Synchronous เหมือนเดิม
      const authorDeptId = userRecord?.departmentId || me.departmentId;

      // id ให้ server สร้างเสมอ (ไม่ใช้ id จาก client) และกัน collision
      let generatedId = `kb-${Date.now()}`;
      while (db_kb_articles.some((a) => a.id === generatedId)) {
        generatedId = `kb-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
      }

      const newArt: KBArticle = {
        id: generatedId,
        title,
        type: body.type,
        problem,
        ...(cause ? { cause } : {}),
        solution,
        ...(prevention ? { prevention } : {}),
        relatedWIs,
        tags,
        author: me.name,
        authorTitle: userRecord?.position || "",
        authorDept: getDepartmentById(authorDeptId)?.name || authorDeptId,
        views: 0,
        likes: 0,
        // บังคับ status จาก role ที่ server ตรวจสอบเองเท่านั้น ห้ามเชื่อ client
        status: me.role === "Admin" ? "Approved" : "Pending",
        createdAt: new Date().toISOString(),
      };
      db_kb_articles.unshift(newArt);
      res.json(newArt);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put(
    "/api/kb_articles/:id",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        const { id } = req.params;
        const updatedArt = req.body;
        db_kb_articles = db_kb_articles.map((art) =>
          art.id === id ? updatedArt : art,
        );
        res.json(updatedArt);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  app.delete(
    "/api/kb_articles/:id",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        const { id } = req.params;
        db_kb_articles = db_kb_articles.filter((art) => art.id !== id);
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  app.post(
    "/api/kb_articles/:id/approve",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        const { id } = req.params;
        db_kb_articles = db_kb_articles.map((art) =>
          art.id === id ? { ...art, status: "Approved" } : art,
        );
        const updated = db_kb_articles.find((art) => art.id === id);
        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  app.post("/api/kb_articles/:id/like", requireAuth, (req, res) => {
    try {
      const { id } = req.params;
      db_kb_articles = db_kb_articles.map((art) =>
        art.id === id ? { ...art, likes: art.likes + 1 } : art,
      );
      const updated = db_kb_articles.find((art) => art.id === id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Experts APIs — จัดการได้เฉพาะ Admin
  app.get("/api/experts", requireAuth, (req, res) => {
    res.json(db_experts);
  });
  app.post("/api/experts", requireAuth, requireRole("Admin"), (req, res) => {
    try {
      const newExpert = req.body;
      if (!newExpert.id) {
        newExpert.id = `exp-${Date.now()}`;
      }
      db_experts.push(newExpert);
      res.json(newExpert);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/experts/:id", requireAuth, requireRole("Admin"), (req, res) => {
    try {
      const { id } = req.params;
      const updatedExpert = req.body;
      db_experts = db_experts.map((e) => (e.id === id ? updatedExpert : e));
      res.json(updatedExpert);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete(
    "/api/experts/:id",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        const { id } = req.params;
        db_experts = db_experts.filter((e) => e.id !== id);
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // Ratings APIs — เขียนได้ทุก login
  app.get("/api/ratings", requireAuth, async (req, res) => {
    // กรองฝั่ง server ตามสิทธิ์ผู้ใช้ — กรองเฉพาะข้อมูลที่ส่งกลับ ไม่แก้ db_ratings
    // ลำดับค้นเหมือน POST /api/ratings: Document ก่อน แล้วค่อย KB (ไม่ใช้ prefix ของ id)
    // 01C-3: โหลดเอกสารจาก DB ครั้งเดียวต่อ Request แล้วค้นแบบ Document-first เดิม
    let docsById: Map<string, DocumentItem>;
    try {
      docsById = new Map((await listDocuments()).map((d) => [d.id, d]));
    } catch (err) {
      return sendDbFailure(res, err, "GET /api/ratings");
    }
    const me = req.authUser!;
    const isAdmin = me.role === "Admin";
    const isEditor = me.role === "Editor";

    const visible = db_ratings.filter((r) => {
      const targetDoc = docsById.get(r.docOrKBId);
      if (targetDoc) {
        // Admin/Editor: ตามสิทธิ์แผนก (ทุกสถานะ); role อื่น: ต้อง Published + มีสิทธิ์แผนก
        return (
          canAccessDocument(me, targetDoc) &&
          (isAdmin || isEditor || targetDoc.status === "Published")
        );
      }
      const targetKB = db_kb_articles.find((a) => a.id === r.docOrKBId);
      if (targetKB) {
        // Admin/Editor เห็นทุกสถานะ; Viewer และ role อื่นเห็นเฉพาะ Approved
        return isAdmin || isEditor || targetKB.status === "Approved";
      }
      // Orphan (ไม่ชี้ไปยัง Document/KB ที่มีอยู่): เฉพาะ Admin
      return isAdmin;
    });

    res.json(visible);
  });
  app.post(
    "/api/ratings",
    requireAuth,
    requireOwnField("userId"),
    async (req, res) => {
      try {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const bad = (message: string) =>
          res.status(400).json({ error: "INVALID_RATING", message });

        // --- Validation: รับเฉพาะ docOrKBId, rating, comment (ทุกฟิลด์บังคับ) ---
        // null/undefined/ชนิดผิด ถือเป็นข้อมูลผิดรูปแบบทั้งหมด ไม่ถูกตีความเป็น "ไม่ส่ง"
        const docOrKBId =
          typeof body.docOrKBId === "string" ? body.docOrKBId.trim() : "";
        if (!docOrKBId || docOrKBId.length > 100) {
          return bad("กรุณาระบุรหัสเอกสารหรือบทความที่ต้องการให้ความเห็น");
        }
        const ratingValue = body.rating;
        if (
          typeof ratingValue !== "number" ||
          !Number.isInteger(ratingValue) ||
          ratingValue < 1 ||
          ratingValue > 5
        ) {
          return bad("คะแนนต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 5");
        }
        const comment =
          typeof body.comment === "string" ? body.comment.trim() : "";
        if (!comment || comment.length > 2000) {
          return bad("กรุณากรอกความเห็น (ไม่ว่าง และไม่เกิน 2,000 ตัวอักษร)");
        }

        // --- ตรวจว่าเป้าหมายมีอยู่จริงและผู้ใช้มีสิทธิ์เห็น (ใช้กฎเดียวกับ GET) ---
        const me = req.authUser!;
        // 01C-3: เอกสารเป้าหมายอ่านจาก DB — หลังจุดนี้ การสร้าง id กันชนและ unshift ยังต่อเนื่องแบบ Synchronous
        let targetDoc: DocumentItem | undefined;
        try {
          targetDoc = await findDocument(undefined, docOrKBId);
        } catch (dbErr) {
          return sendDbFailure(res, dbErr, "POST /api/ratings");
        }
        if (targetDoc) {
          // เหมือน GET /api/documents: Admin/Editor เห็นตามสิทธิ์แผนก (ทุกสถานะ),
          // role อื่นเห็นเฉพาะ Published ที่มีสิทธิ์แผนก
          const canSee =
            canAccessDocument(me, targetDoc) &&
            (me.role === "Admin" ||
              me.role === "Editor" ||
              targetDoc.status === "Published");
          if (!canSee) {
            return res.status(403).json({
              error: "FORBIDDEN",
              message: "คุณไม่มีสิทธิ์ให้ความเห็นกับเอกสารนี้",
            });
          }
        } else {
          const targetKB = db_kb_articles.find((a) => a.id === docOrKBId);
          if (!targetKB) {
            return res.status(404).json({
              error: "NOT_FOUND",
              message: "ไม่พบเอกสารหรือบทความที่ระบุ",
            });
          }
          // เหมือน GET /api/kb_articles: Viewer เห็นเฉพาะ Approved
          if (me.role === "Viewer" && targetKB.status !== "Approved") {
            return res.status(403).json({
              error: "FORBIDDEN",
              message: "คุณไม่มีสิทธิ์ให้ความเห็นกับบทความนี้",
            });
          }
        }

        // id ให้ server สร้างเสมอ (ไม่ใช้ id จาก client) และกัน collision
        let generatedId = `r-${Date.now()}`;
        while (db_ratings.some((r) => r.id === generatedId)) {
          generatedId = `r-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
        }

        // ฟิลด์ระบุตัวตนและเวลา มาจาก server เสมอ (รวมกรณี Admin)
        const newRating: RatingAndComment = {
          id: generatedId,
          docOrKBId,
          userId: me.id,
          userName: me.name,
          rating: ratingValue,
          comment,
          createdAt: new Date().toISOString(),
        };
        db_ratings.unshift(newRating);
        res.json(newRating);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // User Progress APIs — เขียนได้ทุก login (เป็นข้อมูลของตัวเอง)
  app.get("/api/user_progress", requireAuth, (req, res) => {
    if (canViewAllLearningData(req.authUser)) {
      return res.json(db_user_progress);
    }
    res.json(db_user_progress.filter((p) => p.userId === req.authUser!.id));
  });
  app.post(
    "/api/user_progress",
    requireAuth,
    requireOwnField("userId"),
    (req, res) => {
      try {
        const isAdmin = req.authUser!.role === "Admin";
        const prog = req.body;

        if (isAdmin) {
          // Admin แก้ไขบันทึกได้ตรงๆ (กรณีแก้ข้อมูลด้วยมือ)
          if (!prog.id) {
            prog.id = `prog-${Date.now()}`;
          }
          const idx = db_user_progress.findIndex(
            (p) => p.userId === prog.userId && p.courseId === prog.courseId,
          );
          if (idx !== -1) {
            db_user_progress[idx] = prog;
          } else {
            db_user_progress.push(prog);
          }
          return res.json(prog);
        }

        // ผู้เรียนทั่วไปทำได้แค่ "เริ่มเรียน" — Completed/score/attempts ตั้งโดย server ตอนปิดผลสอบเท่านั้น
        if (!db_courses.some((c) => c.id === prog.courseId)) {
          return res
            .status(400)
            .json({ error: "INVALID_COURSE", message: "ไม่พบหลักสูตร" });
        }
        const existing = db_user_progress.find(
          (p) => p.userId === req.authUser!.id && p.courseId === prog.courseId,
        );
        if (existing) return res.json(existing);

        const created: UserCourseProgress = {
          id: `prog-${crypto.randomUUID()}`,
          userId: req.authUser!.id,
          courseId: prog.courseId,
          status: "Learning",
          startDate: new Date().toISOString(),
          attemptsCount: 0,
          totalStudyMinutes: 0,
        };
        db_user_progress.push(created);
        res.json(created);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // Exam Results APIs
  app.get("/api/exam_results", requireAuth, (req, res) => {
    if (canViewAllLearningData(req.authUser)) {
      return res.json(db_exam_results);
    }
    res.json(
      db_exam_results.filter((e) => e.employeeId === req.authUser!.employeeId),
    );
  });
  app.post(
    "/api/exam_results",
    requireAuth,
    // ผลสอบสร้างโดย server ผ่าน submit-quiz เท่านั้น — endpoint นี้เหลือไว้ให้ Admin แก้ข้อมูลด้วยมือ
    requireRole("Admin"),
    (req, res) => {
      try {
        const result = req.body;
        if (!result.id) {
          result.id = `ex-${Date.now()}`;
        }
        db_exam_results.unshift(result);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  // GET /api/learning/stats — aggregate only
  // Admin/Editor: ระดับองค์กร | Viewer: ของตัวเองเท่านั้น
  // ไม่อ่าน req.query / req.body เลย → ไม่มีช่องให้ client เลือก user
  app.get("/api/learning/stats", requireAuth, async (req, res) => {
    let allUsers: UserType[];
    try {
      allUsers = await listUsers();
    } catch (err) {
      return sendDbFailure(res, err, "GET /api/learning/stats");
    }
    try {
      const me = req.authUser!;
      const orgWide = canViewAllLearningData(me);

      // Q5 (01C-1): ไม่นับผู้ใช้ Terminated ในสถิติ — คงความหมายเดิมที่ผู้ใช้ที่ถูกลบหายจากระบบ (F-01)
      const countedUsers = allUsers.filter((u) => u.status !== "Terminated");
      const scopedUsers = orgWide
        ? countedUsers
        : countedUsers.filter((u) => u.id === me.id);
      const ids = new Set(scopedUsers.map((u) => u.id));
      const emps = new Set(scopedUsers.map((u) => u.employeeId));
      const empById = new Map(allUsers.map((u) => [u.id, u.employeeId]));

      const progress = db_user_progress.filter((p) => ids.has(p.userId));
      const exams = db_exam_results.filter((e) => emps.has(e.employeeId));
      const certs = db_user_certificates.filter((c) => ids.has(c.userId));
      const logs = db_km_contribution_logs.filter((l) => ids.has(l.userId));
      const comps = db_user_competencies.filter((c) => ids.has(c.userId));
      const pendingReview = db_quiz_submissions.filter(
        (s) => s.status === "PendingReview" && ids.has(s.userId),
      ).length;

      // unique (employee, course) ที่เรียนจบจริง — นิยามเดียวกับ getUserCompletedCourseIds
      const completed = new Map<string, { emp: string; courseId: string }>();
      progress.forEach((p) => {
        const emp = empById.get(p.userId);
        if (p.status === "Completed" && emp) {
          completed.set(`${emp}\u0000${p.courseId}`, {
            emp,
            courseId: p.courseId,
          });
        }
      });
      exams.forEach((e) => {
        if (e.pass) {
          completed.set(`${e.employeeId}\u0000${e.courseId}`, {
            emp: e.employeeId,
            courseId: e.courseId,
          });
        }
      });

      let trainingMinutes = 0;
      let minutesKnown = false;
      completed.forEach(({ courseId }) => {
        const c = db_courses.find((x) => x.id === courseId);
        if (c?.durationMinutes) {
          trainingMinutes += c.durationMinutes;
          minutesKnown = true;
        }
      });

      const examScores = exams
        .map((e) => Number(e.score))
        .filter((n) => !isNaN(n));

      const perCourse = db_courses
        .filter((c) => orgWide || c.isApproved !== false)
        .map((c) => {
          const ex = exams.filter((e) => e.courseId === c.id);
          return {
            courseId: c.id,
            courseTitle: c.title,
            attempts: ex.length,
            passed: ex.filter((e) => e.pass).length,
          };
        })
        .filter((c) => c.attempts > 0)
        .sort((a, b) => b.attempts - a.attempts);

      const now = Date.now();
      const certSummary = {
        total: certs.length,
        valid: 0,
        expiringSoon: 0,
        expired: 0,
      };
      certs.forEach((c) => {
        const d = Math.ceil((Date.parse(c.expiryDate) - now) / 86400000);
        if (isNaN(d)) return;
        if (d <= 0) certSummary.expired++;
        else if (d <= 45) certSummary.expiringSoon++;
        else certSummary.valid++;
      });

      res.json({
        scope: orgWide ? "organization" : "self",
        learners: {
          total: scopedUsers.length,
          withCompletion: new Set(
            Array.from(completed.values()).map((v) => v.emp),
          ).size,
        },
        completions: { unique: completed.size },
        exams: {
          attempts: exams.length,
          passed: exams.filter((e) => e.pass).length,
          averageScore: examScores.length
            ? Math.round(
                examScores.reduce((a, b) => a + b, 0) / examScores.length,
              )
            : null,
          pendingEssayReview: pendingReview,
        },
        trainingMinutes: minutesKnown ? trainingMinutes : null,
        perCourse,
        certificates: certSummary,
        xp: {
          totalPoints: logs.reduce((s, l) => s + (l.points || 0), 0),
          entries: logs.length,
        },
        competency: {
          total: comps.length,
          gaps: comps.filter((c) => c.actualLevel < c.expectedLevel).length,
          met: comps.filter((c) => c.actualLevel >= c.expectedLevel).length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Attendance Logs APIs (QR Check-in)
  app.get("/api/attendance_logs", requireAuth, (req, res) => {
    // Admin และ Editor ดูประวัติเช็คชื่อทั้งหมดได้, ส่วน Viewer ดูได้เฉพาะของตนเอง
    if (req.authUser?.role === "Admin" || req.authUser?.role === "Editor") {
      return res.json(db_attendance_logs);
    }
    const myLogs = db_attendance_logs.filter(
      (l) => l.userId === req.authUser?.id,
    );
    res.json(myLogs);
  });
  app.post(
    "/api/attendance_logs",
    requireAuth,
    // การเช็คอินจริงต้องผ่าน /api/checkin (ตรวจ token + เวลา) เท่านั้น
    // endpoint นี้คงไว้ให้ Admin แก้ไขบันทึกด้วยมือ
    requireRole("Admin"),
    (req, res) => {
      try {
        const log = req.body;
        if (!log.id) {
          log.id = `att-${Date.now()}`;
        }
        if (!log.timestamp) {
          log.timestamp = new Date().toISOString();
        }
        // ป้องกันสแกนซ้ำซ้อนใน session เดียวกัน
        const isDup = db_attendance_logs.some(
          (l) => l.userId === log.userId && l.sessionId === log.sessionId,
        );
        if (isDup) {
          const existing = db_attendance_logs.find(
            (l) => l.userId === log.userId && l.sessionId === log.sessionId,
          );
          return res.json(existing);
        }
        db_attendance_logs.unshift(log);
        res.json(log);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  app.delete(
    "/api/attendance_logs",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        db_attendance_logs = [];
        res.json({ success: true, message: "Attendance logs cleared" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // Training Sessions (คาบอบรมออฟไลน์) — สร้าง/ลบได้เฉพาะ Admin/Editor
  // token ของคาบเป็นความลับ ส่งให้เฉพาะ Admin/Editor เท่านั้น
  app.get("/api/training_sessions", requireAuth, (req, res) => {
    const role = req.authUser!.role;
    if (role === "Admin" || role === "Editor") {
      return res.json(db_training_sessions);
    }
    res.json(db_training_sessions.map(({ token, ...rest }) => rest));
  });
  app.post(
    "/api/training_sessions",
    requireAuth,
    requireRole("Admin", "Editor"),
    (req, res) => {
      try {
        const {
          courseId,
          sessionName,
          location,
          instructor,
          startsAt,
          endsAt,
        } = req.body;
        if (!courseId || !sessionName || !startsAt || !endsAt) {
          return res.status(400).json({
            error: "MISSING_FIELDS",
            message: "กรุณากรอกคอร์ส ชื่อคาบ และช่วงเวลาให้ครบ",
          });
        }
        const start = Date.parse(startsAt);
        const end = Date.parse(endsAt);
        if (isNaN(start) || isNaN(end) || end <= start) {
          return res.status(400).json({
            error: "INVALID_TIME_RANGE",
            message: "ช่วงเวลาไม่ถูกต้อง (เวลาสิ้นสุดต้องหลังเวลาเริ่ม)",
          });
        }
        const course = db_courses.find((c) => c.id === courseId);
        if (!course) {
          return res
            .status(400)
            .json({ error: "COURSE_NOT_FOUND", message: "ไม่พบคอร์สที่เลือก" });
        }
        const session: TrainingSession = {
          id: `ts-${crypto.randomUUID()}`,
          courseId,
          courseTitle: course.title, // ใช้ชื่อจากฐานข้อมูล ไม่เชื่อ client
          sessionName: String(sessionName).trim(),
          location: String(location || "").trim(),
          instructor: String(instructor || "").trim(),
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(end).toISOString(),
          token: crypto.randomBytes(16).toString("hex"),
          createdBy: req.authUser!.employeeId,
          createdAt: new Date().toISOString(),
        };
        db_training_sessions.unshift(session);
        res.json(session);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  app.delete(
    "/api/training_sessions/:id",
    requireAuth,
    requireRole("Admin", "Editor"),
    (req, res) => {
      const existing = db_training_sessions.find((s) => s.id === req.params.id);
      if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
      // Editor ลบได้เฉพาะคาบที่ตัวเองสร้าง
      if (
        req.authUser!.role !== "Admin" &&
        existing.createdBy !== req.authUser!.employeeId
      ) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "ลบได้เฉพาะคาบที่ตัวเองสร้าง",
        });
      }
      db_training_sessions = db_training_sessions.filter(
        (s) => s.id !== req.params.id,
      );
      res.json({ success: true });
    },
  );

  // เช็คอินด้วย token จาก QR — ข้อมูลผู้เช็คอินมาจาก DB ตาม token login ไม่ใช่จาก body
  app.post("/api/checkin", requireAuth, async (req, res) => {
    // 01C-1: อ่านผู้ใช้จาก DB ก่อน — การตรวจซ้ำและ unshift ด้านล่างยังต่อเนื่องแบบ Synchronous เหมือนเดิม
    let user: UserType | undefined;
    try {
      user = await findUserById(req.authUser!.id);
    } catch (err) {
      return sendDbFailure(res, err, "POST /api/checkin");
    }
    try {
      const token = typeof req.body.token === "string" ? req.body.token : "";
      const session = token
        ? db_training_sessions.find((s) => s.token === token)
        : undefined;
      if (!session) {
        return res.status(404).json({
          error: "SESSION_NOT_FOUND",
          message: "QR นี้ไม่ถูกต้องหรือคาบอบรมถูกยกเลิกแล้ว",
        });
      }

      const now = Date.now();
      if (now < Date.parse(session.startsAt)) {
        return res.status(403).json({
          error: "NOT_STARTED",
          message: "ยังไม่ถึงเวลาเช็คอินของคาบนี้",
        });
      }
      if (now > Date.parse(session.endsAt)) {
        return res.status(403).json({
          error: "EXPIRED",
          message: "หมดเวลาเช็คอินของคาบนี้แล้ว",
        });
      }

      if (
        !user ||
        user.status === "Suspended" ||
        user.status === "Terminated"
      ) {
        return res.status(403).json({
          error: "ACCOUNT_INACTIVE",
          message: "บัญชีนี้ไม่สามารถเช็คอินได้",
        });
      }

      const existing = db_attendance_logs.find(
        (l) => l.userId === user.id && l.sessionId === session.id,
      );
      if (existing) {
        return res.json({ log: existing, alreadyCheckedIn: true });
      }

      const log: AttendanceLog = {
        id: `att-${crypto.randomUUID()}`,
        userId: user.id,
        userName: user.name,
        employeeId: user.employeeId,
        department: user.departmentId,
        position: user.position,
        sessionId: session.id,
        sessionName: session.sessionName,
        courseId: session.courseId,
        courseTitle: session.courseTitle,
        timestamp: new Date().toISOString(),
      };
      db_attendance_logs.unshift(log);
      res.json({ log, alreadyCheckedIn: false });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Search Logs APIs: Server-authoritative hasResult calculation
  app.get("/api/search_logs", requireAuth, requireRole("Admin"), (req, res) => {
    res.json(db_search_logs);
  });
  app.post("/api/search_logs", requireAuth, async (req, res) => {
    try {
      const currentDbUser = req.authUser!;
      const rawKeyword =
        typeof req.body.keyword === "string" ? req.body.keyword : "";
      const keyword = rawKeyword.toLowerCase().trim();
      if (!keyword) {
        return res.status(400).json({ error: "KEYWORD_REQUIRED" });
      }

      // Server computes hasResult authoritatively from authorized documents & approved KBs
      // 01C-3: เอกสารอ่านจาก DB แล้วกรองแบบเดิม (รวม d.title.toLowerCase() เดิม) — หลังจุดนี้ยัง Synchronous
      let allDocs: DocumentItem[];
      try {
        allDocs = await listDocuments();
      } catch (dbErr) {
        return sendDbFailure(res, dbErr, "POST /api/search_logs");
      }
      const hasDocMatch = allDocs.some(
        (d) =>
          d.status === "Published" &&
          canAccessDocument(currentDbUser, d) &&
          (d.title.toLowerCase().includes(keyword) ||
            (d.description ?? "").toLowerCase().includes(keyword)),
      );
      // N15: ฟิลด์ตรงกับ matchStr ใน TechnicalKB.tsx (title/problem/cause/solution/prevention/tags/relatedWIs)
      const hasKBMatch = db_kb_articles.some((k) => {
        if (k.status !== "Approved") return false;
        const haystack = [
          k.title,
          k.problem,
          k.cause ?? "",
          k.solution,
          k.prevention ?? "",
          (k.tags || []).join(" "),
          (k.relatedWIs || []).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(keyword);
      });

      const hasResult = hasDocMatch || hasKBMatch;

      const log: SearchLog = {
        id: `sl-${Date.now()}`,
        keyword: rawKeyword,
        userId: currentDbUser.id,
        timestamp: new Date().toISOString(),
        hasResult,
      };
      db_search_logs.unshift(log);
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Search Resolutions (N6) — การปิดช่องว่างความรู้ Admin เท่านั้น (ตรงกับ search_logs)
  // ผู้ปิดมาจาก token ไม่ใช่ body และปิดได้เฉพาะ keyword ที่เป็น gap จริงใน search_logs
  app.get(
    "/api/search_resolutions",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      res.json(db_search_resolutions);
    },
  );
  app.post(
    "/api/search_resolutions",
    requireAuth,
    requireRole("Admin"),
    async (req, res) => {
      try {
        const keyword =
          typeof req.body.keyword === "string" ? req.body.keyword : "";
        const action =
          typeof req.body.action === "string" ? req.body.action.trim() : "";
        const assignedTo =
          typeof req.body.assignedTo === "string"
            ? req.body.assignedTo.trim().slice(0, 200)
            : "";

        if (!keyword.trim()) {
          return res.status(400).json({
            error: "KEYWORD_REQUIRED",
            message: "ไม่พบคำค้นหาที่ต้องการปิดช่องว่าง",
          });
        }
        if (!action) {
          return res.status(400).json({
            error: "ACTION_REQUIRED",
            message: "กรุณากรอกมาตรการปิดช่องว่างความรู้",
          });
        }
        const isRealGap = db_search_logs.some(
          (l) => l.keyword === keyword && !l.hasResult,
        );
        if (!isRealGap) {
          return res.status(404).json({
            error: "GAP_NOT_FOUND",
            message: "ไม่พบช่องว่างความรู้ของคำค้นหานี้ในประวัติการสืบค้น",
          });
        }
        if (db_search_resolutions.some((r) => r.keyword === keyword)) {
          return res.status(409).json({
            error: "ALREADY_RESOLVED",
            message: "ช่องว่างความรู้นี้ถูกปิดไปแล้ว",
          });
        }

        const resolution: SearchResolution = {
          id: `sr-${crypto.randomUUID()}`,
          keyword,
          action: action.slice(0, 2000),
          assignedTo: assignedTo || undefined,
          resolvedBy: req.authUser!.employeeId,
          resolvedByName: req.authUser!.name,
          resolvedAt: new Date().toISOString(),
        };
        db_search_resolutions.unshift(resolution);

        // TODO(01C-4, TX-08): Audit ยังไม่อยู่ใน Transaction เดียวกับ search_resolutions — จะรวมเมื่อกลุ่มนี้ย้ายขึ้น DB
        // ระหว่างนี้ ถ้าเขียน Audit ไม่สำเร็จ การปิดช่องว่างใน Memory ถูกบันทึกแล้วแต่ตอบ 500
        try {
          await insertAuditLog(undefined, {
            id: `log-${crypto.randomUUID()}`,
            action: "RESOLVE_GAP",
            details: `ปิดช่องว่างความรู้ "${keyword.slice(0, 200)}" มาตรการ: ${resolution.action.slice(0, 200)}`,
            performedBy: `${req.authUser!.name} (${req.authUser!.employeeId})`,
            timestamp: resolution.resolvedAt,
          });
        } catch (auditErr) {
          return sendDbFailure(res, auditErr, "POST /api/search_resolutions (audit)");
        }

        res.json(resolution);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // Contact Requests APIs
  app.get("/api/contact_requests", requireAuth, (req, res) => {
    const role = req.authUser!.role;
    if (role === "Admin" || role === "Editor") {
      return res.json(db_contact_requests);
    }
    // Viewer เห็นเฉพาะคำถามที่ตนเองเป็นคนส่งเท่านั้น
    res.json(db_contact_requests.filter((r) => r.userId === req.authUser!.id));
  });
  app.post(
    "/api/contact_requests",
    requireAuth,
    requireOwnField("userId"),
    (req, res) => {
      try {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const bad = (message: string) =>
          res.status(400).json({ error: "INVALID_CONTACT_REQUEST", message });

        // --- Validation: รับเฉพาะ expertId, topic, message (ทุกฟิลด์บังคับ) ---
        // null/undefined/ชนิดผิด ถือเป็นข้อมูลผิดรูปแบบทั้งหมด ไม่ถูกตีความเป็น "ไม่ส่ง"
        const expertId =
          typeof body.expertId === "string" ? body.expertId.trim() : "";
        if (!expertId || expertId.length > 100) {
          return bad("กรุณาระบุผู้เชี่ยวชาญที่ต้องการสอบถาม");
        }
        const topic = typeof body.topic === "string" ? body.topic.trim() : "";
        if (!topic || topic.length > 200) {
          return bad("กรุณากรอกหัวข้อ (ไม่ว่าง และไม่เกิน 200 ตัวอักษร)");
        }
        const message =
          typeof body.message === "string" ? body.message.trim() : "";
        if (!message || message.length > 5000) {
          return bad("กรุณากรอกรายละเอียด (ไม่ว่าง และไม่เกิน 5,000 ตัวอักษร)");
        }

        // --- ผู้เชี่ยวชาญต้องมีอยู่จริง; expertName มาจาก db_experts ไม่ใช่ client ---
        const expert = db_experts.find((e) => e.id === expertId);
        if (!expert) {
          return res.status(404).json({
            error: "EXPERT_NOT_FOUND",
            message: "ไม่พบผู้เชี่ยวชาญที่ระบุ",
          });
        }

        // id ให้ server สร้างเสมอ (ไม่ใช้ id จาก client) และกัน collision
        let generatedId = `cr-${Date.now()}`;
        while (db_contact_requests.some((r) => r.id === generatedId)) {
          generatedId = `cr-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
        }

        // ฟิลด์ระบุตัวตน/สถานะ/เวลา มาจาก server เสมอ (รวมกรณี Admin)
        const me = req.authUser!;
        const newRequest: ContactRequest = {
          id: generatedId,
          userId: me.id,
          userName: me.name,
          userDept: me.departmentId,
          expertId: expert.id,
          expertName: expert.name,
          topic,
          message,
          status: "Sent",
          createdAt: new Date().toISOString(),
        };
        db_contact_requests.unshift(newRequest);
        res.json(newRequest);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  app.post(
    "/api/contact_requests/:id/reply",
    requireAuth,
    requireRole("Admin", "Editor"),
    (req, res) => {
      try {
        const { id } = req.params;
        const { replyMessage } = req.body;
        db_contact_requests = db_contact_requests.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "Replied",
                replyMessage,
              }
            : r,
        );
        const updated = db_contact_requests.find((r) => r.id === id);
        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // Custom Resources APIs — เพิ่ม/ลบได้เฉพาะ Admin (ตรงกับ UI ที่ล็อกไว้แล้ว)
  app.get("/api/custom_resources", requireAuth, (req, res) => {
    res.json(db_custom_resources);
  });
  app.post(
    "/api/custom_resources",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        const resItem = req.body;
        if (!resItem.id) {
          resItem.id = `res-${Date.now()}`;
        }
        db_custom_resources.unshift(resItem);
        res.json(resItem);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  app.delete(
    "/api/custom_resources/:id",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        const { id } = req.params;
        db_custom_resources = db_custom_resources.filter((r) => r.id !== id);
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // Competencies APIs
  app.get("/api/user_competencies", requireAuth, (req, res) => {
    // Admin/Editor เห็นทุกคน (ตาม N10) | Viewer เห็นของตัวเองเท่านั้น
    // scope มาจาก req.authUser เท่านั้น — ไม่อ่าน query/body
    if (canViewAllLearningData(req.authUser)) {
      return res.json(db_user_competencies);
    }
    res.json(db_user_competencies.filter((c) => c.userId === req.authUser!.id));
  });
  // PUT /api/user_competencies/:userId/:skillId — Admin เท่านั้น แก้ได้เฉพาะ actualLevel
  app.put(
    "/api/user_competencies/:userId/:skillId",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        const { userId, skillId } = req.params;
        const level = req.body?.actualLevel;
        if (!Number.isInteger(level) || level < 1 || level > 4) {
          return res.status(400).json({
            error: "INVALID_LEVEL",
            message: "actualLevel ต้องเป็นจำนวนเต็ม 1 ถึง 4",
          });
        }
        const idx = db_user_competencies.findIndex(
          (c) => c.userId === userId && c.skillId === skillId,
        );
        if (idx === -1) {
          return res
            .status(404)
            .json({ error: "NOT_FOUND", message: "ไม่พบรายการ competency" });
        }
        // preserve ทุก field อื่น — เขียนทับเฉพาะ actualLevel
        db_user_competencies[idx] = {
          ...db_user_competencies[idx],
          actualLevel: level,
        };
        res.json(db_user_competencies[idx]);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  // Certificates APIs
  app.get("/api/user_certificates", requireAuth, (req, res) => {
    if (canViewAllLearningData(req.authUser)) {
      return res.json(db_user_certificates);
    }
    res.json(db_user_certificates.filter((c) => c.userId === req.authUser!.id));
  });

  // KM Contribution Logs APIs
  app.get("/api/km_contribution_logs", requireAuth, (req, res) => {
    if (canViewAllLearningData(req.authUser)) {
      return res.json(db_km_contribution_logs);
    }
    res.json(
      db_km_contribution_logs.filter((l) => l.userId === req.authUser!.id),
    );
  });
  app.post(
    "/api/km_contribution_logs",
    requireAuth,
    requireRole("Admin"), // XP จริงสร้างจาก finalizeSubmission เท่านั้น — route นี้เหลือไว้ให้ Admin แก้ด้วยมือ
    async (req, res) => {
      try {
        // เดิมเทียบ `u.id === req.body.userId` — ค่าที่ไม่ใช่ข้อความไม่มีทางตรง
        const targetId = req.body?.userId;
        let target: UserType | undefined;
        try {
          target =
            typeof targetId === "string"
              ? await findUserById(targetId)
              : undefined;
        } catch (dbErr) {
          return sendDbFailure(res, dbErr, "POST /api/km_contribution_logs");
        }
        // 01C-1 (Owner): ผู้ใช้ Terminated = ไม่พบผู้ใช้ (เดิมผู้ใช้ที่ถูกลบหายจากระบบ) → 400 รหัส/ข้อความเดิม
        if (target?.status === "Terminated") target = undefined;
        const points = Number(req.body?.points);
        if (!target || !Number.isFinite(points)) {
          return res.status(400).json({
            error: "INVALID_INPUT",
            message: "ไม่พบผู้ใช้ หรือคะแนนไม่ถูกต้อง",
          });
        }
        const log: KMContributionLog = {
          id: `km-log-${crypto.randomUUID()}`,
          userId: target.id,
          userName: target.name,
          points,
          activityType: req.body.activityType,
          description: String(req.body.description || "").slice(0, 500),
          timestamp: new Date().toISOString(),
        };
        db_km_contribution_logs.unshift(log);
        res.json(log);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  // Leaderboard: server คำนวณจาก logs ทั้งหมด ทุก role เห็นตารางเดียวกัน
  // คืนเฉพาะ field แสดงผล (ไม่มี userId / log รายรายการ) และไม่อ่าน query/body
  app.get("/api/leaderboard", requireAuth, async (req, res) => {
    let allUsers: UserType[];
    try {
      allUsers = await listUsers();
    } catch (err) {
      return sendDbFailure(res, err, "GET /api/leaderboard");
    }
    try {
      const activeUsers = allUsers.filter(
        (u) => u.status !== "Suspended" && u.status !== "Terminated",
      );
      const board = calculateLeaderboard(
        db_km_contribution_logs,
        activeUsers,
      ).map(({ userName, employeeId, departmentId, points, level }) => ({
        userName,
        employeeId,
        departmentId,
        points,
        level,
      }));
      res.json(board);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Employee Master APIs — เฉพาะ Admin/Editor เห็นและจัดการได้ (ตรงกับ UI)
  // 01C-2: ข้อมูลอยู่ใน km.employee_master — Response ไม่มี row_id/sort_order (FS-05)
  // และ isDeptResolved ตัดสินที่ Server ตอนอ่าน (R9) ไม่เชื่อค่าจาก Client (N7)
  app.get(
    "/api/employee_master",
    requireAuth,
    requireRole("Admin", "Editor"),
    async (req, res) => {
      try {
        res.json(await listEmployeeMaster());
      } catch (err) {
        return sendDbFailure(res, err, "GET /api/employee_master");
      }
    },
  );
  app.post(
    "/api/employee_master",
    requireAuth,
    requireRole("Admin", "Editor"),
    async (req, res) => {
      const { employeeMaster: incomingMaster } = req.body;
      if (!Array.isArray(incomingMaster)) {
        return res.status(400).json({ error: "INVALID_PAYLOAD" });
      }
      // Q-2 (ข): ทุกแถวต้องเป็น Plain object — มีแถวใดไม่ใช่ (null, Array, ตัวเลข, String, Boolean)
      // = ปฏิเสธทั้งคำขอ ไม่เขียนอะไร
      const rows = incomingMaster as unknown[];
      if (
        !rows.every(
          (e) => e !== null && typeof e === "object" && !Array.isArray(e),
        )
      ) {
        return res.status(400).json({ error: "INVALID_PAYLOAD" });
      }
      const incoming = rows as Record<string, unknown>[];
      const isAdmin = req.authUser!.role === "Admin";

      // TX-09 (Master V6 §21.9 C): ทั้ง Admin และ Editor เขียนใน Transaction เดียว + LOCK TABLE
      // (SHARE ROW EXCLUSIVE — ผู้เขียนชนกันเอง แต่ SELECT ยังอ่านได้และเห็นข้อมูลชุดก่อน Commit)
      // แล้วอ่านทั้ง Collection ใน Transaction เดียวกันเป็น Response · Error ใด ๆ = ROLLBACK ข้อมูลเดิมอยู่ครบ
      try {
        const saved = await withTransaction(async (client) => {
          await lockEmployeeMaster(client);
          if (isAdmin) {
            // Admin เท่านั้นที่แทนทั้งก้อนได้ (รองรับ "เคลียร์ทั้งหมด" และ import ที่ตั้งใจแทนที่ฐานทั้งก้อน)
            await replaceAllEmployees(client, incoming.map(toEmployeeFields));
          } else {
            // Editor: merge ตาม employeeId เท่านั้น (B-17) ห้ามลบแถวที่มีอยู่เดิม
            const existing = await listExistingForMerge(client);
            await applyEditorMerge(client, planEditorMerge(existing, incoming));
          }
          return listEmployeeMaster(client);
        });
        res.json(saved);
      } catch (err) {
        return sendDbFailure(res, err, "POST /api/employee_master");
      }
    },
  );

  // System Audit Logs APIs — อ่าน/เขียนเฉพาะ Admin
  app.get(
    "/api/system_audit_logs",
    requireAuth,
    requireRole("Admin"),
    async (req, res) => {
      try {
        res.json(await listAuditLogs()); // ใหม่สุดก่อน (เดิม unshift)
      } catch (err) {
        return sendDbFailure(res, err, "GET /api/system_audit_logs");
      }
    },
  );

  // SEC-04: id/timestamp/performedBy ถูกสร้างที่ server เสมอ ไม่เชื่อค่าจาก client
  // action ที่ Client เขียนได้มีเฉพาะรายการนี้ (GRADE_ESSAY/RESOLVE_GAP server เขียนเองเท่านั้น)
  const ADMIN_CLIENT_AUDIT_ACTIONS = [
    "APPROVE_MEMBER",
    "UPDATE_MEMBER",
    "UPDATE_ROLE",
    "DELETE_MEMBER",
  ];
  const AUDIT_DETAILS_MAX_LENGTH = 1000;

  app.post("/api/system_audit_logs", requireAuth, async (req, res) => {
    try {
      const body = req.body;
      // express.json() รับทั้ง object และ array — ต้องเป็น object จริงเท่านั้น
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({
          error: "INVALID_AUDIT_LOG",
          message:
            "รูปแบบข้อมูลไม่ถูกต้อง ต้องเป็น Object ที่มี action และ details",
        });
      }

      const me = req.authUser!;
      const action = typeof body.action === "string" ? body.action : "";
      let details: string;

      if (action === "DOWNLOAD_CERTIFICATE") {
        // ทุก role ที่ login แล้วบันทึกได้ แต่ details สร้างจากตัวตนที่ server ยืนยันเท่านั้น
        // ไม่ระบุหลักสูตร/เจ้าของใบเซอร์/certId เพราะ server ยังตรวจสอบจาก request นี้ไม่ได้
        details = `ดาวน์โหลด/พิมพ์ใบรับรองโดย ${me.name} (${me.employeeId})`;
      } else if (ADMIN_CLIENT_AUDIT_ACTIONS.includes(action)) {
        if (me.role !== "Admin") {
          return res.status(403).json({
            error: "FORBIDDEN",
            message: "คุณไม่มีสิทธิ์บันทึกประวัติกิจกรรมประเภทนี้",
          });
        }
        const rawDetails =
          typeof body.details === "string" ? body.details.trim() : "";
        if (!rawDetails || rawDetails.length > AUDIT_DETAILS_MAX_LENGTH) {
          return res.status(400).json({
            error: "INVALID_AUDIT_LOG",
            message: `กรุณาระบุรายละเอียดกิจกรรม (ไม่ว่าง และไม่เกิน ${AUDIT_DETAILS_MAX_LENGTH} ตัวอักษร)`,
          });
        }
        details = rawDetails;
      } else {
        return res.status(400).json({
          error: "INVALID_AUDIT_LOG",
          message:
            "ประเภทกิจกรรม (action) ไม่ถูกต้อง หรือไม่อนุญาตให้บันทึกจากฝั่ง Client",
        });
      }

      const log: SystemAuditLog = {
        id: `log-${crypto.randomUUID()}`,
        action,
        details,
        performedBy: `${me.name} (${me.employeeId})`,
        timestamp: new Date().toISOString(),
      };
      await insertAuditLog(undefined, log);
      res.json(log);
    } catch (err: any) {
      // ไม่ส่ง err.message กลับ client — บันทึกรายละเอียดไว้ที่ server log เท่านั้น
      // (01C-1: Error ของ DB ก็ตอบ AUDIT_LOG_ERROR แบบเดิมของ Route นี้)
      console.error("POST /api/system_audit_logs failed:", err);
      res.status(500).json({
        error: "AUDIT_LOG_ERROR",
        message: "ไม่สามารถบันทึกประวัติกิจกรรมได้ กรุณาลองใหม่อีกครั้ง",
      });
    }
  });

  // --- Serve Frontend Application seamlessly ---
  if (process.env.NODE_ENV !== "production") {
    // Vite middleware for developer playground
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 [Full-stack Server Live] running on port ${PORT}`);
  });
}

startServer();
