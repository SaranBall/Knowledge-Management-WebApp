/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Building2, LayoutDashboard, FileText, BookOpen, 
  Award, Heart, Users, Search, LogOut, ChevronRight, CheckCircle, 
  HelpCircle, Shield, Menu, X, Landmark, User, Bot
} from 'lucide-react';

import { 
  Role, User as UserType, DocumentItem, Course, 
  KBArticle, Expert, SearchLog, UserCourseProgress, 
  RatingAndComment, ContactRequest, CustomResource, EmployeeMaster,
  SystemAuditLog, CertStatus
} from './types';

import { api } from './services/api';

// Import initial dataset
import { 
  INITIAL_USERS, INITIAL_DOCUMENTS, INITIAL_COURSES, 
  INITIAL_KB_ARTICLES, INITIAL_EXPERTS, INITIAL_RATINGS, 
  INITIAL_USER_PROGRESS, INITIAL_EXAM_RESULTS, INITIAL_SEARCH_LOGS, 
  INITIAL_CONTACT_REQUESTS, INITIAL_EMPLOYEE_MASTER
} from './data/initialData';

// Import modules
import { RoleSelector } from './components/RoleSelector';
import { Dashboard } from './components/Dashboard';
import { DocumentList } from './components/DocumentList';
import { LearningCenter } from './components/LearningCenter';
import { TechnicalKB } from './components/TechnicalKB';
import { ExpertDirectory } from './components/ExpertDirectory';
import { AIChatBox } from './components/AIChatBox';
import { MemberManagement } from './components/MemberManagement';

// Gamification & Competency Imports
import { 
  getInitialCompetencies, 
  getInitialCertificates, 
  getInitialKMContributionLogs, 
  calculateLeaderboard,
  calculateRemainingDays
} from './utils/gamificationUtils';
import { UserCompetency, UserCertificate, KMContributionLog } from './types';

