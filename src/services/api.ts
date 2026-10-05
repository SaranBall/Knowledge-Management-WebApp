import {
  User as UserType,
  DocumentItem,
  Course,
  KBArticle,
  Expert,
  SearchLog,
  UserCourseProgress,
  RatingAndComment,
  ContactRequest,
  CustomResource,
  EmployeeMaster,
  SystemAuditLog,
  UserCompetency,
  UserCertificate,
  KMContributionLog,
  AttendanceLog,
  TrainingSession,
  QuizSubmission,
  QuizSubmitResult,
  EssayGrade,
} from "../types";

// N6: การปิดช่องว่างความรู้ (ตรงกับ SearchResolution ใน server.ts)
export interface SearchResolution {
  id: string;
  keyword: string;
  action: string;
  assignedTo?: string;
  resolvedBy: string; // employeeId
  resolvedByName: string;
  resolvedAt: string;
}

export interface LearningStats {
  scope: "organization" | "self";
  learners: { total: number; withCompletion: number };
  completions: { unique: number };
  exams: {
    attempts: number;
    passed: number;
    averageScore: number | null;
    pendingEssayReview: number;
  };
  trainingMinutes: number | null;
  perCourse: {
    courseId: string;
    courseTitle: string;
    attempts: number;
    passed: number;
  }[];
  certificates: {
    total: number;
    valid: number;
    expiringSoon: number;
    expired: number;
  };
  xp: { totalPoints: number; entries: number };
  competency: { total: number; gaps: number; met: number };
}

let authToken: string | null = localStorage.getItem("rm_auth_token");

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("rm_auth_token", token);
  } else {
    localStorage.removeItem("rm_auth_token");
  }
}
// N9: ให้ App ลงทะเบียน callback เพื่อ logout อัตโนมัติเมื่อ session ใช้ไม่ได้แล้ว
let sessionEndedHandler: ((message: string) => void) | null = null;
export function setUnauthorizedHandler(
  handler: ((message: string) => void) | null,
) {
  sessionEndedHandler = handler;
}

