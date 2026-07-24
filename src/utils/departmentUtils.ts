/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// โครงสร้างนี้จำลองหน้าตาตาราง `departments` ใน DB ล่วงหน้า
// ตอนย้ายไป Postgres จริง แค่ INSERT ตาม array นี้ตรงๆ ไม่ต้องออกแบบใหม่
export interface Department {
  id: string; // จะกลายเป็น PK ตอนย้าย DB
  parentId: string | null; // NULL = main department, มีค่า = sub-department (สังกัดใต้แผนกผลิต)
  name: string; // ชื่อแสดงผล
  code: string; // รหัสสั้นจากระบบ HR จริงของบริษัท ใช้เทียบ logic แทน string match
}

export const DEPARTMENTS_FLAT: Department[] = [
  // ── Main Departments (14) ──
  { id: "d-hr", parentId: null, name: "Human Resources", code: "HR" },
  { id: "d-cs", parentId: null, name: "Customer Service", code: "CS" },
  { id: "d-af", parentId: null, name: "Accounting & Finance", code: "AF" },
  { id: "d-pm", parentId: null, name: "Procurement", code: "PM" },
  { id: "d-qs", parentId: null, name: "Quality & Safety Systems", code: "QS" },
  {
    id: "d-fc",
    parentId: null,
    name: "Production Management Office",
    code: "FC",
  },
  {
    id: "d-qa",
    parentId: null,
    name: "Insurance & Quality Control",
    code: "QA",
  },
  { id: "d-wh", parentId: null, name: "Warehouse", code: "WH" },
  { id: "d-en", parentId: null, name: "Engineering", code: "EN" },
  { id: "d-sm", parentId: null, name: "Sales & Marketing", code: "SM" },
  { id: "d-tc", parentId: null, name: "Technical", code: "TC" },
  {
    id: "d-pc",
    parentId: null,
    name: "Planning & Production Control",
    code: "PC",
  },
  { id: "d-pd", parentId: null, name: "Production", code: "PD" },
  { id: "d-it", parentId: null, name: "Information Technology", code: "IT" },

  // ── Sub-departments ใต้ PD (ฝ่ายผลิต) — สังกัดสายบังคับบัญชาเดียวกัน ──
  {
    id: "d-pd-dl",
    parentId: "d-pd",
    name: "Dry-Lamination (งานประกบฟิล์ม)",
    code: "DL",
  },
  {
    id: "d-pd-bm",
    parentId: "d-pd",
    name: "Bag-Making (งานขึ้นรูปถุง)",
    code: "BM",
  },
  {
    id: "d-pd-sl",
    parentId: "d-pd",
    name: "Slitting (งานตัดม้วน)",
    code: "SL",
  },
  { id: "d-pd-pt", parentId: "d-pd", name: "Printing (งานพิมพ์)", code: "PT" },
  {
    id: "d-pd-in",
    parentId: "d-pd",
    name: "Inspection (งานตรวจสอบ)",
    code: "IN",
  },
  {
    id: "d-pd-sp",
    parentId: "d-pd",
    name: "Powder Spray (งานพ่นฝุ่น)",
    code: "PS",
  },
];

// ─────────────────────────────────────────
// Positions — เก็บแยกจาก department name ตามที่ควรเป็น (ไม่ฝัง code ในชื่อ)
// key = department id, value = รายชื่อตำแหน่งในแผนกนั้น
// ─────────────────────────────────────────
export const POSITIONS_BY_DEPARTMENT: Record<string, string[]> = {
  "d-hr": [
    "ผู้จัดการฝ่ายทรัพยากรมนุษย์",
    "หัวหน้าแผนกทรัพยากรมนุษย์",
    "เจ้าหน้าที่สรรหา",
    "เจ้าหน้าที่เงินเดือน",
    "เจ้าหน้าที่ธุรการ",
    "เจ้าหน้าที่พัฒนาบุคลากร",
    "เจ้าหน้าที่แรงงานสัมพันธ์",
    "พนักงานขับรถ",
    "พ่อบ้านแม่บ้าน",
    "ยามรักษาการณ์ภายใน",
    "เลขานุการ",
    "หัวหน้าหน่วยยานยนต์",
    "ผู้ช่วยหัวหน้าแผนกธุรการ",
  ],
  "d-cs": ["Customer Service"],
  "d-af": [
    "ผู้อำนวยการฝ่ายบัญชีการเงิน",
    "ผู้จัดการฝ่ายบัญชี",
    "หัวหน้าแผนกบัญชี",
    "พนักงานการเงิน",
    "Messenger",
    "พนักงานบัญชี-เจ้าหนี้",
    "พนักงานบัญชี-ลูกหนี้",
    "พนักงานบัญชี-ต้นทุนการผลิต",
  ],
  "d-pm": [
    "ผู้จัดการฝ่ายจัดซื้อ",
    "หัวหน้าแผนกจัดซื้อ",
    "ผู้ช่วยหัวหน้าแผนกจัดซื้อ",
    "เจ้าหน้าที่จัดซื้อ",
  ],
  "d-qs": [
    "ตัวแทนฝ่ายบริหารคุณภาพ",
    "เจ้าหน้าที่คุมเอกสาร",
    "เจ้าหน้าที่ความปลอดภัยวิชาชีพ",
  ],
  "d-fc": [
    "COO", // คงไว้ตามที่ยืนยัน — ตำแหน่งผู้อำนวยการฝ่ายผลิต
  ],
  "d-qa": [
    "ผู้ช่วย/ผู้จัดการฝ่ายประกันและควบคุมคุณภาพ", // คงรูปแบบเดิมตามที่ยืนยัน (ตำแหน่งเดียว เรียกได้ 2 ชื่อ)
    "หัวหน้าแผนกประกันและควบคุมคุณภาพ",
    "เจ้าหน้าที่ประกันคุณภาพ",
    "พนักงานควบคุมและประกันคุณภาพ",
  ],
  "d-wh": [
    "หัวหน้าแผนกคลังสินค้า",
    "เจ้าหน้าที่คลังสินค้า",
    "พนักงานคลังสินค้า",
  ],
  "d-en": ["Engineer", "Electrical Technician", "Mechanical Technician"],
  "d-sm": ["Sales Executive", "Sales", "Sales Admin Supervisor"],
  "d-tc": ["ผู้ช่วยผู้จัดการฝ่ายเทคนิค", "เจ้าหน้าที่เทคนิค"],
  "d-pc": [
    "ผู้จัดการฝ่ายวางแผนและควบคุมการผลิต",
    "ผู้ช่วยหัวหน้าแผนกวางแผนและควบคุมการผลิต",
    "เจ้าหน้าที่วางแผนและควบคุมการผลิต-Document",
    "เจ้าหน้าที่วางแผนและควบคุมการผลิต-Cylinder",
    "เจ้าหน้าที่วางแผนและควบคุมการผลิต-Process Control",
  ],
  "d-pd": [
    "ผู้จัดการฝ่ายผลิต",
    "ผู้ช่วยผู้จัดการฝ่ายผลิต",
    "Translator",
    "เจ้าหน้าที่ Document",
    "เจ้าหน้าที่ Support",
    "วิศวกรฝ่ายผลิต",
  ],
  "d-pd-dl": ["หัวหน้าทีม", "ช่าง", "พนักงาน"],
  "d-pd-bm": [
    "หัวหน้าทีม",
    "รองหัวหน้าทีม",
    "พนักงานตัดมุม",
    "พนักงานควบคุมเครื่อง",
    "พนักงานคัดซอง",
    "พนักงาน QC Line",
  ],
  "d-pd-sl": ["ช่าง", "พนักงาน"],
  "d-pd-pt": ["หัวหน้าทีม", "ช่าง", "พนักงาน"],
  "d-pd-in": ["ช่าง Inspection", "พนักงาน Inspection"],
  "d-pd-sp": ["ช่าง Spray Powder", "พนักงาน Spray Powder"],
  "d-it": ["เจ้าหน้าที่ IT Support", "เจ้าหน้าที่ Programmer"],
};

