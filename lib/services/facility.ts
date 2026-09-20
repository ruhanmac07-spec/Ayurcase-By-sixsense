import { Facility, FacilityCapability, FacilityMatchResult } from '@/types';
import { db } from '@/lib/db';

export interface FacilityMatchingOutput {
  matches: FacilityMatchResult[];
  requiredCapabilities: FacilityCapability[];
  hasFullMatch: boolean;
  fallbackActivated?: boolean;
  zeroMatchGuidance?: string;
  message?: string;
}

export function matchFacilities(
  requiredCapabilities: FacilityCapability[],
  optionsOrMax?: number | {
    isEmergency?: boolean;
    maxResults?: number;
  }
): FacilityMatchingOutput {
  const maxResults = typeof optionsOrMax === 'number' 
    ? optionsOrMax 
    : (optionsOrMax?.maxResults ?? 3);
  const allFacilities = db.getFacilities().filter((f) => f.isActive);

  if (requiredCapabilities.length === 0) {
    // If no specific capability requested, return general medicine facilities sorted by proximity
    const generalMatches = allFacilities.map((facility) => ({
      facility,
      matchedCapabilities: facility.capabilities,
      missingCapabilities: [],
      isFullMatch: true,
      matchScore: 100,
      matchExplanation: `General facility available for routine outpatient care. Located ${facility.distanceKm} km away.`,
    }));
    generalMatches.sort((a, b) => a.facility.distanceKm - b.facility.distanceKm);
    return {
      matches: generalMatches.slice(0, maxResults),
      requiredCapabilities,
      hasFullMatch: true,
    };
  }

  const results: FacilityMatchResult[] = allFacilities.map((facility) => {
    const matched = requiredCapabilities.filter((c) => facility.capabilities.includes(c));
    const missing = requiredCapabilities.filter((c) => !facility.capabilities.includes(c));
    const isFullMatch = missing.length === 0;
    const matchScore = Math.round((matched.length / requiredCapabilities.length) * 100);

    let explanation = '';
    if (isFullMatch) {
      explanation = `Fully matches all required capabilities (${matched.join(', ')}). Located ${facility.distanceKm} km (${facility.travelTimeMins} mins) away.`;
    } else if (matched.length > 0) {
      explanation = `Partially matches: provides ${matched.join(', ')}, but lacks mandatory ${missing.join(', ')}. Located ${facility.distanceKm} km away.`;
    } else {
      explanation = `Lacks all required specialized capabilities (${requiredCapabilities.join(', ')}).`;
    }

    return {
      facility,
      matchedCapabilities: matched,
      missingCapabilities: missing,
      isFullMatch,
      matchScore,
      matchExplanation: explanation,
    };
  });

  // Sort: full matches first, then count of matched capabilities, then distance
  results.sort((a, b) => {
    if (a.isFullMatch && !b.isFullMatch) return -1;
    if (!a.isFullMatch && b.isFullMatch) return 1;
    if (a.matchedCapabilities.length !== b.matchedCapabilities.length) {
      return b.matchedCapabilities.length - a.matchedCapabilities.length;
    }
    return a.facility.distanceKm - b.facility.distanceKm;
  });

  const fullMatches = results.filter((r) => r.isFullMatch);
  const hasFullMatch = fullMatches.length > 0;
  const anyPartialMatch = results.some((r) => r.matchedCapabilities.length > 0);

  let message: string | undefined;
  let fallbackActivated = false;
  let zeroMatchGuidance: string | undefined;

  if (!hasFullMatch) {
    if (!anyPartialMatch) {
      fallbackActivated = true;
      zeroMatchGuidance =
        'Zero regional facilities match the required capability set. Immediate clinician tele-consultation and regional tertiary hospital emergency dispatch recommended.';
      message = zeroMatchGuidance;
    } else {
      message = 'No facility in this region satisfies 100% of the required specialized capabilities. Showing nearest partial matches.';
    }
  }

  return {
    matches: results.slice(0, maxResults),
    requiredCapabilities,
    hasFullMatch,
    fallbackActivated,
    zeroMatchGuidance,
    message,
  };
}
