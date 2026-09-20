import { z } from 'zod';

export type UserRole = 'PATIENT' | 'DOCTOR' | 'HOSPITAL_DOCTOR' | 'HOSPITAL_ADMIN';

export interface UserSession {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
  mobile: string;
  organizationId?: string;
  organizationName?: string;
}

export type DataProvenanceType =
  | 'PATIENT_ENTERED'
  | 'DOCTOR_ENTERED'
  | 'OCR_EXTRACTED'
  | 'AI_SUGGESTED'
  | 'DOCTOR_VERIFIED'
  | 'DOCUMENT_OCR_VERIFIED'
  | 'CLINICIAN_ENTERED'
  | 'COUNTER_REFERRAL';

export interface DataProvenanceObject {
  sourceType: DataProvenanceType;
  verifiedBy?: string;
  verifiedAt?: string;
  documentId?: string;
}

export type DataProvenance = DataProvenanceType | DataProvenanceObject;

export interface MedicalHistoryItem {
  id: string;
  condition: string;
  diagnosedYear?: string;
  diagnosedDate?: string;
  status: 'ACTIVE' | 'RESOLVED' | 'MANAGED';
  provenance?: DataProvenance;
  verifiedByDoctor?: string;
  verifiedAt?: string;
}

export interface PatientProfile {
  id: string;
  userId: string;
  secureTokenId: string; // Opaque ID for QR / lookup (e.g. PAT-9481-SEC)
  name: string;
  age: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  mobile: string;
  location: string;
  address: string;
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
  bloodGroup?: string;
  weightKg?: number;
  existingConditions: string[];
  allergies: string[];
  currentMedications: {
    name: string;
    dosage: string;
    frequency: string;
    provenance?: DataProvenance;
  }[];
  medicalHistory: MedicalHistoryItem[];
  consentGranted: boolean;
  createdAt: string;
}

export type UrgencyLevel = 'EMERGENCY' | 'URGENT' | 'ROUTINE';

export interface AssessmentQuestion {
  id: string;
  question: string;
  hint?: string;
  options: {
    label: string;
    value: string;
    isEmergencyFlag?: boolean;
    careCapabilityRequired?: FacilityCapability;
  }[];
}

export interface AssessmentResult {
  id: string;
  patientId: string;
  chiefComplaint: string;
  answers: Record<string, string>;
  urgencyLevel: UrgencyLevel;
  careRequirement: string;
  recommendedCapabilities: FacilityCapability[];
  aiReasoning: string[];
  patientAdvice: string;
  isEmergencyAlert: boolean;
  createdAt: string;
}

export type FacilityCapability =
  | 'CARDIOLOGY'
  | 'CATH_LAB'
  | 'ECG'
  | 'EMERGENCY_24_7'
  | 'ICU'
  | 'TRAUMA_CARE'
  | 'NEUROLOGY'
  | 'ORTHOPEDICS'
  | 'PEDIATRICS'
  | 'DIAGNOSTIC_CT_MRI'
  | 'GENERAL_MEDICINE';

export interface Facility {
  id: string;
  name: string;
  type: 'TERTIARY_CARE' | 'DISTRICT_HOSPITAL' | 'SPECIALTY_TRAUMA' | 'COMMUNITY_PHC';
  location: string;
  address: string;
  distanceKm: number;
  travelTimeMins: number;
  phone: string;
  emergencyPhone: string;
  capabilities: FacilityCapability[];
  isActive: boolean;
  demoNote?: string;
}

export type ReferralStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'SENT'
  | 'RECEIVED'
  | 'ACCEPTED'
  | 'ARRIVED'
  | 'COMPLETED_OUTCOME'
  | 'REJECTED_REDIRECTED'
  | 'CANCELLED';

// PRD-Compliant Referral Lifecycle State Machine
export const VALID_REFERRAL_TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SENT', 'ACCEPTED', 'CANCELLED'], // SENT is auto or manual
  SENT: ['RECEIVED', 'ACCEPTED', 'REJECTED_REDIRECTED', 'CANCELLED'],
  RECEIVED: ['ACCEPTED', 'REJECTED_REDIRECTED'],
  ACCEPTED: ['ARRIVED', 'REJECTED_REDIRECTED'],
  ARRIVED: ['COMPLETED_OUTCOME', 'REJECTED_REDIRECTED'],
  COMPLETED_OUTCOME: [], // Terminal outcome
  REJECTED_REDIRECTED: [], // Terminal outcome
  CANCELLED: [], // Terminal outcome
};

