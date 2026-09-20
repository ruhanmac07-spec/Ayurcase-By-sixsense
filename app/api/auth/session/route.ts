import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const user = db.getCurrentUser();
  const allUsers = db.getUsers();
  return NextResponse.json({
    user,
    allUsers,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    const user = db.setCurrentUser(userId);
    return NextResponse.json({ success: true, user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
