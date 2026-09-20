import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { TriggerSosSchema, AmbulanceStatus } from '@/types';

export async function GET() {
  const events = db.getEmergencyEvents();
  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parseResult = TriggerSosSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.errors.map((e) => e.message).join(', ') },
        { status: 400 }
      );
    }

    const { patientId, symptoms, action, eventId, ambulanceStatus, etaMinutes, cancellationReason } = parseResult.data;

    // Action: Cancel SOS event (False alarm)
    if (action === 'CANCEL' && eventId) {
      const cancelled = db.cancelEmergencyEvent(eventId, cancellationReason || 'False alarm cancelled by patient');
      if (!cancelled) {
        return NextResponse.json({ error: 'Emergency event not found' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        event: cancelled,
        message: 'Emergency SOS cancelled successfully (false alarm logged).',
      });
    }

    // Action: Advance ambulance status or simulate telemetry
    if (action === 'ADVANCE_STATUS' && eventId) {
      const updated = db.updateEmergencyEvent(
        eventId,
        {
          ambulanceStatus: ambulanceStatus as AmbulanceStatus,
          etaMinutes: etaMinutes !== undefined ? Number(etaMinutes) : undefined,
        },
        {
          label: `Ambulance Status: ${ambulanceStatus}`,
          detail: `Ambulance telemetry updated to ${ambulanceStatus}. ETA: ${etaMinutes || 0} mins.`,
        }
      );
      return NextResponse.json({ success: true, event: updated });
    }

    // Default or action === 'TRIGGER': Trigger new SOS
    const targetPatientId = patientId || 'pat-1';
    const emergencyEvent = db.createEmergencyEvent(targetPatientId, symptoms || []);

    return NextResponse.json({
      success: true,
      event: emergencyEvent,
      message: 'Ambulance action initiated immediately. Telemetry broadcast active.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
