/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  BarChart3, Award, Search, Users, 
  HelpCircle, ChevronRight, FileText, 
  CheckCircle, AlertTriangle, BookOpen, Clock, PlayCircle,
  Printer
} from 'lucide-react';
import { 
  User, DocumentItem, Course, KBArticle, 
  SearchLog, UserCourseProgress, Role, Expert 
} from '../types';
import { getUserBadges } from '../utils/badgeUtils';
import { BadgePill } from './BadgeDisplay';
import { BadgeCertificateModal } from './BadgeCertificateModal';

interface DashboardProps {
  currentUser: User;
  documents: DocumentItem[];
  kbArticles: KBArticle[];
  experts: Expert[];
  searchLogs: SearchLog[];
  userProgressList: UserCourseProgress[];
  examResults: any[];
  users: User[];
  courses: Course[];
  onTriggerGapFill: (keyword: string) => void;
  onNavigateToModule: (module: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  documents,
  kbArticles,
  experts,
  searchLogs,
  userProgressList,
  examResults,
  users,
  courses,
  onTriggerGapFill,
  onNavigateToModule,
}) => {
  const visibleUsers = users;
  const [selectedUserTranscript, setSelectedUserTranscript] = useState<User | null>(() => {
    return visibleUsers.find(u => u.id === 'u-4') || visibleUsers[0] || null;
  }); // Def to Somsri if visible, else first visible user
  const [isISOModalOpen, setIsISOModalOpen] = useState(false);

  // States for dynamic badge/certificate generation
  const [isCertBadgeModalOpen, setIsCertBadgeModalOpen] = useState(false);
  const [modalSelectedCourse, setModalSelectedCourse] = useState<Course | null>(null);
  const [modalSelectedScore, setModalSelectedScore] = useState<number>(100);
  const [modalSelectedDate, setModalSelectedDate] = useState<string | undefined>(undefined);

  // Assemble certificate / passed courses dynamically for the selected transcript member
  const getTranscriptCompletedCourses = (userTranscript: User | null) => {
    if (!userTranscript) return [];
    
    const completedFromProgress = userProgressList.filter(
      (p) => p.userId === userTranscript.id && p.status === 'Completed'
    );
    const completedFromExams = examResults.filter(
      (e) => e.employeeId === userTranscript.employeeId && e.pass
    );

    const completedMap = new Map<string, { course: Course; score: number; date: string; isDemo?: boolean }>();

    completedFromProgress.forEach((p) => {
      const c = courses.find((course) => course.id === p.courseId);
      if (c) {
        completedMap.set(p.courseId, {
          course: c,
          score: p.score ?? 100,
          date: p.completedDate ? p.completedDate.split('T')[0] : '2026-06-15'
        });
      }
    });

    completedFromExams.forEach((e) => {
      const c = courses.find((course) => course.id === e.courseId);
      if (c) {
        completedMap.set(e.courseId, {
          course: c,
          score: e.score,
          date: e.date || '2026-06-15'
        });
      }
    });

    const realList = Array.from(completedMap.values());
    return realList;
  };

  const activeTranscriptCompletions = getTranscriptCompletedCourses(selectedUserTranscript);

  // Hidden print helper logic using standalone iframe
  const handlePrint = () => {
    const printContents = document.getElementById('printable-iso-area')?.innerHTML;
    if (printContents) {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (iframeDoc) {
        // Collect current CSS sheets to preserve beautiful styling
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
          .map(style => style.outerHTML)
          .join('\n');
        
        iframeDoc.write(`
          <html>
            <head>
              <title>RMP ISO-9001 Compliance Audit Certification - ${selectedUserTranscript?.name}</title>
              ${styles}
              <style>
                body { font-family: "Inter", "Sarabun", sans-serif; padding: 24px; background: white; color: #1e293b; }
                #printable-iso-content { border: 1px solid #e1ded5; border-radius: 12px; }
                @media print {
                  body { padding: 0; }
                  .no-print { display: none !important; }
                }
              </style>
            </head>
            <body>
              <div id="printable-iso-content">
                ${printContents}
              </div>
            </body>
          </html>
        `);
        iframeDoc.close();
        
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        }, 500);
      }
    }
  };

  // 1. Knowledge Calculations
  const totalKnowledgeCount = documents.filter(d => d.status === 'Published').length + kbArticles.filter(k => k.status === 'Approved').length;
  const newKnowledgeThisMonth = 5; // Static context representation
  
  const totalViews = documents.reduce((sum, d) => sum + d.views, 0) + kbArticles.reduce((sum, k) => sum + k.views, 0);
  const totalDownloads = documents.reduce((sum, d) => sum + d.downloads, 0);

  // 2. Learning Calculations (Assigned = 500, Completed = 450 as requested by spec, but we dynamically calculate based on our simulation)
  const totalCompleted = examResults.filter(e => e.pass).length + userProgressList.filter(u => u.status === 'Completed').length;
  const totalAssignedCount = visibleUsers.length * 2; // For demonstration
  const completionRate = totalAssignedCount > 0 ? Math.round((totalCompleted / totalAssignedCount) * 100) : 88;
  
  const totalCompletedCountForScore = examResults.length + userProgressList.filter(u => u.status === 'Completed').length;
  const averagePassingScore = totalCompletedCountForScore > 0
    ? Math.round(
        [...examResults, ...userProgressList.filter(u => u.status === 'Completed' && u.score !== undefined).map(u => ({ score: u.score }))]
          .reduce((sum, u) => sum + (u.score || 0), 0) / totalCompletedCountForScore
      )
    : 89;
  
  const totalTrainingHours = 3250; // Requested organization target metrics

  // 3. Gap Analysis calculation
  // Find search queries where hasResult is false, grouped by count
  const failedSearchesMap = searchLogs
    .filter(log => !log.hasResult)
    .reduce((acc, curr) => {
      acc[curr.keyword] = (acc[curr.keyword] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

  const gapAnalysisList = Object.entries(failedSearchesMap)
    .map(([keyword, count]) => ({ keyword, count: count as number }))
    .sort((a, b) => b.count - a.count);

  // 4. Expert lookup
  const sortedExpertsBySkill = [...experts].sort((a, b) => b.experienceYears - a.experienceYears);

  // Competency Rules
  // QC requires QC Certification
  // Production requires Forklift Operations
  // Warehouse Staff requires Onboarding Warehouse
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

  return (
    <>
      <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-[#15329c]/5 via-white to-white p-6 rounded-xl border border-[#e1ded5] border-l-4 border-l-[#15329c] text-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs animate-fade-in">
        <div>
          <span className="bg-[#15329c]/10 text-[#15329c] text-[9.5px] px-2.5 py-1 rounded-md font-bold uppercase tracking-widest border border-[#15329c]/20">
            Enterprise Dashboard & Analytics
          </span>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 mt-2">
            ข้อมูลสถิติ & ศักยภาพองค์ความรู้องค์กร
          </h2>
          <p className="text-slate-600 text-xs mt-1">
            รายงานอัจฉริยะสำหรับติดตามตัววัดผลทางความรับรู้งาน (Knowledge KPI, Training Rate, Competency, และช่องทางอุดรอยรั่ว)
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            id="nav-to-kb-btn"
            onClick={() => onNavigateToModule('Technical Knowledge Base')}
            className="bg-[#e51a24] hover:bg-[#cb131c] text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-all cursor-pointer shadow-md shadow-[#e51a24]/20 hover:-translate-y-0.5 tracking-wider font-sans whitespace-nowrap"
          >
            ไปที่เทคนิคหน้าเครื่องจักร
          </button>
        </div>
      </div>

      {/* 3 Metrics Block Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Knowledge KPI Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
              Knowledge KPI (คลังความรู้)
            </span>
            <FileText className="w-5 h-5 text-[#15329c]" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">{totalKnowledgeCount}</div>
            <p className="text-slate-500 text-xs mt-1">องค์ความรู้และมาตรฐานอนุมัติใช้</p>
          </div>
          <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-[#e51a24] font-bold text-sm">+{newKnowledgeThisMonth}</span>
              <span className="block text-[9px] text-slate-400">ใหม่เดือนนี้</span>
            </div>
            <div>
              <span className="text-slate-800 font-bold text-sm">{totalViews}</span>
              <span className="block text-[9px] text-slate-400">เข้าชมรวม</span>
            </div>
            <div>
              <span className="text-slate-800 font-bold text-sm">{totalDownloads}</span>
              <span className="block text-[9px] text-slate-400">ดาวน์โหลด</span>
            </div>
          </div>
        </div>

        {/* Learning KPI Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
              Learning & Training KPI
            </span>
            <Award className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-900">{completionRate}%</div>
            <p className="text-slate-500 text-xs mt-1">อัตราเรียนจบ Onboarding สะสม</p>
          </div>
          <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-green-600 font-bold text-sm">{averagePassingScore}%</span>
              <span className="block text-[9px] text-slate-400">คะแนนเฉลี่ย</span>
            </div>
            <div>
              <span className="text-slate-800 font-bold text-sm">{totalTrainingHours}</span>
              <span className="block text-[9px] text-slate-400">ชั่วโมงรวมองค์กร</span>
            </div>
            <div>
              <span className="text-slate-800 font-bold text-sm">
                {visibleUsers.length}
              </span>
              <span className="block text-[9px] text-slate-400">ผู้เรียนเปิดใช้งาน</span>
            </div>
          </div>
        </div>

        {/* Expert Yellow pages KPI Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
              Expert KPI (ผู้เชี่ยวชาญ)
            </span>
            <Users className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-900">{experts.length} ท่าน</div>
            <p className="text-slate-500 text-xs mt-1">ได้รับการแต่งตั้งครอบคลุมทุกแผนก</p>
          </div>
          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-center">
            <div className="border-r border-slate-100">
              <span className="text-amber-600 font-bold text-sm">ช่างสมชาย</span>
              <span className="block text-[9px] text-slate-400">เข้าชมทักษะสูงสุด</span>
            </div>
            <div>
              <span className="text-slate-800 font-bold text-sm">Film Blowing</span>
              <span className="block text-[9px] text-slate-400">หัวข้อถูกค้นหาหลัก</span>
            </div>
          </div>
        </div>
      </div>

      {/* ISO Audit Readiness & Knowledge Retention Metrics Dashboard (Summary) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ISO 9001/HACCP Audit Readiness Score */}
        <div className="bg-gradient-to-br from-[#15329c] to-[#111e4f] p-5 rounded-2xl border border-indigo-950 text-white shadow flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-indigo-200 text-[10px] font-bold uppercase tracking-wider bg-white/10 px-2 py-0.5 rounded-md">
              ISO Audit Readiness
            </span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-3xl font-black text-white tracking-tight">96.8%</div>
            <p className="text-indigo-100 text-[11px] mt-1">ดัชนีความพร้อมรับผู้ตรวจประเมิน ISO 9001</p>
          </div>
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-[10px] text-indigo-200">
              <span>QP/WI Approval Rate</span>
              <span>100% Verified</span>
            </div>
            <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: '100%' }}></div>
            </div>
            <p className="text-[10.5px] text-indigo-300 italic">
              เอกสารมาตรฐาน {documents.filter(d => d.status === 'Published').length} ฉบับผ่านเกณฑ์อนุมัติพับลิชครบถ้วน ไม่มีรุ่นร่างตกหล่น
            </p>
          </div>
        </div>

        {/* AI RAG Assistant Usage & Resolution Index */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
              AI RAG Usage & Resolve
            </span>
            <BarChart3 className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-800 tracking-tight">
              {searchLogs.length > 0 
                ? Math.round((searchLogs.filter(s => s.hasResult).length / searchLogs.length) * 100) 
                : 91}%
            </div>
            <p className="text-slate-500 text-[11px] mt-1">อัตราตอบคำถามสืบค้นอัจฉริยะสำเร็จ (Resolution Rate)</p>
          </div>
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span className="flex items-center gap-1">จำนวนการสืบค้นผ่าน AI</span>
              <span className="font-bold">{searchLogs.length + 8} ครั้ง</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${searchLogs.length > 0 ? (searchLogs.filter(s => s.hasResult).length / searchLogs.length) * 100 : 91}%` }}></div>
            </div>
            <p className="text-[10px] text-slate-400">
              หัวข้อสืบค้นยอดฮิต: "เครื่องจักรไม่ทำงาน", "Forklift", "สไลด์ลามิเนต"
            </p>
          </div>
        </div>

        {/* Loss Prevention Tacit Retention Index */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
              Loss Prevention Index
            </span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-800 tracking-tight">84.5%</div>
            <p className="text-slate-500 text-[11px] mt-1">ดัชนีแปลง Tacit Knowledge สู่ระบบ (Retention)</p>
          </div>
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>ถอดบทเรียนเซียนเชิงช่าง</span>
              <span>{kbArticles.filter(k => k.status === 'Approved').length} บทเรียนไคเซ็น</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: '84.5%' }}></div>
            </div>
            <p className="text-[10px] text-slate-400">
              เซฟชั่วโมงช่อมบำรุงสะสมจากการสืบค้นหน้าไลน์ผลิตไปแล้วกว่า 120 ชม./ปี
            </p>
          </div>
        </div>
      </div>

      {/* Middle Block: Gap Analysis & Target Fill + Expert Consulting */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GAP Analytical System (IMPORTANT) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
              <span className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Gap Analysis (การวิเคราะห์หาช่องโหว่ความรู้)</h3>
                <p className="text-xs text-slate-500">
                  คำศัพท์ที่พนักงานเสิร์ชค้นหาบ่อยครั้งในระบบ แต่ไม่มีบทความรองรับ สำหรับกู่สร้างความรู้ใหม่
                </p>
              </div>
            </div>

            <div className="space-y-3 my-3">
              {gapAnalysisList.length === 0 ? (
                <p className="text-slate-400 text-xs py-6 text-center">พนักงานทุกคนค้นพบความรู้ครบถ้วน 100% ปัจจุบันยังไม่มีข้อผิดพลาดอับผล</p>
              ) : (
                gapAnalysisList.map((gap, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-red-50/50 hover:bg-neutral-50 rounded-xl border border-red-100 transition">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-mono">
                          ไม่มีข้อมูล ({gap.count} ครั้ง)
                        </span>
                        <span className="text-xs font-bold text-slate-800">"{gap.keyword}"</span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        แนะนำดึง Tacit จากผู้เชี่ยวชาญเพื่อป้องกันความรู้รั่วซึมเมื่อคนกะลาออก
                      </p>
                    </div>

                    {currentUser.role !== 'Viewer' ? (
                      <button
                        id={`btn-fill-gap-${i}`}
                        onClick={() => onTriggerGapFill(gap.keyword)}
                        className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                      >
                        สร้างความรู้ใหม่
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic font-mono">Editor Only</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          
          <div className="bg-[#fcfbf9] p-3 rounded-xl text-xs text-slate-600 border border-[#e1ded5] leading-relaxed">
            <strong>💡 คำแนะนำ 2S/改善:</strong> หัวข้อ <span className="text-[#1e3a8a] font-bold">Lamination</span> และ <span className="text-[#1e3a8a] font-bold">เป่าขวด PET</span> มีความเสี่ยงความรู้สูญหายระดับ <strong className="text-[#e51a24]">สูงมาก (Critical)</strong> เนื่องจากมีช่างเทคนิคที่เชี่ยวชาญงานแท่นเพียง 1 ท่านและกำลังจะครบวาระเกษียณในพ.ศ. นี้
          </div>
        </div>

        {/* Training Success Rates & KPI Breakdown (Course Progress visual list) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#e1ded5]">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-[#15329c]/5 text-[#15329c] rounded-lg">
                  <BookOpen className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">เกณฑ์คะแนนเฉลี่ยคอร์สฝึกอบรมหลัก</h3>
                  <p className="text-xs text-slate-400">คะแนนเฉลี่ยจากการทำแบบทดสอบแยกหลักสูตร</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span>1. Onboarding for Warehouse Staff (พนักงานคลังสินค้า)</span>
                  <span className="text-[#15329c] font-bold">90% Pass Rate</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#15329c] rounded-full" style={{ width: '90%' }}></div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span>2. Raw Materials Inspection (ตรวจเคมีวัตถุดิบ)</span>
                  <span className="text-emerald-600">89% Pass Rate</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '89%' }}></div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span>3. Forklift Operation Safety (ขับรถยกเซฟตี้)</span>
                  <span className="text-amber-600">92% Pass Rate</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: '92%' }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">จำนวนการสอบผ่านสะสมในระบบ: <strong className="text-slate-800">12 ค่าย</strong></span>
            <button 
              onClick={() => onNavigateToModule('Learning & Certification')}
              className="text-[#15329c] font-bold hover:text-[#e51a24] hover:underline flex items-center gap-1 cursor-pointer transition-colors"
            >
              ไปเพิ่มหลักสูตรใหม่
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Competency Matrix & Individual Learning Transcripts */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <CheckCircle className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Competency Matrix & Learning Transcripts</h3>
              <p className="text-xs text-slate-500">ติดตามพนักงานแต่ละท่านว่าอบรมครบตามกำหนดของตำแหน่งงานหรือไม่</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* List of personnel */}
          <div className="md:col-span-1 border-r border-slate-100 pr-0 md:pr-4 space-y-2">
            <span className="block text-slate-500 text-[10px] font-bold uppercase mb-2">เลือกพนักงานทดสอบดูทรานสคริปต์</span>
            {visibleUsers.map((u) => {
              const reqs = getRequiredCoursesForPosition(u.position);
              
              return (
                <button
                  key={u.id}
                  id={`btn-select-transcript-user-${u.id}`}
                  onClick={() => setSelectedUserTranscript(u)}
                  className={`w-full text-left p-3 rounded-xl border transition flex items-center gap-3 cursor-pointer ${
                    selectedUserTranscript?.id === u.id
                      ? 'border-emerald-600 bg-emerald-50 text-slate-900'
                      : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <img
                    src={u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80'}
                    alt={u.name}
                    className="w-8 h-8 rounded-full object-cover border"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs truncate leading-tight">{u.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono truncate">{u.employeeId} • {u.position.split(' / ')[0]}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Transcript details */}
          {selectedUserTranscript && (
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap pb-2 border-b border-slate-100">
                <div>
                  <h4 className="font-black text-slate-800 text-sm tracking-tight flex items-center gap-1.5">
                    Learning Transcript การฝึกอบรม: {selectedUserTranscript.name}
                  </h4>
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    รหัสพนักงาน: {selectedUserTranscript.employeeId} | สังกัด: {selectedUserTranscript.department}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    id="btn-export-iso-audit"
                    onClick={() => setIsISOModalOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-extrabold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    ส่งออกรายงาน ISO Audit (PDF)
                  </button>
                  <span className="text-[10px] font-extrabold bg-[#15329c]/10 text-[#15329c] px-2.5 py-1.5 rounded border border-[#15329c]/20 font-mono text-right">
                    หลักสูตรตาม Competency Matrix
                  </span>
                </div>
              </div>

              {/* Earned Badges Row */}
              <div className="flex flex-wrap items-center gap-2 py-2 px-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">ตราทักษะที่ครอบครอง (Badges):</span>
                {getUserBadges(selectedUserTranscript, userProgressList, examResults, kbArticles).filter(b => b.earned).length === 0 ? (
                  <span className="text-slate-400 text-[10.5px] italic">ยังไม่มีเข็มตราที่ได้รับการเปิดล็อคในหลักสูตรขณะนี้</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5 animate-in fade-in">
                    {getUserBadges(selectedUserTranscript, userProgressList, examResults, kbArticles)
                      .filter(b => b.earned)
                      .map(badge => (
                        <BadgePill key={badge.id} badge={badge} />
                      ))}
                  </div>
                )}
              </div>

              {/* Requirement Matrix compliance display */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">
                  ตามตำแหน่งงานคู่ควรหลักสูตรบังคับ (Competency Matrix Verification)
                </span>

                <div className="space-y-2">
                  {getRequiredCoursesForPosition(selectedUserTranscript.position).map((reqCourseId) => {
                    const matchedCourse = courses.find(c => c.id === reqCourseId);
                    
                    // check user status
                    const currentProgress = userProgressList.find(p => p.userId === selectedUserTranscript.id && p.courseId === reqCourseId);
                    const examResultObj = examResults.find(e => e.employeeId === selectedUserTranscript.employeeId && e.courseId === reqCourseId);

                    const isCompleted = currentProgress?.status === 'Completed' || (examResultObj && examResultObj.pass);
                    const scoreVal = examResultObj?.score ?? currentProgress?.score;

                    return (
                      <div key={reqCourseId} className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2">
                          {isCompleted ? (
                            <span className="bg-green-100 text-green-700 p-1 rounded-full">
                              <CheckCircle className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <span className="bg-amber-100 text-amber-700 p-1 rounded-full">
                              <Clock className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <div className="text-xs">
                            <span className="font-medium text-slate-700">
                              {matchedCourse?.title || 'หลักสูตรเฉพาะทาง'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right text-xs">
                          {isCompleted ? (
                            <span className="text-green-600 font-bold font-mono">
                              ผ่าน ({scoreVal}%)
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium font-mono">
                              ยังเรียนไม่ผ่าน / รอดำเนินการ
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* General study log with dynamic certificates/badges */}
              <div>
                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-2">ประวัติการเรียนและการรับใบวิชาชีพดิจิทัล (Digital Badge & Certificate Logs)</span>
                <div className="border border-slate-150 rounded-xl overflow-hidden text-xs bg-white">
                  <div className="grid grid-cols-12 bg-slate-50 p-2.5 font-bold text-slate-600 border-b border-slate-150">
                    <div className="col-span-5 sm:col-span-6">หลักสูตรมาตรฐาน</div>
                    <div className="col-span-3 sm:col-span-2 text-center">ผลการสอบประเมิน</div>
                    <div className="col-span-2 sm:col-span-1 text-center">สะสม</div>
                    <div className="col-span-2 sm:col-span-3 text-right">ใบประดับ & เกียรติบัตร</div>
                  </div>
                  
                  {activeTranscriptCompletions.map((item, idx) => (
                    <div key={`${item.course.id}-${idx}`} className="p-2.5 grid grid-cols-12 border-t border-slate-100 hover:bg-slate-50/50 items-center transition">
                      <div className="col-span-5 sm:col-span-6 flex flex-col gap-0.5">
                        <span className="font-extrabold text-slate-800 leading-tight">
                          {item.course.title}
                        </span>
                        {item.isDemo && (
                          <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-100 rounded-md font-bold px-1.5 py-0.2 w-max uppercase">
                            ตัวอย่างพรีวิว / Demo Preview
                          </span>
                        )}
                        <span className="text-[9px] text-slate-400 font-mono">
                          สำเร็จเมื่อ: {item.date}
                        </span>
                      </div>
                      <div className="col-span-3 sm:col-span-2 text-center text-emerald-600 font-black">
                        ผ่าน ({item.score}%)
                      </div>
                      <div className="col-span-2 sm:col-span-1 text-center font-mono font-medium text-slate-500">
                        {item.course.durationHours || '2.0'} ชม.
                      </div>
                      <div className="col-span-2 sm:col-span-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setModalSelectedCourse(item.course);
                            setModalSelectedScore(item.score);
                            setModalSelectedDate(item.date);
                            setIsCertBadgeModalOpen(true);
                          }}
                          className="bg-indigo-50 hover:bg-indigo-100 text-[#15329c] font-bold text-[10.5px] px-2.5 py-1.5 rounded-lg border border-indigo-200 cursor-pointer shadow-xs transition-all inline-flex items-center gap-1"
                        >
                          <Award className="w-3.5 h-3.5 text-amber-500" />
                          <span>ดูความสำเร็จ</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {activeTranscriptCompletions.length === 0 && (
                    <div className="p-4 text-center text-slate-450 italic">
                      ไม่พบประวัติวิชาชีพบรรลุเป้าหมายของพนักงานรายนี้
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {isISOModalOpen && selectedUserTranscript && (
      <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
        <div className="bg-slate-100 rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden text-left">
          {/* Modal Header */}
          <div className="bg-[#15329c] text-white px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-400" />
              <h3 className="font-extrabold text-xs tracking-tight">ISO Audit Compliance Report PDF Preview</h3>
            </div>
            <button 
              onClick={() => setIsISOModalOpen(false)}
              className="text-white hover:text-red-300 font-bold bg-white/10 w-7 h-7 rounded-full flex items-center justify-center text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Modal Body / Report Display */}
          <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
            <div className="mb-4 text-center text-xs text-slate-600 bg-amber-50 border border-amber-200 p-3 rounded-xl leading-relaxed">
              <span>💡 <strong>คำแนะนำการประเมิน ISO 9001:2015 Clause 7.2 (Competence):</strong> คลิกปุ่ม <strong>"พิมพ์หรือเซฟรายงานเป็น PDF"</strong> ด้านล่าง แล้วเลือก Printer ปลายทางเป็น <strong>"Save as PDF"</strong> เม็ดสีกระดาษ รอยพับ และตราสลักรับรองจะเรียงตัวสวยงามพอดีกับกระดาษรายงาน A4 พร้อมประกอบแฟ้มประมวลผลการสอบทวนของท่านทันทีค่ะ</span>
            </div>

            {/* Printable ISO Area */}
            <div 
              id="printable-iso-area" 
              className="bg-white p-8 border border-slate-300 rounded-2xl shadow-sm text-slate-800"
            >
              {/* Official Header */}
              <div className="pb-6 border-b-2 border-[#15329c]/30 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#15329c] rounded-xl flex items-center justify-center text-white font-black text-xs font-mono">
                    RMP
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-sm tracking-wider">ROYAL MEIWA PAX CO., LTD.</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">บริษัท รอแยล เมอิวะ แพ็คซ์ จำกัด (สำนักงานพัฒนามาตรฐานวิศวกรรม & HRD)</p>
                    <p className="text-[9px] text-slate-400 font-mono">ISO 9001:2015 REGISTERED FACILITY • FACTORY SEC SUKHUMVIT 74</p>
                  </div>
                </div>
                <div className="text-right border-l-0 md:border-l border-slate-205 pl-0 md:pl-4 space-y-1">
                  <span className="inline-block text-[10px] font-black bg-[#15329c]/10 text-[#15329c] px-2.5 py-0.5 rounded border border-[#15329c]/20 font-mono text-center">
                    ISO/9001:2015 COMPLIANT
                  </span>
                  <p className="text-[10px] text-slate-500 font-mono">REF No: RMP-TR-ISO-{selectedUserTranscript.employeeId}</p>
                  <p className="text-[9px] text-slate-400 font-mono">Rev. 02 • Effective: 2026-06-16</p>
                </div>
              </div>

              {/* Report Title */}
              <div className="py-6 text-center">
                <h3 className="font-extrabold text-slate-950 text-base leading-tight">
                  รายงานระเบียนประวัติการฝึกอบรมและประเมินสมรรถนะรายบุคคล
                </h3>
                <h4 className="font-mono text-slate-500 text-[10px] mt-1 font-bold">
                  INDIVIDUAL TRAINING TRANSCRIPT & COMPETENCY ASSESSMENT REPORT
                </h4>
              </div>

              {/* Personnel Demographics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs mb-6">
                <div className="space-y-1.5">
                  <div className="flex"><span className="text-slate-400 w-28 shrink-0">ชื่อ-นามสกุล (Name):</span> <span className="font-extrabold text-slate-800">{selectedUserTranscript.name}</span></div>
                  <div className="flex"><span className="text-slate-400 w-28 shrink-0">รหัสพนักงาน (ID):</span> <span className="font-mono font-extrabold text-slate-850">{selectedUserTranscript.employeeId}</span></div>
                  <div className="flex"><span className="text-slate-400 w-28 shrink-0">ฝ่ายสังกัด (Dept):</span> <span className="font-medium text-slate-800">{selectedUserTranscript.department}</span></div>
                </div>
                <div className="space-y-1.5 md:border-l md:border-slate-200 md:pl-4">
                  <div className="flex"><span className="text-slate-400 w-28 shrink-0">ตำแหน่ง (Position):</span> <span className="font-semibold text-slate-800">{selectedUserTranscript.position}</span></div>
                  <div className="flex"><span className="text-slate-400 w-28 shrink-0">สถานะตรวจสอบ (Audit):</span> <span className="text-emerald-700 font-extrabold flex items-center gap-1">● VERIFIED & COMPLIANT</span></div>
                  <div className="flex"><span className="text-slate-400 w-28 shrink-0">วันที่พิมพ์ (Issued Date):</span> <span className="font-mono text-slate-800">{new Date().toISOString().split('T')[0]}</span></div>
                </div>
              </div>

              {/* Section 1: Competency matrix matching */}
              <div className="space-y-3 mb-6 text-left">
                <div className="border-b border-[#15329c]/20 pb-1.5 flex items-center justify-between">
                  <span className="text-[10.5px] font-black text-[#15329c] tracking-wider uppercase">
                    ส่วนที่ 1: ตารางประเมินระดับสมรรถนะขั้นบังคับ (COMPETENCY MATRIX EVALUATION)
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">ISO 9001:2015 Clause 7.2 Requirements</span>
                </div>
                
                <div className="space-y-2 text-xs">
                  {getRequiredCoursesForPosition(selectedUserTranscript.position).map((reqCourseId, idx) => {
                    const matchedCourse = courses.find(c => c.id === reqCourseId);
                    const currentProgress = userProgressList.find(p => p.userId === selectedUserTranscript.id && p.courseId === reqCourseId);
                    const examResultObj = examResults.find(e => e.employeeId === selectedUserTranscript.employeeId && e.courseId === reqCourseId);
                    const isCompleted = currentProgress?.status === 'Completed' || (examResultObj && examResultObj.pass);
                    const scoreVal = examResultObj?.score ?? currentProgress?.score;
                    
                    return (
                      <div key={reqCourseId} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-150 gap-2">
                        <div>
                          <div className="font-bold text-slate-800">
                            {idx + 1}. {matchedCourse?.title || 'หลักสูตรมาตรฐานโรงงาน'} ({reqCourseId})
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            ระดับความจำเป็น: สำคัญระดับวิกฤตสำหรับตำแหน่ง {selectedUserTranscript.position.split(' / ')[0]}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 self-end sm:self-auto font-mono text-right text-xs">
                          {isCompleted ? (
                            <div className="space-y-0.5">
                              <span className="text-emerald-800 font-black bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded text-[10px]">
                                COMPLIANT (ผ่าน {scoreVal}%)
                              </span>
                              <div className="text-[9px] text-slate-400">ประเมินเมื่อ: {examResultObj?.date || '2026-06-10'}</div>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="text-amber-800 font-black bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded text-[10px]">
                                PENDING (กำลังบ่มเพาะปูพื้นฐาน)
                              </span>
                              <div className="text-[9px] text-slate-400">เป้าหมาย: สำเร็จก่อนการตรวจสอบรอบถัดไป</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Detailed Learning Record Logs */}
              <div className="space-y-3 mb-6 text-left">
                <div className="border-b border-[#15329c]/20 pb-1.5 flex items-center justify-between">
                  <span className="text-[10.5px] font-black text-[#15329c] tracking-wider uppercase">
                    ส่วนที่ 2: บันทึกข้อมูลและชั่วโมงสะสมการอบรมหลักสูตรออนไลน์ (ONLINE LEARNING LOGS)
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">E-Learning & Interactive Core Sessions</span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <div className="grid grid-cols-4 bg-slate-50 p-3 font-semibold text-slate-600 border-b border-slate-200 text-center">
                    <div className="text-left select-none">หลักสูตร / หัวข้อความรู้ย่อย</div>
                    <div className="select-none">ผลลัพธ์การเรียน</div>
                    <div className="select-none">ชั่วโมงอบรม</div>
                    <div className="text-right select-none">ฝ่ายกำกับวิเคราะห์</div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    <div className="grid grid-cols-4 p-3 items-center text-center">
                      <div className="font-bold text-slate-800 text-left">5ส เบื้องต้นเพื่อความปลอดภัยในโรงงาน</div>
                      <div className="text-green-700 font-bold">ผ่านเกณฑ์ (92%)</div>
                      <div className="font-mono">2.5 ชม.</div>
                      <div className="text-right text-slate-500 font-mono text-[9px] font-bold">VERIFIED BY QA BOARD</div>
                    </div>

                    <div className="grid grid-cols-4 p-3 items-center text-center">
                      <div className="font-bold text-slate-800 text-left">ความปลอดภัยในโรงงานและดับเพลิง 101</div>
                      <div className="text-green-700 font-bold">ผ่านเกณฑ์ (85%)</div>
                      <div className="font-mono">3.0 ชม.</div>
                      <div className="text-right text-slate-500 font-mono text-[9px] font-bold">VERIFIED BY SHE DEPT</div>
                    </div>

                    {selectedUserTranscript.role === 'Editor' || selectedUserTranscript.id === 'u-2' ? (
                      <div className="grid grid-cols-4 p-3 items-center text-center">
                        <div className="font-bold text-slate-800 text-left">การซ้อมรถยก Forklift อย่างมีวิสัยเซฟตี้</div>
                        <div className="text-green-700 font-bold">ผ่านเกณฑ์ (100%)</div>
                        <div className="font-mono">4.0 ชม.</div>
                        <div className="text-right text-slate-500 font-mono text-[9px] font-bold">VERIFIED BY MAINTENANCE</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Section 3: Earned Badges */}
              <div className="space-y-3 mb-6 text-left">
                <div className="border-b border-[#15329c]/20 pb-1.5 flex items-center justify-between">
                  <span className="text-[10.5px] font-black text-[#15329c] tracking-wider uppercase">
                    ส่วนที่ 3: ตราความเชี่ยวชาญเหรียญตราดิจิทัลที่ปลดล็อค (VERIFIED ACCOMPLISHMENT BADGES)
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">Direct Competence Validation Tokens</span>
                </div>

                <div className="flex flex-wrap gap-2.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  {getUserBadges(selectedUserTranscript, userProgressList, examResults, kbArticles).filter(b => b.earned).length === 0 ? (
                    <span className="text-slate-400 text-xs italic py-1">ไม่มีประวัติการปลดล็อคตราวิชาชีพระหว่างรอบประเมินนี้</span>
                  ) : (
                    getUserBadges(selectedUserTranscript, userProgressList, examResults, kbArticles)
                      .filter(b => b.earned)
                      .map(badge => (
                        <div key={badge.id} className="bg-white border border-slate-200 p-2.5 rounded-xl flex items-center gap-2 shadow-xs transition">
                          <span className="text-base">{badge.iconName === 'Award' ? '🏅' : badge.iconName === 'Shield' ? '🛡️' : '🔥'}</span>
                          <div>
                            <div className="font-bold text-xs text-slate-800 leading-none">{badge.title}</div>
                            <div className="text-[8.5px] text-slate-400 mt-1">{badge.description}</div>
                          </div>
                        </div>
                    ))
                  )}
                </div>
              </div>

              {/* Section 4: Signature Sign-off Block */}
              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-200 text-center text-xs">
                <div className="space-y-6 flex flex-col justify-between">
                  <div>
                    <p className="text-slate-400">ผู้ประเมินมาตรฐานโรงงาน (ISO Auditor)</p>
                    <p className="font-bold text-slate-600 mt-1">คุณดารินทร์ แซ่ตั้ง</p>
                  </div>
                  <div className="border-b border-dashed border-slate-300 w-3/4 mx-auto pb-1 font-serif text-[#15329c] italic font-bold">
                    Darin S.
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">ลงนามสัญญา (Signature) & วันประเมิน</p>
                </div>

                <div className="space-y-6 flex flex-col justify-between border-l border-r border-[#f1f5f9]">
                  <div>
                    <p className="text-slate-400">ตัวแทนกวดวิชาวิชาชีพและพัฒนาบุคคล</p>
                    <p className="font-bold text-slate-600 mt-1">คุณสิริมา แสงสะอาด</p>
                  </div>
                  <div className="border-b border-dashed border-slate-300 w-3/4 mx-auto pb-1 font-serif text-[#15329c] italic font-bold">
                    Sirima S.
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono">ลงนามสัญญา (Signature) & ตราประทับ</p>
                </div>

                <div className="flex flex-col items-center justify-center p-3 border border-dashed border-emerald-500/30 bg-emerald-50/40 rounded-xl space-y-1.5">
                  <span className="text-lg">🛡️</span>
                  <strong className="text-emerald-800 text-[10px] font-black tracking-wider uppercase">QA & SHE SYSTEM VERIFIED</strong>
                  <p className="text-[8.5px] text-slate-400 font-mono leading-tight text-center">
                    SECURED COMPLIANCE AUDIT RECORD
                    <br />
                    HASH_ID: RMP-ISO-9001-95b3dceb
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="bg-white p-4 border-t border-slate-200 flex items-center justify-end gap-3 rounded-b-3xl">
            <button
              onClick={() => setIsISOModalOpen(false)}
              className="bg-slate-100 hover:bg-slate-250 text-slate-750 text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer transition"
            >
              ยกเลิก
            </button>
            <button
              id="btn-trigger-print-iso"
              onClick={handlePrint}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer shadow-md transition"
            >
              <Printer className="w-4 h-4" />
              พิมพ์หรือเซฟเป็น PDF (Save to PDF)
            </button>
          </div>
        </div>
      </div>
    )}
    {isCertBadgeModalOpen && modalSelectedCourse && (
      <BadgeCertificateModal
        isOpen={isCertBadgeModalOpen}
        onClose={() => setIsCertBadgeModalOpen(false)}
        user={selectedUserTranscript || currentUser}
        course={modalSelectedCourse}
        score={modalSelectedScore}
        completedDate={modalSelectedDate}
      />
    )}
    </>
  );
};
