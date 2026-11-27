/**
 * PERSIST-01C-5 (Q2-S) — ช่องแผนกเป้าหมาย / หลักสูตรบังคับ / ใบรับรอง ของฟอร์มสร้างและแก้ไขหลักสูตร
 * แทนตัวเลือกตำแหน่ง Mockup (targetPositions ยกเลิกตาม §21.24 G-12)
 * - เลือกแผนกจากรายการแผนกจริง (getAllDepartmentsFlat) ได้หลายแผนก · ไม่เลือก = ทุกแผนก (Q-3)
 * - แผนกหลักที่เลือกนับรวมแผนกย่อย (หลัก → ย่อย)
 */
import React from "react";
import { getAllDepartmentsFlat, getDepartmentById } from "../utils/departmentUtils";

export interface CourseTargetValue {
  targetDepartmentIds: string[];
  isMandatory: boolean;
  issuesCertificate: boolean;
  /** ข้อความในช่องกรอก — "" = ไม่หมดอายุ */
  certificateValidityMonths: string;
}

/** ข้อความแสดงแผนกเป้าหมาย: [] = "ทุกแผนก" */
export function describeTargetDepartments(ids: unknown): string {
  const list = Array.isArray(ids) ? ids.filter((d): d is string => typeof d === "string") : [];
  if (list.length === 0) return "ทุกแผนก";
  return list.map((id) => getDepartmentById(id)?.name || id).join(", ");
}

/**
 * แปลงค่าในฟอร์มเป็นค่าที่ส่งให้ Server
 * - ไม่ออกใบรับรอง หรือเว้นว่าง → certificateValidityMonths: null (ไม่หมดอายุ)
 * - ค่าที่ไม่ใช่จำนวนเต็ม ≥ 1 → error (ข้อความสำหรับ alert)
 */
export function toCourseTargetPayload(
  v: CourseTargetValue,
):
  | {
      ok: true;
      value: {
        targetDepartmentIds: string[];
        isMandatory: boolean;
        issuesCertificate: boolean;
        certificateValidityMonths: number | null;
      };
    }
  | { ok: false; message: string } {
  let months: number | null = null;
  const raw = v.certificateValidityMonths.trim();
  if (v.issuesCertificate && raw !== "") {
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < 1) {
      return {
        ok: false,
        message: "⚠️ อายุใบรับรองต้องเป็นจำนวนเต็มตั้งแต่ 1 เดือนขึ้นไป หรือเว้นว่างเมื่อไม่หมดอายุ",
      };
    }
    months = n;
  }
  return {
    ok: true,
    value: {
      targetDepartmentIds: [...v.targetDepartmentIds],
      isMandatory: v.isMandatory,
      issuesCertificate: v.issuesCertificate,
      certificateValidityMonths: months,
    },
  };
}

/** ค่าเริ่มต้นของฟอร์มจากหลักสูตรที่มีอยู่ (ค่าที่ขาด/ผิดชนิด → ค่าเริ่มต้นของ Schema) */
export function courseTargetValueOf(course: unknown): CourseTargetValue {
  const c = (course && typeof course === "object" ? course : {}) as Record<string, unknown>;
  const months = c.certificateValidityMonths;
  return {
    targetDepartmentIds: Array.isArray(c.targetDepartmentIds)
      ? c.targetDepartmentIds.filter((d): d is string => typeof d === "string")
      : [],
    isMandatory: c.isMandatory === true,
    issuesCertificate: c.issuesCertificate !== false,
    certificateValidityMonths: typeof months === "number" ? String(months) : "",
  };
}

export const EMPTY_COURSE_TARGET: CourseTargetValue = {
  targetDepartmentIds: [],
  isMandatory: false,
  issuesCertificate: true,
  certificateValidityMonths: "",
};

export function CourseTargetFields({
  value,
  onChange,
  idPrefix,
}: {
  value: CourseTargetValue;
  onChange: (next: CourseTargetValue) => void;
  idPrefix: string;
}) {
  const departments = getAllDepartmentsFlat();
  const toggleDept = (id: string) => {
    const has = value.targetDepartmentIds.includes(id);
    onChange({
      ...value,
      targetDepartmentIds: has
        ? value.targetDepartmentIds.filter((d) => d !== id)
        : [...value.targetDepartmentIds, id],
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="font-bold text-slate-700 block">
          แผนกเป้าหมาย (เลือกได้หลายแผนก · ไม่เลือก = ทุกแผนก · แผนกหลักรวมแผนกย่อย):
        </label>
        <div className="text-[10.5px] text-slate-500">
          ใช้กับ:{" "}
          <span className="font-bold text-indigo-700">
            {describeTargetDepartments(value.targetDepartmentIds)}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-150 max-h-48 overflow-y-auto">
          {departments.map((d) => (
            <label
              key={d.id}
              className="flex items-center gap-2 cursor-pointer hover:text-indigo-700 select-none text-[11px]"
            >
              <input
                id={`${idPrefix}-dept-${d.id}`}
                type="checkbox"
                checked={value.targetDepartmentIds.includes(d.id)}
                onChange={() => toggleDept(d.id)}
                className="rounded text-indigo-650 focus:ring-indigo-500 w-3.5 h-3.5"
              />
              {d.parentId ? `↳ ${d.name}` : d.name}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11px]">
        <label className="flex items-center gap-2 cursor-pointer select-none font-semibold text-slate-700">
          <input
            id={`${idPrefix}-mandatory`}
            type="checkbox"
            checked={value.isMandatory}
            onChange={(e) => onChange({ ...value, isMandatory: e.target.checked })}
            className="rounded w-3.5 h-3.5"
          />
          หลักสูตรบังคับ
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none font-semibold text-slate-700">
          <input
            id={`${idPrefix}-issues-certificate`}
            type="checkbox"
            checked={value.issuesCertificate}
            onChange={(e) => onChange({ ...value, issuesCertificate: e.target.checked })}
            className="rounded w-3.5 h-3.5"
          />
          ออกใบรับรอง
        </label>
      </div>

      {value.issuesCertificate && (
        <div className="space-y-1">
          <label className="font-semibold text-slate-600 block">
            อายุใบรับรอง (เดือน — เว้นว่าง = ไม่หมดอายุ):
          </label>
          <input
            id={`${idPrefix}-certificate-months`}
            type="number"
            min={1}
            step={1}
            value={value.certificateValidityMonths}
            onChange={(e) => onChange({ ...value, certificateValidityMonths: e.target.value })}
            placeholder="เช่น 12"
            className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs font-mono"
          />
        </div>
      )}
    </div>
  );
}
