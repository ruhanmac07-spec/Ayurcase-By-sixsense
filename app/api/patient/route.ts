import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const patient = db.getPatientById(id);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    return NextResponse.json(patient);
  }

  // Default: return patient associated with current session if patient role
  const currentUser = db.getCurrentUser();
  const patient = db.getPatients().find((p) => p.userId === currentUser.id) || db.getPatients()[0];
  return NextResponse.json(patient);
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, updates } = body;
    if (!id || !updates) {
      return NextResponse.json({ error: 'id and updates are required' }, { status: 400 });
    }
    const updated = db.updatePatient(id, updates);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
