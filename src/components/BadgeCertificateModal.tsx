import React, { useState } from 'react';
import { 
  Award, Shield, Zap, Sparkles, Share2, Printer, 
  Download, Copy, CheckCircle, ExternalLink, Eye, 
  BookOpen, Clock, X, ShieldAlert, Check, RefreshCw
} from 'lucide-react';
import { User, Course } from '../types';

interface BadgeCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  course: Course;
  score: number;
  completedDate?: string;
}

export const BadgeCertificateModal: React.FC<BadgeCertificateModalProps> = ({
  isOpen,
  onClose,
  user,
  course,
  score,
  completedDate
}) => {
  const [activeTab, setActiveTab] = useState<'cert' | 'badge'>('cert');
  const [frameStyle, setFrameStyle] = useState<'gold' | 'teal' | 'indigo'>('gold');
  const [hologramSeal, setHologramSeal] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isSharedToBoard, setIsSharedToBoard] = useState<boolean>(false);
  const [sharedLoading, setSharedLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  // Derive completion dates
  const dateStr = completedDate || new Date().toISOString().split('T')[0];
  
  // Create randomized secure certification ID
  const certId = `CERT-RMP-${course.id.toUpperCase()}-${user.employeeId}`;
  
  // Custom metadata for different courses
  const getCourseBadgeDetails = (courseId: string) => {
    switch (courseId) {
      case 'c-1':
        return {
          badgeTitle: 'WMS Logistics Specialist',
          thaiBadgeTitle: 'ผู้จัดเจนคลังสินค้าและมาตรฐาน 5S',
          colorTheme: 'indigo',
          metalTint: 'Indigo Royal Carbon & Silver',
          symbol: '📦',
          icon: Shield,
          colorClass: 'from-indigo-600 to-slate-800',
          textColor: 'text-indigo-600',
          borderColor: 'border-indigo-400',
          glowColor: 'shadow-indigo-500/30',
          desc: 'สอบผ่านหลักสูตรวิชาพนักงานคลังสินค้า จัดเรียง Racking และ ISO 9001 Clause 7.2'
        };
      case 'c-2':
        return {
          badgeTitle: 'ISO Quality Control Expert',
          thaiBadgeTitle: 'ผู้พิทักษ์คุณภาพและเคมีภัณฑ์ขั้นสุจริต',
          colorTheme: 'emerald',
          metalTint: 'Emerald Chrome & Platinum Dual',
          symbol: '🧪',
          icon: Award,
          colorClass: 'from-emerald-605 to-slate-800',
          textColor: 'text-emerald-600',
          borderColor: 'border-emerald-400',
          glowColor: 'shadow-emerald-500/30',
          desc: 'สอบผ่านระบบควบคุมและวิจัยระดับสารละลายเคมี บรรลุกระบวนการผลิตแกนลามิเนต'
        };
      case 'c-3':
        return {
          badgeTitle: 'Verified Forklift Safety Officer',
          thaiBadgeTitle: 'วิศวกรผู้บังคับรถยกและเซฟตี้ภาคปฏิบัติ',
          colorTheme: 'amber',
          metalTint: 'Polished 24K Gold & Safety Yellow',
          symbol: '🛡️',
          icon: Zap,
          colorClass: 'from-amber-500 to-amber-950',
          textColor: 'text-amber-600',
          borderColor: 'border-amber-400',
          glowColor: 'shadow-amber-500/30',
          desc: 'สำเร็จการกวดขันการขับรถยกไฟฟ้า ดับเพลิง และมาตรฐานความปลอดภัยทางวิศวกรรม SHE'
        };
      default:
        return {
          badgeTitle: 'Meiwa Certified Tech Professional',
          thaiBadgeTitle: 'พนักงานวิชาชีพเทคโนโลยีอุตสาหกรรมการพิมพ์',
          colorTheme: 'violet',
          metalTint: 'Holographic Violet Cobalt & Bronze',
          symbol: '🎓',
          icon: Award,
          colorClass: 'from-violet-650 to-slate-850',
          textColor: 'text-violet-600',
          borderColor: 'border-violet-400',
          glowColor: 'shadow-violet-500/30',
          desc: 'สำเร็จหลักสูตรบูรณาการยกระดับวิชาชีพโรงงาน อนุมัติโดยหัวหน้าวิศวกรรมสากล'
        };
    }
  };

  const badgeProps = getCourseBadgeDetails(course.id);

  // Copy Verification Link
  const handleCopyLink = () => {
    const fakeVerificationUrl = `${window.location.origin}/verify-credential?id=${certId}&course=${course.id}`;
    navigator.clipboard.writeText(fakeVerificationUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Simulate sharing to board
  const handleShareToBoard = () => {
    setSharedLoading(true);
    setTimeout(() => {
      setSharedLoading(false);
      setIsSharedToBoard(true);
      // Automatically keep in state if we want, but simple response is perfect
    }, 1200);
  };

  // Handle printing certificate (highly targeted A4 styling)
  const handlePrint = () => {
    const printContent = document.getElementById('printable-cert-document');
    if (!printContent) return;
    
    const originalContent = document.body.innerHTML;
    const printHTML = `
      <html>
        <head>
          <title>${course.title} - Certificate</title>
          <style>
            @media print {
              body { background: white; color: black; margin: 0; padding: 20px; font-family: 'Inter', sans-serif; }
              #printable-cert-document { border: 15px double gold !important; padding: 40px !important; text-align: center !important; }
              .no-print { display: none !important; }
            }
          </style>
          <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">
        </head>
        <body>
          <div class="p-8 max-w-2xl mx-auto">
            ${printContent.outerHTML}
          </div>
        </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in text-slate-800">
      <div className="bg-[#fbfcff] rounded-3xl border border-slate-200 shadow-2xl max-w-5xl w-full flex flex-col md:flex-row max-h-[92vh] overflow-hidden text-left relative">
        
        {/* Toggle Switch Tabs on Mobile Top */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-50 text-slate-400 hover:text-slate-600 bg-white/80 border w-8 h-8 rounded-full flex items-center justify-center cursor-pointer shadow-xs transition"
          title="ปิดหน้าต่าง"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 1. LEFT SIDE: Customizer Panel (Settings & Sharing) */}
        <div className="w-full md:w-80 bg-slate-50 border-r border-slate-200 p-6 overflow-y-auto flex flex-col justify-between shrink-0">
          <div className="space-y-6">
            <div>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold px-2 py-0.5 rounded-full uppercase">
                Digital Credentials
              </span>
              <h3 className="font-extrabold text-slate-900 text-sm mt-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                ใบเซอร์และตราทักษะวิชาชีพ
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                ตรวจรับรองคุณสมบัติตามมาตรฐานระบบ ISO 9001:2015 ยกระดับคุณภาพโรงงาน
              </p>
            </div>

            {/* TAB SELECTOR */}
            <div className="bg-slate-200/65 p-1 rounded-xl grid grid-cols-2 text-xs font-bold font-sans">
              <button
                type="button"
                onClick={() => setActiveTab('cert')}
                className={`py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition ${
                  activeTab === 'cert' 
                    ? 'bg-white text-[#15329c] shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                ใบเกียรติบัตร
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('badge')}
                className={`py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition ${
                  activeTab === 'badge' 
                    ? 'bg-white text-[#15329c] shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                เหรียญตราดิจิทัล
              </button>
            </div>

            {/* CUSTOMIZER OPTIONS */}
            <div className="space-y-4">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                ปรับแต่งดีไซน์เสมือน (Visual Customization)
              </span>

              {/* Border select */}
              {activeTab === 'cert' && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 block">กรอบขอบประธาน:</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'gold', label: '🏆 ทองคำสากล', col: 'border-amber-400 bg-amber-50/20' },
                      { id: 'teal', label: '🔬 มรกตเทค', col: 'border-teal-400 bg-teal-50/20' },
                      { id: 'indigo', label: '🌌 สเปซอินดิโก้', col: 'border-indigo-400 bg-indigo-50/20' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setFrameStyle(opt.id as any)}
                        className={`p-1.5 rounded-lg border text-[9px] text-center font-bold font-sans transition block cursor-pointer ${
                          frameStyle === opt.id 
                            ? 'border-[#15329c] bg-indigo-50 text-[#15329c]' 
                            : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Seal option */}
              <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200">
                <div className="text-[11px]">
                  <span className="font-bold text-slate-700 block">สลักลายเซ็นและตราฮอโลแกรม</span>
                  <p className="text-[9.5px] text-slate-400 leading-none">เพิ่มรายละเอียดเครื่องหมายประดับ</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hologramSeal}
                    onChange={(e) => setHologramSeal(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>

            {/* INTERACTIVE SHARING CONTROLS */}
            <div className="space-y-3.5 pt-3 border-t">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                ส่งออกและแบ่งปัน (View & Share Options)
              </span>

              <button
                type="button"
                onClick={handleCopyLink}
                className={`w-full py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs ${
                  isCopied 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                    : 'bg-white hover:bg-slate-50 text-slate-705 border-slate-250'
                }`}
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    คัดลอกลิงก์สำเร็จ!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    คัดลอกลิงก์รับรอง (Copy URL)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleShareToBoard}
                disabled={isSharedToBoard || sharedLoading}
                className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow ${
                  isSharedToBoard 
                    ? 'bg-emerald-600 text-white border-0 cursor-default' 
                    : 'bg-[#15329c] hover:bg-[#11297e] text-white border-0'
                }`}
              >
                {sharedLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    กำลังโพสต์ขึ้นบอร์ด...
                  </>
                ) : isSharedToBoard ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" />
                    แชร์ลงกระดานบริษัทแล้ว 🎉
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    แชร์ลงกระดานข่าวสโมสร RMP
                  </>
                )}
              </button>

              {activeTab === 'cert' && (
                <button
                  type="button"
                  onClick={handlePrint}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  พิมพ์ / เซฟเกียรติบัตรเป็น PDF
                </button>
              )}
            </div>
          </div>

          <div className="pt-4 mt-6 border-t font-mono text-[9px] text-slate-400 text-center leading-normal">
            <div>ครุศิลป์ตรวจสอบ: ISO 9001 REGISTERER</div>
            <div className="mt-0.5 select-all truncate">{certId}</div>
          </div>
        </div>

        {/* 2. RIGHT SIDE: Display Stage */}
        <div className="flex-1 bg-slate-100 p-6 md:p-8 flex items-center justify-center min-h-[400px] md:min-h-[520px] overflow-x-auto">
          {activeTab === 'cert' ? (
            /* ================== CERTIFICATE TAB VIEW ================== */
            <div 
              id="printable-cert-document"
              className={`w-full max-w-2xl bg-white p-8 md:p-12 rounded-2xl border-4 shadow-xl text-center space-y-6 relative overflow-hidden transition-all duration-300 ${
                frameStyle === 'gold' ? 'border-amber-400 bg-gradient-to-tr from-amber-50/10 via-white to-amber-50/15' :
                frameStyle === 'teal' ? 'border-teal-400 bg-gradient-to-tr from-teal-50/10 via-white to-teal-50/15' :
                'border-indigo-400 bg-gradient-to-tr from-indigo-50/10 via-white to-indigo-50/15'
              }`}
            >
              {/* Background Guilloche watermark pattern simulation */}
              <div className="absolute inset-0 opacity-2 pointer-events-none flex items-center justify-center select-none">
                <div className="w-96 h-96 border-[12px] border-dashed rounded-full border-slate-300"></div>
              </div>

              {/* Watermark Crest */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-3 pointer-events-none text-9xl font-black text-slate-200">
                MEIWA
              </div>

              {hologramSeal && (
                <div className="absolute top-4 right-4 z-15 animate-pulse bg-gradient-to-r from-amber-200 via-yellow-300 to-indigo-300 border border-white p-2.5 rounded-full shadow-lg text-[10px] font-black font-mono text-slate-800 flex items-center justify-center w-10 h-10 select-none">
                  ISO
                </div>
              )}

              {/* RMP Small Branding */}
              <div className="space-y-1">
                <span className="font-bold text-[#15329c] text-[10.5px] uppercase font-mono tracking-widest block bg-[#15329c]/5 py-1 px-3 rounded-full w-max mx-auto border border-[#15329c]/10">
                  ★ ROYAL MEIWA PAX CO., LTD. ★
                </span>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Industrial Competency Audit & Verification Center
                </p>
              </div>

              <div className="space-y-2">
                <h2 className="font-serif font-extrabold text-[#11297e] text-lg sm:text-2xl uppercase tracking-widest leading-none mt-2">
                  Certificate of Professional Achievement
                </h2>
                <div className="h-0.5 bg-gradient-to-r from-transparent via-slate-300 to-transparent w-48 mx-auto my-1.5"></div>
                <p className="text-slate-500 text-[10.5px] italic">
                  ด้วยฝ่ายฝึกอบรมและหัวหน้ากรรมการฝ่ายมาตรฐานการผลิต ได้ตรวจสอบสัมฤทธิผลสอบขอประกาศประสาทคุณวุฒิแก่มอบให้:
                </p>
              </div>

              {/* Employee Identifier Name Block */}
              <div className="py-2.5 text-center">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 underline decoration-double decoration-indigo-500/50 underline-offset-4">
                  {user.name}
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  รหัสประจำตัว: <span className="font-bold">{user.employeeId}</span> | ตำแหน่งสังกัด: <span className="font-bold text-[#15329c]">{user.position}</span>
                </p>
                <p className="text-[9px] text-slate-400">
                  สำนักงานปฏิบัติการโรงงาน: {user.department}
                </p>
              </div>

              {/* Course Title and score validation */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl max-w-lg mx-auto space-y-1">
                <span className="text-[9.5px] text-slate-400 uppercase tracking-wider block font-bold">
                  สำหรับการวิเคราะห์สอบผ่านหลักสูตรวิชาชีพระดับองค์กร
                </span>
                <h4 className="text-xs sm:text-sm font-extrabold text-slate-850">
                  {course.title}
                </h4>
                <div className="flex items-center justify-center gap-4 text-[10.5px] font-mono mt-1 pt-1.5 border-t border-slate-200/60 font-semibold">
                  <span className="text-emerald-700">
                    คะแนนประเมินสัมฤทธิผล: {score}%
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="text-indigo-700">
                    เกณฑ์สากลผ่านฉลุย: ≥ {course.minPassScore}%
                  </span>
                </div>
              </div>

              {/* ISO Regulation References */}
              <p className="text-[9px] text-slate-400 font-light max-w-md mx-auto leading-normal">
                เกียรติบัตรนี้มีผลบันทึกถาวรลงในฐานข้อมูลทรัพยากรการอบรม RMP (SOP Database v4) เพื่อใช้เป็นทรานสคริปต์สิทธิ์วิชาชีพสากลตามเกณฑ์ประเมิน ISO 9001:2015 Clause 7.2 (Competence)
              </p>

              {/* Official Signatures Panel */}
              <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-100 text-[10px] font-sans">
                <div className="text-left pl-3 space-y-1">
                  <span className="italic text-slate-400 font-serif font-bold text-[11px] leading-none block">Sirima S.</span>
                  <p className="font-bold text-slate-800">คุณหญิง สิริมา แสงสะอาด</p>
                  <p className="text-[8.5px] text-slate-400">Managing Director (MD) - รอแยล เมอิวะ แพ็คซ์</p>
                </div>
                <div className="text-right pr-3 space-y-1">
                  <span className="block italic text-slate-400 font-serif font-bold text-[11px] leading-none">Darin Saetang</span>
                  <p className="font-bold text-slate-800">ดารินทร์ แซ่ตั้ง</p>
                  <p className="text-[8.5px] text-slate-400">QA/QC Supervisor (Lead Auditor 9001)</p>
                </div>
              </div>

              {/* Dynamic bottom stamp for confirmation */}
              <div className="text-[8px] font-mono text-slate-400 text-center pt-2 select-none">
                VERIFIED SECURITY CODE: RMP-MD-{user.employeeId}-{score}-{dateStr}
              </div>
            </div>
          ) : (
            /* ================== BADGE TAB VIEW ================== */
            <div className="w-full max-w-sm bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-xl text-center space-y-6 animate-fade-in relative overflow-hidden">
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider block">
                Official RMP Digital validation Token
              </span>

              {/* 3D Circular Digital Badge visualization */}
              <div className="relative w-44 h-44 mx-auto my-2 group select-none">
                {/* Outer Glow ripple ring */}
                <div className="absolute inset-0 rounded-full bg-indigo-500/10 animate-ping opacity-60"></div>
                
                {/* Main metallic ring structure */}
                <div className="absolute inset-0 rounded-full border-4 border-slate-800 bg-radial from-slate-900 to-slate-950 p-2 shadow-lg flex items-center justify-center">
                  <div className="absolute inset-1 rounded-full border-2 border-dashed border-amber-400/40 animate-spin-slow"></div>
                  
                  {/* Outer bronze/gold text wrap circle */}
                  <div className="w-full h-full rounded-full flex flex-col items-center justify-center border-2 border-slate-700 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 p-1 relative overflow-hidden">
                    
                    {/* Glowing background */}
                    <div className="absolute inset-2 bg-radial from-indigo-500/20 to-transparent blur-md"></div>
                    
                    {/* Badge Icon center */}
                    <span className="text-5xl drop-shadow-md z-10 filter hover:scale-110 transition duration-300 cursor-pointer">
                      {badgeProps.symbol}
                    </span>
                    
                    {/* Small validation tag on center bottom */}
                    <span className="absolute bottom-2 bg-amber-400 text-slate-900 font-bold px-1.5 py-0.2 rounded text-[7.5px] font-mono tracking-wide z-10 uppercase border border-white">
                      RMP Verified
                    </span>
                  </div>
                </div>
              </div>

              {/* Badge Metadata and course description */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-extrabold uppercase py-0.5 px-2.5 bg-slate-100 border rounded-full text-slate-500 inline-block font-mono">
                  {badgeProps.metalTint}
                </span>
                <h4 className="font-black text-[#15329c] text-sm tracking-tight mt-1">
                  {badgeProps.badgeTitle}
                </h4>
                <p className="text-slate-800 font-bold text-[11px] leading-tight">
                  {badgeProps.thaiBadgeTitle}
                </p>
                <div className="p-3 bg-slate-50 rounded-xl text-[10px] text-slate-500 border border-slate-150 leading-relaxed max-w-xs mx-auto">
                  {badgeProps.desc}
                </div>
              </div>

              {/* Verify Badge Stamp */}
              <div className="border-t pt-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600 font-mono">
                  <span>ผู้ครอบครอง:</span>
                  <span className="text-slate-900 font-bold">{user.name} ({user.employeeId})</span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600 font-mono">
                  <span>วันที่สัมฤทธิ์ผล:</span>
                  <span className="text-slate-900 font-bold">{dateStr}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600 font-mono text-left">
                  <span>รหัสคีย์ข้อมูล:</span>
                  <span className="text-slate-400 text-[8.5px] truncate max-w-[150px] font-bold" title={certId}>{certId}</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Simulated Org Feed Toast */}
      {isSharedToBoard && (
        <div className="fixed bottom-6 right-6 z-55 max-w-sm bg-slate-900 text-white rounded-2xl border border-slate-700 p-4 shadow-2xl animate-fade-in-up">
          <div className="flex items-start gap-3">
            <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-full">
              <Check className="w-5 h-5" />
            </span>
            <div className="space-y-0.5 text-left">
              <div className="font-extrabold text-xs">แชร์ลงกระดานสโมสรสำเร็จ!</div>
              <p className="text-[10px] text-slate-350 leading-relaxed">
                เหรียญตราและข้อความรับรองความรู้ของคุณถูกส่งไปประกาศในช่องประกาศ RMP News & Accomplishment Board แล้ว เพื่อนพนักงานสามารถตรวจสอบเกียรติประวัติได้ค่ะ
              </p>
            </div>
            <button 
              onClick={() => setIsSharedToBoard(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