function extractServerMessage(raw: string, fallback: string): string {
  try {
    return JSON.parse(raw).message || fallback;
  } catch {
    return fallback;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const isAuthEntry =
      url.includes("/api/login") || url.includes("/api/register");
    // session ใช้ไม่ได้: token หมดอายุ/ไม่ถูกต้อง/ผู้ใช้ถูกลบ (401) หรือบัญชีถูกระงับ (403 ACCOUNT_DISABLED)
    const isSessionDead =
      !isAuthEntry &&
      (response.status === 401 ||
        (response.status === 403 && errorText.includes('"ACCOUNT_DISABLED"')));
    if (isSessionDead) {
      setAuthToken(null);
      sessionEndedHandler?.(
        extractServerMessage(errorText, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"),
      );
    }
    throw new Error(
      `API Error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return response.json() as Promise<T>;
}

// ดึงข้อความ error ภาษาไทยที่ server ส่งมา (รูปแบบ "API Error: 409 ... - {json}")
// ใช้ regex ที่ทนกรณี statusText ว่าง (HTTP/2) ซึ่ง regex เดิมใน App.tsx จะจับไม่ได้
export function getApiErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : "";
  const match = raw.match(/API Error: \d+.*? - (.*)$/s);
  if (match) {
    try {
      return JSON.parse(match[1]).message || fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export const api = {
  getLearningStats: () => request<LearningStats>("/api/learning/stats"),
  // Login API
  login: (employeeId: string, password: string) =>
    request<{ user: UserType; token: string }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ employeeId, password }),
    }),
  getUsers: () => request<UserType[]>("/api/users"),
  // Real file upload — ผูก Authorization header ให้อัตโนมัติผ่าน request()
  // ต่างจากการยิง fetch() ตรงๆ ที่ไม่มี token แนบไป (บั๊กเดิมใน LearningCenter.tsx)
  uploadFile: (
    filename: string,
    fileData: string, // base64 (ไม่รวม prefix "data:...;base64,")
  ) =>
    request<{ url: string; filename: string }>("/api/upload", {
      method: "POST",
      body: JSON.stringify({ filename, fileData }),
    }),
  // ขอลิงก์ชั่วคราว (มี token ต่อท้าย) สำหรับฝังใน src/href ที่แนบ Authorization header เองไม่ได้
  signFileUrl: (storedFilename: string) =>
    request<{ url: string }>("/api/files/sign", {
      method: "POST",
      body: JSON.stringify({ filename: storedFilename }),
    }),
  createUser: (user: UserType) =>
    request<UserType>("/api/users", {
      method: "POST",
      body: JSON.stringify(user),
    }),
  updateUser: (user: UserType) =>
    request<UserType>(`/api/users/${user.id}`, {
      method: "PUT",
      body: JSON.stringify(user),
    }),
  deleteUser: (id: string) =>
    request<{ success: boolean }>(`/api/users/${id}`, {
      method: "DELETE",
    }),

  // Documents APIs
  register: (user: UserType) =>
    request<{ user: UserType; token: string }>("/api/register", {
      method: "POST",
      body: JSON.stringify(user),
    }),
  getDocuments: () => request<DocumentItem[]>("/api/documents"),
  createDocument: (doc: DocumentItem) =>
    request<DocumentItem>("/api/documents", {
      method: "POST",
      body: JSON.stringify(doc),
    }),
  updateDocument: (doc: DocumentItem) =>
    request<DocumentItem>(`/api/documents/${doc.id}`, {
      method: "PUT",
      body: JSON.stringify(doc),
    }),
  deleteDocument: (id: string) =>
    request<{ success: boolean }>(`/api/documents/${id}`, {
      method: "DELETE",
    }),
  approveDocument: (id: string, approverName: string) =>
    request<DocumentItem>(`/api/documents/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ approverName }),
    }),
  viewDocument: (id: string) =>
    request<DocumentItem>(`/api/documents/${id}/view`, {
      method: "POST",
    }),
  downloadDocument: (id: string) =>
    request<DocumentItem>(`/api/documents/${id}/download`, {
      method: "POST",
    }),

  // Courses APIs
  getCourses: () => request<Course[]>("/api/courses"),
  createCourse: (course: Course) =>
    request<Course>("/api/courses", {
      method: "POST",
      body: JSON.stringify(course),
    }),
  updateCourse: (course: Course) =>
    request<Course>(`/api/courses/${course.id}`, {
      method: "PUT",
      body: JSON.stringify(course),
    }),
  deleteCourse: (id: string) =>
    request<{ success: boolean }>(`/api/courses/${id}`, {
      method: "DELETE",
    }),

  // KB Articles APIs
  getKBArticles: () => request<KBArticle[]>("/api/kb_articles"),
  createKBArticle: (art: KBArticle) =>
    request<KBArticle>("/api/kb_articles", {
      method: "POST",
      body: JSON.stringify(art),
    }),
  updateKBArticle: (art: KBArticle) =>
    request<KBArticle>(`/api/kb_articles/${art.id}`, {
      method: "PUT",
      body: JSON.stringify(art),
    }),
  deleteKBArticle: (id: string) =>
    request<{ success: boolean }>(`/api/kb_articles/${id}`, {
      method: "DELETE",
    }),
  approveKBArticle: (id: string) =>
    request<KBArticle>(`/api/kb_articles/${id}/approve`, {
      method: "POST",
    }),
  likeKBArticle: (id: string) =>
    request<KBArticle>(`/api/kb_articles/${id}/like`, {
      method: "POST",
    }),

  // Experts APIs
  getExperts: () => request<Expert[]>("/api/experts"),
  createExpert: (expert: Expert) =>
    request<Expert>("/api/experts", {
      method: "POST",
      body: JSON.stringify(expert),
    }),
  updateExpert: (expert: Expert) =>
    request<Expert>(`/api/experts/${expert.id}`, {
      method: "PUT",
      body: JSON.stringify(expert),
    }),
  deleteExpert: (id: string) =>
    request<{ success: boolean }>(`/api/experts/${id}`, {
      method: "DELETE",
    }),

  // Ratings APIs
  getRatings: () => request<RatingAndComment[]>("/api/ratings"),
  createRating: (rating: RatingAndComment) =>
    request<RatingAndComment>("/api/ratings", {
      method: "POST",
      body: JSON.stringify(rating),
    }),

  // User Progress APIs
  getUserProgress: () => request<UserCourseProgress[]>("/api/user_progress"),
  updateUserProgress: (progress: UserCourseProgress) =>
    request<UserCourseProgress>("/api/user_progress", {
      method: "POST",
      body: JSON.stringify(progress),
    }),

  // Exam Results APIs
  getExamResults: () => request<any[]>("/api/exam_results"),
  createExamResult: (result: any) =>
    request<any>("/api/exam_results", {
      method: "POST",
      body: JSON.stringify(result),
    }),

  // Quiz submissions (server ตรวจข้อสอบ + ผู้ตรวจให้คะแนน Essay)
  submitQuiz: (courseId: string, answers: { [questionId: string]: string }) =>
    request<QuizSubmitResult>(`/api/courses/${courseId}/submit-quiz`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
  getQuizSubmissions: () => request<QuizSubmission[]>("/api/quiz_submissions"),
  gradeQuizSubmission: (submissionId: string, grades: EssayGrade[]) =>
    request<QuizSubmission>(`/api/quiz_submissions/${submissionId}/grade`, {
      method: "POST",
      body: JSON.stringify({ grades }),
    }),

  // Search Logs APIs
  getSearchLogs: () => request<SearchLog[]>("/api/search_logs"),
  // hasResult คำนวณที่ server — ส่งแค่ keyword
  createSearchLog: (keyword: string) =>
    request<SearchLog>("/api/search_logs", {
      method: "POST",
      body: JSON.stringify({ keyword }),
    }),

  // Search Resolutions APIs (N6) — Admin เท่านั้น
  getSearchResolutions: () =>
    request<SearchResolution[]>("/api/search_resolutions"),
  createSearchResolution: (input: {
    keyword: string;
    action: string;
    assignedTo?: string;
  }) =>
    request<SearchResolution>("/api/search_resolutions", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Contact Requests APIs
  getContactRequests: () => request<ContactRequest[]>("/api/contact_requests"),
  createContactRequest: (req: ContactRequest) =>
    request<ContactRequest>("/api/contact_requests", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  updateContactRequest: (id: string, replyMessage: string) =>
    request<ContactRequest>(`/api/contact_requests/${id}/reply`, {
      method: "POST",
      body: JSON.stringify({ replyMessage }),
    }),

  // Custom Resources APIs
  getCustomResources: () => request<CustomResource[]>("/api/custom_resources"),
  createCustomResource: (res: CustomResource) =>
    request<CustomResource>("/api/custom_resources", {
      method: "POST",
      body: JSON.stringify(res),
    }),
  deleteCustomResource: (id: string) =>
    request<{ success: boolean }>(`/api/custom_resources/${id}`, {
      method: "DELETE",
    }),

  // Competencies APIs
  getCompetencies: () => request<UserCompetency[]>("/api/user_competencies"),
  saveCompetencies: (competencies: UserCompetency[]) =>
    request<UserCompetency[]>("/api/user_competencies", {
      method: "POST",
      body: JSON.stringify({ competencies }),
    }),

  // Certificates APIs
  getCertificates: () => request<UserCertificate[]>("/api/user_certificates"),
  saveCertificates: (certificates: UserCertificate[]) =>
    request<UserCertificate[]>("/api/user_certificates", {
      method: "POST",
      body: JSON.stringify({ certificates }),
    }),

  // KM Contribution Logs APIs
  getContributionLogs: () =>
    request<KMContributionLog[]>("/api/km_contribution_logs"),
  createContributionLog: (log: KMContributionLog) =>
    request<KMContributionLog>("/api/km_contribution_logs", {
      method: "POST",
      body: JSON.stringify(log),
    }),

  // Employee Master APIs
  getEmployeeMaster: () => request<EmployeeMaster[]>("/api/employee_master"),
  updateEmployeeMaster: (employeeMaster: EmployeeMaster[]) =>
    request<EmployeeMaster[]>("/api/employee_master", {
      method: "POST",
      body: JSON.stringify({ employeeMaster }),
    }),

  // Attendance Logs APIs (QR Check-in)
  getAttendanceLogs: () => request<AttendanceLog[]>("/api/attendance_logs"),
  createAttendanceLog: (log: Partial<AttendanceLog>) =>
    request<AttendanceLog>("/api/attendance_logs", {
      method: "POST",
      body: JSON.stringify(log),
    }),
  clearAttendanceLogs: () =>
    request<{ success: boolean; message: string }>("/api/attendance_logs", {
      method: "DELETE",
    }),

  // Training Sessions APIs (คาบอบรมออฟไลน์สำหรับ QR Attendance)
  getTrainingSessions: () =>
    request<TrainingSession[]>("/api/training_sessions"),
  createTrainingSession: (session: {
    courseId: string;
    sessionName: string;
    location?: string;
    instructor?: string;
    startsAt: string;
    endsAt: string;
  }) =>
    request<TrainingSession>("/api/training_sessions", {
      method: "POST",
      body: JSON.stringify(session),
    }),
  deleteTrainingSession: (id: string) =>
    request<{ success: boolean }>(`/api/training_sessions/${id}`, {
      method: "DELETE",
    }),
  checkinToSession: (token: string) =>
    request<{ log: AttendanceLog; alreadyCheckedIn: boolean }>("/api/checkin", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  // System Audit Logs APIs
  getAuditLogs: () => request<SystemAuditLog[]>("/api/system_audit_logs"),
  createAuditLog: (log: SystemAuditLog) =>
    request<SystemAuditLog>("/api/system_audit_logs", {
      method: "POST",
      body: JSON.stringify(log),
    }),
  // AI Semantic RAG Chat API
  chat: (query: string) =>
    request<{
      responseText: string;
      citations?: Array<{
        id: string;
        title: string;
        type: string;
        content: string;
      }>;
    }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ query }),
    }),
};
