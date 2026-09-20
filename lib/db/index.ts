import {
  PatientProfile,
  Facility,
  DigitalReferral,
  EmergencyEvent,
  MedicalDocument,
  AccessAuditLog,
  UserSession,
  ReferralStatus,
  FacilityCapability,
  DataProvenance,
} from '@/types';
import {
  SEED_USERS,
  SEED_PATIENTS,
  SEED_FACILITIES,
  SEED_REFERRALS,
  SEED_EMERGENCY_EVENTS,
  SEED_DOCUMENTS,
  SEED_AUDIT_LOGS,
} from './seed';
import { validateReferralTransition, checkReferralDeduplication } from '@/lib/services/referral';

// Global in-memory state with persistence simulation
class HealthDatabase {
  private users: UserSession[] = [...SEED_USERS];
  private patients: PatientProfile[] = [...SEED_PATIENTS];
  private facilities: Facility[] = [...SEED_FACILITIES];
  private referrals: DigitalReferral[] = [...SEED_REFERRALS];
  private emergencyEvents: EmergencyEvent[] = [...SEED_EMERGENCY_EVENTS];
  private documents: MedicalDocument[] = [...SEED_DOCUMENTS];
  private auditLogs: AccessAuditLog[] = [...SEED_AUDIT_LOGS];
  private activeUserId: string = 'usr-patient-1'; // Default active persona

  // User / Session methods
  getUsers(): UserSession[] {
    return this.users;
  }

  getUserById(id: string): UserSession | undefined {
    return this.users.find((u) => u.id === id);
  }

  getCurrentUser(): UserSession {
    const user = this.users.find((u) => u.id === this.activeUserId);
    return user || this.users[0];
  }

