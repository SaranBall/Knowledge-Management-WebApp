/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, DocumentItem, Course, KBArticle, Expert, SearchLog, UserCourseProgress, RatingAndComment, ContactRequest, EmployeeMaster } from '../types';

// INITIAL_USERS ว่างเปล่าโดยตั้งใจ — ห้าม hardcode credential ของแอดมินไว้ในซอร์สโค้ด
// บัญชีแอดมินคนแรกจะถูก seed ที่ server.ts ตอน startup โดยอ่านค่าจาก
// environment variable (INITIAL_ADMIN_EMPLOYEE_ID / INITIAL_ADMIN_PASSWORD ฯลฯ)
// ดู .env.example และ README.md สำหรับวิธีตั้งค่า
export const INITIAL_USERS: User[] = [];

export const INITIAL_DOCUMENTS: DocumentItem[] = [];

export const INITIAL_COURSES: Course[] = [];

export const INITIAL_KB_ARTICLES: KBArticle[] = [];

export const INITIAL_EXPERTS: Expert[] = [];

export const INITIAL_RATINGS: RatingAndComment[] = [];

export const INITIAL_USER_PROGRESS: UserCourseProgress[] = [];

export const INITIAL_EXAM_RESULTS: any[] = [];

export const INITIAL_SEARCH_LOGS: SearchLog[] = [];

export const INITIAL_CONTACT_REQUESTS: ContactRequest[] = [];

export const INITIAL_EMPLOYEE_MASTER: EmployeeMaster[] = [];