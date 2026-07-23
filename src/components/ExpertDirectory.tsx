/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Briefcase, Calendar, Mail, Phone, Search, Send, 
  UserCheck, Users, MessageSquare, CheckCircle, ExternalLink, Edit, Trash2, Plus, Upload, User as UserIcon
} from 'lucide-react';
import { Expert, User, ContactRequest } from '../types';
import { DEPARTMENTS } from '../utils/departmentUtils';

interface ExpertDirectoryProps {
  currentUser: User;
  experts: Expert[];
  contactRequests: ContactRequest[];
  onAddContactRequest: (req: ContactRequest) => void;
  onAddContactReply: (reqId: string, replyText: string) => void;
  onAddExpert: (expert: Expert) => void;
  onUpdateExpert: (expert: Expert) => void;
  onDeleteExpert: (id: string) => void;
}

export const ExpertDirectory: React.FC<ExpertDirectoryProps> = ({
  currentUser,
  experts,
  contactRequests,
  onAddContactRequest,
  onAddContactReply,
  onAddExpert,
  onUpdateExpert,
  onDeleteExpert,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  
  // Selected Expert for Messaging/Detail
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(experts[0]?.id || null);

  // Message Form State
  const [contactTopic, setContactTopic] = useState('');
  const [contactMsg, setContactMsg] = useState('');

  // Reply Simulator state
  const [simulatedReply, setSimulatedReply] = useState('');

  // Admin CRUD states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [addDragActive, setAddDragActive] = useState(false);
  const [editDragActive, setEditDragActive] = useState(false);
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');
  
  const [newExpert, setNewExpert] = useState({
    name: '',
    position: '',
    department: 'ฝ่ายผลิต (Production)',
    skills: '',
    phone: '',
    email: '',
    availability: 'วันจันทร์ - ศุกร์ : 08:00 - 17:00 น.',
    experienceYears: 5,
    avatarUrl: '',
  });

  const [editingExpert, setEditingExpert] = useState<any>(null);

  const handleImageUpload = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewExpert(prev => ({
        ...prev,
        avatarUrl: reader.result as string
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleEditImageUpload = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditingExpert(prev => ({
        ...prev,
        avatarUrl: reader.result as string
      }));
    };
    reader.readAsDataURL(file);
  };

  const departments = ['ALL', ...DEPARTMENTS];

  const filteredExperts = experts.filter(exp => {
    // Dept filter
    if (selectedDept !== 'ALL') {
      const cleanSelected = selectedDept.split(' (')[0].toLowerCase();
      const cleanExpDept = exp.department.toLowerCase();
      if (!cleanExpDept.includes(cleanSelected) && !cleanSelected.includes(cleanExpDept)) {
        return false;
      }
    }

    // Keyword search
    const matchStr = `${exp.name} ${exp.position} ${exp.department} ${exp.skills.join(' ')}`.toLowerCase();
    if (searchQuery && !matchStr.includes(searchQuery.toLowerCase())) return false;

    return true;
  });

  const handleContactSubmit = (e: React.FormEvent, exp: Expert) => {
    e.preventDefault();
    if (!contactTopic.trim() || !contactMsg.trim()) return;

    const mockReq: ContactRequest = {
      id: `cr-${Date.now()}`,
      userId: currentUser.id,
      userName: currentUser.name,
      userDept: currentUser.department,
      expertId: exp.id,
      expertName: exp.name,
      topic: contactTopic,
      message: contactMsg,
      status: 'Sent',
      createdAt: new Date().toISOString()
    };

    onAddContactRequest(mockReq);
    setContactTopic('');
    setContactMsg('');
  };

  const handleAddExpertSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!newExpert.name || !newExpert.position) {
      setAddError('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
      return;
    }
    if (!newExpert.avatarUrl) {
      setAddError('กรุณาอัปโหลดรูปภาพจริงของผู้เชี่ยวชาญก่อนทำการบันทึก');
      return;
    }

    const prepared: Expert = {
      id: `exp-${Date.now()}`,
      name: newExpert.name,
      position: newExpert.position,
      department: newExpert.department,
      skills: newExpert.skills.split(',').map(s => s.trim()).filter(Boolean),
      phone: newExpert.phone || '02-1234567',
      email: newExpert.email || 'info@royalmeiwa.co.th',
      availability: newExpert.availability,
      experienceYears: Number(newExpert.experienceYears) || 3,
      avatarUrl: newExpert.avatarUrl,
    };

    onAddExpert(prepared);
    setIsAddOpen(false);
    setSelectedExpertId(prepared.id);
  };

  const handleEditExpertSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    if (!editingExpert || !editingExpert.name || !editingExpert.position) {
      setEditError('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
      return;
    }
    if (!editingExpert.avatarUrl) {
      setEditError('กรุณาอัปโหลดรูปภาพจริงของผู้เชี่ยวชาญก่อนทำการบันทึก');
      return;
    }

    const updated: Expert = {
      ...editingExpert,
      skills: typeof editingExpert.skills === 'string'
        ? editingExpert.skills.split(',').map((s: string) => s.trim()).filter(Boolean)
        : editingExpert.skills,
      experienceYears: Number(editingExpert.experienceYears) || 3,
    };

    onUpdateExpert(updated);
    setIsEditOpen(false);
    setEditingExpert(null);
  };

  const selectedExpert = experts.find(e => e.id === selectedExpertId);
  const relevantInquiries = contactRequests.filter(req => req.userId === currentUser.id && req.expertId === selectedExpertId);

  return (
    <div className="space-y-6">
      {/* Search Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Expert Directory & Yellow Pages (ทำเนียบค้นหาผู้เชี่ยวชาญ)
            </h2>
            <p className="text-xs text-slate-505 mt-1">
              ต้องการแก้ไขวิกฤตเร่งด่วน? ค้นหาหัวข้อทักษะความชำนาญ ISO ตรวจสอบตารางเข้าเวร และกดแชทส่งข้อความขอคำปรึกษาได้ทันที
            </p>
          </div>

          {currentUser.role === 'Admin' && (
            <button
              id="btn-add-expert-modal-open"
              onClick={() => {
                setAddError('');
                setNewExpert({
                  name: '',
                  position: '',
                  department: 'ฝ่ายผลิต (Production)',
                  skills: '',
                  phone: '',
                  email: '',
                  availability: 'วันจันทร์ - ศุกร์ : 08:00 - 17:00 น.',
                  experienceYears: 5,
                  avatarUrl: '',
                });
                setIsAddOpen(true);
              }}
              className="bg-[#15329c] hover:bg-[#11297e] text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer self-start md:self-center shrink-0 uppercase"
            >
              <Plus className="w-4 h-4" />
              เพิ่มผู้เชี่ยวชาญใหม่
            </button>
          )}
        </div>

        {/* Input selectors */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
          <div className="relative md:col-span-2">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
              <Search className="w-4 h-4" />
            </span>
            <input
              id="expert-search-input"
              type="text"
              placeholder="ป้อนชื่อผู้เชี่ยวชาญ หรือคีย์ทักษะเช่น 'Film Blowing', 'HACCP', 'Hydraulics'..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 py-2 pl-10 pr-4 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <select
              id="expert-dept-filter"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full bg-white border border-slate-200 py-2 px-3 rounded-xl text-xs text-slate-705 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">เลือกกรองตามฝ่ายสังกัด</option>
              {departments.filter(d => d !== 'ALL').map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left contacts list */}
        <div className="lg:col-span-1 space-y-3">
          <span className="block text-slate-450 text-[10px] font-bold uppercase tracking-wider">
            พบคณะวิศวกรผู้เชี่ยวชาญ ({filteredExperts.length} ท่าน)
          </span>

          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {filteredExperts.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs">
                ไม่มีข้อมูลช่างเทคนิครองรับทักษะดังกล่าว
              </div>
            ) : (
              filteredExperts.map((exp) => {
                const isSelected = selectedExpertId === exp.id;
                
                return (
                  <div
                    key={exp.id}
                    id={`expert-row-card-${exp.id}`}
                    onClick={() => setSelectedExpertId(exp.id)}
                    className={`p-4 bg-white rounded-xl border cursor-pointer text-left transition-all flex items-start gap-3.5 relative overflow-hidden ${
                      isSelected
                        ? 'border-indigo-600 shadow-sm ring-1 ring-indigo-500'
                        : 'border-slate-200 hover:border-slate-350'
                    }`}
                  >
                    <img
                      src={exp.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80'}
                      alt={exp.name}
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-full object-cover border border-slate-100"
                    />

                    <div className="space-y-1 sm:space-y-1.5 flex-1 min-w-0">
                      <div>
                        <h4 className="font-bold text-slate-800 text-xs truncate leading-none">
                          {exp.name}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-mono mt-1 block truncate">
                          {exp.position.split(' / ')[0]}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {exp.skills.slice(0, 3).map((skill, sIdx) => (
                          <span
                            key={sIdx}
                            className="bg-indigo-50/50 text-indigo-700 text-[8px] font-bold px-1 rounded-sm border border-indigo-100/55"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>

                      <div className="text-[9px] text-slate-500 font-mono">
                        ประสบการณ์: {exp.experienceYears} ปี | สังกัดโรงงาน
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right profile detail & consultation hub */}
        <div className="lg:col-span-2 space-y-6">
          {selectedExpert && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden text-xs">
              {/* Profile card cover visual background decorative */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white flex flex-col sm:flex-row items-center gap-4 border-b border-indigo-950">
                <img
                  src={selectedExpert.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80'}
                  alt={selectedExpert.name}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-indigo-400 shadow"
                />
                <div className="text-center sm:text-left">
                  <span className="bg-indigo-500/20 text-indigo-300 text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider uppercase">
                    ได้รับการแต่งตั้งเป็นทางการ
                  </span>
                  <h3 className="font-bold text-base sm:text-lg text-white mt-1.5 leading-tight">
                    {selectedExpert.name}
                  </h3>
                  <p className="text-slate-300 font-mono text-xs mt-0.5">
                    {selectedExpert.position} • {selectedExpert.department}
                  </p>
                </div>
              </div>

              {currentUser.role === 'Admin' && (
                <div className="bg-blue-50/70 border-b border-indigo-100 p-3.5 flex justify-between items-center px-6 animate-in fade-in">
                  <span className="font-bold text-[10px] text-[#15329c] uppercase">เครื่องมือผู้ดูแลระบบ (Admin Yellowpages controls):</span>
                  <div className="flex gap-2">
                    <button
                      id={`btn-edit-expert-${selectedExpert.id}`}
                      onClick={() => {
                        setEditError('');
                        setEditingExpert({
                          ...selectedExpert,
                          skills: selectedExpert.skills.join(', '),
                        });
                        setIsEditOpen(true);
                      }}
                      className="bg-[#15329c] hover:bg-[#11297e] text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition text-[10px] font-bold cursor-pointer"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      แก้ไขข้อมูลผู้เชี่ยวชาญ
                    </button>
                    <button
                      id={`btn-delete-expert-${selectedExpert.id}`}
                      onClick={() => {
                        if (window.confirm(`คุณแน่ใจว่าต้องการลบราชื่อผู้ทำงานระดับเซียน "${selectedExpert.name}" หลุดตำแหน่ง?`)) {
                          onDeleteExpert(selectedExpert.id);
                          setSelectedExpertId(experts.find(e => e.id !== selectedExpert.id)?.id || null);
                        }
                      }}
                      className="bg-[#e51a24] hover:bg-[#cb131c] text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition text-[10px] font-bold cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      ลบระเบียบช่าง
                    </button>
                  </div>
                </div>
              )}

              {/* Profile Details section */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 leading-relaxed">
                <div className="space-y-4">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                      จุดความเชี่ยวชาญพิเศษ (Competency Skills Mapping)
                    </span>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {selectedExpert.skills.map((skill) => (
                        <span
                          key={skill}
                          className="bg-indigo-50 text-[#15329c] font-bold px-2.5 py-1 rounded-md text-[10px] border border-indigo-100"
                        >
                          📌 {skill}
                        </span>
                      ))}
                    </div>

                    {/* Skill levels indicator bars */}
                    <div className="space-y-2 mt-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <span className="block text-[9px] font-extrabold text-slate-400 uppercase">ระดับความเชี่ยวชาญเชิงเทคนิค (Expertise Skill Rating)</span>
                      
                      <div className="space-y-1.5 text-[10px]">
                        <div>
                          <div className="flex justify-between font-bold text-slate-700 mb-0.5">
                            <span>ISO / HACCP Auditing Standards</span>
                            <span>95%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div className="bg-indigo-600 h-2 rounded-full" style={{ width: '95%' }}></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between font-bold text-slate-700 mb-0.5">
                            <span>สายงานผลิต & Loss Prevention</span>
                            <span>100%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div className="bg-emerald-600 h-2 rounded-full" style={{ width: '100%' }}></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between font-bold text-slate-700 mb-0.5">
                            <span>การแก้ไขปัญหาขัดข้องหน้าเครื่องจักร</span>
                            <span>92%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div className="bg-amber-500 h-2 rounded-full" style={{ width: '92%' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-slate-650 pt-2">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">ขบวนการข้อมูลติดต่อ</span>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <span>{selectedExpert.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <span className="underline">{selectedExpert.email}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Verified badge status */}
                  <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-100 space-y-1.5 text-[11px]">
                    <span className="text-[9px] font-bold text-emerald-800 uppercase block tracking-wider">📜 ใบรับรองความรู้ทางวิชาชีพ (Credentials)</span>
                    <p className="font-bold text-slate-800 flex items-center gap-1.5 text-emerald-950">
                      ✅ ISO 9001:2015 / ISO 14001:2015 certified Lead Auditor
                    </p>
                    <p className="text-slate-500 text-[10px]">ผ่านการอบรมรับรองโดยสถาบันมาตรฐานกลาง RMP Board Of Directors ปี 2025</p>
                  </div>

                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      เวลาให้การตอบข้อมูลวิกฤต: (Availability Schedules)
                    </span>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-150 flex items-start gap-2.5">
                      <Calendar className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                      <div>
                        <strong className="block text-slate-800 text-[11px]">สแตนด์บายเชิงช่วยเหลือ:</strong>
                        <p className="text-slate-600 text-[11px] mt-1 line-clamp-2 leading-snug">{selectedExpert.availability}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 bg-indigo-50/40 rounded-xl border border-indigo-100 flex items-center justify-between">
                    <div>
                      <strong className="block text-slate-800 text-[10px]">ชาร์จชั่วโมงฝึกอบรมและช่วยเหลือ:</strong>
                      <span className="text-slate-500 text-[10px]">สะสมกว่า 80 ชั่วโมงช่วยเหลือหน้างานจริง</span>
                    </div>
                    <span className="bg-[#15329c] text-white font-mono font-bold text-[10px] px-2.5 py-0.5 rounded-md flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" /> Verified Expert
                    </span>
                  </div>
                </div>
              </div>

              {/* Consultation Area */}
              <div className="bg-slate-50/60 p-6 border-t border-slate-200">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2 mb-4 pb-1.5 border-b">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  ส่งคำปรึกษาการแก้ไขจุดหยุดชงักทางเทคนิค (Direct Consultation Hub)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  {/* Left: Input mail form */}
                  <form 
                    id="form-expert-consultation"
                    onSubmit={(e) => handleContactSubmit(e, selectedExpert)} 
                    className="space-y-3.5"
                  >
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 block">กรอกหัวข้อปัญหาเดือดร้อน:</label>
                      <input
                        id="consultation-topic-input"
                        type="text"
                        placeholder="เช่น ม้วนสไลน์ขาดแถบ QC-205..."
                        value={contactTopic}
                        onChange={(e) => setContactTopic(e.target.value)}
                        required
                        className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 block">พิมพ์รายละเอียดย่อของคำถามปัญหาหน้าแท่น:</label>
                      <textarea
                        id="consultation-message-textarea"
                        placeholder="กรุณาป้อนอ้างรหัส Lot อุณหภูมิสาย และอาการเตือนที่เกิดขึ้นที่แผงกระดาน..."
                        rows={3.5}
                        value={contactMsg}
                        onChange={(e) => setContactMsg(e.target.value)}
                        required
                        className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none text-slate-800"
                      />
                    </div>

                    <button
                      id="btn-send-consultation"
                      type="submit"
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl cursor-pointer transition flex items-center justify-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      ส่งคำอภิปุจฉาถึงผู้เชี่ยวชาญทันที
                    </button>
                  </form>

                  {/* Right: Inbox logs */}
                  <div className="space-y-3">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                      ประวัติการหารือและความช่วยเหลือของคุณต่อนามผู้เชี่ยวชาญนี้ ({relevantInquiries.length})
                    </span>

                    <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                      {relevantInquiries.length === 0 ? (
                        <div className="bg-white p-6 border rounded-xl text-center text-[10px] text-slate-400 italic">
                          ยังไม่มีประวัติส่งคำถามหาคนนี้ในกะประเมินปัจจุบัน
                        </div>
                      ) : (
                        relevantInquiries.map((req) => (
                          <div key={req.id} className="bg-white p-3 rounded-xl border border-slate-150 space-y-2">
                            <div className="flex justify-between items-start text-[10px]">
                              <span className="font-extrabold text-slate-700 truncate max-w-[150px]">
                                หัวข้อ: {req.topic}
                              </span>
                              <span className="text-slate-400 font-mono text-[9px] shrink-0">
                                {new Date(req.createdAt).toLocaleTimeString()}
                              </span>
                            </div>

                            <p className="text-slate-600 text-[10px] bg-indigo-50/20 p-2 rounded leading-relaxed border border-slate-100">
                              {req.message}
                            </p>

                            {/* Reply block */}
                            {req.status === 'Replied' && req.replyMessage ? (
                              <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg space-y-1">
                                <span className="font-bold text-emerald-850 text-[9px] block">
                                  ✓ ตอบกลับโดยผู้เชี่ยวชาญ {req.expertName}:
                                </span>
                                <p className="text-emerald-950 text-[10px] leading-relaxed italic">{req.replyMessage}</p>
                              </div>
                            ) : (
                              <div className="text-right flex justify-between items-center bg-slate-50 p-2 rounded">
                                <span className="text-[9px] text-amber-600 font-semibold italic animate-pulse">
                                  ⌛ คำถามได้รับส่งแล้วและอยู่ระหว่างรอวิศวกรวิจารณ์...
                                </span>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ADMIN ADD NEW EXPERT MODAL */}
      {isAddOpen && (
        <div id="add-expert-dialog-box" className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden border border-[#e1ded5]">
            <div className="bg-[#15329c] text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <span className="font-bold text-xs uppercase text-white">บันทึกข้อมูลทำเนียบวิศวกรผู้เชี่ยวชาญใหม่</span>
              <button 
                id="close-add-expert-btn"
                onClick={() => setIsAddOpen(false)}
                className="text-white hover:opacity-85 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <form id="form-add-expert" onSubmit={handleAddExpertSubmit} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ชื่อ-นามสกุลจริง:</label>
                  <input
                    id="add-expert-name"
                    type="text"
                    placeholder="เช่น ดร.วิทยา เหมวิมล"
                    value={newExpert.name}
                    onChange={(e) => setNewExpert({ ...newExpert, name: e.target.value })}
                    required
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 focus:ring-1 focus:ring-[#15329c]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ตำแหน่งระดับทักษะ:</label>
                  <input
                    id="add-expert-pos"
                    type="text"
                    placeholder="เช่น Snr Specialist Extruder / ที่ปรึกษา"
                    value={newExpert.position}
                    onChange={(e) => setNewExpert({ ...newExpert, position: e.target.value })}
                    required
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 focus:ring-1 focus:ring-[#15329c]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ฝ่ายสังกัดแผนก:</label>
                  <select
                    id="add-expert-dept"
                    value={newExpert.department}
                    onChange={(e) => setNewExpert({ ...newExpert, department: e.target.value })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-700"
                  >
                    {DEPARTMENTS.map((d, i) => (
                      <option key={i} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ประสบการณ์ทำงาน (ปี):</label>
                  <input
                    id="add-expert-years"
                    type="number"
                    min={1}
                    value={newExpert.experienceYears}
                    onChange={(e) => setNewExpert({ ...newExpert, experienceYears: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">ระดับความเชี่ยวชาญ / คีย์ความชำนาญ (คั่นด้วยจุลภาค ","):</label>
                <input
                  id="add-expert-skills"
                  type="text"
                  placeholder="เช่น Extrusion, Blown Film, Mechanical Repair, PLC, Safe Quality"
                  value={newExpert.skills}
                  onChange={(e) => setNewExpert({ ...newExpert, skills: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 focus:ring-1 focus:ring-[#15329c]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">เบอร์ติดต่อ:</label>
                  <input
                    id="add-expert-phone"
                    type="text"
                    value={newExpert.phone}
                    onChange={(e) => setNewExpert({ ...newExpert, phone: e.target.value })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ที่อยู่อีเมลจริง:</label>
                  <input
                    id="add-expert-email"
                    type="email"
                    value={newExpert.email}
                    onChange={(e) => setNewExpert({ ...newExpert, email: e.target.value })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">วันเวลาเข้าเวรให้ความช่วยเหลือ:</label>
                <input
                  id="add-expert-availability"
                  type="text"
                  value={newExpert.availability}
                  onChange={(e) => setNewExpert({ ...newExpert, availability: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 focus:ring-1 focus:ring-[#15329c]"
                />
              </div>

              {/* Responsive Image Drag and Drop + Select */}
              <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <label className="font-semibold text-slate-700 block text-[11px]">รูปภาพโปรไฟล์ผู้เชี่ยวชาญ (Profile Photo):</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div 
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAddDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAddDragActive(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setAddDragActive(false);
                      const files = e.dataTransfer.files;
                      if (files && files[0]) {
                        handleImageUpload(files[0]);
                      }
                    }}
                    onClick={() => document.getElementById('expert-image-file-input')?.click()}
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all bg-white flex flex-col items-center justify-center gap-2 min-h-[100px] ${
                      addDragActive ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-200' : 'border-slate-300 hover:border-indigo-500'
                    }`}
                  >
                    <Upload className="w-5 h-5 text-indigo-600" />
                    <span className="text-[10px] text-slate-700 font-bold">ลากและวางรูปภาพตรงนี้</span>
                    <span className="text-[9px] text-slate-500">หรือคลิกเพื่อเลือกไฟล์รูปถ่าย</span>
                    <input 
                      type="file" 
                      id="expert-image-file-input" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files[0]) {
                          handleImageUpload(files[0]);
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      {newExpert.avatarUrl ? (
                        <img 
                          src={newExpert.avatarUrl} 
                          alt="Avatar Preview" 
                          className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500 shadow-sm shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full border-2 border-dashed border-red-400 bg-red-50 flex items-center justify-center shrink-0">
                          <UserIcon className="w-6 h-6 text-red-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-slate-800 truncate">รูปภาพโปรไฟล์ขณะนี้</p>
                        <p className={`text-[8px] truncate font-mono font-bold ${newExpert.avatarUrl ? 'text-emerald-600' : 'text-red-500'}`}>
                          {newExpert.avatarUrl ? '✓ อัปโหลดรูปภาพจริงแล้ว' : '⚠ กรุณาอัปโหลดรูปภาพจริง (จำเป็น)'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {addError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-semibold">
                  {addError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 shrink-0">
                <button
                  id="btn-cancel-add-expert"
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="bg-slate-100 text-slate-700 font-bold px-4 py-2 rounded-lg cursor-pointer transition hover:bg-slate-200"
                >
                  ยกเลิก
                </button>
                <button
                  id="btn-submit-add-expert"
                  type="submit"
                  className="bg-[#15329c] hover:bg-[#11297e] text-white font-bold px-5 py-2 rounded-lg cursor-pointer transition shadow"
                >
                  บันทึกเข้าระบบ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN EDIT EXPERT MODAL */}
      {isEditOpen && editingExpert && (
        <div id="edit-expert-dialog-box" className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-2xs animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden border border-[#e1ded5]">
            <div className="bg-[#15329c] text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <span className="font-bold text-xs uppercase text-white">แก้ไขข้อมูลทำเนียบผู้เชี่ยวชาญ (Admin Edit Mode)</span>
              <button 
                id="close-edit-expert-btn"
                onClick={() => setIsEditOpen(false)}
                className="text-white hover:opacity-85 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <form id="form-edit-expert" onSubmit={handleEditExpertSubmit} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ชื่อ-นามสกุล:</label>
                  <input
                    id="edit-expert-name"
                    type="text"
                    value={editingExpert.name}
                    onChange={(e) => setEditingExpert({ ...editingExpert, name: e.target.value })}
                    required
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 focus:ring-1 focus:ring-[#15329c]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block flex justify-between">ตำแหน่งและทักษะ:</label>
                  <input
                    id="edit-expert-pos"
                    type="text"
                    value={editingExpert.position}
                    onChange={(e) => setEditingExpert({ ...editingExpert, position: e.target.value })}
                    required
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 focus:ring-1 focus:ring-[#15329c]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">แผนกเจ้าของงาน:</label>
                  <select
                    id="edit-expert-dept"
                    value={editingExpert.department}
                    onChange={(e) => setEditingExpert({ ...editingExpert, department: e.target.value })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-700"
                  >
                    {DEPARTMENTS.map((d, i) => (
                      <option key={i} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ประสบการณ์ทำงาน (ปี):</label>
                  <input
                    id="edit-expert-years"
                    type="number"
                    min={1}
                    value={editingExpert.experienceYears}
                    onChange={(e) => setEditingExpert({ ...editingExpert, experienceYears: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">เทคโนโลยีวิชาเฉพาะทาง (คั้นด้วยเครื่องหมาย ",") :</label>
                <input
                  id="edit-expert-skills"
                  type="text"
                  value={editingExpert.skills}
                  onChange={(e) => setEditingExpert({ ...editingExpert, skills: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 focus:ring-1 focus:ring-[#15329c]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">เบอร์โทรศัพท์ติดต่อ:</label>
                  <input
                    id="edit-expert-phone"
                    type="text"
                    value={editingExpert.phone}
                    onChange={(e) => setEditingExpert({ ...editingExpert, phone: e.target.value })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">ที่อยู่เบอร์ส่งเมล:</label>
                  <input
                    id="edit-expert-email"
                    type="email"
                    value={editingExpert.email}
                    onChange={(e) => setEditingExpert({ ...editingExpert, email: e.target.value })}
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">เวลาให้บริการคำช่วยเหลือ:</label>
                <input
                  id="edit-expert-availability"
                  type="text"
                  value={editingExpert.availability}
                  onChange={(e) => setEditingExpert({ ...editingExpert, availability: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 focus:ring-1 focus:ring-[#15329c]"
                />
              </div>

              {/* Responsive Image Drag and Drop + Select for EDIT */}
              <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <label className="font-semibold text-slate-700 block text-[11px]">แก้ไขรูปโปรไฟล์ผู้เชี่ยวชาญ (Profile Photo):</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div 
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditDragActive(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditDragActive(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditDragActive(false);
                      const files = e.dataTransfer.files;
                      if (files && files[0]) {
                        handleEditImageUpload(files[0]);
                      }
                    }}
                    onClick={() => document.getElementById('edit-expert-image-file-input')?.click()}
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all bg-white flex flex-col items-center justify-center gap-2 min-h-[100px] ${
                      editDragActive ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-200' : 'border-slate-300 hover:border-indigo-500'
                    }`}
                  >
                    <Upload className="w-5 h-5 text-indigo-600" />
                    <span className="text-[10px] text-slate-700 font-bold">ลากและวางรูปภาพตรงนี้</span>
                    <span className="text-[9px] text-slate-500">หรือคลิกเพื่อเลือกไฟล์รูปถ่าย</span>
                    <input 
                      type="file" 
                      id="edit-expert-image-file-input" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const files = e.target.files;
                        if (files && files[0]) {
                          handleEditImageUpload(files[0]);
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      {editingExpert.avatarUrl ? (
                        <img 
                          src={editingExpert.avatarUrl} 
                          alt="Avatar Preview" 
                          className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500 shadow-sm shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full border-2 border-dashed border-red-400 bg-red-50 flex items-center justify-center shrink-0">
                          <UserIcon className="w-6 h-6 text-red-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-slate-800 truncate">รูปภาพโปรไฟล์ขณะนี้</p>
                        <p className={`text-[8px] truncate font-mono font-bold ${editingExpert.avatarUrl ? 'text-emerald-600' : 'text-red-500'}`}>
                          {editingExpert.avatarUrl ? '✓ อัปโหลดรูปภาพจริงแล้ว' : '⚠ กรุณาอัปโหลดรูปภาพจริง (จำเป็น)'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {editError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-semibold">
                  {editError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 shrink-0">
                <button
                  id="btn-cancel-edit-expert"
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="bg-slate-100 text-slate-700 font-bold px-4 py-2 rounded-lg cursor-pointer transition hover:bg-slate-200"
                >
                  ยกเลิก
                </button>
                <button
                  id="btn-submit-edit-expert"
                  type="submit"
                  className="bg-[#15329c] hover:bg-[#11297e] text-white font-bold px-5 py-2 rounded-lg cursor-pointer transition shadow"
                >
                  บันทึกการปรับเปลี่ยน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
