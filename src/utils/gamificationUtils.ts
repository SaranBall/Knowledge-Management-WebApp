import { UserCompetency, UserCertificate, KMContributionLog, UserKMPoints, CertStatus } from '../types';

// Anchor current date as instructed under the 2026-06-22 timeline
export const ANCHOR_DATE = '2026-06-22';

/**
 * Returns initial competencies mapped to a user based on their position & department.
 */
export function getInitialCompetencies(userId: string, department: string, position: string): UserCompetency[] {
  const deptLower = (department || '').toLowerCase();
  const posLower = (position || '').toLowerCase();

  const isWarehouse = deptLower.includes('คลัง') || posLower.includes('warehouse') || posLower.includes('finish goods');
  const isQA = deptLower.includes('ประกัน') || deptLower.includes('qa') || posLower.includes('qc') || posLower.includes('qa');
  
  // Checking Production & specific Sub-departments / Roles
  const isExtrusion = deptLower.includes('เป่า') || deptLower.includes('extrusion') || posLower.includes('blowing') || posLower.includes('เป่า');
  const isLamination = deptLower.includes('ประกบ') || deptLower.includes('ลามิเนต') || deptLower.includes('lamination') || posLower.includes('laminat');
  const isSlitting = deptLower.includes('ผ่า') || deptLower.includes('สลิต') || deptLower.includes('slitting') || posLower.includes('slit');
  const isBagMaking = deptLower.includes('ขึ้นรูป') || deptLower.includes('ถุง') || deptLower.includes('bag') || posLower.includes('bag') || posLower.includes('converting');
  const isMaintenance = deptLower.includes('วิศวกรรม') || deptLower.includes('ซ่อมบำรุง') || deptLower.includes('engineering') || posLower.includes('engineer') || posLower.includes('maint');

  const isProduction = deptLower.includes('ผลิต') || posLower.includes('production') || isExtrusion || isLamination || isSlitting || isBagMaking || isMaintenance;

  const competencies: UserCompetency[] = [];

  if (isWarehouse) {
    competencies.push({
      userId,
      skillId: 'sk-wms',
      skillName: 'การใช้งานระบบ WMS (Warehouse Management System)',
      category: 'คลังสินค้าและโลจิสติกส์',
      expectedLevel: 3,
      actualLevel: userId === 'u-4' ? 1 : 3, // Somsri is beginner
      description: 'ทักษะความเข้าใจในการรับเข้าพัสดุ เดินหาบาร์โค้ด และสั่งหยิบของผ่านหน้าจอเทอร์มินัล',
      linkedCourseId: 'c-1',
      linkedDocId: 'doc-8'
    });
    competencies.push({
      userId,
      skillId: 'sk-scan',
      skillName: 'การสแกนจัดสรรคิวอาร์บาร์โค้ดหน้าคลังพัสดุ',
      category: 'คลังสินค้าและโลจิสติกส์',
      expectedLevel: 3,
      actualLevel: userId === 'u-4' ? 2 : 3,
      description: 'ทักษะการสแกนรับวัตถุดิบลงรหัสในระบบ ERP โรงงานอย่างถูกต้อง',
      linkedCourseId: 'c-1',
      linkedDocId: 'doc-8'
    });
    competencies.push({
      userId,
      skillId: 'sk-forklift',
      skillName: 'ความปลอดภัยและการขับขี่รถยกไฟฟ้า Forklift',
      category: 'ความปลอดภัยหน้างาน',
      expectedLevel: 3,
      actualLevel: userId === 'u-4' ? 1 : 3,
      description: 'ใบอนุญาตการขับขี่ การเลี้ยวหลบสิ่งกีดขวางในคลังแคบ และการจัดวางบนชั้นแร็คสูง',
      linkedCourseId: 'c-3',
      linkedDocId: 'doc-3'
    });
    competencies.push({
      userId,
      skillId: 'sk-5s',
      skillName: 'มาตรฐาน 5ส และความปลอดภัยในโรงงานผลิต',
      category: 'ความปลอดภัยหน้างาน',
      expectedLevel: 4,
      actualLevel: userId === 'u-4' ? 2 : 4,
      description: 'มาตรฐานความมีวินัย สะสาง สะดวก สะอาด สุขลักษณะ ในสถานประกอบอุตสาหกรรม',
      linkedCourseId: 'c-1',
      linkedDocId: 'doc-1'
    });
  } else if (isProduction) {
    // 1. Sub-department: Extrusion / Blow Film
    if (isExtrusion) {
      competencies.push({
        userId,
        skillId: 'sk-blowing',
        skillName: 'การเป่าขึ้นรูปฟิล์มพลาสติก (Film Blowing Extrusion)',
        category: 'งานเป่าฟิล์ม (Extrusion)',
        expectedLevel: 4,
        actualLevel: userId === 'u-2' ? 4 : 3,
        description: 'ความชำนาญในการคุมรอบสกรูเป่าฟิล์ม ลบโพรงอากาศ และปรับสัดส่วนคอมพาวด์บับเบิ้ล',
        linkedCourseId: 'c-2',
        linkedDocId: 'doc-2'
      });
      competencies.push({
        userId,
        skillId: 'sk-temp',
        skillName: 'การควบคุมความร้อนหน้ากระบอกสูบ (Barrel Extruder Temp)',
        category: 'งานเป่าฟิล์ม (Extrusion)',
        expectedLevel: 3,
        actualLevel: userId === 'u-2' ? 4 : 2,
        description: 'การปรับอุณหภูมิ Barrel Zone 1-4 ตามคุณสมบัติเม็ดพลาสติก LDPE/LLDPE',
        linkedCourseId: 'c-2',
        linkedDocId: 'doc-4'
      });
      competencies.push({
        userId,
        skillId: 'sk-air',
        skillName: 'การปรับวงแหวนควบคุมลมหนาฟิล์ม (Air Ring Adjustment)',
        category: 'งานเป่าฟิล์ม (Extrusion)',
        expectedLevel: 3,
        actualLevel: 3,
        description: 'การกระจายปริมาณแรงลมผ่าน Air Ring เพื่อสยบปัญหารอยหนาบางเบี้ยวของพลาสติก',
        linkedCourseId: 'c-2',
        linkedDocId: 'doc-4'
      });
    }

    // 2. Sub-department: Lamination (ประกบฟิล์ม)
    if (isLamination) {
      competencies.push({
        userId,
        skillId: 'sk-lam-ratio',
        skillName: 'การผสมและควบคุมอัตราส่วนกาวลามิเนต (Adhesive Mixing Ratio)',
        category: 'งานประกบฟิล์ม (Lamination)',
        expectedLevel: 4,
        actualLevel: 3,
        description: 'การเตรียมกาว Solventless/Dry Lamination ตามมาตรฐานสัดส่วนเคมีและความหนืด',
        linkedCourseId: 'c-2',
        linkedDocId: 'doc-6'
      });
      competencies.push({
        userId,
        skillId: 'sk-lam-tension',
        skillName: 'การควบคุมแรงดึงยึดฟิล์ม (Web Tension Control)',
        category: 'งานประกบฟิล์ม (Lamination)',
        expectedLevel: 4,
        actualLevel: 3,
        description: 'การปรับตั้งแรงดึงม้วนฟิล์มเข้ากาวเพื่อป้องกันปัญหารอยย่นและชั้นฟิล์มหลุดร่อน (Delamination)',
        linkedCourseId: 'c-2',
        linkedDocId: 'doc-6'
      });
      competencies.push({
        userId,
        skillId: 'sk-corona',
        skillName: 'การวัดและปรับค่าโคโรน่าปรับสภาพผิวฟิล์ม (Corona Treatment)',
        category: 'งานประกบฟิล์ม (Lamination)',
        expectedLevel: 3,
        actualLevel: 3,
        description: 'การใช้ปากกา Dyne Test วัดแรงตึงผิวฟิล์มก่อนผ่านลูกกลิ้งกาวลามิเนต',
        linkedCourseId: 'c-2',
        linkedDocId: 'doc-6'
      });
    }

    // 3. Sub-department: Slitting (ผ่าม้วนฟิล์ม)
    if (isSlitting) {
      competencies.push({
        userId,
        skillId: 'sk-slit-knife',
        skillName: 'การเซ็ตตั้งระยะใบมีดผ่าฟิล์ม (Slitting Knife Alignment)',
        category: 'งานผ่าฟิล์ม (Slitting)',
        expectedLevel: 4,
        actualLevel: 3,
        description: 'การปรับระยะใบนิดตัดขอบม้วนฟิล์มตรงตามขนาดคำสั่งผลิต (BOM) โดยไม่มีรอยขุย',
        linkedCourseId: 'c-2',
        linkedDocId: 'doc-2'
      });
      competencies.push({
        userId,
        skillId: 'sk-rewind',
        skillName: 'การควบคุมความตึงและทรงม้วนกรอกลับ (Rewind Tension)',
        category: 'งานผ่าฟิล์ม (Slitting)',
        expectedLevel: 3,
        actualLevel: 3,
        description: 'การคุมตึงม้วนลูกขอบสลิตเพื่อไม่ให้ม้วนฟิล์มส้นหลวมหรือนูนตึงเกินไป',
        linkedCourseId: 'c-2',
        linkedDocId: 'doc-2'
      });
    }

    // 4. Sub-department: Bag Making (แปรรูปขึ้นรูปถุง)
    if (isBagMaking) {
      competencies.push({
        userId,
        skillId: 'sk-heat-seal',
        skillName: 'การปรับอุณหภูมิและความดันสันซีลความร้อน (Heat Seal Bar Control)',
        category: 'งานแปรรูปถุง (Bag Making)',
        expectedLevel: 4,
        actualLevel: 3,
        description: 'การตั้งค่าอุณหภูมิและเวลาการกดซีลถุงบรรจุภัณฑ์เพื่อป้องกันก้นถุงรั่วซึม',
        linkedCourseId: 'c-2',
        linkedDocId: 'doc-2'
      });
      competencies.push({
        userId,
        skillId: 'sk-punching',
        skillName: 'การตั้งระยะเจาะหูและโฟโตเซ็นเซอร์ตัดถุง (Punching & Sensor Tuning)',
        category: 'งานแปรรูปถุง (Bag Making)',
        expectedLevel: 3,
        actualLevel: 3,
        description: 'การตั้งระยะ Eye-mark จับระยะพิมพ์กวดตัดถุงแม่นยำระดับมิลลิเมตร',
        linkedCourseId: 'c-2',
        linkedDocId: 'doc-2'
      });
    }

    // 5. Sub-department: Maintenance & Engineering (ซ่อมบำรุง)
    if (isMaintenance) {
      competencies.push({
        userId,
        skillId: 'sk-maint-pm',
        skillName: 'การวางแผนและปฏิบัติงานซ่อมบำรุงเชิงป้องกัน (PM Machine Maintenance)',
        category: 'วิศวกรรมและซ่อมบำรุง',
        expectedLevel: 4,
        actualLevel: userId === 'u-2' ? 4 : 3,
        description: 'การตรวจเช็คระบบไฟฟ้า มอเตอร์ ไฮดรอลิก และระบบทำความเย็นในสายการผลิต',
        linkedCourseId: 'c-3',
        linkedDocId: 'doc-6'
      });
      competencies.push({
        userId,
        skillId: 'sk-sensor-calib',
        skillName: 'การทำความสะอาดและคาลิเบรตเซ็นเซอร์เครื่องจักร',
        category: 'วิศวกรรมและซ่อมบำรุง',
        expectedLevel: 3,
        actualLevel: 3,
        description: 'การดูแลรักษาระบบ Photo Sensor, Thermocouple และระบบ Inverter ควบคุมความเร็วรอบ',
        linkedCourseId: 'c-3',
        linkedDocId: 'doc-6'
      });
    }

    // Fallback: Default General Production skills if no specific sub-department was matched
    if (competencies.length === 0) {
      competencies.push({
        userId,
        skillId: 'sk-blowing',
        skillName: 'การเป่าขึ้นรูปฟิล์มพลาสติก (Film Blowing Extrusion)',
        category: 'เทคนิคการผลิตหลัก',
        expectedLevel: 4,
        actualLevel: userId === 'u-2' ? 4 : 2,
        description: 'ความชำนาญในการคุมรอบสกรูเป่าฟิล์ม ลบโพรงอากาศ และปรับสัดส่วนคอมพาวด์บับเบิ้ล',
        linkedCourseId: 'c-2',
        linkedDocId: 'doc-2'
      });
      competencies.push({
        userId,
        skillId: 'sk-temp',
        skillName: 'การควบคุมความร้อนหน้ากระบอกสูบ (Barrel Extruder Temp)',
        category: 'เทคนิคการผลิตหลัก',
        expectedLevel: 3,
        actualLevel: userId === 'u-2' ? 4 : 2,
        description: 'การปรับอุณหภูมิ Barrel Zone 1-4 ตามคุณสมบัติเม็ดพลาสติก LDPE/LLDPE',
        linkedCourseId: 'c-2',
        linkedDocId: 'doc-4'
      });
    }

    // Common Production Safety Skill for all Production employees
    competencies.push({
      userId,
      skillId: 'sk-5s',
      skillName: 'มาตรฐาน 5ส และความปลอดภัยในโรงงานผลิต',
      category: 'ความปลอดภัยหน้างาน',
      expectedLevel: 4,
      actualLevel: 4,
      description: 'มาตรฐานความมีวินัย สะสาง สะดวก สะอาด สุขลักษณะ ในสถานประกอบอุตสาหกรรม',
      linkedCourseId: 'c-1',
      linkedDocId: 'doc-1'
    });
  } else if (isQA) {
    competencies.push({
      userId,
      skillId: 'sk-moisture',
      skillName: 'การใช้เครื่องอบวิเคราะห์ความชื้นสารละลาย (Moisture Analyzer Lab)',
      category: 'ควบคุมคุณภาพ (QC)',
      expectedLevel: 4,
      actualLevel: userId === 'u-3' ? 4 : 2, // Darin is Supervisor expert
      description: 'ปฏิบัติการเครื่อง Sartorius ชั่งตัวอย่าง 10g คุมความร้อน 120 องศาเซลเซียสเพื่อหาค่าเปอร์เซ็นต์น้ำ',
      linkedCourseId: 'c-2',
      linkedDocId: 'doc-5'
    });
    competencies.push({
      userId,
      skillId: 'sk-incoming',
      skillName: 'การตรวจสุ่มรับวัตถุดิบขาเข้า Incoming QC',
      category: 'ควบคุมคุณภาพ (QC)',
      expectedLevel: 4,
      actualLevel: userId === 'u-3' ? 4 : 2,
      description: 'ขั้นตอนการเลือกตักเม็ดสกัดตามเกณฑ์สากล MIL-STD-105E และจดรายงานเบี่ยงเบนมาตรฐาน SD',
      linkedCourseId: 'c-2',
      linkedDocId: 'doc-3'
    });
    competencies.push({
      userId,
      skillId: 'sk-gmp',
      skillName: 'มาตรฐานความปลอดภัยอาหาร GMP/HACCP บรรจุภัณฑ์',
      category: 'มาตรฐานคุณภาพสากล',
      expectedLevel: 4,
      actualLevel: userId === 'u-3' ? 4 : 3,
      description: 'กฎอนามัยป้องกันฝุ่นละออง ผม รังแค สิ่งแปลกปลอมตกลงสู่ฟอยล์ flexible packaging อาหาร',
      linkedCourseId: 'c-2',
      linkedDocId: 'doc-1'
    });
    competencies.push({
      userId,
      skillId: 'sk-mfi',
      skillName: 'การทดสอบ Melt Flow Index (MFI) ดัชนีการไหล',
      category: 'ควบคุมคุณภาพ (QC)',
      expectedLevel: 3,
      actualLevel: userId === 'u-3' ? 3 : 2,
      description: 'การทดสอบความลื่นไหลพลาสติกร้อนในเครื่องอัดตามเกณฑ์มาตรฐาน ASTM D1238',
      linkedCourseId: 'c-2',
      linkedDocId: 'doc-3'
    });
  } else {
    // Default Admin / Managing Director competencies
    competencies.push({
      userId,
      skillId: 'sk-audit-lead',
      skillName: 'ระบบบริหารและรับการตรวจสอบหลักสูตร ISO 9001',
      category: 'บริหารจัดการคุณภาพ',
      expectedLevel: 4,
      actualLevel: 4,
      description: 'ทักษะจัดแจงแฟ้มความรู้ ควบคุมประวัติสอบพนักงาน และประสานงานผู้ตรวจสอบภายนอก',
      linkedCourseId: 'c-1',
      linkedDocId: 'doc-1'
    });
    competencies.push({
      userId,
      skillId: 'sk-sustainable',
      skillName: 'มาตรฐานโรงงานยั่งยืนเศรษฐกิจหมุนเวียน (Circular Economy)',
      category: 'ความยั่งยืนองค์กร',
      expectedLevel: 4,
      actualLevel: 3,
      description: 'การจัดการของเสียพลาสติกเหลือพิมพ์ นำกลับมารีไซเคิลเป็นส่วนล่างเพื่อสังคมสีเขียว',
      linkedCourseId: 'c-2',
      linkedDocId: 'doc-8'
    });
  }

  return competencies;
}