// ─────────────────────────────────────────
// Helper functions — ใช้แทน string matching (.includes()) ทั้งหมดที่เคยมี
// ─────────────────────────────────────────

/** คืนเฉพาะ main department (parentId === null) */
export function getMainDepartments(): Department[] {
  return DEPARTMENTS_FLAT.filter((d) => d.parentId === null);
}

/** คืน sub-department ทั้งหมดของ main dept ที่ระบุ (รับได้ทั้ง id หรือ code) */
export function getSubDepartments(mainDeptIdOrCode: string): Department[] {
  const main = DEPARTMENTS_FLAT.find(
    (d) => d.id === mainDeptIdOrCode || d.code === mainDeptIdOrCode,
  );
  if (!main) return [];
  return DEPARTMENTS_FLAT.filter((d) => d.parentId === main.id);
}

/** หา department object จาก id */
export function getDepartmentById(id: string): Department | undefined {
  return DEPARTMENTS_FLAT.find((d) => d.id === id);
}

/** หา department object จาก code (เช่น 'PD', 'DL') */
export function getDepartmentByCode(code: string): Department | undefined {
  return DEPARTMENTS_FLAT.find((d) => d.code === code);
}

/**
 * คืน main department ของ department ใดๆ (ถ้าเป็น main dept อยู่แล้วคืนตัวเอง)
 * เช่น getMainDepartmentOf('d-pd-dl') → คืน object ของ 'd-pd' (ฝ่ายผลิต)
 */
export function getMainDepartmentOf(deptId: string): Department | undefined {
  const dept = getDepartmentById(deptId);
  if (!dept) return undefined;
  if (dept.parentId === null) return dept;
  return getDepartmentById(dept.parentId);
}

/**
 * เช็คว่า department A อยู่ในสายเดียวกับ department B หรือไม่
 * (ใช้แทนการ .includes() เทียบชื่อไทย/อังกฤษแบบ fuzzy ที่เคยมีใน DocumentList.tsx)
 * เช่น isSameDepartmentBranch('d-pd-dl', 'd-pd-bm') → true (ทั้งคู่อยู่ใต้ PD)
 */
export function isSameDepartmentBranch(
  deptIdA: string,
  deptIdB: string,
): boolean {
  if (deptIdA === deptIdB) return true;
  const mainA = getMainDepartmentOf(deptIdA);
  const mainB = getMainDepartmentOf(deptIdB);
  return !!mainA && !!mainB && mainA.id === mainB.id;
}

/** คืนรายชื่อตำแหน่งทั้งหมดของแผนกที่ระบุ (สำหรับ dropdown position ตอนเพิ่ม/แก้พนักงาน) */
export function getPositionsForDepartment(departmentId: string): string[] {
  return POSITIONS_BY_DEPARTMENT[departmentId] || [];
}

/** flat list ของทุกแผนก (main + sub) เอาไว้ทำ dropdown แบบเลือกได้ทุกระดับในช่องเดียว */
export function getAllDepartmentsFlat(): Department[] {
  return DEPARTMENTS_FLAT;
}

// เก็บไว้ให้ backward compatible ชั่วคราวระหว่าง migrate โค้ดจุดอื่น
// (จะลบทิ้งหลังแก้ครบทุกจุดที่ import DEPARTMENTS แบบเดิม)
export const DEPARTMENTS = getMainDepartments().map((d) => d.name);
