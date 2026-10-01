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
  INITIAL_DOCUMENTS,
  INITIAL_COURSES,
  INITIAL_KB_ARTICLES,
  INITIAL_EXPERTS,
  INITIAL_RATINGS,
  INITIAL_USER_PROGRESS,
  INITIAL_EXAM_RESULTS,
  INITIAL_SEARCH_LOGS,
  INITIAL_CONTACT_REQUESTS,
  INITIAL_EMPLOYEE_MASTER,
} from "./src/data/initialData";
import { DEFAULT_AVATAR_URL } from "./src/utils/assets";
import {
  getDepartmentById,
  getMainDepartmentOf,
} from "./src/utils/departmentUtils";
import {
  getInitialCompetencies,
  getInitialCertificates,
  getInitialKMContributionLogs,
} from "./src/utils/gamificationUtils";
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

dotenv.config();

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

function sanitizeUser<T extends { password?: string }>(user: T) {
  const { password, ...rest } = user;
  return rest;
}

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

let db_users: UserType[] = [];

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
}

// ต้อง login (มี token ที่ถูกต้อง) ถึงจะเข้าถึง endpoint นี้ได้
// ความปลอดภัยระดับ Single Source of Truth: resolve role, departmentId, และ status จาก DB ปัจจุบันเสมอ
function requireAuth(
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
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    // Resolve current DB user: DB user is current authority
    const userInDb = db_users.find(
      (u) =>
        (decoded.id && u.id === decoded.id) ||
        (decoded.employeeId && u.employeeId === decoded.employeeId),
    );
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
  } catch {
    return res.status(401).json({
      error: "INVALID_TOKEN",
      message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
    });
  }
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
 * Seed บัญชี Admin คนแรกของระบบตอน startup
 * - ถ้าตั้ง INITIAL_ADMIN_EMPLOYEE_ID + INITIAL_ADMIN_PASSWORD ใน .env → ใช้ค่านั้น
 * - ถ้าไม่ตั้งเลย → generate รหัสผ่านสุ่มปลอดภัย แล้ว log ออก console ครั้งเดียว
 *   (ต้อง copy ไปใช้ login ครั้งแรกแล้วรีบเปลี่ยนรหัสผ่านทันทีผ่านหน้า Edit User)
 * ไม่ทำถ้ามี user ใน DB อยู่แล้ว (กันไม่ให้ reset ทับบัญชีที่มีคนใช้งานจริงแล้ว)
 */
