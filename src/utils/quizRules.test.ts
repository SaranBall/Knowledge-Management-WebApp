/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// TD-14 corpus สำหรับ Q1-1 — รันด้วย node:test ผ่าน tsx (ไม่เพิ่ม Dependency)
//   tsx --test src/utils/quizRules.test.ts
// ค่าที่คาดหวังมาจาก Contract Rev5.3 §5.2–5.3, §6.1, §8, Gap Closure Rev.5 §2.10/§2.12,
// Implementation Preflight §2.1/§5 และ Addendum §21.21 (Docs @ 4a7a5ed)

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ANSWER_MAX_LENGTH,
  buildSubmissionGrading,
  computeQuizScore,
  formatScore,
  isObjectiveCorrect,
  isUnansweredText,
  parseSubmittedAnswers,
  resolveEssayTotal,
  truncateAnswer,
} from "./quizRules";

type Q = {
  id: string;
  type: "SingleChoice" | "TrueFalse" | "Matching" | "Essay";
  correctAnswer: string;
};

const TF_TRUE = "ถูก (True)";
const TF_FALSE = "ผิด (False)";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// A. Score boundaries (Contract §8, ODR-01, P-25, XP perfect)
// ---------------------------------------------------------------------------

describe("A. computeQuizScore — score boundaries", () => {
  // Boundary Corpus 10 แถวของ Contract §8 — ภายใต้ P-25 ทุกแถวเก็บเป็น xx.50
  const boundaryRows: Array<[number, number, number, string]> = [
    [23, 40, 57.5, "57.50"],
    [46, 80, 57.5, "57.50"],
    [69, 120, 57.5, "57.50"],
    [92, 160, 57.5, "57.50"],
    [29, 200, 14.5, "14.50"],
    [57, 200, 28.5, "28.50"],
    [113, 200, 56.5, "56.50"],
    [115, 200, 57.5, "57.50"],
    [138, 240, 57.5, "57.50"],
    [161, 280, 57.5, "57.50"],
  ];
  for (const [c, t, score, text] of boundaryRows) {
    it(`boundary ${c}/${t} → ${text}`, () => {
      const r = computeQuizScore({ correctCount: c, totalCount: t, minPassScore: 0 });
      assert.equal(r.score, score);
      assert.equal(formatScore(r.score), text);
    });
  }

  it("2/3 → 66.66 (truncate, not 66.67)", () => {
    const r = computeQuizScore({ correctCount: 2, totalCount: 3, minPassScore: 0 });
    assert.equal(r.score, 66.66);
    assert.equal(formatScore(r.score), "66.66");
    assert.notEqual(formatScore(r.score), ((2 / 3) * 100).toFixed(2)); // toFixed ปัดเป็น 66.67
  });

  it("100/100 → 100.00 and perfect", () => {
    const r = computeQuizScore({ correctCount: 100, totalCount: 100, minPassScore: 80 });
    assert.deepEqual(r, { score: 100, pass: true, perfect: true });
    assert.equal(formatScore(r.score), "100.00");
  });

  it("39/40 at threshold 98 → 97.50 fail (old Math.round gave 98 pass)", () => {
    const r = computeQuizScore({ correctCount: 39, totalCount: 40, minPassScore: 98 });
    assert.equal(r.score, 97.5);
    assert.equal(r.pass, false);
    assert.equal(Math.round((39 / 40) * 100) >= 98, true); // สูตรเดิมผ่านเกินจริง
  });

  it("399/400 → 99.75, not perfect", () => {
    const r = computeQuizScore({ correctCount: 399, totalCount: 400, minPassScore: 60 });
    assert.equal(r.score, 99.75);
    assert.equal(r.perfect, false);
    assert.equal(r.pass, true);
    assert.equal(Math.round((399 / 400) * 100), 100); // สูตรเดิมได้ 100 → XP perfect ผิด
  });

  it("Owner truncation examples: 66.666…/66.665/66.664 → 66.66", () => {
    // 66.665 = 13333/20000 ; 66.664 = 8333/12500 ; 66.666… = 2/3
    for (const [c, t] of [[2, 3], [13333, 20000], [8333, 12500]]) {
      assert.equal(computeQuizScore({ correctCount: c, totalCount: t, minPassScore: 0 }).score, 66.66);
    }
  });

  it("forbidden formula Math.floor((c/t)*100*100) differs (23/40 → 57.49)", () => {
    assert.equal(Math.floor((23 / 40) * 100 * 100) / 100, 57.49);
    assert.equal(computeQuizScore({ correctCount: 23, totalCount: 40, minPassScore: 0 }).score, 57.5);
  });

  it("truncation matches BigInt integer division for all 0 ≤ c ≤ t ≤ 2000", () => {
    let mismatches = 0;
    let pairs = 0;
    for (let t = 1; t <= 2000; t++) {
      const bt = BigInt(t);
      for (let c = 0; c <= t; c++) {
        pairs++;
        const expectedH = Number((BigInt(c) * 10000n) / bt);
        const { score } = computeQuizScore({ correctCount: c, totalCount: t, minPassScore: 0 });
        if (score !== expectedH / 100 || score < 0 || score > 100) mismatches++;
      }
    }
    assert.equal(pairs, 2003000);
    assert.equal(mismatches, 0);
  });

  it("pass uses integer comparison; agrees with truncated score for integer thresholds 0..100 (t ≤ 200)", () => {
    let disagreements = 0;
    for (let t = 1; t <= 200; t++) {
      for (let c = 0; c <= t; c++) {
        for (let m = 0; m <= 100; m++) {
          const r = computeQuizScore({ correctCount: c, totalCount: t, minPassScore: m });
          if (r.pass !== c * 100 >= m * t) disagreements++;
          if (r.pass !== r.score >= m) disagreements++;
        }
      }
    }
    assert.equal(disagreements, 0);
  });

  it("threshold below / equal / above", () => {
    assert.equal(computeQuizScore({ correctCount: 2, totalCount: 5, minPassScore: 60 }).pass, false); // 40
    assert.equal(computeQuizScore({ correctCount: 3, totalCount: 5, minPassScore: 60 }).pass, true); // 60 = 60
    assert.equal(computeQuizScore({ correctCount: 4, totalCount: 5, minPassScore: 60 }).pass, true); // 80
    assert.equal(computeQuizScore({ correctCount: 0, totalCount: 5, minPassScore: 0 }).pass, true); // 0 >= 0
  });

  it("decimal threshold 57.5 (Contract §8 corpus)", () => {
    assert.equal(computeQuizScore({ correctCount: 23, totalCount: 40, minPassScore: 57.5 }).pass, true);
    assert.equal(computeQuizScore({ correctCount: 22, totalCount: 40, minPassScore: 57.5 }).pass, false);
  });

  it("0/t → 0, not perfect", () => {
    const r = computeQuizScore({ correctCount: 0, totalCount: 7, minPassScore: 50 });
    assert.deepEqual(r, { score: 0, pass: false, perfect: false });
    assert.equal(formatScore(r.score), "0.00");
  });

  it("empty question set (totalCount = 0) never yields a result, so never perfect", () => {
    assert.throws(
      () => computeQuizScore({ correctCount: 0, totalCount: 0, minPassScore: 0 }),
      RangeError,
    );
  });

  it("precondition violations throw RangeError without echoing input", () => {
    const bad: Array<[number, number]> = [
      [-1, 10],
      [11, 10],
      [1.5, 10],
      [1, 10.5],
      [1, -10],
      [Number.NaN, 10],
      [1, Number.POSITIVE_INFINITY],
    ];
    for (const [c, t] of bad) {
      assert.throws(
        () => computeQuizScore({ correctCount: c, totalCount: t, minPassScore: 50 }),
        (err: unknown) =>
          err instanceof RangeError &&
          err.message === "computeQuizScore: precondition violated",
      );
    }
  });

  it("formatScore is display-only (values from h/100 for h = 0..10000 round-trip)", () => {
    for (let h = 0; h <= 10000; h++) {
      const s = h / 100;
      assert.equal(Number(formatScore(s)), s);
      assert.match(formatScore(s), /^\d{1,3}\.\d{2}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// B. Essay submission + essayTotal (P-21, D1, Addendum §21.21, Gap Closure §2.12)
// ---------------------------------------------------------------------------

describe("B. Essay submission and resolveEssayTotal", () => {
  const essay = (id: string): Q => ({ id, type: "Essay", correctAnswer: "" });

  it("all Essay answered → essayQuestionIds = all, essayTotal = all", () => {
    const quiz = [essay("e1"), essay("e2"), essay("e3")];
    const g = buildSubmissionGrading(quiz, { e1: "a", e2: "b", e3: "c" });
    assert.deepEqual(g.essayQuestionIds, ["e1", "e2", "e3"]);
    assert.equal(g.essayTotal, 3);
    assert.equal(g.autoTotal, 0);
  });

  it("some Essay unanswered (absent, blank, whitespace, non-string) are excluded from essayQuestionIds", () => {
    const quiz = [essay("e1"), essay("e2"), essay("e3"), essay("e4"), essay("e5")];
    const g = buildSubmissionGrading(quiz, { e1: "ตอบ", e2: "", e3: "  \n\t", e4: 42 });
    assert.deepEqual(g.essayQuestionIds, ["e1"]);
    assert.equal(g.essayTotal, 5);
    assert.deepEqual(g.answers, { e1: "ตอบ", e2: "", e3: "  \n\t", e4: "", e5: "" });
  });

  it("one unanswered Essay among ten Essay questions → essayTotal 10, 9 pending", () => {
    const quiz = Array.from({ length: 10 }, (_, i) => essay(`e${i + 1}`));
    const answers: Record<string, string> = {};
    quiz.forEach((q, i) => {
      if (i !== 4) answers[q.id] = `answer ${i + 1}`;
    });
    const g = buildSubmissionGrading(quiz, answers);
    assert.equal(g.essayTotal, 10);
    assert.equal(g.essayQuestionIds.length, 9);
    assert.equal(g.essayQuestionIds.includes("e5"), false);
  });

  it("Preflight §2.1 example: 10 questions, 2 Essay, 1 unanswered → 9/10 = 90.00, not 100", () => {
    const quiz: Q[] = [
      ...Array.from({ length: 8 }, (_, i): Q => ({
        id: `s${i + 1}`,
        type: "SingleChoice",
        correctAnswer: "A",
      })),
      essay("e1"),
      essay("e2"),
    ];
    const answers: Record<string, string> = { e1: "คำตอบ Essay" };
    for (let i = 1; i <= 8; i++) answers[`s${i}`] = "A";

    const g = buildSubmissionGrading(quiz, answers);
    assert.equal(g.autoCorrect, 8);
    assert.equal(g.autoTotal, 8);
    assert.deepEqual(g.essayQuestionIds, ["e1"]);
    assert.equal(g.essayTotal, 2);

    // Reviewer ให้ e1 ถูก → essayCorrect = 1
    const resolved = resolveEssayTotal({ essayTotal: g.essayTotal, essayQuestionIds: g.essayQuestionIds });
    assert.deepEqual(resolved, { known: true, essayTotal: 2 });
    const r = computeQuizScore({
      correctCount: g.autoCorrect + 1,
      totalCount: g.autoTotal + (resolved.known ? resolved.essayTotal : NaN),
      minPassScore: 80,
    });
    assert.deepEqual(r, { score: 90, pass: true, perfect: false });
    assert.equal(formatScore(r.score), "90.00");

    // สูตรเดิม total = autoTotal + essayQuestionIds.length → 9/9 = 100 (ผิด)
    assert.equal(Math.round((9 / (g.autoTotal + g.essayQuestionIds.length)) * 100), 100);
  });

  it("no Essay at all → essayTotal 0 (known 0, not unknown)", () => {
    const g = buildSubmissionGrading([{ id: "s1", type: "SingleChoice", correctAnswer: "A" }], { s1: "A" });
    assert.equal(g.essayTotal, 0);
    assert.deepEqual(resolveEssayTotal(g), { known: true, essayTotal: 0 });
  });

  it("resolveEssayTotal: essayTotal === essayQuestionIds.length → known", () => {
    assert.deepEqual(resolveEssayTotal({ essayTotal: 2, essayQuestionIds: ["a", "b"] }), {
      known: true,
      essayTotal: 2,
    });
  });

  it("resolveEssayTotal: essayTotal > essayQuestionIds.length → known", () => {
    assert.deepEqual(resolveEssayTotal({ essayTotal: 5, essayQuestionIds: ["a"] }), {
      known: true,
      essayTotal: 5,
    });
  });

  it("resolveEssayTotal: missing (undefined / absent / null) → Unknown MISSING, never essayQuestionIds.length", () => {
    assert.deepEqual(resolveEssayTotal({ essayTotal: undefined, essayQuestionIds: ["a", "b"] }), {
      known: false,
      reason: "MISSING",
    });
    assert.deepEqual(resolveEssayTotal({ essayQuestionIds: ["a", "b"] }), {
      known: false,
      reason: "MISSING",
    });
    assert.deepEqual(resolveEssayTotal({ essayTotal: null, essayQuestionIds: [] }), {
      known: false,
      reason: "MISSING",
    });
  });

  it("resolveEssayTotal: essayTotal < essayQuestionIds.length → Unknown INCONSISTENT (Addendum §2.6)", () => {
    assert.deepEqual(resolveEssayTotal({ essayTotal: 1, essayQuestionIds: ["a", "b"] }), {
      known: false,
      reason: "INCONSISTENT",
    });
    assert.deepEqual(resolveEssayTotal({ essayTotal: 0, essayQuestionIds: ["a"] }), {
      known: false,
      reason: "INCONSISTENT",
    });
  });

  it("resolveEssayTotal: negative, fractional and non-integer values → Unknown INVALID", () => {
    const invalid: unknown[] = [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2 ** 53,
      "3",
      true,
      {},
      [2],
    ];
    for (const value of invalid) {
      assert.deepEqual(
        resolveEssayTotal({ essayTotal: value, essayQuestionIds: [] }),
        { known: false, reason: "INVALID" },
        `essayTotal = ${String(value)}`,
      );
    }
  });

  it("resolveEssayTotal: essayQuestionIds not an array → Unknown INVALID", () => {
    const sub = { essayTotal: 2, essayQuestionIds: "ab" as unknown as string[] };
    assert.deepEqual(resolveEssayTotal(sub), { known: false, reason: "INVALID" });
  });
});

// ---------------------------------------------------------------------------
// C. answers shape (P-21, Contract §5.2)
// ---------------------------------------------------------------------------

describe("C. parseSubmittedAnswers", () => {
  it("plain object → ok, same object (no copy)", () => {
    const raw = { q1: "A", q2: "B" };
    const r = parseSubmittedAnswers(raw);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.answers, raw);
  });

  it("empty object {} → ok", () => {
    const r = parseSubmittedAnswers({});
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(Object.keys(r.answers), []);
  });

  for (const [label, value] of [
    ["array", []],
    ["array with content", ["A"]],
    ["empty string", ""],
    ["string", "A"],
    ["number 0", 0],
    ["number", 1],
    ["boolean false", false],
    ["boolean true", true],
  ] as Array<[string, unknown]>) {
    it(`${label} → INVALID_ANSWERS with no details`, () => {
      const r = parseSubmittedAnswers(value);
      assert.deepEqual(r, { ok: false, error: "INVALID_ANSWERS" });
      assert.deepEqual(Object.keys(r), ["ok", "error"]);
    });
  }

  it("null → no answers (Contract §5.2: absent/null = ไม่มีคำตอบ)", () => {
    const r = parseSubmittedAnswers(null);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(Object.keys(r.answers), []);
  });

  it("undefined / absent → no answers (Contract §5.2)", () => {
    const r = parseSubmittedAnswers(undefined);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(Object.keys(r.answers), []);
    const body: { answers?: unknown } = {};
    assert.equal(parseSubmittedAnswers(body.answers).ok, true);
  });

  it("each absent/null call returns a fresh empty object", () => {
    const a = parseSubmittedAnswers(null);
    const b = parseSubmittedAnswers(undefined);
    assert.ok(a.ok && b.ok);
    if (a.ok && b.ok) assert.notEqual(a.answers, b.answers);
  });

  it("own property __proto__ / constructor (from JSON) stay own and do not alter the prototype", () => {
    const raw = JSON.parse('{"__proto__":"ตอบ A","constructor":"ตอบ B"}');
    const r = parseSubmittedAnswers(raw);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(Object.hasOwn(r.answers, "__proto__"), true);
    assert.equal(Object.hasOwn(r.answers, "constructor"), true);
    assert.equal(Object.getPrototypeOf(r.answers), Object.prototype);
    assert.deepEqual(Object.keys(r.answers), ["__proto__", "constructor"]);

    // ส่งต่อเข้า buildSubmissionGrading แล้ว Key พิเศษยังเป็น Own property ของผลลัพธ์
    const quiz: Q[] = [
      { id: "__proto__", type: "Essay", correctAnswer: "" },
      { id: "constructor", type: "Essay", correctAnswer: "" },
    ];
    const g = buildSubmissionGrading(quiz, r.answers);
    assert.equal(Object.hasOwn(g.answers, "__proto__"), true);
    assert.equal(Object.hasOwn(g.answers, "constructor"), true);
    assert.equal(Object.getPrototypeOf(g.answers), Object.prototype);
    assert.equal(g.answers["__proto__"], "ตอบ A");
    assert.equal(g.answers["constructor"], "ตอบ B");
    assert.deepEqual(g.essayQuestionIds, ["__proto__", "constructor"]);
    assert.equal(g.essayTotal, 2);
    assert.equal(JSON.stringify(g.answers), '{"__proto__":"ตอบ A","constructor":"ตอบ B"}');
  });

  it("inherited properties are not read as answers (question id constructor / toString without own key)", () => {
    const quiz: Q[] = [
      { id: "constructor", type: "Essay", correctAnswer: "" },
      { id: "toString", type: "SingleChoice", correctAnswer: "A" },
      { id: "__proto__", type: "Essay", correctAnswer: "" },
    ];
    const g = buildSubmissionGrading(quiz, {});
    assert.deepEqual(g.essayQuestionIds, []);
    assert.equal(g.essayTotal, 2);
    assert.equal(g.autoCorrect, 0);
    assert.equal(g.answers["constructor"], "");
    assert.equal(g.answers["toString"], "");
    assert.equal(Object.hasOwn(g.answers, "__proto__"), true);
    assert.equal(g.answers["__proto__"], "");
    assert.equal(Object.getPrototypeOf(g.answers), Object.prototype);
  });
});

// ---------------------------------------------------------------------------
// D. Unanswered text (P-21, P-23) — ตาม String.prototype.trim จริง
// ---------------------------------------------------------------------------

describe("D. isUnansweredText", () => {
  const cases: Array<[string, unknown, boolean]> = [
    ["empty string", "", true],
    ["ordinary spaces", "   ", true],
    ["tab / newline / CRLF", "\t\n\r\n", true],
    ["NBSP U+00A0", "  ", true],
    ["BOM U+FEFF", "﻿", true],
    ["ZWSP U+200B (not removed by trim)", "​", false],
    ["text", "a", false],
    ["text with surrounding whitespace", "  a \n", false],
    ["undefined", undefined, true],
    ["null", null, true],
    ["number", 0, true],
  ];
  for (const [label, value, expected] of cases) {
    it(`${label} → ${expected ? "unanswered" : "answered"}`, () => {
      assert.equal(isUnansweredText(value), expected);
    });
  }

  it("matches actual JavaScript trim() for each whitespace character", () => {
    assert.equal(" ".trim(), "");
    assert.equal("\t".trim(), "");
    assert.equal("\n".trim(), "");
    assert.equal(" ".trim(), "");
    assert.equal("﻿".trim(), "");
    assert.equal("​".trim(), "​");
  });

  it("Essay with only U+200B counts as answered (enters essayQuestionIds)", () => {
    const g = buildSubmissionGrading([{ id: "e1", type: "Essay", correctAnswer: "" }], { e1: "​" });
    assert.deepEqual(g.essayQuestionIds, ["e1"]);
  });

  it("unanswered is decided after truncation: 5000 spaces + text → unanswered", () => {
    const value = " ".repeat(5000) + "ข้อความ";
    assert.equal(truncateAnswer(value), " ".repeat(5000));
    const g = buildSubmissionGrading([{ id: "e1", type: "Essay", correctAnswer: "" }], { e1: value });
    assert.deepEqual(g.essayQuestionIds, []);
    assert.equal(g.essayTotal, 1);
  });

  it("truncation at 5000 UTF-16 code units (4999 / 5000 / 5001)", () => {
    assert.equal(ANSWER_MAX_LENGTH, 5000);
    assert.equal(truncateAnswer("a".repeat(4999)).length, 4999);
    assert.equal(truncateAnswer("a".repeat(5000)).length, 5000);
    assert.equal(truncateAnswer("a".repeat(5001)).length, 5000);
    // 4999 + emoji → ตัดกลาง Surrogate pair (พฤติกรรมเดิมของ .slice, Contract §6.3)
    const cut = truncateAnswer("a".repeat(4999) + "😀");
    assert.equal(cut.length, 5000);
    assert.equal(cut.charCodeAt(4999), 0xd83d);
  });
});

// ---------------------------------------------------------------------------
// E. Objective grading — คงพฤติกรรมเดิม (P-24); ไม่รวม TD-20 / Q2
// ---------------------------------------------------------------------------

describe("E. Objective grading (existing behavior)", () => {
  const single: Q = { id: "s", type: "SingleChoice", correctAnswer: "B" };
  const tf: Q = { id: "t", type: "TrueFalse", correctAnswer: TF_TRUE };
  const matching: Q = {
    id: "m",
    type: "Matching",
    correctAnswer: JSON.stringify({ L1: "R1", L2: "R2" }),
  };

  it("SingleChoice: correct / wrong / out-of-options / empty", () => {
    assert.equal(isObjectiveCorrect(single, "B"), true);
    assert.equal(isObjectiveCorrect(single, "A"), false);
    assert.equal(isObjectiveCorrect(single, "Z ไม่มีในตัวเลือก"), false);
    assert.equal(isObjectiveCorrect(single, ""), false);
    assert.equal(isObjectiveCorrect(single, undefined), false);
  });

  it("missing type defaults to SingleChoice", () => {
    const q = { id: "x", correctAnswer: "A" } as unknown as Q;
    assert.equal(isObjectiveCorrect(q, "A"), true);
    const g = buildSubmissionGrading([q], { x: "A" });
    assert.equal(g.autoTotal, 1);
    assert.equal(g.autoCorrect, 1);
    assert.equal(g.essayTotal, 0);
  });

  it("TrueFalse: exact constant correct, other constant wrong, empty wrong", () => {
    assert.equal(isObjectiveCorrect(tf, TF_TRUE), true);
    assert.equal(isObjectiveCorrect(tf, TF_FALSE), false);
    assert.equal(isObjectiveCorrect(tf, ""), false);
  });

  it("Matching: all keys correct, missing key wrong, extra key ignored", () => {
    assert.equal(isObjectiveCorrect(matching, JSON.stringify({ L1: "R1", L2: "R2" })), true);
    assert.equal(isObjectiveCorrect(matching, JSON.stringify({ L1: "R1" })), false);
    assert.equal(isObjectiveCorrect(matching, JSON.stringify({ L1: "R1", L2: "R2", L3: "R3" })), true);
    assert.equal(isObjectiveCorrect(matching, JSON.stringify({ L1: "R2", L2: "R1" })), false);
  });

  it("Matching: malformed / truncated JSON → wrong (not an error)", () => {
    assert.equal(isObjectiveCorrect(matching, "{not json"), false);
    assert.equal(isObjectiveCorrect(matching, '{"L1":"R1","L2":"R'), false);
  });

  it("Matching: empty correctAnswer map → never correct", () => {
    const q: Q = { id: "m0", type: "Matching", correctAnswer: "" };
    assert.equal(isObjectiveCorrect(q, "{}"), false);
  });

  it("unanswered objective questions score 0 and still count in autoTotal; unknown answer ids are ignored", () => {
    const quiz: Q[] = [single, tf, matching];
    const g = buildSubmissionGrading(quiz, { s: "B", unknownId: "x" });
    assert.equal(g.autoTotal, 3);
    assert.equal(g.autoCorrect, 1);
    assert.deepEqual(Object.keys(g.answers), ["s", "t", "m"]);
    assert.deepEqual(g.answers, { s: "B", t: "", m: "" });
  });

  it("non-string answer values become \"\" (wrong)", () => {
    const g = buildSubmissionGrading([single, tf], { s: ["B"], t: true });
    assert.equal(g.autoCorrect, 0);
    assert.deepEqual(g.answers, { s: "", t: "" });
  });

  it("mixed quiz counts objective and Essay separately", () => {
    const quiz: Q[] = [single, tf, matching, { id: "e1", type: "Essay", correctAnswer: "" }];
    const g = buildSubmissionGrading(quiz, {
      s: "B",
      t: TF_TRUE,
      m: JSON.stringify({ L1: "R1", L2: "R2" }),
      e1: "essay",
    });
    assert.deepEqual(
      { autoCorrect: g.autoCorrect, autoTotal: g.autoTotal, essayTotal: g.essayTotal, essayQuestionIds: g.essayQuestionIds },
      { autoCorrect: 3, autoTotal: 3, essayTotal: 1, essayQuestionIds: ["e1"] },
    );
  });
});

// ---------------------------------------------------------------------------
// F. Non-mutation
// ---------------------------------------------------------------------------

describe("F. Non-mutation", () => {
  it("buildSubmissionGrading does not mutate frozen quiz or answers and returns a new answers object", () => {
    const quiz = deepFreeze<Q[]>([
      { id: "s", type: "SingleChoice", correctAnswer: "A" },
      { id: "e1", type: "Essay", correctAnswer: "" },
      { id: "e2", type: "Essay", correctAnswer: "" },
    ]);
    const answers = deepFreeze({ s: "A", e1: "x".repeat(6000), e2: " " });
    const snapshot = JSON.stringify({ quiz, answers });
    const g = buildSubmissionGrading(quiz, answers);
    assert.equal(JSON.stringify({ quiz, answers }), snapshot);
    assert.notEqual(g.answers, answers);
    assert.equal(g.answers.e1.length, 5000);
    assert.equal(answers.e1.length, 6000);
  });

  it("resolveEssayTotal does not mutate a frozen submission", () => {
    const sub = deepFreeze({ essayTotal: 3, essayQuestionIds: ["a", "b"], status: "PendingReview" });
    assert.deepEqual(resolveEssayTotal(sub), { known: true, essayTotal: 3 });
    assert.deepEqual(sub, { essayTotal: 3, essayQuestionIds: ["a", "b"], status: "PendingReview" });
  });

  it("parseSubmittedAnswers does not mutate a frozen input", () => {
    const raw = deepFreeze({ q1: "A" });
    const r = parseSubmittedAnswers(raw);
    assert.equal(r.ok, true);
    assert.deepEqual(raw, { q1: "A" });
  });

  it("computeQuizScore does not mutate its frozen input", () => {
    const input = Object.freeze({ correctCount: 3, totalCount: 4, minPassScore: 70 });
    assert.deepEqual(computeQuizScore(input), { score: 75, pass: true, perfect: false });
    assert.deepEqual(input, { correctCount: 3, totalCount: 4, minPassScore: 70 });
  });
});
