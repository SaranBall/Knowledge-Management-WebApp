/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { QuizQuestion } from "../types";

/**
 * Quiz Rules — ฟังก์ชันกลางของ Q1 (Submission & Score)
 *
 * อ้างอิง (Docs @ 4a7a5ed): Contract Rev5.3 §5.1–5.3, §6.1, §8;
 * Gap Closure Rev.5 §2.10, §2.12; Addendum §21.21 (รวม §2.6)
 *
 * ทุกฟังก์ชันในไฟล์นี้เป็น Pure function: ไม่แก้ Input, ไม่ Log และไม่ขึ้นกับ Storage
 * ใช้ร่วมกันได้ทั้ง Server (finalizeSubmission / Submit route) และ Client (Reviewer preview)
 */

/** QZ-04 / Contract §6.1: Truncate คำตอบทุกข้อที่ 5000 UTF-16 code units */
export const ANSWER_MAX_LENGTH = 5000;

// ---------------------------------------------------------------------------
// Score — P-25 / ODR-01 / XP perfect (Contract §8, Gap Closure §2.10)
// ---------------------------------------------------------------------------

export interface QuizScoreInput {
  correctCount: number;
  totalCount: number;
  minPassScore: number;
}

export interface QuizScoreResult {
  /** คะแนนแบบตัดทิ้ง 2 ตำแหน่ง (h / 100) ในช่วง 0–100 */
  score: number;
  /** ตัดสินจากจำนวนเต็ม `correctCount * 100 >= minPassScore * totalCount` ไม่ใช้ค่าที่ปัดหรือตัดทิ้ง */
  pass: boolean;
  /** `totalCount > 0 && correctCount === totalCount` */
  perfect: boolean;
}

/**
 * คำนวณคะแนนสุดท้ายของ Quiz Submission
 *
 * - `h = Math.floor(correctCount * 10000 / totalCount)`; `score = h / 100` (ตัดทิ้ง ไม่ปัด)
 * - `pass = correctCount * 100 >= minPassScore * totalCount` (P-25)
 * - `perfect = totalCount > 0 && correctCount === totalCount` (XP perfect)
 *
 * Precondition (Gap Closure §2.10): `correctCount`/`totalCount` เป็น Integer,
 * `totalCount > 0`, `0 <= correctCount <= totalCount` — ถ้าไม่ผ่านจะ throw `RangeError`
 * (ข้อความไม่มีค่าจาก Input) เพื่อไม่ให้เกิดคะแนน NaN/นอกช่วงแบบเงียบ ๆ
 * `minPassScore` ไม่ตรวจที่นี่ (การ Validate Threshold เป็นงาน Q2 / P-19)
 */
export function computeQuizScore({
  correctCount,
  totalCount,
  minPassScore,
}: QuizScoreInput): QuizScoreResult {
  if (
    !Number.isSafeInteger(correctCount) ||
    !Number.isSafeInteger(totalCount) ||
    totalCount <= 0 ||
    correctCount < 0 ||
    correctCount > totalCount ||
    !Number.isSafeInteger(correctCount * 10000)
  ) {
    throw new RangeError("computeQuizScore: precondition violated");
  }

  const h = Math.floor((correctCount * 10000) / totalCount);
  const score = h / 100;
  const pass = correctCount * 100 >= minPassScore * totalCount;
  const perfect = totalCount > 0 && correctCount === totalCount;

  return { score, pass, perfect };
}

/**
 * จัดรูปแบบคะแนนเพื่อ "แสดงผล" เท่านั้น (2 ตำแหน่ง)
 *
 * ใช้กับค่าที่ผ่าน `computeQuizScore` (h / 100) แล้วเท่านั้น — กับค่านั้น `toFixed(2)`
 * ไม่เปลี่ยนตัวเลข (Contract §8) ห้ามใช้ฟังก์ชันนี้คำนวณหรือบันทึกคะแนน
 * และไม่ได้กำหนดนโยบายของคะแนนที่ไม่ Normalize เช่น Manual Exam Result (U-02)
 */
export function formatScore(score: number): string {
  return score.toFixed(2);
}