async function seedInitialAdmin(
  existingUsers: UserType[],
): Promise<UserType[]> {
  if (existingUsers.length > 0) {
    return existingUsers;
  }

  const envEmployeeId = process.env.INITIAL_ADMIN_EMPLOYEE_ID;
  const envPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const envName = process.env.INITIAL_ADMIN_NAME || "ผู้ดูแลระบบเริ่มต้น";
  const envEmail = process.env.INITIAL_ADMIN_EMAIL || "admin@royalmeiwa.com";
  const envPhone = process.env.INITIAL_ADMIN_PHONE || "02-000-0000";
  const envDeptId = process.env.INITIAL_ADMIN_DEPARTMENT_ID || "d-it";
  const envPosition = process.env.INITIAL_ADMIN_POSITION || "ผู้ดูแลระบบ";

  let employeeId = envEmployeeId;
  let plainPassword = envPassword;
  let generated = false;

  if (!employeeId || !plainPassword) {
    // ไม่ได้ตั้งค่าผ่าน .env — generate รหัสผ่านสุ่มปลอดภัยจริง ไม่ hardcode ในซอร์ส
    employeeId = employeeId || "ADMIN001";
    plainPassword = plainPassword || crypto.randomBytes(12).toString("hex");
    generated = true;
  }

  const hashedPassword = await bcrypt.hash(plainPassword, SALT_ROUNDS);
  const adminUser: UserType = {
    id: `usr-${Date.now()}`,
    name: envName,
    employeeId,
    departmentId: envDeptId,
    position: envPosition,
    role: "Admin",
    email: envEmail,
    phone: envPhone,
    avatarUrl: DEFAULT_AVATAR_URL,
    password: hashedPassword,
    startDate: new Date().toISOString().split("T")[0],
  };

  console.log("");
  console.log("========================================================");
  console.log("🔐 ไม่พบบัญชีผู้ใช้ในระบบ — สร้างบัญชี Admin เริ่มต้นแล้ว");
  console.log(`   Employee ID: ${employeeId}`);
  if (generated) {
    console.log(`   Password:    ${plainPassword}`);
    console.log(
      "   ⚠️  รหัสผ่านนี้ generate อัตโนมัติ กรุณา login แล้วเปลี่ยนรหัสผ่านทันที",
    );
    console.log(
      "   💡 ตั้งค่า INITIAL_ADMIN_EMPLOYEE_ID / INITIAL_ADMIN_PASSWORD ใน .env",
    );
    console.log("      เพื่อกำหนดค่าที่ต้องการเองในการ deploy ครั้งถัดไป");
  } else {
    console.log("   Password:    (ตามที่ตั้งไว้ใน .env)");
  }
  console.log("========================================================");
  console.log("");

  return [adminUser];
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // --- In-Memory Databases mirroring real SQL/NoSQL schemas ---
  db_users = await seedInitialAdmin(INITIAL_USERS);
  let db_documents: DocumentItem[] = [...INITIAL_DOCUMENTS];
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
  let db_employee_master: EmployeeMaster[] = [...INITIAL_EMPLOYEE_MASTER];
  let db_system_audit_logs: SystemAuditLog[] = [];
  let db_attendance_logs: AttendanceLog[] = [];
  let db_training_sessions: TrainingSession[] = [];
  let db_quiz_submissions: QuizSubmission[] = [];

  // --- Quiz grading helpers: server เป็นผู้ตัดสินคะแนนเท่านั้น ไม่เชื่อค่าที่ client ส่ง ---
  // ตรวจข้อที่ตรวจอัตโนมัติได้ (SingleChoice / TrueFalse / Matching) — Essay ไม่ผ่านฟังก์ชันนี้
  function isObjectiveCorrect(
    q: Course["quiz"][number],
    answer: string | undefined,
  ): boolean {
    if (typeof answer !== "string" || !answer) return false;
    if ((q.type || "SingleChoice") === "Matching") {
      try {
        const userMap = JSON.parse(answer);
        const correctMap = JSON.parse(q.correctAnswer || "{}");
        const keys = Object.keys(correctMap);
        return (
          keys.length > 0 && keys.every((k) => userMap[k] === correctMap[k])
        );
      } catch {
        return false;
      }
    }
    return answer === q.correctAnswer;
  }

  // ปิดผลสอบ: สร้าง exam_result และตั้ง Completed (เมื่อผ่าน) — เรียกเมื่อไม่มี Essay
  // หรือเมื่อผู้ตรวจให้คะแนน Essay ครบแล้ว (ก้อนที่ 2 จะต่อ XP/ใบเซอร์ในฟังก์ชันนี้)
  function finalizeSubmission(
    sub: QuizSubmission,
    course: Course,
    reviewerEmployeeId?: string,
  ) {
    const essayCorrect = sub.essayGrades.filter((g) => g.correct).length;
    const total = sub.autoTotal + sub.essayQuestionIds.length;
    const score = Math.round(((sub.autoCorrect + essayCorrect) / total) * 100);
    const pass = score >= course.minPassScore;
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
        const isPerfect = score === 100;
        db_km_contribution_logs.unshift({
          id: `km-log-${crypto.randomUUID()}`,
          userId: sub.userId,
          userName: sub.userName,
          points: isPerfect ? 30 : 20,
          activityType: isPerfect ? "COURSE_PERFECT" : "COURSE_PASS",
          description: isPerfect
            ? `อบรมผ่านหลักสูตร "${sub.courseTitle}" ด้วยคะแนนเต็ม 100%`
            : `สอบผ่านหลักสูตร "${sub.courseTitle}" ด้วยคะแนน ${score}%`,
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

      const user = db_users.find(
        (u) => u.employeeId.toLowerCase() === String(employeeId).toLowerCase(),
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
      res.status(500).json({ error: err.message });
    }
  });

  // Self-registration: สมัครเองด้วยรหัสพนักงานที่มีอยู่ใน Employee Master เท่านั้น
  // แยกจาก /api/users (ซึ่งตอนนี้สงวนไว้ให้ Admin จัดการคนอื่นเท่านั้น)
  app.post("/api/register", async (req, res) => {
    try {
      const { password, employeeId } = req.body; // รับเฉพาะฟิลด์ที่จำเป็น ไม่รับ role จาก client
      if (!employeeId || !password) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          message: "ข้อมูลลงทะเบียนไม่ครบถ้วน",
        });
      }

      const employeeRecord = db_employee_master.find(
        (e) => e.employeeId.toLowerCase() === employeeId.toLowerCase(),
      );
      const alreadyRegistered = db_users.some(
        (u) => u.employeeId.toLowerCase() === employeeId.toLowerCase(),
      );

      // รวม error ทั้ง "ไม่พบรหัส" และ "ซ้ำ" ให้เป็นข้อความ/สถานะเดียวกัน
      // เพื่อไม่ให้ใครใช้ endpoint นี้ตรวจสอบ (enumerate) ว่ารหัสพนักงานไหนมีอยู่จริงในระบบได้
      if (!employeeRecord || alreadyRegistered) {
        return res.status(400).json({
          error: "REGISTRATION_FAILED",
          message:
            "ไม่สามารถลงทะเบียนด้วยข้อมูลนี้ได้ กรุณาตรวจสอบรหัสพนักงานอีกครั้ง หรือติดต่อผู้ดูแลระบบ",
        });
      }

      // คำนวณ role เองจากข้อมูล employeeRecord เท่านั้น ห้ามรับจาก client
      let assignedRole: "Admin" | "Editor" | "Viewer" = "Viewer";
      if (
        employeeRecord.level.toLowerCase().includes("senior") ||
        employeeRecord.position.toLowerCase().includes("engineer") ||
        employeeRecord.position.toLowerCase().includes("supervisor")
      ) {
        assignedRole = "Editor";
      }

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const newUser: UserType = {
        id: `usr-${Date.now()}`,
        name: employeeRecord.name,
        employeeId: employeeRecord.employeeId,
        departmentId: employeeRecord.departmentId,
        position: employeeRecord.position,
        role: assignedRole, // ← มาจาก server เท่านั้น
        email: employeeRecord.email,
        phone: employeeRecord.phone,
        password: hashedPassword,
        startDate: employeeRecord.startDate,
      };
      db_users.push(newUser);

      // mark employee master เป็น Registered ที่ server เลย ไม่ต้องให้ client เรียก updateEmployeeMaster แยก
      const idx = db_employee_master.findIndex(
        (e) => e.employeeId === employeeId,
      );
      if (idx !== -1) db_employee_master[idx].status = "Registered";

      const token = signToken({
        id: newUser.id,
        employeeId: newUser.employeeId,
        role: newUser.role,
      });
      res.json({ user: sanitizeUser(newUser), token });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Secure File Upload API Endpoint & Store (ต้อง login ก่อนอัปโหลด) ---
  interface UploadedFileMeta {
    buffer: Buffer;
    mimeType: string;
    uploadedBy: string; // employeeId ของผู้อัปโหลด
    restricted: boolean; // true = เฉพาะ Admin หรือผู้อัปโหลดเองเท่านั้นที่อ่านได้ (สำหรับไฟล์ QP)
    documentId?: string; // id ของ Document ที่ไฟล์นี้ผูกอยู่ (Server-owned binding)
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
          uploadedAt,
        };
        uploadedFiles.set(storedName, fileMeta);

        const metaJson = JSON.stringify({
          restricted: false,
          uploadedBy: req.authUser!.employeeId,
          mimeType: resolvedMimeType,
          documentId: null,
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
  app.post("/api/files/sign", requireAuth, (req, res) => {
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
      const owningDoc = db_documents.find((d) => d.id === meta.documentId);
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
  });

  // รับได้ทั้ง Authorization header ปกติ หรือ query token จาก /api/files/sign
  // Resolve current DB user เสมอ
  function fileRequestAuth(
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

    const userInDb = db_users.find(
      (u) =>
        (rawAuth?.id && u.id === rawAuth.id) ||
        (rawAuth?.employeeId && u.employeeId === rawAuth.employeeId),
    );
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
  app.get("/uploads/:filename", fileRequestAuth, (req, res) => {
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
      const owningDoc = db_documents.find((d) => d.id === meta.documentId);
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

  // --- Secure Server-side Semantic RAG API Endpoint (ต้อง login) ---
  // Server-authoritative context: client ห้ามเป็น authority ของ context/documents/courses/identity
  app.post("/api/chat", requireAuth, async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query is required" });
      }

      const currentDbUser = req.authUser!;

      // Context is built purely from authorized resources on the server
      const authorizedDocs = db_documents.filter(
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
          c.lessons.map((l) => ({
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
        model: "gemini-2.5-flash",
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
      res.status(500).json({
        error: "RAG Server Error",
        message:
          error.message ||
          "An unexpected error occurred during semantic retrieval.",
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
        if (!base64Data || !fileType) {
          return res
            .status(400)
            .json({ error: "base64Data and fileType are required" });
        }

        const contents = [
          {
            inlineData: {
              data: base64Data,
              mimeType: fileType,
            },
          },
          {
            text: `You are an expert HR Data Structurer and OCR extraction system for Royal Meiwa Pax Co., Ltd.
Analyze this uploaded file ("${fileName || "document"}") and extract all employee records.

CRITICAL INSTRUCTIONS:
1. Identify all employees mentioned in the document.
2. For each employee, extract or reasonably deduce:
   - employeeId: The employee code/ID (e.g., RMP-XXXX). If not found, generate a unique sequential ID in format RMP-XXXX starting from a random 4-digit series.
   - name: The full name of the employee (usually in Thai).
   - department: The department or section (e.g., "ฝ่ายผลิต (Production)", "ฝ่ายประกันและควบคุมคุณภาพ (QA/QC)", "แผนกซ่อมบำรุง", "ฝ่ายคลังสินค้าและโลจิสติกส์"). Map to reasonable Thai department names.
   - position: The work position/title (e.g., "Blow Molding Operator", "QA Inspector").
   - startDate: Date in format YYYY-MM-DD. If missing, use current date or default to "2026-06-23".
   - level: The employee level (e.g., "Junior Staff", "Senior Staff", "Supervisor", "Probation Staff").
   - email: Corporate email (e.g. name.firstletter@royalmeiwa.co.th).
   - phone: Thai phone number format (e.g., 08X-XXX-XXXX).
3. Do not invent unrelated data, but make sure all 9 fields of the EmployeeMaster interface are correctly populated.
4. Output must be in JSON matching the specified responseSchema. No external text wrapper.`,
          },
        ];

        const response = await getAI().models.generateContent({
          model: "gemini-2.5-flash",
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
        res.json(parsedData);
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
      const authUserRecord = db_users.find((u) => u.id === req.authUser!.id);
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
        model: "gemini-2.5-flash",
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
  app.get("/api/users", requireAuth, (req, res) => {
    const role = req.authUser!.role;
    if (role === "Admin" || role === "Editor") {
      return res.json(db_users.map(sanitizeUser));
    }
    // Viewer: mask email/phone ของคนอื่น ยกเว้นตัวเอง
    res.json(db_users.map((u) => sanitizeUserForViewer(u, req.authUser!.id)));
  });
  app.post(
    "/api/users",
    requireAuth,
    requireRole("Admin"),
    async (req, res) => {
      try {
        const newUser = { ...req.body };
        if (!newUser.id) newUser.id = `usr-${Date.now()}`;
        if (newUser.password) {
          newUser.password = await bcrypt.hash(newUser.password, SALT_ROUNDS);
        }
        db_users.push(newUser);
        res.json(sanitizeUser(newUser));
      } catch (err: any) {
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
        const updatedUser = { ...req.body };
        if (updatedUser.password) {
          updatedUser.password = await bcrypt.hash(
            updatedUser.password,
            SALT_ROUNDS,
          );
        } else {
          delete updatedUser.password;
        }
        db_users = db_users.map((u) =>
          u.id === id ? { ...u, ...updatedUser } : u,
        );
        const saved = db_users.find((u) => u.id === id);
        res.json(saved ? sanitizeUser(saved) : null);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );
  app.delete(
    "/api/users/:id",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        const { id } = req.params;
        db_users = db_users.filter((u) => u.id !== id);
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // Documents APIs
  // GET /api/documents: Role & Department Authorization Enforcement
  app.get("/api/documents", requireAuth, (req, res) => {
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
        db_documents.map((d) => ({ ...sanitizeQP(d), accessible: true })),
      );
    }

    if (role === "Viewer") {
      // Viewer เห็นเฉพาะเอกสารที่ Published และตนเองได้รับอนุญาตตามแผนกเท่านั้น
      const visible = db_documents.filter(
        (d) => d.status === "Published" && canAccessDocument(currentDbUser, d),
      );
      return res.json(
        visible.map((d) => ({ ...sanitizeQP(d), accessible: true })),
      );
    }

    if (role === "Editor") {
      // Editor: เห็นเฉพาะเอกสารของแผนกที่ตนเองได้รับสิทธิ์เท่านั้น (ทั้ง Draft, Pending, Published)
      // เอกสารข้ามแผนกที่ไม่มีสิทธิ์ จะไม่แสดงในระบบเลยเช่นเดียวกับ Viewer
      const visible = db_documents.filter((d) =>
        canAccessDocument(currentDbUser, d),
      );
      return res.json(
        visible.map((d) => ({ ...sanitizeQP(d), accessible: true })),
      );
    }

    // Default fallback (role อื่นๆ)
    const fallbackVisible = db_documents.filter(
      (d) => d.status === "Published" && canAccessDocument(currentDbUser, d),
    );
    res.json(
      fallbackVisible.map((d) => ({ ...sanitizeQP(d), accessible: true })),
    );
  });

  // GET /api/documents/stats: Global Stats (สำหรับ Dashboard KPI ส่วนกลาง)
  app.get("/api/documents/stats", requireAuth, (req, res) => {
    try {
      const currentMonthKey = new Date().toISOString().slice(0, 7); // "YYYY-MM"
      const publishedDocs = db_documents.filter(
        (d) => d.status === "Published",
      );
      const pendingDocs = db_documents.filter(
        (d) => d.status === "Pending Approval",
      );
      const approvedKBs = db_kb_articles.filter((k) => k.status === "Approved");

      const docViews = db_documents.reduce((sum, d) => sum + (d.views || 0), 0);
      const docDownloads = db_documents.reduce(
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
        total: db_documents.length,
        published: publishedDocs.length,
        pending: pendingDocs.length,
        views: docViews + kbViews,
        downloads: docDownloads,
        newThisMonth: newDocsThisMonth + newKBsThisMonth,
        kbApproved: approvedKBs.length,
        kbViews,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/documents: First Binding (Server-owned file ownership)
  app.post(
    "/api/documents",
    requireAuth,
    requireRole("Admin", "Editor"),
    (req, res) => {
      try {
        const newDoc: DocumentItem = { ...req.body };
        if (!newDoc.id) {
          newDoc.id = `doc-${Date.now()}`;
        }
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
          if (fileMeta.documentId) {
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
        }

        newDoc.status = isAdmin ? "Published" : "Pending Approval";
        newDoc.approvedBy = isAdmin ? currentDbUser.employeeId : undefined;
        newDoc.approvedAt = isAdmin ? new Date().toISOString() : undefined;
        newDoc.views = 0;
        newDoc.downloads = 0;

        // Perform server-owned file binding
        if (attachedStoredName) {
          updateSidecar(attachedStoredName, {
            documentId: newDoc.id,
            restricted: newDoc.type === "QP",
          });
        }

        db_documents.unshift(newDoc);
        res.json({ ...newDoc, accessible: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // PUT /api/documents/:id: Whitelist editable fields & enforce ownership preservation
  app.put(
    "/api/documents/:id",
    requireAuth,
    requireRole("Admin", "Editor"),
    (req, res) => {
      try {
        const { id } = req.params;
        const existing = db_documents.find((d) => d.id === id);
        if (!existing) {
          return res.status(404).json({ error: "NOT_FOUND" });
        }

        const currentDbUser = req.authUser!;
        const isAdmin = currentDbUser.role === "Admin";

        // Must be authorized to access this document
        if (!canAccessDocument(currentDbUser, existing)) {
          return res.status(403).json({
            error: "FORBIDDEN",
            message: "คุณไม่มีสิทธิ์แก้ไขเอกสารของแผนกนี้",
          });
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
            return res.status(400).json({
              error: "INVALID_DEPARTMENT",
              message: "รหัสแผนกไม่ถูกต้องหรือไม่พบในระบบ",
            });
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
            return res.status(400).json({
              error: "INVALID_DEPARTMENT_ACCESS",
              message: deptErr.message || "รหัสแผนกไม่ถูกต้องหรือไม่พบในระบบ",
            });
          }
        }

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
          status: isAdmin
            ? req.body.status || existing.status
            : existing.status,
          approvedBy: isAdmin
            ? req.body.approvedBy !== undefined
              ? req.body.approvedBy
              : existing.approvedBy
            : existing.approvedBy,
          approvedAt: isAdmin
            ? req.body.approvedAt !== undefined
              ? req.body.approvedAt
              : existing.approvedAt
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

        db_documents = db_documents.map((d) => (d.id === id ? updatedDoc : d));
        res.json({ ...updatedDoc, accessible: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // POST /api/documents/:id/view: Verify department authorization before incrementing view count
  app.post("/api/documents/:id/view", requireAuth, (req, res) => {
    try {
      const { id } = req.params;
      const currentDbUser = req.authUser!;
      const doc = db_documents.find((d) => d.id === id);
      if (!doc) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }
      if (!canAccessDocument(currentDbUser, doc)) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "คุณไม่มีสิทธิ์เข้าถึงเอกสารนี้",
        });
      }
      doc.views = (doc.views || 0) + 1;
      const role = currentDbUser.role;
      const safe =
        doc.type === "QP" && role !== "Admin"
          ? (({ parsedExcelSheets, ...r }) => r)(doc)
          : doc;
      res.json({ ...safe, accessible: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/documents/:id/download: Verify department authorization & QP restriction
  app.post("/api/documents/:id/download", requireAuth, (req, res) => {
    try {
      const { id } = req.params;
      const currentDbUser = req.authUser!;
      const doc = db_documents.find((d) => d.id === id);
      if (!doc) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }
      if (!canAccessDocument(currentDbUser, doc)) {
        return res.status(403).json({
          error: "FORBIDDEN",
          message: "คุณไม่มีสิทธิ์เข้าถึงเอกสารนี้",
        });
      }
      // QP Rule: Non-admin cannot download QP documents
      if (doc.type === "QP" && currentDbUser.role !== "Admin") {
        return res.status(403).json({
          error: "QP_RESTRICTED",
          message:
            "เอกสารระเบียบปฏิบัติงาน (QP) สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น",
        });
      }
      doc.downloads = (doc.downloads || 0) + 1;
      res.json({ ...doc, accessible: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/documents/:id: Admin only & mark file as orphaned (Invariant 7)
  app.delete(
    "/api/documents/:id",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        const { id } = req.params;
        const existing = db_documents.find((d) => d.id === id);
        if (!existing) {
          return res.status(404).json({ error: "NOT_FOUND" });
        }
        // Invariant 7: If owning doc is deleted, mark file as orphaned
        const fileRef = existing.realFileUrl || existing.fileUrl;
        if (fileRef && fileRef.startsWith("/uploads/")) {
          const storedName = fileRef.replace("/uploads/", "").split("?")[0];
          updateSidecar(storedName, { documentId: `deleted:${id}` });
        }
        db_documents = db_documents.filter((d) => d.id !== id);
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  app.post(
    "/api/documents/:id/approve",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        const { id } = req.params;
        const { approverName } = req.body;
        db_documents = db_documents.map((doc) =>
          doc.id === id
            ? {
                ...doc,
                status: "Published",
                approvedBy: approverName,
                approvedAt: new Date().toISOString(),
              }
            : doc,
        );
        const updated = db_documents.find((doc) => doc.id === id);
        res.json(updated ? { ...updated, accessible: true } : null);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
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
        if (!newCourse.id) {
          newCourse.id = `c-${Date.now()}`;
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
        db_courses = db_courses.filter((c) => c.id !== id);
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // ส่งข้อสอบ: server ตรวจเอง — ปรนัย/ถูก-ผิด/จับคู่ตัดสินทันที
  // ถ้ามีข้อ Essay จะเป็น PendingReview จนกว่าผู้ตรวจให้คะแนนครบ (ก้อนที่ 2)
  app.post("/api/courses/:id/submit-quiz", requireAuth, (req, res) => {
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
      const user = db_users.find((u) => u.id === req.authUser!.id);
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

      const rawAnswers =
        req.body.answers && typeof req.body.answers === "object"
          ? req.body.answers
          : {};
      const answers: { [qId: string]: string } = {};
      const essayQuestionIds: string[] = [];
      let autoCorrect = 0;
      let autoTotal = 0;
      course.quiz.forEach((q) => {
        const a =
          typeof rawAnswers[q.id] === "string"
            ? rawAnswers[q.id].slice(0, 5000)
            : "";
        answers[q.id] = a;
        if ((q.type || "SingleChoice") === "Essay") {
          essayQuestionIds.push(q.id);
        } else {
          autoTotal++;
          if (isObjectiveCorrect(q, a)) autoCorrect++;
        }
      });

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
        status: "PendingReview",
        submittedAt: new Date().toISOString(),
      };
      db_quiz_submissions.unshift(sub);

      if (essayQuestionIds.length === 0) {
        finalizeSubmission(sub, course);
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
    (req, res) => {
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

        sub.essayGrades = grades;
        finalizeSubmission(sub, course, req.authUser!.employeeId);

        const reviewer = db_users.find((u) => u.id === req.authUser!.id);
        db_system_audit_logs.unshift({
          id: `log-${crypto.randomUUID()}`,
          action: "GRADE_ESSAY",
          details: `ตรวจข้อสอบ Essay: ${sub.userName} (${sub.employeeId}) หลักสูตร "${sub.courseTitle}" คะแนน ${sub.score}% (${sub.pass ? "ผ่าน" : "ไม่ผ่าน"})`,
          performedBy: reviewer
            ? `${reviewer.name} (${reviewer.employeeId})`
            : req.authUser!.employeeId,
          timestamp: new Date().toISOString(),
        });

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
  app.post("/api/kb_articles", requireAuth, (req, res) => {
    // ทุก role ที่ login แล้วเสนอความรู้/ร่างบทความได้ (workflow อนุมัติควบคุมที่ /approve)
    try {
      const newArt = req.body;
      if (!newArt.id) {
        newArt.id = `kb-${Date.now()}`;
      }
      // บังคับ status จาก role ที่ server ตรวจสอบเองเท่านั้น ห้ามเชื่อ client
      newArt.status = req.authUser!.role === "Admin" ? "Approved" : "Pending";
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
  app.get("/api/ratings", requireAuth, (req, res) => {
    res.json(db_ratings);
  });
  app.post(
    "/api/ratings",
    requireAuth,
    requireOwnField("userId"),
    (req, res) => {
      try {
        const rating = req.body;
        if (!rating.id) {
          rating.id = `r-${Date.now()}`;
        }
        db_ratings.unshift(rating);
        res.json(rating);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // User Progress APIs — เขียนได้ทุก login (เป็นข้อมูลของตัวเอง)
  app.get("/api/user_progress", requireAuth, (req, res) => {
    res.json(db_user_progress);
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
    res.json(db_exam_results);
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
  app.post("/api/checkin", requireAuth, (req, res) => {
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

      const user = db_users.find((u) => u.id === req.authUser!.id);
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
  app.post("/api/search_logs", requireAuth, (req, res) => {
    try {
      const currentDbUser = req.authUser!;
      const rawKeyword =
        typeof req.body.keyword === "string" ? req.body.keyword : "";
      const keyword = rawKeyword.toLowerCase().trim();
      if (!keyword) {
        return res.status(400).json({ error: "KEYWORD_REQUIRED" });
      }

      // Server computes hasResult authoritatively from authorized documents & approved KBs
      const hasDocMatch = db_documents.some(
        (d) =>
          d.status === "Published" &&
          canAccessDocument(currentDbUser, d) &&
          (d.title.toLowerCase().includes(keyword) ||
            d.description.toLowerCase().includes(keyword)),
      );
      const hasKBMatch = db_kb_articles.some(
        (k) =>
          k.status === "Approved" &&
          (k.title.toLowerCase().includes(keyword) ||
            k.problem.toLowerCase().includes(keyword) ||
            k.solution.toLowerCase().includes(keyword)),
      );

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
        const contactReq = req.body;
        if (!contactReq.id) {
          contactReq.id = `cr-${Date.now()}`;
        }
        db_contact_requests.unshift(contactReq);
        res.json(contactReq);
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
    res.json(db_user_competencies);
  });
  app.post("/api/user_competencies", requireAuth, (req, res) => {
    try {
      const { competencies } = req.body;
      if (Array.isArray(competencies)) {
        const isAdmin = req.authUser?.role === "Admin";
        const allowed = isAdmin
          ? competencies
          : competencies.filter((c) => c.userId === req.authUser?.id);
        allowed.forEach((comp) => {
          const idx = db_user_competencies.findIndex(
            (c) => c.userId === comp.userId && c.skillId === comp.skillId,
          );
          if (idx !== -1) {
            db_user_competencies[idx] = comp;
          } else {
            db_user_competencies.push(comp);
          }
        });
      }
      res.json(db_user_competencies);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Certificates APIs
  app.get("/api/user_certificates", requireAuth, (req, res) => {
    res.json(db_user_certificates);
  });
  app.post("/api/user_certificates", requireAuth, (req, res) => {
    try {
      const { certificates } = req.body;
      if (Array.isArray(certificates)) {
        const isAdmin = req.authUser?.role === "Admin";
        const allowed = isAdmin
          ? certificates
          : certificates.filter((c) => c.userId === req.authUser?.id);
        allowed.forEach((cert) => {
          const idx = db_user_certificates.findIndex((c) => c.id === cert.id);
          if (idx !== -1) {
            db_user_certificates[idx] = cert;
          } else {
            db_user_certificates.push(cert);
          }
        });
      }
      res.json(db_user_certificates);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // KM Contribution Logs APIs
  app.get("/api/km_contribution_logs", requireAuth, (req, res) => {
    res.json(db_km_contribution_logs);
  });
  app.post(
    "/api/km_contribution_logs",
    requireAuth,
    requireOwnField("userId"),
    (req, res) => {
      try {
        const log = req.body;
        if (!log.id) {
          log.id = `km-log-${Date.now()}`;
        }
        db_km_contribution_logs.unshift(log);
        res.json(log);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // Employee Master APIs — เฉพาะ Admin/Editor เห็นและจัดการได้ (ตรงกับ UI)
  app.get(
    "/api/employee_master",
    requireAuth,
    requireRole("Admin", "Editor"),
    (req, res) => {
      res.json(db_employee_master);
    },
  );
  app.post(
    "/api/employee_master",
    requireAuth,
    requireRole("Admin", "Editor"),
    (req, res) => {
      try {
        const { employeeMaster } = req.body;
        if (!Array.isArray(employeeMaster)) {
          return res.status(400).json({ error: "INVALID_PAYLOAD" });
        }

        if (req.authUser!.role === "Admin") {
          // Admin เท่านั้นที่ full-replace ได้ (รองรับ "เคลียร์ทั้งหมด" และ
          // import ที่ตั้งใจแทนที่ฐานทั้งก้อน)
          db_employee_master = employeeMaster;
        } else {
          // Editor: merge/upsert ตาม employeeId เท่านั้น ห้ามลบ record ที่มีอยู่เดิม
          // ป้องกัน Editor ล้างฐานพนักงานทั้งหมดโดยไม่ได้ตั้งใจหรือมีเจตนาร้าย
          const merged = [...db_employee_master];
          employeeMaster.forEach((incoming) => {
            const idx = merged.findIndex(
              (e) => e.employeeId === incoming.employeeId,
            );
            if (idx !== -1) {
              merged[idx] = incoming;
            } else {
              merged.push(incoming);
            }
          });
          db_employee_master = merged;
        }
        res.json(db_employee_master);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // System Audit Logs APIs — อ่าน/เขียนเฉพาะ Admin
  app.get(
    "/api/system_audit_logs",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      res.json(db_system_audit_logs);
    },
  );
  app.post(
    "/api/system_audit_logs",
    requireAuth,
    requireRole("Admin"),
    (req, res) => {
      try {
        const log = req.body;
        if (!log.id) {
          log.id = `log-${Date.now()}`;
        }
        db_system_audit_logs.unshift(log);
        res.json(log);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

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
