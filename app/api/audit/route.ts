import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const logs = db.getAuditLogs();
  return NextResponse.json(logs);
}