// ---------------------------------------------------------------------------
// essayTotal — D1 / Addendum §21.21 §2.6–2.7 / Gap Closure §2.12
// ---------------------------------------------------------------------------

export interface EssayTotalSource {
  /** `essayTotal` ที่บันทึก ณ Submit; `undefined`/`null` = ไม่มีแหล่งข้อมูล (ไม่ใช่ 0) */
  readonly essayTotal?: unknown;
  /** Essay ที่ตอบแล้วและรอ Review (P-21) — ไม่ใช่จำนวน Essay ทั้งหมด */
  readonly essayQuestionIds: readonly string[];
}

export type EssayTotalUnknownReason =
  /** ไม่มี `essayTotal` (`undefined` หรือ `null`) */
  | "MISSING"
  /** `essayTotal` ไม่ใช่ Integer >= 0 หรือ `essayQuestionIds` ไม่ใช่ Array */
  | "INVALID"
  /** `essayTotal < essayQuestionIds.length` (Addendum §21.21 §2.6) */
  | "INCONSISTENT";

export type EssayTotalResolution =
  | { known: true; essayTotal: number }
  | { known: false; reason: EssayTotalUnknownReason };

/**
 * หาจำนวน Essay ทั้งหมดที่เชื่อถือได้ของ Submission
 *
 * Q1 ใช้แหล่งเดียวคือ `essayTotal` ที่บันทึกไว้ (Gap Closure §2.12 ข้อ 1)
 * ไม่ใช้ Essay Snapshot (Q3), ไม่ใช้ `essayQuestionIds.length` และไม่อ่าน Course ปัจจุบัน
 * ผล Unknown = ผู้เรียกต้อง Fail closed ตาม D1(b) (ไม่ Finalize)
 * ฟังก์ชันนี้ไม่แก้และไม่ Finalize Submission
 */
export function resolveEssayTotal(sub: EssayTotalSource): EssayTotalResolution {
  const { essayTotal, essayQuestionIds } = sub;

  if (essayTotal === undefined || essayTotal === null) {
    return { known: false, reason: "MISSING" };
  }
  if (
    typeof essayTotal !== "number" ||
    !Number.isSafeInteger(essayTotal) ||
    essayTotal < 0 ||
    !Array.isArray(essayQuestionIds)
  ) {
    return { known: false, reason: "INVALID" };
  }
  if (essayTotal < essayQuestionIds.length) {
    return { known: false, reason: "INCONSISTENT" };
  }
  return { known: true, essayTotal };
}

// ---------------------------------------------------------------------------
// Submit — answers shape (P-21, ODR-03) และ Unanswered (P-21, P-23)
// ---------------------------------------------------------------------------

export type SubmittedAnswers = Readonly<Record<string, unknown>>;

export type ParseAnswersResult =
  | { ok: true; answers: SubmittedAnswers }
  | { ok: false; error: "INVALID_ANSWERS" };

/**
 * ตรวจรูปร่างของ `answers` ที่ส่งมา (Contract §5.2)
 *
 * - absent (`undefined`) หรือ `null` = ไม่มีคำตอบ → `{ ok: true, answers: {} }` (§5.1 ข้อ 3)
 * - Plain Object (ไม่ใช่ `null`, ไม่ใช่ Array, `typeof === "object"`) → ใช้ตามเดิม
 *   โดยคืน Object เดิม ไม่ Copy จึงไม่เสีย Own property อย่าง `__proto__`/`constructor`
 *   และไม่เปลี่ยน Prototype
 * - อื่น ๆ (Array, String รวม `""`, Number รวม `0`, Boolean รวม `false` ฯลฯ) → `INVALID_ANSWERS`
 *
 * ผู้เรียกต้องเรียกหลังตรวจ `ALREADY_PENDING` (ODR-03) ฟังก์ชันนี้ไม่ Log ค่าใด ๆ
 */
export function parseSubmittedAnswers(raw: unknown): ParseAnswersResult {
  if (raw === undefined || raw === null) {
    return { ok: true, answers: {} };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "INVALID_ANSWERS" };
  }
  return { ok: true, answers: raw as SubmittedAnswers };
}

/**
 * Truncate คำตอบหนึ่งข้อ (Contract §6.1): ค่าที่ไม่ใช่ String → `""`
 * ตัดที่ 5000 UTF-16 code units ด้วย `.slice`
 */
