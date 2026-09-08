/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  FileText,
  FolderOpen,
  Search,
  Upload,
  Plus,
  CheckCircle,
  Clock,
  Star,
  Eye,
  Download,
  EyeOff,
  Film,
  Image,
  Edit,
  Trash2,
  Lock,
  ShieldAlert,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import { DocumentItem, DocType, User, RatingAndComment } from "../types";
import {
  DEPARTMENTS,
  getDepartmentById,
  getAllDepartmentsFlat,
} from "../utils/departmentUtils";
import { api } from "../services/api";
import * as XLSX from "xlsx";

interface DocumentListProps {
  currentUser: User;
  documents: DocumentItem[];
  onAddDocument: (doc: DocumentItem) => void;
  onApproveDocument: (id: string, approverName: string) => void;
  onUpdateDocument: (doc: DocumentItem) => void;
  onDeleteDocument: (id: string) => void;
  comments: RatingAndComment[];
  onAddComment: (docId: string, rating: number, comment: string) => void;
}

/**
 * Automatically detects and returns document type ('QP', 'WI', 'FORM')
 * based on matching keywords in the document title.
 */
export const autoTagDocumentType = (title: string): DocType => {
  const lower = title.trim().toLowerCase();

  // Rule 1: Custom check for explicit prefixes or codes (such as QP-PRD-102, WI-SPC-001, FM-QC-05)
  if (
    /^qp[-_\s]/i.test(lower) ||
    lower.includes(" qp") ||
    lower.includes("qp ") ||
    lower.includes("(qp)") ||
    lower.includes("procedure") ||
    lower.includes("ระเบียบ") ||
    lower.includes("ขั้นตอนการปฏิบัติงาน") ||
    lower.includes("policy") ||
    lower.includes("นโยบาย")
  ) {
    return "QP";
  }
  if (
    /^wi[-_\s]/i.test(lower) ||
    lower.includes(" wi") ||
    lower.includes("wi ") ||
    lower.includes("(wi)") ||
    lower.includes("instruction") ||
    lower.includes("วิธีปฏิบัติงาน") ||
    lower.includes("ขั้นตอนการทำงาน") ||
    lower.includes("คู่มือปฏิบัติงาน") ||
    lower.includes("คู่มือ") ||
    lower.includes("manual") ||
    lower.includes("วิธีปฎิบัติงาน")
  ) {
    return "WI";
  }
  if (
    /^(form|fm)[-_\s]/i.test(lower) ||
    lower.includes(" form") ||
    lower.includes("form ") ||
    lower.includes("(form)") ||
    lower.includes(" fm") ||
    lower.includes("fm ") ||
    lower.includes("(fm)") ||
    lower.includes("template") ||
    lower.includes("แบบฟอร์ม") ||
    lower.includes("บันทึก") ||
    lower.includes("checklist") ||
    lower.includes("รายงาน") ||
    lower.includes("report")
  ) {
    return "FORM";
  }

  // Rule 2: Substring matching if the prefix regex didn't trigger
  const procedureKeywords = [
    "procedure",
    "ระเบียบ",
    "ขั้นตอนการปฏิบัติงาน",
    "qp",
    "policy",
    "นโยบาย",
  ];
  const instructionKeywords = [
    "instruction",
    "วิธีปฏิบัติงาน",
    "ขั้นตอนการทำงาน",
    "คู่มือปฏิบัติงาน",
    "คู่มือ",
    "manual",
    "wi",
    "วิธีปฎิบัติงาน",
  ];
  const formKeywords = [
    "form",
    "template",
    "แบบฟอร์ม",
    "บันทึก",
    "checklist",
    "รายงาน",
    "report",
    "fm",
  ];

  // Check procedures
  if (procedureKeywords.some((keyword) => lower.includes(keyword))) {
    return "QP";
  }
  // Check instructions
  if (instructionKeywords.some((keyword) => lower.includes(keyword))) {
    return "WI";
  }
  // Check forms
  if (formKeywords.some((keyword) => lower.includes(keyword))) {
    return "FORM";
  }

  // Default fallback
  return "QP";
};

