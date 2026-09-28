import { Course, UserCourseProgress } from "../types";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Competency Matrix mapping: ตำแหน่งงาน -> รหัสคอร์สบังคับ
 * ใช้ร่วมกันระหว่าง Dashboard.tsx และ MemberManagement.tsx
 * เพื่อไม่ให้ logic ซ้ำและไม่ sync กันเวลาแก้ไข
 *
 * TODO: เมื่อมีระบบ Course Catalog ที่ยืดหยุ่นกว่านี้ (เช่น field
 * requiredForPositions ในตัว Course object เอง) ควรย้าย mapping นี้ไปผูกกับ
 * ตัวคอร์สโดยตรงแทนการ hardcode รหัส c-1/c-2/c-3 ไว้ตรงนี้
 */

// TODO: ยังไม่มี mapping ตำแหน่ง → คอร์สบังคับจริง (คอร์ส c-1/c-2/c-3 เดิมไม่มีอยู่แล้ว)
// คืน [] ไปก่อนเพื่อไม่ให้รายงานแสดงหลักสูตรบังคับปลอม
// ทางออกระยะยาว: เพิ่ม field requiredForPositions ใน Course แล้วกรองจากคอร์สจริง
export const getRequiredCoursesForPosition = (_position?: string): string[] => {
  return [];
};

export const formatDuration = (minutes?: number): string => {
  if (!minutes || minutes <= 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ชั่วโมง ${m} นาที`;
  if (h) return `${h} ชั่วโมง`;
  return `${m} นาที`;
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
  const done = new Set<string>();
  progress.forEach((p) => {
    if (p.userId === userId && p.status === "Completed") done.add(p.courseId);
  });
  exams.forEach((e) => {
    if (e.employeeId === employeeId && e.pass) done.add(e.courseId);
  });
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
