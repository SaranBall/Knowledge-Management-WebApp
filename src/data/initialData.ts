/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, DocumentItem, Course, KBArticle, Expert, SearchLog, UserCourseProgress, RatingAndComment, ContactRequest, EmployeeMaster } from '../types';

export const INITIAL_USERS: User[] = [
  {
    id: 'u-1',
    name: 'ศรัณย์ โตพิสิฐ (บอล)',
    employeeId: 'SM319',
    departmentId: 'd-it',
    position: 'เจ้าหน้าที่ Programmer',
    role: 'Admin',
    email: 'saran@royalmeiwa.com',
    phone: '02-749-4100 ต่อ 2111',
    avatarUrl: 'https://randomuser.me/api/portraits/men/1.jpg',
    password: '120246',
    startDate: '2026-04-01'
  } as User
];

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
