import { describe, it, expect } from 'vitest';
import { isValidReferralTransition } from '@/types';
import { validateReferralTransition, checkReferralDeduplication } from '@/lib/services/referral';
import { DigitalReferral } from '@/types';

describe('Referral State Machine & Transition Rules', () => {
  it('should allow valid sequential lifecycle transitions', () => {
    expect(isValidReferralTransition('DRAFT', 'CONFIRMED')).toBe(true);
    expect(isValidReferralTransition('CONFIRMED', 'SENT')).toBe(true);
    expect(isValidReferralTransition('SENT', 'ACCEPTED')).toBe(true);
    expect(isValidReferralTransition('ACCEPTED', 'ARRIVED')).toBe(true);
    expect(isValidReferralTransition('ARRIVED', 'COMPLETED_OUTCOME')).toBe(true);
  });

  it('should allow cancellation from early non-terminal states', () => {
    expect(isValidReferralTransition('DRAFT', 'CANCELLED')).toBe(true);
    expect(isValidReferralTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(isValidReferralTransition('SENT', 'CANCELLED')).toBe(true);
  });

  it('should block illegal transition jumps and backward regression', () => {
    expect(isValidReferralTransition('DRAFT', 'COMPLETED_OUTCOME')).toBe(false);
    expect(isValidReferralTransition('ARRIVED', 'DRAFT')).toBe(false);
    expect(isValidReferralTransition('COMPLETED_OUTCOME', 'SENT')).toBe(false);
    expect(isValidReferralTransition('CANCELLED', 'CONFIRMED')).toBe(false);
  });

  it('should throw an informative error on invalid transition in service helper', () => {
    expect(() => {
      validateReferralTransition('DRAFT', 'ARRIVED');
    }).toThrow(/Illegal referral.*transition/);
  });

  it('should detect duplicate referral created within debounce window', () => {
    const existingReferrals: DigitalReferral[] = [
      {
        id: 'ref-test-1',
        referralCode: 'REF-2026-TEST1',
        secureQrToken: 'SIG_1234_opaque_token',
        patientId: 'pat-1',
        patientSnapshot: {} as any,
        referringDoctorId: 'usr-doctor-1',
        referringDoctorName: 'Dr. Priya Sharma',
        referringClinic: 'Anand PHC',
        receivingFacilityId: 'fac-hosp-1',
        receivingFacilityName: 'Sterling Apex Hospital',
        urgency: 'URGENT',
        chiefComplaint: 'Chest pain',
        duration: '1 hour',
        clinicalFindings: 'ST depression',
        careRequirement: 'Cath lab evaluation',
        requiredCapabilities: ['CARDIOLOGY', 'CATH_LAB'],
        aiAssessmentSummary: '',
        doctorConfirmedDecision: 'Confirmed',
        isDoctorOverridden: false,
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(), // Just created
        updatedAt: new Date().toISOString(),
        events: [],
      },
    ];

    const duplicateCheck = checkReferralDeduplication(existingReferrals, {
      patientId: 'pat-1',
      receivingFacilityId: 'fac-hosp-1',
      chiefComplaint: 'Chest pain',
    });

    expect(duplicateCheck.isDuplicate).toBe(true);
    expect(duplicateCheck.existingReferral?.id).toBe('ref-test-1');
  });
});