export default function App() {
  // --- Persistent States ---
  const [users, setUsers] = useState<UserType[]>(INITIAL_USERS);

  const [currentUser, setCurrentUser] = useState<UserType | null>(() => {
    const saved = localStorage.getItem('rm_current_user');
    return saved ? JSON.parse(saved) : INITIAL_USERS[0]; // Default Admin
  });

  const [isLogged, setIsLogged] = useState<boolean>(() => {
    return localStorage.getItem('rm_is_logged') === 'true';
  });

  const [documents, setDocuments] = useState<DocumentItem[]>(INITIAL_DOCUMENTS);
  const [courses, setCourses] = useState<Course[]>(INITIAL_COURSES);
  const [kbArticles, setKbArticles] = useState<KBArticle[]>(INITIAL_KB_ARTICLES);
  const [experts, setExperts] = useState<Expert[]>(INITIAL_EXPERTS);
  const [ratings, setRatings] = useState<RatingAndComment[]>(INITIAL_RATINGS);
  const [userProgress, setUserProgress] = useState<UserCourseProgress[]>(INITIAL_USER_PROGRESS);
  const [examResults, setExamResults] = useState<any[]>(INITIAL_EXAM_RESULTS);
  const [searchLogs, setSearchLogs] = useState<SearchLog[]>(INITIAL_SEARCH_LOGS);
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>(INITIAL_CONTACT_REQUESTS);
  
  const [customResources, setCustomResources] = useState<CustomResource[]>([]);

  // --- Competency, Certification Expire Alerts, and Gamification States ---
  const [userCompetencies, setUserCompetencies] = useState<UserCompetency[]>(() => {
    return INITIAL_USERS.flatMap(u => getInitialCompetencies(u.id, u.department, u.position));
  });

  const [userCertificates, setUserCertificates] = useState<UserCertificate[]>(() => {
    return INITIAL_USERS.flatMap(u => getInitialCertificates(u.id, u.employeeId));
  });

  const [kmContributionLogs, setKmContributionLogs] = useState<KMContributionLog[]>(() => {
    return getInitialKMContributionLogs();
  });

  const [employeeMaster, setEmployeeMaster] = useState<EmployeeMaster[]>(INITIAL_EMPLOYEE_MASTER);

  const [systemAuditLogs, setSystemAuditLogs] = useState<SystemAuditLog[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load all entities from real API on mount
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setIsLoading(true);
        const [
          fetchedUsers, fetchedDocs, fetchedCourses, fetchedKBs, fetchedExperts,
          fetchedRatings, fetchedProgress, fetchedExamResults, fetchedSearchLogs,
          fetchedContactRequests, fetchedCustomRes, fetchedCompetencies,
          fetchedCerts, fetchedContribLogs, fetchedEmpMaster, fetchedAuditLogs
        ] = await Promise.all([
          api.getUsers(), api.getDocuments(), api.getCourses(), api.getKBArticles(),
          api.getExperts(), api.getRatings(), api.getUserProgress(), api.getExamResults(),
          api.getSearchLogs(), api.getContactRequests(), api.getCustomResources(),
          api.getCompetencies(), api.getCertificates(), api.getContributionLogs(),
          api.getEmployeeMaster(), api.getAuditLogs()
        ]);

        if (fetchedUsers) setUsers(fetchedUsers);
        if (fetchedDocs) setDocuments(fetchedDocs);
        if (fetchedCourses) setCourses(fetchedCourses);
        if (fetchedKBs) setKbArticles(fetchedKBs);
        if (fetchedExperts) setExperts(fetchedExperts);
        if (fetchedRatings) setRatings(fetchedRatings);
        if (fetchedProgress) setUserProgress(fetchedProgress);
        if (fetchedExamResults) setExamResults(fetchedExamResults);
        if (fetchedSearchLogs) setSearchLogs(fetchedSearchLogs);
        if (fetchedContactRequests) setContactRequests(fetchedContactRequests);
        if (fetchedCustomRes) setCustomResources(fetchedCustomRes);
        if (fetchedCompetencies) setUserCompetencies(fetchedCompetencies);
        if (fetchedCerts) setUserCertificates(fetchedCerts);
        if (fetchedContribLogs) setKmContributionLogs(fetchedContribLogs);
        if (fetchedEmpMaster) setEmployeeMaster(fetchedEmpMaster);
        if (fetchedAuditLogs) setSystemAuditLogs(fetchedAuditLogs);
      } catch (err) {
        console.error("Failed to load data from server, falling back to static datasets:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  }, []);

  // --- Registration Flow States ---
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [regEmployeeId, setRegEmployeeId] = useState<string>('');
  const [matchedEmployee, setMatchedEmployee] = useState<EmployeeMaster | null>(null);
  const [regError, setRegError] = useState<string>('');
  const [regPassword, setRegPassword] = useState<string>('');

  // --- Manual Login States ---
  const [loginEmployeeId, setLoginEmployeeId] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');

  // Navigation state
  const [activeMenu, setActiveMenu] = useState<string>('Dashboard');

  // Unified global search phrase
  const [globalSearch, setGlobalSearch] = useState<string>('');

  // Mobile menu control
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sync session auth state only
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('rm_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('rm_current_user');
    }
    localStorage.setItem('rm_is_logged', String(isLogged));
  }, [currentUser, isLogged]);

  // --- App Actions ---

  // Handle Login
  const handleLogin = (user: UserType) => {
    setCurrentUser(user);
    setIsLogged(true);
    setMobileMenuOpen(false);
  };

  // Switch simulated identity
  const handleSimulateUserChange = (user: UserType) => {
    setCurrentUser(user);
    // synchronize role privileges
  };

  // RAG Custom Resources Handlers
  const handleAddCustomResource = async (res: CustomResource) => {
    setCustomResources((prev) => [res, ...prev]);
    try {
      await api.createCustomResource(res);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCustomResource = async (id: string) => {
    setCustomResources((prev) => prev.filter((r) => r.id !== id));
    try {
      await api.deleteCustomResource(id);
    } catch (e) {
      console.error(e);
    }
  };

  // Member Management Handlers with Compliance Audit Logs & Lifecycle support
  const addAuditLog = async (action: string, details: string) => {
    const adminDetail = currentUser ? `${currentUser.name} (${currentUser.employeeId})` : 'ระบบอัตโนมัติ RMP';
    const newLog: SystemAuditLog = {
      id: `log-${Date.now()}`,
      action,
      details,
      performedBy: adminDetail,
      timestamp: new Date().toISOString()
    };
    setSystemAuditLogs(prev => [newLog, ...prev]);
    try {
      await api.createAuditLog(newLog);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddUser = async (user: UserType) => {
    const newUser = { ...user, status: user.status || 'Active' };
    setUsers((prev) => [...prev, newUser]);
    addAuditLog('APPROVE_MEMBER', `อนุมัติพนักงานใหม่และให้สิทธิ์เข้าใช้ระบบ: ${user.name} (${user.employeeId}) แผนก ${user.department} สิทธิ์ ${user.role}`);
    try {
      await api.createUser(newUser);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateUser = async (updatedUsr: UserType) => {
    // Find previous status & role to log modifications cleanly
    const prevUsr = users.find(u => u.id === updatedUsr.id);
    const changes: string[] = [];
    if (prevUsr) {
      if (prevUsr.name !== updatedUsr.name) changes.push(`ชื่อ: ${prevUsr.name} -> ${updatedUsr.name}`);
      if (prevUsr.role !== updatedUsr.role) changes.push(`สิทธิ์: ${prevUsr.role} -> ${updatedUsr.role}`);
      if (prevUsr.department !== updatedUsr.department) changes.push(`แผนก: ${prevUsr.department} -> ${updatedUsr.department}`);
      if (prevUsr.position !== updatedUsr.position) changes.push(`ตำแหน่ง: ${prevUsr.position} -> ${updatedUsr.position}`);
      if (prevUsr.status !== updatedUsr.status) changes.push(`สถานะ: ${prevUsr.status || 'Active'} -> ${updatedUsr.status || 'Active'}`);
    }
    const changeDesc = changes.length > 0 ? changes.join(', ') : 'แก้ไขรหัสผ่าน PIN หรือเบอร์ติดต่อ';

    setUsers((prev) =>
      prev.map((u) => (u.id === updatedUsr.id ? { ...u, ...updatedUsr } : u))
    );
    // Sync current session details on identical ID
    if (currentUser && currentUser.id === updatedUsr.id) {
      setCurrentUser({ ...currentUser, ...updatedUsr });
    }
    addAuditLog('UPDATE_MEMBER', `แก้ไขประวัติสมาชิก: ${updatedUsr.name} (${updatedUsr.employeeId}) [${changeDesc}]`);
    try {
      await api.updateUser(updatedUsr);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateUserRole = async (id: string, role: Role) => {
    const usr = users.find(u => u.id === id);
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, role } : u))
    );
    // Sync current session role on identical ID
    if (currentUser && currentUser.id === id) {
      setCurrentUser((prev) => (prev ? { ...prev, role } : null));
    }
    if (usr) {
      addAuditLog('UPDATE_ROLE', `เปลี่ยนสิทธิ์ผู้ใช้: ${usr.name} (${usr.employeeId}) -> ${role}`);
      try {
        await api.updateUser({ ...usr, role });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDeleteUser = async (id: string) => {
    const usr = users.find(u => u.id === id);
    setUsers((prev) => prev.filter((u) => u.id !== id));
    if (usr) {
      addAuditLog('DELETE_MEMBER', `เพิกถอนและลบบัญชีออกจากระบบถาวร: ${usr.name} (${usr.employeeId})`);
      try {
        await api.deleteUser(id);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Add search log (on query)
  const handleLogSearch = async (keyword: string, hasResult: boolean) => {
    if (!currentUser || !keyword.trim()) return;
    const newLog: SearchLog = {
      id: `sl-${Date.now()}`,
      keyword,
      userId: currentUser.id,
      timestamp: new Date().toISOString(),
      hasResult,
    };
    setSearchLogs((prev) => [newLog, ...prev]);
    try {
      await api.createSearchLog(newLog);
    } catch (e) {
      console.error(e);
    }
  };

  // Document Control center: Add document draft
  const handleAddDocument = async (newDoc: DocumentItem) => {
    setDocuments((prev) => [newDoc, ...prev]);
    try {
      await api.createDocument(newDoc);
    } catch (e) {
      console.error(e);
    }
  };

  // Document Control center: Approve draft
  const handleApproveDocument = async (id: string, approverName: string) => {
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === id
          ? {
              ...doc,
              status: 'Published',
              approvedBy: approverName,
              approvedAt: new Date().toISOString(),
            }
          : doc
      )
    );
    try {
      await api.approveDocument(id, approverName);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateDocument = async (updatedDoc: DocumentItem) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === updatedDoc.id ? updatedDoc : doc))
    );
    try {
      await api.updateDocument(updatedDoc);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    try {
      await api.deleteDocument(id);
    } catch (e) {
      console.error(e);
    }
  };

  // Document feedback ratings & reviews
  const handleAddRating = async (docOrKBId: string, rating: number, comment: string) => {
    if (!currentUser) return;
    const newRating: RatingAndComment = {
      id: `r-${Date.now()}`,
      docOrKBId,
      userId: currentUser.id,
      userName: currentUser.name,
      rating,
      comment,
      createdAt: new Date().toISOString(),
    };
    setRatings((prev) => [newRating, ...prev]);
    try {
      await api.createRating(newRating);
    } catch (e) {
      console.error(e);
    }
  };

  const awardPoints = async (userId: string, activityType: KMContributionLog['activityType'], points: number, description: string) => {
    const matchedUser = users.find(u => u.id === userId);
    const userName = matchedUser ? matchedUser.name : 'Unknown User';

    const newLog: KMContributionLog = {
      id: `km-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId,
      userName,
      points,
      activityType,
      description,
      timestamp: new Date().toISOString()
    };
    setKmContributionLogs((prev) => [newLog, ...prev]);
    try {
      await api.createContributionLog(newLog);
    } catch (e) {
      console.error(e);
    }
  };

  // Onboarding & LMS: Register user exam score
  const handleAddExamResult = async (result: any) => {
    setExamResults((prev) => [result, ...prev]);
    try {
      await api.createExamResult(result);
    } catch (e) {
      console.error(e);
    }

    // Check if result is perfect score or passing to trigger Gamification & Certificate Renewal
    if (result.pass && currentUser && result.employeeId === currentUser.employeeId) {
      const isPerfect = result.score === 105 || result.score === 100;
      const pts = isPerfect ? 30 : 20;
      const actType = isPerfect ? 'COURSE_PERFECT' : 'COURSE_PASS';
      const desc = isPerfect 
        ? `อบรมผ่านหลักสูตร "${result.courseTitle}" ด้วยคะแนนเต็ม 100% ประสบผลสำเร็จระดับยอดเยี่ยม!` 
        : `สอบผ่านประเมินความรู้คุณภาพคอร์ส "${result.courseTitle}" เกรด ${result.score}%`;
      
      awardPoints(currentUser.id, actType, pts, desc);

      // --- CRITICAL INTEGRATION: Also update the EXPIRY of certificates associated with this course ---
      const todayStr = new Date().toISOString().split('T')[0];
      const nextYearStr = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0];

      const updatedCerts = userCertificates.map(cert => {
        if (cert.userId === currentUser.id && cert.courseId === result.courseId) {
          return {
            ...cert,
            issueDate: todayStr,
            expiryDate: nextYearStr,
            status: 'Valid' as CertStatus,
            daysRemaining: 365
          };
        }
        return cert;
      });

      setUserCertificates(updatedCerts);
      try {
        await api.saveCertificates(updatedCerts);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Onboarding & LMS: Update learning status
  const handleUpdateUserProgress = async (
    userId: string,
    courseId: string,
    status: 'Learning' | 'Completed',
    score?: number
  ) => {
    let updatedProg: UserCourseProgress | null = null;
    setUserProgress((prev) => {
      const idx = prev.findIndex((p) => p.userId === userId && p.courseId === courseId);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          status,
          score: score !== undefined ? score : copy[idx].score,
          completedDate: status === 'Completed' ? new Date().toISOString() : copy[idx].completedDate,
          attemptsCount: copy[idx].attemptsCount + (status === 'Completed' ? 1 : 0),
        };
        updatedProg = copy[idx];
        return copy;
      } else {
        const newProg: UserCourseProgress = {
          id: `prog-${Date.now()}`,
          userId,
          courseId,
          status,
          score,
          startDate: new Date().toISOString(),
          completedDate: status === 'Completed' ? new Date().toISOString() : undefined,
          attemptsCount: 1,
          totalStudyMinutes: 45,
        };
        updatedProg = newProg;
        return [...prev, newProg];
      }
    });

    if (updatedProg) {
      try {
        await api.updateUserProgress(updatedProg);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Technical KB: Create article draft (by Editor)
  const handleAddKBArticle = async (newArticle: KBArticle) => {
    setKbArticles((prev) => [newArticle, ...prev]);
    try {
      await api.createKBArticle(newArticle);
    } catch (e) {
      console.error(e);
    }
  };

  // Technical KB: Approve draft (by Admin)
  const handleApproveKB = async (id: string) => {
    setKbArticles((prev) =>
      prev.map((art) => (art.id === id ? { ...art, status: 'Approved' } : art))
    );
    try {
      await api.approveKBArticle(id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLikeKB = async (id: string) => {
    setKbArticles((prev) =>
      prev.map((art) => (art.id === id ? { ...art, likes: art.likes + 1 } : art))
    );
    try {
      await api.likeKBArticle(id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateKBArticle = async (updatedArt: KBArticle) => {
    setKbArticles((prev) =>
      prev.map((art) => (art.id === updatedArt.id ? updatedArt : art))
    );
    try {
      await api.updateKBArticle(updatedArt);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteKBArticle = async (id: string) => {
    setKbArticles((prev) => prev.filter((art) => art.id !== id));
    try {
      await api.deleteKBArticle(id);
    } catch (e) {
      console.error(e);
    }
  };

  // Onboarding & LMS: Course CRUD
  const handleAddCourse = async (newCourse: Course) => {
    setCourses((prev) => [newCourse, ...prev]);
    try {
      await api.createCourse(newCourse);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateCourse = async (updatedCourse: Course) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === updatedCourse.id ? updatedCourse : c))
    );
    try {
      await api.updateCourse(updatedCourse);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCourse = async (id: string) => {
    setCourses((prev) => prev.filter((c) => c.id !== id));
    try {
      await api.deleteCourse(id);
    } catch (e) {
      console.error(e);
    }
  };

  // Expert Directory: CRUD
  const handleAddExpert = async (newExpert: Expert) => {
    setExperts((prev) => [newExpert, ...prev]);
    try {
      await api.createExpert(newExpert);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateExpert = async (updatedExpert: Expert) => {
    setExperts((prev) =>
      prev.map((exp) => (exp.id === updatedExpert.id ? updatedExpert : exp))
    );
    try {
      await api.updateExpert(updatedExpert);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteExpert = async (id: string) => {
    setExperts((prev) => prev.filter((exp) => exp.id !== id));
    try {
      await api.deleteExpert(id);
    } catch (e) {
      console.error(e);
    }
  };

  // Expert Directory: Submit inquiry
  const handleAddContactRequest = async (newReq: ContactRequest) => {
    setContactRequests((prev) => [newReq, ...prev]);
    try {
      await api.createContactRequest(newReq);
    } catch (e) {
      console.error(e);
    }
  };

  // Expert Directory: Mock reply
  const handleAddContactReply = async (reqId: string, replyText: string) => {
    setContactRequests((prev) =>
      prev.map((req) =>
        req.id === reqId ? { ...req, status: 'Replied', replyMessage: replyText } : req
      )
    );
    try {
      await api.updateContactRequest(reqId, replyText);
    } catch (e) {
      console.error(e);
    }
  };

  // Gap Analysis Trigger: Prefill technical article title
  const handleTriggerGapFill = (keyword: string) => {
    // Navigate to Technical KB with that query as search, & open adding drawer
    setActiveMenu('Technical Knowledge Base');
    setGlobalSearch(keyword);
  };

  // Global search trigger
  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalSearch.trim()) return;

    // Check if what they searched matches any articles
    const keyword = globalSearch.toLowerCase();
    
    // Log query search for Executive GAP Analysis
    const hasMatch =
      documents.some((d) => d.title.toLowerCase().includes(keyword)) ||
      kbArticles.some((a) => a.title.toLowerCase().includes(keyword) && a.status === 'Approved');

    handleLogSearch(globalSearch, hasMatch);

    // Redirect user to Technical KB to witness the multi-match dashboard
    setActiveMenu('Technical Knowledge Base');
  };

  // Registration Flow Event Handlers
  const handleVerifyEmployeeId = (searchId: string) => {
    setRegError('');
    setMatchedEmployee(null);

    const cleanId = searchId.trim();
    if (!cleanId) {
      setRegError('กรุณากรอกรหัสพนักงานของคุณ');
      return;
    }

    // 1. Look up in employeeMaster
    const match = employeeMaster.find(e => e.employeeId.toLowerCase() === cleanId.toLowerCase());
    
    if (!match) {
      setRegError(`❌ ไม่พบรหัสพนักงาน "${cleanId}" ในฐานข้อมูลระเบียนระบบ! กรุณาแจ้งแอดมินหรือผู้ควบคุมดูแลให้อัปโหลดไฟล์ Excel/PDF หรือกรอกเข้าระบบสมาชิกก่อน`);
      return;
    }

    // 2. Check if already exists in registered users
    const alreadyRegistered = users.some(u => u.employeeId.toLowerCase() === cleanId.toLowerCase());
    if (alreadyRegistered) {
      setRegError(`⚠️ รหัสพนักงาน "${cleanId}" นี้เคยได้ลงทะเบียนเปิดใช้งานไปเรียบร้อยแล้ว! สามารถสลับบัญชีเพื่อเข้าเรียนหลักสูตรได้ทันที`);
      return;
    }

    // Success
    setMatchedEmployee(match);
  };

  const handleConfirmRegistration = async () => {
    if (!matchedEmployee) return;

    // Check once more to be safe
    const alreadyRegistered = users.some(u => u.employeeId === matchedEmployee.employeeId);
    if (alreadyRegistered) {
      alert('รหัสพนักงานนี้ได้รับการลงทะเบียนแล้ว');
      return;
    }

    // Validate 6-digit numeric PIN password
    const cleanPass = regPassword.trim();
    if (!cleanPass) {
      setRegError('⚠️ กรุณารองรับความปลอดภัยโดยกำหนดรหัสผ่าน PIN ตัวเลข 6 หลัก');
      return;
    }
    if (cleanPass.length !== 6 || !/^\d+$/.test(cleanPass)) {
      setRegError('⚠️ รหัสผ่าน PIN ต้องเป็นตัวเลข 6 หลักเพื่อความปลอดภัย');
      return;
    }

    // Determine default role based on position/level
    let assignedRole: Role = 'Viewer';
    if (matchedEmployee.level.toLowerCase().includes('senior') || matchedEmployee.position.toLowerCase().includes('engineer') || matchedEmployee.position.toLowerCase().includes('supervisor')) {
      assignedRole = 'Editor'; // Give Editor privileges to Supervisors or Senior Engineers
    }

    const newUserObj: UserType = {
      id: `usr-${Date.now()}`,
      name: matchedEmployee.name,
      employeeId: matchedEmployee.employeeId,
      department: matchedEmployee.department,
      position: matchedEmployee.position,
      role: assignedRole,
      email: matchedEmployee.email,
      phone: matchedEmployee.phone,
      password: cleanPass,
      avatarUrl: `https://images.unsplash.com/photo-1535713875002?w=150`,
      startDate: matchedEmployee.startDate || new Date().toISOString().split('T')[0]
    };

    // Update global users state
    setUsers((prev) => [...prev, newUserObj]);

    // Provision competencies & certificates automatically upon register
    const newComp = getInitialCompetencies(newUserObj.id, newUserObj.department, newUserObj.position);
    setUserCompetencies(prev => [...prev, ...newComp]);

    const newCerts = getInitialCertificates(newUserObj.id, newUserObj.employeeId);
    setUserCertificates(prev => [...prev, ...newCerts]);

    // Update employee master registration status
    const updatedEmpMaster = employeeMaster.map(emp => emp.employeeId === matchedEmployee.employeeId ? { ...emp, status: 'Registered' as const } : emp);
    setEmployeeMaster(updatedEmpMaster);

    // Persist registration details to backend REST API
    try {
      await api.createUser(newUserObj);
      await api.saveCompetencies(newComp);
      await api.saveCertificates(newCerts);
      await api.updateEmployeeMaster(updatedEmpMaster);
    } catch (e) {
      console.error("Failed to persist registration details to server:", e);
    }

    // Auto login
    setCurrentUser(newUserObj);
    setIsLogged(true);

    // Reset registration screen
    setIsRegistering(false);
    setRegEmployeeId('');
    setRegPassword('');
    setMatchedEmployee(null);

    alert(`🎉 ยินดีต้อนรับคุณ ${matchedEmployee.name} ลงทะเบียนและเข้าสู่ระบบสำเร็จในบทบาทสิทธิ์ ${assignedRole === 'Editor' ? 'Editor (ผู้เขียนข้อมูล)' : 'Viewer (ผู้เข้าชมทั่วไป)'}!`);
  };

  // Manual login with Employee ID & 6-Digit Password PIN
  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const trimmedId = loginEmployeeId.trim();
    const trimmedPass = loginPassword.trim();

    if (!trimmedId) {
      setLoginError('กรุณากรอกรหัสพนักงาน');
      return;
    }
    if (!trimmedPass) {
      setLoginError('กรุณากรอกรหัสผ่าน 6 หลัก');
      return;
    }
    if (trimmedPass.length !== 6 || !/^\d+$/.test(trimmedPass)) {
      setLoginError('รหัสผ่าน PIN ความปลอดภัย ต้องประกอบด้วยตัวเลข 6 หลัก');
      return;
    }

    const user = users.find(u => u.employeeId.toLowerCase() === trimmedId.toLowerCase());
    if (!user) {
      setLoginError('ไม่พบรหัสพนักงานนี้ในระเบียนผู้ใช้งาน กรุณาลงทะเบียนพนักงานก่อนเข้าใช้');
      return;
    }

    // Check life-cycle status constraints
    if (user.status === 'Suspended') {
      setLoginError('❌ บัญชีผู้ใช้นี้ถูกระงับสิทธิ์ชั่วคราว (Suspended) โปรดติดต่อแผนกสารสนเทศหรือแอดมิน');
      return;
    }
    if (user.status === 'Terminated') {
      setLoginError('❌ บัญชีผู้ใช้นี้ถูกยกเลิกการใช้งานประวัติสมาชิกเนื่องจากพ้นสภาพ (Terminated) เพื่อการตรวจสอบย้อนหลัง');
      return;
    }

    // Validate Password PIN
    const requiredPassword = user.password || '123456';
    if (trimmedPass !== requiredPassword) {
      setLoginError('รหัสผ่าน PIN 6 หลัก ไม่ถูกต้อง กรุณากรอกใหม่อีกครั้ง');
      return;
    }

    // Logic for successful manual login
    setCurrentUser(user);
    setIsLogged(true);
    setLoginEmployeeId('');
    setLoginPassword('');
    setLoginError('');
    setMobileMenuOpen(false);
  };

  // Logout/Switch simulation
  const handleLogout = () => {
    setIsLogged(false);
    setCurrentUser(null);
  };

  // --- RENDERING CONFIGS ---
  const menuList = [
    { id: 'Dashboard', label: 'Dashboard & Analytics', icon: LayoutDashboard },
    { id: 'Document Control', label: 'Document Control Center', icon: FileText, sub: 'QP, WI, Forms' },
    { id: 'Learning & Certification', label: 'Learning & Certification', icon: Award, sub: 'ปฐมนิเทศ คอร์สพัฒนา & ใบเซอร์ฯ' },
    { id: 'Technical Knowledge Base', label: 'Technical Knowledge Base', icon: Heart, sub: 'คลังสมองช่างเทคนิค' },
    { id: 'Expert Directory', label: 'Expert Directory', icon: Users, sub: 'ด่วน หาผู้เชี่ยวชาญถาม' },
    { id: 'AI Knowledge Assistant', label: 'AI Knowledge Assistant (RAG)', icon: Bot, sub: 'ระบบสืบค้นคู่มืออัจฉริยะ' },
    { id: 'Member Management', label: 'Member & Reports Control', icon: Shield, sub: 'จัดการสิทธิ์และออกรายงาน' }
  ];

  return (
    <div className="min-h-screen bg-[#f0f4fa] font-sans flex flex-col text-[#1e293b] selection:bg-[#e51a24] selection:text-white">
      
      {/* 1. Global simulated role toolbar */}
      {isLogged && currentUser && (
        <RoleSelector 
          users={users} 
          currentUser={currentUser} 
          onUserChange={handleSimulateUserChange} 
        />
      )}

      {/* Login Page / 1-Click login portal */}
      {!isLogged ? (
        <div id="login-portal" className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-tr from-[#f5f4ed] via-[#fcfbf9] to-[#ffffff] text-slate-800">
          <div className="max-w-md w-full space-y-6 bg-white p-8 sm:p-10 rounded-3xl border border-[#e1ded5] shadow-[0_8px_32px_rgba(21,50,156,0.06)] text-center">
            
            {/* Japan Modern Clean Typography-based Header */}
            <div className="space-y-4">
              <div className="flex justify-center">
                <span className="p-4 bg-gradient-to-br from-slate-50 to-[#f5f4ed] text-[#15329c] rounded-2xl inline-flex border border-[#e1ded5] shadow-xs">
                  <Building2 className="w-10 h-10 text-[#15329c]" />
                </span>
              </div>
              
              <div className="pt-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#15329c]/5 border border-[#15329c]/15 text-[#15329c] text-[10px] font-bold tracking-widest uppercase">
                  <span>Kaizen KM // 改善・知識管理</span>
                </div>
                
                <h1 className="text-2xl font-black tracking-tight mt-3 text-slate-900 leading-tight">
                  KM RMP
                </h1>
                
                <p className="text-[#a21217] text-sm font-bold mt-1">
                  บริษัท รอแยล เมอิวะ แพ็คซ์ จำกัด
                </p>
                <p className="text-[#15329c] text-xs font-semibold uppercase tracking-wider block mt-0.5">
                  Royal Meiwa Pax Co., Ltd.
                </p>
                
                <p className="text-slate-500 text-xs max-w-xs mx-auto mt-3 leading-relaxed">
                  ระบบบริหารสารสนเทศและพัฒนาความรู้เพื่อเตรียมความพร้อมสู่การตรวจประเมิน ISO 9001 / HACCP และลดความสูญเสียทักษะองค์กร (Loss Prevention)
                </p>
              </div>
            </div>

            {!isRegistering ? (
              /* Upgraded Dual Mode Login with Manual Form + Quick selection prefill triggers */
              <div className="space-y-5 pt-4 border-t border-[#e1ded5] text-left">
                
                {/* 1. MANUAL LOGIN FORM (Employee ID & PIN) */}
                <form onSubmit={handleManualLogin} className="space-y-3.5">
                  <div className="text-center md:text-left mb-1">
                    <span className="block text-[11px] text-slate-500 font-extrabold uppercase tracking-widest pl-0.5">
                      🔑 เข้าสู่ระบบสองปัจจัย (Employee Login)
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block uppercase">รหัสพนักงาน (Employee ID):</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                        <User className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="text"
                        value={loginEmployeeId}
                        onChange={(e) => setLoginEmployeeId(e.target.value)}
                        placeholder="เช่น RMP-5022"
                        className="w-full bg-slate-50 border border-slate-200 py-2 pl-9 pr-4 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block uppercase">รหัสผ่านความปลอดภัย PIN (6 Digits):</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                        <Shield className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="password"
                        maxLength={6}
                        pattern="\d*"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value.replace(/\D/g, ''))}
                        placeholder="•••••• (ตัวเลข 6 หลัก)"
                        className="w-full bg-slate-50 border border-slate-200 py-2 pl-9 pr-4 rounded-xl text-xs font-mono font-bold text-slate-800 tracking-widest focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                      />
                    </div>
                  </div>

                  {loginError && (
                    <p className="text-[10px] text-rose-600 font-semibold bg-rose-50 p-2 rounded-xl border border-rose-100 leading-normal">
                      ❌ {loginError}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-[#15329c] hover:bg-[#11297e] text-white py-2 text-xs font-bold rounded-xl transition duration-150 cursor-pointer shadow-md shadow-[#15329c]/10 flex items-center justify-center gap-2"
                  >
                    <span>เข้าระบบผู้ใช้งาน &rarr;</span>
                  </button>
                </form>

                {/* 2. SPLITTER */}
                <div className="flex items-center my-3.5">
                  <div className="flex-1 border-t border-slate-250" />
                  <span className="px-3 text-[9px] text-slate-450 font-bold uppercase tracking-widest">หรือเข้าสู่ระบบอย่างง่ายสำหรับการทดสอบ</span>
                  <div className="flex-1 border-t border-slate-250" />
                </div>

                {/* 3. SIMULATOR ID LIST WITH PREFILL INFO AND REGISTER BTN */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-widest">
                      👥 ผู้ใช้จำลอง (1-Click Test ID):
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegistering(true);
                        setRegEmployeeId('');
                        setMatchedEmployee(null);
                        setRegError('');
                      }}
                      className="text-xs text-[#15329c] font-black hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>ลงทะเบียนพนักงานใหม่ &rarr;</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                    {users.map((u) => {
                      let badgeCol = "bg-green-500/10 text-green-700 border border-green-500/20";
                      if (u.role === 'Admin') badgeCol = "bg-rose-500/10 text-rose-700 border border-rose-500/20";
                      if (u.role === 'Editor') badgeCol = "bg-amber-500/10 text-amber-700 border border-amber-500/20";

                      const displayPIN = u.password || '123456';

                      return (
                        <button
                          key={u.id}
                          type="button"
                          id={`login-as-${u.id}`}
                          onClick={() => {
                            setLoginEmployeeId(u.employeeId);
                            setLoginPassword(displayPIN);
                            setLoginError('');
                            
                            // Auto login for best user experience on simulated testing, while maintaining PIN protocol visibility
                            const mockUserObj = u;
                            setTimeout(() => {
                              setCurrentUser(mockUserObj);
                              setIsLogged(true);
                              setLoginEmployeeId('');
                              setLoginPassword('');
                            }, 120);
                          }}
                          className="w-full p-2 bg-slate-50/70 hover:bg-[#15329c]/5 border border-slate-200 hover:border-[#15329c]/40 rounded-xl flex items-center gap-2.5 transition cursor-pointer text-left group"
                        >
                          <img
                            src={u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002?w=80'}
                            alt={u.name}
                            referrerPolicy="no-referrer"
                            className="w-7.5 h-7.5 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-[11px] flex items-center gap-1.5 justify-between leading-none">
                              <span className="truncate text-slate-800">{u.name}</span>
                              <span className={`text-[7px] font-mono font-bold px-1 py-0.2 rounded uppercase shrink-0 ${badgeCol}`}>
                                {u.role}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="block text-[8px] text-slate-500 truncate leading-none">
                                ID: {u.employeeId} • {u.position}
                              </span>
                              <span className="bg-amber-100 text-amber-800 border border-amber-200 font-mono text-[7px] font-black px-1.5 py-0.1 rounded shrink-0">
                                🔑 PIN: {displayPIN}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 bg-indigo-50/70 rounded-2xl border border-indigo-100 text-left space-y-1">
                  <span className="text-[10px] font-bold text-indigo-950 uppercase block tracking-wider">🛎️ กำหนดความปลอดภัยสองปัจจัย</span>
                  <p className="text-[9.5px] text-slate-600 leading-normal">
                    ตามข้อกำหนดมาตรฐานสากล ISO9001 พนักงานจะต้องยืนยันตัวตนด้วยรหัส PIN ตัวเลข 6 หลักทุกราย ท่านสามารถกำหนดขึ้นได้เองเมื่อเปิดบัญชีพนักงานใหม่ หรือกดเลือกผู้ใช้เพื่อสาธิตความพร้อมค่ะ
                  </p>
                </div>
              </div>
            ) : (
              /* REGISTRATION INTERACTIVE PORTAL */
              <div className="space-y-4 pt-5 border-t border-[#e1ded5] text-left">
                <div className="flex items-center justify-between">
                  <span className="block text-[11px] text-slate-800 font-bold uppercase tracking-wider">
                    ✏️ ลงทะเบียนเปิดสิทธิ์ (กรอกแค่รหัสพนักงาน)
                  </span>
                  <button
                    onClick={() => setIsRegistering(false)}
                    className="text-xs text-indigo-650 hover:text-indigo-800 font-bold cursor-pointer"
                  >
                    &larr; ย้อนกลับ
                  </button>
                </div>

                {!matchedEmployee ? (
                  /* STEP 1: ENTER EMPLOYEE ID */
                  <div className="space-y-3.5">
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      กรอกเพียง <strong>รหัสพนักงาน</strong> เพื่อระบุความถูกต้อง ระบบจะสืบค้นแผนก ฝ่าย ชื่อนามสกุล และระดับจัดเก็บของคุณจากฐานข้อมูลนำเข้าความปลอดภัยกลาง
                    </p>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 block uppercase">รหัสพนักงานอ้างอิงของคุณ:</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={regEmployeeId}
                          onChange={(e) => setRegEmployeeId(e.target.value)}
                          placeholder="เช่น RMP-8041"
                          className="flex-1 bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                        />
                        <button
                          type="button"
                          onClick={() => handleVerifyEmployeeId(regEmployeeId)}
                          className="bg-[#15329c] hover:bg-[#11297e] text-white text-xs font-bold px-4 rounded-xl cursor-pointer transition shadow-xs"
                        >
                          สืบค้นระเบียน
                        </button>
                      </div>
                    </div>

                    {regError && (
                      <p className="text-[11px] text-rose-600 font-medium bg-rose-50 p-2.5 rounded-xl border border-rose-100 leading-normal">
                        {regError}
                      </p>
                    )}

                    {/* SAMPLE DEMO EMPLOYEE ID TEMPLATE CODES */}
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/60 shadow-xs">
                      <span className="block text-[9.5px] font-bold text-amber-800 uppercase tracking-wider mb-2">💡 รหัสพนักงานรอลงทะเบียน (สุ่มจำลองจากการนำเข้า):</span>
                      <div className="flex flex-col gap-1.5 text-[10.5px] font-mono text-slate-700">
                        {employeeMaster.filter(e => e.status === 'Imported').length === 0 ? (
                          <span className="text-slate-400 italic">ไม่มีข้อมูลพนักงานรอนำเข้า (ลงทะเบียนครบหมดแล้ว) สามารถกด Import เพิ่มใหม่จากหน้า Member Management</span>
                        ) : (
                          employeeMaster.filter(e => e.status === 'Imported').map((emp, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setRegEmployeeId(emp.employeeId);
                                handleVerifyEmployeeId(emp.employeeId);
                              }}
                              className="text-left py-1 px-1.5 rounded hover:bg-white flex justify-between items-center group transition cursor-pointer"
                              title="คลิกเพื่อกรอกอัตโนมัติและทดสอบความถูกต้องทันที"
                            >
                              <span>🆔 <strong className="text-indigo-650 font-bold text-xs">{emp.employeeId}</strong> - {emp.name.split(' (')[0]}</span>
                              <span className="text-[9px] text-[#e51a24] opacity-80 group-hover:underline">เลือก &rarr;</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* STEP 2: SHOW MATCHED RESULTS FOR CONFIRMATION */
                  <div className="space-y-4">
                    <div className="p-4 bg-gradient-to-br from-[#15329c]/5 to-indigo-50 border border-indigo-150 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2 border-b border-indigo-100/60 pb-2">
                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="text-xs font-black text-slate-800 uppercase tracking-widest">พบบันทึกการอนุมัตินำเข้าพนักงาน</span>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-700">
                        <div className="grid grid-cols-3">
                          <span className="text-slate-400 font-medium">รหัสพนักงาน:</span>
                          <span className="col-span-2 font-mono font-bold text-slate-900">{matchedEmployee.employeeId}</span>
                        </div>
                        <div className="grid grid-cols-3">
                          <span className="text-slate-400 font-medium">ชื่อ-นามสกุลจริง:</span>
                          <span className="col-span-2 font-bold text-[#15329c]">{matchedEmployee.name}</span>
                        </div>
                        <div className="grid grid-cols-3">
                          <span className="text-slate-400 font-medium">สังกัดฝ่าย/แผนก:</span>
                          <span className="col-span-2 text-slate-800 font-semibold">{matchedEmployee.department}</span>
                        </div>
                        <div className="grid grid-cols-3">
                          <span className="text-slate-400 font-medium">ตำแหน่งวิชาชีพ:</span>
                          <span className="col-span-2 text-slate-800 font-semibold">{matchedEmployee.position}</span>
                        </div>
                        <div className="grid grid-cols-3">
                          <span className="text-slate-400 font-medium">ระดับพนักงาน:</span>
                          <span className="col-span-2 text-slate-800 font-semibold">
                            <span className="bg-white px-2 py-0.5 rounded border border-indigo-100 text-[10.5px] font-mono text-indigo-700">
                              {matchedEmployee.level}
                            </span>
                          </span>
                        </div>
                        <div className="grid grid-cols-3">
                          <span className="text-slate-400 font-medium">วันเริ่มงาน (Start):</span>
                          <span className="col-span-2 text-slate-800 font-semibold font-mono">{matchedEmployee.startDate}</span>
                        </div>
                        <div className="grid grid-cols-3">
                          <span className="text-slate-400 font-medium">พิกัดอีเมล / โทร:</span>
                          <span className="col-span-2 text-slate-600 font-mono text-[11px] truncate">{matchedEmployee.email} • {matchedEmployee.phone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-150 text-emerald-800 text-[11px] leading-relaxed">
                      💚 ระบบจะเชื่อมต่อวุฒิความรู้ (Competency Score Card) และหลักสูตรสอนงานเซฟตี้ Onboarding แผนกตรงโดยอัตโนมัติ
                    </div>

                    {/* Require numeric 6 digit pin password input */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <label className="text-[10px] font-extrabold text-slate-500 block uppercase tracking-wider">
                        🔐 กำหนดรหัสผ่านเข้าระบบ (PIN 6 หลัก):
                      </label>
                      <input
                        type="password"
                        maxLength={6}
                        pattern="\d*"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value.replace(/\D/g, ''))}
                        placeholder="กรอกตัวเลข 6 หลัก เช่น 123456"
                        className="w-full bg-white border border-slate-300 py-2 text-center text-xl font-mono font-black tracking-widest text-[#15329c] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                      />
                      <p className="text-[9.5px] text-slate-500 text-center">
                        * รหัสนี้จะผูกกับบัญชีเพื่อความปลอดภัยระดับอุตสาหกรรม
                      </p>
                    </div>

                    {regError && (
                      <p className="text-[11px] text-rose-600 font-medium bg-rose-50 p-2.5 rounded-xl border border-rose-100 leading-normal">
                        {regError}
                      </p>
                    )}

                    <div className="flex gap-2.5">
                      <button
                        onClick={() => {
                          setMatchedEmployee(null);
                          setRegPassword('');
                          setRegError('');
                        }}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 py-2.5 rounded-xl font-bold text-xs text-slate-700 text-center cursor-pointer transition-colors"
                      >
                        แก้ไขรหัส
                      </button>
                      <button
                        onClick={handleConfirmRegistration}
                        className="flex-1 bg-[#15329c] hover:bg-[#11297e] text-white py-2.5 rounded-xl font-bold text-xs text-center cursor-pointer transition shadow"
                      >
                        ยืนยันและเปิดบัญชี &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Safety policy footer info */}
            <div className="text-[9px] text-slate-400 pt-2 flex items-center justify-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e51a24] animate-ping" />
              <span>SECURE ACCESS // ISO9001 • GMP • HACCP STANDARD</span>
            </div>

          </div>
        </div>
      ) : (
        /* Authenticated workspace layout with Sidebar & Header */
        <div className="flex-1 flex flex-col md:flex-row relative">
          
          {/* 2. LEFT SIDEBAR NAVIGATION */}
          <aside id="sidebar-menu" className="w-full md:w-64 bg-white text-slate-700 border-r border-[#e1ded5] flex flex-col justify-between shrink-0 h-auto md:h-screen sticky top-0 z-20">
            <div>
              {/* Logo & Corporate Header */}
              <div className="p-4 border-b border-[#e1ded5] flex items-center justify-between bg-[#fbfbf9]">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-gradient-to-tr from-[#15329c] to-[#0d226b] text-white rounded-xl inline-flex border border-[#15329c]/10 shadow-xs">
                    <Building2 className="w-5 h-5" />
                  </span>
                  <div>
                    <h1 className="font-black text-[14px] text-slate-900 tracking-tight leading-none">
                      KM RMP
                    </h1>
                    <span className="text-[8px] text-[#e51a24] font-black tracking-wider block mt-1 uppercase">
                      Royal Meiwa Pax
                    </span>
                  </div>
                </div>

                {/* Mobile Menu Toggle Button */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden text-slate-500 hover:text-slate-900 cursor-pointer p-1.5 hover:bg-slate-100 rounded-lg"
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>

              {/* Sidebar Menu options */}
              <nav className={`p-2.5 space-y-1 ${mobileMenuOpen ? 'block' : 'hidden md:block'}`}>
                {menuList.map((menu) => {
                  const Icon = menu.icon;
                  const isActive = activeMenu === menu.id;

                  return (
                    <button
                      key={menu.id}
                      id={`nav-menu-item-${menu.id}`}
                      onClick={() => {
                        setActiveMenu(menu.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center gap-3 cursor-pointer group ${
                        isActive
                          ? 'bg-[#15329c] text-white font-bold shadow-md shadow-[#15329c]/20'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <div className="min-w-0">
                        <span className="block text-xs truncate leading-tight">{menu.label}</span>
                        {menu.sub && <span className={`text-[8px] font-mono mt-0.5 block truncate ${isActive ? 'text-blue-100 opacity-90' : 'text-slate-400'}`}>{menu.sub}</span>}
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Current user information footer column */}
            <div className={`p-4 border-t border-[#e1ded5] bg-[#fbfbf9] space-y-3 ${mobileMenuOpen ? 'block' : 'hidden md:block'}`}>
              <div className="flex items-center gap-2.5">
                <img
                  src={currentUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80'}
                  alt={currentUser.name}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border border-slate-250 object-cover shrink-0"
                />
                
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-xs text-slate-800 truncate flex items-center gap-1 leading-none">
                    <span>{currentUser.name.split(' ')[0]}</span>
                    <span className="bg-[#e51a24] text-white font-mono text-[7px] px-1 rounded uppercase tracking-wider font-bold">
                      {currentUser.role}
                    </span>
                  </div>
                  <span className="block text-[8px] text-slate-500 font-mono truncate mt-1">
                    ID: {currentUser.employeeId}
                  </span>
                </div>

                <button 
                  id="logout-btn"
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-[#e51a24] transition-colors cursor-pointer p-1 rounded hover:bg-slate-100"
                  title="สลับบัญชี/ออกจากระบบ"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Standard privilege matrix note */}
              <div className="text-[8.5px] text-slate-550 leading-normal border-t border-[#e1ded5]/80 pt-2 flex items-center justify-between">
                <span>ฝ่าย: <strong className="text-slate-700">{currentUser.department.split(' ')[0]}</strong></span>
                <span className="font-mono text-[#e51a24]/80 text-[7px] tracking-widest font-bold">日本製 5S</span>
              </div>
            </div>
          </aside>

          {/* 3. MAIN CONTENTS CONTAINER */}
          <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto bg-[#f0f4fa]">
            
             {/* Header with Search and Branding */}
            <header className="bg-white border-b border-[#e1ded5] px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 sticky top-0 z-10 shadow-xs">
              
              <div>
                <span className="text-[9px] text-[#e51a24] font-black uppercase tracking-widest block">
                  KM RMP // 知識管理システム
                </span>
                <h2 className="text-sm font-black text-slate-800 mt-0.5 tracking-tight">
                  {menuList.find(m => m.id === activeMenu)?.label}
                </h2>
              </div>

              {/* Integrated Search engine mapping (QP, WI, expert grounded query) */}
              <form 
                id="sidebar-search-form"
                onSubmit={handleGlobalSearchSubmit} 
                className="w-full sm:w-80 relative"
              >
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  id="global-header-search"
                  type="text"
                  placeholder="ค้นหารวมอัจฉริยะ (QP, WI, ผู้เชี่ยวชาญ)..."
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-[#e1ded5] py-2 pl-9 pr-14 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#15329c]"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-[#15329c] hover:bg-[#11297e] text-white text-[9px] font-bold px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
                >
                  ค้นหา
                </button>
              </form>
            </header>

            {/* Dynamic View container */}
            <section className="p-4 sm:p-6 flex-1 space-y-6">
              
              {activeMenu === 'Dashboard' && (
                <Dashboard
                  currentUser={currentUser}
                  documents={documents}
                  kbArticles={kbArticles}
                  experts={experts}
                  searchLogs={searchLogs}
                  userProgressList={userProgress}
                  examResults={examResults}
                  users={users}
                  courses={courses}
                  onTriggerGapFill={handleTriggerGapFill}
                  onNavigateToModule={(mod) => setActiveMenu(mod)}
                />
              )}

              {activeMenu === 'Document Control' && (
                <DocumentList
                  currentUser={currentUser}
                  documents={documents}
                  onAddDocument={handleAddDocument}
                  onApproveDocument={handleApproveDocument}
                  onUpdateDocument={handleUpdateDocument}
                  onDeleteDocument={handleDeleteDocument}
                  comments={ratings}
                  onAddComment={handleAddRating}
                />
              )}

              {activeMenu === 'Learning & Certification' && (
                <LearningCenter articles={kbArticles}
                  currentUser={currentUser}
                  courses={courses}
                  userProgressList={userProgress}
                  examResults={examResults}
                  onAddExamResult={handleAddExamResult}
                  onUpdateUserProgress={handleUpdateUserProgress}
                  onAddCourse={handleAddCourse}
                  onUpdateCourse={handleUpdateCourse}
                  onDeleteCourse={handleDeleteCourse}
                  userCompetencies={userCompetencies}
                  setUserCompetencies={setUserCompetencies}
                  userCertificates={userCertificates}
                  setUserCertificates={setUserCertificates}
                  kmContributionLogs={kmContributionLogs}
                  setKmContributionLogs={setKmContributionLogs}
                  onAwardPoints={awardPoints}
                  documents={documents}
                />
              )}

              {activeMenu === 'Technical Knowledge Base' && (
                <TechnicalKB
                  currentUser={currentUser}
                  articles={kbArticles}
                  documents={documents}
                  experts={experts}
                  onAddArticle={handleAddKBArticle}
                  onApproveArticle={handleApproveKB}
                  onLikeArticle={handleLikeKB}
                  onUpdateArticle={handleUpdateKBArticle}
                  onDeleteArticle={handleDeleteKBArticle}
                  prefilledKeyword={globalSearch}
                />
              )}

              {activeMenu === 'Expert Directory' && (
                <ExpertDirectory
                  currentUser={currentUser}
                  experts={experts}
                  contactRequests={contactRequests}
                  onAddContactRequest={handleAddContactRequest}
                  onAddContactReply={handleAddContactReply}
                  onAddExpert={handleAddExpert}
                  onUpdateExpert={handleUpdateExpert}
                  onDeleteExpert={handleDeleteExpert}
                />
              )}

              {activeMenu === 'AI Knowledge Assistant' && (
                <AIChatBox
                  currentUser={currentUser}
                  documents={documents}
                  kbArticles={kbArticles}
                  courses={courses}
                  customResources={customResources}
                  onAddCustomResource={handleAddCustomResource}
                  onDeleteCustomResource={handleDeleteCustomResource}
                />
              )}

              {activeMenu === 'Member Management' && (
                <MemberManagement
                  currentUser={currentUser}
                  users={users}
                  courses={courses}
                  userProgressList={userProgress}
                  examResults={examResults}
                  onAddUser={handleAddUser}
                  onUpdateUser={handleUpdateUser}
                  onUpdateUserRole={handleUpdateUserRole}
                  onDeleteUser={handleDeleteUser}
                  employeeMaster={employeeMaster}
                  onUpdateEmployeeMaster={setEmployeeMaster}
                  kbArticles={kbArticles}
                  searchLogs={searchLogs}
                  systemAuditLogs={systemAuditLogs}
                />
              )}

            </section>

          </main>

        </div>
      )}

    </div>
  );
}
