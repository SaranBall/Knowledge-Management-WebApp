/**
 * PERSIST-01C-0 — API Regression harness (ตัวเทียบ)
 *
 * ใช้: npx tsx scripts/api-regression/compare.ts [--ignore-date-dependent] <รอบ A> <รอบ B>
 *
 * เทียบไฟล์ผลทีละ Request (จับคู่ด้วยชื่อไฟล์ = ลำดับ + ชื่อสถานการณ์)
 * แสดงเฉพาะจุดที่ต่าง — ไม่สนลำดับ Key ใน Object แต่สนลำดับสมาชิกใน Array
 * --ignore-date-dependent: ข้ามช่องที่ค่าขึ้นกับวันที่รัน (ดู DATE_DEPENDENT_RULES) ตอนเทียบเท่านั้น
 *   ไม่แก้ไฟล์ผลใด ๆ และแสดงจำนวนจุดที่ข้ามแยกตามกฎ
 * Exit code: 0 = ไม่ต่าง, 1 = ต่าง, 2 = ใช้งานผิด
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = path.join(HERE, "out");
const MAX_DIFFS_PER_FILE = 20;
const MAX_VALUE_CHARS = 200;

// ช่องที่ค่าขึ้นกับวันที่รัน (ใช้เมื่อสั่ง --ignore-date-dependent เท่านั้น)
// path ในรูป $.responseBody... ตามที่ diff() สร้าง; route ว่าง = ทุก Route
const DATE_DEPENDENT_RULES: Array<{ label: string; route?: string; at: RegExp }> = [
  {
    label: "daysRemaining ของใบรับรอง (ทุก Route)",
    at: /\.daysRemaining$/,
  },
  {
    label: "GET /api/learning/stats: certificates.valid / expiringSoon / expired (นับจากวันหมดอายุเทียบวันนี้)",
    route: "GET /api/learning/stats",
    at: /^\$\.responseBody\.certificates\.(valid|expiringSoon|expired)$/,
  },
];

const KNOWN_FLAGS = new Set(["--ignore-date-dependent"]);
const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("--"));
const positional = argv.filter((a) => !a.startsWith("--"));
const unknownFlags = flags.filter((f) => !KNOWN_FLAGS.has(f));
const ignoreDateDependent = flags.includes("--ignore-date-dependent");
const [nameA, nameB] = positional;
if (!nameA || !nameB || positional.length !== 2 || unknownFlags.length > 0) {
  console.error("ใช้: npx tsx scripts/api-regression/compare.ts [--ignore-date-dependent] <รอบ A> <รอบ B>");
  process.exit(2);
}
const skippedByRule = new Map<string, number>();
const dirA = path.join(OUT_ROOT, nameA);
const dirB = path.join(OUT_ROOT, nameB);
for (const d of [dirA, dirB]) {
  if (!fs.existsSync(d)) {
    console.error(`ไม่พบโฟลเดอร์ผล: ${path.relative(process.cwd(), d)}`);
    process.exit(2);
  }
}

const listRecords = (dir: string) =>
  fs.readdirSync(dir).filter((f) => /^\d{3}_.*\.json$/.test(f)).sort();

const filesA = listRecords(dirA);
const filesB = listRecords(dirB);
const setA = new Set(filesA);
const setB = new Set(filesB);

interface Diff {
  at: string;
  a: unknown;
  b: unknown;
}

const MISSING = Symbol("missing");

function show(v: unknown): string {
  if (v === MISSING) return "(ไม่มี)";
  const s = JSON.stringify(v) ?? String(v);
  return s.length > MAX_VALUE_CHARS ? `${s.slice(0, MAX_VALUE_CHARS)}…` : s;
}

function diff(a: unknown, b: unknown, at: string, out: Diff[]) {
  if (Object.is(a, b)) return;
  const bothArrays = Array.isArray(a) && Array.isArray(b);
  const bothObjects =
    a !== null && b !== null && typeof a === "object" && typeof b === "object" &&
    !Array.isArray(a) && !Array.isArray(b);
  if (bothArrays) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) out.push({ at: `${at}.length`, a: aa.length, b: bb.length });
    const n = Math.max(aa.length, bb.length);
    for (let i = 0; i < n; i++) {
      diff(i < aa.length ? aa[i] : MISSING, i < bb.length ? bb[i] : MISSING, `${at}[${i}]`, out);
    }
    return;
  }
  if (bothObjects) {
    const oa = a as Record<string, unknown>;
    const ob = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(oa), ...Object.keys(ob)]);
    for (const k of [...keys].sort()) {
      diff(k in oa ? oa[k] : MISSING, k in ob ? ob[k] : MISSING, `${at}.${k}`, out);
    }
    return;
  }
  out.push({ at, a, b });
}

// ตัด BOM ต้นไฟล์ (ไฟล์ที่ถูกแก้ด้วยเครื่องมือบน Windows)
const readRecord = (file: string) =>
  JSON.parse(fs.readFileSync(file, "utf-8").replace(/^﻿/, ""));

let differingFiles = 0;
let totalDiffs = 0;

for (const f of filesA) {
  if (!setB.has(f)) {
    console.log(`\n[${f}] มีเฉพาะใน ${nameA}`);
    differingFiles++;
  }
}
for (const f of filesB) {
  if (!setA.has(f)) {
    console.log(`\n[${f}] มีเฉพาะใน ${nameB}`);
    differingFiles++;
  }
}

for (const f of filesA) {
  if (!setB.has(f)) continue;
  const ra = readRecord(path.join(dirA, f));
  const rb = readRecord(path.join(dirB, f));
  const allDiffs: Diff[] = [];
  diff(ra, rb, "$", allDiffs);
  const diffs = allDiffs.filter((d) => {
    if (!ignoreDateDependent) return true;
    const rule = DATE_DEPENDENT_RULES.find(
      (r) => (!r.route || r.route === ra.route) && r.at.test(d.at),
    );
    if (!rule) return true;
    skippedByRule.set(rule.label, (skippedByRule.get(rule.label) || 0) + 1);
    return false;
  });
  if (diffs.length === 0) continue;
  differingFiles++;
  totalDiffs += diffs.length;
  console.log(`\n[${f}] ${ra.route ?? ""} (${ra.actor ?? ""}) — ต่าง ${diffs.length} จุด`);
  for (const d of diffs.slice(0, MAX_DIFFS_PER_FILE)) {
    console.log(`  ${d.at}\n    ${nameA}: ${show(d.a)}\n    ${nameB}: ${show(d.b)}`);
  }
  if (diffs.length > MAX_DIFFS_PER_FILE) {
    console.log(`  … และอีก ${diffs.length - MAX_DIFFS_PER_FILE} จุด`);
  }
}

if (ignoreDateDependent) {
  console.log("\n--ignore-date-dependent: ข้ามช่องต่อไปนี้ (จำนวนจุดที่ต่างแล้วถูกข้าม)");
  for (const r of DATE_DEPENDENT_RULES) {
    console.log(`  - ${r.label}: ${skippedByRule.get(r.label) || 0}`);
  }
}
console.log(
  `\nเทียบ ${nameA} (${filesA.length} ไฟล์) กับ ${nameB} (${filesB.length} ไฟล์): ` +
    (differingFiles === 0 ? "ไม่ต่างกัน" : `ต่าง ${differingFiles} ไฟล์ / ${totalDiffs} จุด`),
);
process.exit(differingFiles === 0 ? 0 : 1);
