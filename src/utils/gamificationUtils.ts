import { UserCompetency, UserCertificate, KMContributionLog, UserKMPoints, CertStatus } from '../types';
import { getDepartmentById, getMainDepartmentOf} from './departmentUtils';
// Anchor current date as instructed under the 2026-06-22 timeline
export const ANCHOR_DATE = '2026-06-22';

/**
 * Returns initial competencies mapped to a user based on their position & department.
 */
export function getInitialCompetencies(userId: string, departmentId: string, position: string): UserCompetency[] {
  const mainDept = getMainDepartmentOf(departmentId);
  const dept = getDepartmentById(departmentId);

  const competencies: UserCompetency[] = [];

  const isWarehouse = mainDept?.code === 'WH';
  const isProduction = mainDept?.code === 'PD';
  const isQuality = mainDept?.code === 'QA';
  const isPurchasing = mainDept?.code === 'PM';
  const isHR = mainDept?.code === 'HR';
  const isIT = mainDept?.code === 'IT';
  const isSales = mainDept?.code === 'SM';
  const isAccounting = mainDept?.code === 'AF';
  const isProductioncontrol = mainDept?.code === 'PC';
  const isTechnical = mainDept?.code === 'TC';
  const isCustomerService = mainDept?.code === 'CS';
  const isEngineering = mainDept?.code === 'EN';
  const isFC = mainDept?.code === 'FC';
  const isQualitySafety = mainDept?.code === 'QS';
  const isPrinting = dept?.code === 'PT';
  const isDryLamination = dept?.code === 'DL';
  const isInspection = dept?.code === 'IN';
  const isSlitting = dept?.code === 'SL';
  const isBagMaking = dept?.code === 'BM';
  const isPowderSpray = dept?.code === 'PS';
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
      departmentId: u.departmentId || 'Select Department',
      points: totalPoints,
      level
    };
  }).sort((a, b) => b.points - a.points);
}
