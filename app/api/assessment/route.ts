import { NextRequest, NextResponse } from 'next/server';
import { runClinicalTriage } from '@/lib/services/triage';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chiefComplaint, duration, severity, vitals, patientHistory, allergies, additionalNotes } = body;

    if (!chiefComplaint) {
      return NextResponse.json({ error: 'chiefComplaint is required' }, { status: 400 });
    }

    const assessment = await runClinicalTriage({
      chiefComplaint,
      duration,
      severity: severity ? Number(severity) : undefined,
      vitals,
      patientHistory,
      allergies,
      additionalNotes,
    });

    return NextResponse.json(assessment);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
