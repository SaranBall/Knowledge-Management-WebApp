/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Award, BookOpen, CheckCircle, ChevronLeft, ChevronRight, 
  Clock, FileText, Film, Medal, PlayCircle, Trophy, RefreshCw,
  QrCode, Volume2, Sparkles, Calendar, MapPin, UserCheck, History, Plus, Landmark, Edit, Trash2,
  X, CheckSquare, ListTodo, GraduationCap, ArrowRight, ShieldCheck, FileSpreadsheet
} from 'lucide-react';
import { Course, Lesson, QuizQuestion, User, UserCourseProgress, UserCompetency, UserCertificate, KMContributionLog, DocumentItem } from '../types';
import { getUserBadges } from '../utils/badgeUtils';
import { BadgePill, UserBadgesGrid } from './BadgeDisplay';
import { BadgeCertificateModal } from './BadgeCertificateModal';
import { calculateLeaderboard, calculateRemainingDays, ANCHOR_DATE } from '../utils/gamificationUtils';

// Interface for offline scanning sessions
export interface OfflineTrainingSession {
  id: string;
  courseId: string;
  courseTitle: string;
  sessionName: string;
  location: string;
  instructor: string;
  date: string;
  qrValue: string;
}

export const OFFLINE_TRAINING_SESSIONS: OfflineTrainingSession[] = [
  {
    id: 'off-1',
    courseId: 'c-2',
    courseTitle: 'การตรวจรับเคมีวัตถุดิบและจัดทำรายงานคุณภาพด้วยเครื่องวิเคราะห์ความชื้น (QC Inspection Cert)',
    sessionName: 'คลาสปฏิบัติการเครื่อง Sartorius และเป่าฟิล์มสุ่ม (Moisture Analyzer Practical Lab)',
    location: 'ห้องปฏิบัติการควบคุมคุณภาพ (Quality Control Lab - Room 2)',
    instructor: 'คุณหญิง ดารินทร์ แซ่ตั้ง (QA/QC supervisor)',
    date: 'ทุกวันพุธและศุกร์ เวลา 14:00 - 15:30 น.',
    qrValue: 'QR_OFFLINE_SESSION_QC_MOISTURE',
  },
  {
    id: 'off-2',
    courseId: 'c-3',
    courseTitle: 'ความปลอดภัยในการใช้รถยกไฟฟ้า (Forklift Operation Safety)',
    sessionName: 'ภาคปฏิบัติการขับขี่รถยกและการจัดวางพาเลททรงสูง (Forklift Maneuvering & Racking Practice)',
    location: 'ลานโหลดคลังสินค้าประตูดำ โซนเอ (Warehouse Zone A - Racking Area)',
    instructor: 'ช่างสมชาย สมชาย รักเรียน (Senior Production Engineer)',
    date: 'ทุกวันอังคารและพฤหัสบดี เวลา 09:00 - 11:30 น.',
    qrValue: 'QR_OFFLINE_SESSION_FORKLIFT_SAFETY',
  },
  {
    id: 'off-3',
    courseId: 'c-1',
    courseTitle: 'หลักสูตรปูพื้นฐานพนักงานคลังสินค้าใหม่ (Onboarding for Warehouse Staff)',
    sessionName: 'ฝึกเดินเส้นนำทาง ตีความป้ายบาร์โค้ด และจัดระเบียบ 5ส หน้างานจริง (WMS & 5S Ground Induction)',
    location: 'หน้าจุดรับของแผนกคลังสินค้า (Receiving Docks - Warehouse)',
    instructor: 'คุณก้อย สิริมา แสงสะอาด (Managing Director)',
    date: 'ทุกวันเสาร์ เวลา 10:00 - 12:00 น.',
    qrValue: 'QR_OFFLINE_SESSION_WAREHOUSE_ONBOARDING',
  }
];

// Comforable tone audio beep speaker
export const playBeep = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1250, audioCtx.currentTime); 
    gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
    
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      audioCtx.close();
    }, 110);
  } catch (err) {
    console.warn('Audio feedback blocked by browser or failed to spin up Oscillator.', err);
  }
};

export const generateMockQRGrid = (seed: string) => {
  const size = 17;
  const grid: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Real QR shape simulation
  const finalQrGrid: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const isTopLeft = r < 5 && c < 5;
      const isTopRight = r < 5 && c >= size - 5;
      const isBottomLeft = r >= size - 5 && c < 5;
      if (isTopLeft || isTopRight || isBottomLeft) {
        const lr = isTopLeft ? r : (isTopRight ? r : r - (size - 5));
        const lc = isTopLeft ? c : (isTopRight ? c - (size - 5) : c);
        const isBorder = lr === 0 || lr === 4 || lc === 0 || lc === 4;
        const isCenter = lr === 2 && lc === 2;
        finalQrGrid[r][c] = isBorder || isCenter;
      } else {
        const hashVal = Math.abs((seed.charCodeAt(0) * (r + 13) * (c + 37)) % 103);
        finalQrGrid[r][c] = hashVal % 2 === 0;
      }
    }
  }
  return finalQrGrid;
};

interface LearningCenterProps {
  currentUser: User;
  courses: Course[];
  userProgressList: UserCourseProgress[];
  examResults: any[];
  onAddExamResult: (result: {
    employeeName: string;
    employeeId: string;
    courseId: string;
    courseTitle: string;
    score: number;
    pass: boolean;
    date: string;
  }) => void;
  onUpdateUserProgress: (userId: string, courseId: string, status: 'Learning' | 'Completed', score?: number) => void;
  onAddCourse: (newCourse: Course) => void;
  onUpdateCourse: (updatedCourse: Course) => void;
  onDeleteCourse: (id: string) => void;
  articles?: any[];
  userCompetencies: UserCompetency[];
  setUserCompetencies: React.Dispatch<React.SetStateAction<UserCompetency[]>>;
  userCertificates: UserCertificate[];
  setUserCertificates: React.Dispatch<React.SetStateAction<UserCertificate[]>>;
  kmContributionLogs: KMContributionLog[];
  setKmContributionLogs: React.Dispatch<React.SetStateAction<KMContributionLog[]>>;
  onAwardPoints: (userId: string, activityType: KMContributionLog['activityType'], points: number, description: string) => void;
  documents: DocumentItem[];
}

