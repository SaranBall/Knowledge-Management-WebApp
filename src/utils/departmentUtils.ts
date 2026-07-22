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
    code: 'PROD',
    subDepartments: [
      'Extrusion / Film Blowing (งานเป่าฟิล์ม)',
      'Lamination (งานประกบฟิล์ม / กาว)',
      'Slitting (งานผ่าม้วนฟิล์ม / สลิต)',
      'Bag Making / Converting (งานแปรรูปขึ้นรูปถุง)',
      'Engineering & Maintenance (วิศวกรรมและซ่อมบำรุงโรงงาน)'
    ]
  },
  {
    name: 'Quality (คุณภาพ)',
    code: 'QA',
    subDepartments: [
      'Quality Control - Line Inspection (QC ประจำสายการผลิต)',
      'Quality Assurance & System (QA ระบบคุณภาพและกฎหมาย)',
      'QA Laboratory & Chemical (ห้องแล็บและทดสอบเคมีภัณฑ์)'
    ]
  },
  {
    name: 'Warehouse (คลังสินค้า)',
    code: 'WH',
    subDepartments: [
      'Raw Materials Store (คลังเม็ดพลาสติกและเคมีภัณฑ์)',
      'Finished Goods & Logistics (คลังสินค้าสำเร็จรูปและจัดส่ง)',
      'Spare Parts Store (คลังอะไหล่และอุปกรณ์ช่าง)'
    ]
  },
  {
    name: 'Planning (วางแผน)',
    code: 'PLAN',
    subDepartments: [
      'Production Planning (วางแผนการผลิต)',
      'Material Requirement Planning - MRP (วางแผนวัตถุดิบ)'
    ]
  },
  {
    name: 'Technical (เทคนิค)',
    code: 'TECH',
    subDepartments: [
      'Research & Development (วิจัยและพัฒนาผลิตภัณฑ์ R&D)',
      'Process Improvement / Kaizen (ปรับปรุงกระบวนการผลิต)'
    ]
  },
  {
    name: 'Engineering (วิศวกรรม)',
    code: 'ENG',
    subDepartments: [
      'Electrical & Automation (ระบบไฟฟ้าและอัตโนมัติ)',
      'Mechanical Maintenance (ซ่อมบำรุงเครื่องจักรกล)',
      'Utility & Facilities (ระบบสาธารณูปโภคโรงงาน)'
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
    code: 'SHE',
    subDepartments: [
      'Safety & Environmental (ความปลอดภัย จป. และสิ่งแวดล้อม)'
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
      'Customer Support & Order Processing (บริการและรับคำสั่งซื้อ)'
    ]
  },
  {
    name: 'Information Technology (เทคโนโลยีสารสนเทศ)',
    code: 'IT',
    subDepartments: [
      'IT Infrastructure & Systems (โครงสร้างพื้นฐานและซอฟต์แวร์)'
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

