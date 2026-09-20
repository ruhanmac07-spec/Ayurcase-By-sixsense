import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/security/authorization';
import { CreateReferralSchema } from '@/types';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get('patientId');
  const facilityId = searchParams.get('facilityId');
  const id = searchParams.get('id');

  if (id) {
    const referral = db.getReferralById(id);
    if (!referral) return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
    return NextResponse.json(referral);
  }

  if (patientId) {
    return NextResponse.json(db.getReferralsForPatient(patientId));
  }

  if (facilityId) {
    return NextResponse.json(db.getReferralsForFacility(facilityId));
  }

  return NextResponse.json(db.getReferrals());
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireRole(['DOCTOR'], req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await req.json();
    const parseResult = CreateReferralSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ') },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    const referral = db.createReferral({
      patientId: data.patientId,
      patientSnapshot: data.patientSnapshot,
      referringDoctorId: data.referringDoctorId,
      referringDoctorName: data.referringDoctorName,
      referringClinic: data.referringClinic,
      receivingFacilityId: data.receivingFacilityId,
      receivingFacilityName: data.receivingFacilityName,
      urgency: data.urgency,
      chiefComplaint: data.chiefComplaint,
      duration: data.duration || 'Not specified',
      clinicalFindings: data.clinicalFindings,
      vitals: data.vitals,
      careRequirement: data.careRequirement,
      requiredCapabilities: (data.requiredCapabilities || []) as any,
      aiAssessmentSummary: data.aiAssessmentSummary || '',
      doctorConfirmedDecision: data.doctorConfirmedDecision,
      isDoctorOverridden: !!data.isDoctorOverridden,
      doctorOverrideReason: data.doctorOverrideReason,
      status: 'CONFIRMED',
    });

    return NextResponse.json({ success: true, referral });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
