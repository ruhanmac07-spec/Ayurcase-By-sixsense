import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { FacilityCapability } from '@/types';

export async function GET() {
  const facilities = db.getFacilities();
  return NextResponse.json(facilities);
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { facilityId, capability } = body;
    if (!facilityId || !capability) {
      return NextResponse.json({ error: 'facilityId and capability are required' }, { status: 400 });
    }
    const updated = db.toggleFacilityCapability(facilityId, capability as FacilityCapability);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
