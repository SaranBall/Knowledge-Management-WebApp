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
  setAuthToken,
} from "../types";

// Standardized fetch wrapper
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API Error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return response.json() as Promise<T>;
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

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options?.headers || {}),
    },
  });

  if (response.status === 401) {
    // token หมดอายุหรือไม่ถูกต้อง → บังคับ logout
    setAuthToken(null);
    window.location.reload();
    throw new Error("SESSION_EXPIRED");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `API Error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Login API
  login: (employeeId: string, password: string) =>
    request<{ user: UserType; token: string }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ employeeId, password }),
    }),
  getUsers: () => request<UserType[]>("/api/users"),
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

  // Search Logs APIs
  getSearchLogs: () => request<SearchLog[]>("/api/search_logs"),
  createSearchLog: (log: SearchLog) =>
    request<SearchLog>("/api/search_logs", {
      method: "POST",
      body: JSON.stringify(log),
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

  // System Audit Logs APIs
  getAuditLogs: () => request<SystemAuditLog[]>("/api/system_audit_logs"),
  createAuditLog: (log: SystemAuditLog) =>
    request<SystemAuditLog>("/api/system_audit_logs", {
      method: "POST",
      body: JSON.stringify(log),
    }),
};
