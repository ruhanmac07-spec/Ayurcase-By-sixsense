import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, facilityId, notes } = body;

    if (!eventId || !facilityId) {
      return NextResponse.json({ error: 'eventId and facilityId are required' }, { status: 400 });
    }

    const facility = db.getFacilityById(facilityId);
    if (!facility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 });
    }

    const updated = db.updateEmergencyEvent(
      eventId,
      {
        selectedFacilityId: facility.id,
        selectedFacilityName: facility.name,
        hospitalStatus: 'ALERTED',
        emergencyNotes: notes,
      },
      {
        label: 'Destination Hospital Selected',
        detail: `Selected ${facility.name} based on required emergency capabilities. Priority alert transmitted to Hospital Emergency Triage HUD.`,
      }
    );

    return NextResponse.json({ success: true, event: updated, facility });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
