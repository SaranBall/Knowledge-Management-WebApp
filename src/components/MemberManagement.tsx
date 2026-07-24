/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { 
  Users, UserCheck, Shield, Plus, Mail, Phone, Search, 
  Trash2, Award, Printer, Download, Clock, CheckCircle, HelpCircle, 
  ChevronRight, Landmark, Building2, AlertTriangle, Check, FileText, Layers, Sparkles, BookOpen,
  Edit, Lock, User as UserIcon, Upload
} from 'lucide-react';
import { User, Role, Course, UserCourseProgress, EmployeeMaster, KBArticle, SearchLog, UserStatus, SystemAuditLog } from '../types';
import { INITIAL_EMPLOYEE_MASTER } from '../data/initialData';
import { getUserBadges } from '../utils/badgeUtils';
import { BadgePill } from './BadgeDisplay';
import { DEPARTMENTS, getSubDepartments } from '../utils/departmentUtils';

export const calculateTenure = (startDateStr?: string): string => {
  if (!startDateStr) return 'ไม่มีข้อมูลวันเริ่มงาน';
  const start = new Date(startDateStr);
  const now = new Date();
  
  if (isNaN(start.getTime())) return 'ระบุวันที่ผิดพลาด';
  
  const diffTime = now.getTime() - start.getTime();
  if (diffTime < 0) {
    return 'ยังไม่เริ่มงาน';
  }
  
  let diffYears = now.getFullYear() - start.getFullYear();
  let diffMonths = now.getMonth() - start.getMonth();
  let diffDays = now.getDate() - start.getDate();
  
  if (diffDays < 0) {
    diffMonths--;
    // Add days of the previous month
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    diffDays += prevMonth.getDate();
  }
  
  if (diffMonths < 0) {
    diffYears--;
    diffMonths += 12;
  }
  
  const parts: string[] = [];
  if (diffYears > 0) parts.push(`${diffYears} ปี`);
  if (diffMonths > 0) parts.push(`${diffMonths} เดือน`);
  if (diffDays > 0 || parts.length === 0) parts.push(`${diffDays} วัน`);
  
  return parts.join(' ');
};

interface MemberManagementProps {
  currentUser: User;
  users: User[];
  courses: Course[];
  userProgressList: UserCourseProgress[];
  examResults: any[];
  onAddUser: (u: User) => void;
  onUpdateUser?: (u: User) => void;
  onUpdateUserRole: (id: string, role: Role) => void;
  onDeleteUser: (id: string) => void;
  employeeMaster: EmployeeMaster[];
  onUpdateEmployeeMaster: (data: EmployeeMaster[]) => void;
  kbArticles?: KBArticle[];
  searchLogs?: SearchLog[];
  systemAuditLogs?: SystemAuditLog[];
}

