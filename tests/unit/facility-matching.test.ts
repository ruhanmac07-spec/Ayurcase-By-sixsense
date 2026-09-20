import { describe, it, expect } from 'vitest';
import { matchFacilities } from '@/lib/services/facility';

describe('Capability-Aware Facility Matching Engine', () => {
  it('should rank facilities with Cath Lab as top match for acute cardiac emergency', () => {
    const result = matchFacilities(['CARDIOLOGY', 'CATH_LAB', 'EMERGENCY_24_7', 'ICU'], 3);
    
    expect(result.matches.length).toBeGreaterThan(0);
    const topMatch = result.matches[0];
    
    expect(topMatch.facility.capabilities).toContain('CATH_LAB');
    expect(topMatch.facility.capabilities).toContain('CARDIOLOGY');
    expect(topMatch.isFullMatch).toBe(true);
    expect(topMatch.matchScore).toBeGreaterThanOrEqual(90);
  });

  it('should not rank a closer facility higher if it lacks critical required capabilities', () => {
    const result = matchFacilities(['CATH_LAB', 'ICU']);
    
    // Anand Rural PHC is at distance 0km, but lacks CATH_LAB and ICU.
    // Sterling Apex is at 14.5km, but has both CATH_LAB and ICU.
    const firstFacility = result.matches[0].facility;
    expect(firstFacility.capabilities).toContain('CATH_LAB');
    expect(firstFacility.name).not.toBe('Anand Rural Community PHC');
  });

  it('should handle zero-match scenarios gracefully with fallback guidance', () => {
    // Requesting impossible capability set
    const result = matchFacilities(['ORGAN_TRANSPLANT_SPECIALTY' as any, 'PEDIATRIC_CARDIO_SURGERY' as any]);
    
    expect(result.fallbackActivated).toBe(true);
    expect(result.zeroMatchGuidance).toBeDefined();
    expect(result.zeroMatchGuidance).toContain('tele-consultation');
  });
});