export function isValidReferralTransition(from: ReferralStatus, to: ReferralStatus): boolean {
  if (from === to) return true;
  const allowed = VALID_REFERRAL_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export interface ReferralEvent {
  id: string;
  referralId: string;
  status: ReferralStatus;
  actorRole: UserRole;
  actorName: string;
  timestamp: string;
  notes?: string;
}

export interface DigitalReferral {
  id: string;
  referralCode: string; // e.g. REF-2026-8912
  secureQrToken: string; // Opaque token, never raw medical JSON
  patientId: string;
  patientSnapshot: {
    name: string;
    age: number;
    gender: string;
    mobile: string;
    bloodGroup?: string;
    allergies: string[];
    medications: { name: string; dosage: string }[];
    conditions: string[];
  };
  referringDoctorId: string;
  referringDoctorName: string;
  referringClinic: string;
  receivingFacilityId: string;
  receivingFacilityName: string;
  urgency: UrgencyLevel;
  chiefComplaint: string;
  duration: string;
  clinicalFindings: string;
  vitals?: {
    bloodPressure?: string;
    heartRate?: number;
    spo2?: number;
    temperatureF?: number;
    bloodGlucose?: number;
  };
  careRequirement: string;
  requiredCapabilities: FacilityCapability[];
  aiAssessmentSummary: string;
  doctorConfirmedDecision: string;
  isDoctorOverridden: boolean;
  doctorOverrideReason?: string;
  status: ReferralStatus;
  outcomeNotes?: string;
  counterReferralFollowUp?: string;
  events: ReferralEvent[];
  createdAt: string;
  updatedAt: string;
}

export type AmbulanceStatus =
  | 'DISPATCHED'
  | 'EN_ROUTE'
  | 'AT_SCENE'
  | 'IN_TRANSIT'
  | 'ARRIVED_FACILITY'
  | 'CANCELLED';

export type SosLifecycleState =
  | 'SOS_ACTIVATED'
  | 'AMBULANCE_INITIATED'
  | 'COLLECTING_INFO'
  | 'MATCHING_FACILITIES'
  | 'FACILITY_SELECTED'
  | 'HOSPITAL_NOTIFIED'
  | 'CANCELLED';

export interface EmergencyEvent {
  id: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  bloodGroup?: string;
  allergies: string[];
  currentMedications: string[];
  existingConditions: string[];
  ambulanceId: string;
  ambulanceStatus: AmbulanceStatus;
  lifecycleState?: SosLifecycleState;
  etaMinutes: number;
  emergencySymptoms: string[];
  emergencyNotes?: string;
  careRequirement: string;
  requiredCapabilities: FacilityCapability[];
  selectedFacilityId?: string;
  selectedFacilityName?: string;
  hospitalStatus: 'ALERTED' | 'ACCEPTED' | 'PREPARING_BAY' | 'ARRIVED' | 'STABILIZED' | 'CANCELLED' | 'PRE_ARRIVAL_ACKNOWLEDGED';
  isCancelled?: boolean;
  cancellationReason?: string;
  timeline: {
    time: string;
    label: string;
    detail: string;
  }[];
  createdAt: string;
}

export type DocumentVerificationStatus = 'NEEDS_VERIFICATION' | 'VERIFIED' | 'REJECTED';

export interface MedicalDocument {
  id: string;
  patientId: string;
  title: string;
  fileType: 'PDF' | 'IMAGE_JPG' | 'IMAGE_PNG';
  uploadedAt: string;
  isReadable: boolean;
  rawTextPreview?: string;
  candidateExtraction?: {
    conditions: string[];
    medications: string[];
    vitals: Record<string, string>;
    notes: string;
    confidence: number;
  };
  verificationStatus: DocumentVerificationStatus;
  verifiedByDoctorName?: string;
  verifiedAt?: string;
}

export interface AccessAuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  patientId: string;
  patientName: string;
  action: 'PATIENT_LOOKUP' | 'PROFILE_VIEW' | 'REFERRAL_CREATE' | 'EMERGENCY_BREAK_GLASS' | 'DOCUMENT_VIEW' | 'STATUS_CHANGE';
  contextReason: string;
  isBreakGlass: boolean;
  timestamp: string;
}