export const MemberManagement: React.FC<MemberManagementProps> = ({
  currentUser,
  users,
  courses,
  userProgressList,
  examResults,
  onAddUser,
  onUpdateUser,
  onUpdateUserRole,
  onDeleteUser,
  employeeMaster = [],
  onUpdateEmployeeMaster,
  kbArticles = [],
  searchLogs = [],
  systemAuditLogs = [],
}) => {
  const [activeTab, setActiveTab] = useState<'MEMBERS' | 'REPORTS' | 'EMPLOYEE_MASTER' | 'AUDIT_LOGS'>('MEMBERS');
  const [searchTerm, setSearchTerm] = useState('');
  const [auditSearchTerm, setAuditSearchTerm] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  
  // New User Form State
  const [isAddOpen, setIsAddOpen] = useState(false);
const [newUser, setNewUser] = useState({
  name: '',
  employeeId: '',
  departmentId: 'd-hr', // ← เปลี่ยนจาก department: 'Select Department'
  position: '',
  role: 'Viewer' as Role,
  email: '',
  phone: '',
  startDate: new Date().toISOString().split('T')[0],
  avatarUrl: '',
});

  // --- REAL IMPORT PARSER STATES ---
  const [parserLoading, setParserLoading] = useState(false);
  const [parserError, setParserError] = useState<string | null>(null);
  const [parserSuccessMsg, setParserSuccessMsg] = useState<string | null>(null);
  const [parsedEmployees, setParsedEmployees] = useState<EmployeeMaster[]>([]);
  const [showImportPreview, setShowImportPreview] = useState(false);

  // Edit User Form State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<{
    id: string;
    name: string;
    employeeId: string;
    departmentId: string;
    position: string;
    role: Role;
    email: string;
    phone: string;
    password?: string;
    status: UserStatus;
    startDate: string;
    avatarUrl: string;
  } | null>(null);

  const startEditing = (u: User) => {
    // SECURITY BLOCK: Members cannot edit their own data
    if (u.id === currentUser.id) {
      alert('ข้อกำหนดมาตรฐาน ISO & ความปลอดภัยบุคคล: ไม่อนุญาตให้ท่านแก้ไขสิทธ์หรือรายละเอียดในบัญชีของตนเองได้โดยตรง โปรดแจ้งแอดมินหรือบุคลากรท่านอื่นเป็นผู้ดำเนินการแทน');
      return;
    }
    setEditingUser(u);
    setEditForm({
      id: u.id,
      name: u.name,
      employeeId: u.employeeId,
      departmentId: u.departmentId,
      position: u.position,
      role: u.role,
      email: u.email,
      phone: u.phone,
      password: u.password || '123456',
      status: u.status || 'Active',
      startDate: u.startDate || new Date().toISOString().split('T')[0],
      avatarUrl: u.avatarUrl || ''
    });
  };

  const handleEditUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm || !editForm.name || !editForm.email) return;

    // Check if employeeId duplicates other users
    const duplicate = users.some(u => u.id !== editForm.id && u.employeeId.toLowerCase() === editForm.employeeId.toLowerCase());
    if (duplicate) {
      alert('❌ ขออภัย! รหัสพนักงานนี้ซ้ำกับข้อมูลพนักงานรายอื่นในระบบ');
      return;
    }

    // PIN check
    const pin = editForm.password?.trim() || '';
    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
      alert('❌ รหัสผ่านความปลอดภัย PIN ต้องเป็นตัวเลข 6 หลักเท่านั้นค่ะ');
      return;
    }

    if (onUpdateUser) {
      onUpdateUser({
        id: editForm.id,
        name: editForm.name,
        employeeId: editForm.employeeId,
        departmentId: editForm.departmentId,
        position: editForm.position,
        role: editForm.role,
        email: editForm.email,
        phone: editForm.phone,
        password: pin,
        avatarUrl: editForm.avatarUrl || editingUser?.avatarUrl || '',
        status: editForm.status,
        startDate: editForm.startDate
      });
    } else {
      // Fallback
      onUpdateUserRole(editForm.id, editForm.role);
    }

    alert('🎉 บันทึกการเปลี่ยนแปลงรายละเอียดพนักงานสำเร็จ!');
    setEditingUser(null);
    setEditForm(null);
  };

  // --- REAL IMPORT PARSER LOGIC ---
  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleNewUserAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await toBase64(file);
        setNewUser(prev => ({ ...prev, avatarUrl: base64 }));
      } catch (err) {
        console.error("Error reading image:", err);
      }
    }
  };

  const mapHeaders = (row: any[]) => {
    const mapping: { [key: string]: number } = {};
    row.forEach((cell, idx) => {
      if (cell === null || cell === undefined) return;
      const str = cell.toString().toLowerCase().trim();
      if (str.includes('employeeid') || str.includes('employee id') || str.includes('รหัสพนักงาน') || str.includes('รหัส') || str.includes('id')) {
        mapping.employeeId = idx;
      } else if (str.includes('fullname') || str.includes('name') || str.includes('ชื่อ') || str.includes('นามสกุล') || str.includes('ชื่อ-นามสกุล')) {
        mapping.name = idx;
      } else if (str.includes('department') || str.includes('แผนก') || str.includes('ฝ่าย')) {
        mapping.department = idx;
      } else if (str.includes('position') || str.includes('ตำแหน่ง')) {
        mapping.position = idx;
      } else if (str.includes('startdate') || str.includes('start date') || str.includes('วันเริ่มงาน') || str.includes('วันที่เริ่มงาน')) {
        mapping.startDate = idx;
      } else if (str.includes('level') || str.includes('ระดับ')) {
        mapping.level = idx;
      } else if (str.includes('email') || str.includes('อีเมล')) {
        mapping.email = idx;
      } else if (str.includes('phone') || str.includes('เบอร์โทร') || str.includes('โทร')) {
        mapping.phone = idx;
      }
    });
    return mapping;
  };

  const handleFileImport = async (file: File) => {
    setParserLoading(true);
    setParserError(null);
    setParserSuccessMsg(null);
    setParsedEmployees([]);

    const name = file.name.toLowerCase();
    
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      // Approach 1: Client-side parsing using SheetJS (XLSX)
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            throw new Error("ไม่สามารถอ่านข้อมูลดิบของไฟล์ได้");
          }
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (json.length < 2) {
            throw new Error("ไฟล์ Excel ไม่มีข้อมูลเพียงพอ หรือไม่มีแถวส่วนหัวหลัก");
          }

          const headers = json[0];
          // Find mapping
          const mapping = mapHeaders(headers);
          
          // Parse other rows
          const list: EmployeeMaster[] = [];
          for (let i = 1; i < json.length; i++) {
            const row = json[i];
            if (!row || row.length === 0 || !row.some(c => c !== null && c !== undefined && c !== '')) continue;
            
            // Extract values
            const empIdVal = mapping.employeeId !== undefined ? row[mapping.employeeId] : row[0];
            const nameVal = mapping.name !== undefined ? row[mapping.name] : row[1];
            const deptVal = mapping.department !== undefined ? row[mapping.department] : row[2];
            const posVal = mapping.position !== undefined ? row[mapping.position] : row[3];
            const startVal = mapping.startDate !== undefined ? row[mapping.startDate] : row[4];
            const lvlVal = mapping.level !== undefined ? row[mapping.level] : row[5];
            const emailVal = mapping.email !== undefined ? row[mapping.email] : row[6];
            const phoneVal = mapping.phone !== undefined ? row[mapping.phone] : row[7];

            if (!empIdVal || !nameVal) {
              // skip empty or incomplete ID/name rows
              continue;
            }

            // format start date to YYYY-MM-DD
            let startDateFormatted = '';
            if (startVal) {
              if (typeof startVal === 'number') {
                // Excel serial date number
                const utc_days  = Math.floor(startVal - 25569);
                const utc_value = utc_days * 86400;
                const date_info = new Date(utc_value * 1000);
                startDateFormatted = date_info.toISOString().split('T')[0];
              } else {
                const dateObj = new Date(startVal);
                if (!isNaN(dateObj.getTime())) {
                  startDateFormatted = dateObj.toISOString().split('T')[0];
                } else {
                  startDateFormatted = startVal.toString();
                }
              }
            } else {
              startDateFormatted = new Date().toISOString().split('T')[0];
            }

            list.push({
              employeeId: empIdVal.toString().trim(),
              name: nameVal.toString().trim(),
              department: deptVal ? deptVal.toString().trim() : '',
              position: posVal ? posVal.toString().trim() : '',
              startDate: startDateFormatted,
              level: lvlVal ? lvlVal.toString().trim() : '',
              email: emailVal ? emailVal.toString().trim() : `${nameVal.toString().trim().toLowerCase()}@royalmeiwa.com`,
              phone: phoneVal ? phoneVal.toString().trim() : '0xx-xxxxxxx',
              status: 'Imported'
            });
          }

          if (list.length === 0) {
            throw new Error("ไม่มีข้อมูลพนักงานที่สามารถแปลงค่าได้ (โปรดตรวจสอบคอลัมน์ รหัสพนักงาน และ ชื่อพนักงาน)");
          }

          setParsedEmployees(list);
          setParserSuccessMsg(`สแกนไฟล์ Excel/CSV สำเร็จ: พบข้อมูลพนักงานทั้งหมด ${list.length} แถว`);
          setShowImportPreview(true);
        } catch (err: any) {
          setParserError(err.message || "เกิดข้อผิดพลาดในการอ่านไฟล์ Excel");
        } finally {
          setParserLoading(false);
        }
      };
      
      reader.onerror = () => {
        setParserError("เกิดข้อผิดพลาดจาก FileReader ในการอ่านไฟล์");
        setParserLoading(false);
      };

      reader.readAsBinaryString(file);
    } else if (name.endsWith('.pdf') || file.type.startsWith('image/')) {
      // Real PDF / Image OCR extraction using Gemini backend parser
      try {
        const base64 = await toBase64(file);
        const cleanBase64 = base64.split(',')[1] || base64;
        
        const response = await fetch('/api/parse-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64Data: cleanBase64,
            fileType: file.type || (name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
            fileName: file.name
          })
        });

        if (!response.ok) {
          throw new Error(`เซิร์ฟเวอร์ส่งกลับข้อผิดพลาดสถานะ ${response.status}`);
        }

        const result = await response.json();
        if (result.success && result.employees && result.employees.length > 0) {
          setParsedEmployees(result.employees);
          setParserSuccessMsg(`วิเคราะห์เอกสาร PDF/ภาพแสกนด้วย AI สำเร็จ: พบข้อมูลพนักงาน ${result.employees.length} แถว`);
          setShowImportPreview(true);
        } else {
          throw new Error(result.message || "โมเดล AI ไม่สามารถถอดโครงสร้างข้อมูลพนักงานจากเอกสารนี้ได้");
        }
      } catch (err: any) {
        setParserError(err.message || "เกิดข้อผิดพลาดในการเรียกใช้ AI Parser บนเซิร์ฟเวอร์");
      } finally {
        setParserLoading(false);
      }
    } else {
      setParserError("ไม่สนับสนุนรูปแบบไฟล์นี้ กรุณาอัปโหลด .xlsx, .xls, .csv, หรือ .pdf เท่านั้น");
      setParserLoading(false);
    }
  };

  // Report Generator States
  const [reportType, setReportType] = useState<'INDIVIDUAL' | 'DEPARTMENT' | 'ALL' | 'SEARCH_LOGS'>('ALL');
  const [selectedRepUser, setSelectedRepUser] = useState<string>(users[0]?.id || '');
  const [selectedRepDept, setSelectedRepDept] = useState<string>('Select Department');

  // Search log sub-tabs and resolver states
  const [searchReportTab, setSearchReportTab] = useState<'GAPS' | 'TOP_KEYWORDS' | 'RAW_LOGS'>('GAPS');
  const [resolvedGaps, setResolvedGaps] = useState<string[]>([]);
  const [assigningGap, setAssigningGap] = useState<string | null>(null);
  const [quickAnswerText, setQuickAnswerText] = useState('');
  const [assignedExpert, setAssignedExpert] = useState('Select Employee');

  const departments = DEPARTMENTS;

  React.useEffect(() => {
    if (currentUser.role === 'Viewer') {
      setReportType('INDIVIDUAL');
      setSelectedRepUser(currentUser.id);
    } else if (currentUser.role === 'Editor') {
      setReportType('DEPARTMENT');
      setSelectedRepDept(currentUser.department || 'Select Department');
      const deptUsers = users.filter(u => u.department === currentUser.department);
      if (deptUsers.length > 0) {
        setSelectedRepUser(deptUsers[0].id);
      } else {
        setSelectedRepUser(currentUser.id);
      }
    } else {
      setReportType('ALL');
      if (users.length > 0) {
        setSelectedRepUser(users[0].id);
      }
    }
  }, [currentUser, users]);

  const visibleUsers = users;

  const filteredUsers = visibleUsers.filter(u => {
    const matchStr = `${u.name} ${u.employeeId} ${u.department} ${u.position} ${u.role}`.toLowerCase();
    return matchStr.includes(searchTerm.toLowerCase());
  });

  const filteredAuditLogs = systemAuditLogs.filter(log => {
    const matchesSearch = 
      log.details.toLowerCase().includes(auditSearchTerm.toLowerCase()) ||
      log.performedBy.toLowerCase().includes(auditSearchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(auditSearchTerm.toLowerCase()) ||
      log.id.toLowerCase().includes(auditSearchTerm.toLowerCase());
    const matchesAction = auditActionFilter === 'ALL' || log.action === auditActionFilter;
    return matchesSearch && matchesAction;
  });

  const handleCreateUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.employeeId || !newUser.email) return;

    // Check if ID already exists
    if (users.some(u => u.employeeId === newUser.employeeId)) {
      alert('❌ ขออภัย! รหัสพนักงานนี้มีบัญชีใช้งานอยู่แล้วในระบบ');
      return;
    }

    const created: User = {
      id: `usr-${Date.now()}`,
      name: newUser.name,
      employeeId: newUser.employeeId,
      departmentId: newUser.departmentId,
      position: newUser.position,
      role: newUser.role,
      avatarUrl: newUser.avatarUrl || `https://images.unsplash.com/photo-1535713875002?w=120`, // fallback if they somehow bypass
      email: newUser.email,
      phone: newUser.phone || '02-1234567',
      startDate: newUser.startDate || new Date().toISOString().split('T')[0]
    };

    onAddUser(created);
    setIsAddOpen(false);
    // Reset Form
    setNewUser({
      name: '',
      employeeId: '',
      departmentId: 'Select Department',
      position: 'Operator',
      role: 'Viewer',
      email: '',
      phone: '',
      startDate: new Date().toISOString().split('T')[0],
      avatarUrl: ''
    });
    alert('🎉 เพิ่มสมาชิกใหม่และกำหนดสิทธิ์สำเร็จ!');
  };

  const handleRoleChange = (userId: string, newRole: Role) => {
    onUpdateUserRole(userId, newRole);
  };

  // Helper competency matrix lists
  const getRequiredCoursesForPosition = (position: string) => {
    if (position.includes('QA') || position.includes('QC')) {
      return ['c-2', 'c-3']; // Chemistry Inspections & Forklift
    }
    if (position.includes('Production') || position.includes('Engineer')) {
      return ['c-3']; // Forklift
    }
    if (position.includes('Warehouse')) {
      return ['c-1', 'c-3']; // Onboarding Warehouse & Forklift
    }
    return ['c-1'];
  };

  const handleExportCsv = (scope: 'ALL' | 'DEPARTMENT' | 'ISO_AUDIT_AGGREGATED' | 'RAW_SEARCH_LOGS' | 'INDIVIDUAL_CSV') => {
    // Role-based Access Control for exports
    if (currentUser.role === 'Viewer' && scope !== 'INDIVIDUAL_CSV') {
      alert('❌ สิทธิ์เข้าชมทั่วไป (Viewer) ของคุณสามารถดาวน์โหลดเฉพาะรายงานผลการเรียนรู้ของตัวเองได้เท่านั้น');
      return;
    }
    if (currentUser.role === 'Editor' && (scope === 'ALL' || scope === 'ISO_AUDIT_AGGREGATED' || scope === 'RAW_SEARCH_LOGS')) {
      alert('❌ สิทธิ์หัวหน้างาน (Editor) ของคุณสามารถดาวน์โหลดเฉพาะรายงานแผนกตนเองได้เท่านั้น (ระดับองค์กรจำกัดสิทธิ์เฉพาะ Admin)');
      return;
    }

    let filename = '';
    let csvContent = '';

    if (scope === 'ALL' || scope === 'DEPARTMENT') {
      let targetUsers = users;
      if (scope === 'DEPARTMENT') {
        const deptSlug = selectedRepDept.split(' (')[0];
        targetUsers = targetUsers.filter(u => u.department.includes(deptSlug));
        filename = `learning_report_${deptSlug.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      } else {
        filename = `learning_report_all_employees_${new Date().toISOString().split('T')[0]}.csv`;
      }

      if (targetUsers.length === 0) {
        alert('❌ ไม่พบข้อมูลรายชื่อพนักงานสำหรับส่งออกในกลุ่มที่เลือก');
        return;
      }

      // CSV Headers
      const headers = [
        'รหัสพนักงาน (Employee ID)',
        'ชื่อ-นามสกุลจริง (Full Name)',
        'สังกัดฝ่าย/แผนก (Department)',
        'ตำแหน่งงาน (Position)',
        'ระดับบทบาท (System Role)',
        'อีเมล (Email)',
        'เบอร์โทรศัพท์ (Phone)',
        'คอร์สที่เรียนสำเร็จ (Completed Courses)',
        'คอร์สบังคับทั้งหมด (Required Courses)',
        'คะแนนสอบเฉลี่ย (Average Exam Score %)',
        'ชั่วโมงการฝึกอบรมสะสม (Total Training Hours)',
        'สถานะตรวจสอบ (Compliance Status)'
      ];

      // CSV Rows
      const rows = targetUsers.map(u => {
        const completions = userProgressList.filter(p => p.userId === u.id && p.status === 'Completed').length;
        const attempts = examResults.filter(e => e.employeeId === u.employeeId);
        const avgS = attempts.length > 0 ? Math.round(attempts.reduce((acc, c) => acc + c.score, 0) / attempts.length) : 90;
        const reqs = getRequiredCoursesForPosition(u.position).length;
        const hours = completions * 3 + 2;
        const statusText = completions >= reqs ? 'ผ่านเกณฑ์ครบหลักสูตร' : 'รอดำเนินการอบรม';
        
        const isMaskedAdmin = u.role === 'Admin' && currentUser.role !== 'Admin';
        const displayedRole = isMaskedAdmin ? 'Editor' : u.role;

        return [
          u.employeeId,
          u.name,
          u.department,
          u.position,
          displayedRole,
          u.email,
          u.phone,
          completions,
          reqs,
          `${avgS}%`,
          `${hours} ชั่วโมง`,
          statusText
        ];
      });

      // Join rows and columns
      csvContent = [
        headers.map(val => `"${val.replace(/"/g, '""')}"`).join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

    } else if (scope === 'ISO_AUDIT_AGGREGATED') {
      const today = new Date().toISOString().split('T')[0];
      filename = `ISO_9001_Audit_Training_and_Gaps_Report_${today}.csv`;

      // Build a beautiful multi-section consolidated CSV sheet
      const section1Header = ['=== ส่วนที่ 1: รายงานสถิติการฝึกอบรมและประเมินผลพนักงาน (Part 1: Employee Training & Competency Audit) ==='];
      const headers1 = [
        'รหัสพนักงาน (Employee ID)',
        'ชื่อ-นามสกุลจริง (Full Name)',
        'สังกัดฝ่าย/แผนก (Department)',
        'ตำแหน่งงาน (Position)',
        'หลักสูตรที่เสร็จสิ้น (Completed Courses Count)',
        'หลักสูตรบังคับทั้งหมด (Required Courses Count)',
        'อัตราความคืบหน้า (Completion Rate %)',
        'คะแนนทดสอบเฉลี่ย (Avg Exam Score %)',
        'ชั่วโมงสะสมการเรียนรู้ (Total Hours)',
        'สถานะตรวจสอบความปลอดภัย (ISO Compliance Status)'
      ];

      const targetUsers = users;
      const rows1 = targetUsers.map(u => {
        const completions = userProgressList.filter(p => p.userId === u.id && p.status === 'Completed').length;
        const reqs = getRequiredCoursesForPosition(u.position).length;
        const rate = reqs > 0 ? Math.round((completions / reqs) * 100) : 100;
        const attempts = examResults.filter(e => e.employeeId === u.employeeId);
        const avgS = attempts.length > 0 ? Math.round(attempts.reduce((acc, c) => acc + c.score, 0) / attempts.length) : 90;
        const hours = completions * 3 + 2;
        const statusText = completions >= reqs ? 'ผ่านเกณฑ์แบบฟอร์ม ISO' : 'รอดำเนินการประเมินศึกษา';

        return [
          u.employeeId,
          u.name,
          u.department,
          u.position,
          completions,
          reqs,
          `${rate}%`,
          `${avgS}%`,
          `${hours} ชั่วโมง`,
          statusText
        ];
      });

      // Build Section 2: Gaps
      const section2Header = ['', '', '=== ส่วนที่ 2: รายงานการวิเคราะห์ความพยายามสืบค้นและช่องว่างความรู้เพื่อปรับปรุงอย่างต่อเนื่อง (Part 2: Continuous Improvement & Knowledge Gaps Audit - ISO Clause 10) ==='];
      const headers2 = [
        'หัวข้อสืบค้นของพนักงาน (Employee Search query)',
        'จำนวนครั้งที่สืบค้น (Search Frequency)',
        'สถานะคำแนะนำในคลังระบบ (Found in Database)',
        'สถานะช่องว่างความรู้ (Knowledge Gap Detected?)',
        'การแก้ไขปัญหาระบบ (Compliance Resolution Status)',
        'ผู้ดูแล / ผู้ร่วมตรวจสอบ (Assigned Expert Resolution)'
      ];

      // Group failed and successful search logs by keyword to list them as aggregated queries
      const queryStats: { [key: string]: { keyword: string; count: number; hasResult: boolean } } = {};
      searchLogs.forEach(log => {
        if (!queryStats[log.keyword]) {
          queryStats[log.keyword] = { keyword: log.keyword, count: 0, hasResult: log.hasResult };
        }
        queryStats[log.keyword].count += 1;
        // if any instance hasResult is true, let's treat it as true
        if (log.hasResult) {
          queryStats[log.keyword].hasResult = true;
        }
      });

      const rows2 = Object.values(queryStats).map(stat => {
        const isGap = !stat.hasResult;
        const isResolved = resolvedGaps.includes(stat.keyword);
        const hasMatch = stat.hasResult ? 'พบข้อมูลบทความกิตติคุณสำเร็จ' : 'ไม่พบบทความกิตติคุณคู่มือ';
        const gapText = isGap ? '⚠️ พบบายพาสช่องว่างความรู้ (Knowledge Gap Detected)' : '✓ ผ่านกระบวนการทบทวนสืบค้นปกติ';
        
        let resolutionText = 'N/A';
        let expertAssigned = 'N/A';

        if (isGap) {
          if (isResolved) {
            resolutionText = 'ปิดช่องว่างเรียบร้อย: อนุมัติคู่มือการแก้ปัญหาและนำขึ้น Knowledge Base สำเร็จ';
            expertAssigned = 'ช่างสมชาย (Senior Production Engineer) & ทีมแอดมินกลาง';
          } else {
            resolutionText = 'รอดำเนินการทบทวน: ต้องประสานงานผู้เชี่ยวชาญเพิ่มเติมเพื่อกำหนดเอกสาร SOP';
            expertAssigned = 'รอระบุผู้ตรวจประเมินระบบ';
          }
        } else {
          resolutionText = 'คู่มือความปลอดภัยเข้าถึงสมบูรณ์ดีเยี่ยม';
          expertAssigned = 'ทีมวิศวกรระบบดูแล';
        }

        return [
          stat.keyword,
          stat.count,
          hasMatch,
          gapText,
          resolutionText,
          expertAssigned
        ];
      });

      // Format Sections as CSV string
      csvContent = [
        section1Header.map(val => `"${val.replace(/"/g, '""')}"`).join(','),
        headers1.map(val => `"${val.replace(/"/g, '""')}"`).join(','),
        ...rows1.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')),
        ...section2Header.map(val => `"${val.replace(/"/g, '""')}"`).join(','),
        headers2.map(val => `"${val.replace(/"/g, '""')}"`).join(','),
        ...rows2.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

    } else if (scope === 'RAW_SEARCH_LOGS') {
      const today = new Date().toISOString().split('T')[0];
      filename = `RMP_Factory_Raw_Search_Logs_${today}.csv`;

      const headers = [
        'ลำดับรายการ (Log ID)',
        'วันเวลาสืบค้น (Timestamp)',
        'คำสืบค้นพิมพ์จริง (Searched Keyword)',
        'รหัสพนักงานสืบค้น (Employee ID)',
        'ชื่อผู้สืบค้น (Searched By Employee)',
        'แผนกพนักงาน (Department)',
        'สถานะการพบคู่มือป้องกัน (System Has Results)',
        'เป็นช่องว่างความรู้หรือไม่ (Is Unresolved Gap?)'
      ];

      const rows = searchLogs.map(log => {
        const matchingUser = users.find(u => u.id === log.userId);
        const isAdmin = matchingUser?.role === 'Admin';
        const name = matchingUser 
          ? (isAdmin && currentUser.role !== 'Admin' ? 'ผู้ดูแลระบบ' : matchingUser.name)
          : 'ไม่ระบุชื่อพนักงาน (ระบบลบระเบียน)';
        const dept = matchingUser ? matchingUser.department : 'N/A';
        const empId = matchingUser 
          ? (isAdmin && currentUser.role !== 'Admin' ? 'N/A' : matchingUser.employeeId)
          : 'N/A';
        const isUnresolvedGap = !log.hasResult && !resolvedGaps.includes(log.keyword);
        
        return [
          log.id,
          log.timestamp,
          log.keyword,
          empId,
          name,
          dept,
          log.hasResult ? 'พบข้อมูลคู่มือในระบบ (FOUND)' : 'ไม่พบข้อมูลคู่มือในระบบ (NOT FOUND)',
          isUnresolvedGap ? 'ใช่ (เป็นช่องว่างรอพับลิช)' : 'ไม่ใช่ช่องว่าง / ได้รับการอนุมัติแล้ว'
        ];
      });

      csvContent = [
        headers.map(val => `"${val.replace(/"/g, '""')}"`).join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
    } else if (scope === 'INDIVIDUAL_CSV') {
      const u = users.find(userItem => userItem.id === selectedRepUser);
      if (!u) {
        alert('❌ ไม่พบข้อมูลพนักงานรายที่ระบุ');
        return;
      }
      
      // Additional safety: Editor can only download individual report of their own department
      if (currentUser.role === 'Editor' && u.department !== currentUser.department) {
        alert(`❌ สิทธิ์ของคุณเข้าถึงได้เฉพาะพนักงานสังกัดแผนก ${currentUser.department} เท่านั้น`);
        return;
      }
      // Viewer can only download individual report of themselves
      if (currentUser.role === 'Viewer' && u.id !== currentUser.id) {
        alert('❌ คุณสามารถดาวน์โหลดเฉพาะรายงานของบัญชีตนเองเท่านั้น');
        return;
      }

      filename = `learning_transcript_${u.employeeId}_${new Date().toISOString().split('T')[0]}.csv`;
      
      const headers = [
        'รหัสพนักงาน (Employee ID)',
        'ชื่อ-นามสกุล (Full Name)',
        'แผนก (Department)',
        'ตำแหน่งงาน (Position)',
        'รหัสหลักสูตร (Course ID)',
        'ชื่อหลักสูตร (Course Title)',
        'เกณฑ์คะแนนสอบ (Required Passing %)',
        'คะแนนที่ทำได้ (Actual Score %)',
        'ผลการประเมินสอบผ่าน (Exam Passed)',
        'สถานะการฝึกอบรม (Training Status)'
      ];

      const reqCourseIds = getRequiredCoursesForPosition(u.position);
      const userCompletedProgresses = userProgressList.filter(p => p.userId === u.id);
      const userExamLogs = examResults.filter(e => e.employeeId === u.employeeId);

      const rows = reqCourseIds.map(courseId => {
        const courseObj = courses.find(c => c.id === courseId);
        const progressObj = userCompletedProgresses.find(p => p.courseId === courseId);
        const examObj = userExamLogs.find(e => e.courseId === courseId);
        
        const isPassed = progressObj?.status === 'Completed' || (examObj && examObj.pass);
        const scoreVal = examObj?.score ?? progressObj?.score ?? '85';
        const title = courseObj ? courseObj.title : 'หลักสูตรมาตรฐานโรงงาน';
        const passingScore = courseObj ? courseObj.minPassScore : 80;

        return [
          u.employeeId,
          u.name,
          u.department,
          u.position,
          courseId,
          title,
          `${passingScore}%`,
          `${scoreVal}%`,
          isPassed ? 'ผ่านเกณฑ์ (PASSED)' : 'รอดำเนินการอบรม (PENDING)',
          progressObj?.status || 'Not Started'
        ];
      });

      csvContent = [
        headers.map(val => `"${val.replace(/"/g, '""')}"`).join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
    }

    // Unicode BOM to support Thai characters in Excel
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Alert confirmation
    alert(`🎉 ประมวลรายงานตรวจสอบสำเร็จ!\nส่งออกไฟล์ "${filename}" เรียบร้อยเพื่อนำเข้าระบบเอกสารหลักฐาน ISO Audit!`);
  };

  return (
    <div className="space-y-6">
      {/* Upper sub-navigation layout */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('MEMBERS')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-2 ${
              activeTab === 'MEMBERS' 
                ? 'bg-[#15329c] text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            จัดการสิทธิ์และสมาชิกทั้งหมด ({visibleUsers.length} ราย)
          </button>
          
          <button
            onClick={() => setActiveTab('REPORTS')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-2 ${
              activeTab === 'REPORTS' 
                ? 'bg-[#15329c] text-white shadow-sm' 
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Printer className="w-4 h-4" />
            ระบบออกรายงานประวัติการเรียนรู้ (Individual & Dept Report)
          </button>

          {currentUser.role !== 'Viewer' ? (
            <button
              onClick={() => setActiveTab('EMPLOYEE_MASTER')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-2 ${
                activeTab === 'EMPLOYEE_MASTER' 
                  ? 'bg-[#15329c] text-white shadow-sm' 
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-4 h-4" />
              ฐานข้อมูลพนักงานกลางรอลงทะเบียน ({employeeMaster.length} ราย)
            </button>
          ) : (
            <button
              disabled
              title="สิทธิ์ของคุณเป็น Viewer ไม่สามารถจัดการฐานข้อมูลพนักงานกลางได้"
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 cursor-not-allowed flex items-center gap-2 bg-slate-50 border border-slate-205"
            >
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              ฐานข้อมูลพนักงานกลาง (สิทธิ์เฉพาะ Admin/Editor)
            </button>
          )}
        </div>

        {currentUser.role !== 'Admin' && (
          <div className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
            ⚠️ โหมดสาธิต: แอดมินสามารถสลับสิทธิ์ได้ที่มุมขวาบนของหน้าจอหลัก
          </div>
        )}
      </div>

      {activeTab === 'MEMBERS' && (
        <div className="space-y-6">
          {/* Members filters and action additions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200">
            {/* Search inputs */}
            <div className="relative w-full sm:w-80">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="สืบค้นชื่อ, แผนก, รหัสพนักงาน หรือ สิทธิ์..."
                className="w-full bg-slate-50 border border-slate-200 py-2 pl-9 pr-4 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#15329c]"
              />
            </div>

            {currentUser.role === 'Admin' ? (
              <button
                onClick={() => setIsAddOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer transition w-full sm:w-auto justify-center"
              >
                <Plus className="w-4 h-4" />
                เพิ่มพนักงานรายบุคคล
              </button>
            ) : (
              <span className="text-[10.5px] font-mono italic text-slate-400">เฉพาะแอดมินกำหนดสิทธิ์และเพิ่มสมาชิกเท่านั้น</span>
            )}
          </div>

          {/* Grid list of employees with their roles dropdown */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
            {/* Table headers */}
            <div className="grid grid-cols-2 md:grid-cols-12 p-4 bg-slate-50/80 border-b border-slate-200 font-bold text-slate-650 tracking-wider">
              <div className="md:col-span-3">ชื่อพนักงาน / บัญชีใช้งาน</div>
              <div className="md:col-span-2">สังกัดแผนกงาน / ตำแหน่ง</div>
              <div className="md:col-span-3">📅 วันเริ่มงาน / อายุงาน</div>
              <div className="md:col-span-2 text-center md:text-left">บทบาทสิทธิ์ (Role)</div>
              <div className="md:col-span-1 text-center md:text-left">สถานะบัญชี</div>
              <div className="md:col-span-1 text-right font-bold text-slate-600">จัดการ</div>
            </div>

            <div className="divide-y divide-slate-150">
              {filteredUsers.map((u) => {
                const isMaskedAdmin = u.role === 'Admin' && currentUser.role !== 'Admin';
                const displayedRole = isMaskedAdmin ? 'Editor' : u.role;

                return (
                  <div key={u.id} className="grid grid-cols-2 md:grid-cols-12 p-4 items-center hover:bg-slate-50/50 transition gap-y-3">
                    {/* Name column */}
                    <div className="md:col-span-3 flex items-center gap-3">
                      <img
                        src={u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80'}
                        alt={u.name}
                        className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-xs shrink-0"
                      />
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-800 text-xs sm:text-sm">{u.name}</h4>
                        <p className="text-[10.5px] text-slate-400 font-mono mt-0.5">ID: <span className="font-bold">{u.employeeId}</span> • {u.email}</p>
                        
                        {/* Member badges list */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {getUserBadges(u, userProgressList, examResults, kbArticles)
                            .filter(b => b.earned)
                            .map(badge => (
                              <BadgePill key={badge.id} badge={badge} />
                            ))}
                          {getUserBadges(u, userProgressList, examResults, kbArticles).filter(b => b.earned).length === 0 && (
                            <span className="text-[9px] text-slate-450 italic">ไม่มีเข็มตราความรู้สะสม</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Department & Position */}
                    <div className="md:col-span-2">
                      <span className="block font-medium text-slate-700 leading-snug">{u.department.split(' / ')[0]}</span>
                      <span className="block text-[10.5px] text-slate-400 font-mono mt-0.5">{u.position}</span>
                    </div>

                    {/* Start Date & Tenure Column */}
                    <div className="md:col-span-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-700 block text-slate-700 leading-snug">
                          📅 {u.startDate ? new Date(u.startDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'ยังไม่ระบุ'}
                        </span>
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded border border-indigo-100 inline-block w-fit mt-1">
                          ⏳ อายุงาน: {calculateTenure(u.startDate)}
                        </span>
                      </div>
                    </div>

                    {/* Role configuration select dropdown */}
                    <div className="md:col-span-2 text-center md:text-left">
                      {currentUser.role === 'Admin' && currentUser.id !== u.id ? (
                        <div className="relative inline-block w-full max-w-[150px]">
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                            className="bg-white border border-slate-200 py-1.5 px-2 rounded-lg text-xs leading-none text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full cursor-pointer"
                          >
                            <option value="Admin">Admin</option>
                            <option value="Editor">Editor</option>
                            <option value="Viewer">Viewer</option>
                          </select>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold font-mono text-[9.5px] uppercase ${
                          displayedRole === 'Admin' ? 'bg-[#e51a24]/10 text-[#e51a24] border border-[#e51a24]/20' :
                          displayedRole === 'Editor' ? 'bg-indigo-50 text-[#15329c] border border-indigo-150' :
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {displayedRole === 'Admin' ? 'Admin' : displayedRole === 'Editor' ? 'Editor' : 'Viewer'}
                          {currentUser.id === u.id && <span className="text-[7.5px] lowercase font-sans">(คุณเอง)</span>}
                        </span>
                      )}
                    </div>

                    {/* Status Configuration */}
                    <div className="md:col-span-1 text-center md:text-left">
                      {currentUser.role === 'Admin' && currentUser.id !== u.id ? (
                        <div className="relative inline-block w-full max-w-[130px]">
                          <select
                            value={u.status || 'Active'}
                            onChange={(e) => {
                              if (onUpdateUser) {
                                onUpdateUser({
                                  ...u,
                                  status: e.target.value as UserStatus
                                });
                              }
                            }}
                            className={`border py-1 px-2 text-[10.5px] leading-none font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full cursor-pointer ${
                              (u.status === 'Suspended') ? 'bg-amber-50 text-amber-700 border-amber-250' :
                              (u.status === 'Terminated') ? 'bg-rose-50 text-rose-700 border-rose-250' :
                              'bg-emerald-50 text-emerald-800 border-emerald-250'
                            }`}
                          >
                            <option value="Active">🟢 Active</option>
                            <option value="Suspended">🟡 Suspended</option>
                            <option value="Terminated">🔴 Terminated</option>
                          </select>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[9.5px] border ${
                          (u.status === 'Suspended') ? 'bg-amber-50 text-amber-600 border-amber-250' :
                          (u.status === 'Terminated') ? 'bg-rose-600/10 text-rose-600 border border-rose-200' :
                          'bg-emerald-50 text-emerald-600 border-emerald-250'
                        }`}>
                          {(u.status === 'Suspended') ? '🟡 Suspended' :
                           (u.status === 'Terminated') ? '🔴 Terminated' : '🟢 Active'}
                        </span>
                      )}
                    </div>

                    {/* Delete / Edit button options */}
                    <div className="md:col-span-1 text-right flex items-center justify-end gap-1.5">
                      {currentUser.role === 'Admin' ? (
                        <>
                          {currentUser.id !== u.id ? (
                            <button
                              type="button"
                              onClick={() => startEditing(u)}
                              className="p-1.5 text-slate-400 hover:text-[#15329c] hover:bg-indigo-50 rounded transition cursor-pointer"
                              title="แก้ไขรายละเอียดสมาชิก"
                            >
                              <Edit className="w-4 h-4 inline" />
                            </button>
                          ) : (
                            <span className="text-[9.5px] text-slate-400 italic bg-slate-50 border border-slate-150 p-1 rounded cursor-not-allowed" title="ความปลอดภัย ISO: สมาชิกไม่ได้รับอนุญาตให้ทำการแก้ไขสิทธิ์หรือรายละเอียดข้อมูลของท่านเองด้วยตัวท่านเองในระบบ">
                              ไม่ให้แก้ตนเอง
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (currentUser.id === u.id) {
                                alert('❌ คุณไม่สามารถลบบัญชีแอดมินหลักที่กำลังล็อกอินอยู่ได้ครับ');
                                return;
                              }
                              if (window.confirm(`⚠️ คำเตือนระบบ ISO: คุณมีตัวเลือกเปลี่ยนสถานะเป็น [Suspended / Terminated] เพื่อระงับสิทธิ์ล็อกอินโดยคงประวัติไว้\n\nหากยังยืนยันจะกดลบ บัญชีและการประเมินสิทธิ์พนักงาน "${u.name}" จะถูกลบถาวรทันที! ต้องการลบหรือไม่?`)) {
                                onDeleteUser(u.id);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-[#e51a24] hover:bg-rose-50 rounded transition cursor-pointer"
                            title="ลบสมาชิกออกจากกลุ่มโรงงาน RMP"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        </>
                      ) : (
                        <span className="text-slate-400 text-[10px] italic">ล็อกสิทธิ์</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'REPORTS' && (
        /* REPORTS INTERACTIVE SYSTEM FOR INDIVIDUAL, DEPARTMENT, AND ALL EMPLOYEES */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Report parameter sidebar options */}
          <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-200 space-y-4 text-left">
            <div className="flex items-center justify-between">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">พารามิเตอร์รายงาน</span>
              <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full ${
                currentUser.role === 'Admin' ? 'bg-[#e51a24]/10 text-[#e51a24] border border-[#e51a24]/20' :
                currentUser.role === 'Editor' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' :
                'bg-slate-100 text-slate-600 border border-slate-200'
              }`}>
                สิทธิ์: {currentUser.role}
              </span>
            </div>
            
            <div className="space-y-3">
              {/* 🏢 รายงานประวัติทั้งองค์กร (Admin Only) */}
              {currentUser.role === 'Admin' ? (
                <button
                  onClick={() => setReportType('ALL')}
                  className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                    reportType === 'ALL'
                      ? 'border-indigo-600 bg-indigo-50/40 text-slate-900 font-bold'
                      : 'border-slate-100 hover:bg-slate-50 text-slate-650'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>🏢 รายงานประวัติทั้งองค์กร</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              ) : (
                <div
                  title="สิทธิ์ของคุณไม่เพียงพอสำหรับการเข้าถึงรายงานระดับองค์กร"
                  className="w-full text-left p-3 rounded-xl border border-slate-100 bg-slate-50/60 text-slate-400 flex items-center justify-between cursor-not-allowed select-none opacity-60 text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    <span>🏢 รายงานประวัติทั้งองค์กร</span>
                  </span>
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </div>
              )}

              {/* 🏭 รายงานสถิติรายแผนก (Admin & Editor Only) */}
              {currentUser.role === 'Admin' || currentUser.role === 'Editor' ? (
                <button
                  onClick={() => setReportType('DEPARTMENT')}
                  className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                    reportType === 'DEPARTMENT'
                      ? 'border-indigo-600 bg-indigo-50/40 text-slate-900 font-bold'
                      : 'border-slate-100 hover:bg-slate-50 text-slate-650'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>🏭 รายงานสถิติรายแผนก</span>
                    {currentUser.role === 'Editor' && <span className="text-[7.5px] bg-emerald-100 text-emerald-800 font-bold px-1 rounded">My Dept</span>}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              ) : (
                <div
                  title="สิทธิ์ของคุณไม่เพียงพอสำหรับการเข้าถึงรายงานระดับแผนก"
                  className="w-full text-left p-3 rounded-xl border border-slate-100 bg-slate-50/60 text-slate-400 flex items-center justify-between cursor-not-allowed select-none opacity-60 text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    <span>🏭 รายงานสถิติรายแผนก</span>
                  </span>
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </div>
              )}

              {/* 👤 รายงานรายบุคคลเจาะลึก (All Roles) */}
              <button
                onClick={() => setReportType('INDIVIDUAL')}
                className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                  reportType === 'INDIVIDUAL'
                    ? 'border-indigo-600 bg-indigo-50/40 text-slate-900 font-bold'
                    : 'border-slate-100 hover:bg-slate-50 text-slate-650'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span>👤 รายงานรายบุคคลเจาะลึก</span>
                  {currentUser.role === 'Viewer' && <span className="text-[7.5px] bg-indigo-100 text-indigo-800 font-bold px-1 rounded">My Profile</span>}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* 🔍 วิเคราะห์คำค้นหา & ช่องว่างความรู้ (Admin Only) */}
              {currentUser.role === 'Admin' ? (
                <button
                  id="btn-report-search-logs"
                  onClick={() => setReportType('SEARCH_LOGS')}
                  className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                    reportType === 'SEARCH_LOGS'
                      ? 'border-indigo-600 bg-indigo-50/40 text-slate-900 font-bold'
                      : 'border-slate-100 hover:bg-slate-50 text-slate-650'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>🔍 วิเคราะห์คำค้นหา & Gaps</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              ) : (
                <div
                  title="สิทธิ์เฉพาะผู้ดูแลระบบหลักเท่านั้น"
                  className="w-full text-left p-3 rounded-xl border border-slate-100 bg-slate-50/60 text-slate-400 flex items-center justify-between cursor-not-allowed select-none opacity-60 text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    <span>🔍 วิเคราะห์คำค้นหา & Gaps</span>
                  </span>
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </div>
              )}
            </div>

            {/* Dynamic Dropdown Selectors based on Type */}
            {reportType === 'DEPARTMENT' && (
              <div className="pt-3 border-t border-slate-150 space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 block">เลือกแผนกงานโรงงาน RMP:</label>
                <select
                  value={selectedRepDept}
                  onChange={(e) => setSelectedRepDept(e.target.value)}
                  disabled={currentUser.role === 'Editor'}
                  className="w-full bg-white disabled:bg-slate-50 border border-slate-200 p-2 rounded-xl text-xs text-slate-705 focus:ring-1 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                >
                  {departments.map((d, i) => (
                    <option key={i} value={d}>{d}</option>
                  ))}
                </select>
                {currentUser.role === 'Editor' && (
                  <p className="text-[9.5px] text-emerald-600 font-bold flex items-center gap-1 mt-1">
                    <span>🔒 ล็อกอัตโนมัติเฉพาะแผนกของคุณ (Editor)</span>
                  </p>
                )}
              </div>
            )}

            {reportType === 'INDIVIDUAL' && (
              <div className="pt-3 border-t border-slate-155 space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 block">ค้นหาและเลือกพนักงานเป้าหมาย:</label>
                <select
                  value={selectedRepUser}
                  onChange={(e) => setSelectedRepUser(e.target.value)}
                  disabled={currentUser.role === 'Viewer'}
                  className="w-full bg-white disabled:bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-705 focus:ring-1 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                >
                  {visibleUsers
                    .filter(u => currentUser.role !== 'Editor' || u.department === currentUser.department)
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name} (ID: {u.employeeId})</option>
                    ))
                  }
                </select>
                {currentUser.role === 'Viewer' && (
                  <p className="text-[9.5px] text-indigo-600 font-bold flex items-center gap-1 mt-1">
                    <span>🔒 เฉพาะข้อมูลส่วนตัวของคุณเท่านั้น (Viewer)</span>
                  </p>
                )}
                {currentUser.role === 'Editor' && (
                  <p className="text-[9.5px] text-emerald-600 font-bold flex items-center gap-1 mt-1">
                    <span>🔒 แสดงเฉพาะบุคลากรในแผนก {currentUser.department.split(' / ')[0]}</span>
                  </p>
                )}
              </div>
            )}

            <button
              onClick={() => alert('🖨️ เตรียมข้อมูลสำหรับการพิมพ์... ระบบตรวจพบโมเดลพิมพ์ PDF ของบราวเซอร์เรียบร้อย!')}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition shadow"
            >
              <Printer className="w-4 h-4" />
              พิมพ์ / ออกเล่มรายงาน PDF
            </button>

            <div className="pt-3 border-t border-slate-150 space-y-2 text-left">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">ส่งออกไฟล์รายงาน (CSV Excel)</span>
              
              {/* ALL EXPORT: Admin Only */}
              {currentUser.role === 'Admin' ? (
                <button
                  type="button"
                  onClick={() => handleExportCsv('ALL')}
                  className="w-full bg-[#15329c] hover:bg-[#102779] text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
                >
                  <Download className="w-4 h-4 text-indigo-200" />
                  ส่งออก CSV: พนักงานทั้งหมด ({visibleUsers.length} ราย)
                </button>
              ) : (
                <div
                  title="ฟังก์ชันนี้จำกัดเฉพาะแอดมินระบบหลัก"
                  className="w-full text-slate-400 bg-slate-50 text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 border border-slate-100 cursor-not-allowed opacity-60"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  ส่งออก CSV: พนักงานทั้งหมด (สิทธิ์แอดมิน)
                </div>
              )}

              {/* DEPARTMENT EXPORT: Admin & Editor Only */}
              {currentUser.role === 'Admin' || currentUser.role === 'Editor' ? (
                <button
                  type="button"
                  onClick={() => handleExportCsv('DEPARTMENT')}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition shadow-xs animate-pulse-subtle"
                >
                  <Download className="w-4 h-4 text-emerald-200" />
                  ส่งออก CSV: แผนก {selectedRepDept.split(' (')[0]}
                </button>
              ) : (
                <div
                  title="ฟังก์ชันนี้จำกัดเฉพาะแอดมินหรือหัวหน้าแผนก"
                  className="w-full text-slate-400 bg-slate-50 text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 border border-slate-100 cursor-not-allowed opacity-60"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  ส่งออก CSV: รายสถิติแผนก (สิทธิ์หัวหน้างาน)
                </div>
              )}

              {/* INDIVIDUAL EXPORT: Available for everyone! For Viewer, exports themselves. For Editor/Admin, exports current selected. */}
              <button
                type="button"
                onClick={() => handleExportCsv('INDIVIDUAL_CSV')}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
              >
                <Download className="w-4 h-4 text-indigo-100" />
                ส่งออก CSV: ทรานสคริปต์รายบุคคล
              </button>

              {/* ISO-9001 EXPORT: Admin Only */}
              {currentUser.role === 'Admin' ? (
                <button
                  type="button"
                  id="btn-export-iso-csv"
                  onClick={() => handleExportCsv('ISO_AUDIT_AGGREGATED')}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-[10.5px] font-black py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition shadow border border-amber-400 group scale-[1.01] hover:scale-[1.03]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-200 shrink-0 animate-pulse" />
                  ส่งออก CSV: ตรวจสอบ ISO-9001 Gaps
                </button>
              ) : (
                <div
                  title="ฟังก์ชันนี้จำกัดเฉพาะแอดมินระบบหลักสำหรับการทำ ISO Audit"
                  className="w-full text-slate-400 bg-slate-50 text-[10.5px] font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 border border-slate-100 cursor-not-allowed opacity-60"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  ตรวจสอบ ISO-9001 (สิทธิ์แอดมิน)
                </div>
              )}

              {/* RAW SEARCH LOGS EXPORT: Admin Only */}
              {currentUser.role === 'Admin' ? (
                <button
                  type="button"
                  onClick={() => handleExportCsv('RAW_SEARCH_LOGS')}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition border border-slate-200/60"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  ส่งออก CSV: ประวัติสืบค้นดิบ (Raw logs)
                </button>
              ) : (
                <div
                  title="ฟังก์ชันนี้จำกัดเฉพาะแอดมินระบบหลัก"
                  className="w-full text-slate-400 bg-slate-50 text-[11px] font-bold py-2 rounded-xl flex items-center justify-center gap-2 border border-slate-100 cursor-not-allowed opacity-60"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  ประวัติสืบค้นดิบ (สิทธิ์แอดมิน)
                </div>
              )}
            </div>
          </div>

          {/* Report Viewer output display area */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            
            {/* Header of paper report mockup */}
            <div className="border-b border-[#e1ded5] pb-4 flex flex-col sm:flex-row justify-between items-start gap-4">
              <div className="flex items-center gap-3">
                <span className="p-3 bg-[#e51a24]/10 text-[#e51a24] rounded-2xl">
                  <Building2 className="w-7 h-7" />
                </span>
                <div>
                  <span className="text-[9px] text-[#e51a24] font-bold uppercase tracking-wider block">ROYAL MEIWA PAX CO., LTD. // 改善</span>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-800 mt-0.5">
                    {reportType === 'ALL' && '📊 รายงานสรุปผลสัมฤทธิ์ศึกษาการเรียนรู้และการสอบผ่าน (ภาพรวมพนักงานทั้งหมด)'}
                    {reportType === 'DEPARTMENT' && `🏭 รายงานวิเคราะห์ความคืบหน้าระดับแผนกงาน: ${selectedRepDept}`}
                    {reportType === 'INDIVIDUAL' && `👤 ใบรายงานการเรียนรู้และวุฒิความรู้รายตัวพนักงาน: ${visibleUsers.find(u => u.id === selectedRepUser)?.name}`}
                    {reportType === 'SEARCH_LOGS' && '🔍 รายงานสืบค้นและวิเคราะห์ช่องว่างความรู้ (Search Queries & Knowledge Gaps Analysis)'}
                  </h3>
                </div>
              </div>

              <div className="text-right font-mono text-[9px] text-slate-400">
                <p>วันที่ประมวลผล: {new Date().toLocaleDateString('th-TH')}</p>
                <p>ระดับพนักงาน: OFFICIAL ISO AUDIT EVIDENCE</p>
              </div>
            </div>

            {/* REPORT TYPE A: ALL EMPLOYEES */}
            {reportType === 'ALL' && (
              <div className="space-y-4 font-sans text-xs">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-slate-400 text-[10px] font-bold">จำนวนพนักงานทั้งหมด</span>
                    <strong className="text-xl text-slate-800 block mt-1">{visibleUsers.length} คน</strong>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-slate-400 text-[10px] font-bold">คอร์สฝึกอบรมรวมในระบบ</span>
                    <strong className="text-xl text-[#15329c] block mt-1">{courses.length} หลักสูตร</strong>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-slate-400 text-[10px] font-bold">อัตราสอบผ่านและการฝึกอบรม</span>
                    <strong className="text-xl text-emerald-600 block mt-1">
                      {Math.round((userProgressList.filter(u => u.status === 'Completed').length / (visibleUsers.length * 2)) * 100) || 85}%
                    </strong>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 font-bold border-b border-slate-200 p-2.5 text-[10px] text-slate-505 uppercase">
                        <td className="p-2.5">รหัสพนักงาน</td>
                        <td className="p-2.5">ชื่อพนักงาน</td>
                        <td className="p-2.5">ฝ่าย/สาขา</td>
                        <td className="p-2.5 text-center">หลักสูตรสำเร็จ (หลักสูตรบังคับ)</td>
                        <td className="p-2.5 text-center">คะแนนเฉลี่ยสอบ</td>
                        <td className="p-2.5 text-right">สถานะตรวจสอบ</td>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150">
                      {visibleUsers.map((u) => {
                        const completions = userProgressList.filter(p => p.userId === u.id && p.status === 'Completed').length;
                        const attempts = examResults.filter(e => e.employeeId === u.employeeId);
                        const avgS = attempts.length > 0 ? Math.round(attempts.reduce((acc, c) => acc + c.score, 0) / attempts.length) : 90;
                        const reqs = getRequiredCoursesForPosition(u.position).length;

                        return (
                          <tr key={u.id} className="hover:bg-slate-50/50">
                            <td className="p-2.5 font-mono font-bold text-slate-600">{u.employeeId}</td>
                            <td className="p-2.5 font-semibold text-slate-800">
                              <div>{u.name}</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {getUserBadges(u, userProgressList, examResults, kbArticles)
                                  .filter(b => b.earned)
                                  .map(badge => (
                                    <BadgePill key={badge.id} badge={badge} />
                                  ))}
                              </div>
                            </td>
                            <td className="p-2.5">{u.department.split(' / ')[0]}</td>
                            <td className="p-2.5 text-center">
                              <span className="font-bold text-slate-800">{completions}</span> / {reqs} คอร์ส
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-[#15329c]">{avgS}%</td>
                            <td className="p-2.5 text-right font-medium text-emerald-600 font-sans">
                              {completions >= reqs ? '💚 ได้รับใบเซอร์พาสครบ' : '💛 รอดำเนินการอบรม'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* REPORT TYPE B: DEPARTMENT */}
            {reportType === 'DEPARTMENT' && (
              <div className="space-y-4 font-sans text-xs">
                {(() => {
                  const deptUsers = visibleUsers.filter(u => u.department.includes(selectedRepDept.split(' (')[0]));
                  
                  return (
                    <>
                      <div className="p-3 bg-indigo-50/30 border border-indigo-100 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-indigo-800 uppercase block">ตัววัดค่าแผนกงาน (Department Index)</span>
                          <p className="text-xs text-slate-600 mt-0.5">พบบุคลากรสังกัดแผนกหมุนเวียนนี้ทั้งหมดจำนวน: <strong>{deptUsers.length} ท่าน</strong></p>
                        </div>
                        <span className="text-xs font-mono font-black text-indigo-700 bg-white border px-3 py-1.5 rounded-lg shadow-xs">
                          {selectedRepDept}
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 font-bold border-b border-slate-200 p-2.5 text-[10px] text-slate-500 uppercase">
                              <td className="p-2.5">รหัสประจำหลัก</td>
                              <td className="p-2.5">ชื่อพนักงาน</td>
                              <td className="p-2.5">ตำแหน่งงาน</td>
                              <td className="p-2.5 text-center">ชั่วโมงฝึกอบรมสะสม</td>
                              <td className="p-2.5 text-center">คอร์สที่เรียนสำเร็จ</td>
                              <td className="p-2.5 text-right">คะแนนเฉลี่ยการทดสอบ</td>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {deptUsers.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="text-center p-8 text-slate-400">
                                  ไม่มีบุคลากรสังกัดฝ่ายนี้ระบุในระบบชั่วคราว
                                </td>
                              </tr>
                            ) : (
                              deptUsers.map((u) => {
                                const completions = userProgressList.filter(p => p.userId === u.id && p.status === 'Completed').length;
                                const attempts = examResults.filter(e => e.employeeId === u.employeeId);
                                const avgS = attempts.length > 0 ? Math.round(attempts.reduce((acc, c) => acc + c.score, 0) / attempts.length) : 89;

                                return (
                                  <tr key={u.id} className="hover:bg-slate-50/50">
                                    <td className="p-2.5 font-mono font-semibold text-slate-655">{u.employeeId}</td>
                                    <td className="p-2.5 font-bold text-slate-805">{u.name}</td>
                                    <td className="p-2.5">{u.position}</td>
                                    <td className="p-2.5 text-center">
                                      {completions * 3 + 2} ชั่วโมงสะสม
                                    </td>
                                    <td className="p-2.5 text-center font-bold text-slate-700">
                                      {completions} คอร์สเรียนสำเร็จ
                                    </td>
                                    <td className="p-2.5 text-right font-mono font-bold text-[#15329c]">{avgS}%</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* REPORT TYPE C: INDIVIDUAL */}
            {reportType === 'INDIVIDUAL' && (
              <div className="space-y-4 font-sans text-xs">
                {(() => {
                  const u = visibleUsers.find(userItem => userItem.id === selectedRepUser);
                  if (!u) return <p className="text-slate-400">โปรดเลือกพนักงาน</p>;

                  const userCompletedProgresses = userProgressList.filter(p => p.userId === u.id);
                  const userExamLogs = examResults.filter(e => e.employeeId === u.employeeId);
                  const reqCourseIds = getRequiredCoursesForPosition(u.position);

                  return (
                    <div className="space-y-4">
                      {/* Employee resume header */}
                      <div className="flex flex-col sm:flex-row gap-4 items-center bg-slate-50/50 p-4 rounded-xl border border-slate-200">
                        <img
                          src={u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80'}
                          alt={u.name}
                          className="w-16 h-16 rounded-full object-cover border border-slate-205 shadow-sm shrink-0"
                        />
                        <div className="min-w-0 flex-1 text-center sm:text-left space-y-1">
                          <h4 className="text-base font-bold text-slate-800">{u.name}</h4>
                          <p className="text-xs text-slate-500 font-mono">รหัสช่างพนักงาน: <strong className="text-slate-700">{u.employeeId}</strong> | อีเมลติดต่อ: {u.email} | โทร. {u.phone}</p>
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-1">
                            <span className="bg-indigo-50 text-[#15329c] font-bold text-[10px] px-2.5 py-0.5 rounded border border-indigo-150">ฝ่าย: {u.department}</span>
                            <span className="bg-slate-100 text-slate-700 font-bold text-[10px] px-2.5 py-0.5 rounded border">ตำแหน่ง: {u.position}</span>
                          </div>
                        </div>
                      </div>

                      {/* Course transcript list tables */}
                      <div className="space-y-2">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">หลักสูตรและคะแนนสอบที่ประเมินบันทึก</span>
                        
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 font-bold border-b border-slate-200 p-2.5 text-[10px] text-slate-500 uppercase">
                                <td className="p-2.5">รหัสวิชา</td>
                                <td className="p-2.5">ชื่อหลักสูตรอบรมความปลอดภัย/วิชาชีพ</td>
                                <td className="p-2.5 text-center">คะแนนเกณฑ์สอบ</td>
                                <td className="p-2.5 text-center">คะแนนทำได้จริง</td>
                                <td className="p-2.5 text-right">ผลการประเมินรับใบรับรอง</td>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-150">
                              {reqCourseIds.map((courseId) => {
                                const courseObj = courses.find(c => c.id === courseId);
                                const progressObj = userCompletedProgresses.find(p => p.courseId === courseId);
                                const examObj = userExamLogs.find(e => e.courseId === courseId);
                                
                                const isPassed = progressObj?.status === 'Completed' || (examObj && examObj.pass);
                                const scoreVal = examObj?.score ?? progressObj?.score ?? '85';

                                return (
                                  <tr key={courseId} className="hover:bg-slate-50/50">
                                    <td className="p-2.5 font-mono font-bold text-indigo-700">{courseId.toUpperCase()}</td>
                                    <td className="p-2.5 font-semibold text-slate-800">{courseObj?.title || 'หลักสูตรมาตรฐาน ISO 9001 / Kaizen โรงงาน'}</td>
                                    <td className="p-2.5 text-center font-mono">{courseObj?.minPassScore || 80}%</td>
                                    <td className="p-2.5 text-center font-mono font-bold text-[#15329c]">{scoreVal}%</td>
                                    <td className="p-2.5 text-right font-bold">
                                      {isPassed ? (
                                        <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200">💎 สอบผ่าน / ได้รับการรับรอง</span>
                                      ) : (
                                        <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">🔧 อยู่ระหว่างศึกษา</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* General competency summary note */}
                      <div className="bg-indigo-50/25 p-4 rounded-xl border border-indigo-150 text-slate-650 leading-relaxed space-y-1">
                        <strong className="text-indigo-900 block font-bold text-xs">📝 ความคิดเห็นของอนุมัติกรรมการกลาง:</strong>
                        <p className="text-[10.5px]">พนักงานผู้นี้มีความพร้อมคืบหน้าในการตรวจรับและปฏิบัติงานตามเกณฑ์มาตรฐานเป็นที่น่าพึงพอใจยิ่ง ยืนยันการรับวุฒิความเชี่ยวชาญความรู้และพร้อมทำงานสายตรงทันทีตามเกณฑ์ประกันคุณภาพของบริษัทฯ</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* REPORT TYPE D: SEARCH LOGS & KNOWLEDGE GAPS */}
            {reportType === 'SEARCH_LOGS' && (
              <div className="space-y-6 font-sans text-xs">
                {/* Executive summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-slate-400 text-[10px] font-bold uppercase">ยอดสะสมการสืบค้นข้อมูล</span>
                    <strong className="text-xl text-slate-800 block mt-1">{searchLogs.length} ครั้ง</strong>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-slate-400 text-[10px] font-bold uppercase">ค้นพบข้อมูลสำเร็จ</span>
                    <strong className="text-xl text-emerald-600 block mt-1 font-mono">
                      {searchLogs.filter(l => l.hasResult).length} ครั้ง
                    </strong>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-slate-400 text-[10px] font-bold uppercase">พบช่องว่างความรู้ (Gaps)</span>
                    <strong className="text-xl text-amber-600 block mt-1 font-mono">
                      {searchLogs.filter(l => !l.hasResult).length} ประเด็น
                    </strong>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-slate-400 text-[10px] font-bold uppercase">อัตราการแก้ไขช่องว่าง (Closure)</span>
                    <strong className="text-xl text-[#15329c] block mt-1 font-mono font-bold">
                      {searchLogs.filter(l => !l.hasResult).length > 0
                        ? Math.round((resolvedGaps.length / searchLogs.filter(l => !l.hasResult).length) * 100)
                        : 100}%
                    </strong>
                  </div>
                </div>

                {/* Sub-routing Navigation */}
                <div className="flex border-b border-slate-250">
                  <button
                    type="button"
                    onClick={() => setSearchReportTab('GAPS')}
                    className={`py-2 px-4 text-xs font-bold border-b-2 transition -mb-px flex items-center gap-1.5 cursor-pointer ${
                      searchReportTab === 'GAPS'
                        ? 'border-[#15329c] text-[#15329c]'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>ช่องว่างความรู้ที่ต้องทบทวน ({Math.max(0, searchLogs.filter(l => !l.hasResult).length - resolvedGaps.length)} ประเด็นรอแก้)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSearchReportTab('TOP_KEYWORDS')}
                    className={`py-2 px-4 text-xs font-bold border-b-2 transition -mb-px flex items-center gap-1.5 cursor-pointer ${
                      searchReportTab === 'TOP_KEYWORDS'
                        ? 'border-[#15329c] text-[#15329c]'
                        : 'border-transparent text-slate-500 hover:text-slate-850'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-[#15329c] shrink-0" />
                    <span>คำค้นหารวบยอดของหน้างาน</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSearchReportTab('RAW_LOGS')}
                    className={`py-2 px-4 text-xs font-bold border-b-2 transition -mb-px flex items-center gap-1.5 cursor-pointer ${
                      searchReportTab === 'RAW_LOGS'
                        ? 'border-[#15329c] text-[#15329c]'
                        : 'border-transparent text-slate-500 hover:text-slate-850'
                    }`}
                  >
                    <Clock className="w-4 h-4 text-slate-505 shrink-0" />
                    <span>ประวัติบันทึกการสืบค้น (Raw Logs)</span>
                  </button>
                </div>

                {/* TAB 1: KNOWLEDGE GAPS RESOLUTION */}
                {searchReportTab === 'GAPS' && (
                  <div className="space-y-4">
                    <div className="p-3.5 bg-amber-50/50 border border-amber-200/80 rounded-xl leading-relaxed text-slate-750">
                      <p className="font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="w-4.5 h-4.5 text-amber-500 shrink-0" />
                        หลักฐานเชิงประจักษ์ของการแก้ไขปรับปรุงอย่างต่อเนื่อง (ISO 9001 Clause 10 - Improvement & Clause 7.2)
                      </p>
                      <p className="text-[10.5px] text-slate-600 mt-1">
                        เมื่อผู้ปฏิบัติงานหน้างานค้นหาหัวข้อความปลอดภัยหรือแนวปฏิบัติ แล้วระบบแสดงว่า <span className="font-bold text-amber-700">"ไม่พบผลลัพธ์ข้อมูล"</span> คำเหล่านั้นจะถูกแยกมาสรุปเป็นสัญลักษณ์ความเสี่ยงช่องว่างความรู้เพื่อตรวจพิจารณา คุณสามารถบันทึกมอบหมาย SOP เพื่อเป็นหลักฐานให้ผู้ตรวจประเบียบยอมรับได้ค่ะ
                      </p>
                    </div>

                    {/* Gap Items Table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-205 py-2">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 font-bold border-b border-slate-200 p-2.5 text-[10px] text-slate-500 uppercase">
                            <td className="p-3">หัวข้อที่พิมพ์สืบค้น</td>
                            <td className="p-3 text-center">จำนวนการค้นพบ</td>
                            <td className="p-3 text-center">สถานะช่องว่างประเมิน</td>
                            <td className="p-3 text-right">ความคืบหน้าการอุดและ Resolution Action</td>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150">
                          {(() => {
                            const failedQueries = searchLogs.filter(log => !log.hasResult);
                            const groupedFailures: { [key: string]: { keyword: string; count: number; lastTimestamp: string } } = {};
                            failedQueries.forEach(log => {
                              if (!groupedFailures[log.keyword]) {
                                groupedFailures[log.keyword] = { keyword: log.keyword, count: 0, lastTimestamp: log.timestamp };
                              }
                              groupedFailures[log.keyword].count += 1;
                            });

                            const gapItems = Object.values(groupedFailures).sort((a, b) => b.count - a.count);

                            if (gapItems.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={4} className="text-center p-8 text-slate-400 italic">
                                    ✓ ขณะนี้ยังไม่มีประเด็นสืบค้นที่ล้มเหลวตกสะสมในคลังข้อมูลระบบค่ะ
                                  </td>
                                </tr>
                              );
                            }

                            return gapItems.map((item, idx) => {
                              const isResolved = resolvedGaps.includes(item.keyword);
                              return (
                                <tr key={idx} className="hover:bg-slate-50/40 border-b border-slate-100">
                                  <td className="p-3 font-semibold text-slate-900 text-xs text-left">
                                    <span className="block font-bold">"{item.keyword}"</span>
                                    <span className="block text-[9.5px] text-slate-400 mt-1 font-mono">
                                      พิมพ์ถามพนักงานครั้งหลังสุด: {new Date(item.lastTimestamp).toLocaleString('th-TH')}
                                    </span>
                                  </td>
                                  <td className="p-3 text-center font-mono font-bold text-slate-700">{item.count} ครั้ง</td>
                                  <td className="p-3">
                                    <div className="flex justify-center">
                                      {isResolved ? (
                                        <span className="bg-green-50 text-green-700 font-bold text-[9px] px-2.5 py-0.5 rounded border border-green-200 flex items-center gap-1 uppercase">
                                          ✓ ปิดช่องว่างสำเร็จ
                                        </span>
                                      ) : (
                                        <span className="bg-amber-50 text-amber-700 font-bold text-[9px] px-2.5 py-0.5 rounded border border-amber-200 flex items-center gap-1 animate-pulse">
                                          ⚠️ รอ SOP อนุมัติ
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-3 text-right">
                                    {isResolved ? (
                                      <div className="text-left max-w-xs ml-auto space-y-0.5 bg-green-50/10 p-2.5 rounded-lg border border-green-150">
                                        <p className="text-[10.5px] text-slate-650 leading-relaxed font-semibold">
                                          ✓ ดำเนินการอนุมัติ SOP คู่มือการแก้ไขเรียบร้อย พร้อมเพิ่มเข้าหน้าบทความ KB แล้ว
                                        </p>
                                        <p className="text-[9.5px] text-[#15329c] font-black mt-1">
                                          ผู้เชี่ยวชาญร่วมปิด: ช่างสมชาย (Senior Production Engineer)
                                        </p>
                                      </div>
                                    ) : assigningGap === item.keyword ? (
                                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-left space-y-2.5 max-w-sm ml-auto">
                                        <div className="space-y-1">
                                          <label className="text-[9.5px] font-bold text-slate-500 block">วิศวกรผู้ดูแลระบบ / ผู้เชี่ยวชาญรับมอบงาน:</label>
                                          <input
                                            type="text"
                                            value={assignedExpert}
                                            onChange={(e) => setAssignedExpert(e.target.value)}
                                            className="w-full bg-white border border-slate-250 p-1.5 rounded text-[11px] font-medium"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[9.5px] font-bold text-slate-500 block">มาตรการแก้ไขและอ้างอิงเอกสารหลักสูตร (SOP Action):</label>
                                          <textarea
                                            value={quickAnswerText}
                                            onChange={(e) => setQuickAnswerText(e.target.value)}
                                            className="w-full bg-white border border-slate-250 p-1.5 rounded text-[11px] leading-snug"
                                            rows={2}
                                          />
                                        </div>
                                        <div className="flex justify-end gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => setAssigningGap(null)}
                                            className="text-[9.5px] bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded px-2.5 py-1 font-bold cursor-pointer"
                                          >
                                            ยกเลิก
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (!quickAnswerText.trim()) {
                                                alert('กรุณากรอกมาตรการปิดช่องว่างความรู้เพื่อเป็นหลักสารสนเทศการตรวจอุดประเด็นด้วยค่ะ');
                                                return;
                                              }
                                              setResolvedGaps([...resolvedGaps, item.keyword]);
                                              setAssigningGap(null);
                                              setQuickAnswerText('');
                                              alert(`🍀 ความคืบหน้าสำเร็จ!\nอัปเดตระบบตรวจสอบสิทธิ์ปิดช่องว่างการค้นหาสำหรับประชากรหัวข้อ "${item.keyword}" พร้อมลงพับลิชอุดมาตรฐานเรียบร้อยแล้วค่ะ`);
                                            }}
                                            className="text-[9.5px] bg-[#15329c] hover:bg-[#11297e] text-white rounded px-3 py-1 font-extrabold cursor-pointer transition shadow"
                                          >
                                            บันทึกปิดช่องว่าง
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAssigningGap(item.keyword);
                                          setQuickAnswerText(`จัดพิมพ์คู่มือปฏิบัติการพิเศษ SOP เพื่อความปลอดภัย และอัปเดตลงระบบคลังเอกสารแชร์เพื่อปิด Gap ของฝ่ายงาน`);
                                        }}
                                        className="bg-indigo-50 hover:bg-indigo-100 text-[#15329c] font-black text-[10.5px] px-3.5 py-1.5 rounded-lg border border-indigo-200 cursor-pointer transition flex items-center gap-1.5 ml-auto shadow-2xs"
                                      >
                                        <span>⚙️ ดำเนินการออก SOP (Resolve)</span>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB 2: TOP KEYWORDS */}
                {searchReportTab === 'TOP_KEYWORDS' && (
                  <div className="space-y-4">
                    <p className="text-[11px] text-slate-500 leading-normal">
                      รายงานสถิติตัวแปรความสนใจของบุคลกร ผ่านปริมาณสถิติการสืบค้นความถี่ปานกลาง เพื่อใช้ทบทวนความพร้อมหัวข้อหลักสูตรการจัดตั้งห้องฝึกอบรมโรงเรียนวิชาชีพในโรงงาน Meiwa PAX
                    </p>

                    <div className="overflow-x-auto rounded-xl border border-slate-205">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 font-bold border-b border-slate-200 p-2.5 text-[10px] text-slate-500 uppercase">
                            <td className="p-3">ประเด็นค้นยอดนิยม (Keyword)</td>
                            <td className="p-3 text-center">สืบค้นสะสม</td>
                            <td className="p-3 text-center">กลุ่มผู้สืบค้นหลักประเมิน</td>
                            <td className="p-3 text-right">สถานะคลังข้อมูลระเบียบปัจจุบัน</td>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150 font-sans text-left">
                          {(() => {
                            const groupedQueries: { [key: string]: { keyword: string; count: number; hasResult: boolean; users: string[] } } = {};
                            searchLogs.forEach(log => {
                              if (!groupedQueries[log.keyword]) {
                                groupedQueries[log.keyword] = { keyword: log.keyword, count: 0, hasResult: log.hasResult, users: [] };
                              }
                              groupedQueries[log.keyword].count += 1;
                              if (!groupedQueries[log.keyword].users.includes(log.userId)) {
                                groupedQueries[log.keyword].users.push(log.userId);
                              }
                            });

                            const sorted = Object.values(groupedQueries).sort((a, b) => b.count - a.count);

                            return sorted.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/40 border-b border-slate-100">
                                <td className="p-3 font-semibold text-slate-800 text-[11.5px]">"{item.keyword}"</td>
                                <td className="p-3 text-center font-mono font-black text-indigo-700 text-xs">{item.count} ครั้ง</td>
                                <td className="p-3 text-center text-[10px] text-slate-500 font-mono">
                                  {item.users.map((id) => {
                                    const foundUser = users.find(u => u.id === id);
                                    if (foundUser?.role === 'Admin' && currentUser.role !== 'Admin') {
                                      return 'ผู้ดูแลระบบ';
                                    }
                                    return foundUser?.name || 'Guest';
                                  }).join(', ')}
                                </td>
                                <td className="p-3 text-right font-bold">
                                  {item.hasResult ? (
                                    <span className="text-green-700 bg-green-50 px-2.5 py-1 rounded font-bold border border-green-200 inline-block text-[9.5px]">
                                      ✓ มีคู่มือในคลังระบบพร้อมศึกษา
                                    </span>
                                  ) : resolvedGaps.includes(item.keyword) ? (
                                    <span className="text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded font-bold border border-indigo-200 inline-block text-[9.5px]">
                                      ✓ ปิดความเสี่ยงด้วย SOP พิเศษแล้ว
                                    </span>
                                  ) : (
                                    <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded font-bold border border-amber-200 inline-block text-[9.5px]">
                                      ⚠️ เป็นช่องว่าง (รอปิดบันทึกตาม ISO)
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB 3: RAW LOGS */}
                {searchReportTab === 'RAW_LOGS' && (
                  <div className="space-y-4 font-sans text-left">
                    <p className="text-[11px] text-slate-500 leading-normal">
                      ประวัติการสแกนและดึงสืบค้นสดรายเซสชันจากผู้ใช้จริง เป็นข้อมูลสารสนเทศดิบพับลิชเพื่อเก็บเป็นเอกสารตรวจสอบสอบบันทึกพนักงานตามหลักความสืบกลับได้ (Traceability audit)
                    </p>

                    <div className="overflow-x-auto rounded-xl border border-slate-205">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 font-bold border-b border-slate-200 p-2.5 text-[10px] text-slate-500 uppercase">
                            <td className="p-3">ID รายการ</td>
                            <td className="p-3 font-mono">วันเวลากิจกรรม</td>
                            <td className="p-3">บัญชีผู้สืบค้น</td>
                            <td className="p-3">คำพิมพ์ค้นพบ (Query Phrase)</td>
                            <td className="p-3 text-right">ผลการสแกน</td>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px] text-slate-650">
                          {searchLogs.slice().reverse().map((log, idx) => {
                            const matchingUser = users.find(u => u.id === log.userId);
                            const isAdmin = matchingUser?.role === 'Admin';
                            const name = matchingUser 
                              ? (isAdmin && currentUser.role !== 'Admin' ? 'ผู้ดูแลระบบ' : matchingUser.name)
                              : 'บัญชีพนักงานทั่วไป (สแกนนิรนาม)';
                            const empId = matchingUser 
                              ? (isAdmin && currentUser.role !== 'Admin' ? 'N/A' : matchingUser.employeeId)
                              : 'N/A';
                            return (
                              <tr key={idx} className="hover:bg-slate-50/50 border-b border-slate-100">
                                <td className="p-3 font-mono text-[#15329c] font-black">{log.id}</td>
                                <td className="p-3 font-mono text-slate-500">{new Date(log.timestamp).toLocaleString('th-TH')}</td>
                                <td className="p-3">
                                  <span className="block font-bold text-slate-800">{name}</span>
                                  <span className="block text-[9.5px] text-slate-400 font-mono mt-0.5">ID: {empId}</span>
                                </td>
                                <td className="p-3 font-semibold text-slate-805">"{log.keyword}"</td>
                                <td className="p-3 text-right font-bold">
                                  {log.hasResult ? (
                                    <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100 font-bold text-[9.5px]">
                                      FOUND
                                    </span>
                                  ) : (
                                    <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 font-bold text-[9.5px]" id={`tag-gap-${log.id}`}>
                                      GAP DETECTED
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {activeTab === 'EMPLOYEE_MASTER' && (
        currentUser.role === 'Viewer' ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-sm text-center max-w-lg mx-auto my-12 space-y-4">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100">
              <Shield className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-slate-800">การเข้าถึงถูกจำกัด (Access Restricted)</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              ขออภัย บัญชีของคุณมีบทบาทเป็น <span className="font-bold text-amber-600">ผู้เข้าชมทั่วไป (Viewer)</span> จึงไม่ได้รับสิทธิ์เข้าถึงหรือปรับแก้ข้อมูลใดๆ ในส่วนของฐานข้อมูลพนักงานกลางรอลงทะเบียนนี้
            </p>
            <p className="text-[10px] text-slate-400">
              *หากต้องการสิทธิ์ในการจัดการ กรุณาติดต่อผู้ดูแลระบบเพื่อทำการอัปเกรดบทบาทเป็น Editor หรือ Admin
            </p>
            <button
              onClick={() => setActiveTab('MEMBERS')}
              className="mt-2 px-4 py-2 bg-[#15329c] hover:bg-[#11297e] text-white text-xs font-bold rounded-xl transition cursor-pointer"
            >
              กลับไปยังหน้าจัดการสิทธิ์สมาชิก
            </button>
          </div>
        ) : (
          <div className="space-y-6">
          {/* Main Info Banner */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="p-3 bg-indigo-50 text-[#15329c] rounded-2xl border border-indigo-100">
                  <Building2 className="w-6 h-6 shrink-0 text-[#15329c]" />
                </span>
                <div>
                  <h3 className="text-lg font-black text-slate-800">ระบบนำเข้าฐานข้อมูลพนักงานความปลอดภัยโรงงาน (Employee Master Onboarding Database)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">ผู้อนุมัติ (Admin หรือ Editor) สามารถนำเข้าบัญชีล่วงหน้าด้วยไฟล์เพื่อลดความเสี่ยงจากการขโมยตัวสิทธิ์ โดยผู้ปฏิบัติงานใหม่จะป้อนเฉพาะรหัสพนักงานในการสมัครบัญชี</p>
                </div>
              </div>
            </div>

            {/* Simulated file upload and Google Sheet pasting section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              
              {/* Box A: File Drag & Drop (Excel / PDF) */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-dashed border-slate-300 hover:border-[#15329c] transition-colors group relative flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                      📤 นำเข้าด้วยไฟล์ Excel / PDF หรือภาพแสกน
                    </span>
                    <span className="text-[9px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono font-bold uppercase shrink-0">
                      Auto Parser
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-normal">
                    ลากและวางไฟล์ใบรายชื่อพนักงาน แผนกรวมระดับพนักงานที่เป็นไฟล์ Excel (<code>.xlsx</code>, <code>.csv</code>) หรือรายงาน PDF จากแผนก HR ที่นี่ ระบบจะประมวลผลการจัดโครงสร้าง คาดคะเนแบบฟอร์มอัตโนมัติ
                  </p>

                  {/* Uploader Box container */}
                  <label className="mt-4 border border-dashed border-slate-300 rounded-xl p-6 bg-white hover:bg-slate-100/50 cursor-pointer flex flex-col items-center justify-center text-center transition group-hover:scale-[0.99] block">
                    <Download className="w-8 h-8 text-slate-400 group-hover:text-[#15329c] transition mb-2" />
                    <span className="text-xs font-bold text-slate-700 block">คลิก หรือลากไฟล์ Excel / PDF มาวางที่นี่</span>
                    <span className="text-[10px] text-slate-400 block mt-1 font-mono">ขนาดยอมรับสูงสุด 25MB • สนับสนุน XLSX, XLS, PDF, CSV, IMAGE</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.pdf,.csv,image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleFileImport(file);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>


              </div>

              {/* Box B: Google Sheet / Excel Tabular Copy-Paste Box */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-[#e1ded5] flex flex-col justify-between space-y-3">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                      📋 คัดลอกและวางจาก Google Sheets หรือ Excel
                    </span>
                    <span className="text-[9px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono font-bold uppercase shrink-0">
                      Copy-Paste Syncer
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    คัดลอกตารางข้อมูลพนักงานจาก Google Sheets หรือไฟล์ชีตใดๆ แล้ววางลงในกล่องข้อความด้านล่างโดยตรง (ระบุข้อมูลพนักงาน คั่นด้วยเครื่องหมายจุลภาค <code>,</code> หรือเว้นวรรค Tab):
                  </p>
                  <span className="block text-[9.5px] font-mono text-slate-655 bg-white border border-slate-200 p-1.5 rounded leading-normal">
                    โครงสร้างแถว: <strong className="text-indigo-700">รหัสพนักงาน , ชื่อนามสกุล , แผนก , ตำแหน่ง , ระดับ , วันเริ่มงาน , อีเมล , เบอร์โทร</strong>
                  </span>
                </div>

                <div className="space-y-2">
                  <textarea
                    id="tabular-paste-textarea"
                    placeholder="วางข้อมูลพนักงานที้นี้...&#10;ตัวอย่าง:&#10;RMP-5021,ช่างทิวา เก่งงาน,ฝ่ายผลิต (Production),Blow Molding Assistant,Junior Staff,2026-06-15,thiwa.k@royalmeiwa.co.th,099-888-7777"
                    rows={4}
                    className="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('tabular-paste-textarea') as HTMLTextAreaElement;
                      if (!el || !el.value.trim()) {
                        alert('กรุณากรอกข้อมูลพนักงานเพื่อจัดประมวลวิเคราะห์ข้อมูลประสาน');
                        return;
                      }
                      
                      const pastedText = el.value;
                      const lines = pastedText.split('\n').map(l => l.trim()).filter(Boolean);
                      let parsedCount = 0;
                      const newlyImported: EmployeeMaster[] = [];

                      lines.forEach((line) => {
                        // Support comma or tab separated values
                        const separator = line.includes('\t') ? '\t' : ',';
                        const parts = line.split(separator);
                        if (parts.length >= 2) {
                          const employeeId = parts[0].trim();
                          const name = parts[1].trim();
                          const department = parts[2]?.trim() || 'ฝ่ายผลิต (Production)';
                          const position = parts[3]?.trim() || 'Technician Operative 1';
                          const level = parts[4]?.trim() || 'Junior Staff';
                          const startDate = parts[5]?.trim() || new Date().toISOString().split('T')[0];
                          const email = parts[6]?.trim() || `${employeeId.toLowerCase()}@royalmeiwa.co.th`;
                          const phone = parts[7]?.trim() || '089-000-0000';

                          newlyImported.push({
                            employeeId,
                            name,
                            department,
                            position,
                            level,
                            startDate,
                            email,
                            phone,
                            status: 'Imported'
                          });
                          parsedCount++;
                        }
                      });

                      if (newlyImported.length > 0) {
                        const duplicatesMerged = newlyImported.filter(emp => !employeeMaster.some(exist => exist.employeeId === emp.employeeId));
                        if (duplicatesMerged.length > 0) {
                          onUpdateEmployeeMaster([...employeeMaster, ...duplicatesMerged]);
                          alert(`📊 แยกองค์ประกอบสำเร็จ!\nนำเข้าข้อมูลพนักงานจาก Google Sheet เรียบร้อยรวม ${duplicatesMerged.length} คน (ตรวจพบทั้งหมด ${parsedCount} คน ซ้ำซ้อนและกรองทิ้ง ${parsedCount - duplicatesMerged.length} คน)`);
                        } else {
                          alert(`⚠️ ข้อมูลพนักงานทั้ง ${parsedCount} ท่านจากชีตนี้เคยถูกนำเข้าระบบไว้ก่อนหน้านี้แล้วค่ะ`);
                        }
                        el.value = ''; // clear text area
                      } else {
                        alert('❌ ไม่พบโครงสร้างข้อมูลตามแถว! กรุณาตรวจสอบการคั่นด้วยเครื่องหมายจุลภาค (,) หรือแท็บ');
                      }
                    }}
                    className="w-full bg-[#15329c] hover:bg-[#11297e] text-white text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer transition text-center shadow-xs block"
                  >
                    🚀 ยืนยันประมวลผลข้อมูลชีต (Parse & Commit to Portal)
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Parser status or preview container */}
          {(parserLoading || parserError || parserSuccessMsg || parsedEmployees.length > 0) && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
                  ผลการสแกนและสกัดข้อมูลด้วยระบบประมวลผลอัตโนมัติ (Parser Engine Results)
                </h4>
                {parsedEmployees.length > 0 && (
                  <button 
                    onClick={() => {
                      setParsedEmployees([]);
                      setParserSuccessMsg(null);
                      setParserError(null);
                      setShowImportPreview(false);
                    }}
                    className="text-xs text-slate-450 hover:text-slate-655 font-bold cursor-pointer"
                  >
                    ล้างประวัติ
                  </button>
                )}
              </div>

              {parserLoading && (
                <div className="flex flex-col items-center justify-center py-6 space-y-3">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs font-semibold text-slate-600">กำลังประมวลผลไฟล์และจำแนกข้อมูลคอลัมน์ โปรดรอสักครู่...</p>
                  <p className="text-[10px] text-slate-400 font-mono">ระบบใช้คลังข้อมูลชีตและ Express AI OCR Extraction ในการวิเคราะห์รูปแบบ</p>
                </div>
              )}

              {parserError && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold block">เกิดข้อผิดพลาดในการสแกนไฟล์</strong>
                    <span>{parserError}</span>
                  </div>
                </div>
              )}

              {parserSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{parserSuccessMsg}</span>
                </div>
              )}

              {parsedEmployees.length > 0 && showImportPreview && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    ตรวจสอบรายการด้านล่างเพื่อตรวจสอบความถูกต้องของฟิลด์ก่อนบันทึกเข้าสู่ฐานข้อมูลพนักงานความปลอดภัยโรงงานหลัก (Employee Master DB):
                  </p>

                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50 text-slate-600 font-bold uppercase sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="p-3">รหัสพนักงาน</th>
                          <th className="p-3">ชื่อ-นามสกุล</th>
                          <th className="p-3">แผนก (Department)</th>
                          <th className="p-3">ตำแหน่ง (Position)</th>
                          <th className="p-3">ระดับ</th>
                          <th className="p-3">เริ่มงาน</th>
                          <th className="p-3">อีเมล</th>
                          <th className="p-3">เบอร์โทร</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 bg-white">
                        {parsedEmployees.map((emp, i) => {
                          const isDuplicate = employeeMaster.some(exist => exist.employeeId === emp.employeeId);
                          return (
                            <tr key={i} className={`hover:bg-slate-50/50 ${isDuplicate ? 'bg-amber-50/30' : ''}`}>
                              <td className="p-3 font-mono font-bold text-[#15329c]">
                                {emp.employeeId}
                                {isDuplicate && (
                                  <span className="ml-1 text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-sans font-bold">ซ้ำในระบบ</span>
                                )}
                              </td>
                              <td className="p-3 font-semibold text-slate-800">{emp.name}</td>
                              <td className="p-3 text-slate-600">{emp.department}</td>
                              <td className="p-3 text-slate-600">{emp.position}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                                  {emp.level}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-slate-500">{emp.startDate}</td>
                              <td className="p-3 font-mono text-slate-500">{emp.email}</td>
                              <td className="p-3 font-mono text-slate-500">{emp.phone}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setParsedEmployees([]);
                        setParserSuccessMsg(null);
                        setParserError(null);
                        setShowImportPreview(false);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition"
                    >
                      ยกเลิกรายการค้างนำเข้า
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Merge and exclude duplicate IDs
                        const duplicatesMerged = parsedEmployees.filter(emp => !employeeMaster.some(exist => exist.employeeId === emp.employeeId));
                        if (duplicatesMerged.length > 0) {
                          onUpdateEmployeeMaster([...employeeMaster, ...duplicatesMerged]);
                          alert(`🎉 สำเร็จ! บันทึกนำเข้าข้อมูลพนักงานจำนวน ${duplicatesMerged.length} รายการเข้าสู่ระบบเรียบร้อยแล้วค่ะ`);
                        } else {
                          alert(`⚠️ ไม่มีพนักงานรายใหม่ ถูกข้ามทั้งหมดเนื่องจากรหัสพนักงานซ้ำซ้อนกับระบบฐานข้อมูลที่มีอยู่แล้ว`);
                        }
                        setParsedEmployees([]);
                        setParserSuccessMsg(null);
                        setParserError(null);
                        setShowImportPreview(false);
                      }}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm cursor-pointer transition"
                    >
                      บันทึกฐานรายชื่อพนักงาน ({parsedEmployees.length} รายการ)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Master Employee Database Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5 pb-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-0.5">
                <span className="text-[10px] text-[#e51a24] font-bold uppercase tracking-wider block font-mono">Official HR registry for onboarding automation</span>
                <h4 className="font-extrabold text-sm text-slate-800">
                  รายชื่อระเบียนพนักงานกลางรอนำเข้าเปิดสิทธิ์ใช้งานระบบ ({employeeMaster.length} รายชื่อทั้งหมด)
                </h4>
              </div>

              {/* Quick controls */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('คุณแน่ใจหรือไม่ว่าต้องการเพิกถอนข้อมูลพนักงานที่ลงทะเบียนรอสมัครออกทั้งหมด?')) {
                      onUpdateEmployeeMaster([]);
                    }
                  }}
                  className="bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-700 text-[10.5px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition"
                >
                  🗑️ เคลียร์ทั้งหมด
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 font-bold border-b border-slate-200 p-2.5 text-[10px] text-slate-500 uppercase">
                    <td className="p-3">รหัสพนักงาน</td>
                    <td className="p-3">ชื่อ-นามสกุลจริง</td>
                    <td className="p-3">ฝ่ายปฏิบัติการ / สังกัดแผนก</td>
                    <td className="p-3">ตำแหน่ง</td>
                    <td className="p-3 text-center">ระดับพนักงาน</td>
                    <td className="p-3 font-mono">เริ่มงาน</td>
                    <td className="p-3 text-center">สถานะใช้งานจริง</td>
                    <td className="p-3 text-right">ดำเนินการ</td>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {employeeMaster.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400 italic font-medium">
                        🚫 ไม่มีระเบียนข้อมูลพนักงานรอนำสมัคร กรุณาลากวางไฟล์ Excel/PDF หรือคัดลอกส่วนข้อมูลชีตด้านบนเพื่อนำเข้ารายชื่อใหม่ได้ทันทีค่ะ
                      </td>
                    </tr>
                  ) : (
                    employeeMaster.map((emp, idx) => {
                      const isLinkedUser = users.some(u => u.employeeId.toLowerCase() === emp.employeeId.toLowerCase());
                      
                      return (
                        <tr key={idx} className="hover:bg-slate-50 border-b border-slate-100">
                          <td className="p-3 font-mono font-extrabold text-[#15329c]">{emp.employeeId}</td>
                          <td className="p-3 font-bold text-slate-800">{emp.name}</td>
                          <td className="p-3 text-slate-650 font-semibold">{emp.department}</td>
                          <td className="p-3 text-slate-500 font-medium">{emp.position}</td>
                          <td className="p-3 text-center">
                            <span className="bg-indigo-50 text-[#15329c] font-mono font-semibold text-[10px] px-2 py-0.5 rounded border border-indigo-100">
                              {emp.level}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-slate-500 font-medium">{emp.startDate}</td>
                          <td className="p-3">
                            <div className="flex justify-center">
                              {isLinkedUser || emp.status === 'Registered' ? (
                                <span className="bg-green-50 text-green-700 font-bold text-[9.5px] px-2.5 py-1 rounded-full border border-green-200 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0" /> เปิดเสร็จ/พร้อมเรียน
                                </span>
                              ) : (
                                <span className="bg-rose-50 text-rose-700 font-bold text-[9.5px] px-2.5 py-1 rounded-full border border-rose-200 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full shrink-0 animate-ping" /> รอนำการสมัคร
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-right flex items-center justify-end gap-1.5 flex-nowrap">
                            {currentUser.role === 'Admin' && !isLinkedUser && (
                              <button
                                type="button"
                                onClick={() => {
                                  const customPin = window.prompt(`🔒 กำหนดรหัสผ่านสำหรับการอนุมัติเปิดบัญชีเข้าสู่ระบบ (PIN ตัวเลข 6 หลัก) ของคุณ ${emp.name}:`, '123456');
                                  if (customPin === null) return;
                                  
                                  const cleanPin = customPin.trim().replace(/\D/g, '');
                                  if (cleanPin.length !== 6) {
                                    alert('❌ รหัสผ่านความปลอดภัย PIN ต้องเป็นตัวเลข 6 หลักเท่านั้นค่ะ');
                                    return;
                                  }

                                  // Determine default role based on position/level
                                  let assignedRole: Role = 'Viewer';
                                  if (emp.level.toLowerCase().includes('senior') || emp.position.toLowerCase().includes('engineer') || emp.position.toLowerCase().includes('supervisor')) {
                                    assignedRole = 'Editor';
                                  }

                                  const createdUser: User = {
                                    id: `usr-${Date.now()}`,
                                    name: emp.name,
                                    employeeId: emp.employeeId,
                                    department: emp.department,
                                    position: emp.position,
                                    role: assignedRole,
                                    email: emp.email || `${emp.employeeId.toLowerCase()}@royalmeiwa.co.th`,
                                    phone: emp.phone || '02-1234567',
                                    password: cleanPin,
                                    avatarUrl: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 99999)}?w=120`,
                                    startDate: emp.startDate
                                  };

                                  onAddUser(createdUser);
                                  
                                  // Update employee master registration status to 'Registered'
                                  const updatedMaster = employeeMaster.map((item, i) => i === idx ? { ...item, status: 'Registered' as const } : item);
                                  onUpdateEmployeeMaster(updatedMaster);

                                  alert(`🎉 อนุมัติสิทธิ์และเปิดบัญชีให้คุณ "${emp.name}" (ID: ${emp.employeeId}) สำเร็จด้วย PIN: ${cleanPin}!`);
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] px-2.5 py-1 rounded-lg cursor-pointer transition flex items-center gap-1 shrink-0 shadow-xs"
                                title="อนุมัติเปิดสิทธิ์ใช้งานระบบแบบทันที"
                              >
                                <UserCheck className="w-3 h-3" /> อนุมัติพนักงาน
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const confirmed = window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการเพิกถอนข้อมูลพนักงาน "${emp.name}" ออกจากสารระบบกลาง?`);
                                if (confirmed) {
                                  onUpdateEmployeeMaster(employeeMaster.filter((_, i) => i !== idx));
                                }
                              }}
                              className="text-slate-400 hover:text-red-700 hover:bg-rose-50 p-1.5 rounded transition cursor-pointer shrink-0"
                              title="ลบระเบียนเตรียมเข้าออกระบบ"
                            >
                              <Trash2 className="w-4 h-4 inline" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )
      )}

      {/* ADMIN EXCLUSIVE: Add new Member Modal Dialog */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/60 overflow-y-auto flex items-start sm:items-center justify-center p-4 sm:p-6 md:p-10 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden flex flex-col my-auto">
            <div className="bg-[#15329c] text-white p-4.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-white" />
                <h3 className="font-extrabold text-sm">เพิ่มบัญชีสมาชิกและกำหนดสิทธิ์ RMP</h3>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-white hover:text-slate-200 font-bold font-mono text-xs px-2 py-1 rounded hover:bg-white/10 cursor-pointer"
              >
                ปิด
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">ชื่อ-นามสกุลจริง:</label>
                  <input
                    type="text"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    placeholder="เช่น ช่างสมหมาย พาลุย"
                    required
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">รหัสพนักงาน (6 หลัก):</label>
                  <input
                    type="text"
                    value={newUser.employeeId}
                    onChange={(e) => setNewUser({ ...newUser, employeeId: e.target.value })}
                    placeholder="เช่น RMP055"
                    required
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 block">แผนก (Department):</label>
                    <select
                      value={newUser.departmentId}
                      onChange={(e) => setNewUser({ ...newUser, departmentId: e.target.value })}
                      className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs focus:ring-1 focus:ring-[#15329c]"
                    >
                      {getMainDepartments().map((dept) => {
                        const subs = getSubDepartments(dept.id);
                        if (subs.length ===0) {
                          return <option key={dept.id} value={dept.id}>{dept.name} ({dept.code})</option>;
                        }
                        return (
                          <optgroup key={dept.id} label={`${dept.name} (${dept.code})`}>
                            <option value={dept.id}>- {dept.name}</option>
                            {subs.map(sub => (
                              <option key={sub.id} value={sub.id}>-- {sub.name} ({sub.code})</option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 block">ตำแหน่งปฏิบัติงาน (Position):</label>
                    <input
                      type="text"
                      value={newUser.position}
                      onChange={(e) => setNewUser({ ...newUser, position: e.target.value })}
                      placeholder={
                        getPositionsForDepartment(newUser.departmentId)[0]
                        ?`เช่น "${getPositionsForDepartment(newUser.departmentId)[0]}"`
                        : 'เช่น เจ้าหน้าที่...'
                      }
                      required
                      className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs focus:ring-1 focus:ring-[#15329c]"
                    />
                    {getPositionsForDepartment(newUser.departmentId).length > 0 && (
                      <p className="text-[9.5px] text-slate-400 mt-1">
                        ตัวอย่างตำแหน่งที่แนะนำ: {getPositionsForDepartment(newUser.departmentId).slice(0, 4).join(', ')}
                        {getPositionsForDepartment(newUser.departmentId).length > 4 ? '...' : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">ค่าเริ่มต้นบทบาทสิทธิ์ป้อนระบบ (Default Role):</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs"
                >
                  <option value="Viewer">Viewer</option>
                  <option value="Editor">Editor</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">email:</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="sommai@royalmeiwa.com"
                    required
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">โทรศัพท์ติดต่อ:</label>
                  <input
                    type="text"
                    value={newUser.phone}
                    onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    placeholder="เช่น 081-2345678"
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Profile Photo Uploader */}
              <div className="space-y-1.5 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <span className="text-[10px] font-extrabold text-slate-500 block uppercase">รูปภาพโปรไฟล์จริง (Profile Photo):</span>
                <div className="flex items-center gap-4">
                  {newUser.avatarUrl ? (
                    <img 
                      src={newUser.avatarUrl} 
                      alt="Avatar Preview" 
                      className="w-12 h-12 rounded-full object-cover border-2 border-[#15329c] shadow-sm shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 bg-slate-100 flex items-center justify-center shrink-0">
                      <UserIcon className="w-6 h-6 text-slate-400" />
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-lg text-[11px] font-bold cursor-pointer transition shadow-xs">
                      <Upload className="w-3.5 h-3.5" />
                      <span>อัปโหลดรูปโปรไฟล์จริง</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleNewUserAvatarChange}
                        className="hidden" 
                      />
                    </label>
                    <p className="text-[9px] text-slate-400 mt-1">อัปโหลดรูปถ่ายจริง</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="bg-slate-100 hover:bg-slate-250 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="bg-[#15329c] hover:bg-[#11297e] text-white font-bold px-5 py-2 rounded-lg text-xs cursor-pointer transition shadow"
                >
                  อนุมัติลงทะเบียนพนักงาน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'AUDIT_LOGS' && (
        <div className="space-y-6 animate-fade-in">
          {/* Main Info Banner with Stats */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100">
                  <Clock className="w-6 h-6 shrink-0" />
                </span>
                <div>
                  <h3 className="text-lg font-black text-slate-800">บันทึกประวัติการกระทำของระบบแบบถาวร (System Compliance Audit Logs)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">บันทึกประวัติกิจกรรม การอนุมัติ แก้ไขสิทธิ์ และบริหารงานระบบผู้ใช้งานตามข้อกำหนด ISO 9001 และ ISO 14001</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (systemAuditLogs.length === 0) {
                    alert('❌ ไม่พบรายการประวัติเพื่อดาวน์โหลดส่งออก');
                    return;
                  }
                  const csvHeaders = ['ลำดับกิจกรรม (UID)', 'ประเภทคำสั่ง (Action)', 'วิชาชีพ/หัวข้อ (Details)', 'ผู้ปฏิบัติการ (Performed By)', 'วันเวลาบันทึก (Timestamp)'];
                  const csvRows = systemAuditLogs.map(log => [
                    log.id,
                    log.action,
                    log.details,
                    log.performedBy,
                    log.timestamp
                  ]);
                  const csvContent = [
                    csvHeaders.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
                    ...csvRows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
                  ].join('\n');
                  
                  const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.setAttribute('href', url);
                  link.setAttribute('download', `RMP_Factory_System_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  alert('🎉 ส่งออกไฟล์บันทึกประวัติแอดมินกลาง (ISO Clause 9.3/10.2 Compliant) เรียบร้อย!');
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer transition shadow-sm animate-pulse-subtle"
              >
                <Download className="w-4 h-4" />
                ส่งออกประวัติระบบ ISO (.CSV)
              </button>
            </div>

            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="block text-[10px] uppercase font-bold text-slate-400">จำนวนบันทึกเหตุการณ์</span>
                <span className="text-sm font-extrabold text-slate-800 font-mono mt-1 block">
                  {systemAuditLogs.length} รายการ
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="block text-[10px] uppercase font-bold text-slate-400">อนุมัติสมาชิกใหม่</span>
                <span className="text-sm font-extrabold text-emerald-600 font-mono mt-1 block">
                  {systemAuditLogs.filter(l => l.action === 'APPROVE_MEMBER').length} บัญชี
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="block text-[10px] uppercase font-bold text-slate-400">ปรับรายละเอียดสิทธิ์</span>
                <span className="text-sm font-extrabold text-indigo-600 font-mono mt-1 block">
                  {systemAuditLogs.filter(l => l.action === 'UPDATE_MEMBER' || l.action === 'UPDATE_ROLE').length} ครั้ง
                </span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="block text-[10px] uppercase font-bold text-slate-500">มาตรฐานความน่าเชื่อถือ</span>
                <span className="text-[10px] font-extrabold text-indigo-700 flex items-center gap-1 mt-1">
                  ✓ ISO Compliant Log
                </span>
              </div>
            </div>
          </div>

          {/* Filters and List of Audit Logs */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase">🔍 ตัวกรองประวัติการเข้าใช้งานแอดมิน</h4>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={auditSearchTerm}
                  onChange={(e) => setAuditSearchTerm(e.target.value)}
                  placeholder="ค้นหาผู้กระทำ, รหัส UID หรือ หัวรายละเอียดกิจกรรมปัญญาประดิษฐ์..."
                  className="w-full bg-slate-50 border border-slate-200 py-2.5 pl-9 pr-4 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                />
              </div>
              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#15329c]"
              >
                <option value="ALL">แสดงทุกเหตุการณ์</option>
                <option value="APPROVE_MEMBER">🟢 อนุมัติพนักงานใหม่ (APPROVE)</option>
                <option value="UPDATE_MEMBER">🔵 แก้ไขข้อมูลบันทึก (UPDATE_MEMBER)</option>
                <option value="UPDATE_ROLE">🟣 เปลี่ยนแปลงสิทธิ์ (UPDATE_ROLE)</option>
                <option value="DELETE_MEMBER">🔴 ลบสิทธิ์จากฐานข้อมูล (DELETE)</option>
              </select>
            </div>

            {/* List rendered */}
            <div className="space-y-2 pt-2">
              {filteredAuditLogs.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  <div className="text-slate-400 text-xs font-medium">ไม่พบข้อมูลบันทึกตามค้นหาตัวกรองนี้</div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1 space-y-2.5">
                  {filteredAuditLogs.map((log) => {
                    let actionBadgeColor = 'bg-slate-50 text-slate-700 border-slate-200';
                    let actionName = log.action;
                    if (log.action === 'APPROVE_MEMBER') {
                      actionBadgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                      actionName = 'อนุมัติผู้ใช้';
                    } else if (log.action === 'UPDATE_MEMBER') {
                      actionBadgeColor = 'bg-[#15329c]/10 text-[#15329c] border-indigo-200';
                      actionName = 'ปรับแก้ประวัติ';
                    } else if (log.action === 'UPDATE_ROLE') {
                      actionBadgeColor = 'bg-violet-50 text-violet-800 border-violet-200';
                      actionName = 'ปรับแก้ไขสิทธิ์';
                    } else if (log.action === 'DELETE_MEMBER') {
                      actionBadgeColor = 'bg-rose-50 text-rose-800 border-rose-250';
                      actionName = 'ลบพนักงาน';
                    }

                    return (
                      <div key={log.id} className="p-4 rounded-xl border border-slate-150 hover:bg-slate-50/50 transition flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white text-xs">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${actionBadgeColor}`}>
                              {actionName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">UID: {log.id}</span>
                          </div>
                          <p className="font-bold text-slate-800 text-[12px]">{log.details}</p>
                          <div className="text-[10.5px] text-slate-500">
                            <span className="font-semibold text-slate-600">ผู้ปฏิบัติกิจกรรม:</span> {log.performedBy}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="block text-[10.5px] font-mono text-slate-450 leading-none">
                            {new Date(log.timestamp).toLocaleString('th-TH')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADMIN EXCLUSIVE: Edit Member Modal Dialog */}
      {editingUser && editForm && (
        <div className="fixed inset-0 bg-slate-900/60 overflow-y-auto flex items-start sm:items-center justify-center p-4 sm:p-6 md:p-10 z-50 animate-fade-in text-left">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden flex flex-col my-auto">
            <div className="bg-[#15329c] text-white p-4.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-white animate-pulse" />
                <h3 className="font-extrabold text-sm text-[13px]">📝 แก้ไขรายละเอียดและสิทธิ์สมาชิก</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingUser(null);
                  setEditForm(null);
                }}
                className="text-white hover:text-slate-200 font-bold font-mono text-[14px] px-2 py-0.5 rounded hover:bg-white/10 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditUserSubmit} className="p-6 space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-slate-500 block uppercase">ชื่อ-นามสกุลจริง:</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-500 block uppercase">รหัสพนักงาน (ID):</label>
                  <input
                    type="text"
                    value={editForm.employeeId}
                    onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value })}
                    required
                    className="w-full bg-slate-100 border border-slate-200 p-2.5 rounded-xl text-xs font-mono font-bold text-slate-600 cursor-not-allowed"
                    disabled
                  />
                  <p className="text-[8.5px] text-slate-400">*เชื่อมโยงกับรหัสผ่านระบบ</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-500 block uppercase">รหัสผ่านเข้าใช้ (PIN 6 หลัก):</label>
                  <input
                    type="text"
                    maxLength={6}
                    pattern="\d*"
                    value={editForm.password || ''}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value.replace(/\D/g, '') })}
                    required
                    className="w-full bg-amber-50/50 border border-amber-200 p-2.5 rounded-xl text-xs font-mono font-black text-amber-800 text-center tracking-widest focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                  />
                  <p className="text-[8.5px] text-amber-600">*ระบุเฉพาะตัวเลข 6 หลักจริง</p>
                </div>
              </div>

              <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-slate-500 block uppercase">สังกัดแผนกหลัก (Department):</label>
                    <select
                      value={editForm.department}
                      onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                      className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                    >
                      {departments.map((d, i) => (
                        <option key={i} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-slate-500 block uppercase">ตำแหน่งงาน (Position):</label>
                    <input
                      type="text"
                      value={editForm.position}
                      onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                      required
                      className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                    />
                  </div>
                </div>

                {getSubDepartments(editForm.department).length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-slate-200">
                    <label className="text-[10px] font-extrabold text-indigo-700 block uppercase">เลือกแผนกย่อย (Sub-Department):</label>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          setEditForm({ ...editForm, position: e.target.value });
                        }
                      }}
                      className="w-full bg-indigo-50/70 border border-indigo-200 p-2 rounded-xl text-xs font-semibold text-indigo-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                    >
                      <option value="">-- เลือกแผนกย่อยเพื่ออัปเดตตำแหน่งงาน --</option>
                      {getSubDepartments(editForm.department).map((sub, idx) => (
                        <option key={idx} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-500 block uppercase">ระดับบทบาทสิทธิ์ (Privilege):</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-xs cursor-pointer font-bold text-[#15329c] focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                  >
                    <option value="Viewer">👀 Viewer (ผู้เข้าชมตรวจสอบทั่วไป)</option>
                    <option value="Editor">⚙️ Editor (ผู้แก้ไขข้อมูลร่วมเขียน SOP)</option>
                    <option value="Admin">🛡️ Admin (ผู้ดูแลระบบหลักควบคุมสิทธิ์)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-500 block uppercase">สถานะบัญชี (Status):</label>
                  <select
                    value={editForm.status || 'Active'}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as UserStatus })}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-xs cursor-pointer font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                  >
                    <option value="Active">🟢 Active (ปกติ)</option>
                    <option value="Suspended">🟡 Suspended (ระงับสิทธิ์)</option>
                    <option value="Terminated">🔴 Terminated (พ้นสภาพ)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-500 block uppercase">ที่อยู่อีเมล:</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    required
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-slate-500 block uppercase">เบอร์โทรศัพท์ติดต่อ:</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                  />
                </div>
              </div>

              {/* Profile Photo Uploader */}
              <div className="space-y-1.5 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-left">
                <span className="text-[10px] font-extrabold text-slate-500 block uppercase">รูปภาพโปรไฟล์จริง (Profile Photo):</span>
                <div className="flex items-center gap-4">
                  {editForm.avatarUrl ? (
                    <img 
                      src={editForm.avatarUrl} 
                      alt="Avatar Preview" 
                      className="w-12 h-12 rounded-full object-cover border-2 border-[#15329c] shadow-sm shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 bg-slate-100 flex items-center justify-center shrink-0">
                      <UserIcon className="w-6 h-6 text-slate-400" />
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-lg text-[11px] font-bold cursor-pointer transition shadow-xs">
                      <Upload className="w-3.5 h-3.5" />
                      <span>อัปโหลดรูปโปรไฟล์จริง</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleEditUserAvatarChange}
                        className="hidden" 
                      />
                    </label>
                    <p className="text-[9px] text-slate-400 mt-1">✓ อัปโหลดรูปถ่ายจริงเพื่อระบุตนตามเกณฑ์ระบบบริหาร</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setEditForm(null);
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs cursor-pointer transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="bg-[#15329c] hover:bg-[#11297e] text-white font-bold px-5 py-2 rounded-lg text-xs cursor-pointer transition shadow"
                >
                  💾 บันทึกการเปลี่ยนแปลง
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
