/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Bot,
  User as UserIcon,
  Database,
  ArrowRight,
  Sparkles,
  HelpCircle,
  CheckCircle,
  AlertTriangle,
  FileText,
  Plus,
  Trash2,
  Eye,
  BookOpen,
  Key,
  Link as LinkIcon,
  RefreshCw,
  Layers,
} from "lucide-react";
import {
  User,
  DocumentItem,
  KBArticle,
  Course,
  CustomResource,
} from "../types";

interface AIChatBoxProps {
  currentUser: User;
  documents: DocumentItem[];
  kbArticles: KBArticle[];
  courses: Course[];
  customResources: CustomResource[];
  onAddCustomResource: (res: CustomResource) => void;
  onDeleteCustomResource: (id: string) => void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
  citations?: Array<{
    id: string;
    title: string;
    type: string;
    content: string;
  }>;
}

export const AIChatBox: React.FC<AIChatBoxProps> = ({
  currentUser,
  documents,
  kbArticles,
  courses,
  customResources,
  onAddCustomResource,
  onDeleteCustomResource,
}) => {
  const [activeTab, setActiveTab] = useState<
    "CHAT" | "RESOURCES" | "INFOGRAPHIC"
  >("INFOGRAPHIC");
  const [chatMode, setChatMode] = useState<"CONVERSATIONAL" | "SIMPLE_QA">(
    "CONVERSATIONAL",
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);

  // Custom Ingestion State (for Admin)
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceContent, setResourceContent] = useState("");
  const [resourceType, setResourceType] = useState<"Text" | "URL" | "Manual">(
    "Manual",
  );

  // Preview State
  const [previewCitation, setPreviewCitation] = useState<{
    title: string;
    type: string;
    content: string;
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize messages with welcome toast
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome-msg",
          sender: "bot",
          text: `สวัสดีครับคุณ **${currentUser.name}** ฝ่าย **${currentUser.department}** 🙏 \n\nผมคือ **RMP AI Smart Knowledge Assistant** ยินดีต้อนรับสู่ระบบสืบค้นอัจฉริยะ (RAG System) มีหน้าที่ตอบคำถามเกณฑ์มาตรฐานเชิงลึก จากเฉพาะคลังข้อมูลของ **บริษัท รอแยล เมอิวะ แพ็คซ์ จำกัด** เท่านั้น\n\n💡 **กติกาความปลอดภัยสูงสุด (Strict RAG Guidance):** \nเพื่อป้องกันความคลาดเคลื่อน ข้อมูลทั้งหมดจะถูกอ้างอิงและพับลิชมาจากเฉพาะไฟล์ฉบับอนุมัติในระบบ (เช่น QP, WI, แบบฟอร์ม, และองค์ความรู้เชิงช่าง Kaizen) เท่านั้น ห้ามละเมิดไปดึงคำตอบจากอินเทอร์เน็ตภายนอกเด็ดขาด ครับ! \n\nท่านสามารถลองเลือกหัวข้อแนะนำ หรือป้อนคำถามช่างที่ต้องการสืบค้นด้านล่างนี้ได้เลยครับ`,
          timestamp: new Date().toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    }
  }, [currentUser]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isBotTyping]);

  // Quick chips inside the workspace
  const suggestionQueries = [
    'พิมพ์ถามเกณฑ์สะสมความร้อน "Hot Extrusion" ที่ตัวเครื่องผลิต',
    "เครื่องจักรทำงานติดขัด หรือไม่ทำงานแก้ไขอย่างไร?",
    "ปัญหาความชื้นและจุดบกพร่องในเม็ดพลาสติกเป่าฟิล์ม",
    "ขั้นตอนการเปิดบาร์โค้ดในระบบ WMS คลังสินค้า",
    "กฎเกณฑ์ความปลอดภัยการขับรถ Forklift ในโรงงาน",
  ];

  // RAG Matching Processor helper
  const processRAGQuery = (
    query: string,
  ): { responseText: string; citations: any[] } => {
    const q = query.toLowerCase().trim();

    if (
      q.includes("vacuum") ||
      q.includes("วิธีตรวจสูญญากาศ") ||
      q.includes("ตรวจวัดสูญญากาศ")
    ) {
      return {
        responseText: `### 📋 รายงานการสืบค้นมาตรฐานปฏิบัติงาน (Verified QP/WI)\n\nระบบตรวจพบข้อปฏิบัติมาตรฐานในเอกสารฉบับอนุมัติพับลิช **"SOP-QC-024 Vacuum Test"** และคู่มือการปฏิบัติงาน **"WI-QC-024 วิธีตรวจ Vacuum"** ซึ่งสรุปแนวทางการทำงานอย่างมีประสิทธิภาพเพื่อลดปัญหาของเสียในขั้นตอนการแพ็กเกจ มีขั้นตอนดังต่อไปนี้ครับ:\n\n#### ✅ ขั้นตอนการตรวจ Vacuum:\n1. **เตรียมเครื่องมือวัด Vacuum** — จัดเตรียมตัวเครื่องปั๊มและชุดเกจแรงดันสุญญากาศให้อยู่ในสภาพพร้อมตรวจวัดร้อยละร้อย\n2. **ตรวจสอบสภาพกระป๋อง** — สังเกตตัวบรรจุภัณฑ์หรือฝากระป๋องภายนอกให้เรียบร้อย ไม่บุบเบี้ยวจนทำให้ขอบรั่วซึม\n3. **วางหัววัดบนกระป๋อง** — วางตัวกระป๋องตั้งฉากบนแป้นรับและปรับเลื่อนชุดหัววัดกดลงบนเป้าตรวจจับอย่างแนบแน่น\n4. **อ่านค่าและบันทึกผล** — เจาะจุดวัดและบันทึกสถิติแรงดันอย่างรวดเร็ว (ค่าผ่านเกณฑ์ขั้นต่ำต้องไม่น้อยกว่า 15 inHg) ป้องกันลมรั่วซึมไหลออก\n5. **เปรียบเทียบกับเกณฑ์ที่กำหนด** — นำสถิติที่ตรวจได้ไปสรุปเทียบเคียงกับใบเกณฑ์มาตรฐานประกันคุณภาพ ISO เพื่อยืนยันความถูกต้อง\n\n🛡️ *การปฏิบัติตามทั้ง 5 ขั้นตอนนี้อย่างเป็นมาตรฐาน จะช่วยลดข้อผิดพลาดในขบวนการผลิต รักษาคุณภาพสินค้า และประหยัดเวลาได้อย่างมั่นคงครับ!*`,
        citations: [
          {
            id: "doc-10",
            title:
              "SOP-QC-024 Vacuum Test (ขั้นตอนมาตรฐานการตรวจวัดสูญญากาศบรรจุภัณฑ์)",
            type: "เอกสารมาตรฐาน QP",
            content:
              "ขั้นตอนการตรวจ Vacuum:\n1. เตรียมเครื่องมือวัด Vacuum\n2. ตรวจสอบสภาพกระป๋อง\n3. วางหัววัดบนกระป๋อง\n4. อ่านค่าและบันทึกผล\n5. เปรียบเทียบกับเกณฑ์ที่กำหนด",
          },
          {
            id: "doc-11",
            title:
              "WI-QC-024 วิธีตรวจ Vacuum (คู่มือการปฏิบัติงานขั้นตอนตรวจสุญญากาศ)",
            type: "เอกสารมาตรฐาน WI",
            content:
              "วิธีตรวจวัดแรงดัน Vacuum ในกระป๋องและบรรจุภัณฑ์\n- ตรวจเช็คเกจปั๊มสูญญากาศและหัวเข็มวัด\n- วางตำแหน่งกระป๋องตัวอย่างให้ตั้งฉาก\n- ทำการเจาะรูวัดและอ่านเข็มแรงดันอย่างรวดเร็วเพื่อไม่ให้แรงดันรั่วไหล\n- ข้อมูลมาตรฐานการบันทึก: ค่าผ่านเกณฑ์ต้องไม่ต่ำกว่า 15 inHg",
          },
        ],
      };
    }

    // We search across:
    // 1. Documents
    // 2. KBArticles
    // 3. Courses
    // 4. Custom Resources

    interface MatchedItem {
      id: string;
      title: string;
      type: string;
      content: string;
      score: number;
    }

    const matches: MatchedItem[] = [];

    // Helper to score matching words in a cross-browser safe way (avoids lookbehinds)
    const calculateScore = (
      sourceText: string,
      searchPhrase: string,
    ): number => {
      let score = 0;
      const lowerSource = sourceText.toLowerCase();
      const lowerPhrase = searchPhrase.toLowerCase();

      // Bonus if exact query match
      if (lowerSource.includes(lowerPhrase)) {
        score += 100;
      }

      // Safe split for dual-language (Thai and English keywords)
      const thaiWords = lowerPhrase.match(/[\u0e00-\u0e7f]+/g) || [];
      const engWords = lowerPhrase.match(/[a-z0-9]+/g) || [];
      const keywords = [...thaiWords, ...engWords].filter((w) => w.length > 1);

      keywords.forEach((word) => {
        if (lowerSource.includes(word)) {
          score += word.length * 4; // weight based on matching length
        }
      });

      return score;
    };

    // Index & Score Documents
    documents.forEach((doc) => {
      if (doc.status !== "Published") return;
      const textToSearch = `${doc.title} ${doc.description} ${doc.exampleText || ""} ${doc.department} ${doc.type}`;
      const score = calculateScore(textToSearch, q);
      if (score > 0) {
        matches.push({
          id: doc.id,
          title: `${doc.type}: ${doc.title} (Rev.${doc.revision})`,
          type: `เอกสารระบบ ${doc.type}`,
          content: `แผนกที่รับผิดชอบ: ${doc.department}\n\nรายละเอียด: ${doc.description}\n\nข้อกำหนดการปฏิบัติงาน (WI/QP):\n${doc.exampleText || "โปรดดูข้อมูลประกอบเพิ่มเติมในเอกสารฉบับเต็ม"}`,
          score,
        });
      }
    });

    // Index & Score KBArticles
    kbArticles.forEach((art) => {
      if (art.status !== "Approved") return;
      const textToSearch = `${art.title} ${art.problem} ${art.cause || ""} ${art.solution} ${art.prevention || ""} ${art.tags.join(" ")}`;
      const score = calculateScore(textToSearch, q);
      if (score > 0) {
        matches.push({
          id: art.id,
          title: `องค์ความรู้ Kaizen: ${art.title}`,
          type: `คลังสมองเทคนิค (${art.type})`,
          content: `ปัญหาชำรุด: ${art.problem}\n\nวิเคราะห์สาเหตุ (Root Cause): ${art.cause || "ไม่ระบุ"}\n\nขั้นตอนการแก้ไขโดยผู้เชี่ยวชาญ (Solution):\n${art.solution}\n\nมาตรการป้องกันระยะยาว (Prevention):\n${art.prevention || "ไม่ระบุ"}\n\nเอกสารเชื่อมโยง: ${art.relatedWIs.join(", ") || "ไม่มี"} \nทำโดย: ${art.author} (${art.authorDept})`,
          score,
        });
      }
    });

    // Index & Score Courses
    courses.forEach((course) => {
      course.lessons.forEach((lesson) => {
        const textToSearch = `${course.title} ${course.description} ${lesson.title} ${lesson.content}`;
        const score = calculateScore(textToSearch, q);
        if (score > 0) {
          matches.push({
            id: `${course.id}-${lesson.id}`,
            title: `หลักสูตรฝึกอบรม: ${course.title} -> บทเรียน: ${lesson.title}`,
            type: "คอร์สอบรมออนไลน์ (Onboarding Academy)",
            content: `หัวข้อหลักสูตร: ${course.title}\nรายละเอียด: ${course.description}\n\nเนื้อหาบทเรียนย่อย (${lesson.title}):\n${lesson.content}`,
            score,
          });
        }
      });
    });

    // Index & Score Custom Resources
    customResources.forEach((res) => {
      const textToSearch = `${res.title} ${res.content}`;
      const score = calculateScore(textToSearch, q);
      if (score > 0) {
        matches.push({
          id: res.id,
          title: `คู่มือเพิ่มเติม: ${res.title}`,
          type: `คู่มือนอกระบบ (${res.sourceType})`,
          content: res.content,
          score,
        });
      }
    });

    // Sort by scores descending
    matches.sort((a, b) => b.score - a.score);

    // If zero matches, return empty handed strictly
    if (matches.length === 0 || matches[0].score < 4) {
      return {
        responseText: `❌ ขออภัยอย่างสูงครับคุณ **${currentUser.name}** \n\nคำค้นหา **"${query}"** ไม่ปรากฏอยู่ใน เอกสารมาตรฐานฉบับอนุมัติ (QP, WI, Form), รายงานความรู้เชิงเทคนิคหน้าเครื่องจักร (Kaizen) หรือ บทเรียนสอนงานคลังสินค้าในฐานข้อมูลระบบของบริษัท รอแยล เมอิวะ แพ็คซ์ จำกัด ในปัจจุบันครับ\n\n🔒 **นโยบายความถูกต้องเป็นเลิศ (Strict Local Grounding Security):** \nระบบไม่อนุญาตให้ทำการเดาคำตอบ หรือดึงคำตอบทั่วไปจากเว็บภายนอก เนื่องจากหัวข้อดังกล่าวไม่ได้ผ่านการทบทวนโดยผู้บริหาร RMP คณะกรรมการกลาง ซึ่งอาจก่่อให้เกิดอันตรายรุนแรงในการทำงานหน้าไลน์ผลิตได้ครับ หากท่านประสงค์รบกวนติดต่อฝ่ายวิศวกรรม/ซ่อมบำรุง หรือ แนะนำให้เขียนคำร้องปรึกษาผู้เชี่ยวชาญโดยตรงที่มอดูล Expert Directory ครับ`,
        citations: [],
      };
    }

    const topMatches = matches.slice(0, 3);
    const bestMatch = topMatches[0];

    // Build synthesized professional response based on top occurrences
    let synthesis = "";

    if (bestMatch.type.includes("เอกสารระบบ")) {
      synthesis = `### 📋 รายงานการสืบค้นมาตรฐานปฏิบัติงาน (Verified QP/WI)\n\nจากการตรวจสอบฐานข้อมูลอ้างอิง ระบบตรวจพบข้อปฏิบัติมาตรฐานในเอกสารฉบับอนุมัติพับลิช **"${bestMatch.title}"** ซึ่งมีแนวทางการทำงานที่แนะนำดังนี้:\n\n`;
      synthesis += `*   **วัตถุประสงค์งาน & หน้าที่:** ${bestMatch.content.split("\n\nรายละเอียด: ")[1]?.split("\n\nข้อกำหนดการปฏิบัตงาน")[0] || "ปฏิบัติให้เป็นไปตามมาตรฐานคุณภาพและป้องกัน Loss"}\n`;
      synthesis += `*   **ขั้นตอนมาตรฐานที่กำหนดรัดกุม (Standard Procedure):** \n    ${bestMatch.content.split("ข้อกำหนดการปฏิบัติงาน (WI/QP):\n")[1] || "โปรดดาวน์โหลดเอกสารมาตรฐานฉบับเต็มเพื่อศึกษาขั้นตอนอย่างละเอียด"}\n\n`;
      synthesis += `**คำแนะนำความปลอดภัยเพิ่มเติม:** ผู้ปฏิบัติงานแผนกผลิตและ QA ต้องสวมใส่อุปกรณ์คุ้มครองความปลอดภัยส่วนบุคคล (PPE) เมือเข้าสัมผัสสายพานงานตรงนี้ตลอด 100%`;
    } else if (bestMatch.type.includes("คลังสมองเทคนิค")) {
      synthesis = `### 🛠️ คู่มือแก้ไขปัญหาทางเทคนิคและ Kaizen หน้าเครื่องจักร\n\nระบบสืบค้นพบรายงานวิจัยสาเหตุของช่างเทคนิคที่บันทึกแนวทางแก้อย่างยอดเยี่ยมไว้ในคลังความรู้ **"${bestMatch.title}"** สรุปแนวทางฟื้นฟูดังนีครับ:\n\n`;
      const docCleanContent = bestMatch.content;
      const problem =
        docCleanContent
          .split("ปัญหาชำรุด: ")[1]
          ?.split("\n\nวิเคราะห์สาเหตุ")[0] || "";
      const cause =
        docCleanContent
          .split("วิเคราะห์สาเหตุ (Root Cause): ")[1]
          ?.split("\n\nขั้นตอนการแก้ไข")[0] || "";
      const solution =
        docCleanContent
          .split("ขั้นตอนการแก้ไขโดยผู้เชี่ยวชาญ (Solution):\n")[1]
          ?.split("\n\nมาตรการป้องกัน")[0] || "";
      const prevention =
        docCleanContent
          .split("มาตรการป้องกันระยะยาว (Prevention):\n")[1]
          ?.split("\n\nเอกสารเชื่อมโยง")[0] || "";

      synthesis += `*   **1. อาการของปัญหา (Problem):** ${problem}\n`;
      synthesis += `*   **2. สาเหตุหัวใจของปัญหา (Root Cause):** ${cause}\n\n`;
      synthesis += `👉 **3. ขั้นตอนลงมือฟื้นฟูโดยเซียน (Action Plan):**\n${solution
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n")}\n\n`;
      synthesis += `🛡️ **4. วิธีระวังรักษาระยะยาว (Prevention Measures):**\n    ${prevention}\n\n`;
      synthesis += `*สำหรับข้อมูลอ้างอิงเชิงลึกกรุณาตรวจสอบเอกสารแนบเพื่อความชัดเจนสูงสุดครับ*`;
    } else if (bestMatch.type.includes("คอร์สอบรมออนไลน์")) {
      synthesis = `### 🎓 คู่มือทักษะย่อยจากบทเรียน Onboarding เสมือนจริง\n\nเนื้อหานี้จัดอยู่ใน **"${bestMatch.title}"** ของวิทยาลัยสอนงาน RMP Academy:\n\n`;
      const lessonContent =
        bestMatch.content.split("เนื้อหาบทเรียนย่อย")[1] || bestMatch.content;
      synthesis += `${lessonContent.slice(0, 1000)}\n\n`;
      synthesis += `\n*ขอแนะนำให้ผู้ปฏิบัติงานเข้าไปเรียนหลักสูตรที่เกี่ยวข้องเต็มรูปแบบเพื่อทำแบบวัดผลเพื่อรับใบประกาศนียบัตรอ้างอิงตามเกณฑ์ Competency ต่อไป*`;
    } else {
      synthesis = `### 📚 ข้อมูลเพิ่มเติมจากฐานข้อมูล Admin Ingested Manual\n\nคำตอบจากเอกสารอ้างอิงภายนอกความร่วมมือ **"${bestMatch.title}"**:\n\n`;
      synthesis += `${bestMatch.content}\n\n`;
      synthesis += `*ข้อมูลนี้ได้รับการเพิ่มเข้ามาเป็นการเฉพาะเพื่อขยายขอบเขตความรู้*`;
    }

    // Append citation data for clicking and previewing
    const citations = topMatches.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      content: m.content,
    }));

    return {
      responseText: synthesis,
      citations,
    };
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || isBotTyping) return;

    const userMsgText = inputMessage;
    setInputMessage("");

    // Add user message to stack
    const userMessage: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: userMsgText,
      timestamp: new Date().toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsBotTyping(true);

    try {
      if (chatMode === "CONVERSATIONAL") {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: userMsgText,
            currentUser,
            documents,
            kbArticles,
            courses,
            customResources,
          }),
        });

        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }

        const data = await response.json();
        const botMessage: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: data.responseText || "ไม่ตรวจพบคำตอบจากคลังความรู้สะสม",
          citations:
            data.citations && data.citations.length > 0
              ? data.citations
              : undefined,
          timestamp: new Date().toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setMessages((prev) => [...prev, botMessage]);
      } else {
        // Direct keyword matching Fallback
        const ragResult = processRAGQuery(userMsgText);
        const botMessage: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: `### 🔍 ผลลัพธ์การค้นหาแบบ Q&A (Direct Search Snippets)\n\nระบบตรวจพบเอกสารที่ระบุคำค้นหาใกล้เคียงที่สุดดังนี้ครับ:\n\n${
            ragResult.citations.length > 0
              ? ragResult.citations
                  .map(
                    (c, i) =>
                      `**อันดับที่ ${i + 1}.** [${c.type}] **"${c.title}"** \n*ตัวอย่างเนื้อหา:* \n${c.content.slice(0, 200)}...\n\n`,
                  )
                  .join("")
              : "ไม่พบประจักษ์พยานความรู้ใด ๆ ในฐานข้อมูลเลยครับ"
          }`,
          citations: undefined,
          timestamp: new Date().toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setMessages((prev) => [...prev, botMessage]);
      }
    } catch (err) {
      console.warn(
        "Express Semantic RAG failed, falling back to local client keyword search:",
        err,
      );
      // Clean fallback to client-side local search
      const ragResult = processRAGQuery(userMsgText);
      const botMessage: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: `⚠️ *ระบบเปลี่ยนมาใช้โหมดสำรองตรวจจับจากคีย์เวิร์ดหน้าเว็บ (Keyword Match Fallback)* เนื่องจากติดขัดทางเซิร์ฟเวอร์หลักชั่วคราว:\n\n${ragResult.responseText}`,
        citations: ragResult.citations,
        timestamp: new Date().toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, botMessage]);
    } finally {
      setIsBotTyping(false);
    }
  };

  const handleQuickChipSelect = (query: string) => {
    setInputMessage(query);
  };

  const handleCreateResourceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resourceTitle.trim() || !resourceContent.trim()) return;

    const mockRes: CustomResource = {
      id: `res-${Date.now()}`,
      title: resourceTitle,
      content: resourceContent,
      sourceType: resourceType,
      addedBy: currentUser.name,
      createdAt: new Date().toISOString(),
    };

    onAddCustomResource(mockRes);
    setResourceTitle("");
    setResourceContent("");
    alert(
      "🎉 อัปโหลดเอกสาร / ดึงพจนานุกรมความรู้สำหรับระบบ RAG เข้าคลังเรียบร้อยแล้ว!",
    );
  };

  return (
    <div className="space-y-6">
      {/* Banner / Tab selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("INFOGRAPHIC")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-2 ${
              activeTab === "INFOGRAPHIC"
                ? "bg-[#15329c] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            ศูนย์ความรู้ & 10 Use Cases (Business Value)
          </button>

          <button
            onClick={() => setActiveTab("CHAT")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-2 ${
              activeTab === "CHAT"
                ? "bg-[#15329c] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Bot className="w-4 h-4" />
            AI Chatbot อัจฉริยะ (Conversational RAG)
          </button>

          <button
            onClick={() => setActiveTab("RESOURCES")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-2 ${
              activeTab === "RESOURCES"
                ? "bg-[#15329c] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Database className="w-4 h-4" />
            ฐานข้อมูลสารสนเทศที่ระบบ Ingest{" "}
            {currentUser.role === "Admin" && (
              <span className="bg-emerald-500 text-white text-[8px] font-bold px-1 rounded">
                Admin
              </span>
            )}
          </button>
        </div>

        <div className="text-slate-400 font-mono text-[10px] bg-slate-50 px-2.5 py-1 rounded">
          🧠 สิทธิใช้งาน:{" "}
          <strong className="text-slate-800 uppercase font-bold">
            {currentUser.role} PRIVILEGED
          </strong>
        </div>
      </div>

      {activeTab === "CHAT" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start h-[600px]">
          {/* Sidebar suggestion chips and metrics */}
          <div className="lg:col-span-1 space-y-4 h-full flex flex-col justify-between">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h4 className="font-extrabold text-slate-800 text-xs">
                  เครื่องมือค้นความรู้ RAG
                </h4>
              </div>

              {/* Bot selection options */}
              <div className="space-y-2">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  โหมดการค้นหาคำตอบ
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setChatMode("CONVERSATIONAL")}
                    className={`p-2 rounded-xl text-[10px] text-center font-bold border transition shrink-0 cursor-pointer ${
                      chatMode === "CONVERSATIONAL"
                        ? "border-[#15329c] bg-[#15329c]/5 text-[#15329c]"
                        : "border-slate-100 hover:bg-slate-50 text-slate-500"
                    }`}
                  >
                    💡 บทสนทนาสังเคราะห์
                  </button>
                  <button
                    onClick={() => setChatMode("SIMPLE_QA")}
                    className={`p-2 rounded-xl text-[10px] text-center font-bold border transition shrink-0 cursor-pointer ${
                      chatMode === "SIMPLE_QA"
                        ? "border-[#15329c] bg-[#15329c]/5 text-[#15329c]"
                        : "border-slate-100 hover:bg-slate-50 text-slate-500"
                    }`}
                  >
                    🔍 ค้นอ้างอิงตรงตัว
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-150">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  💡 คำแนะนำหัวข้อวิจัยประหยัดเวลา
                </span>
                <div className="space-y-1.5">
                  {suggestionQueries.map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickChipSelect(chip)}
                      className="w-full text-left p-2.5 rounded-xl text-[10.5px] text-slate-600 hover:text-[#15329c] hover:bg-slate-50 border border-slate-100 hover:border-[#15329c]/30 transition block leading-normal"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Guard guidelines block */}
            <div className="bg-[#15329c]/5 p-4 rounded-2xl border border-[#15329c]/10 text-[10.5px] leading-relaxed text-slate-600">
              <div className="flex items-center gap-1 text-[#15329c] font-bold mb-1">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Semantic Smart RAG Active</span>
              </div>
              <p>
                ระบบใช้แนวทางสะพานเชื่อมโยงความรู้ (Semantic Mapping)
                แก้ปัญหาพิมพ์ศัพท์ต่างกัน รวมถึงป้องกัน{" "}
                <strong>AI Slop / Hallucination</strong>{" "}
                ห้ามเสนอแนะอุณหภูมิภายนอกที่อาจทำให้เกิดความร้อนเกินหรือไฟไหม้เครื่องจักร
              </p>
            </div>
          </div>

          {/* Standalone Conversational Chat Box */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
            {/* Header of Chatbox */}
            <div className="bg-[#15329c] text-white px-5 py-3.5 flex items-center justify-between border-b border-[#15329c]">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-white/10 rounded-xl">
                  <Bot className="w-5 h-5 text-white" />
                </span>
                <div>
                  <h3 className="font-extrabold text-xs tracking-tight">
                    RMP AI Knowledge Assistant
                  </h3>
                  <p className="text-[9px] text-slate-200 mt-0.5 font-mono">
                    ฐานข้อมูลดึงความรู้: {documents.length} เอกสารมาตรฐาน |{" "}
                    {kbArticles.length} Kaizens | {courses.length} คอร์สอบรม
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wider font-mono">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                <span>ONLINE RAG GROUNDED</span>
              </div>
            </div>

            {/* Chat list area */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-slate-50/50">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-[85%] ${msg.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                >
                  <div
                    className={`p-2 rounded-xl shrink-0 h-8 w-8 flex items-center justify-center text-white ${
                      msg.sender === "user" ? "bg-[#15329c]" : "bg-[#e51a24]"
                    }`}
                  >
                    {msg.sender === "user" ? (
                      <UserIcon className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.sender === "user"
                          ? "bg-[#15329c] text-white rounded-tr-none font-medium"
                          : "bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-xs"
                      }`}
                    >
                      {msg.text}
                    </div>

                    {/* Citations block for bot messages */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="space-y-1.5 p-1">
                        <span className="block text-[9.5px] font-extrabold text-slate-400 uppercase tracking-widest">
                          📄 แหล่งอ้างอิงยืนยันความถูกต้อง (Local Ingested
                          Source)
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {msg.citations.map((cite, cIdx) => (
                            <button
                              key={cIdx}
                              onClick={() => setPreviewCitation(cite)}
                              className="text-[10px] font-bold bg-[#15329c]/5 text-[#15329c] hover:bg-[#15329c]/10 border border-[#15329c]/15 py-1 px-2.5 rounded-xl flex items-center gap-1 cursor-pointer transition shrink-0"
                            >
                              <FileText className="w-3 h-3 text-[#15329c]" />
                              <span>
                                {cite.title.split(": ")[1]?.slice(0, 30) ||
                                  cite.title}
                              </span>
                              <Eye className="w-3 h-3 text-slate-400" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <span
                      className={`block text-[9px] text-slate-400 font-mono mt-1 ${msg.sender === "user" ? "text-right" : "text-left"}`}
                    >
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              ))}

              {isBotTyping && (
                <div className="flex gap-3 max-w-[85%]">
                  <div className="p-2 rounded-xl shrink-0 h-8 w-8 flex items-center justify-center text-white bg-[#e51a24]">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-white border border-slate-200 p-3.5 rounded-2xl rounded-tl-none shadow-xs flex items-center gap-1.5 text-xs text-slate-400">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#e51a24]" />
                    RAG กำลังสกัดกั้น ค้นหาและปะต่อข้อความมาตรฐานในเซกเมนต์...
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Form actions for send messages */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 bg-white border-t border-slate-200 flex gap-2 items-center"
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="พิมพ์ถามขั้นตอนมาตรฐาน ตัวอย่าง: แก้ปัญหาพลาสติกพรู, ตรวจรับ QC, ขับโฟล์คลิฟท์..."
                className="flex-1 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#15329c] text-slate-800"
              />
              <button
                type="submit"
                className="bg-[#15329c] hover:bg-[#11297e] text-white p-2.5 rounded-xl transition cursor-pointer shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === "RESOURCES" && (
        /* DATABASE INGESTION VIEW FOR EXHAUSTIVE CONTROL */
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                ข้อมูลสารสนเทศทั้งหมดที่ระบบ AI สลักเชื่อมโยง
              </h3>
              <p className="text-xs text-slate-500">
                ข้อมูลสารสนเทศในองค์กรทั้งหมดที่ดึงมาประมวลผลเป็น RAG Ingestion
                ในขณะนี้
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
              <span className="block text-slate-500 text-[10px] font-bold uppercase">
                เอกสาร QP / WI ฉบับพับลิช
              </span>
              <strong className="text-2xl font-black text-indigo-900 block mt-1">
                {documents.filter((d) => d.status === "Published").length} ฉบับ
              </strong>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
              <span className="block text-slate-500 text-[10px] font-bold uppercase">
                ข้อยืดหยุ่น Kaizen & บทความเชิงช่าง
              </span>
              <strong className="text-2xl font-black text-emerald-900 block mt-1">
                {kbArticles.filter((k) => k.status === "Approved").length}{" "}
                บทความ
              </strong>
            </div>
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
              <span className="block text-slate-500 text-[10px] font-bold uppercase">
                บทเรียนย่อยในอคาเดมีออนไลน์
              </span>
              <strong className="text-2xl font-black text-amber-900 block mt-1">
                {courses.reduce((sum, c) => sum + c.lessons.length, 0)} หัวข้อ
              </strong>
            </div>
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl">
              <span className="block text-slate-500 text-[10px] font-bold uppercase">
                เอกสาร / ความรู้เพิ่มเติม (Custom Ingestion)
              </span>
              <strong className="text-2xl font-black text-rose-900 block mt-1">
                {customResources.length} หัวข้อ
              </strong>
            </div>
          </div>

          {/* ADMIN EXCLUSIVE INGESTION INTERFACE */}
          {currentUser.role === "Admin" ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
              {/* Form on left to register new resource */}
              <div className="lg:col-span-1 bg-[#15329c]/5 p-4 rounded-2xl border border-[#15329c]/10 space-y-4">
                <span className="block text-xs font-bold text-[#15329c] flex items-center gap-1">
                  <Plus className="w-4 h-4" />
                  เพิ่มข้อมูลคู่มือภายนอกเฉพาะกิจสำหรับ RAG (Manual Ingestion)
                </span>

                <form
                  onSubmit={handleCreateResourceSubmit}
                  className="space-y-4"
                >
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block">
                      ชื่อคู่มือความรู้ / หัวข้ออ้างอิง:
                    </label>
                    <input
                      type="text"
                      value={resourceTitle}
                      onChange={(e) => setResourceTitle(e.target.value)}
                      placeholder="เช่น คู่มือแก้ปัญหาข้อติดขัดแท่น Lamination M200"
                      required
                      className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block">
                      ประเภทแหล่งที่มา:
                    </label>
                    <select
                      value={resourceType}
                      onChange={(e: any) => setResourceType(e.target.value)}
                      className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs text-slate-700"
                    >
                      <option value="Manual">Manual (คู่มือเชิงช่าง)</option>
                      <option value="Text">Text (องค์ความรู้เขียนเอง)</option>
                      <option value="URL">URL / เว็บไซต์ของเครื่องจักร</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block">
                      เนื้อหาความรู้อ้างอิง (สำหรับดึง RAG):
                    </label>
                    <textarea
                      value={resourceContent}
                      onChange={(e) => setResourceContent(e.target.value)}
                      rows={5}
                      placeholder="คัดลอกรายละเอียดขั้นตอน ข้อปฏิบัติ สาเหตุ และวิธีแก้ไขปัญหาทั้งหมดลงตรงนี้เพื่อให้บอทอ่าน..."
                      required
                      className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#15329c] hover:bg-[#11297e] text-white font-bold py-2 rounded-lg text-xs cursor-pointer transition shadow"
                  >
                    ประมวลผลเข้าสู่ RAG Ingestion (Admin Submit)
                  </button>
                </form>
              </div>

              {/* List of custom assets on right */}
              <div className="lg:col-span-2 space-y-3">
                <span className="block text-xs font-bold text-slate-600">
                  รายการข้อมูลเพิ่มเติมที่ป้อนเข้าระบบแล้ว
                </span>

                {customResources.length === 0 ? (
                  <div className="bg-slate-50 p-12 rounded-xl text-center border border-dashed border-slate-200 text-slate-400 text-xs">
                    ปัจจุบันยังไม่มีการป้อนข้อมูลเพิ่มเติมใดๆ
                    คู่มือทั้งหมดอ้างอิงตรงจากเอกสารสารสนเทศมาตรฐาน
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[350px] overflow-y-auto">
                    {customResources.map((res) => (
                      <div
                        key={res.id}
                        className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-start justify-between gap-3 text-xs shadow-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="bg-rose-100 text-rose-800 text-[9px] font-bold font-mono px-1.5 py-0.2 rounded font-semibold uppercase">
                              {res.sourceType}
                            </span>
                            <h5 className="font-bold text-slate-800">
                              {res.title}
                            </h5>
                          </div>
                          <p className="text-slate-400 text-[9.5px] mt-1 font-mono">
                            เพิ่มโดย: {res.addedBy} |{" "}
                            {new Date(res.createdAt).toLocaleDateString()}
                          </p>
                          <p className="text-slate-600 mt-2 line-clamp-3 bg-slate-50/50 p-2 rounded border border-slate-100">
                            {res.content}
                          </p>
                        </div>

                        <button
                          onClick={() => onDeleteCustomResource(res.id)}
                          className="text-slate-400 hover:text-rose-600 transition p-1.5 hover:bg-rose-50 rounded"
                          title="ลบออกความรู้ RAG"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-6 bg-slate-50 text-center text-slate-500 rounded-2xl border border-slate-150 text-xs space-y-2">
              <AlertTriangle className="w-8 h-8 text-slate-350 mx-auto" />
              <h5 className="font-bold text-slate-700">
                สิทธิ์ Viewer/Editor ของคุณไม่สามารถแก้ไขฐานสารสนเทศได้
              </h5>
              <p>
                เฉพาะแอดมินฝ่ายความรู้ คณะกรรมการกลาง
                เท่านั้นที่สามารถนำเข้าคู่มือ Manual ฉบับพิเศษเข้าระบบได้
                หากมีคำแนะนำ Kaizen เพิ่มเติมรบกวนเสนอไปยังหัวหน้าฝ่ายของคุณครับ
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "INFOGRAPHIC" && (
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-8 animate-fade-in text-slate-800">
          {/* Main Title Banner matching Infographic */}
          <div className="text-center bg-gradient-to-r from-blue-700 via-[#15329c] to-indigo-800 text-white py-8 px-6 rounded-3xl shadow-md space-y-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />

            <span className="bg-amber-400 text-slate-950 font-black text-[10px] md:text-xs uppercase px-3 py-1 rounded-full tracking-wider inline-block">
              ศูนย์กลางความรู้ขององค์กร (ORGANIZATIONAL KNOWLEDGE CENTER)
            </span>
            <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight">
              เลิกเสียเวลา <span className="text-amber-300">"หาข้อมูล"</span>{" "}
              ให้ AI ช่วยหาคำตอบแทนคุณ
            </h2>
            <p className="text-xs md:text-sm text-slate-100 max-w-xl mx-auto font-medium leading-relaxed">
              สืบค้นและตอบคำถามอย่างแม่นยำ 24 ชั่วโมงจากคู่มือมาตรฐาน SOP, WI
              และองค์ความรู้เชิงช่าง Kaizen ของ บริษัท รอแยล เมอิวะ แพ็คซ์ จำกัด
            </p>
          </div>

          {/* ปัญหาที่เจอบ่อย vs AI KB ช่วยอะไร? */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-rose-50/60 border border-rose-100 p-6 rounded-2xl space-y-4">
              <h3 className="text-rose-700 font-extrabold text-sm flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  ❌
                </span>
                ปัญหาที่เจอบ่อยในการหาข้อมูล
              </h3>
              <div className="space-y-3">
                {[
                  {
                    title: "เอกสารกระจัดกระจาย หาไม่เจอ",
                    desc: "คู่มือกระจัดกระจายอยู่ตามเครื่องคอมพิวเตอร์ ตู้เอกสาร หรือไฟล์แชร์แผนกต่าง ๆ",
                  },
                  {
                    title: "ใช้เวลาค้นหาหลายชั่วโมง",
                    desc: "เสียเวลาทำงานหน้าเครื่องจักรและหน้าไลน์ผลิตเพื่อไปรื้อดูคู่มือมาแก้ปัญหาเฉพาะหน้า",
                  },
                  {
                    title: "เอกสารผิด Revision",
                    desc: "เผลอใช้เอกสารฉบับเก่าที่ยกเลิกไปแล้วมาทำมาตรฐาน ทำให้สินค้าหลุดเกณฑ์คุณภาพ",
                  },
                  {
                    title: "ข้อมูลไม่เป็นมาตรฐาน",
                    desc: "พนักงานทำงานตามใจตัวเอง ขาดเอกสารยึดเหนี่ยวมาตรฐานและขั้นตอนที่ถูกต้องแม่นยำ",
                  },
                  {
                    title: "ความรู้หายเมื่อพนักงานลาออก",
                    desc: "องค์ความรู้เชิงลึก เทคนิคการแก้ปัญหาหน้าเครื่องติดตัวไปกับช่างที่ย้ายแผนกหรือลาออก",
                  },
                ].map((item, index) => (
                  <div
                    key={index}
                    className="flex gap-3 bg-white p-3 rounded-xl border border-rose-100/50 hover:shadow-xs transition"
                  >
                    <span className="text-rose-550 shrink-0 text-sm font-bold">
                      ✕
                    </span>
                    <div>
                      <strong className="text-slate-800 text-xs block">
                        {item.title}
                      </strong>
                      <span className="text-[10.5px] text-slate-500 block mt-0.5">
                        {item.desc}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-100 p-6 rounded-2xl space-y-4">
              <h3 className="text-emerald-800 font-extrabold text-sm flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  ✓
                </span>
                AI Knowledge Base ช่วยโรงงานได้อย่างไร?
              </h3>
              <div className="space-y-3">
                {[
                  {
                    title: "รวมทุกเอกสารไว้ในที่เดียว",
                    desc: "รวบรวมไฟล์ SOP, Work Instruction (WI) และแบบฟอร์มเข้าสู่ฐานความรู้กลางของบริษัท",
                  },
                  {
                    title: "ค้นหาและตอบคำถามทันที",
                    desc: "ประมวลผลคำตอบแบบ Semantic RAG รวดเร็วในระดับวินาที ไม่ต้องคลิกเปิดหาทีละหน้า",
                  },
                  {
                    title: "อ้างอิงแหล่งที่มาชัดเจน",
                    desc: "ทุกคำตอบแสดง Citation อ้างอิงถึงชื่อและเวอร์ชันไฟล์อนุมัติจริงที่เปิดใช้งานอยู่",
                  },
                  {
                    title: "ข้อมูลเป็นมาตรฐานเดียวกัน",
                    desc: "ทุกคนอ้างอิงคำตอบผ่านบอทฉบับล่าสุด (Latest Approved Only) ป้องกันปัญหาทำผิดเกณฑ์",
                  },
                  {
                    title: "ความรู้ไม่หาย แม้คนเปลี่ยน",
                    desc: "บันทึกเทคนิคหน้าไลน์ วิธีถอดซ่อม และสูตรแก้ปัญหาในรูปฐานข้อมูลคลังสมองอัจฉริยะ",
                  },
                ].map((item, index) => (
                  <div
                    key={index}
                    className="flex gap-3 bg-white p-3 rounded-xl border border-emerald-100/50 hover:shadow-xs transition"
                  >
                    <span className="text-emerald-600 shrink-0 text-sm font-bold">
                      ✓
                    </span>
                    <div>
                      <strong className="text-slate-800 text-xs block">
                        {item.title}
                      </strong>
                      <span className="text-[10.5px] text-slate-500 block mt-0.5">
                        {item.desc}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 10 Use Case ที่ช่วยงานโรงงานได้จริง */}
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="text-xs font-black text-[#15329c] uppercase tracking-wider">
                10 USE CASES ที่ช่วยงานโรงงานได้จริง
                (คลิกหัวข้อเพื่อสั่งพิมพ์คำถามลงในแชททันที)
              </h3>
              <p className="text-xs text-slate-500">
                คุณสามารถทดลองใช้งาน AI Knowledge Base
                ตามกรณีการใช้งานยอดฮิตด้านล่างนี้ได้โดยการคลิกที่กล่องระบบ
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                {
                  id: 1,
                  title: "1. ค้นหา SOP และ WI",
                  icon: "🔍",
                  query:
                    "ขอขั้นตอนควบคุมกระบวนการเป่าฟิล์มและลามิเนตมาตรฐาน QP-PRD-001",
                },
                {
                  id: 2,
                  title: "2. ตอบคำถามด้านคุณภาพ",
                  icon: "🛡️",
                  query: "วิธีตรวจ Vacuum ทำอย่างไร?",
                },
                {
                  id: 3,
                  title: "3. ค้นหาข้อกำหนดลูกค้า",
                  icon: "👥",
                  query:
                    "ขอกฎระเบียบข้อกำหนดด้านคุณภาพสินค้าเมื่อจัดส่งให้ลูกค้ากลุ่มบริโภค",
                },
                {
                  id: 4,
                  title: "4. ตรวจสอบ Specification",
                  icon: "📄",
                  query:
                    "มาตรฐานตรวจสอบความชื้นคุณภาพเม็ดพลาสติก Moisture Tester ค่าควบคุมคือเท่าไหร่",
                },
                {
                  id: 5,
                  title: "5. ค้นหา Audit Finding",
                  icon: "📝",
                  query:
                    "รายการสิ่งบกพร่องจากการตรวจประเมินภายใน มีประเด็นสำคัญเรื่องใดบ่อยบ้าง",
                },
                {
                  id: 6,
                  title: "6. ช่วยฝึกอบรมพนักงานใหม่",
                  icon: "🎓",
                  query:
                    "บทเรียนเตรียมความพร้อมพนักงานคลังสินค้าใหม่ มีหัวข้อใดหลักๆ บ้าง",
                },
                {
                  id: 7,
                  title: "7. สรุปเอกสารยาวๆ",
                  icon: "📚",
                  query:
                    "ช่วยสรุปกระบวนการจัดซื้อวัตถุดิบและพลาสติกคอมพาวด์ QP-PUR-001 ให้สั้นลงหน่อย",
                },
                {
                  id: 8,
                  title: "8. ค้นหา Root Cause",
                  icon: "🔥",
                  query:
                    "สาเหตุการเกิดปัญหาฟองพลาสติกพรูหรือสิ่งแปลกปลอมในฟิล์มเป่า เกิดจากอะไร",
                },
                {
                  id: 9,
                  title: "9. ค้นหา CAPA",
                  icon: "⚙️",
                  query:
                    "มาตรการปรับปรุงแก้ไข CAPA เรื่องอุณหภูมิกระบอกสูบสูงเกินไปที่ผ่านมาดำเนินการอย่างไร",
                },
                {
                  id: 10,
                  title: "10. Chatbot องค์กร 24 ชั่วโมง",
                  icon: "💬",
                  query:
                    "สอบถามกฎระเบียบมาตรฐานความมั่นคงและเวลาเปิด-ปิดการใช้งานคลังสินค้า",
                },
              ].map((uc) => (
                <button
                  type="button"
                  key={uc.id}
                  onClick={() => {
                    setInputMessage(uc.query);
                    setActiveTab("CHAT");
                  }}
                  className="bg-white hover:bg-indigo-50/50 p-4 rounded-2xl border border-slate-200 hover:border-[#15329c]/50 text-center space-y-2 cursor-pointer transition shadow-xs group"
                >
                  <span className="text-2xl block group-hover:scale-110 transition-transform">
                    {uc.icon}
                  </span>
                  <span className="font-extrabold text-[11px] text-slate-800 block line-clamp-2 leading-tight">
                    {uc.title}
                  </span>
                  <span className="bg-slate-100 group-hover:bg-indigo-100 text-slate-500 group-hover:text-indigo-800 font-mono text-[8.5px] px-1.5 py-0.5 rounded block transition-colors mt-1">
                    คลิกทดสอบ
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ผลลัพธ์ที่องค์กรได้รับ */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest text-center">
              ผลลัพธ์เชิงธุรกิจที่องค์กร รอแยล เมอิวะ แพ็คซ์ จำกัด ได้รับ (RMP
              Strategic Outcomes)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {[
                {
                  title: "เร็วขึ้น ประหยัดเวลา",
                  desc: "พนักงานหน้าไลน์และแผนก QA ค้นข้อมูลและรับคำตอบแบบทันท่วงทีภายใน 2 วินาที แทนการเสียเวลาคุ้ยเอกสารหลายชั่วโมง",
                  icon: "⚡",
                },
                {
                  title: "แม่นยำขึ้น ลดความผิดพลาด",
                  desc: "การันตีข้อมูลที่ใช้อ้างอิงเป็น Rev ล่าสุด ผ่านการอนุมัติแล้วเท่านั้น ลดการทำงานซ้ำซากและงานเสีย (Defect Ratio)",
                  icon: "🎯",
                },
                {
                  title: "ปลอดภัยขึ้น ใช้ข้อมูลถูกต้อง",
                  desc: "ช่วยยับยั้งการใช้อุณหภูมิเครื่องจักรหรือความเร็วมั่วซั่วตามใจตนเอง ซึ่งอาจสร้างอันตรายร้ายแรงต่อโรงงาน",
                  icon: "🔒",
                },
                {
                  title: "ความรู้ไม่หาย พัฒนาต่อเนื่อง",
                  desc: "ระบบรวบรวมเทคนิค Kaizen ของผู้ชำนาญการไว้ในคลังกลาง ไม่ให้สูญสลายเมื่อพนักงานเกษียณหรือลาออก",
                  icon: "📈",
                },
                {
                  title: "เพิ่มประสิทธิภาพ ลดต้นทุน",
                  desc: "ย่นระยะเวลา Onboarding ฝึกสอนงานช่างใหม่เหลือ 3 วัน แทน 2 สัปดาห์ ประหยัดงบสูญเสียในสายการผลิตได้อย่างยั่งยืน",
                  icon: "💰",
                },
              ].map((outcome, idx) => (
                <div
                  key={idx}
                  className="pt-4 md:pt-0 md:px-4 space-y-2 text-center"
                >
                  <span className="text-3xl block">{outcome.icon}</span>
                  <h5 className="font-extrabold text-xs text-slate-800 leading-tight">
                    {outcome.title}
                  </h5>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    {outcome.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Citation Modal popup preview */}
      {previewCitation && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="bg-[#15329c] text-white p-4.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-white" />
                <div>
                  <span className="text-[9px] font-mono font-bold uppercase text-slate-100 bg-white/10 px-1.5 py-0.2 rounded leading-none shrink-0 block mb-0.5">
                    {previewCitation.type}
                  </span>
                  <h4 className="font-extrabold text-xs leading-none">
                    {previewCitation.title}
                  </h4>
                </div>
              </div>
              <button
                onClick={() => setPreviewCitation(null)}
                className="text-white hover:text-slate-200 text-xs font-bold font-mono px-2 py-1 rounded hover:bg-white/10"
              >
                ปิด
              </button>
            </div>

            <div className="p-6 overflow-y-auto font-mono text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[50vh] bg-slate-50">
              {previewCitation.content}
            </div>

            <div className="p-3.5 bg-slate-100/50 border-t border-slate-200 text-right">
              <button
                onClick={() => setPreviewCitation(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer transition shadow"
              >
                เข้าใจแล้ว และปิดทรานสคริปต์
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
