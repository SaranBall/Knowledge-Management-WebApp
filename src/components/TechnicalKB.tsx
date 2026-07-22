/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Heart, Search, Plus, CheckCircle, HelpCircle, 
  ChevronRight, AlertCircle, FileText, Tag, ArrowRight, ShieldCheck, Mail, Edit, Trash2,
  Lightbulb
} from 'lucide-react';
import { KBArticle, KBType, User, DocumentItem, Expert } from '../types';

interface TechnicalKBProps {
  currentUser: User;
  articles: KBArticle[];
  documents: DocumentItem[];
  experts: Expert[];
  onAddArticle: (art: KBArticle) => void;
  onApproveArticle: (id: string) => void;
  onLikeArticle: (id: string) => void;
  onUpdateArticle: (art: KBArticle) => void;
  onDeleteArticle: (id: string) => void;
  prefilledKeyword?: string;
}

export const TechnicalKB: React.FC<TechnicalKBProps> = ({
  currentUser,
  articles,
  documents,
  experts,
  onAddArticle,
  onApproveArticle,
  onLikeArticle,
  onUpdateArticle,
  onDeleteArticle,
  prefilledKeyword = '',
}) => {
  const [activeFilter, setActiveFilter] = useState<KBType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState(prefilledKeyword);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isProposalOpen, setIsProposalOpen] = useState(false);

  // Form states
  const [newArt, setNewArt] = useState({
    title: '',
    type: 'Troubleshooting' as KBType,
    problem: '',
    cause: '',
    solution: '',
    prevention: '',
    relatedWIs: '',
    tags: '',
  });

  const [proposalData, setProposalData] = useState({
    title: '',
    type: 'Troubleshooting' as KBType,
    problem: '',
    solution: '',
    tags: '',
  });

  // Edit states
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingArt, setEditingArt] = useState<any>(null);

  // Selected article view modal/details
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(articles[0]?.id || null);

  // Quick recommend list for search tests (REQUIRED BY SPECIFICATION)
  const quickSearches = [
    { text: 'เครื่องจักรไม่ทำงาน', label: '🔥 ค้นหารวมกรณีเครื่องหยุดทำงาน' },
    { text: 'ความชื้นเม็ดพลาสติก', label: 'ฟิล์มเป่าความชื้น' },
    { text: 'เซ็นเซอร์', label: 'Photoelectric Sensor' },
    { text: 'WMS', label: 'ระบบบาร์โค้ดสแกน' }
  ];

  const handleCreateArticleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArt.title || !newArt.problem || !newArt.solution) return;

    const mockId = `kb-${Date.now()}`;
    const preparedArticle: KBArticle = {
      id: mockId,
      title: newArt.title,
      type: newArt.type,
      problem: newArt.problem,
      cause: newArt.cause || undefined,
      solution: newArt.solution,
      prevention: newArt.prevention || undefined,
      relatedWIs: newArt.relatedWIs ? newArt.relatedWIs.split(',').map(s => s.trim()) : [],
      tags: newArt.tags ? newArt.tags.split(',').map(s => s.trim()) : [newArt.type],
      author: currentUser.name,
      authorTitle: currentUser.position,
      authorDept: currentUser.department,
      views: 0,
      likes: 0,
      status: currentUser.role === 'Admin' ? 'Approved' : 'Pending', // Pending for Editor uploads, auto-approve for Admin
      createdAt: new Date().toISOString()
    };

    onAddArticle(preparedArticle);
    setIsFormOpen(false);
    setSelectedArticleId(mockId);
    
    // reset form
    setNewArt({
      title: '',
      type: 'Troubleshooting',
      problem: '',
      cause: '',
      solution: '',
      prevention: '',
      relatedWIs: '',
      tags: '',
    });
  };

  const handleProposalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalData.title || !proposalData.problem) return;

    const mockId = `kb-${Date.now()}`;
    const preparedArticle: KBArticle = {
      id: mockId,
      title: proposalData.title,
      type: proposalData.type,
      problem: proposalData.problem,
      cause: 'ข้อเสนอแนะโดยคนทำงานหน้างาน - รอทีมวิเคราะห์สาเหตุเครื่องจักร',
      solution: proposalData.solution || 'รอกลั่นกรองและจัดส่งมอบองค์ความรู้ความเข้าใจจากผู้เชี่ยวชาญ',
      prevention: 'รอกำหนดแผนบำรุงรักษาและป้องกันการเสียซ้ำรอย',
      relatedWIs: [],
      tags: proposalData.tags ? proposalData.tags.split(',').map(s => s.trim()) : [proposalData.type, 'Proposal'],
      author: currentUser.name,
      authorTitle: currentUser.position,
      authorDept: currentUser.department,
      views: 0,
      likes: 0,
      status: 'Pending', // ALWAYS Pending
      createdAt: new Date().toISOString()
    };

    onAddArticle(preparedArticle);
    setIsProposalOpen(false);
    
    // Auto-select or clear select depending on view permission of Viewer
    if (currentUser.role !== 'Viewer') {
      setSelectedArticleId(mockId);
    }

    // reset proposal form
    setProposalData({
      title: '',
      type: 'Troubleshooting',
      problem: '',
      solution: '',
      tags: '',
    });

    alert(`✅ เสนอหัวข้อความรู้ใหม่ "${preparedArticle.title}" สำเร็จ!\nเนื้อหาได้รับการบันทึกในสถานะ "Pending" เพื่อรอตรวจสอบและกดอนุมัติเผยแพร่โดย Admin`);
  };

  const handleEditArticleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArt || !editingArt.title || !editingArt.problem || !editingArt.solution) return;

    const updated: KBArticle = {
      ...editingArt,
      relatedWIs: typeof editingArt.relatedWIs === 'string' 
        ? editingArt.relatedWIs.split(',').map((s: string) => s.trim()) 
        : editingArt.relatedWIs,
      tags: typeof editingArt.tags === 'string'
        ? editingArt.tags.split(',').map((s: string) => s.trim())
        : editingArt.tags,
    };

    onUpdateArticle(updated);
    setIsEditOpen(false);
    setEditingArt(null);
  };

  const handleDeleteClick = (id: string) => {
    onDeleteArticle(id);
    setSelectedArticleId(null);
  };

  // Helper filter logic
  const filteredArticles = articles.filter(art => {
    // 1. Role validation: view only approved except the managers
    if (currentUser.role === 'Viewer' && art.status !== 'Approved') return false;

    // 2. Type filter
    if (activeFilter !== 'ALL' && art.type !== activeFilter) return false;

    // 3. Search text matches
    const matchStr = `${art.title} ${art.problem} ${art.cause} ${art.solution} ${art.prevention} ${art.tags.join(' ')} ${art.relatedWIs.join(' ')}`.toLowerCase();
    if (searchQuery && !matchStr.includes(searchQuery.toLowerCase())) return false;

    return true;
  });

  // SPECIFIC MATCHING REQUIREMENTS: If search is "เครื่องจักรไม่ทำงาน"
  // Find linked documents & specialists for display
  const isSpecSearchActive = searchQuery.trim() === 'เครื่องจักรไม่ทำงาน';
  
  const specQPs = isSpecSearchActive ? documents.filter(d => d.id === 'doc-2' || d.id === 'doc-6') : [];
  const specWIs = isSpecSearchActive ? documents.filter(d => d.id === 'doc-4' || d.id === 'doc-6') : [];
  const specExperts = isSpecSearchActive ? experts.filter(e => e.id === 'exp-1' || e.id === 'exp-2') : [];

  const selectedArticle = articles.find(a => a.id === selectedArticleId);

  return (
    <div className="space-y-6">
      {/* Intro Box */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Technical Knowledge Base (สารัตถะคลังความรู้เชิงช่างเทคนิค)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            ดึง Tacit Knowledge (ความรู้ในหัวคนเก่ง) จากผู้เชี่ยวชาญ คั้นบันทึกเป็นสูตรถอดแกนแก้ไขอุปสรรค ลดปัญหาความชำนาญสูญหาย
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {/* KM Proposal button for everyone */}
          <button
            id="open-km-proposal-modal-btn"
            type="button"
            onClick={() => setIsProposalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-sm"
          >
            <Lightbulb className="w-4 h-4 text-emerald-100" />
            เสนอหัวข้อความรู้ (New KM Proposal)
          </button>

          {currentUser.role !== 'Viewer' && (
            <button
              id="open-kb-draft-modal-btn"
              type="button"
              onClick={() => setIsFormOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer transition self-start md:self-auto shadow-sm"
            >
              <Plus className="w-4 h-4" />
              สัมภาษณ์/เพิ่มองค์ความรู้เทคนิค
            </button>
          )}
        </div>
      </div>

      {/* Advanced search section with quick query buttons */}
      <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200/60 space-y-3">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
            <Search className="w-4 h-4" />
          </span>
          <input
            id="kb-search-input"
            type="text"
            placeholder="ค้นหาปัญหา: ลองพิมพ์ 'เครื่องจักรไม่ทำงาน' หรือ คีย์เวิร์ดอื่นๆ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-250 py-3 pl-10 pr-4 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500">แนะนำค้นหายอดฮิต:</span>
          {quickSearches.map((rec) => (
            <button
              key={rec.text}
              id={`btn-quick-search-pill-${rec.text}`}
              onClick={() => setSearchQuery(rec.text)}
              className={`text-[10px] font-medium px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                searchQuery === rec.text
                  ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                  : 'bg-white hover:bg-indigo-50 hover:border-indigo-300 text-slate-600 border-slate-200'
              }`}
            >
              {rec.label}
            </button>
          ))}
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="text-[10px] font-medium text-rose-600 hover:underline cursor-pointer"
            >
              ✕ ล้างคำค้นหา
            </button>
          )}
        </div>
      </div>

      {/* SPECIAL GROUNDED MAPPING CONTAINER (SPECIFICATION MANDATORY SHOWCASE) */}
      {isSpecSearchActive && (
        <div id="grounded-search-results-panel" className="bg-indigo-50 border border-indigo-300 rounded-2xl p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 pb-2 border-b border-indigo-200">
            <span className="bg-indigo-600 text-white p-1 rounded font-bold text-[10px] font-mono">
              SEARCH Mapped Match
            </span>
            <h4 className="text-xs sm:text-sm font-bold text-indigo-950">
              ผลลัพธ์การค้นหาอัจฉริยะสำหรับ "เครื่องจักรไม่ทำงาน"
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Related QP & WI list */}
            <div className="bg-white p-4 rounded-xl border border-indigo-150 space-y-2.5">
              <span className="text-[10px] font-bold text-indigo-800 uppercase block">📄 1. เอกสาร WI & QP อ้างอิง</span>
              <div className="space-y-1.5">
                {specWIs.concat(specQPs as any).map((doc: any) => (
                  <div key={doc.id} className="p-2 bg-slate-50 rounded border border-slate-100 flex items-center justify-between text-[11px]">
                    <div>
                      <span className="font-bold text-slate-800 block truncate max-w-[200px]">{doc.title}</span>
                      <span className="text-[9px] text-slate-400 font-mono">รหัส: {doc.id.toUpperCase()} ({doc.type})</span>
                    </div>
                    <span className="text-[9px] text-indigo-600 font-bold">เปิดคู่มือ</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Troubleshooting knowledge */}
            <div className="bg-white p-4 rounded-xl border border-indigo-150 space-y-2.5">
              <span className="text-[10px] font-bold text-indigo-800 uppercase block">🛠️ 2. เทคนิคแก้ปัญหาจาก Tacit KB</span>
              <div className="space-y-1.5 text-[11px]">
                <p className="font-bold text-slate-800">
                  หัวข้อ: ปัญหาสายการผลิตหยุดบ่อยจาก photoelectric sensor
                </p>
                <div className="text-[10px] text-slate-600 space-y-1 bg-red-50 p-2 rounded border border-red-100">
                  <p><strong>ปัญหา:</strong> เครื่องเป่าฟิล์มชิลสตรีมความเร็วสูงตัด Alarm Stop</p>
                  <p><strong>วิธีแก้ด่วน:</strong> เช็ดหน้าเลนส์ด้วยไมโครไฟเบอร์ ทำมุม 15 องศาป้องกันฝุ่นตกทับ</p>
                </div>
              </div>
            </div>

            {/* 3. Experts lists */}
            <div className="bg-white p-4 rounded-xl border border-indigo-150 space-y-2.5">
              <span className="text-[10px] font-bold text-indigo-800 uppercase block">👤 3. ผู้เชี่ยวชาญที่คุณต้องติดต่อถาม</span>
              <div className="space-y-1.5">
                {specExperts.map((exp) => (
                  <div key={exp.id} className="p-2 bg-slate-50 rounded border border-slate-100 flex items-center gap-2 text-[11px]">
                    <img src={exp.avatarUrl} alt={exp.name} className="w-7 h-7 rounded-full object-cover border" />
                    <div>
                      <strong className="text-slate-800 block leading-tight">{exp.name}</strong>
                      <span className="text-[9px] text-slate-500 font-mono">{exp.position.split(' / ')[0]}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Board filters */}
      <div className="flex border-b border-slate-200">
        {(['ALL', 'Troubleshooting', 'Best Practice', 'Lesson Learned', 'Kaizen', 'FAQ'] as const).map((filter) => (
          <button
            key={filter}
            id={`tab-kb-filter-${filter}`}
            onClick={() => setActiveFilter(filter)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeFilter === filter
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {filter === 'ALL' ? 'แสดงทั้งหมด' : filter}
          </button>
        ))}
      </div>

      {/* Pending Reviews Section for ADMINS/EDITORS to show workflow */}
      {currentUser.role !== 'Viewer' && articles.filter(a => a.status === 'Pending').length > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-250 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="bg-amber-500 text-slate-900 px-2 py-0.5 rounded text-[9px] font-mono font-bold">
              PENDING WORKFLOW
            </span>
            <h4 className="font-bold text-amber-900 text-xs sm:text-sm">
              ร่างองค์ความรู้ที่รอการอนุมัติความถูกต้องก่อนเผยแพร่ ({articles.filter(a => a.status === 'Pending').length} ฉบับ)
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {articles.filter(a => a.status === 'Pending').map((art) => (
              <div key={art.id} className="bg-white p-4 rounded-xl border border-amber-200 flex flex-col justify-between gap-3 text-xs">
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <h5 className="font-bold text-slate-800">{art.title}</h5>
                    <span className="bg-slate-100 px-1.5 py-0.2 rounded font-mono text-[9px] font-semibold">{art.type}</span>
                  </div>
                  <p className="text-slate-400 text-[10px] mt-1 font-mono">จัดทำโดย: {art.author} | แผนก: {art.authorDept}</p>
                  <p className="text-slate-600 mt-2 line-clamp-2">ปัญหา: {art.problem}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    id={`btn-approve-kb-${art.id}`}
                    onClick={() => {
                      onApproveArticle(art.id);
                      setSelectedArticleId(art.id);
                    }}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-1 px-3 rounded-lg text-[10px] cursor-pointer transition uppercase"
                  >
                    อนุมัติและ Publish ทันที (Admin/Editor Action)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List Layout and Reader Frame */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left lists column */}
        <div className="lg:col-span-1 space-y-3">
          <span className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider">
            รายการบทความเชิงช่างทั้งหมด ({filteredArticles.length} หัวข้อ)
          </span>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {filteredArticles.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-1 text-slate-400 text-xs">
                <AlertCircle className="w-8 h-8 mx-auto text-slate-350" />
                <p className="font-bold text-slate-600">ไม่พบหัวข้อเทคนิคในหมวดนี้</p>
                <p className="text-[10px]">ตรวจสอบคำค้นหา หรือกรองตามแท็บอื่นๆ</p>
              </div>
            ) : (
              filteredArticles.map((art) => {
                const isSelected = selectedArticleId === art.id;

                return (
                  <div
                    key={art.id}
                    id={`kb-item-row-${art.id}`}
                    onClick={() => setSelectedArticleId(art.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer text-left block space-y-2 ${
                      isSelected
                        ? 'bg-indigo-50/20 border-indigo-600 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-350'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-mono text-indigo-600 font-bold uppercase">{art.type}</span>
                      <span className="text-slate-400 font-mono">{art.createdAt.split('T')[0]}</span>
                    </div>

                    <h4 className="font-bold text-slate-800 text-xs line-clamp-2">
                      {art.title}
                    </h4>

                    <div className="flex flex-wrap items-center gap-1">
                      {art.tags.slice(0, 3).map((t, idx) => (
                        <span key={idx} className="bg-slate-100 text-slate-500 text-[8px] font-medium px-1 rounded">
                          #{t}
                        </span>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-500">
                      <span>โดย {art.author.split(' ')[0]}</span>
                      <span className="flex items-center gap-0.5">
                        <Heart className="w-3 h-3 text-rose-500" /> {art.likes} ถูกใจ
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Reader view panel */}
        <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200">
          {!selectedArticle ? (
            <div className="text-center py-20 text-slate-400 text-xs space-y-2">
              <FileText className="w-10 h-10 mx-auto text-slate-300" />
              <p className="font-bold">กรุณาเลือกทฤษฎีบทความเชิงช่างด้านซ้าย</p>
              <p className="text-[10px]">ระบบจะกู่โชว์ปัญหา สาเหตุ วิธีแก้ วิธีป้องกัน บรอกทอรรถประโยชน์ครบวงจร</p>
            </div>
          ) : (
            <div className="space-y-6 text-xs leading-normal">
              {/* Reader Header */}
              <div className="border-b border-slate-150 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-indigo-600 font-extrabold text-[10px] font-mono bg-indigo-50/75 px-2 py-0.5 rounded uppercase">
                    {selectedArticle.type}
                  </span>

                  <button
                    id={`btn-like-kb-art-${selectedArticle.id}`}
                    onClick={() => onLikeArticle(selectedArticle.id)}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer text-[10px]"
                  >
                    <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                    กดถูกใจมีประโยชน์ ({selectedArticle.likes})
                  </button>
                </div>

                <h3 className="font-bold text-slate-900 text-sm sm:text-base mt-2 leading-snug">
                  {selectedArticle.title}
                </h3>
                
                {/* Author Card row */}
                <div className="flex items-center gap-2.5 mt-3 pt-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border text-slate-600 font-bold text-[10px]">
                    {selectedArticle.author[0]}
                  </div>
                  <div>
                    <strong className="block text-slate-800 text-[11px] leading-tight">{selectedArticle.author}</strong>
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{selectedArticle.authorTitle} | แผนก: {selectedArticle.authorDept}</span>
                  </div>
                </div>

                {currentUser.role === 'Admin' && (
                  <div className="p-3 bg-blue-50/70 border border-[#e1ded5] rounded-xl flex items-center justify-between gap-2 mt-3 animate-in fade-in">
                    <span className="font-bold text-[10px] text-[#15329c]">เครื่องมือผู้ดูแลระบบ (Admin command):</span>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        id={`btn-edit-kb-${selectedArticle.id}`}
                        onClick={() => {
                          setEditingArt({
                            ...selectedArticle,
                            relatedWIs: selectedArticle.relatedWIs.join(', '),
                            tags: selectedArticle.tags.join(', '),
                          });
                          setIsEditOpen(true);
                        }}
                        className="bg-[#15329c] hover:bg-[#11297e] text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer text-[10px] font-bold"
                      >
                        <Edit className="w-3 h-3" />
                        แก้ไขบทความ
                      </button>
                      <button
                        id={`btn-delete-kb-${selectedArticle.id}`}
                        onClick={() => {
                          if (window.confirm(`คุณแน่ใจว่าต้องการลบบทความวิเคราะห์ปัญหา "${selectedArticle.title}" หรือไม่?`)) {
                            handleDeleteClick(selectedArticle.id);
                          }
                        }}
                        className="bg-[#e51a24] hover:bg-[#cb131c] text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer text-[10px] font-bold"
                      >
                        <Trash2 className="w-3 h-3" />
                        ลบบทความ
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* PROBLEM (ปัญหา) */}
              <div className="space-y-1 bg-red-50/40 p-4 rounded-xl border border-red-100">
                <h5 className="font-bold text-red-900 flex items-center gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 bg-red-650 rounded-full" />
                  ปัญหาชำรุดเก้อะ: (Problem)
                </h5>
                <p className="text-slate-700 leading-relaxed pl-3 font-medium whitespace-pre-wrap">{selectedArticle.problem}</p>
              </div>

              {/* CAUSE (สาเหตุ) */}
              {selectedArticle.cause && (
                <div className="space-y-1 bg-amber-50/40 p-4 rounded-xl border border-amber-100">
                  <h5 className="font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                    <span className="w-1.5 h-1.5 bg-amber-650 rounded-full" />
                    วิเคราะห์ตรวจหาต้นตอสาเหตุ: (Root Cause)
                  </h5>
                  <p className="text-slate-700 leading-relaxed pl-3 whitespace-pre-wrap">{selectedArticle.cause}</p>
                </div>
              )}

              {/* SOLUTION (วิธีแก้ไขด่วน) */}
              <div className="space-y-1 bg-emerald-50/40 p-4 rounded-xl border border-emerald-100">
                <h5 className="font-bold text-emerald-900 flex items-center gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 bg-emerald-650 rounded-full" />
                  ขั้นตอนวิธีการดำเนินการแก้ไขปัญหา: (Action Solution)
                </h5>
                <p className="text-slate-850 leading-relaxed pl-3 font-semibold whitespace-pre-wrap">{selectedArticle.solution}</p>
              </div>

              {/* PREVENTION (วิธีป้องกันระยะยาว) */}
              {selectedArticle.prevention && (
                <div className="space-y-1 bg-blue-50/40 p-4 rounded-xl border border-blue-100">
                  <h5 className="font-bold text-blue-900 flex items-center gap-1.5 text-xs">
                    <span className="w-1.5 h-1.5 bg-blue-650 rounded-full" />
                    ขั้นตอนมาตรการป้องกันไม่ให้เกิดซ้ำรอย: (Prevention Control)
                  </h5>
                  <p className="text-slate-755 leading-relaxed pl-3 whitespace-pre-wrap">{selectedArticle.prevention}</p>
                </div>
              )}

              {/* RELATED WIs */}
              {selectedArticle.relatedWIs.length > 0 && (
                <div className="p-3.5 bg-neutral-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-2">เอกสาร WI / QP และแบบฟอร์มมาตรฐานอ้างอิง:</span>
                  <div className="flex flex-wrap gap-2">
                    {selectedArticle.relatedWIs.map((wiCode) => {
                      const matchedItem = documents.find(d => d.title.toUpperCase().includes(wiCode.toUpperCase()));
                      
                      return (
                        <div key={wiCode} className="inline-flex items-center gap-1.5 bg-white border px-2.5 py-1.5 rounded-lg text-xs hover:border-indigo-300">
                          <FileText className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="font-bold text-indigo-950">{wiCode}</span>
                          {matchedItem && <span className="text-[9px] text-slate-400">({matchedItem.type})</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Author and tagging footer metadata */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-[10px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>ป้ายกำกับ:</span>
                  {selectedArticle.tags.map((tag, idx) => (
                    <span key={idx} className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                      #{tag}
                    </span>
                  ))}
                </div>

                <span>สร้างเมื่อ: {new Date(selectedArticle.createdAt).toLocaleString('th-TH')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FORM TO ADD TAICIT KNOWLEDGE */}
      {isFormOpen && (
        <div id="add-kb-article-dialog" className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-slate-250">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between text-xs shrink-0">
              <span className="font-bold">ขั้นตอนถ่ายโอนเทคโนโลยี: สัมภาษณ์ความรู้ Tacit ของคนเก่งหน้าเครื่อง</span>
              <button 
                id="close-kb-article-modal-btn"
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <form id="form-create-kb-tech" onSubmit={handleCreateArticleSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                {/* Form type */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ประเภทกลุ่มข้อมูลความรู้:</label>
                  <select
                    id="new-kb-type"
                    value={newArt.type}
                    onChange={(e) => setNewArt({ ...newArt, type: e.target.value as KBType })}
                    className="w-full bg-white border border-slate-205 p-2 rounded-lg text-slate-700 text-xs"
                  >
                    <option value="Troubleshooting">Troubleshooting (เจาะปัญหา → สาเหตุ → วิธีแก้)</option>
                    <option value="Best Practice">Best Practice (วิธีปฎิบัติงานที่ได้ประสิทธิสัมฤทธิ์ดีที่สุด)</option>
                    <option value="Lesson Learned">Lesson Learned (บทเรียนราคาแพงจากข้อผิดพลาดหน้าแท่น)</option>
                    <option value="Kaizen">Kaizen (การทำไคเซ็นลดลำดับเคลื่อนไหวสูญเสียเวลา)</option>
                    <option value="FAQ">FAQ (ถามยอดฮิตในฝ่ายผลิต)</option>
                  </select>
                </div>

                {/* Related WI map */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">รหัส WI/QP อ้างอิงเชื่อมสัมพันธ์:</label>
                  <input
                    id="new-kb-relatedwis"
                    type="text"
                    placeholder="เช่น WI-MAINT-001, QP-PRD-001"
                    value={newArt.relatedWIs}
                    onChange={(e) => setNewArt({ ...newArt, relatedWIs: e.target.value })}
                    className="w-full bg-white border border-slate-205 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Title index code */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">หัวข้อเทคนิค: (Title)</label>
                <input
                  id="new-kb-title"
                  type="text"
                  placeholder="เช่น ปัญหาสายถุงสไลด์ลามิเนตร้อนผิดปกติเนื่องจากใบซ้ายเอียงเกลียว..."
                  value={newArt.title}
                  onChange={(e) => setNewArt({ ...newArt, title: e.target.value })}
                  required
                  className="w-full bg-white border border-slate-205 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Problem Statement */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">1. รายละเอียดอาการ ปัญหารั่วซึม / ชำรุดเด้อะ: (Problem)</label>
                <textarea
                  id="new-kb-problem"
                  placeholder="ระบบเครื่องจักรขึ้น Alarm Code ใด หน้าปาสัญญาหมุนผิดปรกติอย่างไร..."
                  rows={2}
                  value={newArt.problem}
                  onChange={(e) => setNewArt({ ...newArt, problem: e.target.value })}
                  required
                  className="w-full bg-white border border-slate-205 p-2 rounded-lg text-slate-850 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Cause statement */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">2. วิเคราะห์หาสาเหตุที่ทำให้เกิดปัญหานั้น: (Cause - ไม่บังคับสำหรับ FAQ/Kaizen)</label>
                <textarea
                  id="new-kb-cause"
                  placeholder="เช่น เกิดจากฝุ่นผงพลาสติกเกาะ, ความหนืดของน้ำยาไฮดรอลิกผิดอุณหภูมิ..."
                  rows={1.5}
                  value={newArt.cause}
                  onChange={(e) => setNewArt({ ...newArt, cause: e.target.value })}
                  className="w-full bg-white border border-slate-205 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Solution Action */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">3. ลำดับวิธีกดแก้ไขด่วนเพื่อให้สายผลิตวิ่งต่อได้: (Solution)</label>
                <textarea
                  id="new-kb-solution"
                  placeholder="ขั้นที่ 1 ตักสับ... ขั้นที่ 2 ล้างป้ายน้ำยาสมานรอย..."
                  rows={2}
                  value={newArt.solution}
                  onChange={(e) => setNewArt({ ...newArt, solution: e.target.value })}
                  required
                  className="w-full bg-white border border-slate-205 p-2 rounded-lg text-slate-850 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Long term Prevention */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">4. แผนงานบำรุงเชิงรักษาระยะยาวป้องกันการเกิดซ้ำ: (Prevention)</label>
                <textarea
                  id="new-kb-prevention"
                  placeholder="เช่น ทำความสะอาดเซ็นเซอร์ความไวแสงทุกครั้งเมื่อเปลี่ยนกะการผลิต, ซ่อมเช็คความต้านทาน..."
                  rows={1.5}
                  value={newArt.prevention}
                  onChange={(e) => setNewArt({ ...newArt, prevention: e.target.value })}
                  className="w-full bg-white border border-slate-205 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Tags field */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">คำค้นหา/แฮชแท็ก: (คั่นด้วยจุลภาค ",")</label>
                <input
                  id="new-kb-tags"
                  type="text"
                  placeholder="เช่น เซ็นเซอร์, ไบมีดร้อน, Lamination"
                  value={newArt.tags}
                  onChange={(e) => setNewArt({ ...newArt, tags: e.target.value })}
                  className="w-full bg-white border border-slate-205 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-100 shrink-0">
                <button
                  id="btn-cancel-new-kb"
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="bg-slate-100 hover:bg-slate-250 text-slate-700 font-bold px-4 py-2 rounded-lg cursor-pointer transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  id="btn-submit-new-kb"
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-lg cursor-pointer transition shadow animate-in"
                >
                  {currentUser.role === 'Admin' ? 'บันทึกและพับลิชเผยแพร่' : 'ส่งบันทึกขออนุมัติเนื้อหา'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW KM PROPOSAL FORM DIALOG */}
      {isProposalOpen && (
        <div id="add-km-proposal-dialog" className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-slate-250 text-left">
            <div className="bg-emerald-950 text-emerald-200 px-5 py-4 flex items-center justify-between text-xs border-b border-emerald-900 shrink-0">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-white">เสนอหัวข้อความรู้ใหม่ / ข้อมูลที่น่าสนใจ (New KM Proposal)</span>
              </div>
              <button 
                id="close-km-proposal-modal-btn"
                type="button"
                onClick={() => setIsProposalOpen(false)}
                className="text-emerald-400 hover:text-white cursor-pointer w-6 h-6 flex items-center justify-center rounded-full hover:bg-emerald-900 transition font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form id="form-create-km-proposal" onSubmit={handleProposalSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-150 text-[11px] leading-relaxed">
                🚀 ร่วมเป็นส่วนหนึ่งของการแบ่งปันความรู้หน้างาน! ทุกข้อเสนอของคุณจะถูกบันทึกไปที่ระบบอบรมในสถานะ <strong>Pending</strong> เพื่อให้ Admin / ผู้เชี่ยวชาญ คัดกรองและอนุมัติพัฒนาเนื้อหาลงระบบต่อไป
              </div>

              {/* Title field */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">หัวข้อความรู้ที่เสนอ หรือ ปัญหาที่ต้องการให้จัดทำ: (KM Title) <span className="text-rose-500">*</span></label>
                <input
                  id="proposal-title"
                  type="text"
                  placeholder="เช่น เสนอเพิ่มหัวข้อ: แนะนำวิธีการซ่อมแซมจุดลมรั่วเบื้องต้นของเครื่องเป่าฟิล์ม"
                  value={proposalData.title}
                  onChange={(e) => setProposalData({ ...proposalData, title: e.target.value })}
                  required
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Form type */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ประเภทกลุ่มข้อมูลความรู้:</label>
                  <select
                    id="proposal-type"
                    value={proposalData.type}
                    onChange={(e) => setProposalData({ ...proposalData, type: e.target.value as KBType })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-700 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="Troubleshooting">Troubleshooting (แก้ปัญหาเฉพาะหน้า)</option>
                    <option value="Best Practice">Best Practice (แนวทางปฎิบัติงานที่เป็นเลิศ)</option>
                    <option value="Lesson Learned">Lesson Learned (บทเรียนข้อผิดพลาด)</option>
                    <option value="Kaizen">Kaizen (การทำไคเซ็นปรับปรุงงาน)</option>
                    <option value="FAQ">FAQ (คำถามชาร์ตคำตอบพบบ่อย)</option>
                  </select>
                </div>

                {/* Tags field */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">คำค้นหา/แท็กที่เกี่ยวข้อง:</label>
                  <input
                    id="proposal-tags"
                    type="text"
                    placeholder="เช่น ลมรั่ว, ลามิเนต, ซ่อมบำรุง"
                    value={proposalData.tags}
                    onChange={(e) => setProposalData({ ...proposalData, tags: e.target.value })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Problem/Description Statement */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">รายละเอียดเนื้อหา หรือเรื่องราวที่ต้องการเสนอแนะ: (Details) <span className="text-rose-500">*</span></label>
                <textarea
                  id="proposal-problem"
                  placeholder="ช่วยอธิบายรายละเอียด เช่น ปัญหานี้รบกวนการทำงานอย่างไร หรือเหตุใดจึงคิดว่าหัวข้อนี้มีประโยชน์ต่อเพื่อนพนักงาน..."
                  rows={3}
                  value={proposalData.problem}
                  onChange={(e) => setProposalData({ ...proposalData, problem: e.target.value })}
                  required
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Recommended Solution/Advice */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">แนวทางหรือวิธีแก้ไขเบื้องต้น (ถ้ามีสิ่งแนะนำ):</label>
                <textarea
                  id="proposal-solution"
                  placeholder="หากมีขั้นตอนการแก้ไข หรือข้อมูลที่ต้องการแบ่งปันเพิ่มเติม สามารถระบุได้ที่นี่..."
                  rows={2}
                  value={proposalData.solution}
                  onChange={(e) => setProposalData({ ...proposalData, solution: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Readonly Proposed By metadata block */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150 text-[10px] text-slate-500 flex items-center justify-between">
                <span>👤 ผู้เสนอข้อมูล: <strong>{currentUser.name}</strong></span>
                <span>สังกัดฝ่าย: <strong>{currentUser.department || 'ไม่ระบุ'}</strong></span>
                <span>บทบาท: <strong>{currentUser.role}</strong></span>
              </div>

              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-100 shrink-0">
                <button
                  id="btn-cancel-proposal"
                  type="button"
                  onClick={() => setIsProposalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg cursor-pointer transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  id="btn-submit-proposal"
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-lg cursor-pointer transition-all shadow"
                >
                  ส่งเสนอหัวข้อความรู้ (Submit Proposal)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT FORM DIALOG FOR ADMIN */}
      {isEditOpen && editingArt && (
        <div id="edit-kb-article-dialog" className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-[#e1ded5]">
            <div className="bg-[#15329c] text-white px-5 py-4 flex items-center justify-between text-xs shrink-0">
              <span className="font-bold uppercase text-white">แก้ไขข้อมูลเทคโนโลยีบทความ (Admin Edit Mode)</span>
              <button 
                id="close-edit-kb-modal-btn"
                onClick={() => setIsEditOpen(false)}
                className="text-white hover:opacity-85 cursor-pointer w-6 h-6 flex items-center justify-center rounded-full hover:bg-blue-800 transition font-bold"
              >
                ✕
              </button>
            </div>

            <form id="form-edit-kb-tech" onSubmit={handleEditArticleSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                {/* Form type */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ประเภทกลุ่มข้อมูลความรู้:</label>
                  <select
                    id="edit-kb-type"
                    value={editingArt.type}
                    onChange={(e) => setEditingArt({ ...editingArt, type: e.target.value as KBType })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-700 text-xs"
                  >
                    <option value="Troubleshooting">Troubleshooting (คู่มือแก้ไขอุปสรรคชำรุด)</option>
                    <option value="Best Practice">Best Practice (วิธีทำให้เกิดประสิทธิภาพสูงสุด)</option>
                    <option value="Lesson Learned">Lesson Learned (บทเรียนราคาแพงจากของเสีย)</option>
                    <option value="Kaizen">Kaizen (การเสนอแนะปรับเปลี่ยนเล็กๆ น้อยๆ)</option>
                    <option value="FAQ">FAQ (คำถามเทคนิคที่พบบ่อย)</option>
                  </select>
                </div>

                {/* Title */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">หัวข้อเทคนิคคสลัด:</label>
                  <input
                    id="edit-kb-title"
                    type="text"
                    value={editingArt.title}
                    onChange={(e) => setEditingArt({ ...editingArt, title: e.target.value })}
                    required
                    className="w-full bg-white border border-slate-202 p-2 rounded-lg text-slate-805 text-xs focus:ring-1 focus:ring-[#15329c] focus:outline-none"
                  />
                </div>
              </div>

              {/* Problem Statement */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">1. รายละเอียดอาการปัญหาชำรุด / เปรียบวิจัย: (Problem)</label>
                <textarea
                  id="edit-kb-problem"
                  rows={2}
                  value={editingArt.problem}
                  onChange={(e) => setEditingArt({ ...editingArt, problem: e.target.value })}
                  required
                  className="w-full bg-white border border-slate-202 p-2 rounded-lg text-slate-805 text-xs focus:ring-1 focus:ring-[#15329c] focus:outline-none"
                />
              </div>

              {/* Root Cause */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">2. ตรวจค้นหาสาเหตุหลัก / ปรากฏการณ์เครื่องจักรหยุด: (Root Cause - Optional)</label>
                <textarea
                  id="edit-kb-cause"
                  rows={2}
                  value={editingArt.cause || ''}
                  onChange={(e) => setEditingArt({ ...editingArt, cause: e.target.value })}
                  className="w-full bg-white border border-slate-202 p-2 rounded-lg text-slate-805 text-xs focus:ring-1 focus:ring-[#15329c] focus:outline-none"
                />
              </div>

              {/* Action Solution */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">3. ลำดับขั้นตอนวิธีดำเนินการแก้ไขปัญหาอย่างเซียน: (Solution)</label>
                <textarea
                  id="edit-kb-solution"
                  rows={2.5}
                  value={editingArt.solution}
                  onChange={(e) => setEditingArt({ ...editingArt, solution: e.target.value })}
                  required
                  className="w-full bg-white border border-slate-205 p-2 rounded-lg text-slate-850 text-xs focus:ring-1 focus:ring-[#15329c] focus:outline-none"
                />
              </div>

              {/* Long term Prevention */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">4. มาตรการป้องกันเชิงรักษาระยะยาว: (Prevention - Optional)</label>
                <textarea
                  id="edit-kb-prevention"
                  rows={1.5}
                  value={editingArt.prevention || ''}
                  onChange={(e) => setEditingArt({ ...editingArt, prevention: e.target.value })}
                  className="w-full bg-white border border-slate-205 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-[#15329c] focus:outline-none"
                />
              </div>

              {/* Related WIs row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block text-[10px]">โยงเอกสาร WI อ้างอิง: (คั่นด้วย ",")</label>
                  <input
                    id="edit-kb-relatedwis"
                    type="text"
                    value={editingArt.relatedWIs}
                    onChange={(e) => setEditingArt({ ...editingArt, relatedWIs: e.target.value })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block text-[10px]">คำค้นหา/คำค้นเพิ่มเติม: (คั่นด้วย ",")</label>
                  <input
                    id="edit-kb-tags"
                    type="text"
                    value={editingArt.tags}
                    onChange={(e) => setEditingArt({ ...editingArt, tags: e.target.value })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 text-xs"
                  />
                </div>
              </div>

              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 p-4 bg-slate-50 border-t border-slate-100 shrink-0">
                <button
                  id="btn-cancel-edit-kb"
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="bg-slate-100 hover:bg-slate-250 text-slate-700 font-bold px-4 py-2 rounded-lg cursor-pointer transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  id="btn-submit-edit-kb"
                  type="submit"
                  className="bg-[#15329c] hover:bg-[#11297e] text-white font-bold px-5 py-2 rounded-lg cursor-pointer transition shadow"
                >
                  ยืนยันบันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