export const DocumentList: React.FC<DocumentListProps> = ({
  currentUser,
  documents,
  onAddDocument,
  onApproveDocument,
  onUpdateDocument,
  onDeleteDocument,
  comments,
  onAddComment,
}) => {
  const [activeTab, setActiveTab] = useState<DocType | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");

  // Security controls inside the portal viewer
  const [isSecureViewerOpen, setIsSecureViewerOpen] = useState(false);
  const [secureViewerZoom, setSecureViewerZoom] = useState(100);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);

  React.useEffect(() => {
    if (!isSecureViewerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Block Ctrl+P or Cmd+P (Print)
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        setSecurityNotice(
          "⚠️ พิมพ์ถูกจำกัด: ระบบความปลอดภัยไม่อนุญาตให้พิมพ์ระเบียบปฏิบัติงาน QP นอกระบบ",
        );
        setTimeout(() => setSecurityNotice(null), 4000);
      }
      // Block Ctrl+C or Cmd+C (Copy)
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        setSecurityNotice(
          "⚠️ คัดลอกถูกจำกัด: บล็อกสิทธิ์การก๊อปปี้ข้อมูลของระเบียบเอกสาร QP",
        );
        setTimeout(() => setSecurityNotice(null), 4000);
      }
      // Block Ctrl+S or Cmd+S (Save)
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        setSecurityNotice(
          "⚠️ บันทึกถูกจำกัด: บล็อกการเซฟไฟล์เอกสารสำคัญออกนอกระบบ",
        );
        setTimeout(() => setSecurityNotice(null), 4000);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setSecurityNotice(
        "⚠️ คลิกขวาถูกจำกัด: ระบบตรวจสอบความปลอดภัยระดับสูง ไม่อนุญาตให้ใช้เมนูคลิกขวาในหน้านี้",
      );
      setTimeout(() => setSecurityNotice(null), 4000);
    };

    const handleCopy = (e: Event) => {
      e.preventDefault();
      setSecurityNotice(
        "⚠️ คัดลอกถูกจำกัด: ไม่สามารถทำสำเนาเนื้อหาเอกสารสำคัญ QP ออกนอกระบบควบคุมได้",
      );
      setTimeout(() => setSecurityNotice(null), 4000);
    };

    const handleSelectStart = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("copy", handleCopy);
    window.addEventListener("selectstart", handleSelectStart);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("copy", handleCopy);
      window.removeEventListener("selectstart", handleSelectStart);
    };
  }, [isSecureViewerOpen]);

  // Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [newDoc, setNewDoc] = useState({
    title: "",
    description: "",
    type: "QP" as DocType,
    departmentId: "d-pd",
    owner: currentUser.name,
    revision: 1,
    effectiveDate: new Date().toISOString().split("T")[0],
    fileType: "PDF" as "PDF" | "Excel" | "Word" | "Video",
    exampleText: "",
    exampleImage: "",
    exampleVideo: "",
  });

  // Edit Modal State for Admin
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<any>(null);

  // Selected Doc for interactive Preview/Rating
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Rating form state
  const [ratingInput, setRatingInput] = useState(5);
  const [commentInput, setCommentInput] = useState("");

  // Drag and Drop simulation state
  const [isDragging, setIsDragging] = useState(false);
  const [mockFileName, setMockFileName] = useState("");
  const [uploadedFileObjectUrl, setUploadedFileObjectUrl] =
    useState<string>("");
  const [uploadedFileParsedExcel, setUploadedFileParsedExcel] = useState<
    { [sheetName: string]: any[][] } | undefined
  >(undefined);
  const [activeExcelSheet, setActiveExcelSheet] = useState<string>("");
  // ไฟล์จริงที่ upload ขึ้น server แล้ว (ต่างจาก blob: URL ที่อยู่ได้แค่ session นี้)
  const [uploadedFileServerUrl, setUploadedFileServerUrl] =
    useState<string>("");
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);
  const [uploadFileError, setUploadFileError] = useState<string>("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Clean up Object URL to avoid memory leaks
  React.useEffect(() => {
    return () => {
      if (uploadedFileObjectUrl) {
        URL.revokeObjectURL(uploadedFileObjectUrl);
      }
    };
  }, [uploadedFileObjectUrl]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // server รับแค่ base64 ล้วน ตัด prefix "data:<mime>;base64," ออก
        resolve(result.split(",")[1] || result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelection = (file: File) => {
    setMockFileName(file.name);

    // Autodetect file type
    const ext = file.name.split(".").pop()?.toLowerCase();
    let detectedFileType: "PDF" | "Excel" | "Word" | "Video" = "PDF";
    let suggestedDocType: DocType = "QP";

    if (ext === "pdf") {
      detectedFileType = "PDF";
      suggestedDocType = file.name.toUpperCase().includes("WI-") ? "WI" : "QP";
    } else if (["xlsx", "xls", "csv"].includes(ext || "")) {
      detectedFileType = "Excel";
      suggestedDocType = "FORM";
    } else if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext || "")) {
      detectedFileType = "Video";
      suggestedDocType = "WI";
    } else if (["docx", "doc"].includes(ext || "")) {
      detectedFileType = "Word";
      suggestedDocType = "WI";
    }

    // Auto-fill title if empty
    setNewDoc((prev) => ({
      ...prev,
      title: prev.title || file.name.replace(/\.[^/.]+$/, ""), // remove extension
      fileType: detectedFileType,
      type: suggestedDocType,
    }));

    // Create transient object URL for video/pdf previews in active session
    const objectUrl = URL.createObjectURL(file);
    setUploadedFileObjectUrl(objectUrl);

    // อัปโหลดไฟล์จริงขึ้น server เพื่อให้ลิงก์ใช้งานได้ถาวรและเห็นได้ทุกคน
    // (ไม่ใช่แค่ blob: URL ที่หายไปทันทีที่ปิดแท็บ/รีเฟรช)
    setUploadedFileServerUrl("");
    setUploadFileError("");
    setIsUploadingFile(true);
    (async () => {
      try {
        const base64 = await fileToBase64(file);
        const result = await api.uploadFile(
          file.name,
          base64,
          file.type || "application/octet-stream",
          suggestedDocType === "QP", // เอกสาร QP บังคับ restricted ตั้งแต่ต้น
        );
        setUploadedFileServerUrl(result.url);
      } catch (err) {
        console.error("Real file upload failed:", err);
        setUploadFileError(
          "⚠️ อัปโหลดไฟล์ขึ้นเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองแนบไฟล์ใหม่อีกครั้ง",
        );
      } finally {
        setIsUploadingFile(false);
      }
    })();

    // If Excel, parse using SheetJS
    if (detectedFileType === "Excel") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetsData: { [sheetName: string]: any[][] } = {};
          workbook.SheetNames.forEach((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, {
              header: 1,
            });
            sheetsData[sheetName] = jsonData as any[][];
          });
          setUploadedFileParsedExcel(sheetsData);
          if (workbook.SheetNames.length > 0) {
            setActiveExcelSheet(workbook.SheetNames[0]);
          }
        } catch (err) {
          console.error("Error parsing Excel file:", err);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setUploadedFileParsedExcel(undefined);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const departments = ["ALL", ...DEPARTMENTS];

  // Filters combined
  const filteredDocs = documents.filter((doc) => {
    // Tab filter
    if (activeTab !== "ALL" && doc.type !== activeTab) return false;
    // Dept filter
    if (deptFilter !== "ALL") {
      const cleanSelected = deptFilter.split(" (")[0].toLowerCase();
      const docDeptName =
        getDepartmentById(doc.departmentId)?.name || doc.departmentId || "";
      const cleanDocDept = docDeptName.toLowerCase();

      let matched =
        cleanDocDept.includes(cleanSelected) ||
        cleanSelected.includes(cleanDocDept);

      // Check common translations / synonyms in our system
      if (!matched) {
        if (
          cleanSelected.includes("executive") &&
          cleanDocDept.includes("ผู้บริหาร")
        )
          matched = true;
        if (
          cleanSelected.includes("purchasing") &&
          (cleanDocDept.includes("จัดซื้อ") ||
            cleanDocDept.includes("procurement"))
        )
          matched = true;
        if (
          cleanSelected.includes("quality") &&
          (cleanDocDept.includes("คุณภาพ") || cleanDocDept.includes("qa/qc"))
        )
          matched = true;
        if (
          cleanSelected.includes("production") &&
          cleanDocDept.includes("ผลิต")
        )
          matched = true;
        if (
          cleanSelected.includes("warehouse") &&
          cleanDocDept.includes("คลังสินค้า")
        )
          matched = true;
        if (
          cleanSelected.includes("engineering") &&
          cleanDocDept.includes("ซ่อมบำรุง")
        )
          matched = true;
        if (
          cleanSelected.includes("document control") &&
          cleanDocDept.includes("ควบคุมเอกสาร")
        )
          matched = true;
      }

      if (!matched) return false;
    }
    // Search query matches: title, description, department or index codes
    const docDeptName =
      getDepartmentById(doc.departmentId)?.name || doc.departmentId || "";
    const matchString =
      `${doc.title} ${doc.description} ${docDeptName} ${doc.type}`.toLowerCase();
    if (searchQuery && !matchString.includes(searchQuery.toLowerCase()))
      return false;

    // Viewer can only see "Published"
    if (currentUser.role === "Viewer" && doc.status !== "Published")
      return false;

    return true;
  });

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDoc.title) return;
    if (isUploadingFile) return; // กันการ submit ก่อนไฟล์อัปโหลดเสร็จ

    const mockId = `doc-${Date.now()}`;
    const generatedDoc: DocumentItem = {
      id: mockId,
      title: newDoc.title,
      description: newDoc.description,
      type: newDoc.type,
      departmentId: newDoc.departmentId,
      owner: currentUser.name,
      revision: Number(newDoc.revision),
      effectiveDate: newDoc.effectiveDate,
      // Editor uploads go into "Pending Approval", Admin goes direct to "Published"
      status: currentUser.role === "Admin" ? "Published" : "Pending Approval",
      approvedBy: currentUser.role === "Admin" ? currentUser.name : undefined,
      approvedAt:
        currentUser.role === "Admin" ? new Date().toISOString() : undefined,
      // ถ้ามีไฟล์จริงถูก upload ขึ้น server แล้ว ใช้ URL จริง — ไม่งั้นคง fallback แบบ '#...'
      // ไว้เป็นสัญญาณให้ UI รู้ว่ายังไม่มีไฟล์จริง (เช็คด้วย hasRealFile ตอนแสดงผล)
      fileUrl: uploadedFileServerUrl || `#no-file-attached-${mockId}`,
      fileType: newDoc.fileType,
      exampleText: newDoc.exampleText || undefined,
      exampleImage: newDoc.exampleImage || undefined,
      exampleVideo:
        newDoc.exampleVideo ||
        (newDoc.fileType === "Video" ? uploadedFileServerUrl : undefined),
      realFileUrl: uploadedFileServerUrl || undefined,
      parsedExcelSheets: uploadedFileParsedExcel || undefined,
      views: 0,
      downloads: 0,
      createdAt: new Date().toISOString(),
    };

    onAddDocument(generatedDoc);
    setIsUploadOpen(false);
    // Reset fields
    setNewDoc({
      title: "",
      description: "",
      type: "QP",
      departmentId: "d-pd",
      owner: currentUser.name,
      revision: 1,
      effectiveDate: new Date().toISOString().split("T")[0],
      fileType: "PDF",
      exampleText: "",
      exampleImage: "",
      exampleVideo: "",
    });
    setMockFileName("");
    setUploadedFileObjectUrl("");
    setUploadedFileServerUrl("");
    setUploadFileError("");
    setUploadedFileParsedExcel(undefined);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc || !editingDoc.title) return;
    onUpdateDocument(editingDoc);
    setIsEditOpen(false);
    setEditingDoc(null);
  };

  const handleDeleteClick = (id: string) => {
    onDeleteDocument(id);
    setSelectedDocId(null);
  };

  const handleAddCommentSubmit = (e: React.FormEvent, docId: string) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    onAddComment(docId, ratingInput, commentInput);
    setCommentInput("");
    setRatingInput(5);
  };

  const selectedDoc = documents.find((d) => d.id === selectedDocId);
  const selectedDocComments = comments.filter(
    (c) => c.docOrKBId === selectedDocId,
  );

  const qpCount = documents.filter((d) => d.type === "QP").length;
  const wiCount = documents.filter((d) => d.type === "WI").length;
  const formCount = documents.filter((d) => d.type === "FORM").length;
  const allCount = documents.length;

  return (
    <div className="space-y-6">
      {/* Upper bar with categories */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200/50 w-full md:w-auto">
          {(["ALL", "QP", "WI", "FORM"] as const).map((tab) => {
            const count =
              tab === "ALL"
                ? allCount
                : tab === "QP"
                  ? qpCount
                  : tab === "WI"
                    ? wiCount
                    : formCount;
            const label =
              tab === "ALL"
                ? "แสดงทั้งหมด"
                : tab === "QP"
                  ? "QP (ระเบียบ)"
                  : tab === "WI"
                    ? "WI (วิธีปฏิบัติงาน)"
                    : "FORM (แบบฟอร์ม)";
            return (
              <button
                key={tab}
                id={`tab-doc-type-${tab}`}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition flex items-center gap-1.5 ${
                  activeTab === tab
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                }`}
              >
                <span>{label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                    activeTab === tab
                      ? "bg-indigo-850/30 text-white"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {currentUser.role !== "Viewer" && (
          <button
            id="open-upload-modal-btn"
            onClick={() => setIsUploadOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer transition self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            อัพโหลดเอกสารใหม่
          </button>
        )}
      </div>

      {/* Filter panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search */}
        <div className="relative md:col-span-2">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
            <Search className="w-4 h-4" />
          </span>
          <input
            id="doc-search-input"
            type="text"
            placeholder="ค้นหาตามรหัสเอกสาร ชื่อ แผนก หรือคำค้น..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 py-2.5 pl-10 pr-4 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Dept select */}
        <div>
          <select
            id="doc-dept-filter"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="w-full bg-white border border-slate-200 py-2.5 px-3.5 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">เลือกดูทุกแผนก</option>
            {departments
              .filter((d) => d !== "ALL")
              .map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Two columns: Document Cards & Selected Doc Details Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left list list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="text-slate-500 text-xs font-semibold">
            พบคลังข้อมูลเอกสารมาตรฐานทั้งหมด ({filteredDocs.length} ฉบับ)
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDocs.length === 0 ? (
              <div className="col-span-2 bg-white text-center p-12 rounded-2xl border border-slate-200 space-y-3">
                <FolderOpen className="w-12 h-12 text-slate-300 mx-auto" />
                <h4 className="font-bold text-slate-800 text-sm">
                  ไม่พบเอกสารมาตรฐานประเภทที่ท่านระบุ
                </h4>
                <p className="text-slate-400 text-xs">
                  ลองค้นหาด้วยคำสำคัญอื่นๆ หรือเปลี่ยนประเภทการกรอง
                </p>
              </div>
            ) : (
              filteredDocs.map((doc) => {
                const docAvgRating =
                  comments
                    .filter((c) => c.docOrKBId === doc.id)
                    .reduce((sum, rating) => sum + rating.rating, 0) /
                  (comments.filter((c) => c.docOrKBId === doc.id).length || 1);
                const hasFeedbackCount = comments.filter(
                  (c) => c.docOrKBId === doc.id,
                ).length;

                return (
                  <div
                    key={doc.id}
                    id={`doc-card-${doc.id}`}
                    onClick={() => setSelectedDocId(doc.id)}
                    className={`bg-white p-5 rounded-2xl border transition-all cursor-pointer text-left block space-y-3 relative overflow-hidden ${
                      selectedDocId === doc.id
                        ? "border-indigo-600 shadow-md ring-1 ring-indigo-500"
                        : "border-slate-200 hover:border-slate-350 hover:shadow-sm"
                    }`}
                  >
                    {/* Upper label Badge */}
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold ${
                          doc.type === "QP"
                            ? "bg-emerald-100 text-emerald-800"
                            : doc.type === "WI"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {doc.type}
                      </span>

                      <div className="flex items-center gap-1.5 text-[10px]">
                        {doc.status === "Published" ? (
                          <span className="text-emerald-600 font-medium flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            พับลิชแล้ว
                          </span>
                        ) : (
                          <span className="text-amber-500 font-medium flex items-center gap-1 bg-amber-50 px-1.5 py-0.2 rounded">
                            <Clock className="w-3.5 h-3.5 animate-pulse" />
                            รอนุมัติโดย Admin
                          </span>
                        )}
                        <span className="text-slate-400 font-mono">
                          Rev.{doc.revision}
                        </span>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-800 text-xs line-clamp-2 leading-snug">
                        {doc.title}
                      </h4>
                      <p className="text-slate-400 text-[10px] mt-1 truncate">
                        ผู้ตรวจ: {doc.owner} | แผนก:{" "}
                        {getDepartmentById(doc.departmentId)?.name ||
                          doc.departmentId}
                      </p>
                    </div>

                    <p className="text-slate-600 text-xs line-clamp-2">
                      {doc.description}
                    </p>

                    {/* Metadata Footer bar */}
                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-0.5">
                          <Eye className="w-3.5 h-3.5" /> {doc.views}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Download className="w-3.5 h-3.5" /> {doc.downloads}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-slate-600">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span className="font-bold">
                          {docAvgRating.toFixed(1)}
                        </span>
                        <span>({hasFeedbackCount} ความเห็น)</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right drawer - Viewer Detailed Display */}
        <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          {!selectedDoc ? (
            <div className="text-center py-16 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-400">
                <FileText className="w-6 h-6" />
              </div>
              <h5 className="font-bold text-slate-700 text-xs">
                โปรดเลือกเอกสารวิเศษทางซ้ายเพื่อแสดงข้อมูล
              </h5>
              <p className="text-slate-400 text-[10px] max-w-[200px] mx-auto">
                ระบบจะเปิดดู ตัวอย่างการกรอก แนบไฟล์ตรวจ ภาพสกรีน และวิดีโอสาธิต
                ISO ทั้งหมดทันที
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-xs leading-normal">
              <div className="border-b border-slate-100 pb-3">
                <div className="flex items-center gap-1 text-[10px] text-indigo-600 font-bold uppercase tracking-wider mb-1">
                  <span>ผู้รับผิดชอบดูแล: {selectedDoc.owner}</span>
                </div>
                <h3 className="font-bold text-slate-950 text-sm leading-snug">
                  {selectedDoc.title}
                </h3>
                <span className="block text-[10px] text-slate-400 mt-1 font-mono">
                  วันที่บังคับใช้: {selectedDoc.effectiveDate} • สัญญารีด: Rev.
                  {selectedDoc.revision}
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  คำอธิบายรายละเอียด
                </span>
                <p className="text-slate-700">{selectedDoc.description}</p>
              </div>

              {/* Admin Edit/Delete Controls */}
              {currentUser.role === "Admin" && (
                <div className="p-3 bg-blue-50/70 border border-[#e1ded5] rounded-xl flex items-center justify-between gap-2">
                  <span className="font-bold text-[10px] text-[#15329c]">
                    ผู้ดูแลระบบ (Admin Active Tools):
                  </span>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      id={`btn-edit-doc-${selectedDoc.id}`}
                      onClick={() => {
                        setEditingDoc({ ...selectedDoc });
                        setIsEditOpen(true);
                      }}
                      className="bg-[#15329c] hover:bg-[#11297e] text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer text-[10px] font-bold"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      แก้ไข
                    </button>
                    <button
                      id={`btn-delete-doc-${selectedDoc.id}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `กรุณายืนยันการลบไฟล์เอกสารมาตรฐาน "${selectedDoc.title}" สมบูรณ์พัสดุ?`,
                          )
                        ) {
                          handleDeleteClick(selectedDoc.id);
                        }
                      }}
                      className="bg-[#e51a24] hover:bg-[#cb131c] text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer text-[10px] font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      ลบ
                    </button>
                  </div>
                </div>
              )}

              {/* Workflow Admin Action buttons */}
              {selectedDoc.status === "Pending Approval" && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <p className="text-amber-800 text-[10px] font-medium">
                    ⚠️ เอกสารนี้เพิ่งอัพโหลดใหม่
                    ยังไม่ผ่านการตรวจสอบความถูกต้องโดย Admin คณะกรรมการกลาง
                  </p>
                  {currentUser.role === "Admin" ? (
                    <button
                      id={`btn-approve-doc-${selectedDoc.id}`}
                      onClick={() => {
                        onApproveDocument(selectedDoc.id, currentUser.name);
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-lg text-[10px] cursor-pointer transition uppercase"
                    >
                      อนุมัติความถูกต้องและพับลิช (Admin Approve)
                    </button>
                  ) : (
                    <div className="text-[10px] italic text-slate-400 text-center font-mono py-1">
                      รอแอดมินอนุมัติ (สิทธิ์ Viewer/Editor ดูได้อย่างเจียมตัว)
                    </div>
                  )}
                </div>
              )}

              {/* DEMONSTRATION MATERIAL (WIS & FORMS REQUIRED SPEC) */}
              {(selectedDoc.exampleText ||
                selectedDoc.exampleImage ||
                selectedDoc.exampleVideo) && (
                <div className="border border-indigo-100 bg-indigo-50/30 p-3.5 rounded-xl space-y-3">
                  <span className="text-[10px] font-bold text-indigo-800 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-indigo-600 text-indigo-600" />
                    สื่อประกอบและคลาสสาธิตมาตรฐาน (Audit Evidence)
                  </span>

                  {selectedDoc.exampleText && (
                    <div className="space-y-1">
                      <span className="block text-[10px] font-semibold text-slate-500">
                        ✍️ ตัวอย่างการกรอก / คำแนะนำอ้างอิง:
                      </span>
                      <pre className="bg-white p-2.5 rounded border border-slate-150 font-mono text-[9px] text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {selectedDoc.exampleText}
                      </pre>
                    </div>
                  )}

                  {selectedDoc.exampleImage && (
                    <div className="space-y-1">
                      <span className="block text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                        <Image className="w-3.5 h-3.5 text-slate-400" />{" "}
                        รูปภาพสกรีนตัวอย่างฟอร์มจริง (Screen Mockup):
                      </span>
                      <img
                        src={selectedDoc.exampleImage}
                        alt="Example visual report"
                        referrerPolicy="no-referrer"
                        className="rounded border border-slate-200 mt-1 max-h-36 w-full object-cover"
                      />
                    </div>
                  )}

                  {selectedDoc.exampleVideo && (
                    <div className="space-y-1">
                      <span className="block text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                        <Film className="w-3.5 h-3.5 text-slate-400" />{" "}
                        วิดีโอสาธิตการซ่อม / ตั้งค่าเครื่อง (Video Dem):
                      </span>
                      <div className="rounded overflow-hidden border border-slate-250 bg-slate-900 mt-1">
                        <video
                          key={selectedDoc.exampleVideo}
                          controls
                          referrerPolicy="no-referrer"
                          className="w-full max-h-40 object-cover"
                        >
                          <source
                            src={selectedDoc.exampleVideo}
                            type="video/mp4"
                          />
                          เบราว์เซอร์ไม่รองรับวิดีโอแท็ก
                        </video>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Download Action with Role-based constraints for QP */}
              {selectedDoc.type === "QP" && currentUser.role !== "Admin" ? (
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl space-y-3 text-left">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-rose-100 rounded-lg text-rose-700 shrink-0 mt-0.5">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <span className="block font-bold text-rose-950 text-[10.5px]">
                        เอกสารสำคัญสงวนสิทธิ์ดาวน์โหลด (Confidential Document)
                      </span>
                      <p className="text-slate-500 text-[9.5px] leading-relaxed">
                        ระเบียบปฏิบัติงานระบบคุณภาพ (QP)
                        ถือเป็นทรัพย์สินทางปัญญาที่สำคัญของบริษัท ห้ามดาวน์โหลด
                        ปริ้น หรือคัดลอกออกนอกระบบโดยไม่ได้รับอนุมัติ
                        สิทธิ์เข้าถึงไฟล์จริงเปิดให้เฉพาะกลุ่ม{" "}
                        <strong className="text-slate-700 font-bold">
                          ผู้ดูแลระบบ (Admin)
                        </strong>{" "}
                        เท่านั้น
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const updated = await api.viewDocument(selectedDoc.id);
                        onUpdateDocument(updated);
                      } catch (err) {
                        console.error("Failed to record view count:", err);
                      }
                      setIsSecureViewerOpen(true);
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition text-[11px] shadow-xs hover:shadow-sm"
                  >
                    <Eye className="w-4 h-4" />
                    เปิดอ่านเนื้อหาฉบับสมบูรณ์ในระบบที่นี่ (Secure Portal
                    Viewer)
                  </button>
                </div>
              ) : (
                /* เพิ่ม : ( ... ) ครอบบล็อกดาวน์โหลดกรณีไม่ใช่ QP หรือเป็น Admin */
                (() => {
                  const hasRealFile =
                    !!selectedDoc.realFileUrl &&
                    !selectedDoc.realFileUrl.startsWith("blob:");
                  return (
                    <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex flex-col gap-2.5">
                      <div className="flex items-center justify-between w-full">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="block font-bold text-slate-700 text-[10px]">
                              ดาวน์โหลดเอกสารต้นฉบับจริง
                            </span>
                            {selectedDoc.type === "QP" && (
                              <span className="bg-emerald-100 text-emerald-800 text-[8px] font-bold px-1.5 py-0.2 rounded font-sans uppercase">
                                Admin Access
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] text-slate-400 font-mono">
                            ฟอร์แมตไฟล์: {selectedDoc.fileType}
                          </span>
                        </div>

                        {hasRealFile ? (
                          <a
                            id={`link-download-doc-${selectedDoc.id}`}
                            href={selectedDoc.realFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={async () => {
                              try {
                                const updated = await api.downloadDocument(
                                  selectedDoc.id,
                                );
                                onUpdateDocument(updated);
                              } catch (err) {
                                console.error(
                                  "Failed to record download count:",
                                  err,
                                );
                              }
                            }}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer transition text-[10px] uppercase shrink-0 font-sans"
                          >
                            <Download className="w-3.5 h-3.5" />
                            ดาวน์โหลด
                          </a>
                        ) : (
                          <span
                            title="เอกสารนี้ยังไม่มีไฟล์จริงแนบอยู่ในระบบ"
                            className="bg-slate-200 text-slate-400 font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-not-allowed transition text-[10px] uppercase shrink-0 font-sans"
                          >
                            <Download className="w-3.5 h-3.5" />
                            ไม่มีไฟล์แนบ
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
              {selectedDoc.type === "QP" && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const updated = await api.viewDocument(selectedDoc.id);
                      onUpdateDocument(updated);
                    } catch (err) {
                      console.error("Failed to record view count:", err);
                    }
                    setIsSecureViewerOpen(true);
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition text-[10px] cursor-pointer border border-slate-200"
                >
                  <Eye className="w-3.5 h-3.5" />
                  เปิดอ่านระบบตรวจสอบความมั่นคงปลอดภัย (Admin Secure Viewer)
                </button>
              )}

              {/* RATING & REVISION FEEDBACK SECTION */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-xs">
                    ข้อคิดเห็น & ข้อเสนอแนะปรับปรุง (
                    {selectedDocComments.length})
                  </h4>
                  <span className="text-[9px] text-indigo-600 block bg-indigo-50 px-1.5 py-0.5 rounded">
                    นำไปสู่ Version ใหม่
                  </span>
                </div>

                {/* Listing */}
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {selectedDocComments.length === 0 ? (
                    <p className="text-slate-400 text-[10px] italic py-2 text-center">
                      ยังไม่มีข้อเสนอแนะความรู้เพิ่มเติมสำหรับไฟล์นี้
                    </p>
                  ) : (
                    selectedDocComments.map((c) => (
                      <div
                        key={c.id}
                        className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold text-slate-700">
                            {c.userName}
                          </span>
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-2.5 h-2.5 ${i < c.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="text-slate-600 text-[10px] leading-relaxed">
                          {c.comment}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {/* Form to comment */}
                <form
                  id="form-add-doc-comment"
                  onSubmit={(e) => handleAddCommentSubmit(e, selectedDoc.id)}
                  className="space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-slate-500">
                      ระดับความพึงพอใจการเข้าใจงาน:
                    </label>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          type="button"
                          key={star}
                          onClick={() => setRatingInput(star)}
                          className="text-amber-400 focus:outline-none cursor-pointer"
                        >
                          <Star
                            className={`w-4 h-4 ${ratingInput >= star ? "fill-amber-400" : "text-slate-200"}`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative">
                    <textarea
                      id="comment-textarea"
                      placeholder="เสนอจุดปรับปรุง อุปสรรคหน้าเครื่องจักร หรือเสนอเวอรชั่นถัดไป..."
                      rows={2}
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                    />
                  </div>

                  <button
                    id="submit-comment-btn"
                    type="submit"
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-1.5 rounded-lg text-[9px] cursor-pointer transition flex items-center justify-center gap-1"
                  >
                    ส่งคำวิจารณ์/ปรับปรุงความรู้
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* UPLOAD MODAL DIALOG (STRICT EDITOR/ADMIN SCOPE) */}
      {isUploadOpen && (
        <div
          id="upload-dialog-box"
          className="fixed inset-0 z-50 bg-slate-900/60 overflow-y-auto flex items-start sm:items-center justify-center p-4 sm:p-6 md:p-10 backdrop-blur-2xs"
        >
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-slate-200 my-auto">
            {/* Header */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <span className="font-bold text-xs">
                กรอกข้อมูลระบบ Document Control Center
              </span>
              <button
                id="close-upload-modal-btn"
                onClick={() => setIsUploadOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form
              id="form-upload-sop-wi"
              onSubmit={handleUploadSubmit}
              className="p-5 space-y-4 text-xs"
            >
              <div className="grid grid-cols-2 gap-4">
                {/* Type */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">
                    หมวดหมู่เอกสาร: (Document Type)
                  </label>
                  <select
                    id="upload-doc-type"
                    value={newDoc.type}
                    onChange={(e) =>
                      setNewDoc({ ...newDoc, type: e.target.value as DocType })
                    }
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-700 text-xs"
                  >
                    <option value="QP">QP (Quality Procedure)</option>
                    <option value="WI">WI (Work Instruction)</option>
                    <option value="FORM">FORM (แบบฟอร์มตรวจสอบจริง)</option>
                  </select>
                </div>

                {/* Department */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">
                    แผนกเจ้าของงาน: (Department)
                  </label>
                  <select
                    id="upload-doc-dept"
                    value={newDoc.departmentId}
                    onChange={(e) =>
                      setNewDoc({ ...newDoc, departmentId: e.target.value })
                    }
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-700 text-xs"
                  >
                    {getAllDepartmentsFlat().map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name} ({dept.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Title */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">
                  รหัสเครื่อง & ชื่อเอกสารมาตรฐาน: (Document code & title)
                </label>
                <input
                  id="upload-doc-title"
                  type="text"
                  placeholder="เช่น WI-PRD-102 การปรับจูนชุดหัวปั๊มทองเหลือง..."
                  value={newDoc.title}
                  onChange={(e) => {
                    const titleVal = e.target.value;
                    const detectedType = autoTagDocumentType(titleVal);
                    setNewDoc((prev) => ({
                      ...prev,
                      title: titleVal,
                      type: detectedType,
                    }));
                  }}
                  required
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
                {newDoc.title && (
                  <p className="text-[10px] text-indigo-600 font-bold bg-indigo-50/50 p-1.5 rounded border border-indigo-100 flex items-center gap-1.5 mt-1 animate-in fade-in duration-200">
                    <span>💡 หมวดหมู่ที่แนะนำอัตโนมัติ:</span>
                    <span className="font-mono bg-indigo-600 text-white px-2 py-0.5 rounded text-[9px] font-bold">
                      {newDoc.type}
                    </span>
                    <span className="text-slate-400 font-normal">
                      (วิเคราะห์จากแผนกเครื่องและข้อความ)
                    </span>
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">
                  สรุปใจความสำคัญ / เพื่อลดการสูญเสียความรู้:
                </label>
                <textarea
                  id="upload-doc-desc"
                  placeholder="รายละเอียดขั้นตอน คณะวัตถุประสงค์ในการจัดเก็บสารบัน และควบคุมการสูญเสีย..."
                  rows={2}
                  value={newDoc.description}
                  onChange={(e) =>
                    setNewDoc({ ...newDoc, description: e.target.value })
                  }
                  required
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Revision */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">
                    Revision (รอบแก้ไขล่าสุด):
                  </label>
                  <input
                    id="upload-doc-rev"
                    type="number"
                    min={1}
                    value={newDoc.revision}
                    onChange={(e) =>
                      setNewDoc({ ...newDoc, revision: Number(e.target.value) })
                    }
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 text-xs"
                  />
                </div>

                {/* File Type */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">
                    ชนิดไฟล์จริงที่จะแนบหลักฐาน:
                  </label>
                  <select
                    id="upload-doc-filetype"
                    value={newDoc.fileType}
                    onChange={(e) =>
                      setNewDoc({ ...newDoc, fileType: e.target.value as any })
                    }
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-700 text-xs"
                  >
                    <option value="PDF">PDF (เอกสารสกรีน)</option>
                    <option value="Excel">Excel (แบบคำนวณชีต)</option>
                    <option value="Word">Word (รายงานแก้ใย)</option>
                    <option value="Video">
                      Video Training (สื่อวิดีโอสาธิต)
                    </option>
                  </select>
                </div>
              </div>

              {/* Advanced option: WI Example or Form input (WIS & FORMS FULL SPEC REQUIREMENTS) */}
              <div className="border border-slate-100 bg-slate-50 p-3 rounded-lg space-y-2">
                <span className="block font-bold text-indigo-900 text-[10px]">
                  ⚙️ แนบข้อมูลประกอบการเรียนรู้ (ใบตรวจคุณภาพจริง / วิดีโอ /
                  รูปภาพสาธิต)
                </span>

                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block">
                      ตัวอย่างข้อความการกรอกข้อมูล (เช่น ขั้นที่ 1 ชั่งตวง,
                      ขั้นที่ 2 กดคีย์...)
                    </label>
                    <textarea
                      id="upload-doc-exampletext"
                      placeholder="ขั้นตอนตัวอย่างการกรอกฟอร์ม หรือลำดับขั้นตอนการปฏิบัติจริงอย่างรวดเร็ว..."
                      rows={1.5}
                      value={newDoc.exampleText}
                      onChange={(e) =>
                        setNewDoc({ ...newDoc, exampleText: e.target.value })
                      }
                      className="w-full bg-white border border-slate-200 p-1.5 rounded text-[10px]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 block font-mono">
                        รูปภาพ Unsplash สาธิต (URL):
                      </label>
                      <input
                        id="upload-doc-exampleimage"
                        type="text"
                        placeholder="ลิงก์รูปภาพ เช่น https://images.unsplash.com/..."
                        value={newDoc.exampleImage}
                        onChange={(e) =>
                          setNewDoc({ ...newDoc, exampleImage: e.target.value })
                        }
                        className="w-full bg-white border border-slate-200 p-1 text-[9px]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block font-mono">
                        วิดีโอสาธิต (URL .mp4 หรือ Youtube):
                      </label>
                      <input
                        id="upload-doc-examplevideo"
                        type="text"
                        placeholder="ใช้ลิงก์วิดีโอสาธิตทดสอบ..."
                        value={newDoc.exampleVideo}
                        onChange={(e) =>
                          setNewDoc({ ...newDoc, exampleVideo: e.target.value })
                        }
                        className="w-full bg-white border border-slate-200 p-1 text-[9px]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Drag and Drop simulate area */}
              <div
                id="drag-drop-area-container"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-5 border-2 border-dashed rounded-xl text-center space-y-1.5 transition-all text-xs cursor-pointer ${
                  isDragging
                    ? "border-indigo-600 bg-indigo-50/50"
                    : "border-slate-300 bg-slate-50/50 hover:bg-indigo-50/30"
                }`}
              >
                <Upload className="w-6 h-6 text-indigo-500 mx-auto animate-bounce" />
                <p className="font-bold text-slate-700 text-[11px]">
                  {isUploadingFile
                    ? `⏳ กำลังอัปโหลด ${mockFileName} ขึ้นเซิร์ฟเวอร์...`
                    : uploadFileError
                      ? uploadFileError
                      : mockFileName
                        ? uploadedFileServerUrl
                          ? `✓ แนบไฟล์สำเร็จ (บันทึกถาวรแล้ว): ${mockFileName}`
                          : `📎 เลือกไฟล์แล้ว: ${mockFileName}` // กรณี "จำลอง" — ไม่มีไฟล์จริงผูกอยู่
                        : "ลากไฟล์ PDF/Excel/MP4 มาวางตรงนี้ หรือคลิกเพื่อเลือกไฟล์"}
                </p>
                <p className="text-slate-400 text-[9px]">
                  ระบบจะทำการวิเคราะห์ความปลอดภัยและโหลดข้อมูลจริงทันที
                </p>

                {/* Real input file uploader */}
                <input
                  id="file-real-uploader"
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv,.mp4,.mov,.avi,.mkv,.webm,.doc,.docx"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelection(e.target.files[0]);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()} // stop double trigger
                  className="hidden"
                />

                <div className="pt-1 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Generate a mock PDF for testing
                      setMockFileName("QP-PRD-401_Control_Standard_Audit.pdf");
                      setUploadedFileObjectUrl("");
                      setUploadedFileServerUrl(""); // demo เท่านั้น ไม่มีไฟล์จริงผูกอยู่
                      setUploadFileError("");
                      setUploadedFileParsedExcel(undefined);
                      setNewDoc((prev) => ({
                        ...prev,
                        title:
                          "QP-PRD-401 คู่มือมาตรฐานควบคุมสิ่งแวดล้อมระบบปิด",
                        fileType: "PDF",
                        type: "QP",
                      }));
                    }}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold px-2 py-1 rounded text-[9px] cursor-pointer border border-indigo-200"
                  >
                    ⚡ จำลองไฟล์ PDF
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Generate a mock Excel for testing
                      setMockFileName("RMP_Form_Daily_Audit_Log.xlsx");
                      setUploadedFileObjectUrl("");
                      setUploadedFileServerUrl("");
                      setUploadFileError("");
                      setUploadedFileParsedExcel({
                        พารามิเตอร์ตรวจสอบประจำวัน: [
                          [
                            "ลำดับ",
                            "หัวข้อการตรวจสอบ (Inspection Parameter)",
                            "เกณฑ์มาตรฐาน",
                            "สถานะ",
                            "ผู้บันทึก",
                          ],
                          [
                            "1",
                            "อุณหภูมิห้องหลอมฟิล์มสลิตเตอร์ (Slitter Chamber Temp)",
                            "22.5 - 24.5 °C",
                            "ปกติ [PASS]",
                            "วิศวกรสมเกียรติ",
                          ],
                          [
                            "2",
                            "ความดันหัวนวดรีดไฮดรอลิก (Hydraulic Compression)",
                            "180 - 200 Bar",
                            "ปกติ [PASS]",
                            "วิศวกรสมเกียรติ",
                          ],
                          [
                            "3",
                            "ความหนาตัวอย่างแผ่นฟอยล์ (Foil Film Caliper check)",
                            "150 ± 5 micron",
                            "ปกติ [PASS]",
                            "วิศวกรสมเกียรติ",
                          ],
                          [
                            "4",
                            "ค่าแรงดึงของตัวรอยซีลขอบห่อ (Seal Peel Tension test)",
                            ">= 45 N/15mm",
                            "ปกติ [PASS]",
                            "วิศวกรสมเกียรติ",
                          ],
                          [
                            "5",
                            "การทำงานของระบบคูลลิ่งทาวเวอร์หลัก (Main Cooling System)",
                            "ต้องไม่พบจุดรั่วซึม",
                            "ปกติ [PASS]",
                            "หัวหน้าช่างนฤมล",
                          ],
                        ],
                        "สรุปสถิติรอบสัปดาห์ (SOP summary)": [
                          [
                            "ตัวบ่งชี้การสูญเสีย",
                            "ค่าเป้าหมาย",
                            "ผลการทดสอบสัปดาห์นี้",
                          ],
                          [
                            "เศษเหลือตัดขอบคอยล์ (Coil Edge Trim Scrap)",
                            "< 1.5%",
                            "1.12% [ผ่านเกณฑ์]",
                          ],
                          [
                            "เวลาหยุดเครื่องกะทันหัน (Line Downtime)",
                            "< 120 นาที/เดือน",
                            "35 นาที [ผ่านเกณฑ์]",
                          ],
                          [
                            "อัตราของเสียผลิตภัณฑ์ปลายทาง (Defect Rate)",
                            "< 0.05%",
                            "0.02% [ดีเยี่ยม]",
                          ],
                        ],
                      });
                      setNewDoc((prev) => ({
                        ...prev,
                        title:
                          "FM-PRD-023 แบบบันทึกตรวจสอบและควบคุมเศษสูญเสียประจำกะ",
                        fileType: "Excel",
                        type: "FORM",
                      }));
                    }}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold px-2 py-1 rounded text-[9px] cursor-pointer border border-emerald-200"
                  >
                    📊 จำลองข้อมูล Excel
                  </button>
                </div>
              </div>

              {/* Button Group */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  id="btn-cancel-upload"
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg cursor-pointer transition"
                >
                  ยกเลิก
                </button>
                <button
                  id="btn-confirm-upload"
                  type="submit"
                  disabled={isUploadingFile}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-lg cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploadingFile
                    ? "กำลังอัปโหลดไฟล์..."
                    : currentUser.role === "Admin"
                      ? "บันทึกและพับลิชเผยแพร่"
                      : "ส่งของเช็คเพื่อขออนุมัติใช้งาน"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN EDIT MODAL DIALOG */}
      {isEditOpen && editingDoc && (
        <div
          id="edit-dialog-box"
          className="fixed inset-0 z-50 bg-slate-900/60 overflow-y-auto flex items-start sm:items-center justify-center p-4 sm:p-6 md:p-10 backdrop-blur-2xs"
        >
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-[#e1ded5] my-auto">
            {/* Header */}
            <div className="bg-[#15329c] text-white px-5 py-3.5 flex items-center justify-between">
              <span className="font-bold text-xs uppercase">
                แก้ไขข้อมูลเอกสารมาตรฐาน (Admin Edit Mode)
              </span>
              <button
                id="close-edit-modal-btn"
                onClick={() => setIsEditOpen(false)}
                className="text-white hover:opacity-85 cursor-pointer font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form
              id="form-edit-sop-wi"
              onSubmit={handleEditSubmit}
              className="p-5 space-y-4 text-xs"
            >
              <div className="grid grid-cols-2 gap-4">
                {/* Type */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">
                    หมวดหมู่เอกสาร:
                  </label>
                  <select
                    id="edit-doc-type"
                    value={editingDoc.type}
                    onChange={(e) =>
                      setEditingDoc({
                        ...editingDoc,
                        type: e.target.value as DocType,
                      })
                    }
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-700 text-xs"
                  >
                    <option value="QP">QP (Quality Procedure)</option>
                    <option value="WI">WI (Work Instruction)</option>
                    <option value="FORM">FORM (แบบฟอร์มตรวจสอบจริง)</option>
                  </select>
                </div>

                {/* Department */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">
                    แผนกเจ้าของงาน:
                  </label>
                  <select
                    id="edit-doc-dept"
                    value={editingDoc?.departmentId || ""}
                    onChange={(e) =>
                      setEditingDoc({
                        ...editingDoc,
                        departmentId: e.target.value,
                      })
                    }
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-700 text-xs"
                  >
                    {getAllDepartmentsFlat().map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name} ({dept.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Title */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">
                  ชื่อเอกสารมาตรฐาน:
                </label>
                <input
                  id="edit-doc-title"
                  type="text"
                  value={editingDoc.title}
                  onChange={(e) =>
                    setEditingDoc({ ...editingDoc, title: e.target.value })
                  }
                  required
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-[#15329c] focus:outline-none"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-600 block">
                  สรุปใจความสำคัญ / เพื่อลดการสูญเสียความรู้:
                </label>
                <textarea
                  id="edit-doc-desc"
                  rows={3}
                  value={editingDoc.description}
                  onChange={(e) =>
                    setEditingDoc({
                      ...editingDoc,
                      description: e.target.value,
                    })
                  }
                  required
                  className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-[#15329c] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Revision */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">
                    Revision (รอบการแก้ล่าสุด):
                  </label>
                  <input
                    id="edit-doc-rev"
                    type="number"
                    min={1}
                    value={editingDoc.revision}
                    onChange={(e) =>
                      setEditingDoc({
                        ...editingDoc,
                        revision: Number(e.target.value),
                      })
                    }
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-800 text-xs"
                  />
                </div>

                {/* File Type */}
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 block">
                    ชนิดไฟล์หลักฐาน:
                  </label>
                  <select
                    id="edit-doc-filetype"
                    value={editingDoc.fileType}
                    onChange={(e) =>
                      setEditingDoc({
                        ...editingDoc,
                        fileType: e.target.value as any,
                      })
                    }
                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-slate-700 text-xs"
                  >
                    <option value="PDF">PDF (เอกสารสกรีน)</option>
                    <option value="Excel">Excel (แบบคำนวณชีต)</option>
                    <option value="Word">Word (รายงานแก้ใย)</option>
                    <option value="Video">
                      Video Training (สื่อวิดีโอสาธิต)
                    </option>
                  </select>
                </div>
              </div>

              {/* Advanced option: WI Example or Form input */}
              <div className="border border-slate-150 bg-slate-50 p-3 rounded-lg space-y-2">
                <span className="block font-bold text-[#15329c] text-[10px]">
                  ⚙️ ตรวจสอบแก้ไขตัวอย่างการปฏิบัติงาน (Audit Evidence & Media)
                </span>

                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block">
                      ขัั้นตอนสั้นๆ สาธิตการปฏิบัติงาน:
                    </label>
                    <textarea
                      id="edit-doc-exampletext"
                      rows={2}
                      value={editingDoc.exampleText || ""}
                      onChange={(e) =>
                        setEditingDoc({
                          ...editingDoc,
                          exampleText: e.target.value,
                        })
                      }
                      className="w-full bg-white border border-slate-200 p-1.5 rounded text-[10px]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 block font-mono">
                        รูปภาพสาธิต (URL):
                      </label>
                      <input
                        id="edit-doc-exampleimage"
                        type="text"
                        value={editingDoc.exampleImage || ""}
                        onChange={(e) =>
                          setEditingDoc({
                            ...editingDoc,
                            exampleImage: e.target.value,
                          })
                        }
                        className="w-full bg-white border border-slate-200 p-1 text-[9px]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block font-mono">
                        วิดีโอสาธิต (URL .mp4):
                      </label>
                      <input
                        id="edit-doc-examplevideo"
                        type="text"
                        value={editingDoc.exampleVideo || ""}
                        onChange={(e) =>
                          setEditingDoc({
                            ...editingDoc,
                            exampleVideo: e.target.value,
                          })
                        }
                        className="w-full bg-white border border-slate-200 p-1 text-[9px]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Button Group */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  id="btn-cancel-edit"
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg cursor-pointer transition"
                >
                  ยกเลิก
                </button>
                <button
                  id="btn-confirm-edit"
                  type="submit"
                  className="bg-[#15329c] hover:bg-[#11297e] text-white font-bold px-5 py-2 rounded-lg cursor-pointer transition"
                >
                  บันทึกการปรับปรุงข้อมูล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECURE PORTAL VIEWER MODAL (Confidential and Secure portal) */}
      {isSecureViewerOpen && selectedDoc && (
        <div
          id="secure-viewer-modal"
          className="fixed inset-0 z-50 bg-slate-900/85 flex items-center justify-center p-4 backdrop-blur-md select-none"
        >
          <div className="bg-slate-900 rounded-2xl w-full max-w-6xl h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-700">
            {/* Header / Security Control Panel */}
            <div className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-600/20 text-rose-500 rounded-xl border border-rose-500/30">
                  <Lock className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-rose-500 font-mono bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                      SECURE PORTAL
                    </span>
                    <span className="text-slate-400 font-mono text-[10px]">
                      IP-AUTH: APPROVED • SYSTEM-LOGGED
                    </span>
                  </div>
                  <h3 className="text-white font-bold text-sm truncate max-w-xs md:max-w-md">
                    {selectedDoc.title}
                  </h3>
                </div>
              </div>

              {/* Security Alerts Banner */}
              {securityNotice && (
                <div className="bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold px-3 py-1.5 rounded-lg text-[10px] animate-bounce shrink-0 max-w-sm">
                  {securityNotice}
                </div>
              )}

              {/* Viewer Control Actions */}
              <div className="flex items-center gap-4 text-xs">
                {/* Zoom Controls */}
                <div className="bg-slate-800 rounded-lg p-1 flex items-center gap-2 border border-slate-700">
                  <button
                    type="button"
                    onClick={() =>
                      setSecureViewerZoom((prev) => Math.max(50, prev - 10))
                    }
                    className="p-1 hover:bg-slate-700 text-slate-300 rounded transition"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-slate-300 font-mono text-[10px] font-semibold w-10 text-center">
                    {secureViewerZoom}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSecureViewerZoom((prev) => Math.min(150, prev + 10))
                    }
                    className="p-1 hover:bg-slate-700 text-slate-300 rounded transition"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setIsSecureViewerOpen(false)}
                  className="bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white p-2 rounded-xl transition cursor-pointer border border-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Viewer Workspace */}
            <div className="flex-1 flex overflow-hidden bg-slate-950">
              {/* Left Column: Security Audit Trail & Details */}
              <div className="w-64 border-r border-slate-800 bg-slate-900 p-5 space-y-4 overflow-y-auto hidden md:block text-slate-300 text-[11px] leading-relaxed">
                <div>
                  <span className="block text-[9px] uppercase font-bold tracking-wider text-slate-500 mb-1">
                    ประเภทการควบคุมความปลอดภัย
                  </span>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-500" />
                    <div>
                      <span className="block font-bold text-amber-400 text-[10px]">
                        เอกสาร QP ห้ามปริ้น
                      </span>
                      <span className="text-[9px] text-slate-500">
                        บันทึกประวัติการเข้าใช้งานเครื่อง
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <span className="block text-[9px] uppercase font-bold tracking-wider text-slate-500">
                    ข้อมูลควบคุมเอกสาร
                  </span>
                  <div className="space-y-1.5 font-sans">
                    <div className="flex justify-between">
                      <span className="text-slate-500">รหัสเอกสาร:</span>
                      <span className="font-mono text-white font-semibold">
                        {selectedDoc.title.split(" ")[0] || "ไม่ระบุรหัส"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">เวอร์ชันล่าสุด:</span>
                      <span className="text-white font-mono">
                        Rev.{selectedDoc.revision}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">แผนกควบคุม:</span>
                      <span className="text-white">
                        {
                          (
                            getDepartmentById(selectedDoc.departmentId)?.name ||
                            selectedDoc.departmentId ||
                            ""
                          ).split(" (")[0]
                        }
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">วันที่บังคับใช้:</span>
                      <span className="text-white font-mono">
                        {selectedDoc.effectiveDate}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">ผู้รับผิดชอบหลัก:</span>
                      <span className="text-white">{selectedDoc.owner}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <span className="block text-[9px] uppercase font-bold tracking-wider text-slate-500">
                    ความปลอดภัยของระบบ
                  </span>
                  <ul className="space-y-1.5 text-slate-400 pl-3.5 list-disc text-[10.5px]">
                    <li>ระบบล็อกสิทธิ์การกดคลิกขวา (Context Menu)</li>
                    <li>บล็อกการพิมพ์ออกทางพอร์ตเครื่องพิมพ์</li>
                    <li>ลายน้ำสลักข้อมูลบัญชีเข้าใช้: {currentUser.name}</li>
                    <li>สิทธิ์ใช้งานสิ้นสุดเมื่อปิดหน้าต่างเบราว์เซอร์นี้</li>
                  </ul>
                </div>

                <div className="pt-2 border-t border-slate-800 text-[9px] text-slate-500 font-mono space-y-1">
                  <div>USER: {currentUser.email}</div>
                  <div>DEVICE: SECURE PORTAL CONTROLLER V3</div>
                  <div>TIMESTAMP: {new Date().toISOString()}</div>
                </div>
              </div>

              {/* Main Document Content Area */}
              <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Main Content Pane */}
                <div className="flex-1 overflow-auto p-8 flex justify-center items-start bg-slate-900/60 pattern-grid">
                  {/* Document Container */}
                  <div
                    className="bg-white text-slate-900 shadow-2xl rounded-lg p-10 relative transition-transform duration-100 ease-out origin-top text-left max-w-4xl w-full select-none min-h-[750px] overflow-hidden"
                    style={{ transform: `scale(${secureViewerZoom / 100})` }}
                  >
                    {/* Watermark Overlay (Anti-screenshot & Copy prevention) - Placed inside the white container so it's visible (Only for non-Admin roles) */}
                    {currentUser.role !== "Admin" && (
                      <div className="absolute inset-0 pointer-events-none overflow-hidden flex flex-wrap gap-x-14 gap-y-20 justify-center items-center opacity-[0.06] select-none z-10">
                        {Array.from({ length: 24 }).map((_, i) => (
                          <div
                            key={i}
                            className="text-slate-600 text-[11px] font-mono tracking-wider font-bold whitespace-nowrap uppercase"
                            style={{
                              transform: "rotate(-25deg)",
                              transformOrigin: "center",
                            }}
                          >
                            RMP ISO SECURITY • {currentUser.name} (
                            {currentUser.role}) • DO NOT COPY
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Header border design */}
                    <div className="border-b-2 border-slate-800 pb-4 mb-6 flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-900 text-white font-bold text-[9px] px-1.5 py-0.5 rounded font-mono">
                            RMP SYSTEM
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono font-bold uppercase">
                            Quality Control Portal
                          </span>
                        </div>
                        <h1 className="text-sm md:text-base font-extrabold text-slate-900 mt-1 uppercase tracking-tight">
                          {selectedDoc.title}
                        </h1>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="block font-mono font-bold text-xs text-slate-800">
                          {selectedDoc.title.split(" ")[0] || "ไม่ระบุรหัส"}
                        </span>
                        <span className="block text-[9px] text-slate-400 font-mono">
                          Rev. {selectedDoc.revision}
                        </span>
                      </div>
                    </div>

                    {/* RENDER CONTENT BY FILETYPE */}

                    {/* TYPE 1: REAL UPLOADED EXCEL GRID OR MOCK SPREADSHEET */}
                    {selectedDoc.fileType === "Excel" ? (
                      <div className="space-y-4">
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 p-3 rounded-lg flex items-center justify-between">
                          <div>
                            <span className="block font-bold text-[11px]">
                              📊 ระบบแสดงตารางตรวจสอบ (Spreadsheet Matrix View)
                            </span>
                            <span className="text-[10px] text-emerald-700">
                              ประมวลผลข้อมูลชีตอัจฉริยะแบบเรียลไทม์
                            </span>
                          </div>
                          <span className="bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded font-mono">
                            SheetJS Live
                          </span>
                        </div>

                        {selectedDoc.parsedExcelSheets ? (
                          // Real Parsed Excel Grid
                          <div className="space-y-3">
                            {/* Sheet Selection Tab bar */}
                            {Object.keys(selectedDoc.parsedExcelSheets).length >
                              1 && (
                              <div className="flex border-b border-slate-200 bg-slate-50 rounded-t-lg overflow-x-auto">
                                {Object.keys(selectedDoc.parsedExcelSheets).map(
                                  (sheetName) => (
                                    <button
                                      key={sheetName}
                                      type="button"
                                      onClick={() =>
                                        setActiveExcelSheet(sheetName)
                                      }
                                      className={`px-4 py-2 text-xs font-bold whitespace-nowrap transition-colors border-r border-slate-200 ${
                                        (activeExcelSheet ||
                                          Object.keys(
                                            selectedDoc.parsedExcelSheets!,
                                          )[0]) === sheetName
                                          ? "bg-white text-emerald-700 border-t-2 border-t-emerald-600"
                                          : "text-slate-600 hover:bg-slate-100"
                                      }`}
                                    >
                                      📁 {sheetName}
                                    </button>
                                  ),
                                )}
                              </div>
                            )}

                            {/* Spreadsheet Table */}
                            <div className="overflow-auto max-h-[480px] border border-slate-200 rounded-lg bg-white shadow-inner">
                              <table className="min-w-full text-left border-collapse text-[11px] font-sans">
                                <thead>
                                  <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700">
                                    <th className="p-2 border-r border-slate-200 text-center font-mono w-10 text-slate-400 bg-slate-200">
                                      #
                                    </th>
                                    {selectedDoc.parsedExcelSheets[
                                      activeExcelSheet ||
                                        Object.keys(
                                          selectedDoc.parsedExcelSheets,
                                        )[0]
                                    ]?.[0]?.map((cell: any, idx: number) => (
                                      <th
                                        key={idx}
                                        className="p-2 border-r border-slate-200 font-bold bg-slate-50 uppercase tracking-wider text-slate-800"
                                      >
                                        {String(cell || "")}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedDoc.parsedExcelSheets[
                                    activeExcelSheet ||
                                      Object.keys(
                                        selectedDoc.parsedExcelSheets,
                                      )[0]
                                  ]
                                    ?.slice(1)
                                    .map((row: any[], rowIdx: number) => (
                                      <tr
                                        key={rowIdx}
                                        className={`${rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-emerald-50/20 border-b border-slate-200`}
                                      >
                                        <td className="p-2 border-r border-slate-200 text-center font-mono bg-slate-50/60 font-semibold text-slate-400">
                                          {rowIdx + 1}
                                        </td>
                                        {row.map(
                                          (cell: any, cellIdx: number) => (
                                            <td
                                              key={cellIdx}
                                              className="p-2 border-r border-slate-200 text-slate-800 break-words max-w-xs font-normal"
                                            >
                                              {String(
                                                cell !== undefined &&
                                                  cell !== null
                                                  ? cell
                                                  : "",
                                              )}
                                            </td>
                                          ),
                                        )}
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          // Fallback Mock Spreadsheet Grid for pre-loaded Excel documents
                          <div className="space-y-3">
                            <div className="overflow-auto border border-slate-200 rounded-lg bg-white">
                              <table className="min-w-full text-left border-collapse text-[11px]">
                                <thead>
                                  <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700 font-sans">
                                    <th className="p-2 border-r border-slate-200 text-center w-10 text-slate-400">
                                      #
                                    </th>
                                    <th className="p-2 border-r border-slate-200 bg-slate-50">
                                      พารามิเตอร์ตรวจจับ (Parameter)
                                    </th>
                                    <th className="p-2 border-r border-slate-200 bg-slate-50">
                                      เกณฑ์มาตรฐานการรับรอง (Standard Spec)
                                    </th>
                                    <th className="p-2 border-r border-slate-200 bg-slate-50 font-mono">
                                      SOP No.
                                    </th>
                                    <th className="p-2 bg-slate-50">
                                      สถานะที่พบ
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="font-sans">
                                  <tr className="border-b border-slate-200 bg-white">
                                    <td className="p-2 border-r border-slate-200 text-center font-mono text-slate-400">
                                      1
                                    </td>
                                    <td className="p-2 border-r border-slate-200 font-bold">
                                      อัตราความร้อนหม้อต้ม Slitter
                                    </td>
                                    <td className="p-2 border-r border-slate-200">
                                      180 °C - 200 °C (คลาดเคลื่อนไม่เกิน 2%)
                                    </td>
                                    <td className="p-2 border-r border-slate-200 font-mono">
                                      SOP-SL-004
                                    </td>
                                    <td className="p-2">
                                      <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded">
                                        NORMAL
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="border-b border-slate-200 bg-slate-50/50">
                                    <td className="p-2 border-r border-slate-200 text-center font-mono text-slate-400">
                                      2
                                    </td>
                                    <td className="p-2 border-r border-slate-200 font-bold">
                                      แรงดึงรอยซีลห่อเวชภัณฑ์
                                    </td>
                                    <td className="p-2 border-r border-slate-200">
                                      &gt;= 45 N/15mm (ดึงเฉลี่ย 3 ครั้ง)
                                    </td>
                                    <td className="p-2 border-r border-slate-200 font-mono">
                                      SOP-SL-005
                                    </td>
                                    <td className="p-2">
                                      <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded">
                                        NORMAL
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="border-b border-slate-200 bg-white">
                                    <td className="p-2 border-r border-slate-200 text-center font-mono text-slate-400">
                                      3
                                    </td>
                                    <td className="p-2 border-r border-slate-200 font-bold">
                                      แรงกดอัดฟิล์มสลิตเตอร์
                                    </td>
                                    <td className="p-2 border-r border-slate-200">
                                      190 - 210 Bar
                                    </td>
                                    <td className="p-2 border-r border-slate-200 font-mono">
                                      SOP-SL-006
                                    </td>
                                    <td className="p-2">
                                      <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded">
                                        NORMAL
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="border-b border-slate-200 bg-slate-50/50">
                                    <td className="p-2 border-r border-slate-200 text-center font-mono text-slate-400">
                                      4
                                    </td>
                                    <td className="p-2 border-r border-slate-200 font-bold">
                                      สเกลตรวจสอบเศษฟิล์มหลงเหลือ
                                    </td>
                                    <td className="p-2 border-r border-slate-200">
                                      0% (ห้ามพบคราบไขหรือสิ่งสกปรก)
                                    </td>
                                    <td className="p-2 border-r border-slate-200 font-mono">
                                      SOP-SL-007
                                    </td>
                                    <td className="p-2">
                                      <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded">
                                        NORMAL
                                      </span>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <p className="text-[10px] text-slate-400 italic text-center">
                              💡 เคล็ดลับ: ลากและวางไฟล์ .xlsx
                              ของท่านจริงในหัวข้อสร้างใหม่
                              เพื่อแสดงข้อมูลชีตจริงแบบโต้ตอบได้สมบูรณ์แบบ
                            </p>
                          </div>
                        )}
                      </div>
                    ) : selectedDoc.fileType === "Video" ? (
                      // TYPE 2: REAL UPLOADED VIDEO OR PRELOADED MP4 VIDEO
                      <div className="space-y-4 text-center">
                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-left flex items-center justify-between">
                          <div>
                            <span className="block font-bold text-[11px]">
                              🎬 สื่อวิดีโอสาธิตทักษะปฏิบัติงาน (Training Video
                              Player)
                            </span>
                            <span className="text-[10px] text-slate-500">
                              ใช้เป็นหลักสูตรการปฏิบัติหน้างานเพื่อให้ได้พารามิเตอร์ที่ต้องการ
                            </span>
                          </div>
                          <span className="bg-indigo-600 text-white text-[9px] font-bold px-2 py-0.5 rounded font-mono">
                            VIDEO SOURCE ACTIVE
                          </span>
                        </div>

                        {selectedDoc.realFileUrl || selectedDoc.exampleVideo ? (
                          <div className="rounded-xl overflow-hidden border border-slate-300 bg-slate-950 shadow-lg max-w-2xl mx-auto">
                            <video
                              key={
                                selectedDoc.realFileUrl ||
                                selectedDoc.exampleVideo
                              }
                              controls
                              autoPlay
                              className="w-full max-h-[420px]"
                              referrerPolicy="no-referrer"
                            >
                              <source
                                src={
                                  selectedDoc.realFileUrl ||
                                  selectedDoc.exampleVideo
                                }
                                type="video/mp4"
                              />
                              เบราว์เซอร์นี้ไม่รองรับแท็กวิดีโอ
                            </video>
                          </div>
                        ) : (
                          <div className="p-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 max-w-md mx-auto space-y-3">
                            <Film className="w-12 h-12 text-slate-300 mx-auto" />
                            <h4 className="font-bold text-slate-700 text-xs">
                              ยังไม่ได้แนบไฟล์วิดีโอจริงสำหรับเอกสารนี้
                            </h4>
                            <p className="text-[10px] text-slate-400">
                              ท่านสามารถแก้ไขหรืออัพโหลดไฟล์ .MP4
                              เข้ามาในระบบควบคุมเอกสารเพื่อเล่นสตรีมวิดีโอฝึกสอนความปลอดภัยได้จริง
                            </p>
                          </div>
                        )}
                      </div>
                    ) : selectedDoc.realFileUrl ? (
                      // TYPE 3: REAL UPLOADED PDF FILE
                      <div className="space-y-4">
                        <div className="bg-indigo-50 border border-indigo-200 text-indigo-950 p-3 rounded-lg flex items-center justify-between">
                          <div>
                            <span className="block font-bold text-[11px]">
                              📄 แสดงเอกสารสิทธิ์ PDF สำเร็จ (Natively Rendered
                              Document)
                            </span>
                            <span className="text-[10px] text-indigo-700">
                              เปิดอ่านผ่านระบบเบราว์เซอร์ภายใน ปลอดภัยตามมาตรฐาน
                              ISO ของโรงงาน
                            </span>
                          </div>
                          <span className="bg-indigo-600 text-white text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase">
                            Secure Viewer
                          </span>
                        </div>

                        <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-100 shadow-inner h-[500px]">
                          <iframe
                            src={selectedDoc.realFileUrl}
                            className="w-full h-full border-0"
                            title="PDF Secure Preview"
                          />
                        </div>
                      </div>
                    ) : (
                      // TYPE 4: NO REAL FILE ATTACHED — empty state
                      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                        <FileText className="w-14 h-14 text-slate-300" />
                        <h4 className="font-bold text-slate-700 text-sm">
                          เอกสารนี้ยังไม่มีไฟล์จริงแนบอยู่ในระบบ
                        </h4>
                        <p className="text-slate-400 text-xs max-w-sm">
                          กรุณาแนบไฟล์ PDF ต้นฉบับผ่านหน้าแก้ไขเอกสาร (Admin
                          Edit Mode) เพื่อให้ระบบแสดงเนื้อหาจริงในหน้าต่างนี้ได้
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Controls (Pagination & PDF Watermark details) */}
                {selectedDoc.fileType !== "Excel" &&
                  selectedDoc.fileType !== "Video" &&
                  !selectedDoc.realFileUrl && (
                    <div className="bg-slate-950 border-t border-slate-800 px-6 py-3 flex items-center justify-between text-xs text-slate-400 shrink-0">
                      <span className="font-mono text-[10px]">
                        WATERMARK: {currentUser.name} ({currentUser.email})
                      </span>
                      <span className="text-[10px] text-slate-500">
                        บริษัท รอแยล เมอิวะ แพ็คซ์ จำกัด
                      </span>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
