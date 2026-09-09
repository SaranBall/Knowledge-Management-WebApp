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
export const getRequiredCoursesForPosition = (position?: string): string[] => {
  if (!position) return ["c-1"];
  if (position.includes("QA") || position.includes("QC")) {
    return ["c-2", "c-3"]; // Chemistry Inspections & Forklift
  }
  if (position.includes("Production") || position.includes("Engineer")) {
    return ["c-3"]; // Forklift
  }
  if (position.includes("Warehouse")) {
    return ["c-1", "c-3"]; // Onboarding Warehouse & Forklift
  }
  return ["c-1"];
};
