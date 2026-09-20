import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/security/authorization';
import { UpdateReferralStatusSchema, ReferralStatus } from '@/types';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = requireRole(['DOCTOR', 'HOSPITAL_DOCTOR', 'HOSPITAL_ADMIN'], req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const referralId = params.id;
    const body = await req.json();
    const parseResult = UpdateReferralStatusSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.errors.map((e) => e.message).join(', ') },
        { status: 400 }
      );
    }

    const { status, notes, outcomeNotes, counterReferralFollowUp } = parseResult.data;
    const currentUser = auth.user;

    const updated = db.updateReferralStatus(
      referralId,
      status as ReferralStatus,
      currentUser.role as 'DOCTOR' | 'HOSPITAL_DOCTOR' | 'HOSPITAL_ADMIN',
      currentUser.name,
      notes,
      outcomeNotes,
      counterReferralFollowUp
    );

    return NextResponse.json({ success: true, referral: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
