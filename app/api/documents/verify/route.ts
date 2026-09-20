import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/security/authorization';
import { VerifyDocumentSchema } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const auth = requireRole(['DOCTOR', 'HOSPITAL_DOCTOR'], req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await req.json();
    const parseResult = VerifyDocumentSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.errors.map((e) => e.message).join(', ') },
        { status: 400 }
      );
    }

    const { documentId, verifiedConditions, verifiedMedications } = parseResult.data;
    const currentUser = auth.user;

    const verified = db.verifyDocument(
      documentId,
      currentUser.name,
      verifiedConditions,
      verifiedMedications
    );

    return NextResponse.json({ success: true, document: verified });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
