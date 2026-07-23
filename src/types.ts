/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Role = "Admin" | "Editor" | "Viewer";

export type UserStatus = "Active" | "Suspended" | "Terminated";

export interface User {
  id: string;
  name: string;
  employeeId: string;
  departmentId: string; // ← เปลี่ยนจาก department: string
  position: string; // ← คงเดิม แยกขาดจาก department แน่นอน ไม่ให้ sub-dept มาทับอีก
  role: Role;
  avatarUrl?: string;
  email: string;
  phone: string;
  password?: string;
  status?: UserStatus;
  startDate?: string;
}

export interface SystemAuditLog {
  id: string;
  action: string; // e.g., 'APPROVE_MEMBER', 'DELETE_MEMBER', 'UPDATE_MEMBER', 'UPDATE_ROLE', 'SUSPEND_MEMBER', 'TERMINATE_MEMBER'
  details: string; // What was changed/created
  performedBy: string; // Admin info: "Name (EmployeeId)"
  timestamp: string; // ISO-8601/Human format
}

export type DocType = "QP" | "WI" | "FORM";

export interface DocumentItem {
  id: string;
  title: string;
  description: string;
  type: DocType;
  department: string;
  owner: string;
  revision: number;
  effectiveDate: string;
  status: "Draft" | "Pending Approval" | "Published";
  approvedBy?: string;
  approvedAt?: string;
  fileUrl: string; // Mock file location/download link
  fileType: "PDF" | "Excel" | "Word" | "Video";
  exampleText?: string;
  exampleImage?: string;
  exampleVideo?: string;
  realFileUrl?: string; // Local Object URL for active session PDF/Video preview
  parsedExcelSheets?: { [sheetName: string]: any[][] }; // Parsed spreadsheet data
  views: number;
  downloads: number;
  createdAt: string;
  tags?: string[];
}

export interface Lesson {
  id: string;
  title: string;
  content: string; // Markdown or rich text
  durationMinutes: number;
  mediaType?: "PDF" | "Image" | "Slides" | "Video" | "Text";
  mediaUrl?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: "SingleChoice" | "TrueFalse" | "Matching" | "Essay";
  options?: string[]; // For single choice
  pairs?: { left: string; right: string }[]; // For matching
  correctAnswer: string; // For single choice/true false
}

export interface Course {
  id: string;
  title: string;
  description: string;
  type: "Onboarding" | "General";
  targetPositions: string[]; // Positions matching Competency Matrix (e.g. ["QC", "Warehouse Staff"])
  lessons: Lesson[];
  quiz: QuizQuestion[];
  minPassScore: number; // e.g. 80 (%)
  durationHours?: string;
  tags?: string[];
  isApproved?: boolean;
  createdByRole?: string;
}

export interface QuizAttempt {
  id: string;
  userId: string;
  userName: string;
  courseId: string;
  courseTitle: string;
  score: number; // Percentage
  pass: boolean;
  date: string;
  answers: { [key: string]: string }; // QuestionId -> Answer
}

export interface UserCourseProgress {
  id: string;
  userId: string;
  courseId: string;
  status: "Assigned" | "Learning" | "Completed";
  startDate?: string;
  completedDate?: string;
  score?: number;
  attemptsCount: number;
  totalStudyMinutes: number;
}

export type KBType =
  | "Troubleshooting"
  | "Best Practice"
  | "Lesson Learned"
  | "Kaizen"
  | "FAQ";

export interface KBArticle {
  id: string;
  title: string;
  type: KBType;
  problem: string; // ปัญหา
  cause?: string; // สาเหตุ
  solution: string; // วิธีแก้ไข
  prevention?: string; // วิธีป้องกัน
  relatedWIs: string[]; // Code of related WIs (e.g. ["WI-MAINT-001"])
  tags: string[];
  author: string;
  authorTitle: string;
  authorDept: string;
  views: number;
  likes: number;
  status: "Pending" | "Approved";
  createdAt: string;
}

export interface Expert {
  id: string;
  name: string;
  position: string;
  department: string;
  skills: string[]; // List of expertise keywords e.g. ["Injection", "HACCP"]
  experienceYears: number;
  phone: string;
  email: string;
  avatarUrl?: string;
  availability: string;
}

export interface ContactRequest {
  id: string;
  userId: string;
  userName: string;
  userDept: string;
  expertId: string;
  expertName: string;
  topic: string;
  message: string;
  status: "Sent" | "Replied";
  replyMessage?: string;
  createdAt: string;
}

export interface RatingAndComment {
  id: string;
  docOrKBId: string; // ID of QP/WI or KB article
  userId: string;
  userName: string;
  rating: number; // 1-5
  comment: string;
  createdAt: string;
}

export interface SearchLog {
  id: string;
  keyword: string;
  userId: string;
  timestamp: string;
  hasResult: boolean;
}

export interface CustomResource {
  id: string;
  title: string;
  content: string;
  sourceType: "Text" | "URL" | "Manual";
  addedBy: string;
  createdAt: string;
}

export interface EmployeeMaster {
  employeeId: string;
  name: string;
  department: string;
  position: string;
  startDate: string;
  level: string;
  email: string;
  phone: string;
  status: "Imported" | "Registered";
}

// --- Dynamic Competency & Skill Gap Tracking types ---
export interface UserCompetency {
  userId: string;
  skillId: string;
  skillName: string;
  category: string;
  expectedLevel: number; // 1 to 4
  actualLevel: number; // 1 to 4
  description: string;
  linkedCourseId?: string;
  linkedDocId?: string;
}

// --- Certification & Retraining Cycle Alerts types ---
export type CertStatus = "Valid" | "ExpiringSoon" | "Expired";

export interface UserCertificate {
  id: string;
  userId: string;
  employeeId: string;
  title: string;
  type: string; // e.g. "GMP/HACCP", "Forklift Safety", "Quality Inspection"
  courseId: string; // linked course
  issueDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  status: CertStatus;
  daysRemaining: number;
}

// --- Gamification Points and Leaderboard types ---
export interface KMContributionLog {
  id: string;
  userId: string;
  userName: string;
  points: number;
  activityType:
    | "KB_CONTRIBUTION"
    | "KAIZEN_SUBMIT"
    | "COURSE_PERFECT"
    | "COURSE_PASS"
    | "QR_ATTENDANCE"
    | "EXPERT_REPLY";
  description: string;
  timestamp: string;
}

export interface UserKMPoints {
  userId: string;
  userName: string;
  employeeId: string;
  department: string;
  points: number;
  level: number; // 1 to 5 based on points
}
