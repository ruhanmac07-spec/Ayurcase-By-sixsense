import { describe, it, expect } from 'vitest';
import { runClinicalTriage } from '@/lib/services/triage';

describe('Deterministic Clinical Triage Rules Engine', () => {
  it('should flag acute chest pain with diaphoresis as EMERGENCY with Cath Lab capability', async () => {
    const result = await runClinicalTriage({
      chiefComplaint: 'Crushing chest pain radiating to left arm with cold sweat',
      severity: 9,
      duration: '45 minutes',
      vitals: {
        bloodPressure: '165/100',
        heartRate: 104,
        spo2: 93,
      },
    });

    expect(result.urgencyLevel).toBe('EMERGENCY');
    expect(result.isEmergencyAlert).toBe(true);
    expect(result.requiredCapabilities).toContain('CARDIOLOGY');
    expect(result.requiredCapabilities).toContain('CATH_LAB');
    expect(result.requiredCapabilities).toContain('EMERGENCY_24_7');
    expect(result.careRequirement).toContain('Emergency Cardiology');
  });

  it('should triage mild viral cold symptoms as ROUTINE with general medicine', async () => {
    const result = await runClinicalTriage({
      chiefComplaint: 'Mild runny nose, throat tickle, and low-grade body ache',
      severity: 2,
      duration: '3 days',
      vitals: {
        bloodPressure: '120/80',
        heartRate: 72,
        spo2: 99,
      },
    });

    expect(result.urgencyLevel).toBe('ROUTINE');
    expect(result.isEmergencyAlert).toBe(false);
    expect(result.requiredCapabilities).toContain('GENERAL_MEDICINE');
    expect(result.requiredCapabilities).not.toContain('CATH_LAB');
    expect(result.recommendedAction).toContain('primary care');
  });

  it('should flag neurological red flags (slurred speech, facial droop) as EMERGENCY with NEUROLOGY and CT/MRI', async () => {
    const result = await runClinicalTriage({
      chiefComplaint: 'Sudden weakness on right side and slurred speech',
      severity: 8,
      duration: '30 mins',
    });

    expect(result.urgencyLevel).toBe('EMERGENCY');
    expect(result.requiredCapabilities).toContain('NEUROLOGY');
    expect(result.requiredCapabilities).toContain('DIAGNOSTIC_CT_MRI');
  });
});
