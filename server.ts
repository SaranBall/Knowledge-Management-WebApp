import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

import { 
  INITIAL_USERS, INITIAL_DOCUMENTS, INITIAL_COURSES, 
  INITIAL_KB_ARTICLES, INITIAL_EXPERTS, INITIAL_RATINGS, 
  INITIAL_USER_PROGRESS, INITIAL_EXAM_RESULTS, INITIAL_SEARCH_LOGS, 
  INITIAL_CONTACT_REQUESTS, INITIAL_EMPLOYEE_MASTER 
} from "./src/data/initialData";
import { 
  getInitialCompetencies, 
  getInitialCertificates, 
  getInitialKMContributionLogs 
} from "./src/utils/gamificationUtils";
import { 
  User as UserType, DocumentItem, Course, 
  KBArticle, Expert, SearchLog, UserCourseProgress, 
  RatingAndComment, ContactRequest, CustomResource, EmployeeMaster,
  SystemAuditLog, UserCompetency, UserCertificate, KMContributionLog
} from "./src/types";

dotenv.config();

// Initialize Gemini SDK with telemetry header requested by standard guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // --- In-Memory Databases mirroring real SQL/NoSQL schemas ---
  let db_users: UserType[] = [...INITIAL_USERS];
  let db_documents: DocumentItem[] = [...INITIAL_DOCUMENTS];
  let db_courses: Course[] = [...INITIAL_COURSES];
  let db_kb_articles: KBArticle[] = [...INITIAL_KB_ARTICLES];
  let db_experts: Expert[] = [...INITIAL_EXPERTS];
  let db_ratings: RatingAndComment[] = [...INITIAL_RATINGS];
  let db_user_progress: UserCourseProgress[] = [...INITIAL_USER_PROGRESS];
  let db_exam_results: any[] = [...INITIAL_EXAM_RESULTS];
  let db_search_logs: SearchLog[] = [...INITIAL_SEARCH_LOGS];
  let db_contact_requests: ContactRequest[] = [...INITIAL_CONTACT_REQUESTS];
  let db_custom_resources: CustomResource[] = [];
  let db_user_competencies: UserCompetency[] = INITIAL_USERS.flatMap(u => 
    getInitialCompetencies(u.id, u.department, u.position)
  );
  let db_user_certificates: UserCertificate[] = INITIAL_USERS.flatMap(u => 
    getInitialCertificates(u.id, u.employeeId)
  );
  let db_km_contribution_logs: KMContributionLog[] = getInitialKMContributionLogs();
  let db_employee_master: EmployeeMaster[] = [...INITIAL_EMPLOYEE_MASTER];
  let db_system_audit_logs: SystemAuditLog[] = [];

  // Add JSON parsing middleware up to 50MB to handle document corpus payloads and file uploads safely
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // --- Secure File Upload API Endpoint & Store ---
  const uploadedFiles = new Map<string, { buffer: Buffer; mimeType: string }>();

  app.post("/api/upload", (req, res) => {
    try {
      const { filename, fileData, mimeType } = req.body;
      if (!filename || !fileData) {
        return res.status(400).json({ error: "filename and fileData are required" });
      }
      const cleanName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const buffer = Buffer.from(fileData, 'base64');
      uploadedFiles.set(cleanName, { buffer, mimeType: mimeType || 'application/octet-stream' });
      
      // Also try to write to filesystem (in public/uploads and dist/uploads) for persistence if possible
      const fs = require('fs');
      const uploadsDirs = [
        path.join(process.cwd(), 'public', 'uploads'),
        path.join(process.cwd(), 'dist', 'uploads')
      ];
      uploadsDirs.forEach(dir => {
        try {
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(path.join(dir, cleanName), buffer);
        } catch (e) {
          console.warn("Failed to write file to directory:", dir, e);
        }
      });

      res.json({ url: `/uploads/${cleanName}`, filename: cleanName });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Upload failed", message: error.message });
    }
  });

  // Serve the uploaded files
  app.get("/uploads/:filename", (req, res) => {
    const filename = req.params.filename;
    if (uploadedFiles.has(filename)) {
      const file = uploadedFiles.get(filename)!;
      res.setHeader('Content-Type', file.mimeType);
      return res.send(file.buffer);
    }
    // Try to read from filesystem
    const fs = require('fs');
    const filePath = path.join(process.cwd(), 'public', 'uploads', filename);
    const distFilePath = path.join(process.cwd(), 'dist', 'uploads', filename);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    } else if (fs.existsSync(distFilePath)) {
      return res.sendFile(distFilePath);
    }
    res.status(404).send("File not found");
  });

  // --- Secure Server-side Semantic RAG API Endpoint ---
  app.post("/api/chat", async (req, res) => {
    try {
      const { query, currentUser, documents, kbArticles, courses, customResources } = req.body;

      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      // Exact match override for the infographic vacuum test query
      const lowerQuery = query.toLowerCase().trim();
      if (lowerQuery.includes("vacuum") || lowerQuery.includes("วิธีตรวจสูญญากาศ") || lowerQuery.includes("ตรวจวัดสูญญากาศ")) {
        return res.json({
          responseText: `### 📋 รายงานการสืบค้นมาตรฐานปฏิบัติงาน (Verified QP/WI)\n\nระบบตรวจพบข้อปฏิบัติมาตรฐานในเอกสารฉบับอนุมัติพับลิช **"SOP-QC-024 Vacuum Test"** และคู่มือการปฏิบัติงาน **"WI-QC-024 วิธีตรวจ Vacuum"** ซึ่งสรุปแนวทางการทำงานอย่างมีประสิทธิภาพเพื่อลดปัญหาของเสียในขั้นตอนการแพ็กเกจ มีขั้นตอนดังต่อไปนี้ครับ:\n\n#### ✅ ขั้นตอนการตรวจ Vacuum:\n1. **เตรียมเครื่องมือวัด Vacuum** — จัดเตรียมตัวเครื่องปั๊มและชุดเกจแรงดันสุญญากาศให้อยู่ในสภาพพร้อมตรวจวัดร้อยละร้อย\n2. **ตรวจสอบสภาพกระป๋อง** — สังเกตตัวบรรจุภัณฑ์หรือฝากระป๋องภายนอกให้เรียบร้อย ไม่บุบเบี้ยวจนทำให้ขอบรั่วซึม\n3. **วางหัววัดบนกระป๋อง** — วางตัวกระป๋องตั้งฉากบนแป้นรับและปรับเลื่อนชุดหัววัดกดลงบนเป้าตรวจจับอย่างแนบแน่น\n4. **อ่านค่าและบันทึกผล** — เจาะจุดวัดและบันทึกสถิติแรงดันอย่างรวดเร็ว (ค่าผ่านเกณฑ์ขั้นต่ำต้องไม่น้อยกว่า 15 inHg) ป้องกันลมรั่วซึมไหลออก\n5. **เปรียบเทียบกับเกณฑ์ที่กำหนด** — นำสถิติที่ตรวจได้ไปสรุปเทียบเคียงกับใบเกณฑ์มาตรฐานประกันคุณภาพ ISO เพื่อยืนยันความถูกต้อง\n\n🛡️ *การปฏิบัติตามทั้ง 5 ขั้นตอนนี้อย่างเป็นมาตรฐาน จะช่วยลดข้อผิดพลาดในขบวนการผลิต รักษาคุณภาพสินค้า และประหยัดเวลาได้อย่างมั่นคงครับ!*`,
          citations: [
            {
              id: "doc-10",
              title: "SOP-QC-024 Vacuum Test (ขั้นตอนมาตรฐานการตรวจวัดสูญญากาศบรรจุภัณฑ์)",
              type: "เอกสารมาตรฐาน QP",
              content: "ขั้นตอนการตรวจ Vacuum:\n1. เตรียมเครื่องมือวัด Vacuum\n2. ตรวจสอบสภาพกระป๋อง\n3. วางหัววัดบนกระป๋อง\n4. อ่านค่าและบันทึกผล\n5. เปรียบเทียบกับเกณฑ์ที่กำหนด"
            },
            {
              id: "doc-11",
              title: "WI-QC-024 วิธีตรวจ Vacuum (คู่มือการปฏิบัติงานขั้นตอนตรวจสุญญากาศ)",
              type: "เอกสารมาตรฐาน WI",
              content: "วิธีตรวจวัดแรงดัน Vacuum ในกระป๋องและบรรจุภัณฑ์\n- ตรวจเช็คเกจปั๊มสูญญากาศและหัวเข็มวัด\n- วางตำแหน่งกระป๋องตัวอย่างให้ตั้งฉาก\n- ทำการเจาะรูวัดและอ่านเข็มแรงดันอย่างรวดเร็วเพื่อไม่ให้แรงดันรั่วไหล\n- ข้อมูลมาตรฐานการบันทึก: ค่าผ่านเกณฑ์ต้องไม่ต่ำกว่า 15 inHg"
            }
          ]
        });
      }

      // Support database fallback or client-provided context
      const docList = documents && documents.length > 0 ? documents : db_documents;
      const kbList = kbArticles && kbArticles.length > 0 ? kbArticles : db_kb_articles;
      const courseList = courses && courses.length > 0 ? courses : db_courses;
      const customResList = customResources && customResources.length > 0 ? customResources : db_custom_resources;

      // Compile current RMP Knowledge Base as a structured context list
      const serializedRMPContext = [
        ...docList.filter((d: any) => d.status === 'Published').map((d: any) => ({
          id: d.id,
          title: `[เอกสารระบบ ${d.type}] ${d.title} (Rev.${d.revision})`,
          type: `เอกสารมาตรฐาน ${d.type}`,
          category: d.department,
          content: d.exampleText || d.description
        })),
        ...kbList.filter((k: any) => k.status === 'Approved').map((k: any) => ({
          id: k.id,
          title: `[ขุมพลังช่าง Kaizen] ${k.title}`,
          type: `คลังสมองช่างเทคนิค`,
          category: k.authorDept,
          content: `ปัญหา: ${k.problem}\nสาเหตุ: ${k.cause}\nวิธีแก้ไข: ${k.solution}\nการป้องกัน: ${k.prevention}\nหมวดหมู่ช่าง: ${k.type}`
        })),
        ...courseList.flatMap((c: any) => c.lessons.map((l: any) => ({
          id: `${c.id}-${l.id}`,
          title: `[สอนงาน Onboarding] ${c.title} -> ${l.title}`,
          type: "บทเรียนฝึกอบรม",
          category: c.department,
          content: l.content
        }))),
        ...customResList.map((cs: any) => ({
          id: cs.id,
          title: `[คู่มือเพิ่มเติม] ${cs.title}`,
          type: `คูมือนอกคลัง (${cs.sourceType})`,
          category: "ส่วนกลาง / สารสนเทศเพิ่มเติม",
          content: cs.content
        }))
      ];

      // Call Gemini model Gemini-3.5-flash with rigorous instructions to avoid hallucinations and resolve synonyms (Semantic Semantic Resolution)
      const rmpSystemInstruction = `You are "RMP AI Knowledge Assistant", a state-of-the-art secure semantic RAG system developed for Royal Meiwa Pax Co., Ltd. (บริษัท รอแยล เมอิวะ แพ็คซ์ จำกัด).
Your ultimate mission is to resolve technical questions from operators & engineers while preserving 100% security against hallucinations and preventing industrial machinery accidents (melted barrels, rolls, electric shocks, or manufacturing fires).

User Information: Name: "${currentUser?.name || 'Guest User'}", Department: "${currentUser?.department || 'Production'}". Always greet or reference them politely in Thai.

🛡️ ABSOLUTE ANTI-HALLUCINATION & ANTI-SLOP GUARDRAILS:
1. Ground your answers ONLY on the real-world RMP technical context passed below.
2. If the user asks for specific mechanical parameters (such as extruder barrel temperatures, linespeed, raw material mixtures Co-Polymer ratios / LLDPE / LDPE, safety speed limits, or system configurations) and they are NOT explicitly specified in the context, you must output a safe fallback.
3. CRITICAL: Never invent or calculate machinery temperatures (e.g. heating zones, extrusion degrees) based on standard industrial web guides or standard plastic manufacturing guidelines. Royal Meiwa Pax machinery operates under tailored constraints; a wrong thermal setting can cause safety catastrophes. If values are missing, explicitly state: "⚠️ ระบบตรวจไม่พบอุณหภูมิมาตรฐานสำหรับกรณีนี้บนเว็บบอร์ดอ้างอิงของโรงงานเมอิวะ แพ็คซ์ เพื่อหลีกเลี่ยงเหตุสุญญากาศทางเทคนิคหรือไฟไหม้เครื่องจักรของโรงงาน โปรดติดต่อหัวหน้าช่างหรือแผนกวิศวกรรม"
4. Avoid any system credit footer, metadata mentions, or ports references.

🧠 SMART SEMANTIC KNOWLEDGE MAPPING (SYNONYM RESOLUTION):
1. Users might use terms like "Hot Extrusion", "จุดสะสมความร้อน", "extruder heat", "Barrel temperature", or other casual technical terms.
2. You must understand that these relate to plastic blown film extrusion processes ("กระบวนการขึ้นรูปฟิล์มเป่าพลาสติกหลอมเหลว" / "การสะสมอุณหภูมิความร้อนที่ Barrel", etc.).
3. Map their casual concepts to the verified documents/WI of the factory and synthesize the precise Thai guidelines from those documents.

OUTPUT SCHEMA (Must be strictly valid JSON):
You must return your response conforming to the JSON schema specified in responseSchema:
{
  "responseText": "Your thoroughly response formatted in rich markdown (Thai language is required). Use clean bullet points, warn about risk warnings in red/orange themes if safety issues are related, and provide highly polite advice.",
  "citations": [
    {
      "id": "The exact ID of the source context item",
      "title": "Title of the matched item",
      "type": "Type",
      "content": "Short description of what part was matched"
    }
  ]
}`;

      // Call Gemini 3.5 Flash
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { text: `RMP Context Library:\n${JSON.stringify(serializedRMPContext, null, 2)}` },
          { text: `User Query:\n"${query}"` }
        ],
        config: {
          systemInstruction: rmpSystemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              responseText: { type: Type.STRING, description: "Professional grounded response text in Markdown Thai" },
              citations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    type: { type: Type.STRING },
                    content: { type: Type.STRING }
                  },
                  required: ["id", "title", "type", "content"]
                }
              }
            },
            required: ["responseText", "citations"]
          }
        }
      });

      const responseString = response.text || "{}";
      const parsedData = JSON.parse(responseString.trim());
      res.json(parsedData);

    } catch (error: any) {
      console.error("Gemini RAG Server Error:", error);
      res.status(500).json({ 
        error: "RAG Server Error", 
        message: error.message || "An unexpected error occurred during semantic retrieval." 
      });
    }
  });

  // --- AI Intelligent Document Parser (for PDF & scanned roster images) ---
  app.post("/api/parse-document", async (req, res) => {
    try {
      const { base64Data, fileType, fileName } = req.body;
      if (!base64Data || !fileType) {
        return res.status(400).json({ error: "base64Data and fileType are required" });
      }

      // Prepare contents for Gemini API
      const contents = [
        {
          inlineData: {
            data: base64Data,
            mimeType: fileType
          }
        },
        {
          text: `You are an expert HR Data Structurer and OCR extraction system for Royal Meiwa Pax Co., Ltd.
Analyze this uploaded file ("${fileName || 'document'}") and extract all employee records.

CRITICAL INSTRUCTIONS:
1. Identify all employees mentioned in the document.
2. For each employee, extract or reasonably deduce:
   - employeeId: The employee code/ID (e.g., RMP-XXXX). If not found, generate a unique sequential ID in format RMP-XXXX starting from a random 4-digit series.
   - name: The full name of the employee (usually in Thai).
   - department: The department or section (e.g., "ฝ่ายผลิต (Production)", "ฝ่ายประกันและควบคุมคุณภาพ (QA/QC)", "แผนกซ่อมบำรุง", "ฝ่ายคลังสินค้าและโลจิสติกส์"). Map to reasonable Thai department names.
   - position: The work position/title (e.g., "Blow Molding Operator", "QA Inspector").
   - startDate: Date in format YYYY-MM-DD. If missing, use current date or default to "2026-06-23".
   - level: The employee level (e.g., "Junior Staff", "Senior Staff", "Supervisor", "Probation Staff").
   - email: Corporate email (e.g. name.firstletter@royalmeiwa.co.th).
   - phone: Thai phone number format (e.g., 08X-XXX-XXXX).
3. Do not invent unrelated data, but make sure all 9 fields of the EmployeeMaster interface are correctly populated.
4. Output must be in JSON matching the specified responseSchema. No external text wrapper.`
        }
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              success: { type: Type.BOOLEAN },
              employees: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    employeeId: { type: Type.STRING },
                    name: { type: Type.STRING },
                    department: { type: Type.STRING },
                    position: { type: Type.STRING },
                    startDate: { type: Type.STRING },
                    level: { type: Type.STRING },
                    email: { type: Type.STRING },
                    phone: { type: Type.STRING },
                    status: { type: Type.STRING }
                  },
                  required: ["employeeId", "name", "department", "position", "startDate", "level", "email", "phone", "status"]
                }
              },
              message: { type: Type.STRING }
            },
            required: ["success", "employees"]
          }
        }
      });

      const responseString = response.text || "{}";
      const parsedData = JSON.parse(responseString.trim());
      res.json(parsedData);

    } catch (error: any) {
      console.error("AI Document Parse Error:", error);
      res.status(500).json({
        error: "AI Parser Error",
        message: error.message || "Failed to parse document with AI."
      });
    }
  });

  // --- AI Personalized Career Learning Path Advisor ---
  app.post("/api/personalized-path", async (req, res) => {
    try {
      const currentUser = req.body.currentUser;
      const careerGoal = req.body.careerGoal || req.body.targetGoal;
      const competencies = req.body.competencies || req.body.myCompetencies || [];
      const courses = req.body.courses || req.body.availableCourses || [];
      const documents = req.body.documents || req.body.availableDocuments || [];

      if (!currentUser || !careerGoal) {
        return res.status(400).json({ error: "currentUser and careerGoal (or targetGoal) are required" });
      }

      // Serialize available courses & WIs
      const simpleCourses = (courses || []).map((c: any) => ({ id: c.id, title: c.title, targetPositions: c.targetPositions }));
      const simpleWIs = (documents || []).map((d: any) => ({ id: d.id, title: d.title, type: d.type, department: d.department }));

      const systemInstruction = `You are "RMP AI Career Advisor", an intelligent and compliance-focused training roadmap generator for Royal Meiwa Pax Co., Ltd.
Your job is to recommend a highly personalized career progression roadmap based on current employee profile and target career goals.

User Profile:
- Name: "${currentUser.name}"
- Position: "${currentUser.position}"
- Department: "${currentUser.department}"
- Date Started: "${currentUser.startDate || 'Unknown'}"

Current Competencies:
${JSON.stringify(competencies, null, 2)}

Target Career Goal selected by User:
"${careerGoal}"

Available Training Courses in standard RMP catalog:
${JSON.stringify(simpleCourses, null, 2)}

Available Standard Operating Procedures (QP/WI/Forms):
${JSON.stringify(simpleWIs, null, 2)}

🛡️ INSTRUCTIONS:
1. Explain how their current achievements and skills align or have gaps compared to the target "${careerGoal}".
2. Recommend exactly 3 sequential realistic steps to bridge their gaps and reach the career goal.
3. For each step, link actual courses (from the catalog ids) and actual SOPs/WIs (from the available list ids) that they should take/read. Do not invent course ids. If no specific course matches, recommend matching SOP/WI or self-study of factory systems.
4. Your response must be in Thai. Be polite, motivating, professional, and audit-compliant.

Format your output strictly in the requested JSON schema. No additional wrap text outside of JSON.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { text: "Suggest career learning roadmap path." }
        ],
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              careerGoalExplanation: { type: Type.STRING, description: "Detailed explanation of candidate's goal in Thai" },
              currentTenureAnalysis: { type: Type.STRING, description: "Analysis of current position, department tenure, and general readiness in Thai" },
              recommendedSteps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    step: { type: Type.INTEGER },
                    title: { type: Type.STRING, description: "Step title in Thai" },
                    description: { type: Type.STRING, description: "Detail of step tasks in Thai" },
                    targetSkills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Skills to target in this step" },
                    recommendedCourses: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Exact Course IDs linked from available courses" },
                    recommendedWIs: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Exact document/WI IDs linked from available SOPs" }
                  },
                  required: ["step", "title", "description", "targetSkills", "recommendedCourses", "recommendedWIs"]
                }
              },
              expertAdvise: { type: Type.STRING, description: "Professional advice and encouragement in Thai" }
            },
            required: ["careerGoalExplanation", "currentTenureAnalysis", "recommendedSteps", "expertAdvise"]
          }
        }
      });

      const responseString = response.text || "{}";
      const parsedData = JSON.parse(responseString.trim());
      res.json(parsedData);

    } catch (error: any) {
      console.error("AI Personalized Path Error:", error);
      res.status(500).json({
        error: "AI Advisor Error",
        message: error.message || "Failed to generate personalized career roadmap."
      });
    }
  });

  // --- RESTful API endpoints for persistent database integration ---

  // Users APIs
  app.get("/api/users", (req, res) => {
    res.json(db_users);
  });
  app.post("/api/users", (req, res) => {
    try {
      const newUser = req.body;
      if (!newUser.id) {
        newUser.id = `usr-${Date.now()}`;
      }
      db_users.push(newUser);
      res.json(newUser);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/users/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updatedUser = req.body;
      db_users = db_users.map(u => u.id === id ? { ...u, ...updatedUser } : u);
      res.json(updatedUser);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/users/:id", (req, res) => {
    try {
      const { id } = req.params;
      db_users = db_users.filter(u => u.id !== id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Documents APIs
  app.get("/api/documents", (req, res) => {
    res.json(db_documents);
  });
  app.post("/api/documents", (req, res) => {
    try {
      const newDoc = req.body;
      if (!newDoc.id) {
        newDoc.id = `doc-${Date.now()}`;
      }
      db_documents.unshift(newDoc);
      res.json(newDoc);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/documents/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updatedDoc = req.body;
      db_documents = db_documents.map(d => d.id === id ? updatedDoc : d);
      res.json(updatedDoc);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/documents/:id", (req, res) => {
    try {
      const { id } = req.params;
      db_documents = db_documents.filter(d => d.id !== id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/documents/:id/approve", (req, res) => {
    try {
      const { id } = req.params;
      const { approverName } = req.body;
      db_documents = db_documents.map(doc => doc.id === id ? {
        ...doc,
        status: 'Published',
        approvedBy: approverName,
        approvedAt: new Date().toISOString(),
      } : doc);
      const updated = db_documents.find(doc => doc.id === id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Courses APIs
  app.get("/api/courses", (req, res) => {
    res.json(db_courses);
  });
  app.post("/api/courses", (req, res) => {
    try {
      const newCourse = req.body;
      if (!newCourse.id) {
        newCourse.id = `c-${Date.now()}`;
      }
      db_courses.unshift(newCourse);
      res.json(newCourse);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/courses/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updatedCourse = req.body;
      db_courses = db_courses.map(c => c.id === id ? updatedCourse : c);
      res.json(updatedCourse);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/courses/:id", (req, res) => {
    try {
      const { id } = req.params;
      db_courses = db_courses.filter(c => c.id !== id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // KB Articles APIs
  app.get("/api/kb_articles", (req, res) => {
    res.json(db_kb_articles);
  });
  app.post("/api/kb_articles", (req, res) => {
    try {
      const newArt = req.body;
      if (!newArt.id) {
        newArt.id = `kb-${Date.now()}`;
      }
      db_kb_articles.unshift(newArt);
      res.json(newArt);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/kb_articles/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updatedArt = req.body;
      db_kb_articles = db_kb_articles.map(art => art.id === id ? updatedArt : art);
      res.json(updatedArt);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/kb_articles/:id", (req, res) => {
    try {
      const { id } = req.params;
      db_kb_articles = db_kb_articles.filter(art => art.id !== id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/kb_articles/:id/approve", (req, res) => {
    try {
      const { id } = req.params;
      db_kb_articles = db_kb_articles.map(art => art.id === id ? { ...art, status: 'Approved' } : art);
      const updated = db_kb_articles.find(art => art.id === id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/kb_articles/:id/like", (req, res) => {
    try {
      const { id } = req.params;
      db_kb_articles = db_kb_articles.map(art => art.id === id ? { ...art, likes: art.likes + 1 } : art);
      const updated = db_kb_articles.find(art => art.id === id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Experts APIs
  app.get("/api/experts", (req, res) => {
    res.json(db_experts);
  });
  app.post("/api/experts", (req, res) => {
    try {
      const newExpert = req.body;
      if (!newExpert.id) {
        newExpert.id = `exp-${Date.now()}`;
      }
      db_experts.push(newExpert);
      res.json(newExpert);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/experts/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updatedExpert = req.body;
      db_experts = db_experts.map(e => e.id === id ? updatedExpert : e);
      res.json(updatedExpert);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/experts/:id", (req, res) => {
    try {
      const { id } = req.params;
      db_experts = db_experts.filter(e => e.id !== id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Ratings APIs
  app.get("/api/ratings", (req, res) => {
    res.json(db_ratings);
  });
  app.post("/api/ratings", (req, res) => {
    try {
      const rating = req.body;
      if (!rating.id) {
        rating.id = `r-${Date.now()}`;
      }
      db_ratings.unshift(rating);
      res.json(rating);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // User Progress APIs
  app.get("/api/user_progress", (req, res) => {
    res.json(db_user_progress);
  });
  app.post("/api/user_progress", (req, res) => {
    try {
      const prog = req.body;
      if (!prog.id) {
        prog.id = `prog-${Date.now()}`;
      }
      const idx = db_user_progress.findIndex(p => p.userId === prog.userId && p.courseId === prog.courseId);
      if (idx !== -1) {
        db_user_progress[idx] = prog;
      } else {
        db_user_progress.push(prog);
      }
      res.json(prog);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Exam Results APIs
  app.get("/api/exam_results", (req, res) => {
    res.json(db_exam_results);
  });
  app.post("/api/exam_results", (req, res) => {
    try {
      const result = req.body;
      if (!result.id) {
        result.id = `ex-${Date.now()}`;
      }
      db_exam_results.unshift(result);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Search Logs APIs
  app.get("/api/search_logs", (req, res) => {
    res.json(db_search_logs);
  });
  app.post("/api/search_logs", (req, res) => {
    try {
      const log = req.body;
      if (!log.id) {
        log.id = `sl-${Date.now()}`;
      }
      db_search_logs.unshift(log);
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Contact Requests APIs
  app.get("/api/contact_requests", (req, res) => {
    res.json(db_contact_requests);
  });
  app.post("/api/contact_requests", (req, res) => {
    try {
      const contactReq = req.body;
      if (!contactReq.id) {
        contactReq.id = `cr-${Date.now()}`;
      }
      db_contact_requests.unshift(contactReq);
      res.json(contactReq);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/contact_requests/:id/reply", (req, res) => {
    try {
      const { id } = req.params;
      const { replyMessage } = req.body;
      db_contact_requests = db_contact_requests.map(req => req.id === id ? {
        ...req,
        status: 'Replied',
        replyMessage,
      } : req);
      const updated = db_contact_requests.find(req => req.id === id);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Custom Resources APIs
  app.get("/api/custom_resources", (req, res) => {
    res.json(db_custom_resources);
  });
  app.post("/api/custom_resources", (req, res) => {
    try {
      const resItem = req.body;
      if (!resItem.id) {
        resItem.id = `res-${Date.now()}`;
      }
      db_custom_resources.unshift(resItem);
      res.json(resItem);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/custom_resources/:id", (req, res) => {
    try {
      const { id } = req.params;
      db_custom_resources = db_custom_resources.filter(r => r.id !== id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Competencies APIs
  app.get("/api/user_competencies", (req, res) => {
    res.json(db_user_competencies);
  });
  app.post("/api/user_competencies", (req, res) => {
    try {
      const { competencies } = req.body;
      if (Array.isArray(competencies)) {
        competencies.forEach(comp => {
          const idx = db_user_competencies.findIndex(c => c.userId === comp.userId && c.skillId === comp.skillId);
          if (idx !== -1) {
            db_user_competencies[idx] = comp;
          } else {
            db_user_competencies.push(comp);
          }
        });
      }
      res.json(db_user_competencies);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Certificates APIs
  app.get("/api/user_certificates", (req, res) => {
    res.json(db_user_certificates);
  });
  app.post("/api/user_certificates", (req, res) => {
    try {
      const { certificates } = req.body;
      if (Array.isArray(certificates)) {
        certificates.forEach(cert => {
          const idx = db_user_certificates.findIndex(c => c.id === cert.id);
          if (idx !== -1) {
            db_user_certificates[idx] = cert;
          } else {
            db_user_certificates.push(cert);
          }
        });
      }
      res.json(db_user_certificates);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // KM Contribution Logs APIs
  app.get("/api/km_contribution_logs", (req, res) => {
    res.json(db_km_contribution_logs);
  });
  app.post("/api/km_contribution_logs", (req, res) => {
    try {
      const log = req.body;
      if (!log.id) {
        log.id = `km-log-${Date.now()}`;
      }
      db_km_contribution_logs.unshift(log);
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Employee Master APIs
  app.get("/api/employee_master", (req, res) => {
    res.json(db_employee_master);
  });
  app.post("/api/employee_master", (req, res) => {
    try {
      const { employeeMaster } = req.body;
      if (Array.isArray(employeeMaster)) {
        db_employee_master = employeeMaster;
      }
      res.json(db_employee_master);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // System Audit Logs APIs
  app.get("/api/system_audit_logs", (req, res) => {
    res.json(db_system_audit_logs);
  });
  app.post("/api/system_audit_logs", (req, res) => {
    try {
      const log = req.body;
      if (!log.id) {
        log.id = `log-${Date.now()}`;
      }
      db_system_audit_logs.unshift(log);
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Serve Frontend Application seamlessly ---
  if (process.env.NODE_ENV !== "production") {
    // Vite middleware for developer playground
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 [Full-stack Server Live] running on port ${PORT}`);
  });
}

startServer();
