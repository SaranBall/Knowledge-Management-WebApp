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
