import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/security/authorization';
import { PatientLookupSchema } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const auth = requireRole(['DOCTOR', 'HOSPITAL_DOCTOR'], req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await req.json();
    const parseResult = PatientLookupSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.errors.map((e) => e.message).join(', ') },
        { status: 400 }
      );
    }

    const { query, isBreakGlass, breakGlassReason } = parseResult.data;

    const patient = db.getPatientByLookup(query);
    if (!patient) {
      return NextResponse.json({ error: 'No patient record found matching that identifier.' }, { status: 404 });
    }

    const currentUser = auth.user;

    // Check authorization: Normal access requires consent; Break-glass allows emergency override with justification
    if (!patient.consentGranted && !isBreakGlass) {
      return NextResponse.json(
        {
          error: 'Patient consent required for access. Please request patient authorization or use emergency break-glass with justification.',
          requiresConsent: true,
          patientId: patient.id,
        },
        { status: 403 }
      );
    }

    // Log the access in the audit trail
    db.logAudit({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      patientId: patient.id,
      patientName: patient.name,
      action: isBreakGlass ? 'EMERGENCY_BREAK_GLASS' : 'PATIENT_LOOKUP',
      contextReason: isBreakGlass
        ? `Emergency Break-Glass Access: ${breakGlassReason || 'Critical clinical emergency'}`
        : 'Routine clinical lookup with patient consent',
      isBreakGlass: !!isBreakGlass,
    });

    return NextResponse.json({
      success: true,
      patient,
      isBreakGlass: !!isBreakGlass,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
