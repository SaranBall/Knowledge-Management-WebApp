import {
  UserCompetency,
  UserCertificate,
  KMContributionLog,
  UserKMPoints,
  CertStatus,
} from "../types";

/**
 * Returns initial competencies mapped to a user based on their position & department.
 *
 * TODO: ยังไม่ implement logic การคำนวณ competency matrix จริง — ปัจจุบัน return
 * array ว่างเสมอ เมื่อมีการออกแบบ competency matrix ต่อตำแหน่ง/แผนกแล้ว ค่อยกลับมา
 * เติม logic ตรงนี้โดยอ้างอิง mainDept.code / dept.code ตามที่ตั้งใจไว้เดิม
 */
export function getInitialCompetencies(
  userId: string,
  departmentId: string,
  position: string,
): UserCompetency[] {
  return [];
}

/**
 * Returns initial list of user certificates at RMP with calculated expiries relative to the current date
 */
export function getInitialCertificates(
  userId: string,
  employeeId: string,
): UserCertificate[] {
  return [];
}

/**
 * Dynamically computes remaining days and state of certificates based on the
 * actual current date (not a hardcoded anchor date)
 */
export function calculateRemainingDays(
  certs: UserCertificate[],
): UserCertificate[] {
  const anchorTime = new Date().getTime();

  return certs.map((cert) => {
    const expTime = new Date(cert.expiryDate).getTime();
    const diffTime = expTime - anchorTime;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let status: CertStatus = "Valid";
    if (diffDays <= 0) {
      status = "Expired";
    } else if (diffDays <= 45) {
      status = "ExpiringSoon"; // Warning range
    }

    return {
      ...cert,
      daysRemaining: diffDays,
      status,
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
export function calculateLeaderboard(
  logs: KMContributionLog[],
  users: any[] = [],
): UserKMPoints[] {
  const scores: { [uid: string]: number } = {};

  // Calculate from logs
  logs.forEach((log) => {
    scores[log.userId] = (scores[log.userId] || 0) + log.points;
  });

  return users
    .map((u) => {
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
        departmentId: u.departmentId || "Select Department",
        points: totalPoints,
        level,
      };
    })
    .sort((a, b) => b.points - a.points);
}
