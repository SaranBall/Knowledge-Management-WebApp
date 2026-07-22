import { User, UserCourseProgress, KBArticle } from '../types';

export interface Badge {
  id: string;
  title: string;
  description: string;
  category: string;
  iconName: 'Zap' | 'Shield' | 'Trophy' | 'Award' | 'Sparkles' | 'BookOpen' | 'GraduationCap' | 'Target' | 'Crown';
  color: string; // CSS color theme name (indigo, emerald, amber, rose, bronze, violet...)
  earned: boolean;
  earnedDate?: string;
  progressText?: string;
  requirement: string;
}

export function getUserBadges(
  user: User,
  progressList: UserCourseProgress[],
  examResults: any[],
  articles: KBArticle[] = []
): Badge[] {
  const userProgress = progressList.filter((p) => p.userId === user.id);
  const userExams = examResults.filter((e) => e.employeeId === user.employeeId);

  // 1. Fast Learner
  const fastLearnerEarned =
    userProgress.some((p) => p.status === 'Completed' && p.totalStudyMinutes > 0 && p.totalStudyMinutes <= 15) ||
    userProgress.some((p) => p.status === 'Completed' && p.attemptsCount <= 1 && p.score !== undefined && p.score >= 90) ||
    userExams.some((e) => e.pass && e.score >= 90);

  // 2. Safety Expert (courseId 'c-3' is Safety)
  const safetyEarned =
    userProgress.some((p) => p.courseId === 'c-3' && p.status === 'Completed') ||
    userExams.some((e) => e.courseId === 'c-3' && e.pass);

  // 3. Quality Master (courseId 'c-2' is QC)
  const qualityEarned =
    userProgress.some((p) => p.courseId === 'c-2' && p.status === 'Completed') ||
    userExams.some((e) => e.courseId === 'c-2' && e.pass);

  // 4. WMS Specialist (courseId 'c-1' is Warehouse Onboarding)
  const onboardingEarned =
    userProgress.some((p) => p.courseId === 'c-1' && p.status === 'Completed') ||
    userExams.some((e) => e.courseId === 'c-1' && e.pass);

  // 5. Honor Graduate
  const uniqueCompletedCourseIds = new Set<string>([
    ...userProgress.filter((p) => p.status === 'Completed').map((p) => p.courseId),
    ...userExams.filter((e) => e.pass).map((e) => e.courseId),
  ]);
  const allCompletedScores = [
    ...userProgress.filter((p) => p.status === 'Completed' && p.score !== undefined).map((p) => p.score as number),
    ...userExams.filter((e) => e.pass).map((e) => e.score as number),
  ];
  const avgScore = allCompletedScores.length > 0 
    ? Math.round(allCompletedScores.reduce((a, b) => a + b, 0) / allCompletedScores.length) 
    : 0;
  const honorEarned = uniqueCompletedCourseIds.size >= 2 && avgScore >= 90;

  // 6. Knowledge Guru
  const submittedProposalCount = articles.filter((a) => a.author === user.name).length;
  const earnedPerfectScore =
    userProgress.some((p) => p.score === 100) || userExams.some((e) => e.score === 100);
  const guruEarned = submittedProposalCount >= 1 || earnedPerfectScore || user.role === 'Admin';

  const badges: Badge[] = [
    {
      id: 'fast-learner',
      title: 'Fast Learner (ผู้เรียนรู้ไว)',
      description: 'สำเร็จหลักสูตรใดๆ ในรอบแรกด้วยพิกัดคะแนนสอบ >= 90% หรือศึกษาบทเรียนเสร็จภายใน 15 นาที',
      category: 'Speed & Retention',
      iconName: 'Zap',
      color: 'amber',
      earned: fastLearnerEarned,
      requirement: 'สำเร็จคอร์สอบรมด้วยคะแนนสูงในการกดทำทดสอบหนแรก',
      progressText: fastLearnerEarned ? 'สำเร็จแล้ว!' : 'ยังไม่เข้าเกณฑ์',
    },
    {
      id: 'safety-expert',
      title: 'Safety Expert (ดาวเด่นความปลอดภัย)',
      description: 'ผ่านหลักสูตร "ความปลอดภัยในการใช้รถยกไฟฟ้า (Forklift Operation Safety)" หรือรหัวหลักสูตร c-3',
      category: 'Compliance',
      iconName: 'Shield',
      color: 'teal',
      earned: safetyEarned,
      requirement: 'สอบผ่านหลักสูตรรถพ่วง/รถยกมาตรฐานเซฟตี้ภาคออนไซต์',
      progressText: safetyEarned ? 'สำเร็จแล้ว 🎉' : 'รอการเรียนรู้หลักสูตร c-3',
    },
    {
      id: 'quality-master',
      title: 'Quality Master (ผู้พิทักษ์คุณภาพ)',
      description: 'ผ่านหลักสูตรตรวจสอบเคมีภัณฑ์ "การตรวจรับเคมีวัตถุดิบและจัดทำรายงานคุณภาพฯ" หรือรหัสหลักสูตร c-2',
      category: 'Quality Control',
      iconName: 'Award',
      color: 'emerald',
      earned: qualityEarned,
      requirement: 'สอบผ่านวิชาการควบคุมคุณภาพและวิจัยวิเคราะห์ความชื้นวัตถุดิบ',
      progressText: qualityEarned ? 'สำเร็จแล้ว 🧪' : 'รอเรียนคอร์สควบคุมคุณภาพ c-2',
    },
    {
      id: 'wms-specialist',
      title: 'WMS Specialist (ผู้จัดเจนคลังสินค้า)',
      description: 'ผ่านหลักสูตรปูพื้นฐานงานโรงคลัง "หลักสูตรปูพื้นฐานพนักงานคลังสินค้าใหม่" หรือรหัสหลักสูตร c-1',
      category: 'Logistics',
      iconName: 'Target',
      color: 'indigo',
      earned: onboardingEarned,
      requirement: 'สอบผ่านหัวข้อพนักงานคลังสินค้าและการจัดเรียง Racking มาตรฐาน 5S',
      progressText: onboardingEarned ? 'สำเร็จแล้ว 📦' : 'รอเรียนหลักสูตร onboarding c-1',
    },
    {
      id: 'honor-graduate',
      title: 'Honor Graduate (พนักงานเกียรตินิยม)',
      description: 'สำเร็จการประเมินทฤษฎีอย่างน้อย 2 หลักสูตรขึ้นไป และมีคะแนนสอบเฉลี่ยสะสมทุกวิชาตั้งแต่ 90% ขึ้นไป',
      category: 'Academic Excellence',
      iconName: 'GraduationCap',
      color: 'rose',
      earned: honorEarned,
      requirement: 'สำเร็จคอร์ส >= 2 ซีรีส์ และเกรดสอบเฉลี่ยรั้งตำแหน่งระดับ 90%+',
      progressText: `${uniqueCompletedCourseIds.size}/2 คอร์ส (เฉลี่ย ${avgScore}%)`,
    },
    {
      id: 'knowledge-guru',
      title: 'Knowledge Guru (ผู้แบ่งปันภูมิปัญญา)',
      description: 'มีประวัติส่งข้อเสนอโครงการปรับปรุงงาน KM Proposal หรือสอบทดสอบวิชาใดวิชาหนึ่งได้คะแนนเป๊ะเต็ม 100% หรือพิกัดระดับ Admin บุกเบิกคลังสมอง',
      category: 'Contribution',
      iconName: 'Crown',
      color: 'violet',
      earned: guruEarned,
      requirement: 'เสนอ 1 KM Proposal หรือทำข้อสอบทฤษฎีคว้าคะแนนเต็ม 100%',
      progressText: submittedProposalCount > 0 ? `เสนอคลังข้อมูลแล้ว ${submittedProposalCount} หัวข้อ` : 'ยังไม่มีผลงานเสนอแนะ',
    },
  ];

  return badges;
}
