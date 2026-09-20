import {
  DigitalReferral,
  ReferralStatus,
  isValidReferralTransition,
} from '@/types';
import { db } from '@/lib/db';

export class ReferralServiceError extends Error {
  constructor(public message: string, public code: string, public status: number = 400) {
    super(message);
    this.name = 'ReferralServiceError';
  }
}

export function validateReferralTransition(
  currentStatus: ReferralStatus,
  newStatus: ReferralStatus
): void {
  if (!isValidReferralTransition(currentStatus, newStatus)) {
    throw new ReferralServiceError(
      `Illegal referral status transition from '${currentStatus}' to '${newStatus}'.`,
      'INVALID_STATUS_TRANSITION',
      409
    );
  }
}

export interface ReferralDeduplicationResult {
  isDuplicate: boolean;
  existingReferral: DigitalReferral | null;
}

export function checkReferralDeduplication(
  existingOrPatientId: string | DigitalReferral[],
  receivingOrCandidate: string | { patientId: string; receivingFacilityId: string; chiefComplaint: string },
  chiefComplaint?: string
): ReferralDeduplicationResult {
  let existingList: DigitalReferral[];
  let receivingFacilityId: string;
  let complaint: string;

  if (Array.isArray(existingOrPatientId)) {
    existingList = existingOrPatientId;
    const candidate = receivingOrCandidate as { patientId: string; receivingFacilityId: string; chiefComplaint: string };
    receivingFacilityId = candidate.receivingFacilityId;
    complaint = candidate.chiefComplaint;
  } else {
    const patientId = existingOrPatientId;
    receivingFacilityId = receivingOrCandidate as string;
    complaint = chiefComplaint || '';
    existingList = db.getReferralsForPatient(patientId);
  }

  const oneMinuteAgo = Date.now() - 60 * 1000;
  const duplicate = existingList.find(
    (r) =>
      r.receivingFacilityId === receivingFacilityId &&
      r.chiefComplaint.toLowerCase() === complaint.toLowerCase() &&
      new Date(r.createdAt).getTime() > oneMinuteAgo
  );

  return {
    isDuplicate: !!duplicate,
    existingReferral: duplicate || null,
  };
}
