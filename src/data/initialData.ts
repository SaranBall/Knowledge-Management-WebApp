/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, DocumentItem, Course, KBArticle, Expert, SearchLog, UserCourseProgress, RatingAndComment, ContactRequest, EmployeeMaster } from '../types';

export const INITIAL_USERS: User[] = [
  {
    id: 'u-1',
    name: 'สิริมา แสงสะอาด (คุณก้อย)',
    employeeId: 'RMP-2041',
    department: 'ผู้บริหาร / แผนกความยั่งยืน',
    position: 'Managing Director / Executive',
    role: 'Admin',
    email: 'sirima.rmp@royalmeiwa.co.th',
    phone: '02-749-4100 ต่อ 101',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
    password: '204100',
    startDate: '2020-03-12'
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

export const INITIAL_EMPLOYEE_MASTER: EmployeeMaster[] = [
  {
    employeeId: 'RMP-2041',
    name: 'สิริมา แสงสะอาด (คุณก้อย)',
    department: 'ผู้บริหาร / แผนกความยั่งยืน',
    position: 'Managing Director / Executive',
    startDate: '2020-03-12',
    level: 'Management',
    email: 'sirima.rmp@royalmeiwa.co.th',
    phone: '02-749-4100 ต่อ 101',
    status: 'Imported'
  }
];