/**
 * Returns initial list of user certificates at RMP with calculated expiries relative to 2026-06-22
 */
export function getInitialCertificates(userId: string, employeeId: string): UserCertificate[] {
  return [];
}

/**
 * Dynamically computes remaining days and state of certificates based on 2026-06-22 anchor
 */
export function calculateRemainingDays(certs: UserCertificate[]): UserCertificate[] {
  const anchorTime = new Date(ANCHOR_DATE).getTime();

  return certs.map(cert => {
    const expTime = new Date(cert.expiryDate).getTime();
    const diffTime = expTime - anchorTime;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let status: CertStatus = 'Valid';
    if (diffDays <= 0) {
      status = 'Expired';
    } else if (diffDays <= 45) {
      status = 'ExpiringSoon'; // Warning range
    }

    return {
      ...cert,
      daysRemaining: diffDays,
      status
    };
  });
}

/**
 * Returns initial KM Contribution Logs for points & gamification tracking
 */
export function getInitialKMContributionLogs(): KMContributionLog[] {
  return [];
}

/**
 * Computes active standings of users based on gamification points logs
 */
export function calculateLeaderboard(logs: KMContributionLog[], users: any[] = []): UserKMPoints[] {
  const scores: { [uid: string]: number } = {};

  // Calculate from logs
  logs.forEach(log => {
    scores[log.userId] = (scores[log.userId] || 0) + log.points;
  });

  return users.map(u => {
    const totalPoints = scores[u.id] || 0;
    let level = 1;
    if (totalPoints >= 250) level = 5;
    else if (totalPoints >= 180) level = 4;
    else if (totalPoints >= 120) level = 3;
    else if (totalPoints >= 60) level = 2;

    return {
      userId: u.id,
      userName: u.name,
      employeeId: u.employeeId,
      department: u.department,
      points: totalPoints,
      level
    };
  }).sort((a, b) => b.points - a.points);
}