export function truncateAnswer(value: unknown): string {
  return typeof value === "string" ? value.slice(0, ANSWER_MAX_LENGTH) : "";
}

/**
 * Unanswered ตาม P-21/P-23: ไม่ใช่ String หรือว่างหลัง `String.prototype.trim`
 * (`trim` ลบ NBSP และ U+FEFF แต่ไม่ลบ U+200B) — ไม่มี Unicode normalization เพิ่ม
 */
export function isUnansweredText(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

// ---------------------------------------------------------------------------
// Grading ตอน Submit
// ---------------------------------------------------------------------------

type QuizQuestionLike = Pick<
  QuizQuestion,
  "id" | "type" | "correctAnswer"
>;

/**
 * ตรวจข้อ Objective (SingleChoice / TrueFalse / Matching) — คงพฤติกรรมเดิมของ
 * `server.ts:486–503` (@cb3bb89) ทุกประการ (P-24) คำตอบว่างหรือไม่ใช่ String = ผิด
 */
export function isObjectiveCorrect(
  q: QuizQuestionLike,
  answer: string | undefined,
): boolean {
  if (typeof answer !== "string" || !answer) return false;
  if ((q.type || "SingleChoice") === "Matching") {
    try {
      const userMap = JSON.parse(answer);
      const correctMap = JSON.parse(q.correctAnswer || "{}");
      const keys = Object.keys(correctMap);
      return keys.length > 0 && keys.every((k) => userMap[k] === correctMap[k]);
    } catch {
      return false;
    }
  }
  return answer === q.correctAnswer;
}

export interface SubmissionGrading {
  /** คำตอบหลัง Truncate ของทุกข้อใน Quiz (key = Question ID เป็น Own property) */
  answers: { [questionId: string]: string };
  /** Essay ที่ตอบแล้วเท่านั้น (P-21) — รอ Review */
  essayQuestionIds: string[];
  autoCorrect: number;
  autoTotal: number;
  /** จำนวน Essay ทั้งหมดใน Quiz ณ เวลา Submit รวมข้อที่ไม่ได้ตอบ (D1, Addendum §21.21 §2.4) */
  essayTotal: number;
}

/** สร้าง Own data property เสมอ — กัน Setter ของ `__proto__` ทำให้ข้อมูลหายหรือเปลี่ยน Prototype */
function setOwn(target: Record<string, string>, key: string, value: string) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * ตรวจคำตอบตอน Submit (Contract §5.1 ข้อ 4–6)
 *
 * วนตามรายการใน `quiz` (นับรายการ ไม่นับ ID ที่ไม่ซ้ำ — เหมือน `autoTotal` เดิม)
 * - อ่านเฉพาะ Own property ของ `answers`; Truncate; ค่าที่ไม่ใช่ String → `""`
 * - Essay: นับใน `essayTotal` ทุกข้อ; เข้า `essayQuestionIds` เฉพาะข้อที่ตอบแล้ว
 * - Objective: ตรวจด้วย `isObjectiveCorrect` (ข้อว่าง = ผิด = 0 คะแนน)
 *
 * ไม่แก้ `quiz` หรือ `answers` และไม่ Validate Course config (Q2)
 */
export function buildSubmissionGrading(
  quiz: readonly QuizQuestionLike[],
  answers: SubmittedAnswers,
): SubmissionGrading {
  const out: { [questionId: string]: string } = {};
  const essayQuestionIds: string[] = [];
  let autoCorrect = 0;
  let autoTotal = 0;
  let essayTotal = 0;

  for (const q of quiz) {
    const raw = Object.hasOwn(answers, q.id) ? answers[q.id] : undefined;
    const a = truncateAnswer(raw);
    setOwn(out, q.id, a);

    if ((q.type || "SingleChoice") === "Essay") {
      essayTotal++;
      if (!isUnansweredText(a)) essayQuestionIds.push(q.id);
    } else {
      autoTotal++;
      if (isObjectiveCorrect(q, a)) autoCorrect++;
    }
  }

  return { answers: out, essayQuestionIds, autoCorrect, autoTotal, essayTotal };
}
