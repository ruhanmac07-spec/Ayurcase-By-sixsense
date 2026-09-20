import { NextRequest, NextResponse } from 'next/server';
import { matchFacilities } from '@/lib/services/facility';
import { FacilityCapability } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requiredCapabilities, isEmergency, maxResults } = body;

    if (!Array.isArray(requiredCapabilities)) {
      return NextResponse.json({ error: 'requiredCapabilities must be an array' }, { status: 400 });
    }

    const result = matchFacilities(requiredCapabilities as FacilityCapability[], {
      isEmergency: !!isEmergency,
      maxResults: maxResults || 3,
    });

    return NextResponse.json({
      matches: result.matches,
      hasFullMatch: result.hasFullMatch,
      fallbackActivated: result.fallbackActivated,
      zeroMatchGuidance: result.zeroMatchGuidance,
      message: result.message,
      requiredCapabilities,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