  setCurrentUser(userId: string): UserSession {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      this.activeUserId = user.id;
      return user;
    }
    return this.users[0];
  }

  // Patient methods
  getPatients(): PatientProfile[] {
    return this.patients;
  }

  getPatientById(id: string): PatientProfile | undefined {
    return this.patients.find((p) => p.id === id || p.userId === id);
  }

  getPatientByLookup(query: string): PatientProfile | undefined {
    const clean = query.trim().toLowerCase();
    return this.patients.find(
      (p) =>
        p.id.toLowerCase() === clean ||
        p.secureTokenId.toLowerCase() === clean ||
        p.mobile.replace(/\s+/g, '').includes(clean.replace(/\s+/g, '')) ||
        p.name.toLowerCase().includes(clean)
    );
  }

  updatePatient(id: string, updates: Partial<PatientProfile>): PatientProfile {
    const index = this.patients.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Patient not found');
    this.patients[index] = {
      ...this.patients[index],
      ...updates,
    };
    return this.patients[index];
  }

  addMedicalHistory(
    patientId: string,
    historyItem: {
      condition: string;
      diagnosedYear?: string;
      status: 'ACTIVE' | 'RESOLVED';
      provenance?: DataProvenance;
      verifiedByDoctor?: string;
    }
  ): PatientProfile {
    const patient = this.getPatientById(patientId);
    if (!patient) throw new Error('Patient not found');

    const newHistory = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      condition: historyItem.condition,
      diagnosedYear: historyItem.diagnosedYear || new Date().getFullYear().toString(),
      status: historyItem.status,
      provenance: historyItem.provenance || 'DOCTOR_ENTERED',
      verifiedByDoctor: historyItem.verifiedByDoctor,
      verifiedAt: new Date().toISOString(),
    };

    patient.medicalHistory.unshift(newHistory);
    // Add to existing conditions if active
    if (historyItem.status === 'ACTIVE' && !patient.existingConditions.includes(historyItem.condition)) {
      patient.existingConditions.push(historyItem.condition);
    }

    return patient;
  }

  // Facility methods
  getFacilities(): Facility[] {
    return this.facilities;
  }

  getFacilityById(id: string): Facility | undefined {
    return this.facilities.find((f) => f.id === id);
  }

  toggleFacilityCapability(facilityId: string, capability: FacilityCapability): Facility {
    const fac = this.getFacilityById(facilityId);
    if (!fac) throw new Error('Facility not found');
    if (fac.capabilities.includes(capability)) {
      fac.capabilities = fac.capabilities.filter((c) => c !== capability);
    } else {
      fac.capabilities.push(capability);
    }
    return fac;
  }

  // Referral methods
  getReferrals(): DigitalReferral[] {
    return [...this.referrals].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getReferralsForFacility(facilityId: string): DigitalReferral[] {
    return this.referrals
      .filter((r) => r.receivingFacilityId === facilityId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getReferralsForPatient(patientId: string): DigitalReferral[] {
    return this.referrals
      .filter((r) => r.patientId === patientId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getReferralById(id: string): DigitalReferral | undefined {
    return this.referrals.find((r) => r.id === id || r.referralCode === id);
  }

  createReferral(
    data: Omit<DigitalReferral, 'id' | 'referralCode' | 'secureQrToken' | 'events' | 'createdAt' | 'updatedAt'>
  ): DigitalReferral {
    // 1. Deduplication / Idempotency check: block identical referrals within 60s
    const duplicateCheck = checkReferralDeduplication(
      data.patientId,
      data.receivingFacilityId,
      data.chiefComplaint
    );
    if (duplicateCheck.isDuplicate && duplicateCheck.existingReferral) {
      return duplicateCheck.existingReferral;
    }

    const refId = `ref-${Date.now()}`;
    const codeNum = Math.floor(1000 + Math.random() * 9000);
    const referralCode = `REF-2026-${codeNum}`;
    const secureQrToken = `SIG_${codeNum}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const newReferral: DigitalReferral = {
      ...data,
      id: refId,
      referralCode,
      secureQrToken,
      events: [
        {
          id: `ev-${Date.now()}-1`,
          referralId: refId,
          status: 'CONFIRMED',
          actorRole: 'DOCTOR',
          actorName: data.referringDoctorName,
          timestamp: now,
          notes: 'Referral confirmed by referring doctor.',
        },
        {
          id: `ev-${Date.now()}-2`,
          referralId: refId,
          status: 'SENT',
          actorRole: 'DOCTOR',
          actorName: data.referringDoctorName,
          timestamp: now,
          notes: `Transmitted digitally to ${data.receivingFacilityName}.`,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    this.referrals.unshift(newReferral);

    // Audit log
    this.logAudit({
      userId: data.referringDoctorId,
      userName: data.referringDoctorName,
      userRole: 'DOCTOR',
      patientId: data.patientId,
      patientName: data.patientSnapshot.name,
      action: 'REFERRAL_CREATE',
      contextReason: `Created referral ${referralCode} to ${data.receivingFacilityName}`,
      isBreakGlass: false,
    });

    return newReferral;
  }

  updateReferralStatus(
    referralId: string,
    status: ReferralStatus,
    actorRole: 'DOCTOR' | 'HOSPITAL_DOCTOR' | 'HOSPITAL_ADMIN',
    actorName: string,
    notes?: string,
    outcomeNotes?: string,
    counterReferralFollowUp?: string
  ): DigitalReferral {
    const referral = this.getReferralById(referralId);
    if (!referral) throw new Error('Referral not found');

    // 2. Strict State Machine Validation
    validateReferralTransition(referral.status, status);

    const now = new Date().toISOString();
    referral.status = status;
    referral.updatedAt = now;
    if (outcomeNotes) referral.outcomeNotes = outcomeNotes;
    if (counterReferralFollowUp) referral.counterReferralFollowUp = counterReferralFollowUp;

    referral.events.push({
      id: `ev-${Date.now()}`,
      referralId: referral.id,
      status,
      actorRole,
      actorName,
      timestamp: now,
      notes: notes || `Referral status updated to ${status}.`,
    });

    // Log audit
    this.logAudit({
      userId: actorName,
      userName: actorName,
      userRole: actorRole,
      patientId: referral.patientId,
      patientName: referral.patientSnapshot.name,
      action: 'STATUS_CHANGE',
      contextReason: `Updated referral ${referral.referralCode} status from '${referral.status}' to '${status}'. Notes: ${notes || 'None'}`,
      isBreakGlass: false,
    });

    return referral;
  }

  // Emergency SOS methods
  getEmergencyEvents(): EmergencyEvent[] {
    return [...this.emergencyEvents]
      .filter((e) => !e.isCancelled)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getEmergencyEventById(id: string): EmergencyEvent | undefined {
    return this.emergencyEvents.find((e) => e.id === id);
  }

  createEmergencyEvent(patientId: string, emergencySymptoms: string[] = []): EmergencyEvent {
    const patient = this.getPatientById(patientId);
    if (!patient) throw new Error('Patient not found');

    // 3. Deduplication: Check if there is an active SOS event for this patient within the last 15 minutes
    const fifteenMinsAgo = Date.now() - 15 * 60 * 1000;
    const activeExisting = this.emergencyEvents.find(
      (e) =>
        e.patientId === patient.id &&
        !e.isCancelled &&
        e.hospitalStatus !== 'STABILIZED' &&
        new Date(e.createdAt).getTime() > fifteenMinsAgo
    );

    if (activeExisting) {
      // Append any new symptoms if provided
      if (emergencySymptoms.length > 0) {
        emergencySymptoms.forEach((s) => {
          if (!activeExisting.emergencySymptoms.includes(s)) {
            activeExisting.emergencySymptoms.push(s);
          }
        });
      }
      return activeExisting;
    }

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const ambNum = Math.floor(1000 + Math.random() * 9000);
    const ambId = `AMB-GJ-01-${ambNum}`;

    const newEvent: EmergencyEvent = {
      id: `sos-${Date.now()}`,
      patientId: patient.id,
      patientName: patient.name,
      patientAge: patient.age,
      patientGender: patient.gender,
      bloodGroup: patient.bloodGroup,
      allergies: patient.allergies,
      currentMedications: patient.currentMedications.map((m) => `${m.name} ${m.dosage}`),
      existingConditions: patient.existingConditions,
      ambulanceId: ambId,
      ambulanceStatus: 'DISPATCHED',
      lifecycleState: 'AMBULANCE_INITIATED',
      etaMinutes: 8,
      emergencySymptoms: emergencySymptoms.length > 0 ? emergencySymptoms : ['Critical Emergency SOS triggered'],
      careRequirement: 'Urgent Emergency Department & Resuscitation Triage',
      requiredCapabilities: ['EMERGENCY_24_7', 'ECG', 'ICU'],
      hospitalStatus: 'ALERTED',
      timeline: [
        {
          time: timeStr,
          label: 'SOS Emergency Triggered',
          detail: 'Emergency button activated from patient app.',
        },
        {
          time: timeStr,
          label: 'Immediate 108 Dispatch',
          detail: `Ambulance unit ${ambId} dispatched. GPS telematics connected.`,
        },
      ],
      createdAt: now.toISOString(),
    };

    this.emergencyEvents.unshift(newEvent);

    this.logAudit({
      userId: patient.userId,
      userName: patient.name,
      userRole: 'PATIENT',
      patientId: patient.id,
      patientName: patient.name,
      action: 'EMERGENCY_BREAK_GLASS',
      contextReason: 'Patient triggered Emergency SOS Fast-Lane.',
      isBreakGlass: true,
    });

    return newEvent;
  }

  cancelEmergencyEvent(id: string, reason: string): EmergencyEvent {
    const event = this.getEmergencyEventById(id);
    if (!event) throw new Error('Emergency event not found');

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    event.isCancelled = true;
    event.cancellationReason = reason;
    event.lifecycleState = 'CANCELLED';
    event.ambulanceStatus = 'CANCELLED';
    event.hospitalStatus = 'CANCELLED';
    event.timeline.push({
      time: timeStr,
      label: 'Emergency De-escalated / False Alarm',
      detail: `SOS cancelled by user. Reason: ${reason}`,
    });

    this.logAudit({
      userId: event.patientId,
      userName: event.patientName,
      userRole: 'PATIENT',
      patientId: event.patientId,
      patientName: event.patientName,
      action: 'STATUS_CHANGE',
      contextReason: `De-escalated SOS event ${id}. Reason: ${reason}`,
      isBreakGlass: false,
    });

    return event;
  }

  updateEmergencyEvent(
    id: string,
    updates: Partial<EmergencyEvent>,
    timelineEntry?: { label: string; detail: string }
  ): EmergencyEvent {
    const event = this.getEmergencyEventById(id);
    if (!event) throw new Error('Emergency event not found');

    Object.assign(event, updates);

    if (timelineEntry) {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      event.timeline.push({
        time: timeStr,
        label: timelineEntry.label,
        detail: timelineEntry.detail,
      });
    }

    return event;
  }

  // Document methods
  getDocuments(patientId?: string): MedicalDocument[] {
    if (patientId) {
      return this.documents.filter((d) => d.patientId === patientId);
    }
    return this.documents;
  }

  getDocumentById(id: string): MedicalDocument | undefined {
    return this.documents.find((d) => d.id === id);
  }

  createDocument(doc: Omit<MedicalDocument, 'id' | 'uploadedAt'>): MedicalDocument {
    const newDoc: MedicalDocument = {
      ...doc,
      id: `doc-${Date.now()}`,
      uploadedAt: new Date().toISOString(),
    };
    this.documents.unshift(newDoc);
    return newDoc;
  }

  verifyDocument(
    id: string,
    doctorName: string,
    verifiedConditions: string[],
    verifiedMedications: string[]
  ): MedicalDocument {
    const doc = this.getDocumentById(id);
    if (!doc) throw new Error('Document not found');

    doc.verificationStatus = 'VERIFIED';
    doc.verifiedByDoctorName = doctorName;
    doc.verifiedAt = new Date().toISOString();

    // Commit to patient structured history with strict provenance
    const patient = this.getPatientById(doc.patientId);
    if (patient) {
      verifiedConditions.forEach((cond) => {
        if (!patient.existingConditions.includes(cond)) {
          patient.existingConditions.push(cond);
        }
        patient.medicalHistory.unshift({
          id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          condition: cond,
          diagnosedDate: new Date().toISOString().split('T')[0],
          status: 'ACTIVE',
          provenance: {
            sourceType: 'DOCUMENT_OCR_VERIFIED',
            verifiedBy: doctorName,
            verifiedAt: new Date().toISOString(),
            documentId: doc.id,
          },
        });
      });

      verifiedMedications.forEach((medStr) => {
        if (!patient.currentMedications.some((m) => m.name.toLowerCase() === medStr.toLowerCase())) {
          patient.currentMedications.push({
            name: medStr,
            dosage: 'As prescribed',
            frequency: 'Daily',
            provenance: {
              sourceType: 'DOCUMENT_OCR_VERIFIED',
              verifiedBy: doctorName,
              verifiedAt: new Date().toISOString(),
              documentId: doc.id,
            },
          });
        }
      });
    }

    this.logAudit({
      userId: doctorName,
      userName: doctorName,
      userRole: 'DOCTOR',
      patientId: doc.patientId,
      patientName: patient?.name || 'Unknown',
      action: 'STATUS_CHANGE',
      contextReason: `Clinician verified document ${doc.title} and committed findings with DOCTOR_VERIFIED provenance.`,
      isBreakGlass: false,
    });

    return doc;
  }

  // Audit Logs
  getAuditLogs(): AccessAuditLog[] {
    return [...this.auditLogs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  logAudit(entry: Omit<AccessAuditLog, 'id' | 'timestamp'>): AccessAuditLog {
    const newEntry: AccessAuditLog = {
      ...entry,
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.auditLogs.unshift(newEntry);
    return newEntry;
  }
}

// Global Singleton for Next.js in-process database
declare global {
  // eslint-disable-next-line no-var
  var __HEALTH_DB__: HealthDatabase | undefined;
}

export const db: HealthDatabase = globalThis.__HEALTH_DB__ ?? new HealthDatabase();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__HEALTH_DB__ = db;
}
