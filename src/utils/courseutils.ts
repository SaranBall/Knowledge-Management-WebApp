import { Course, UserCourseProgress } from "../types";
import { getDepartmentById } from "./departmentUtils";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ผู้ใช้อยู่ในแผนกเป้าหมายหรือไม่ — แผนกตรงกัน หรือผู้ใช้อยู่แผนกย่อยของแผนกเป้าหมาย (หลัก → ย่อย)
 * แผนกเป้าหมายที่เป็นแผนกย่อยไม่นับผู้ใช้ในแผนกหลัก (ย่อย → หลัก ไม่นับ) และไม่นับแผนกพี่น้อง
 */
const isUserInTargetDepartment = (
  userDepartmentId: string | undefined,
  targetDepartmentId: string,
): boolean => {
  if (!userDepartmentId) return false;
  if (userDepartmentId === targetDepartmentId) return true;
  const userDept = getDepartmentById(userDepartmentId);
  return !!userDept && userDept.parentId === targetDepartmentId;
};

/**
 * §21.24 G-8.1 / Q-3 (ก): หลักสูตรบังคับของผู้ใช้ (แทน getRequiredCoursesForPosition ที่ผูกตำแหน่ง)
 * = หลักสูตรที่ isMandatory และ Approved (isApproved === true) และ
 *   (ไม่ได้เลือกแผนกเป้าหมาย = ทุกแผนก หรือ ผู้ใช้อยู่ในแผนกเป้าหมาย/แผนกย่อยของแผนกเป้าหมาย)
 * คงลำดับตามรายการหลักสูตรที่ส่งเข้ามา
 */
export const getRequiredCoursesForUser = (
  user: { departmentId?: string } | null | undefined,
  courses: readonly Course[],
): Course[] => {
  if (!user || !Array.isArray(courses)) return [];
  return courses.filter((c) => {
    if (!c || c.isMandatory !== true || c.isApproved !== true) return false;
    const targets = Array.isArray(c.targetDepartmentIds) ? c.targetDepartmentIds : [];
    if (targets.length === 0) return true;
    return targets.some((t) => isUserInTargetDepartment(user.departmentId, t));
  });
};

export const formatDuration = (minutes?: number): string => {
  if (!minutes || minutes <= 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ชั่วโมง ${m} นาที`;
  if (h) return `${h} ชั่วโมง`;
  return `${m} นาที`;
};

// Single source of truth: รหัสคอร์สที่พนักงานคนนี้ "เรียนจบจริง" แบบไม่ซ้ำ
// (progress = Completed หรือมีผลสอบผ่าน) — server เขียนทั้งสองที่ทุกครั้งที่สอบผ่าน
// ห้ามนับ progress + exam บวกกันตรงๆ ให้รวมเป็น Set ตาม courseId เสมอ
export const getUserCompletedCourseIds = (
  userId: string,
  employeeId: string,
  progress: UserCourseProgress[],
  exams: any[],
): Set<string> => {
  const done = new Set<string>();
  progress.forEach((p) => {
    if (p.userId === userId && p.status === "Completed") done.add(p.courseId);
  });
  exams.forEach((e) => {
    if (e.employeeId === employeeId && e.pass) done.add(e.courseId);
  });
  return done;
};

// รวมนาทีจากคอร์สที่พนักงานเรียนจบจริง (progress หรือสอบผ่าน ไม่นับซ้ำ)
// คืน null ถ้าไม่มีคอร์สไหนที่จบแล้วระบุเวลาไว้ เพื่อให้แสดง "-" ไม่ใช่ 0
export const getUserTrainingMinutes = (
  userId: string,
  employeeId: string,
  courses: Course[],
  progress: UserCourseProgress[],
  exams: any[],
): number | null => {
  const done = getUserCompletedCourseIds(userId, employeeId, progress, exams);
  let total = 0;
  let known = false;
  done.forEach((id) => {
    const c = courses.find((x) => x.id === id);
    if (c?.durationMinutes) {
      total += c.durationMinutes;
      known = true;
    }
  });
  return known ? total : null;
};

export const formatHours = (minutes: number | null): string =>
  minutes === null ? "-" : `${(minutes / 60).toFixed(1)} ชม.`;
