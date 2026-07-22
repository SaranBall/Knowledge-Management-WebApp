/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DepartmentStructure {
  name: string;
  code: string;
  subDepartments: string[];
}

export const DEPARTMENT_HIERARCHY: DepartmentStructure[] = [
  {
    name: 'Production (ผลิต)',
    code: 'PD',
    subDepartments: [
      'Production (ผลิต)',
      'Printing /(งานพิมพ์สี)',
      'Dry-Lamination (งานประกบฟิล์ม)',
      'Powder Spray (งานพ่นฝุ่น)',
      'Inspection & Slitting (งานตรวจสอบและผ่าม้วนฟิล์ม)',
      'Bag-Making(งานขึ้นรูปถุง)',
    ]
  },
  {
    name: 'Quality (คุณภาพ)',
    code: 'QA',
    subDepartments: [
      'Quality Control(QC)',
      'Quality Assurance(QA)',
    ]
  },
  {
    name: 'Warehouse (คลังสินค้า)',
    code: 'WH',
    subDepartments: [
      'Raw Materials Store (คลังวัตถุดิบ)',
      'Finished Goods (คลังสินค้าสำเร็จรูป)',
    ]
  },
  {
    name: 'Production Control (วางแผน)',
    code: 'PC',
    subDepartments: [
      'Production Planning (วางแผนการผลิต)',
    ]
  },
  {
    name: 'Technical (เทคนิค)',
    code: 'TC',
    subDepartments: [
      'Research & Development (วิจัยและพัฒนาผลิตภัณฑ์ R&D)',
    ]
  },
  {
    name: 'Engineering (วิศวกรรม)',
    code: 'EN',
    subDepartments: [
      'Electrical(ระบบไฟฟ้า)',
      'Mechanical Maintenance (ซ่อมบำรุงเครื่องจักรกล)',
      'Engineer (วิศวกร)',
    ]
  },
  {
    name: 'Document Control (ควบคุมเอกสาร)',
    code: 'DCC',
    subDepartments: [
      'ISO Systems & DCC (ระบบมาตรฐานและศูนย์ควบคุมเอกสาร)'
    ]
  },
  {
    name: 'Safety (ความปลอดภัย)',
    code: 'QS',
    subDepartments: [
      'Safety & Environmental (ความปลอดภัย จป. และสิ่งแวดล้อม)',
    ]
  },
  {
    name: 'Human Resources (บุคคล)',
    code: 'HR',
    subDepartments: [
      'HR Development & Training (พัฒนาบุคลากรและฝึกอบรม)',
      'Employee Relations & Welfare (แรงงานสัมพันธ์และสวัสดิการ)'
    ]
  },
  {
    name: 'Accounting (บัญชี)',
    code: 'ACC',
    subDepartments: [
      'Cost Accounting & Inventory (บัญชีต้นทุนและสต็อก)',
      'General Accounting & Finance (บัญชีทั่วไปและการเงิน)'
    ]
  },
  {
    name: 'Purchasing (จัดซื้อ)',
    code: 'PUR',
    subDepartments: [
      'Local & Overseas Purchasing (จัดซื้อในและต่างประเทศ)'
    ]
  },
  {
    name: 'Sales & Marketing (ขายและการตลาด)',
    code: 'SALES',
    subDepartments: [
      'Domestic Sales (ขายในประเทศ)',
      'Export & International (ขายต่างประเทศ)'
    ]
  },
  {
    name: 'Customer Service (บริการลูกค้า)',
    code: 'CS',
    subDepartments: [
      'Customer Support (บริการลูกค้าและแก้ไขปัญหา)',
    ]
  },
  {
    name: 'Information Technology (เทคโนโลยีสารสนเทศ)',
    code: 'IT',
    subDepartments: [
      'IT Support (สนับสนุนด้านเทคโนโลยีสารสนเทศ)',
      'Programming (พัฒนาโปรแกรมและระบบสารสนเทศ)'
    ]
  },
  {
    name: 'Executive (ผู้บริหาร)',
    code: 'EXEC',
    subDepartments: [
      'Executive Office (สำนักผู้บริหารและกรรมการ)'
    ]
  }
];

export const DEPARTMENTS = DEPARTMENT_HIERARCHY.map(d => d.name);

/**
 * Returns the list of all standard main departments.
 */
export function getDepartments(): string[] {
  return DEPARTMENTS;
}

/**
 * Returns sub-departments given a main department name.
 */
export function getSubDepartments(mainDept: string): string[] {
  if (!mainDept) return [];
  const found = DEPARTMENT_HIERARCHY.find(
    d => d.name.toLowerCase().includes(mainDept.toLowerCase()) || mainDept.toLowerCase().includes(d.name.toLowerCase())
  );
  return found ? found.subDepartments : [];
}

/**
 * Returns a short name or clean slug for the department, removing descriptions/Thai translations.
 * e.g., "Executive (ผู้บริหาร)" -> "Executive"
 */
export function getCleanDepartmentName(dept: string): string {
  if (!dept) return '';
  return dept.split(' (')[0].trim();
}