export const LearningCenter: React.FC<LearningCenterProps> = ({
  currentUser,
  courses,
  userProgressList,
  examResults,
  onAddExamResult,
  onUpdateUserProgress,
  onAddCourse,
  onUpdateCourse,
  onDeleteCourse,
  articles = [],
  userCompetencies,
  setUserCompetencies,
  userCertificates,
  setUserCertificates,
  kmContributionLogs,
  setKmContributionLogs,
  onAwardPoints,
  documents,
}) => {
  // Main SubTabs for learning
  const [activeSubTab, setActiveSubTab] = useState<'onboarding' | 'general' | 'competency' | 'career-ai' | 'qr' | 'transcript'>('onboarding');

  // Badge calculations for the current user
  const myBadges = getUserBadges(currentUser, userProgressList, examResults, articles);
  const activeEarnedBadges = myBadges.filter(b => b.earned);
  const [showBadgesPanel, setShowBadgesPanel] = useState<boolean>(false);

  // Separating courses list by type, filtering unapproved courses for students
  const onboardingCourses = courses.filter(c => 
    c.type === 'Onboarding' && (c.isApproved !== false || currentUser?.role === 'Admin' || currentUser?.role === 'Editor')
  );
  const generalCourses = courses.filter(c => 
    c.type === 'General' && (c.isApproved !== false || currentUser?.role === 'Admin' || currentUser?.role === 'Editor')
  );

  // Filter for unapproved courses
  const pendingApprovals = courses.filter(c => c.isApproved === false);

  // Selected State depends on tab
  const [selectedOnboardingCourseId, setSelectedOnboardingCourseId] = useState<string>(
    onboardingCourses[0]?.id || ''
  );
  const [selectedGeneralCourseId, setSelectedGeneralCourseId] = useState<string>(
    generalCourses[0]?.id || ''
  );

  // active indexes and quiz taking states
  const [activeLessonIndex, setActiveLessonIndex] = useState<number | null>(null);
  const [isTakingQuiz, setIsTakingQuiz] = useState<boolean>(false);
  const [quizAnswers, setQuizAnswers] = useState<{ [qId: string]: string }>({});
  const [essayAnswer, setEssayAnswer] = useState<string>('');
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [quizPassed, setQuizPassed] = useState<boolean | null>(null);
  
  // Certificate viewer states
  const [showCertificate, setShowCertificate] = useState<boolean>(false);
  const [certificateCourseOverride, setCertificateCourseOverride] = useState<Course | null>(null);

  // States for dynamic badge/certificate generation
  const [isCertBadgeModalOpen, setIsCertBadgeModalOpen] = useState(false);
  const [modalSelectedCourse, setModalSelectedCourse] = useState<Course | null>(null);
  const [modalSelectedScore, setModalSelectedScore] = useState<number>(100);
  const [modalSelectedDate, setModalSelectedDate] = useState<string | undefined>(undefined);

  // Filter for current user specifically
  const myCompetencies = userCompetencies.filter(c => c.userId === currentUser.id);
  const myCertificates = calculateRemainingDays(userCertificates.filter(c => c.userId === currentUser.id));
  
  // Calculate leaderboard
  const rawLeaderboard = calculateLeaderboard(kmContributionLogs);
  const myKMScoreObj = rawLeaderboard.find(x => x.userId === currentUser.id);
  const myKMPoints = myKMScoreObj ? myKMScoreObj.points : 0;
  const myKMLevel = myKMScoreObj ? myKMScoreObj.level : 1;

  // --- AI Career Path generator states ---
  const [aiTargetGoal, setAiTargetGoal] = useState<string>(
    'Senior Film Extrusion Specialist (ระดับ 4 หน้างานเตาหลอมความร้อน)'
  );
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiRoadmapResult, setAiRoadmapResult] = useState<any>(null);

  const handleGeneratePersonalizedPath = async () => {
    setAiLoading(true);
    setAiRoadmapResult(null);

    try {
      // Fetch matching courses and document catalog list to feed the LLM
      const coursesSub = courses.map(c => ({ id: c.id, title: c.title, description: c.description }));
      const docsSub = documents.map(d => ({ title: d.title, tags: d.tags }));

      const response = await fetch('/api/personalized-path', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentUser: {
            name: currentUser.name,
            employeeId: currentUser.employeeId,
            position: currentUser.position,
            department: currentUser.department,
            role: currentUser.role,
          },
          targetGoal: aiTargetGoal,
          myCompetencies: myCompetencies, // Use pre-calculated competencies for the current user
          availableCourses: coursesSub,
          availableDocuments: docsSub,
        }),
      });

      if (!response.ok) {
        throw new Error('เกิดข้อผิดพลาดจากทางเซิร์ฟเวอร์ AI');
      }

      const data = await response.json();
      
      // Normalize the output into our frontend view's expectation
      let normalizedResult = {
        analysis: '',
        phases: [] as any[]
      };

      if (data.careerGoalExplanation) {
        normalizedResult.analysis = `${data.careerGoalExplanation}\n\n${data.currentTenureAnalysis || ''}\n\n💡 คำแนะนำจากผู้เชี่ยวชาญ: ${data.expertAdvise || ''}`;
      } else {
        normalizedResult.analysis = data.analysis || 'พร้อมสำหรับการเรียนรู้สายอาชีพ';
      }

      const rawSteps = data.recommendedSteps || data.phases || [];
      normalizedResult.phases = rawSteps.map((ph: any) => ({
        title: ph.title || `ขั้นตอนที่ ${ph.step || ''}`,
        milestoneGoal: ph.description || ph.milestoneGoal || '',
        guidelines: ph.targetSkills ? `ทักษะเป้าหมาย: ${ph.targetSkills.join(', ')}` : ph.guidelines || '',
        coursesSuggested: ph.recommendedCourses || ph.coursesSuggested || [],
        documentsSuggested: ph.recommendedWIs || ph.documentsSuggested || []
      }));

      setAiRoadmapResult(normalizedResult);
      onAwardPoints(currentUser.id, 'AI_CAREER_ROADMAP', 40, `เปิดทดลองใช้ AI วางกรอบการเรียนรู้ (Career Roadmap) สู่เป้าหมาย "${aiTargetGoal}"`);
    } catch (err: any) {
      alert(`⚠️ ไม่สามารถติดต่อ AI สำเร็จ: ${err.message || err}`);
    } finally {
      setAiLoading(false);
    }
  };

  // Admin Course CRUD states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const [newCourseState, setNewCourseState] = useState({
    title: '',
    description: '',
    type: 'Onboarding' as 'Onboarding' | 'General',
    durationHours: '2 ชั่วโมง',
    minPassScore: 80,
    targetPositions: ['Warehouse Staff'] as string[],
    lessonTitle: 'บทเรียนย่อยที่ 1: ขั้นตอนสากลและการจัดสรรงานเบื้องต้น',
    lessonContent: 'รายละเอียดวาระเนื้อหาประกอบการศึกษา พนักงานต้องเข้าใจเกณฑ์คุณภาพ คู่มือ ISO9001 และระเบียบขั้นตอนการทำงาน...',
    lessonMediaType: 'Text' as 'PDF' | 'Image' | 'Slides' | 'Video' | 'Text',
    lessonMediaUrl: '',
    quizType: 'SingleChoice' as 'SingleChoice' | 'TrueFalse' | 'Matching' | 'Essay',
    quizQuestion: 'พนักงานทุกคนต้องปฏิบัติตามมาตรฐานคู่มือปฏิบัติงาน (WI) อย่างเคร่งครัดหรือไม่?',
    quizOptionsStr: 'ใช่ เพื่อความปลอดภัยสูงสุดและเสถียรภาพ\nไม่จำเป็นใดๆ\nขึ้นอยู่กับความเร่งของรอบกะผลิต',
    quizCorrectAnswer: 'ใช่ เพื่อความปลอดภัยสูงสุดและเสถียรภาพ',
    simulatedFileName: '',
    isSimulatedUploading: false
  });

  const [addedQuizQuestions, setAddedQuizQuestions] = useState<any[]>([]);

  useEffect(() => {
    if (!isAddOpen) {
      setAddedQuizQuestions([]);
    }
  }, [isAddOpen]);

  const [editingCourse, setEditingCourse] = useState<any>(null);

  // QR/Offline Attendance logs state
  const [showQRScannerMode, setShowQRScannerMode] = useState<boolean>(false);
  const [qrTab, setQrTab] = useState<'scan' | 'generate' | 'logs'>('scan');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('off-1');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanSuccess, setScanSuccess] = useState<boolean>(false);
  const [scannedSessionName, setScannedSessionName] = useState<string>('');
  const [scannedCourseTitle, setScannedCourseTitle] = useState<string>('');
  const [scannedCourseId, setScannedCourseId] = useState<string>('');

  const [attendanceLogs, setAttendanceLogs] = useState<any[]>(() => {
    const saved = localStorage.getItem('rm_attendance_logs');
    if (saved) return JSON.parse(saved);
    return [
      {
        id: 'att-init-1',
        userId: 'u-2',
        userName: 'สมชาย รักเรียน (ช่างสมชาย)',
        employeeId: 'RMP-1052',
        department: 'ฝ่ายผลิต (Production)',
        position: 'Senior Production Engineer',
        sessionId: 'off-2',
        sessionName: 'ภาคปฏิบัติการขับขี่รถยกและการจัดวางพาเลททรงสูง (Forklift Maneuvering & Racking Practice)',
        courseId: 'c-3',
        courseTitle: 'ความปลอดภัยในการใช้รถยกไฟฟ้า (Forklift Operation Safety)',
        timestamp: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      },
      {
        id: 'att-init-2',
        userId: 'u-3',
        userName: 'ดารินทร์ แซ่ตั้ง (คุณหญิง)',
        employeeId: 'RMP-3122',
        department: 'ฝ่ายประกอและควบคุมคุณภาพ (QA/QC)',
        position: 'QA/QC supervisor',
        sessionId: 'off-1',
        sessionName: 'คลาสปฏิบัติการเครื่อง Sartorius และเป่าฟิล์มสุ่ม (Moisture Analyzer Practical Lab)',
        courseId: 'c-2',
        courseTitle: 'การตรวจรับเคมีวัตถุดิบและจัดทำรายงานคุณภาพด้วยเครื่องวิเคราะห์ความชื้น (QC Inspection Cert)',
        timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
      }
    ];
  });

  // Save logs to localStorage
  React.useEffect(() => {
    localStorage.setItem('rm_attendance_logs', JSON.stringify(attendanceLogs));
  }, [attendanceLogs]);

  // Execute Simulated Scan
  const handlePerformSimulatedScan = (sessionId: string) => {
    const session = OFFLINE_TRAINING_SESSIONS.find(s => s.id === sessionId);
    if (!session) return;

    setIsScanning(true);
    setScanSuccess(false);

    setTimeout(() => {
      setIsScanning(false);
      setScanSuccess(true);
      setScannedSessionName(session.sessionName);
      setScannedCourseTitle(session.courseTitle);
      setScannedCourseId(session.courseId);

      playBeep();

      const isDup = attendanceLogs.some(l => l.userId === currentUser.id && l.sessionId === session.id);
      
      const newLog = {
        id: `att-${Date.now()}`,
        userId: currentUser.id,
        userName: currentUser.name,
        employeeId: currentUser.employeeId,
        department: currentUser.department,
        position: currentUser.position,
        sessionId: session.id,
        sessionName: session.sessionName,
        courseId: session.courseId,
        courseTitle: session.courseTitle,
        timestamp: new Date().toISOString()
      };

      setAttendanceLogs(prev => {
        if (isDup) return prev;
        return [newLog, ...prev];
      });

      // Update progress
      onUpdateUserProgress(currentUser.id, session.courseId, 'Completed', 100);

      // Save Exam Result
      onAddExamResult({
        employeeName: currentUser.name,
        employeeId: currentUser.employeeId,
        courseId: session.courseId,
        courseTitle: session.courseTitle,
        score: 100,
        pass: true,
        date: new Date().toISOString().split('T')[0] + ' (QR สแกน เช็คชื่อออฟไลน์)'
      });

    }, 1200);
  };

  // Determine current active course based on Active SubTab
  const currentCourseId = activeSubTab === 'onboarding' ? selectedOnboardingCourseId : selectedGeneralCourseId;
  const selectedCourse = courses.find(c => c.id === currentCourseId) || 
                         (activeSubTab === 'onboarding' ? onboardingCourses[0] : generalCourses[0]);

  // Current user's progress and stats
  const currentProgress = userProgressList.find(p => p.userId === currentUser.id && p.courseId === selectedCourse?.id);
  const relevantResult = examResults.find(e => e.employeeId === currentUser.employeeId && e.courseId === selectedCourse?.id);

  const lessons = selectedCourse?.lessons || [];
  const questions = selectedCourse?.quiz || [];

  const completedLessonsCount = currentProgress?.status === 'Completed' 
    ? lessons.length 
    : (activeLessonIndex !== null ? Math.max(activeLessonIndex, 0) : 0);

  const completionPercent = lessons.length > 0 ? Math.round((completedLessonsCount / lessons.length) * 100) : 0;

  // Active user details
  const myCompletedCoursesCount = userProgressList.filter(p => p.userId === currentUser.id && p.status === 'Completed').length;
  const myExams = examResults.filter(e => e.employeeId === currentUser.employeeId);
  const myAverageQuizScore = myExams.length > 0 
    ? Math.round(myExams.reduce((sum, current) => sum + current.score, 0) / myExams.length)
    : 0;

  const handleStartCourse = (index: number) => {
    setActiveLessonIndex(index);
    setIsTakingQuiz(false);
    setQuizScore(null);
    setQuizPassed(null);
    setShowCertificate(false);
    setCertificateCourseOverride(null);
    if (selectedCourse) {
      onUpdateUserProgress(currentUser.id, selectedCourse.id, 'Learning');
    }
  };

  const handleNextLesson = () => {
    if (activeLessonIndex !== null && activeLessonIndex < lessons.length - 1) {
      setActiveLessonIndex(activeLessonIndex + 1);
    } else if (activeLessonIndex === lessons.length - 1) {
      setActiveLessonIndex(null);
      setIsTakingQuiz(true);
    }
  };

  const handleQuizAnswerSelect = (qId: string, val: string) => {
    setQuizAnswers({
      ...quizAnswers,
      [qId]: val
    });
  };

  const handleResetQuiz = () => {
    setQuizAnswers({});
    setEssayAnswer('');
    setQuizScore(null);
    setQuizPassed(null);
  };

  const handleQuizSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;

    // Gradings
    let correctCount = 0;
    questions.forEach(q => {
      const qType = q.type || 'SingleChoice';
      if (qType === 'Matching') {
        try {
          const userMap = JSON.parse(quizAnswers[q.id] || '{}');
          const correctMap = JSON.parse(q.correctAnswer || '{}');
          const keys = Object.keys(correctMap);
          const isAllCorrect = keys.length > 0 && keys.every(k => userMap[k] === correctMap[k]);
          if (isAllCorrect) {
            correctCount++;
          }
        } catch (err) {
          if (quizAnswers[q.id] === q.correctAnswer) {
            correctCount++;
          }
        }
      } else if (qType === 'Essay') {
        if (quizAnswers[q.id] && quizAnswers[q.id].trim().length >= 5) {
          correctCount++;
        }
      } else {
        if (quizAnswers[q.id] === q.correctAnswer) {
          correctCount++;
        }
      }
    });

    const finalPercent = Math.round((correctCount / questions.length) * 100);
    const passed = finalPercent >= selectedCourse.minPassScore;

    setQuizScore(finalPercent);
    setQuizPassed(passed);

    onAddExamResult({
      employeeName: currentUser.name,
      employeeId: currentUser.employeeId,
      courseId: selectedCourse.id,
      courseTitle: selectedCourse.title,
      score: finalPercent,
      pass: passed,
      date: new Date().toISOString().split('T')[0]
    });

    if (passed) {
      onUpdateUserProgress(currentUser.id, selectedCourse.id, 'Completed', finalPercent);
    }
  };

  // Handler to append current question input to the list and clear inputs for the next question
  const handleAddQuestionNext = () => {
    const qType = newCourseState.quizType || 'SingleChoice';
    
    if (!newCourseState.quizQuestion.trim()) {
      alert('⚠️ กรุณาระบุโจทย์คำถามทดสอบก่อนเพิ่มข้อถัดไป');
      return;
    }

    let options: string[] = [];
    let pairs: { left: string; right: string }[] = [];
    let correctAnswer = '';

    if (qType === 'SingleChoice') {
      options = newCourseState.quizOptionsStr
        ? newCourseState.quizOptionsStr.split('\n').map(o => o.trim()).filter(Boolean)
        : [];
      if (options.length === 0) {
        alert('⚠️ กรุณาระบุตัวเลือกคำตอบอย่างน้อย 1 ตัวเลือก');
        return;
      }
      correctAnswer = newCourseState.quizCorrectAnswer.trim();
      if (!correctAnswer) {
        alert('⚠️ กรุณาระบุคำตอบที่ถูกต้องที่สุด');
        return;
      }
    } else if (qType === 'TrueFalse') {
      options = ['ถูก (True)', 'ผิด (False)'];
      correctAnswer = newCourseState.quizCorrectAnswer.trim() || 'ถูก (True)';
    } else if (qType === 'Matching') {
      const lines = newCourseState.quizOptionsStr.split('\n').map(o => o.trim()).filter(Boolean);
      const parsedPairs: { left: string; right: string }[] = [];
      const correctMap: Record<string, string> = {};
      lines.forEach(line => {
        let parts = line.split('=');
        if (parts.length < 2) parts = line.split(':');
        if (parts.length >= 2) {
          const left = parts[0].trim();
          const right = parts.slice(1).join('=').trim();
          if (left && right) {
            parsedPairs.push({ left, right });
            correctMap[left] = right;
          }
        }
      });

      if (parsedPairs.length === 0) {
        alert('⚠️ สำหรับประเภทจับคู่ กรุณากรอกคู่คำตอบในช่องตัวเลือก รูปแบบ "คำด้านซ้าย = คำด้านขวา" บรรทัดละ 1 คู่\nเช่น:\nชุด PPE = อุปกรณ์ป้องกันส่วนบุคคล');
        return;
      }
      pairs = parsedPairs;
      options = parsedPairs.map(p => p.right);
      correctAnswer = JSON.stringify(correctMap);
    } else if (qType === 'Essay') {
      options = [];
      correctAnswer = newCourseState.quizCorrectAnswer.trim() || '(เกณฑ์ตอบคำถามอัตนัยปลายเปิด)';
    }

    const newQuestion = {
      id: `q-${Date.now()}-${addedQuizQuestions.length + 1}`,
      question: newCourseState.quizQuestion.trim(),
      type: qType,
      options,
      pairs: pairs.length > 0 ? pairs : undefined,
      correctAnswer
    };

    setAddedQuizQuestions(prev => [...prev, newQuestion]);

    // Reset inputs for next question
    setNewCourseState(prev => ({
      ...prev,
      quizQuestion: '',
      quizOptionsStr: '',
      quizCorrectAnswer: '',
      quizType: 'SingleChoice'
    }));

    alert('➕ เพิ่มคำถามข้อนี้ลงลิสต์แล้ว! คุณสามารถพิมพ์โจทย์ข้อถัดไปต่อได้ทันที');
  };

  // Add course submit handler
  const handleAddCourseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseState.title || !newCourseState.description) return;

    const firstLesson: Lesson = {
      id: `l-${Date.now()}-1`,
      title: newCourseState.lessonTitle || 'บทเรียนหัวข้อหลีก',
      content: newCourseState.lessonContent || 'รายละเอียดคู่มือการใช้งานเครื่องจักรและสารสนเทศ...',
      durationMinutes: 30,
      mediaType: newCourseState.lessonMediaType,
      mediaUrl: newCourseState.lessonMediaUrl || (
        newCourseState.lessonMediaType === 'PDF' ? 'https://royal-meiwa.com/uploads/gmp_hygiene_manual.pdf' :
        newCourseState.lessonMediaType === 'Video' ? 'https://www.youtube.com/embed/dQw4w9WgXcQ' :
        newCourseState.lessonMediaType === 'Slides' ? 'https://docs.google.com/presentation/d/123/embed' :
        newCourseState.lessonMediaType === 'Image' ? 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800' : ''
      )
    };

    const isApproved = currentUser?.role !== 'Editor';

    // Combine any already added questions + current question fields (if filled)
    const finalQuizQuestions = [...addedQuizQuestions];
    if (newCourseState.quizQuestion.trim()) {
      const qType = newCourseState.quizType || 'SingleChoice';
      let options: string[] = [];
      let pairs: { left: string; right: string }[] = [];
      let correctAnswer = '';

      if (qType === 'SingleChoice') {
        options = newCourseState.quizOptionsStr
          ? newCourseState.quizOptionsStr.split('\n').map(o => o.trim()).filter(Boolean)
          : ['ใช่ เพื่อความปลอดภัยสูงสุดและเสถียรภาพ', 'ไม่จำเป็น', 'ขึ้นอยู่กับดุลยพินิจ'];
        correctAnswer = newCourseState.quizCorrectAnswer.trim() || options[0];
      } else if (qType === 'TrueFalse') {
        options = ['ถูก (True)', 'ผิด (False)'];
        correctAnswer = newCourseState.quizCorrectAnswer.trim() || 'ถูก (True)';
      } else if (qType === 'Matching') {
        const lines = newCourseState.quizOptionsStr.split('\n').map(o => o.trim()).filter(Boolean);
        const parsedPairs: { left: string; right: string }[] = [];
        const correctMap: Record<string, string> = {};
        lines.forEach(line => {
          let parts = line.split('=');
          if (parts.length < 2) parts = line.split(':');
          if (parts.length >= 2) {
            const left = parts[0].trim();
            const right = parts.slice(1).join('=').trim();
            if (left && right) {
              parsedPairs.push({ left, right });
              correctMap[left] = right;
            }
          }
        });
        if (parsedPairs.length > 0) {
          pairs = parsedPairs;
          options = parsedPairs.map(p => p.right);
          correctAnswer = JSON.stringify(correctMap);
        } else {
          options = ['ตัวเลือก 1', 'ตัวเลือก 2'];
          correctAnswer = 'ตัวเลือก 1';
        }
      } else if (qType === 'Essay') {
        options = [];
        correctAnswer = newCourseState.quizCorrectAnswer.trim() || '(เกณฑ์ตอบคำถามอัตนัยปลายเปิด)';
      }

      finalQuizQuestions.push({
        id: `q-${Date.now()}-curr`,
        question: newCourseState.quizQuestion.trim(),
        type: qType,
        options,
        pairs: pairs.length > 0 ? pairs : undefined,
        correctAnswer
      });
    }

    // Fallback if no questions are added at all
    if (finalQuizQuestions.length === 0) {
      finalQuizQuestions.push({
        id: `q-${Date.now()}-fallback`,
        question: 'ข้อความประเมินความเข้าใจท้ายวิชา?',
        type: 'SingleChoice',
        options: ['ใช่ เพื่อความปลอดภัยสูงสุดและเสถียรภาพ', 'ไม่จำเป็น', 'ขึ้นอยู่กับดุลยพินิจ'],
        correctAnswer: 'ใช่ เพื่อความปลอดภัยสูงสุดและเสถียรภาพ'
      });
    }

    const prepared: Course = {
      id: `c-${Date.now()}`,
      title: newCourseState.title,
      description: newCourseState.description,
      type: newCourseState.type,
      minPassScore: Number(newCourseState.minPassScore) || 80,
      durationHours: newCourseState.durationHours || '2 ชั่วโมง',
      targetPositions: newCourseState.targetPositions.length > 0 ? newCourseState.targetPositions : ['Warehouse Staff'],
      lessons: [firstLesson],
      quiz: finalQuizQuestions,
      isApproved,
      createdByRole: currentUser?.role || 'Guest'
    };

    onAddCourse(prepared);
    setIsAddOpen(false);
    
    if (isApproved) {
      alert(`✅ บันทึกและเปิดใช้งานหลักสูตร "${prepared.title}" เรียบร้อยแล้ว!`);
    } else {
      alert(`📝 บันทึกหลักสูตร "${prepared.title}" สำเร็จ!\nเนื่องจากคุณมีสถานะเป็น Editor หลักสูตรนี้จะอยู่ในสถานะ "รออนุมัติ" และต้องรอให้ Admin อนุมัติจึงจะเปิดให้พนักงานเริ่มเรียนได้`);
    }
    
    if (prepared.type === 'Onboarding') {
      setSelectedOnboardingCourseId(prepared.id);
      setActiveSubTab('onboarding');
    } else {
      setSelectedGeneralCourseId(prepared.id);
      setActiveSubTab('general');
    }
    
    // Clear states with defaults
    setNewCourseState({
      title: '',
      description: '',
      type: 'Onboarding',
      durationHours: '2 ชั่วโมง',
      minPassScore: 80,
      targetPositions: ['Warehouse Staff'],
      lessonTitle: 'บทเรียนย่อยที่ 1: ขั้นตอนสากลและการจัดสรรงานเบื้องต้น',
      lessonContent: 'รายละเอียดวาระเนื้อหาประกอบการศึกษา พนักงานต้องเข้าใจเกณฑ์คุณภาพ คู่มือ ISO9001 และระเบียบขั้นตอนการทำงาน...',
      lessonMediaType: 'Text',
      lessonMediaUrl: '',
      quizQuestion: 'พนักงานทุกคนต้องปฏิบัติตามมาตรฐานคู่มือปฏิบัติงาน (WI) อย่างเคร่งครัดหรือไม่?',
      quizOptionsStr: 'ใช่ เพื่อความปลอดภัยสูงสุดและเสถียรภาพ\nไม่จำเป็นใดๆ\nขึ้นอยู่กับความเร่งของรอบกะผลิต',
      quizCorrectAnswer: 'ใช่ เพื่อความปลอดภัยสูงสุดและเสถียรภาพ',
      simulatedFileName: '',
      isSimulatedUploading: false
    });
  };

  const handleEditCourseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse || !editingCourse.title || !editingCourse.description) return;

    let parsedLessons = editingCourse.lessons;
    let parsedQuiz = editingCourse.quiz;
    
    try {
      if (editingCourse.lessonsStr) {
        parsedLessons = JSON.parse(editingCourse.lessonsStr);
      }
      if (editingCourse.quizStr) {
        parsedQuiz = JSON.parse(editingCourse.quizStr);
      }
    } catch (err) {
      alert("ข้อมูลโครงสร้างรูปแบบบทเรียนหรือข้อสอบมีข้อผิดพลาดทาง JSON ไวยากรณ์ กรุณาตรวจสอบวงเล็บเหลี่ยมปีกกาอีกครั้ง");
      return;
    }

    const updated: Course = {
      id: editingCourse.id,
      title: editingCourse.title,
      description: editingCourse.description,
      type: editingCourse.type,
      minPassScore: Number(editingCourse.minPassScore) || 80,
      durationHours: editingCourse.durationHours || '2 ชั่วโมง',
      lessons: parsedLessons,
      quiz: parsedQuiz,
      targetPositions: editingCourse.targetPositions || ['QC', 'Warehouse Staff'],
    };

    onUpdateCourse(updated);
    setIsEditOpen(false);
    setEditingCourse(null);
  };

  // Trigger historic Certificate preview anytime from history log
  const handleViewHistoricCertificate = (targetCourseId: string) => {
    const targetCourseObj = courses.find(c => c.id === targetCourseId);
    if (targetCourseObj) {
      setCertificateCourseOverride(targetCourseObj);
      setShowCertificate(true);
      setActiveLessonIndex(null);
      setIsTakingQuiz(false);
    }
  };

  // Determine which course is rendered on the certificate (either currently taking, or chosen from transcript history!)
  const activeCertificateCourse = certificateCourseOverride || selectedCourse;
  const isOnboardingCert = activeCertificateCourse?.type === 'Onboarding';

  return (
    <div className="space-y-6">
      {/* 1. Header Hero Panel */}
      <div className="bg-gradient-to-r from-[#15329c]/10 via-white to-white p-6 rounded-2xl border border-l-4 border-l-[#15329c] border-[#e1ded5] shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-[#15329c] text-white px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                LMS Platform
              </span>
              <span className="text-[11px] text-slate-500 font-mono">ISO 9001:2015 COMPLIANCE</span>
            </div>
            <h2 className="text-lg font-black text-slate-900 mt-1">
              สถาบันพัฒนาทักษะวิชาชีพและการรับรอง (RMP Training Academy)
            </h2>
            <p className="text-xs text-slate-505 mt-1 leading-relaxed">
              ศูนย์รวมคอร์สปฐมนิเทศพนักงานใหม่ และหลักสูตรฝึกฝนมาตรฐานออไซต์เพื่อตอบรับการเกณฑ์ประกันระบบคุณภาพอุตสาหกรรมอย่างเป็นระบบ
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Editor') && (
              <button
                id="btn-admin-add-course"
                onClick={() => setIsAddOpen(true)}
                className="bg-indigo-650 hover:bg-indigo-750 text-black text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                สร้างหลักสูตรใหม่
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Collapsible Badges Panel */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-205">
              <Trophy className="w-5 h-5 fill-amber-300" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-slate-800">
                เหรียญเกียรติยศและคุณวุฒิวิชาชีพสะสมของคุณ (Your Earned Badges)
              </h3>
              <p className="text-[10.5px] text-slate-550 mt-0.5">
                ปลดล็อคเข็มประดับทักษะพิเศษ <strong className="text-indigo-700">{activeEarnedBadges.length} / {myBadges.length}</strong> แฟ้มผลงาน จากประวัติการเรียน ผลสอบ และผลงาน Kaizen
              </p>
            </div>
          </div>

          <button
            id="toggle-all-badges-btn"
            type="button"
            onClick={() => setShowBadgesPanel(!showBadgesPanel)}
            className="text-[10.5px] font-bold text-[#15329c] bg-blue-50/50 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-[#15329c]/15 transition-all cursor-pointer self-start sm:self-auto shrink-0"
          >
            {showBadgesPanel ? '▲ ซ่อนเกณฑ์คุณวุฒิ' : '▼ ดูรายการตราสัญลักษณ์ทั้งหมด'}
          </button>
        </div>

        {/* Small preview of active earned badges */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mr-1">ตราคุณวุฒิตรงสิทธิ์:</span>
          {activeEarnedBadges.length === 0 ? (
            <span className="text-slate-400 text-[10px] font-medium italic">ยังไม่มีรางวัลตราสะสม พักเรียนคอร์สแรกหรือเช็คชื่อ QR คลาสเพื่อสะสมเหรียญตราได้ทันที!</span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {myBadges.map(badge => (
                <BadgePill key={badge.id} badge={badge} />
              ))}
            </div>
          )}
        </div>

        {showBadgesPanel && (
          <div className="pt-4 border-t border-slate-100 animate-in fade-in duration-200">
            <UserBadgesGrid badges={myBadges} />
          </div>
        )}
      </div>

      {/* 3. Main Sub-Navigation Area */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto min-w-0">
        <button
          onClick={() => {
            setActiveSubTab('onboarding');
            setActiveLessonIndex(null);
            setIsTakingQuiz(false);
            setShowCertificate(false);
            setCertificateCourseOverride(null);
          }}
          className={`px-4 py-2.5 text-xs font-extrabold whitespace-nowrap border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'onboarding'
              ? 'border-[#15329c] text-[#15329c]'
              : 'border-transparent text-slate-500 hover:text-slate-705'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          🔰 อบรมปูพื้นฐานพนักงานใหม่ (Onboarding)
        </button>

        <button
          onClick={() => {
            setActiveSubTab('general');
            setActiveLessonIndex(null);
            setIsTakingQuiz(false);
            setShowCertificate(false);
            setCertificateCourseOverride(null);
          }}
          className={`px-4 py-2.5 text-xs font-extrabold whitespace-nowrap border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'general'
              ? 'border-[#15329c] text-[#15329c]'
              : 'border-transparent text-slate-500 hover:text-slate-705'
          }`}
        >
          <Award className="w-4 h-4" />
          🎯 พัฒนาทักษะและสมรรถนะเทคนิค (Competency)
        </button>

        <button
          onClick={() => {
            setActiveSubTab('competency');
            setActiveLessonIndex(null);
            setIsTakingQuiz(false);
            setShowCertificate(false);
            setCertificateCourseOverride(null);
          }}
          className={`px-4 py-2.5 text-xs font-extrabold whitespace-nowrap border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'competency'
              ? 'border-[#15329c] text-[#15329c]'
              : 'border-transparent text-slate-500 hover:text-slate-705'
          }`}
        >
          <ListTodo className="w-4 h-4 text-emerald-600" />
          📊 แผนผังประเมินทักษะ & Skill Gap (Skills Map)
        </button>

        <button
          onClick={() => {
            setActiveSubTab('career-ai');
            setActiveLessonIndex(null);
            setIsTakingQuiz(false);
            setShowCertificate(false);
            setCertificateCourseOverride(null);
          }}
          className={`px-4 py-2.5 text-xs font-extrabold whitespace-nowrap border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'career-ai'
              ? 'border-[#c52be6] text-[#c52be6]'
              : 'border-transparent text-slate-500 hover:text-slate-705'
          }`}
        >
          <Sparkles className="w-4 h-4 text-violet-600 animate-pulse" />
          🤖 แผนการเรียนรู้เฉพาะบุคคล AI (Personalized Roadmaps)
        </button>

        <button
          onClick={() => {
            setActiveSubTab('qr');
            setActiveLessonIndex(null);
            setIsTakingQuiz(false);
            setShowCertificate(false);
            setCertificateCourseOverride(null);
          }}
          className={`px-4 py-2.5 text-xs font-extrabold whitespace-nowrap border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'qr'
              ? 'border-[#15329c] text-[#15329c]'
              : 'border-transparent text-slate-500 hover:text-slate-705'
          }`}
        >
          <QrCode className="w-4 h-4" />
          📸 ตู้สแกนคิวอาร์ห้องปฏิบัติการ (QR Attendance)
        </button>

        <button
          onClick={() => {
            setActiveSubTab('transcript');
            setActiveLessonIndex(null);
            setIsTakingQuiz(false);
            setShowCertificate(false);
            setCertificateCourseOverride(null);
          }}
          className={`px-4 py-2.5 text-xs font-extrabold whitespace-nowrap border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'transcript'
              ? 'border-[#e51a24] text-[#e51a24]'
              : 'border-transparent text-slate-550 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-[#e51a24]" />
          📋 ระเบียนคะแนนและผลเรียนของฉัน (My Portfolio Logs)
        </button>
      </div>

      {/* 4. Active tab container display */}
      {activeSubTab === 'transcript' ? (
        /* TRANSCRIPT TAB - PERSONAL PORTFOLIO SCOREBOARD LOG */
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6 animate-fade-in text-slate-800">
          
          {/* Identity Header */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#15329c]/10 text-[#15329c] rounded-full flex items-center justify-center font-black text-sm">
                {currentUser.name[0]}
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">{currentUser.name}</h4>
                <p className="text-slate-500 text-[11px] font-mono mt-0.5">
                  รหัสพนักงาน: {currentUser.employeeId} | รหัสบทรุ่น: {currentUser.role}
                </p>
                <p className="text-[11px] text-slate-655 font-bold mt-0.5">
                  🏢 แผนกคลังสินค้าประตูดำ: {currentUser.department} ({currentUser.position})
                </p>
              </div>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200 text-left md:text-right text-xs shrink-0 font-mono text-slate-550 space-y-0.5">
              <p>ระบบตรวจสอบคะแนนสอบและใบเซอร์รายบุคคล</p>
              <p className="text-[#a21217] font-bold">บริษัท รอแยล เมอิวะ แพ็คซ์ จำกัด</p>
            </div>
          </div>

          {/* Key Stat Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-indigo-50/50 to-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">ผ่านการอบรมเสร็จสิ้น</span>
                <span className="text-xl font-black text-slate-800 font-mono mt-1 block">
                  {myCompletedCoursesCount} / {courses.length}
                </span>
                <span className="text-[10px] text-slate-450 mt-0.5 block">วิชาในสารระบบหลัก</span>
              </div>
              <Trophy className="w-8 h-8 opacity-20 text-indigo-700" />
            </div>

            <div className="bg-gradient-to-br from-emerald-50/50 to-emerald-50 p-4 rounded-xl border border-emerald-100 flex items-center justify-between">
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">คะแนนสอบเฉลี่ยของฉัน</span>
                <span className="text-xl font-black text-slate-800 font-mono mt-1 block">
                  {myAverageQuizScore}%
                </span>
                <span className="text-[10px] text-slate-450 mt-0.5 block">เกณฑ์ผ่านหลักคือ {80}%</span>
              </div>
              <Award className="w-8 h-8 opacity-20 text-emerald-700" />
            </div>

            <div className="bg-gradient-to-br from-amber-50/50 to-amber-50 p-4 rounded-xl border border-amber-100 flex items-center justify-between">
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">ตราเกียรติยศที่ครอบครอง</span>
                <span className="text-xl font-black text-slate-800 font-mono mt-1 block">
                  {activeEarnedBadges.length} เหรียญ
                </span>
                <span className="text-[10px] text-indigo-700 font-bold mt-0.5 block">คลังสมรรถนะวิชาชีพ</span>
              </div>
              <Sparkles className="w-8 h-8 opacity-20 text-amber-500" />
            </div>

            <div className="bg-gradient-to-br from-slate-50 to-[#fbfbf9] p-4 rounded-xl border border-slate-205 flex items-center justify-between">
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">ความพยายามสอบทั้งหมด</span>
                <span className="text-xl font-black text-slate-800 font-mono mt-1 block">
                  {myExams.length} ครั้ง
                </span>
                <span className="text-[10px] text-slate-450 mt-0.5 block">เฉลี่ยต่อหลักสูตร</span>
              </div>
              <CheckCircle className="w-8 h-8 opacity-20 text-slate-500" />
            </div>
          </div>

          {/* Chronological Table of Exam Results */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="font-extrabold text-[#15329c] text-xs uppercase tracking-wider">
                📊 ระเบียนประวัติคะแนนสอบและสถานะใบเซอร์ฯ (Certification & Exam Results Transcripts)
              </h5>
              <span className="text-[10.5px] text-slate-450 italic">อัปเดตแบบเรียลไทม์บันทึกเข้าระบบ ISO ตรวจสอบ</span>
            </div>

            {myExams.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border rounded-2xl text-slate-400 italic text-xs">
                ยังไม่พบข้อมูลการบันทึกประวัติการทำข้อสอบของคุณในสังกัดบัญชีนี้ พักทดสอบความรู้วิชาแรกเพื่อเปิดใช้รายงานสมุดคะแนน!
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-xl divide-y text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[10.5px] uppercase font-bold text-slate-500 tracking-wider">
                      <th className="p-3">รหัสวิชา</th>
                      <th className="p-3">ชื่อหลักสูตรอบรม</th>
                      <th className="p-3">ประเภท</th>
                      <th className="p-3">วันที่ทดสอบ</th>
                      <th className="p-3 text-center">คะแนนที่ได้</th>
                      <th className="p-3 text-center">เกณฑ์ประเมิน</th>
                      <th className="p-3 text-center">หลักฐานใบเซอร์</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-700">
                    {myExams.map((exam, idx) => {
                      const courseObj = courses.find(c => c.id === exam.courseId);
                      const minPass = courseObj?.minPassScore || 80;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition">
                          <td className="p-3 text-slate-500 font-mono font-bold">{exam.courseId || `N/A`}</td>
                          <td className="p-3">
                            <span className="font-extrabold text-slate-800 block">{exam.courseTitle}</span>
                          </td>
                          <td className="p-3">
                            {courseObj?.type === 'Onboarding' ? (
                              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded border border-blue-200">Onboarding</span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] rounded border border-amber-200">Competency</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-550 font-mono">{exam.date}</td>
                          <td className="p-3 text-center">
                            <div className="inline-block">
                              <span className={`text-xs font-black font-mono ${exam.score >= minPass ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {exam.score}%
                              </span>
                              <div className="w-14 h-1 w-full bg-slate-200 rounded-full mt-0.5 overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${exam.score >= minPass ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                  style={{ width: `${Math.min(exam.score, 100)}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            {exam.pass ? (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-full">
                                <CheckCircle className="w-3.5 h-3.5" /> ผ่านหลักสูตร
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                                <X className="w-3.5 h-3.5" /> ตกเกณฑ์
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {exam.pass ? (
                              <button
                                onClick={() => handleViewHistoricCertificate(exam.courseId)}
                                className="bg-[#15329c] text-white hover:bg-[#11297e] font-bold text-[10.5px] px-2.5 py-1 rounded-lg cursor-pointer flex items-center gap-1 mx-auto transition"
                              >
                                <Award className="w-3.5 h-3.5" />
                                เปิดใบรับรอง
                              </button>
                            ) : (
                              <span className="text-slate-400 italic text-[10.5px]">สอบแก้ตัวใหม่</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Certificate Area Overlay inside the tab in case displayed */}
          {showCertificate && activeCertificateCourse && (
            <div className="border-t-4 border-dashed border-slate-200 pt-6 mt-6 animate-fade-in text-center space-y-4">
              <div className="flex items-center justify-between border-b pb-2 mb-4 bg-slate-50 p-2.5 rounded-xl">
                <span className="font-bold text-xs text-indigo-700 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4" /> ใบประกาศกิตติคุณรับรองระบบมาตรฐาน: {activeCertificateCourse.title}
                </span>
                <button
                  onClick={() => {
                    setShowCertificate(false);
                    setCertificateCourseOverride(null);
                  }}
                  className="p-1 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> ปิดพรีวิวใบรับรอง
                </button>
              </div>

              {/* Real Certificate Frame based on course types */}
              {isOnboardingCert ? (
                /* ONBOARDING CERTIFICATE */
                <div className="bg-gradient-to-br from-[#ffffff] via-[#fffdf9] to-[#ffffff] p-8 rounded-2xl border-4 border-double border-amber-300 shadow-lg max-w-xl mx-auto space-y-6 relative overflow-hidden text-slate-800">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-3 pointer-events-none text-6xl font-extrabold uppercase font-sans select-none tracking-widest leading-normal">
                    ROYAL MEIWA PAX
                  </div>

                  <div className="flex justify-center">
                    <span className="p-4 bg-amber-50 text-amber-505 rounded-full border border-amber-200 inline-block shadow-xs">
                      <Sparkles className="w-10 h-10 animate-pulse text-amber-500" />
                    </span>
                  </div>

                  <div className="space-y-1 text-center">
                    <h2 className="font-serif text-amber-800 font-extrabold text-lg sm:text-2xl uppercase tracking-widest">
                      Certificate of Competency
                    </h2>
                    <p className="text-[9px] text-slate-450 font-mono tracking-wider">
                      ROYAL MEIWA PAX CO., LTD. • KNOWLEDGE MANAGEMENT PLATFORM
                    </p>
                  </div>

                  <div className="text-center">
                    <p className="text-slate-500 text-[11px] italic">ใบประกาศนียบัตรอุตสาหกรรมฉบับนี้พร้อมประทับรับรองสิทธิ์ให้กับ:</p>
                    <p className="text-slate-900 font-black text-base sm:text-xl underline decoration-double decoration-amber-400 mt-1.5 font-sans">
                      {currentUser.name}
                    </p>
                    <p className="text-[10px] text-slate-450 mt-1 font-mono">รหัสเจ้าหน้าที่ระดับ: {currentUser.employeeId}</p>
                  </div>

                  <div className="max-w-md mx-auto py-3 px-4 bg-white/80 border border-slate-150 rounded-xl leading-relaxed text-center">
                    <p className="text-[10px] text-slate-505">ผ่านการวัดทักษะมาตรฐานและตรวจสอบหลักสูตรปปพื้นฐานพนักงานใหม่:</p>
                    <p className="text-[11.5px] font-extrabold text-slate-800 mt-1">
                      {activeCertificateCourse.title}
                    </p>
                    <p className="text-[10px] text-emerald-600 font-mono font-bold mt-1.5 bg-emerald-50 py-0.5 px-2 rounded-full inline-block border border-emerald-150">
                      ผ่านหลักประกันระบบด้วยคะแนนสะสม {relevantResult?.score || quizScore || 100}% (เกณฑ์ขั้นต่ำ 80%)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-6 text-[10px] text-slate-600 border-t border-slate-100">
                    <div className="space-y-1 text-left leading-normal pl-4">
                      <p className="font-serif text-slate-800 font-bold whitespace-nowrap">เกียรติประวัติบริษัท รอแยล เมอิวะ แพ็คซ์</p>
                      <p className="text-[8px] text-slate-400 uppercase font-mono">Audit ISO9001 APPROVED EVIDENCE</p>
                    </div>

                    <div className="space-y-1 text-right leading-normal pr-4">
                      <div className="text-[#a21217] text-xs italic font-semibold leading-none font-serif">Sirima S.</div>
                      <p className="font-extrabold text-slate-800">สิริมา แสงสะอาด</p>
                      <p className="text-[8.5px] text-slate-405">Managing Director (MD)</p>
                    </div>
                  </div>
                </div>
              ) : (
                /* GENERAL QUALITY COMPLIANCE CERTIFICATE */
                <div className="bg-gradient-to-br from-[#ffffff] via-[#f7fbfd] to-[#ffffff] p-8 rounded-2xl border-4 border-double border-teal-500 shadow-lg max-w-xl mx-auto space-y-6 relative overflow-hidden text-slate-800">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-3 pointer-events-none text-6xl font-extrabold uppercase font-sans select-none tracking-widest leading-normal">
                    ROYAL MEIWA PAX
                  </div>

                  <div className="flex justify-center animate-bounce-slow">
                    <span className="p-3.5 bg-emerald-50 text-emerald-600 rounded-full border-4 border-white shadow-md inline-block">
                      <Trophy className="w-10 h-10 fill-amber-300 text-amber-500" />
                    </span>
                  </div>

                  <div className="space-y-1 text-center">
                    <h2 className="font-serif text-teal-800 font-extrabold text-lg sm:text-xl uppercase tracking-widest">
                      Certificate of Compliance
                    </h2>
                    <p className="text-[9px] text-slate-400 font-mono tracking-wider">
                      ROYAL MEIWA PAX CO., LTD. • QUALITY CONTROL & COMPLIANCE SYSTEM
                    </p>
                  </div>

                  <div className="text-center">
                    <p className="text-slate-500 text-[11px] italic">ด้วยสัตย์พิสูจน์ขอประกาศรับรองทักษะและมาตรฐานงานฉบับนี้บำบัด:</p>
                    <p className="text-slate-900 font-black text-base sm:text-lg underline decoration-double decoration-teal-600 mt-2 font-sans">
                      {currentUser.name}
                    </p>
                    <p className="text-[10px] text-slate-450 mt-1 font-mono">
                      ตำแหน่ง: {currentUser.position} | ฝ่ายวิเคราะห์: {currentUser.department}
                    </p>
                  </div>

                  <div className="py-3 px-4 bg-white/90 border border-slate-150 rounded-xl max-w-md mx-auto text-center">
                    <p className="text-[10px] text-slate-600">ผ่านการกวดขันความรู้ทักษะโรงงานและการสอบใบประเมินมาตรฐานเสาหลักที่ 5:</p>
                    <p className="text-[11.5px] font-bold text-indigo-900 mt-1">{activeCertificateCourse.title}</p>
                    <p className="text-[10px] text-emerald-600 font-bold mt-1 bg-emerald-50/70 inline-block px-2.5 py-0.5 rounded-full">
                      สอบผ่านด้วยเกณฑ์คะแนนสะสม {relevantResult?.score || quizScore || 100}%
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-100 text-[10px] text-slate-600">
                    <div className="space-y-1 text-left pl-4">
                      <p className="italic text-slate-500">ISO Internal Evidence Logs</p>
                      <p className="font-extrabold text-slate-750">ขบวนการจัดเก็บออฟไลน์ / ออนไลน์สิทธิ์</p>
                    </div>

                    <div className="space-y-1 text-right pr-4">
                      <span className="block italic text-slate-405 font-serif">Darin Saetang</span>
                      <p className="font-extrabold text-slate-800">ดารินทร์ แซ่ตั้ง</p>
                      <p className="text-[8.5px] text-slate-405">QA/QC supervisor (Lead Auditor)</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-3 text-xs font-semibold">
                <button
                  onClick={() => alert(`สั่งพิมพ์เกียรติบัตรรับรองสำหรับคุณ ${currentUser.name} เพื่อบันทึกลงแฟ้มประเมินทักษะบุคคลและจัดเตรียมหลักฐานรับ ISO`)}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  พิมพ์เอกสารรับการรับรอง (Export PDF)
                </button>
                <button
                  onClick={() => {
                    setShowCertificate(false);
                    setCertificateCourseOverride(null);
                  }}
                  className="bg-slate-150 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  ปิดหน้านี้
                </button>
              </div>
            </div>
          )}

          {/* Live KM Gamification & Leaderboard Section */}
          <div className="border-t border-slate-200/80 pt-6 mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Leaderboard Table */}
              <div className="space-y-3.5">
                <div className="flex justify-between items-center bg-[#fbfbf9] p-3 rounded-xl border border-slate-200/60">
                  <h5 className="font-extrabold text-[#15329c] text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-500 fill-amber-350" />
                    รังผึ้งปัญญาผู้แบ่งปันความรู้ดีเด่น (Top RMP KM Contributors)
                  </h5>
                  <span className="bg-amber-100 text-amber-900 font-mono text-[9px] px-2 py-0.5 rounded font-bold">LIVE RANK</span>
                </div>

                <div className="overflow-hidden border border-slate-200 rounded-xl bg-white text-xs divide-y">
                  {rawLeaderboard.slice(0, 5).map((entrant, idx) => {
                    const isCurrentUser = entrant.userId === currentUser.id;
                    return (
                      <div key={entrant.userId} className={`p-3 flex items-center justify-between gap-3 ${isCurrentUser ? 'bg-amber-50/40 font-bold' : 'hover:bg-slate-50'}`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-bold ${idx === 0 ? 'bg-amber-100 text-amber-805 text-xs' : idx === 1 ? 'bg-slate-200 text-slate-805' : idx === 2 ? 'bg-orange-100 text-orange-850' : 'bg-slate-50 text-slate-400'}`}>
                            {idx + 1}
                          </span>
                          <span className="truncate text-slate-805 text-[12px]">{entrant.userName}</span>
                          {isCurrentUser && (
                            <span className="bg-[#15329c] text-white font-bold px-1 rounded text-[8.5px] uppercase">คุณ</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-slate-505 text-[10.5px]">Lvl {entrant.level}</span>
                          <strong className="text-indigo-850 font-mono text-[12px] text-right">{entrant.points} XP</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* User's recent Points contribution logs */}
              <div className="space-y-3.5">
                <div className="flex justify-between items-center bg-[#fbfbf9] p-3 rounded-xl border border-slate-200/60">
                  <h5 className="font-extrabold text-slate-850 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-4 h-4 text-slate-550" />
                    ประวัติการสะสมคะแนนของฉัน (My KM Activity logs)
                  </h5>
                  <span className="bg-indigo-50 text-indigo-805 font-mono text-[9px] px-2 py-0.5 rounded font-black">ISO COMPLIANT</span>
                </div>

                {kmContributionLogs.filter(log => log.userId === currentUser.id).length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl text-slate-400 italic text-xs">
                    ยังไม่มีกิจกรรมสะสมเกียรติยศบันทึกไว้ ณ ขณะนี้
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-[220px] pr-1.5 border border-slate-200 rounded-xl divide-y text-xs bg-white">
                    {kmContributionLogs.filter(log => log.userId === currentUser.id).map(log => {
                      let badgeBg = 'bg-slate-50 text-slate-600';
                      if (log.activityType === 'COURSE_PERFECT') badgeBg = 'bg-amber-50 text-amber-805 border-amber-200';
                      else if (log.activityType === 'COURSE_PASS') badgeBg = 'bg-emerald-50 text-emerald-800 border-emerald-250';
                      else if (log.activityType === 'KB_CONTRIBUTION') badgeBg = 'bg-blue-50 text-blue-800 border-blue-200';
                      else if (log.activityType === 'OFFLINE_CHECKIN') badgeBg = 'bg-indigo-50 text-indigo-800 border-indigo-200';

                      return (
                        <div key={log.id} className="p-3 hover:bg-slate-5/50 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-[11.5px]">{log.description}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {new Date(log.timestamp).toLocaleString('th-TH')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[8.5px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${badgeBg}`}>
                              {log.activityType.replace('_', ' ')}
                            </span>
                            <strong className="text-emerald-600 font-mono">+{log.points} XP</strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      ) : activeSubTab === 'competency' ? (
        /* COMPETENCY MATRIX & SKILL GAP TRACKING */
        <div className="bg-white p-6 rounded-2xl border border-slate-205 shadow-xs space-y-6 animate-fade-in text-slate-800">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <span className="text-[10px] text-[#15329c] font-bold uppercase tracking-widest block font-mono">
                COMPETENCY MATRIX & SKILL GAP // สมรรถนะและช่องว่างทักษะโรงงาน
              </span>
              <h2 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                <ListTodo className="w-5 h-5 text-emerald-600 animate-bounce" />
                แผนผังประเมินทักษะพนักงานรายบุคคล (Skills Alignment)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                เปรียบเทียบขีดความสามารถปัจจุบันของคุณกับระดับความรู้รับเป้าในตำแหน่ง <strong className="text-[#15329c] font-black">{currentUser.position}</strong> (แผนก {currentUser.department})
              </p>
            </div>
            
            {/* KPI Summary badges */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 flex gap-4 text-xs">
              <div className="text-center">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">ทักษะทั้งหมด</span>
                <strong className="text-base text-slate-800 font-mono">{myCompetencies.length}</strong>
              </div>
              <div className="border-r border-slate-200" />
              <div className="text-center">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">พบช่องว่าง (Gap)</span>
                <strong className="text-base text-[#e51a24] font-mono">{myCompetencies.filter(c => c.actualLevel < c.expectedLevel).length}</strong>
              </div>
              <div className="border-r border-slate-200" />
              <div className="text-center">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">ผ่านเกณฑ์แล้ว</span>
                <strong className="text-base text-emerald-600 font-mono">{myCompetencies.filter(c => c.actualLevel >= c.expectedLevel).length}</strong>
              </div>
            </div>
          </div>

          {/* Certificate expire notifications or mandatory alerting bar */}
          {myCertificates.some(cert => cert.status === 'Expired' || cert.status === 'ExpiringSoon') && (
            <div className="p-4 bg-orange-50 border-l-4 border-orange-500 text-orange-950 rounded-r-2xl text-xs space-y-2 animate-pulse">
              <div className="flex items-center gap-2 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-orange-600" />
                <span>⚠️ คำเตือนสิ่งสำคัญ: ใบรับรองมาตรฐานสารบัญญัติ ISO ของคุณพ้นระยะคุ้มครองแล้ว!</span>
              </div>
              <div className="space-y-1 text-slate-700">
                {myCertificates.filter(cert => cert.status === 'Expired' || cert.status === 'ExpiringSoon').map(cert => (
                  <p key={cert.id}>
                    • คอร์ส <strong className="text-slate-900 font-bold">"{cert.title}"</strong> ({cert.type}) สถานะ: 
                    <span className={`mx-1.5 px-2 py-0.5 rounded-full font-bold text-[8.5px] ${cert.status === 'Expired' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-900'}`}>{cert.status === 'Expired' ? 'หมดอายุถาวร' : 'ใกล้หมดอายุ (ภายใน 30 วัน)'}</span>
                    (หมดอายุช่วง {cert.expiryDate}) กรุณากระชับประเมินทบทวนคอร์สเพื่ออัพใบเซอร์ต่อสัญญาอายุการรับรองใหม่
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* List of skills map */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {myCompetencies.map(comp => {
              const gap = comp.actualLevel - comp.expectedLevel;
              const hasGap = gap < 0;
              
              // Find matching courses for this skill to provide as Bridge Actions
              const recommendedCourse = courses.find(c => 
                c.title.toLowerCase().includes(comp.skillName.toLowerCase()) ||
                (c.tags && c.tags.some(t => t.toLowerCase() === comp.skillName.toLowerCase() || comp.category.toLowerCase().includes(t.toLowerCase())))
              );
              // Find matching SOP documents
              const recommendedDoc = documents.find(d => 
                d.title.toLowerCase().includes(comp.skillName.toLowerCase()) || 
                (d.tags && d.tags.some(t => comp.skillName.toLowerCase().includes(t.toLowerCase())))
              );

              return (
                <div key={comp.id} className={`p-4 rounded-3xl border transition-all ${hasGap ? 'border-amber-200 bg-amber-50/10' : 'border-slate-100 bg-white'} space-y-3`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono block">
                        {comp.category}
                      </span>
                      <h3 className="font-extrabold text-[12.5px] text-slate-800 mt-0.5">{comp.skillName}</h3>
                    </div>
                    {hasGap ? (
                      <span className="bg-rose-50 border border-rose-200 text-[#e51a24] text-[9px] font-extrabold px-1.5 py-0.5 rounded font-mono">
                        Gap {gap} Lvl
                      </span>
                    ) : (
                      <span className="bg-emerald-50 border border-emerald-200 text-[#129a6c] text-[9px] font-extrabold px-1.5 py-0.5 rounded font-mono">
                        ตามเกณฑ์เป้าหมาย
                      </span>
                    )}
                  </div>

                  {/* Level status progress representation */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-bold text-slate-550">
                      <span>ระดับความรู้จริง: L{comp.actualLevel}</span>
                      <span>คาดหวังตามตำแหน่ง {currentUser.position}: L{comp.expectedLevel}</span>
                    </div>
                    
                    {/* Visual 4-cell progress bar */}
                    <div className="grid grid-cols-4 gap-1.5 pt-1">
                      {[1, 2, 3, 4].map(idx => {
                        const isExpected = idx === comp.expectedLevel;
                        const isActual = idx <= comp.actualLevel;
                        let cellBg = 'bg-slate-150';
                        if (isActual) {
                          cellBg = hasGap ? 'bg-amber-400' : 'bg-emerald-500';
                        }
                        
                        return (
                          <div key={idx} className="relative">
                            <div className={`h-2 rounded-full ${cellBg} transition-colors`} />
                            {isExpected && (
                              <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[7.5px] font-black font-mono text-slate-400 flex flex-col items-center">
                                <span className="w-1 h-1 rounded-full bg-slate-400 mb-0.5" />
                                TARGET
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Descriptions of actual competence levels */}
                  <div className="pt-2 text-[10px] text-slate-500 italic leading-snug">
                    <strong className="text-slate-700 block not-italic font-bold font-mono">ความหมายทักษะระดับ L{comp.actualLevel}:</strong>
                    {comp.actualLevel === 1 && "รู้หลักการหรือเรียนทฤษฎี (Level 1)"}
                    {comp.actualLevel === 2 && "ทำตามคำชี้แนะได้มาตรฐาน (Level 2)"}
                    {comp.actualLevel === 3 && "ทำได้ด้วยตัวเอง คล่องชำนาญ (Level 3)"}
                    {comp.actualLevel === 4 && "ผู้เชี่ยวชาญ/แก้ปัญหา และสอนทีมงานได้ (Level 4)"}
                  </div>

                  {/* User interactive assessment option */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[9px] font-black text-slate-450 uppercase tracking-tight">ทดสอบแก้ไขจำลองระดับฝีมือ:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map(lvl => (
                        <button
                          key={lvl}
                          onClick={() => {
                            // Update user competency actual level
                            setUserCompetencies(prev => prev.map(c => {
                              if (c.id === comp.id) {
                                return { ...c, actualLevel: lvl };
                              }
                              return c;
                            }));
                            onAwardPoints(currentUser.id, 'SKILL_EVALUATION', 10, `ทำการประเมินสมรรถนะทักษะฝีมือจริง "${comp.skillName}" เป็น Lvl ${lvl}`);
                          }}
                          className={`w-5.5 h-5.5 rounded-md font-mono text-[10px] font-black transition-all flex justify-center items-center cursor-pointer border ${
                            comp.actualLevel === lvl 
                              ? 'bg-[#15329c] border-[#15329c] text-white shadow font-bold'
                              : 'bg-white border-slate-205 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* GAP Recommendation Action Bridge */}
                  {hasGap && (
                    <div className="p-2 bg-rose-50/20 border border-dashed border-rose-200 rounded-xl space-y-1.5 mt-2">
                      <p className="text-[10px] font-bold text-rose-800 flex items-center gap-1">
                        🚀 ปฏิบัติการแก้วิกฤตช่องว่างทักษะ (Skill Gap Remediation)
                      </p>
                      <div className="flex flex-wrap gap-1.5 text-[9.5px]">
                        {recommendedCourse && (
                          <button
                            onClick={() => {
                              setActiveSubTab(recommendedCourse.type === 'Onboarding' ? 'onboarding' : 'general');
                              if (recommendedCourse.type === 'Onboarding') {
                                setSelectedOnboardingCourseId(recommendedCourse.id);
                              } else {
                                setSelectedGeneralCourseId(recommendedCourse.id);
                              }
                              alert(`🧭 นำทางคุณไปยังบทเรียนและหลักสูตรชำนาญการ: "${recommendedCourse.title}"`);
                            }}
                            className="bg-indigo-100 hover:bg-indigo-150 font-bold text-indigo-950 px-2 py-0.5 rounded transition-colors cursor-pointer"
                          >
                            📖 เข้าเรียนคอร์ส: {recommendedCourse.title}
                          </button>
                        )}
                        {recommendedDoc && (
                          <button
                            onClick={() => {
                              alert(`🧭 กรุณาคลิก ค้นหา ด้านบนด้วยข้อควรอ้างอิง "${recommendedDoc.title}" เพื่อเปิดระบบ RAG คลี่คลายปัญหาอย่างถูกต้อง`);
                            }}
                            className="bg-teal-100 hover:bg-teal-150 font-bold text-teal-950 px-2 py-0.5 rounded transition-colors cursor-pointer"
                          >
                            📄 ดาวน์ไฟล์ ISO: {recommendedDoc.title.split(' // ')[0]}
                          </button>
                        )}
                        {!recommendedCourse && !recommendedDoc && (
                          <span className="text-slate-400 italic">กรุณาสอบถามศูนย์การเรียนรู้เรื่องคู่มือ ISO งานเป่าฟิล์มโรงงานเพื่อขยับทักษะนี้</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : activeSubTab === 'career-ai' ? (
        /* PERSONALIZED LEARNING PATHS BY AI */
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6 animate-fade-in text-slate-800">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 gap-4">
            <div>
              <span className="text-[10px] text-violet-600 font-bold uppercase tracking-widest block font-mono">
                AI PERSONALIZED ROADMAP PATHS // กำหนดกรอบเรียนรู้ส่วนบุคคลด้วยปัญญาประดิษฐ์
              </span>
              <h2 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                <Sparkles className="w-5 h-5 text-violet-600 animate-pulse" />
                ผู้วิเคราะห์และวางโรดแมปการเติบโตเฉพาะเจาะจงรายคน AI
              </h2>
              <p className="text-xs text-slate-450 mt-1">
                เรียนรู้วิถีขยายตัวในสายวิชาชีพของคุณ (Career Goal) วิเคราะห์โดยตรงร่วมฐานทักษะและคู่มือสิทธิ์ ISO
              </p>
            </div>
            
            <div className="flex items-center gap-2 text-xs font-mono font-bold bg-violet-50 text-violet-850 px-3 py-1.5 rounded-xl border border-violet-100">
              <span>KM LOG LEVEL: {myKMLevel}</span>
              <span>•</span>
              <span>เกียรติคะแนน: {myKMPoints} (XP)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left selector column */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10.5px] font-bold text-slate-400 uppercase block">บทบาทงานปัจจุบัน:</label>
                <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl text-xs font-bold text-slate-700">
                  {currentUser.position} (แผนก {currentUser.department})
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10.5px] font-bold text-slate-400 uppercase block">เป้าหมายก้าวรุ่งเรืองที่เป้าประสงค์ (Career Goal Target):</label>
                <select
                  value={aiTargetGoal}
                  onChange={(e) => setAiTargetGoal(e.target.value)}
                  className="w-full bg-white border border-slate-250 p-2.5 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-violet-600"
                >
                  <option value="Senior Film Extrusion Specialist (ระดับ 4 หน้างานเตาหลอมความร้อน)">
                    🔥 พนักงานคุมตู้นิรภัยเป่าฟิล์ม Lamination อาวุโส (Senior Specialist)
                  </option>
                  <option value="Lead Quality Compliance Auditor (ดูแลระบบวิเคราะห์สิ่งแปลกปลอม ISO)">
                    🧪 ผู้ตรวจประเมินบริหารคุณภาพอาวุโส (ISO Lead QA/QC Specialist)
                  </option>
                  <option value="WMS Automated Warehouse Commander (ดูแลคลังประตูดำอัจฉริยะ)">
                    📦 ตัวแทนควบคุมคลังสินค้าอัจฉริยะแบบกึ่งอัตโนมัติ (Digital Warehouse Supervisor)
                  </option>
                  <option value="Safety & Sustainability Plant Director (ดูแลระบบวิศวกรรมความรอบคอบโรงงาน)">
                    🛡️ ผู้ประสานงานบริหารความปลอดภัยโรงงานชั้นสูง (Advanced Production Plant Director)
                  </option>
                </select>
              </div>

              <button
                onClick={handleGeneratePersonalizedPath}
                disabled={aiLoading}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-650 text-white rounded-xl py-2.5 px-4 text-xs font-extrabold hover:opacity-90 transition disabled:opacity-50 cursor-pointer shadow flex items-center justify-center gap-2"
              >
                {aiLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> ค้นข้อมูล & ประมวลผลจาก Gemini...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-bounce" /> วิเคราะห์กรอบการเรียนประจบเป้าหมาย &rarr;
                  </>
                )}
              </button>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 text-[10.5px] text-slate-500 leading-normal">
                <span className="font-bold text-slate-705 block mb-1">ℹ️ วิธีการวิเคราะห์ของ Gemini AI:</span>
                โมเดลจะประเมินคะแนนสะสม โครงสร้างสมรรถนะของคุณในระบบ และคู่มือกระบวนการโรงงานเพื่อสกัดทางผ่าน Phase Roadmap ความเหมาะสมอย่างตรงไปตรงมา
              </div>
            </div>

            {/* Right output column */}
            <div className="lg:col-span-2 bg-slate-55/40 border border-[#15329c]/5 rounded-3xl p-5 min-h-[400px] flex flex-col justify-between">
              {aiLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-12">
                  <div className="w-12 h-12 rounded-full border-4 border-violet-100 border-t-violet-600 animate-spin" />
                  <p className="font-extrabold text-indigo-900 text-xs">โมเดลกำลังวิเคราะห์คู่วิชา RMP และขีดความสามารถสมรรถจริงเพื่อสร้าง Roadmaps...</p>
                  <p className="text-[10px] text-slate-405 italic">"Gemini is reading active catalog database for personal alignments..."</p>
                </div>
              ) : aiRoadmapResult ? (
                <div className="space-y-6 animate-fade-in text-left">
                  <div className="p-4 bg-violet-50/45 border border-violet-150 rounded-2xl">
                    <h3 className="text-[10px] font-bold text-violet-800 flex items-center gap-1.5 uppercase font-mono mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-violet-600" /> วิเคราะห์จุดยืนปฐมบท (AI Executive Insights):
                    </h3>
                    <p className="text-slate-800 font-extrabold text-[12px] leading-relaxed">
                      {aiRoadmapResult.analysis}
                    </p>
                  </div>

                  {/* Phases rendering */}
                  <div className="space-y-4">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      ขั้นตอนโรดแมปรวยตัวยุทธศาสตร์ (Strategic Steps Progressions):
                    </span>
                    
                    <div className="relative border-l-2 border-slate-200 pl-5 ml-2 space-y-5">
                      {aiRoadmapResult.phases && aiRoadmapResult.phases.map((ph: any, phIdx: number) => (
                        <div key={phIdx} className="relative">
                          {/* Circle bullet index */}
                          <span className="absolute -left-7.5 top-0.5 w-5 h-5 rounded-full bg-violet-600 text-white font-mono text-[9px] font-extrabold flex items-center justify-center shadow">
                            {phIdx + 1}
                          </span>
                          
                          <div>
                            <span className="text-[9.5px] text-violet-600 font-bold uppercase font-mono block">Phase {phIdx + 1}: {ph.title}</span>
                            <h4 className="font-black text-xs text-slate-800 mt-0.5">{ph.milestoneGoal}</h4>
                            <p className="text-[11px] text-slate-500 mt-1 leading-normal">{ph.guidelines}</p>
                            
                            {/* Actions bridges */}
                            <div className="flex flex-wrap gap-2 pt-2.5">
                              {ph.coursesSuggested && ph.coursesSuggested.map((cs: string, csIdx: number) => {
                                const matched = courses.find(c => c.title.toLowerCase().includes(cs.toLowerCase()) || cs.toLowerCase().includes(c.title.toLowerCase()));
                                return (
                                  <button
                                    key={csIdx}
                                    onClick={() => {
                                      if (matched) {
                                        setActiveSubTab(matched.type === 'Onboarding' ? 'onboarding' : 'general');
                                        if (matched.type === 'Onboarding') {
                                          setSelectedOnboardingCourseId(matched.id);
                                        } else {
                                          setSelectedGeneralCourseId(matched.id);
                                        }
                                        alert(`🧭 AI เชื่อมโยงตรง: นำเดินทางเข้าเรียนวิชาหลักสูตร "${matched.title}" ออโตเมติกศึกษา!`);
                                      } else {
                                        alert(`📖 หลักสูตรเรียนรู้ภายนอก: "${cs}" (กรุณาส่งความประสงค์แก่แอดมินหรือหัวหน้าฝ่ายเพื่อลงทะเบียน)`);
                                      }
                                    }}
                                    className="bg-indigo-55 bg-indigo-50/70 hover:bg-indigo-100 text-slate-900 text-[9.5px] font-bold px-2 py-0.5 rounded border border-indigo-200 transition-colors cursor-pointer"
                                  >
                                    📖 คอร์ส: {cs}
                                  </button>
                                );
                              })}

                              {ph.documentsSuggested && ph.documentsSuggested.map((ds: string, dsIdx: number) => (
                                <button
                                  key={dsIdx}
                                  onClick={() => alert(`🧭 โปรดเปิดคู่มือวิศวกรรม RAG Assistant ด้านหน้า แล้วระบุพินข้อความ "${ds}" เพื่อทำ RAG วินิจฉัยคู่มือ SOP ขององค์กร`)}
                                  className="bg-teal-50 hover:bg-teal-100 text-slate-800 text-[9.5px] font-mono px-2 py-0.5 rounded border border-teal-200 transition-colors cursor-pointer"
                                >
                                  📄 คู่มือ: {ds}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
                  <div className="p-4 bg-slate-50 rounded-full text-slate-350 shrink-0">
                    <Sparkles className="w-10 h-10 animate-pulse text-violet-300" />
                  </div>
                  <h3 className="font-bold text-slate-700 mt-3 text-xs">เริ่มต้นจำลองปั้นแผนงานโรดแมปส่วนบุคคล AI</h3>
                  <p className="text-[11px] text-slate-450 mt-1 max-w-sm">
                    เลือก Careerเป้าหมายความคืบหน้า แล้วเปิดประเคน Gemimi AI เตาปั้นแผนงานอายุกรรมศึกษาของคุณที่แท้จริง
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeSubTab === 'qr' ? (
        /* QR SCANNER & ATTENDANCE LOGS */
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-6 animate-fade-in text-slate-800">
          
          <div className="flex border-b border-slate-100 gap-2 pb-0.5">
            <button
              onClick={() => setQrTab('scan')}
              className={`px-3 py-1.5 text-xs font-bold border-b-2 cursor-pointer ${
                qrTab === 'scan' ? 'border-[#15329c] text-[#15329c]' : 'border-transparent text-slate-500'
              }`}
            >
              📷 สแกน QR ออนไซต์ (Simulator)
            </button>
            <button
              onClick={() => setQrTab('logs')}
              className={`px-3 py-1.5 text-xs font-bold border-b-2 cursor-pointer ${
                qrTab === 'logs' ? 'border-[#15329c] text-[#15329c]' : 'border-transparent text-slate-500'
              }`}
            >
              📑 ล็อกบันทึกเช็ดอิน ({attendanceLogs.length})
            </button>
          </div>

          {qrTab === 'scan' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="space-y-4">
                <div className="p-4 bg-indigo-50/40 rounded-xl border border-[#15329c]/10 text-xs leading-relaxed">
                  <h4 className="font-extrabold text-[#15329c] mb-1 flex items-center gap-1">
                    <Landmark className="w-4 h-4" /> นวัตกรรมสแกนสอบแบบเช็คอินออนไซต์ (Class Check-In System)
                  </h4>
                  <p className="text-slate-600">
                    เพื่ออำนวยความสะดวกในการอบรมเชิงทดลองปฏิบัติงานจริง ณ ห้อง Lab หรือคลังสินค้าประตูดำพนักงานสามารถพรีสแกน QR Code หน้าชั้นเรียนจริงเพื่อบันทึกประวัติเข้าระบบ ERP อัปประเมินและเกรด 100% สอบผ่านทันทีโดยไม่ต้องเข้าสอบข้อเขียน!
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 block">โปรดเลือกคาบอบรมที่ต้องการสแกนจำลอง:</label>
                  <select
                    value={selectedSessionId}
                    onChange={(e) => {
                      setSelectedSessionId(e.target.value);
                      setScanSuccess(false);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs"
                  >
                    {OFFLINE_TRAINING_SESSIONS.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.id}: {s.sessionName.substring(0, 45)}...
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-1 border text-xs">
                  <p><strong>ผู้สอน:</strong> {OFFLINE_TRAINING_SESSIONS.find(s => s.id === selectedSessionId)?.instructor}</p>
                  <p><strong>สถานที่:</strong> {OFFLINE_TRAINING_SESSIONS.find(s => s.id === selectedSessionId)?.location}</p>
                  <p><strong>เวลา:</strong> {OFFLINE_TRAINING_SESSIONS.find(s => s.id === selectedSessionId)?.date}</p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => handlePerformSimulatedScan(selectedSessionId)}
                    disabled={isScanning}
                    className="w-full bg-gradient-to-r from-[#15329c] to-indigo-705 text-white py-2.5 px-4 rounded-xl font-bold text-xs hover:from-[#11297e] hover:to-indigo-805 disabled:bg-slate-300 cursor-pointer shadow flex items-center justify-center gap-2"
                  >
                    <QrCode className="w-4 h-4" />
                    {isScanning ? 'กำลังจับโฟกัสสบเรดาร์รหัสสแกน...' : 'กดเริ่มสแกน QR ออนไซต์จำลอง (Start Cam Scan)'}
                  </button>
                </div>

                {scanSuccess && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs space-y-1 animate-fade-in">
                    <p className="font-extrabold flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-emerald-600" /> สแกนลงชื่อเข้าร่วมออนไซต์ได้รับการรับรองสำเร็จ!
                    </p>
                    <p className="text-[11px] text-slate-700">รายชื่อคาบ: {scannedSessionName}</p>
                    <p className="text-[10px] text-indigo-700 font-mono font-bold">บันทึกวุฒิความรู้คอร์ส: {scannedCourseTitle} เกรด 100% เรียบร้อย</p>
                  </div>
                )}
              </div>

              {/* QR Visual representation */}
              <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-6 bg-slate-50/50 relative">
                {isScanning && (
                  <div className="absolute inset-0 bg-slate-900/5 backdrop-blur-xs flex items-center justify-center rounded-3xl z-10">
                    <div className="p-4 bg-white rounded-2xl shadow-lg border flex items-center gap-3 text-xs font-bold text-[#15329c]">
                      <RefreshCw className="w-5 h-5 animate-spin" /> ค้นหาพอร์ตรหัสอ้างอิง...
                    </div>
                  </div>
                )}

                <div className="p-4 bg-white rounded-2xl border-4 border-[#15329c] shadow-md flex justify-center items-center">
                  <div className="grid grid-cols-17 gap-0.5 bg-white">
                    {generateMockQRGrid(selectedSessionId).map((row, rIdx) => 
                      row.map((cell, cIdx) => (
                        <div 
                          key={`${rIdx}-${cIdx}`} 
                          className={`w-2.5 h-2.5 transition-colors duration-150 ${cell ? 'bg-slate-950' : 'bg-white'}`}
                        />
                      ))
                    )}
                  </div>
                </div>

                <div className="text-center mt-3 space-y-0.5">
                  <p className="text-xs font-mono font-bold text-slate-505">
                    {OFFLINE_TRAINING_SESSIONS.find(s => s.id === selectedSessionId)?.qrValue}
                  </p>
                  <p className="text-[9.5px] text-slate-400">QR Code เช็กชื่อสอบอ้างอิง (ISO Internal Track No.)</p>
                </div>
              </div>
            </div>
          ) : (
            /* ATTENDANCE LOGS LIST */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  ลำดับเวลา ล็อกการบันทึกเอกสาร Audit ISO 9001
                </span>
                <button
                  onClick={() => {
                    if (confirm('คุณแน่ใจว่าต้องการล้างล็อกข้อมูลทั้งหมดหรือไม่? (เพื่อความสะดวกในการสาธิต)')) {
                      setAttendanceLogs([]);
                    }
                  }}
                  className="text-rose-600 hover:underline text-[10px] font-bold cursor-pointer"
                >
                  ล้างข้อมูลประวัติทั้งหมด
                </button>
              </div>

              {attendanceLogs.length === 0 ? (
                <div className="text-center p-8 bg-slate-50 rounded-2xl text-slate-440 text-xs italic">
                  ไม่มีเอกสารประวัติบันทึกสแกนขณะนี้
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-xl divide-y text-xs bg-slate-50/20">
                  {attendanceLogs.map((log: any) => (
                    <div key={log.id} className="p-3.5 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-800 text-[12px]">{log.userName}</span>
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">{log.employeeId}</span>
                          <span className="text-[10px] text-indigo-705 font-bold bg-indigo-50 px-1.5 py-0.2 rounded">{log.department}</span>
                        </div>
                        <p className="text-slate-750 font-semibold mt-1 text-[11px] truncate">
                          📍 {log.sessionName}
                        </p>
                        <span className="text-slate-450 text-[10px] font-mono block mt-0.5">
                          อิงวิชาหลัก: {log.courseTitle}
                        </span>
                      </div>

                      <div className="text-left sm:text-right shrink-0">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-lg border border-green-200">
                          <CheckCircle className="w-3.5 h-3.5" /> Checked-In
                        </span>
                        <span className="block text-[10px] text-slate-400 font-mono mt-1">
                          {new Date(log.timestamp).toLocaleString('th-TH')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      ) : (
        /* COURSE LEARNING PROGRAM LABS (ONBOARDING & GENERAL TABS) */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Left pane: Selected Tab Course Catalog */}
          <div className="lg:col-span-1 bg-white p-4 rounded-2xl border border-slate-205 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              {activeSubTab === 'onboarding' ? (
                <BookOpen className="w-4 h-4 text-blue-600 animate-pulse" />
              ) : (
                <Award className="w-4 h-4 text-[#e51a24] animate-bounce-slow" />
              )}
              <h4 className="font-black text-slate-800 text-xs uppercase tracking-wider">
                {activeSubTab === 'onboarding' ? 'หลักสูตรสมาชิกใหม่' : 'หลักสูตรช่างเทคนิค'}
              </h4>
              <span className="bg-slate-100 text-slate-600 font-mono text-[9px] px-1 rounded-full font-bold">
                {activeSubTab === 'onboarding' ? onboardingCourses.length : generalCourses.length}
              </span>
            </div>

            {currentUser?.role === 'Admin' && pendingApprovals.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 animate-pulse shadow-2xs">
                <div className="flex items-center gap-1.5 text-amber-900">
                  <Clock className="w-4 h-4 shrink-0 text-amber-600 animate-spin" />
                  <span className="font-extrabold text-[10.5px] uppercase tracking-wider">
                    รายวิชาใหม่รออนุมัติ ({pendingApprovals.length})
                  </span>
                </div>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {pendingApprovals.map(c => (
                    <div key={c.id} className="bg-white p-2 rounded-lg border border-amber-150 flex items-center justify-between gap-1.5 text-[10px]">
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-slate-800 block truncate">{c.title}</span>
                        <span className="text-[8.5px] text-slate-400 block">รหัส: {c.id} | โดย: {c.createdByRole || 'Editor'}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateCourse({ ...c, isApproved: true });
                          alert(`✅ อนุมัติหลักสูตร "${c.title}" สำเร็จ!`);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] px-2 py-1 rounded transition cursor-pointer shrink-0"
                      >
                        อนุมัติ
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {(activeSubTab === 'onboarding' ? onboardingCourses : generalCourses).map((c) => {
                const isSelected = c.id === currentCourseId;
                const progObj = userProgressList.find(p => p.userId === currentUser.id && p.courseId === c.id);
                return (
                  <button
                    key={c.id}
                    id={`btn-select-course-${c.id}`}
                    onClick={() => {
                      if (activeSubTab === 'onboarding') {
                        setSelectedOnboardingCourseId(c.id);
                      } else {
                        setSelectedGeneralCourseId(c.id);
                      }
                      setActiveLessonIndex(null);
                      setIsTakingQuiz(false);
                      setQuizScore(null);
                      setQuizPassed(null);
                      setShowCertificate(false);
                      setCertificateCourseOverride(null);
                    }}
                    className={`w-full text-left p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col gap-1.5 ${
                      isSelected
                        ? 'border-indigo-650 bg-indigo-50 text-slate-900 font-bold shadow-xs'
                        : 'border-slate-100 hover:bg-slate-50 text-slate-600 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 w-full">
                      <span className="leading-snug truncate max-w-[150px]">{c.title}</span>
                      {c.isApproved === false ? (
                        <span className="bg-amber-150 text-amber-950 border border-amber-250 text-[8px] px-1 rounded font-bold shrink-0 animate-pulse">รออนุมัติ</span>
                      ) : progObj?.status === 'Completed' ? (
                        <span className="bg-green-150 text-green-900 text-[8.5px] px-1 rounded uppercase font-bold shrink-0">Pass</span>
                      ) : progObj?.status === 'Learning' ? (
                        <span className="bg-amber-100 text-amber-900 text-[8.5px] px-1 rounded uppercase font-bold shrink-0">Study</span>
                      ) : null}
                    </div>
                    
                    <span className="text-[9.5px] text-slate-450 font-normal leading-relaxed overflow-hidden block text-ellipsis max-h-8">
                      {c.description}
                    </span>
                  </button>
                );
              })}

              {(activeSubTab === 'onboarding' ? onboardingCourses : generalCourses).length === 0 && (
                <div className="p-4 bg-slate-50 border rounded-xl text-center italic text-slate-400 text-xs">
                  ไม่พบหลักสูตรบรรจุในหมวดนี้
                </div>
              )}
            </div>

            <div className="border-t pt-3 space-y-3">
              <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-150 text-[10px] leading-relaxed text-slate-600">
                <span className="font-bold text-slate-800 block">💡 ข้อมูลสิทธิ์การเรียน:</span>
                หลังดูเนื้อหาครบทุกบทเรียน ระบบจะทำการเปิดลิงก์แบบทดสอบ (Quiz) ทันที ผ่านเกณฑ์ {selectedCourse?.minPassScore || 80}% จะได้ตราประดับ และเกียรติบัตรรับรอง ERP
              </div>
            </div>
          </div>

          {/* Right pane: Interactive course window */}
          <div className="lg:col-span-3 bg-white p-5 rounded-2xl border border-slate-205 shadow-sm min-h-[500px] flex flex-col justify-between">
            
            {showCertificate && activeCertificateCourse ? (
              /* CERTIFICATE DISPLAY FROM QUIZ DIRECT FINISH */
              <div className="space-y-6 animate-fade-in text-center">
                {/* Visual Gold double-rim frame */}
                {isOnboardingCert ? (
                  /* MD RMP Signed Cert */
                  <div className="bg-radial from-amber-50/20 to-orange-50/35 p-8 rounded-2xl border-4 border-double border-amber-300 shadow-inner max-w-xl mx-auto space-y-6 relative overflow-hidden text-slate-800">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-3 pointer-events-none text-7xl font-extrabold font-sans">
                      RMP
                    </div>
                    <div className="absolute top-4 right-4 animate-spin-slow">
                      <span className="p-2 bg-gradient-to-tr from-amber-450 to-amber-300 text-slate-900 rounded-full inline-block border-2 border-white shadow">
                        🏆
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h2 className="font-serif text-amber-850 font-extrabold text-lg sm:text-2xl uppercase tracking-widest leading-none">
                        Certificate of Competency
                      </h2>
                      <p className="text-[9px] text-slate-400 font-mono tracking-wider uppercase">
                        ROYAL MEIWA PAX CO., LTD. • INDUCTION TRAINING
                      </p>
                    </div>

                    <div className="pt-2 text-center">
                      <p className="text-slate-500 text-[11px] italic">ขอรับรองคุณวุฒิด้านความปลอดภัยและมาตรฐานปฏิบัติงานออนไซต์มอบให้สำหรับ:</p>
                      <p className="text-slate-950 font-extrabold text-base sm:text-xl underline decoration-double decoration-amber-400 mt-1.5">
                        {currentUser.name}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">รหัสสังกัดรุ่นพนักงาน: {currentUser.employeeId}</p>
                    </div>

                    <div className="py-3 px-4 bg-white/80 border rounded-xl max-w-md mx-auto leading-relaxed">
                      <p className="text-[10px] text-slate-505">ผ่านการประเมินชุดวิชาสำหรับการลงรับตำแหน่งงานประจำฝ่ายโรงพิมพ์:</p>
                      <p className="text-xs font-bold text-slate-805 mt-1">{activeCertificateCourse.title}</p>
                      <p className="text-[10.5px] text-emerald-600 font-mono font-bold mt-1 shadow-inner inline-block px-1.5 py-0.2 bg-emerald-50 rounded">
                        สอบผ่านเกณฑ์สำเร็จ: {relevantResult?.score || quizScore || 100}%
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-6 text-[10px] border-t border-slate-100 text-slate-600 leading-normal">
                      <div className="text-left pl-3">
                        <p className="font-bold text-slate-800">เกียรติประวัติสูงสุดโรงพิมพ์</p>
                        <p className="text-[9px] text-slate-400 uppercase font-mono">Verified internal Audit</p>
                      </div>
                      <div className="text-right pr-3 space-y-1">
                        <p className="italic text-slate-400 font-serif leading-none">Sirima S.</p>
                        <p className="font-bold text-slate-850">คุณหญิง สิริมา แสงสะอาด</p>
                        <p className="text-[8.5px] text-slate-405">Managing Director (MD)</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Lead QA Signed Cert */
                  <div className="bg-radial from-[#fdfefd] via-[#f4fcfa] to-[#ffffff] p-8 rounded-2xl border-4 border-double border-teal-500 shadow-inner max-w-xl mx-auto space-y-6 relative overflow-hidden text-slate-800">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-3 pointer-events-none text-7xl font-extrabold font-sans">
                      RMP
                    </div>

                    <div className="space-y-1">
                      <h2 className="font-serif text-teal-800 font-extrabold text-lg sm:text-2xl uppercase tracking-widest leading-none">
                        Certificate of Compliance
                      </h2>
                      <p className="text-[9px] text-slate-400 font-mono tracking-wider">
                        ROYAL MEIWA PAX CO., LTD. • QUALITY CONTROL & KNOWLEDGE MANAGEMENT
                      </p>
                    </div>

                    <div className="pt-2">
                      <p className="text-slate-505 text-[11px] italic">ด้วยสัตย์พิสูจน์ขอประกาศรับรองทักษะและมาตรฐานงานฉบับนี้บำบัด:</p>
                      <p className="text-[#15329c] font-black text-base sm:text-xl underline decoration-double decoration-teal-600 mt-2 font-sans">
                        {currentUser.name}
                      </p>
                      <p className="text-[10px] text-slate-450 mt-1 font-mono">
                        ตำแหน่ง: {currentUser.position} | ฝ่ายวิเคราะห์: {currentUser.department}
                      </p>
                    </div>

                    <div className="py-3 px-4 bg-white/90 border rounded-xl max-w-md mx-auto">
                      <p className="text-[10px] text-slate-600">ผ่านการกวดขันความรู้โรงงานและการสอบใบวิชาชีพระดับฝ่ายงานช่างเทคนิค:</p>
                      <p className="text-xs font-bold text-slate-805 mt-1">{activeCertificateCourse.title}</p>
                      <p className="text-[10px] text-teal-700 font-mono font-bold mt-1 bg-teal-50 inline-block px-2.5 py-0.5 rounded-full border border-teal-150">
                        ผ่านการวัดผลเทคนิค {relevantResult?.score || quizScore || 100}%
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-6 text-[10px] border-t border-slate-100 text-slate-655 font-medium leading-normal">
                      <div className="text-left pl-3">
                        <p className="italic text-slate-400 font-serif">ISO Quality Assurance</p>
                        <p className="font-extrabold text-slate-800">ระบบควบคุมประกันคุณภาพ</p>
                      </div>
                      <div className="text-right pr-3 space-y-1">
                        <span className="block italic text-slate-400 font-serif leading-none">Darin Saetang</span>
                        <p className="font-extrabold text-slate-800">ดารินทร์ แซ่ตั้ง</p>
                        <p className="text-[9px] text-slate-405">QA/QC supervisor (Lead Auditor)</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-center gap-3 text-xs font-semibold">
                  <button
                    onClick={() => alert('ดาวน์โหลดใบประกาศของวิชานี้สำเร็จ สำหรับใช้ยื่นจัดเกรด Competency Matrix ในระบบ ISO')}
                    className="bg-slate-950 text-white hover:bg-slate-800 px-4 py-2 rounded-xl cursor-pointer"
                  >
                    ดาวน์โหลดหลักฐาน (.PDF)
                  </button>
                  <button
                    onClick={() => {
                      setShowCertificate(false);
                      setCertificateCourseOverride(null);
                    }}
                    className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2 rounded-xl cursor-pointer"
                  >
                    กลับไปเรียนหลักสูตรอื่น
                  </button>
                </div>
              </div>
            ) : activeLessonIndex !== null ? (
              /* LESSON CONTENT VISUAL WINDOW */
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="font-extrabold text-[#15329c] text-xs">
                      หัวข้อบทเรียนย่อยที่ {activeLessonIndex + 1} / {lessons.length}
                    </span>

                    <button
                      onClick={() => setActiveLessonIndex(null)}
                      className="text-slate-500 font-semibold hover:underline text-xs cursor-pointer"
                    >
                      กลับไปดูรายการบททั้งหมด
                    </button>
                  </div>

                  {/* Lesson detail card */}
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-150 min-h-[300px] mt-4">
                    <h4 className="font-bold text-slate-900 text-sm sm:text-base border-b border-slate-200 pb-2 mb-4">
                      {lessons[activeLessonIndex].title}
                    </h4>

                    {/* Media Preview Box */}
                    {lessons[activeLessonIndex].mediaType && lessons[activeLessonIndex].mediaType !== 'Text' && (
                      <div className="mb-5 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 p-2">
                        <div className="bg-slate-200 px-3 py-1.5 rounded-t-lg flex items-center justify-between text-[10px] font-bold text-slate-600 border-b border-slate-300">
                          <span className="flex items-center gap-1.5 uppercase font-mono">
                            {lessons[activeLessonIndex].mediaType === 'PDF' && <FileText className="w-3.5 h-3.5 text-red-600" />}
                            {lessons[activeLessonIndex].mediaType === 'Image' && <PlayCircle className="w-3.5 h-3.5 text-blue-600" />}
                            {lessons[activeLessonIndex].mediaType === 'Slides' && <GraduationCap className="w-3.5 h-3.5 text-amber-600" />}
                            {lessons[activeLessonIndex].mediaType === 'Video' && <Film className="w-3.5 h-3.5 text-teal-600" />}
                            เอกสารการเรียนรู้: {lessons[activeLessonIndex].mediaType}
                          </span>
                          <span className="font-mono text-slate-500 truncate max-w-[200px] text-[8.5px]">
                            {lessons[activeLessonIndex].mediaUrl || 'จำลองออฟไลน์ในเครือข่าย'}
                          </span>
                        </div>

                        <div className="bg-white p-4 flex flex-col items-center justify-center min-h-[220px]">
                          {lessons[activeLessonIndex].mediaType === 'Video' && (
                            <div className="w-full">
                              {lessons[activeLessonIndex].mediaUrl && (lessons[activeLessonIndex].mediaUrl.includes('embed') || lessons[activeLessonIndex].mediaUrl.includes('youtube')) ? (
                                <iframe
                                  src={lessons[activeLessonIndex].mediaUrl}
                                  className="w-full h-64 rounded-lg shadow-sm border-0"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              ) : (
                                <div className="w-full bg-slate-950 text-white rounded-lg p-5 flex flex-col justify-between h-52 relative overflow-hidden">
                                  <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=800&q=80')` }}></div>
                                  <div className="z-10 bg-slate-900/60 p-2 rounded text-[10px] select-none w-max">▶️ วิดีโอสื่อประกอบ (.MP4)</div>
                                  <div className="z-10 flex flex-col items-center justify-center flex-1">
                                    <PlayCircle className="w-14 h-14 text-indigo-400 hover:scale-110 hover:text-indigo-300 transition cursor-pointer" />
                                    <span className="text-[11px] font-bold text-slate-200 mt-2">คลิกเพื่อเริ่มจำลองเล่นวิดีโอ (Video Simulator)</span>
                                    <span className="text-[9px] font-light text-slate-400">ชื่อไฟล์ระบบหลักสูตร: {lessons[activeLessonIndex].title}</span>
                                  </div>
                                  <div className="z-10 flex items-center justify-between w-full text-[10px] font-mono text-slate-400">
                                    <span>00:00 / {lessons[activeLessonIndex].durationMinutes || 20}:00</span>
                                    <span>HD 1080p</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {lessons[activeLessonIndex].mediaType === 'PDF' && (
                            <div className="w-full text-center space-y-3">
                              <div className="max-w-xs mx-auto p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                                <FileText className="w-10 h-10 text-red-600 shrink-0" />
                                <div className="text-left overflow-hidden">
                                  <span className="font-extrabold text-slate-800 block text-xs truncate max-w-[170px]">
                                    {lessons[activeLessonIndex].title}.pdf
                                  </span>
                                  <span className="text-[10px] text-slate-500 block">เอกสารคู่มือ PDF ระดับสารระบบ (2.6 MB)</span>
                                </div>
                              </div>
                              <div className="border border-slate-200 rounded-lg bg-slate-50/50 p-4 font-mono text-[10px] text-slate-500 overflow-y-auto max-h-32 text-left space-y-1">
                                <p className="font-bold text-slate-700">📄 สรุปย่อประมวลผล PDF Layout:</p>
                                <p>1. แผนภูมิสากลการบริหารโครงการอุตสาหกรรม (Industrial SOP Guidelines)</p>
                                <p>2. ข้อควรระวังความสะอาดเครื่องจักรในกะปฏิบัติการและสุขอนามัยอาหาร (HACCP Level 3)</p>
                                <p>3. รายละเอียดขั้นตอนเกณฑ์คุณภาพ ISO9001:2015</p>
                              </div>
                              <a
                                href={lessons[activeLessonIndex].mediaUrl || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer"
                              >
                                <FileText className="w-4 h-4" /> ดาวน์โหลดเอกสารประกอบนี้ (Download PDF Manual)
                              </a>
                            </div>
                          )}

                          {lessons[activeLessonIndex].mediaType === 'Slides' && (
                            <div className="w-full select-none text-center space-y-3">
                              <div className="w-full bg-slate-900 text-white rounded-lg p-5 h-48 flex flex-col justify-between relative overflow-hidden">
                                <div className="z-10 bg-amber-500 text-slate-950 text-[9px] font-bold px-2 py-0.5 rounded absolute top-3 right-3">SLIDES PRESENTATION</div>
                                <div className="text-left font-bold text-xs text-amber-200 border-b border-slate-800 pb-2">
                                  📊 {lessons[activeLessonIndex].title}
                                </div>
                                <div className="text-xs font-light text-slate-300 justify-center flex-1 flex items-center">
                                  "หน้าสไลด์ที่ 1/12: นำเสนอเรื่อง {lessons[activeLessonIndex].title} ประกอบภาพสี่เหลี่ยมประกอบการประเมิน"
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-slate-400">
                                  <button type="button" className="bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded">◀️ ย้อนกลับ</button>
                                  <span>สไลด์ 1 จาก 12</span>
                                  <button type="button" className="bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded">ถัดไป ▶️</button>
                                </div>
                              </div>
                              <a
                                href={lessons[activeLessonIndex].mediaUrl || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer"
                              >
                                <GraduationCap className="w-4 h-4" /> เปิดดูหน้าต่างสไลด์นำเสนอฉบับเต็ม
                              </a>
                            </div>
                          )}

                          {lessons[activeLessonIndex].mediaType === 'Image' && (
                            <div className="w-full space-y-2 text-center">
                              <div className="border rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center p-2">
                                <img
                                  src={lessons[activeLessonIndex].mediaUrl || 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800'}
                                  alt={lessons[activeLessonIndex].title}
                                  referrerPolicy="no-referrer"
                                  className="max-h-56 object-contain rounded"
                                />
                              </div>
                              <p className="text-[10px] text-slate-500 italic">📷 แผนภูมิภาพหรือรูปอ้างอิง: {lessons[activeLessonIndex].title}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Lesson Body Text with markdown layout */}
                    <div className="text-xs text-slate-850 space-y-3 leading-relaxed whitespace-pre-line font-light">
                      {lessons[activeLessonIndex].content}
                    </div>
                  </div>
                </div>

                {/* Lesson Navigation footer */}
                <div className="flex items-center justify-between border-t border-slate-150 pt-4 mt-6 text-xs font-bold">
                  <button
                    onClick={() => {
                      if (activeLessonIndex > 0) {
                        setActiveLessonIndex(activeLessonIndex - 1);
                      } else {
                        setActiveLessonIndex(null);
                      }
                    }}
                    className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3.5 py-2 rounded-xl cursor-pointer transition flex items-center gap-1.5"
                  >
                    <ChevronLeft className="w-4 h-4" /> ก่อนหน้า
                  </button>

                  <div className="text-slate-450 font-mono text-[11px]">
                    {completionPercent}% ศึกษาสำเร็จ
                  </div>

                  <button
                    onClick={handleNextLesson}
                    className="bg-[#15329c] hover:bg-[#11297e] text-white px-3.5 py-2 rounded-xl cursor-pointer transition flex items-center gap-1.5"
                  >
                    {activeLessonIndex === lessons.length - 1 ? 'เริ่มทำข้อสอบท้ายวิชา' : 'บทเรียนถัดไป'} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : isTakingQuiz ? (
              /* QUIZ VIEW */
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="pb-3 border-b border-slate-150 flex items-center justify-between">
                    <div>
                      <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[9px] font-black uppercase">Quiz mode</span>
                      <h3 className="font-extrabold text-slate-800 text-sm mt-1">แบบทดสอบวัดระดับทักษะ: {selectedCourse?.title}</h3>
                    </div>
                    <button
                      onClick={() => setIsTakingQuiz(false)}
                      className="text-slate-400 hover:text-slate-700 font-bold text-xs"
                    >
                      ยกเลิก
                    </button>
                  </div>

                  {quizScore === null ? (
                    /* QUESTION FLOW */
                    <form onSubmit={handleQuizSubmit} className="space-y-6 mt-4 text-xs">
                      <div className="p-4 bg-rose-50/40 border border-rose-100/50 rounded-xl leading-relaxed">
                        ⚠️ **ข้อกำหนดระบบวัดทักษะ**: จะต้องทำข้อสอบถูกต้องไม่ต่ำกว่า {selectedCourse?.minPassScore || 80}% จึงจะถือว่าสอบผ่านและได้รับการรับรองใน Competency Matrix
                      </div>

                      {questions.map((q, qIndex) => {
                        const qType = q.type || 'SingleChoice';
                        return (
                          <div key={q.id} className="space-y-3 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between">
                              <span className="bg-indigo-100 text-indigo-800 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                                {qType === 'SingleChoice' && 'ปรนัย / Multiple Choice'}
                                {qType === 'TrueFalse' && 'ถูก-ผิด / True-False'}
                                {qType === 'Matching' && 'จับคู่คำตอบ / Matching'}
                                {qType === 'Essay' && 'อัตนัย / Essay'}
                              </span>
                            </div>
                            <p className="font-extrabold text-slate-800 leading-relaxed">
                              คำถามข้อที่ {qIndex + 1}: {q.question}
                            </p>

                            {/* 1. SINGLE CHOICE */}
                            {qType === 'SingleChoice' && q.options && (
                              <div className="grid grid-cols-1 gap-2">
                                {q.options.map((opt, oIdx) => (
                                  <label
                                    key={oIdx}
                                    className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer text-xs ${
                                      quizAnswers[q.id] === opt
                                        ? 'bg-blue-50/70 border-[#15329c] font-semibold text-[#15329c]'
                                        : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-750'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`q-${q.id}`}
                                      value={opt}
                                      checked={quizAnswers[q.id] === opt}
                                      onChange={() => handleQuizAnswerSelect(q.id, opt)}
                                      className="accent-[#15329c] text-indigo-705 shrink-0"
                                      required
                                    />
                                    <span>{opt}</span>
                                  </label>
                                ))}
                              </div>
                            )}

                            {/* 2. TRUE / FALSE */}
                            {qType === 'TrueFalse' && (
                              <div className="grid grid-cols-2 gap-3">
                                {['ถูก (True)', 'ผิด (False)'].map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleQuizAnswerSelect(q.id, opt)}
                                    className={`p-3 rounded-xl border font-bold transition-all text-center text-xs cursor-pointer ${
                                      quizAnswers[q.id] === opt
                                        ? opt === 'ถูก (True)'
                                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                                          : 'bg-rose-50 border-rose-500 text-rose-800 shadow-xs'
                                        : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-700'
                                    }`}
                                  >
                                    {opt === 'ถูก (True)' ? '✅ ถูก (True)' : '❌ ผิด (False)'}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* 3. MATCHING */}
                            {qType === 'Matching' && q.pairs && (
                              <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-100">
                                <span className="text-[10px] text-indigo-800 block font-bold mb-1.5">
                                  🔗 เลือกคู่คำตอบที่ถูกต้องสำหรับฝั่งซ้ายของทุกแถว:
                                </span>
                                {q.pairs.map((pair, pIdx) => {
                                  let currentAnsMap: Record<string, string> = {};
                                  try {
                                    if (quizAnswers[q.id]) {
                                      currentAnsMap = JSON.parse(quizAnswers[q.id]);
                                    }
                                  } catch (e) {}

                                  const rightOptions = q.pairs ? q.pairs.map(p => p.right) : [];

                                  return (
                                    <div key={pIdx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                                      <span className="font-bold text-slate-700 sm:w-1/2">
                                        • {pair.left}
                                      </span>
                                      <select
                                        value={currentAnsMap[pair.left] || ''}
                                        onChange={(e) => {
                                          const nextAnsMap = { ...currentAnsMap, [pair.left]: e.target.value };
                                          handleQuizAnswerSelect(q.id, JSON.stringify(nextAnsMap));
                                        }}
                                        required
                                        className="bg-white border border-slate-200 text-xs rounded-lg p-1.5 sm:w-1/2 focus:border-[#15329c] font-bold"
                                      >
                                        <option value="">-- เลือกคู่จับคู่ --</option>
                                        {rightOptions.map((rOpt, rIdx) => (
                                          <option key={rIdx} value={rOpt}>{rOpt}</option>
                                        ))}
                                      </select>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* 4. ESSAY */}
                            {qType === 'Essay' && (
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400 block font-semibold mb-1">
                                  ✍️ กรุณาอธิบายคำตอบของคุณลงในช่องว่างด้านล่าง:
                                </label>
                                <textarea
                                  rows={4}
                                  required
                                  value={quizAnswers[q.id] || ''}
                                  onChange={(e) => handleQuizAnswerSelect(q.id, e.target.value)}
                                  placeholder="พิมพ์คำอธิบายรายละเอียดที่นี่ อย่างน้อย 5 ตัวอักษรเพื่อรับคะแนนความเข้าใจ..."
                                  className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs leading-relaxed"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Essay questions optionally for visual high fidelity */}
                      <div className="space-y-2 pt-2">
                        <label className="font-bold text-slate-700 block">แบบเขียนสกัดบรรยายสรุปความเข้าใจการปฏิบัติงานจริง (ทางเลือกเขียนสั้นรายงาน QA):</label>
                        <textarea
                          rows={3}
                          value={essayAnswer}
                          onChange={(e) => setEssayAnswer(e.target.value)}
                          placeholder="อธิบายว่าคุณจะทำงานด้วยความมั่นใจและนำความรู้นี้ไปสากลอย่างไร..."
                          className="w-full bg-white border border-slate-205 p-2 rounded-lg text-xs"
                        />
                      </div>

                      <div className="pt-4 flex justify-end gap-3 text-xs font-bold border-t">
                        <button
                          type="button"
                          onClick={handleResetQuiz}
                          className="bg-slate-50 border px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
                        >
                          ล้างคำตอบ
                        </button>
                        <button
                          type="submit"
                          className="bg-[#15329c] hover:bg-[#11297e] text-white px-5 py-2 rounded-xl cursor-pointer shadow"
                        >
                          ส่งคำตอบตรวจคะแนน (Submit)
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* SCORE RESULT FLOW */
                    <div className="space-y-6 mt-6 text-center text-xs animate-fade-in">
                      <div className="inline-flex p-4 rounded-full bg-slate-100">
                        {quizPassed ? (
                          <span className="text-3xl">🎉</span>
                        ) : (
                          <span className="text-3xl">❌</span>
                        )}
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-black text-slate-800 text-sm">
                          ตรวจและวัดประเมินคะแนนสอบเสร็จสิ้น!
                        </h4>
                        <div className="text-2xl font-black font-mono">
                          คะแนนสะสมของคุณ: <span className={quizPassed ? 'text-emerald-600' : 'text-rose-600'}>{quizScore}%</span>
                        </div>
                        <p className="text-slate-500 max-w-sm mx-auto leading-relaxed">
                          คุณต้องได้มากกว่า {selectedCourse?.minPassScore || 80}% เพื่อความสมบูรณ์และรับใบประกาศ ISO
                        </p>
                      </div>

                      {quizPassed ? (
                        <div className="p-4 bg-emerald-50 border border-emerald-250 text-emerald-900 rounded-xl font-bold max-w-md mx-auto">
                          ยินดีด้วย! คุณมีสัญชาติการประเมินวิชาชีพนี้สำเร็จ สามารถคลิกปุ่มเปิดใบเซอร์ด้านล่างเพื่อพรีวิวหรือพิมพ์ผลตรวจสอบได้ทันที
                        </div>
                      ) : (
                        <div className="p-4 bg-rose-50 border border-rose-250 text-rose-900 rounded-xl font-bold max-w-md mx-auto">
                          คุณไม่ผ่านเกณฑ์การประเมินขั้นแรก (ต่ำกว่า 80%) โปรดกลับไปพักอ่านทฤษฎีบทเรียน หรือ ทบทวนเอกสาร WI อ้างอิงอีกครั้งและกดสอบแก้ตัวใหม่ได้ฟรีทุกเมื่อ!
                        </div>
                      )}

                      <div className="pt-4 border-t flex justify-center gap-3 font-bold">
                        <button
                          onClick={() => {
                            setIsTakingQuiz(false);
                            setQuizScore(null);
                            setQuizPassed(null);
                            setQuizAnswers({});
                          }}
                          className="bg-slate-100 text-slate-705 px-4 py-2 rounded-xl hover:bg-slate-205 cursor-pointer"
                        >
                          กลับไปทบทวนบทเรียน
                        </button>
                        
                        {quizPassed ? (
                          <div className="flex flex-wrap items-center justify-center gap-2.5">
                            <button
                              onClick={() => {
                                setModalSelectedCourse(selectedCourse);
                                setModalSelectedScore(quizScore || 100);
                                setModalSelectedDate(new Date().toISOString().split('T')[0]);
                                setIsCertBadgeModalOpen(true);
                              }}
                              className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold px-5 py-2.5 rounded-xl cursor-pointer shadow-md flex items-center gap-1.5 transition-all scale-105 active:scale-100 hover:brightness-110"
                            >
                              <Sparkles className="w-4 h-4 text-amber-200 animate-pulse shrink-0" />
                              <span>เปิดเคลมเหรียญตรา & ใบวิชาชีพดิจิทัล (Claim Badge & Cert)</span>
                            </button>
                            
                            <button
                              onClick={() => setShowCertificate(true)}
                              className="bg-indigo-50 hover:bg-indigo-100 text-[#15329c] border border-indigo-200 font-bold px-4 py-2.5 rounded-xl cursor-pointer transition"
                            >
                              แสดงใบประกาศแบบดั้งเดิม (Show Basic Cert)
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setQuizScore(null);
                              setQuizPassed(null);
                              setQuizAnswers({});
                            }}
                            className="bg-[#e51a24] text-white px-5 py-2 rounded-xl hover:bg-[#c9121b] cursor-pointer shadow animate-pulse"
                          >
                            ทดลองสอบใหม่อีกครั้ง (Retry Quiz)
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            ) : selectedCourse ? (
              /* OUTLOOK INDEX OF ACTIVE SELECTED COURSE */
              <div className="space-y-6 flex-1 flex flex-col justify-between" id="active-course-explorer">
                <div className="space-y-4">
                  
                  {/* Title & Position Tags */}
                  <div className="pb-3 border-b border-slate-150">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-150 font-bold uppercase">
                        Course Code: {selectedCourse.id}
                      </span>
                      {selectedCourse.targetPositions.map((pos) => (
                        <span key={pos} className="bg-slate-105 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full border">
                          🎯 กลุ่มเป้าหมาย: {pos}
                        </span>
                      ))}
                    </div>

                    <h3 className="font-black text-slate-900 text-base sm:text-lg mt-2 leading-tight">
                      {selectedCourse.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-3.5 mt-2.5 text-[10.5px] text-slate-550 font-semibold font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        ระยะเวลาเรียนรู้: {selectedCourse.durationHours || '45 นาที'}
                      </span>
                      <span className="text-slate-300">|</span>
                      <span className="flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        เกณฑ์ผ่านการทดสอบ: ≥ {selectedCourse.minPassScore}%
                      </span>
                    </div>
                  </div>

                  {selectedCourse.isApproved === false && (
                    <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5 animate-pulse">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold block text-[11.5px] text-amber-950">หลักสูตรนี้อยู่ในสถานะ "รออนุมัติ" (Pending Approval)</span>
                        <span className="text-[10.5px] text-slate-600 block mt-1 leading-relaxed">
                          {currentUser?.role === 'Admin' 
                            ? 'คุณเป็นผู้ดูแลระบบ (Admin) สามารถกดปุ่ม "อนุมัติหลักสูตรอบรม" ด้านล่าง เพื่อประกาศและเปิดหลักสูตรนี้ให้แก่พนักงานทุกคนเริ่มเข้าเรียนรู้'
                            : 'วิชานี้ถูกรักษาร่างเนื้อหาโดย Editor และอยู่ระหว่างรอแอดมินอนุมัติสิทธิ์ จึงยังไม่สามารถเปิดเข้าศึกษาหรือทดสอบได้ในขณะนี้'
                          }
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Course Desc & relevant log indicator */}
                  <div className="leading-relaxed text-xs">
                    <p className="text-slate-600 font-light">{selectedCourse.description}</p>
                  </div>

                  {relevantResult && (
                    <div className="p-3 bg-emerald-50 border border-emerald-150 text-emerald-900 rounded-xl text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🏅</span>
                        <div>
                          <span className="font-bold block">คุณสอบผ่านและมีประวัติการเรียนวิชานี้แล้ว</span>
                          <span className="text-[10px] text-slate-550 font-mono block mt-0.5">คะแนนพริ้งสูสี: {relevantResult.score}% | บันทึกเมื่อ {relevantResult.date}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setCertificateCourseOverride(selectedCourse);
                          setShowCertificate(true);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg cursor-pointer transition shadow-xs"
                      >
                        เปิดใบเซอร์
                      </button>
                    </div>
                  )}

                  {/* Lessons Listing columns */}
                  <div className="space-y-2.5 pt-2">
                    <h4 className="font-extrabold text-xs text-slate-400 uppercase tracking-wider block mb-1">
                      📚 รายละเอียดบทเรียนในคาบหลักสูตร ({lessons.length} บทเรียน):
                    </h4>

                    <div className="grid grid-cols-1 gap-2 border rounded-xl divide-y text-xs bg-slate-50/20 max-h-[300px] overflow-y-auto">
                      {lessons.map((less, idx) => {
                        const isLearning = currentProgress?.status === 'Learning' && idx <= completedLessonsCount;
                        return (
                          <div key={less.id} className="p-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50 transition">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center font-mono font-bold text-[11px] text-slate-500 shrink-0">
                                {idx + 1}
                              </span>
                              <span className="font-bold text-slate-800 leading-tight block">{less.title}</span>
                            </div>

                            <span className="text-slate-400 text-[10px] shrink-0 font-mono flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-300" /> {less.durationMinutes || `20`} นาที
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

                {/* Footer Course Control entry triggers */}
                <div className="border-t border-slate-150 pt-4 mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold bg-[#fbfbf9]/50 p-2.5 rounded-xl">
                  <div className="text-slate-505 font-mono text-[10.5px]">
                    {relevantResult ? 'ระดับหลักสูตร: ได้รับการอนุมัติ (Certified)' : 'ยังไม่เคยประเมินหลักสูตรนี้'}
                  </div>

                  <div className="flex gap-2 w-full sm:w-auto">
                    {currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Editor') && (
                      <button
                        onClick={() => {
                          setEditingCourse({
                            ...selectedCourse,
                            targetPositionsStr: selectedCourse.targetPositions ? selectedCourse.targetPositions.join(', ') : '',
                            lessonsStr: JSON.stringify(selectedCourse.lessons, null, 2),
                            quizStr: JSON.stringify(selectedCourse.quiz, null, 2)
                          });
                          setIsEditOpen(true);
                        }}
                        className="bg-slate-100 border text-slate-700 hover:bg-slate-200 px-3.5 py-2.5 rounded-xl transition cursor-pointer flex items-center gap-1"
                        title="แก้ไขหลักสูตร"
                      >
                        <Edit className="w-4 h-4" /> แก้ไขคอร์ส
                      </button>
                    )}

                    {currentUser && currentUser.role === 'Admin' && (
                      <button
                        onClick={() => {
                          if (confirm('คุณแน่ใจว่าต้องการลบหลักสูตรนี้ออกจากฐานสมองและระบบ Audit หรือไม่?')) {
                            onDeleteCourse(selectedCourse.id);
                          }
                        }}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-2.5 rounded-xl transition cursor-pointer flex items-center gap-1"
                        title="ลบหลักสูตร"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    {selectedCourse.isApproved === false ? (
                      currentUser?.role === 'Admin' ? (
                        <button
                          onClick={() => {
                            onUpdateCourse({ ...selectedCourse, isApproved: true });
                            alert(`✅ อนุมัติหลักสูตร "${selectedCourse.title}" เรียบร้อยแล้ว!`);
                          }}
                          className="bg-emerald-650 hover:bg-emerald-750 text-white px-5 py-2.5 rounded-xl cursor-pointer shadow transition flex-1 sm:flex-initial flex items-center justify-center gap-1.5 text-xs font-black"
                        >
                          <CheckCircle className="w-4 h-4 text-emerald-100" /> อนุมัติหลักสูตรนี้
                        </button>
                      ) : (
                        <div className="bg-amber-100 text-amber-905 border border-amber-250 rounded-xl px-4 py-2.5 text-center flex-1 font-bold text-[10.5px] flex items-center justify-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" /> อยู่ระหว่างรอ Admin อนุมัติวิชา
                        </div>
                      )
                    ) : (
                      <button
                        id="btn-trigger-start-lessons"
                        onClick={() => handleStartCourse(0)}
                        className="bg-[#15329c] hover:bg-[#11297e] text-white px-5 py-2.5 rounded-xl cursor-pointer shadow transition flex-1 sm:flex-initial flex items-center justify-center gap-2 text-xs"
                      >
                        <PlayCircle className="w-4 h-4" />
                        {relevantResult ? 'กลับไปอ่านทบทวนวิชา (Review)' : 'คลิกเริ่มเข้าเรียนวิชาทฤษฎี (Start)'}
                      </button>
                    )}
                  </div>
                </div>

              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50/50 border-2 border-dashed rounded-3xl shrink-0 my-auto text-slate-400">
                <Medal className="w-12 h-12 text-slate-300 mx-auto animate-bounce-slow" />
                <p className="text-xs font-bold mt-2">ยังไม่มีหลักสูตรบรรจุในหมวดหมู่นี้</p>
              </div>
            )}

          </div>

        </div>
      )}

      {/* 5. ADD COURSE MODAL (Admins & Editors) */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-slate-800">
          <div className="bg-white rounded-3xl shadow-xl border w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-750 p-4 font-bold text-white text-sm shrink-0 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Plus className="w-4 h-4" /> สถาบันความรู้: เพิ่มหลักสูตรและกำหนดสื่อการสอนใหม่</span>
              <button 
                type="button"
                onClick={() => setIsAddOpen(false)} 
                className="text-black hover:text-red cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCourseSubmit} className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
              
              {/* Section 1: ข้อมูลหลักสูตรทั่วไป */}
              <div className="space-y-3.5">
                <h4 className="font-extrabold text-[#15329c] text-xs border-b pb-1.5 flex items-center gap-1.5">
                  📊 ส่วนที่ 1: ข้อมูลทั่วไปและระบบเก่งกล้า (Course Metadata)
                </h4>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ชื่อหลักสูตรอบรม:*</label>
                  <input
                    type="text"
                    required
                    value={newCourseState.title}
                    onChange={(e) => setNewCourseState({ ...newCourseState, title: e.target.value })}
                    placeholder="เช่น การตรวจสอบคุณภาพแผ่นพลาสติกประกบลามิเนตด้วยกล้องขยาย"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">คำอธิบายรายละเอียดเป้าหมาย:*</label>
                  <textarea
                    required
                    rows={2}
                    value={newCourseState.description}
                    onChange={(e) => setNewCourseState({ ...newCourseState, description: e.target.value })}
                    placeholder="ระบุความมุ่งหมายของคอร์ส หัวข้อที่จะได้รับ และประโยชน์ในการสอบผ่าน..."
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600 block">หมวดหมู่หลักสูตร:</label>
                    <select
                      value={newCourseState.type}
                      onChange={(e) => setNewCourseState({ ...newCourseState, type: e.target.value as any })}
                      className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs"
                    >
                      <option value="Onboarding">🔰 ออนบอร์ดพนักงานใหม่ (Onboarding)</option>
                      <option value="General">🎯 วิชาเสริมศักยภาพช่างเทคนิค (General)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600 block">ระยะเวลาการอบรม:*</label>
                    <input
                      type="text"
                      required
                      value={newCourseState.durationHours}
                      onChange={(e) => setNewCourseState({ ...newCourseState, durationHours: e.target.value })}
                      placeholder="เช่น 1 ชั่วโมง, 45 นาที, 3 ชั่วโมง"
                      className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600 block">เกณฑ์ผ่านทดสอบ (%):*</label>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      required
                      value={newCourseState.minPassScore}
                      onChange={(e) => setNewCourseState({ ...newCourseState, minPassScore: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Checklist checkbox selector for Target Positions */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 block">กลุ่มพนักงานเป้าหมาย (ระดับประเมินความสามารถ):*</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-150">
                    {[
                      { id: 'pos-qc', val: 'QC', label: '🔬 พนักงานประกันคุณภาพ (QC/QA)' },
                      { id: 'pos-wh', val: 'Warehouse Staff', label: '📦 พนักงานคลังสินค้า (Warehouse)' },
                      { id: 'pos-op', val: 'Operator', label: '⚙️ พนักงานเดินสายการผลิต (Operator)' },
                      { id: 'pos-tc', val: 'Technician', label: '🛠️ แผนกช่างซ่อมบำรุง (Technician)' },
                      { id: 'pos-all', val: 'All Staff', label: '👥 พนักงานทั่วไป (All Staff)' }
                    ].map((item) => {
                      const isChecked = newCourseState.targetPositions.includes(item.val);
                      return (
                        <label key={item.id} className="flex items-center gap-2 cursor-pointer hover:text-indigo-700 select-none text-[11px]">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setNewCourseState({
                                  ...newCourseState,
                                  targetPositions: newCourseState.targetPositions.filter(p => p !== item.val)
                                });
                              } else {
                                setNewCourseState({
                                  ...newCourseState,
                                  targetPositions: [...newCourseState.targetPositions, item.val]
                                });
                              }
                            }}
                            className="rounded text-indigo-650 focus:ring-indigo-500 w-3.5 h-3.5"
                          />
                          {item.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Section 2: สื่อและไฟล์ในการเรียนรู้ (PDF, Images, Slides, Video) */}
              <div className="space-y-4">
                <h4 className="font-extrabold text-[#15329c] text-xs border-b pb-1.5 flex items-center gap-1.5">
                  📂 ส่วนที่ 2: เนื้อหาบทเรียนและสื่อทัศนูปกรณ์ (Learning Material / Media)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-600 block">หัวเรื่องบทเรียนแรกของคอร์ส:*</label>
                    <input
                      type="text"
                      required
                      value={newCourseState.lessonTitle}
                      onChange={(e) => setNewCourseState({ ...newCourseState, lessonTitle: e.target.value })}
                      placeholder="เช่น บทนำเรื่องความสลักสำคัญและสุขลักษณะ GMP"
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-slate-600 block">ประเภทสื่ออ้างอิงหลักหลักสูตร:</label>
                    <select
                      value={newCourseState.lessonMediaType}
                      onChange={(e) => setNewCourseState({ ...newCourseState, lessonMediaType: e.target.value as any })}
                      className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs text-slate-700 font-bold"
                    >
                      <option value="PDF">📄 เอกสารฉบับคู่มือสากล (PDF File)</option>
                      <option value="Image">📷 รูปแผนภูมิขั้นตอนหน้างาน (SOP Diagram Image)</option>
                      <option value="Slides">📊 งานนำเสนอพรีเซนเทชัน (PowerPoint Slides)</option>
                      <option value="Video">🎥 วิดีโอสตรีมขั้นตอนปฏิบัติงานจริง (MP4 / YouTube Video)</option>
                      <option value="Text">📝 บทเขียนวิเคราะห์และเอกสารประกอบ (Plain Text Only)</option>
                    </select>
                  </div>
                </div>

                {/* INTERACTIVE FILE UPLOADER SIMULATOR */}
                {newCourseState.lessonMediaType !== 'Text' && (
                  <div className="space-y-2">
                    <label className="font-semibold text-slate-600 block">
                      อัปโหลดไฟล์สื่อหลักสูตร ({newCourseState.lessonMediaType}):
                    </label>

                    <div className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/15 p-4 rounded-xl text-center space-y-2 transition relative overflow-hidden">
                      {newCourseState.isSimulatedUploading ? (
                        <div className="py-2 flex flex-col items-center justify-center space-y-2.5">
                          <RefreshCw className="w-7 h-7 text-indigo-500 animate-spin" />
                          <span className="text-[10px] text-indigo-700 font-semibold">กำลังตรวจสอบไฟล์และจัดเตรียมลิงก์เข้าสารระบบ...</span>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <input 
                            type="file" 
                            id="course-media-file-native" 
                            className="hidden"
                            accept={
                              newCourseState.lessonMediaType === 'PDF' ? '.pdf' :
                              newCourseState.lessonMediaType === 'Image' ? '.png,.jpg,.jpeg,.gif' :
                              newCourseState.lessonMediaType === 'Slides' ? '.ppt,.pptx,.key' :
                              newCourseState.lessonMediaType === 'Video' ? '.mp4,.mov,.webm' : '*'
                            }
                            onChange={(e) => {
                              const base = e.target.files?.[0];
                              if (base) {
                                setNewCourseState(prev => ({ ...prev, isSimulatedUploading: true }));
                                const reader = new FileReader();
                                reader.onload = async () => {
                                  try {
                                    const base64String = (reader.result as string).split(',')[1];
                                    const response = await fetch('/api/upload', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        filename: base.name,
                                        fileData: base64String,
                                        mimeType: base.type
                                      })
                                    });
                                    if (response.ok) {
                                      const data = await response.json();
                                      setNewCourseState(prev => ({
                                        ...prev,
                                        isSimulatedUploading: false,
                                        simulatedFileName: base.name,
                                        lessonMediaUrl: data.url
                                      }));
                                    } else {
                                      throw new Error('Server upload failed');
                                    }
                                  } catch (error) {
                                    console.error("Upload error, using local object url fallback:", error);
                                    const localUrl = URL.createObjectURL(base);
                                    setNewCourseState(prev => ({
                                      ...prev,
                                      isSimulatedUploading: false,
                                      simulatedFileName: base.name,
                                      lessonMediaUrl: localUrl
                                    }));
                                  }
                                };
                                reader.readAsDataURL(base);
                              }
                            }}
                          />
                          <GraduationCap className="w-10 h-10 text-indigo-500/80 mx-auto" strokeWidth={1.5} />
                          <div className="text-slate-700 font-bold text-[11px]">
                            {newCourseState.simulatedFileName ? (
                              <span className="text-emerald-700">✓ เลือกไฟล์สำเร็จ: {newCourseState.simulatedFileName}</span>
                            ) : (
                              <span>ลากและวางไฟล์ {newCourseState.lessonMediaType} หรือ คลิกเพื่ออัปโหลด</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400">
                            รองรับไฟล์เอกสารการศึกษาขนาดย่อม (จำลองระบบด้วย Sandbox WID)
                          </p>
                          <button
                            type="button"
                            onClick={() => document.getElementById('course-media-file-native')?.click()}
                            className="inline-flex items-center gap-1.5 bg-indigo-600 font-semibold hover:bg-indigo-700 text-white text-[10px] px-3.5 py-1.5 rounded-lg shadow-xs cursor-pointer transition mt-2"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" /> เลือกไฟล์คอมพิวเตอร์
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-1 font-mono">
                  <div className="flex justify-between items-center">
                    <label className="font-semibold text-slate-600 block">ลิงก์ความจริงทางอินเทอร์เน็ต (หรือใช้ที่อยู่สมมติระบบ):</label>
                    <span className="text-[9px] text-slate-400">ระบุเองหรือให้ระบบสุ่มตามประเภทสื่อข้อมูล</span>
                  </div>
                  <input
                    type="text"
                    value={newCourseState.lessonMediaUrl}
                    onChange={(e) => setNewCourseState({ ...newCourseState, lessonMediaUrl: e.target.value })}
                    placeholder="เช่น https://domain.com/files/manual.pdf หรือปล่อยว่างเพื่อสุ่มชุดสาธิต"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-[10.5px] font-mono text-slate-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">คำบรรยายประกอบเนื้อหาหลักสูตร:*</label>
                  <textarea
                    required
                    rows={4}
                    value={newCourseState.lessonContent}
                    onChange={(e) => setNewCourseState({ ...newCourseState, lessonContent: e.target.value })}
                    placeholder="ป้อนรายละเอียดทฤษฎี ข้อควรระวัง ข้อมูลวิศวกรรมการผลิต..."
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs leading-relaxed font-light"
                  />
                </div>
              </div>

              {/* Section 3: ข้อสอบท้ายวิชา */}
              <div className="space-y-4">
                <h4 className="font-extrabold text-[#15329c] text-xs border-b pb-1.5 flex items-center gap-1.5">
                  🧪 ส่วนที่ 3: ข้อสอบวัดสัมฤทธิ์ปลายหลักสูตร (Competency Assessment Question)
                </h4>

                {/* List of already added questions */}
                {addedQuizQuestions.length > 0 && (
                  <div className="bg-indigo-50/40 border border-indigo-150 rounded-xl p-3 space-y-2 animate-fade-in">
                    <span className="font-extrabold text-indigo-950 block text-[11px] flex items-center gap-1">
                      📝 รายการคำถามที่เพิ่มสำเร็จแล้ว ({addedQuizQuestions.length} ข้อ):
                    </span>
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                      {addedQuizQuestions.map((q, idx) => (
                        <div key={q.id} className="bg-white p-2.5 rounded-lg border border-indigo-100 flex items-start justify-between gap-2.5 text-[10px]">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-slate-800 block">ข้อที่ {idx + 1}: {q.question}</span>
                            <span className="bg-slate-100 text-slate-600 text-[8px] font-extrabold px-1 py-0.5 rounded uppercase mt-1 inline-block">
                              {q.type === 'SingleChoice' && 'Multiple Choice'}
                              {q.type === 'TrueFalse' && 'True/False'}
                              {q.type === 'Matching' && 'Matching'}
                              {q.type === 'Essay' && 'Essay'}
                            </span>
                            {q.type !== 'Essay' && q.type !== 'Matching' && q.options && (
                              <span className="text-[9px] text-slate-500 block mt-0.5 font-mono">
                                ตัวเลือก: {q.options.join(' | ')}
                              </span>
                            )}
                            {q.type === 'Matching' && q.pairs && (
                              <span className="text-[9px] text-slate-500 block mt-0.5 font-mono">
                                จับคู่: {q.pairs.map((p: any) => `${p.left} ➔ ${p.right}`).join(' | ')}
                              </span>
                            )}
                            <span className="text-[9px] text-emerald-700 font-bold block mt-0.5">
                              ✓ เฉลย: {q.type === 'Matching' ? 'จับคู่ถูกต้องครบถ้วนตามความสัมพันธ์' : q.correctAnswer}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAddedQuizQuestions(prev => prev.filter(item => item.id !== q.id))}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[9px] px-2 py-1 rounded transition cursor-pointer shrink-0"
                          >
                            ลบข้อนี้
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 bg-slate-50/50 border border-slate-150 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-[#15329c] text-[11px]">
                      {addedQuizQuestions.length > 0 ? `➕ ร่างข้อสอบข้อที่ ${addedQuizQuestions.length + 1}` : '✍️ ป้อนข้อสอบข้อแรก'}
                    </span>
                    <span className="text-[9.5px] text-slate-400">เลือกประเภทและป้อนคำถาม</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-600 block">ประเภทคำถามข้อสอบ (Question Type):*</label>
                      <select
                        value={newCourseState.quizType || 'SingleChoice'}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          let placeholderOptions = '';
                          let placeholderAnswer = '';
                          if (val === 'TrueFalse') {
                            placeholderOptions = 'ถูก (True)\nผิด (False)';
                            placeholderAnswer = 'ถูก (True)';
                          } else if (val === 'Matching') {
                            placeholderOptions = 'ชุด PPE = อุปกรณ์ป้องกันส่วนบุคคล\nหน้ากาก N95 = ป้องกันฝุ่นละออง\nรองเท้าเซฟตี้ = ป้องกันการกระแทก';
                            placeholderAnswer = '';
                          } else if (val === 'Essay') {
                            placeholderOptions = '';
                            placeholderAnswer = '(เกณฑ์ตอบคำถามอัตนัยปลายเปิด)';
                          } else {
                            placeholderOptions = 'ใช่ เพื่อความปลอดภัยสูงสุดและเสถียรภาพ\nไม่จำเป็น\nขึ้นอยู่กับดุลยพินิจ';
                            placeholderAnswer = 'ใช่ เพื่อความปลอดภัยสูงสุดและเสถียรภาพ';
                          }
                          setNewCourseState({
                            ...newCourseState,
                            quizType: val,
                            quizOptionsStr: placeholderOptions,
                            quizCorrectAnswer: placeholderAnswer
                          });
                        }}
                        className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs font-bold text-[#15329c]"
                      >
                        <option value="SingleChoice">Multiple Choice (คำถามปรนัยหลายตัวเลือก)</option>
                        <option value="TrueFalse">True / False (แบบถูก-ผิด)</option>
                        <option value="Matching">Matching (จับคู่คำตอบ)</option>
                        <option value="Essay">Essay (คำถามอัตนัย)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-slate-600 block">โจทย์คำถามทดสอบวัดและประเมินผล:*</label>
                      <input
                        type="text"
                        required={addedQuizQuestions.length === 0}
                        value={newCourseState.quizQuestion}
                        onChange={(e) => setNewCourseState({ ...newCourseState, quizQuestion: e.target.value })}
                        placeholder={
                          newCourseState.quizType === 'TrueFalse' ? "เช่น การไม่สวมหมวกนิรภัยในพื้นที่ผลิตถือเป็นเรื่องยอมรับได้หรือไม่?" :
                          newCourseState.quizType === 'Matching' ? "จงจับคู่อุปกรณ์ PPE ให้ตรงกับหน้าที่ที่ถูกต้อง" :
                          newCourseState.quizType === 'Essay' ? "จงอธิบายขั้นตอนการทำความสะอาดพื้นที่แบบ 5ส ด้วยตนเอง" :
                          "เช่น ขั้นตอนแรกก่อนสวมชุด PPE หน้ากากนิรภัยคืออะไร?"
                        }
                        className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {/* Dynamic Fields based on Question Type */}
                  {(newCourseState.quizType || 'SingleChoice') === 'SingleChoice' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="font-semibold text-slate-600 block">ตัวเลือกคำตอบข้อสอบ (1 ตัวเลือกต่อบรรทัด):*</label>
                          <span className="text-[10px] text-slate-400">แนะนำ 3-4 ตัวเลือก</span>
                        </div>
                        <textarea
                          required={addedQuizQuestions.length === 0}
                          rows={3}
                          value={newCourseState.quizOptionsStr}
                          onChange={(e) => setNewCourseState({ ...newCourseState, quizOptionsStr: e.target.value })}
                          placeholder="ล้างมือทำความสะอาดร่างกาย&#10;หยิบชุดสวมใส่ทันที&#10;แจ้งหัวหน้าแผนกรับทราบ"
                          className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-semibold text-slate-600 block">คำตอบที่ถูกต้องที่สุด (ต้องตรงกับตัวเลือกข้างต้น):*</label>
                        <input
                          type="text"
                          required={addedQuizQuestions.length === 0}
                          value={newCourseState.quizCorrectAnswer}
                          onChange={(e) => setNewCourseState({ ...newCourseState, quizCorrectAnswer: e.target.value })}
                          placeholder="ล้างมือทำความสะอาดร่างกาย"
                          className="w-full bg-white border border-indigo-100 p-2.5 rounded-lg text-xs font-bold text-[#15329c]"
                        />
                      </div>
                    </div>
                  )}

                  {(newCourseState.quizType || 'SingleChoice') === 'TrueFalse' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-600 block">ตัวเลือกคำตอบอัตโนมัติ:*</label>
                        <div className="bg-slate-100 p-3 rounded-lg text-xs text-slate-500 font-semibold space-y-1">
                          <div>• ถูก (True)</div>
                          <div>• ผิด (False)</div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="font-semibold text-slate-600 block">เลือกคำตอบที่ถูกต้อง:*</label>
                        <select
                          value={newCourseState.quizCorrectAnswer || 'ถูก (True)'}
                          onChange={(e) => setNewCourseState({ ...newCourseState, quizCorrectAnswer: e.target.value })}
                          className="w-full bg-white border border-indigo-100 p-2.5 rounded-lg text-xs font-bold text-[#15329c]"
                        >
                          <option value="ถูก (True)">ถูก (True)</option>
                          <option value="ผิด (False)">ผิด (False)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {(newCourseState.quizType || 'SingleChoice') === 'Matching' && (
                    <div className="grid grid-cols-1 gap-3 animate-fade-in">
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="font-semibold text-slate-600 block">คู่คำตอบฝั่งซ้ายและฝั่งขวา (รูปแบบ: ซ้าย = ขวา, 1 คู่ต่อบรรทัด):*</label>
                          <span className="text-[10px] text-amber-600 font-semibold">⚠️ ระบบจะจัดคู่เฉลยและสลับตัวเลือกตัวจับคู่อัตโนมัติ</span>
                        </div>
                        <textarea
                          required={addedQuizQuestions.length === 0}
                          rows={4}
                          value={newCourseState.quizOptionsStr}
                          onChange={(e) => setNewCourseState({ ...newCourseState, quizOptionsStr: e.target.value })}
                          placeholder="ชุด PPE = อุปกรณ์ป้องกันความปลอดภัยส่วนบุคคล&#10;หน้ากาก N95 = ป้องกันฝุ่นละอองและสารเคมี&#10;รองเท้าเซฟตี้ = ป้องกันการกระแทกและของมีคม"
                          className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {(newCourseState.quizType || 'SingleChoice') === 'Essay' && (
                    <div className="grid grid-cols-1 gap-3 animate-fade-in">
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-600 block">เกณฑ์การพิจารณาหรือคีย์เวิร์ดเฉลย (ไม่บังคับ):</label>
                        <input
                          type="text"
                          value={newCourseState.quizCorrectAnswer}
                          onChange={(e) => setNewCourseState({ ...newCourseState, quizCorrectAnswer: e.target.value })}
                          placeholder="เช่น พนักงานตอบครอบคลุมมาตรการ 5ส หรือความปลอดภัยอย่างใดอย่างหนึ่ง"
                          className="w-full bg-white border border-indigo-100 p-2.5 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleAddQuestionNext}
                      className="bg-[#15329c] hover:bg-[#11297e] text-white px-4 py-2 rounded-lg font-bold text-[10.5px] cursor-pointer shadow-xs transition flex items-center gap-1"
                    >
                      <span>➕ เพิ่มข้อถัดไป</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end gap-2 shrink-0 font-bold">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2.5 rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="bg-indigo-650 text-black hover:bg-indigo-750 px-5 py-2.5 rounded-xl shrink-0 cursor-pointer transition shadow"
                >
                  บันทึกลงระบบ (Register Course)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. EDIT COURSE MODAL (Admins & Editors) */}
      {isEditOpen && editingCourse && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-slate-800">
          <div className="bg-white rounded-3xl shadow-xl border w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 p-4 font-bold text-white text-sm shrink-0 flex items-center justify-between animate-pulse-slow">
              <span className="flex items-center gap-1.5"><Edit className="w-4 h-4" /> การกวดขันปรับโครงสร้างบทวิชา: {editingCourse.id}</span>
              <button onClick={() => { setIsEditOpen(false); setEditingCourse(null); }} className="text-slate-100 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleEditCourseSubmit} className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">ชื่อหลักสูตรอบรมหลัก:</label>
                <input
                  type="text"
                  required
                  value={editingCourse.title}
                  onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">คำอธิบายเป้าหมายหลักสูตร:</label>
                <textarea
                  required
                  rows={2}
                  value={editingCourse.description}
                  onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ประเภทหลักสูตร:</label>
                  <select
                    value={editingCourse.type}
                    onChange={(e) => setEditingCourse({ ...editingCourse, type: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs"
                  >
                    <option value="Onboarding">🔰 ออนบอร์ดพนักงานใหม่ (Onboarding)</option>
                    <option value="General">🎯 วิชาเสริมศักยภาพช่างเทคนิค (General)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">คะแนนขั้นต่ำผ่าน (%):</label>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={editingCourse.minPassScore}
                    onChange={(e) => setEditingCourse({ ...editingCourse, minPassScore: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ระยะเวลาการเรียนรู้:</label>
                  <input
                    type="text"
                    required
                    value={editingCourse.durationHours || ''}
                    onChange={(e) => setEditingCourse({ ...editingCourse, durationHours: e.target.value })}
                    placeholder="เช่น 2 ชั่วโมง 30 นาที"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">กลุ่มเป้าหมาย (คั่นด้วยจุลภาค):</label>
                  <input
                    type="text"
                    required
                    value={editingCourse.targetPositionsStr || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const arr = val.split(',').map(v => v.trim()).filter(Boolean);
                      setEditingCourse({
                        ...editingCourse,
                        targetPositionsStr: val,
                        targetPositions: arr
                      });
                    }}
                    placeholder="เช่น Warehouse Staff, QC, Operator"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* JSON formatting lessons editing */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-slate-600 block">บทเรียน (Lessons Structure JSON):</label>
                  <span className="text-[10px] text-indigo-700 italic">ฟอร์แมต JSON แอรเรย์</span>
                </div>
                <textarea
                  rows={5}
                  value={editingCourse.lessonsStr || ''}
                  onChange={(e) => setEditingCourse({ ...editingCourse, lessonsStr: e.target.value })}
                  className="w-full bg-slate-100 border border-slate-250 p-2.5 rounded-lg text-[11px] font-mono whitespace-pre text-slate-800"
                  required
                />
              </div>

              {/* JSON formatting quiz questions editing */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-slate-600 block">ข้อสอบแนววิเคราะห์ท้ายวิชา (Quiz Questions JSON):</label>
                  <span className="text-[10px] text-[#e51a24] italic">ระเบียบคำตอบ correctAnswer</span>
                </div>
                <textarea
                  rows={4}
                  value={editingCourse.quizStr || ''}
                  onChange={(e) => setEditingCourse({ ...editingCourse, quizStr: e.target.value })}
                  className="w-full bg-slate-100 border border-slate-250 p-2.5 rounded-lg text-[11px] font-mono whitespace-pre text-slate-800"
                  required
                />
              </div>

              <div className="pt-4 border-t flex justify-end gap-2 shrink-0 font-bold">
                <button
                  type="button"
                  onClick={() => { setIsEditOpen(false); setEditingCourse(null); }}
                  className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-4 py-2 rounded-xl"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 text-white hover:bg-amber-700 px-5 py-2 rounded-xl"
                >
                  บันทึกการปรับปรุงคอร์ส
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    {isCertBadgeModalOpen && modalSelectedCourse && (
      <BadgeCertificateModal
        isOpen={isCertBadgeModalOpen}
        onClose={() => setIsCertBadgeModalOpen(false)}
        user={currentUser}
        course={modalSelectedCourse}
        score={modalSelectedScore}
        completedDate={modalSelectedDate}
      />
    )}

    </div>
  );
};