export interface FacilityMatchResult {
  facility: Facility;
  matchedCapabilities: FacilityCapability[];
  missingCapabilities: FacilityCapability[];
  isFullMatch: boolean;
  matchScore?: number;
  matchExplanation: string;
}

// ==========================================
// Zod Validation Schemas
// ==========================================

export const PatientLookupSchema = z.object({
  query: z.string().min(2, 'Lookup query must be at least 2 characters').max(100),
  isBreakGlass: z.boolean().optional(),
  breakGlassReason: z.string().max(500).optional(),
});

export const TriageInputSchema = z.object({
  chiefComplaint: z.string().min(3, 'Chief complaint is required').max(500),
  duration: z.string().max(200).optional(),
  severity: z.number().min(1).max(10).optional(),
  vitals: z.object({
    bloodPressure: z.string().max(20).optional(),
    heartRate: z.number().min(30).max(250).optional(),
    spo2: z.number().min(50).max(100).optional(),
    temperatureF: z.number().min(90).max(110).optional(),
    bloodGlucose: z.number().min(20).max(800).optional(),
  }).optional(),
  patientHistory: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  additionalNotes: z.string().max(1000).optional(),
});

export const CreateReferralSchema = z.object({
  patientId: z.string().min(1),
  patientSnapshot: z.object({
    name: z.string().min(1),
    age: z.number().min(0).max(130),
    gender: z.string(),
    mobile: z.string(),
    bloodGroup: z.string().optional(),
    allergies: z.array(z.string()),
    medications: z.array(z.object({ name: z.string(), dosage: z.string() })),
    conditions: z.array(z.string()),
  }),
  referringDoctorId: z.string().min(1),
  referringDoctorName: z.string().min(1),
  referringClinic: z.string().min(1),
  receivingFacilityId: z.string().min(1),
  receivingFacilityName: z.string().min(1),
  urgency: z.enum(['EMERGENCY', 'URGENT', 'ROUTINE']),
  chiefComplaint: z.string().min(3),
  duration: z.string().optional(),
  clinicalFindings: z.string().min(3),
  vitals: z.object({
    bloodPressure: z.string().optional(),
    heartRate: z.number().optional(),
    spo2: z.number().optional(),
    temperatureF: z.number().optional(),
    bloodGlucose: z.number().optional(),
  }).optional(),
  careRequirement: z.string().min(3),
  requiredCapabilities: z.array(z.string()),
  aiAssessmentSummary: z.string().optional(),
  doctorConfirmedDecision: z.string().min(3),
  isDoctorOverridden: z.boolean().optional(),
  doctorOverrideReason: z.string().optional(),
});

export const UpdateReferralStatusSchema = z.object({
  status: z.enum([
    'DRAFT',
    'CONFIRMED',
    'SENT',
    'RECEIVED',
    'ACCEPTED',
    'ARRIVED',
    'COMPLETED_OUTCOME',
    'REJECTED_REDIRECTED',
    'CANCELLED',
  ]),
  notes: z.string().max(500).optional(),
  outcomeNotes: z.string().max(1000).optional(),
  counterReferralFollowUp: z.string().max(1000).optional(),
});

export const TriggerSosSchema = z.object({
  patientId: z.string().optional(),
  symptoms: z.array(z.string()).optional(),
  action: z.enum(['TRIGGER', 'ADVANCE_STATUS', 'CANCEL']).optional(),
  eventId: z.string().optional(),
  ambulanceStatus: z.enum(['DISPATCHED', 'EN_ROUTE', 'AT_SCENE', 'IN_TRANSIT', 'ARRIVED_FACILITY']).optional(),
  etaMinutes: z.number().min(0).max(120).optional(),
  cancellationReason: z.string().max(300).optional(),
});

export const SelectEmergencyFacilitySchema = z.object({
  eventId: z.string().min(1),
  facilityId: z.string().min(1),
  notes: z.string().max(500).optional(),
});

export const DocumentUploadSchema = z.object({
  patientId: z.string().optional(),
  title: z.string().min(3).max(200),
  fileType: z.enum(['PDF', 'IMAGE_JPG', 'IMAGE_PNG']),
  preset: z.enum(['PRESET_CARDIAC', 'PRESET_LAB', 'PRESET_UNREADABLE']).optional(),
});

export const VerifyDocumentSchema = z.object({
  documentId: z.string().min(1),
  verifiedConditions: z.array(z.string()),
  verifiedMedications: z.array(z.string()),
});
