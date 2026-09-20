import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { UserRole, UserSession } from '@/types';

export interface AuthContext {
  user: UserSession;
}

export function getAuthenticatedUser(req?: NextRequest): UserSession {
  if (req) {
    const headerUserId = req.headers.get('x-user-id');
    if (headerUserId) {
      const u = db.getUserById(headerUserId);
      if (u) return u;
    }
    const headerRole = req.headers.get('x-user-role') as UserRole;
    if (headerRole) {
      const match = db.getUsers().find((u) => u.role === headerRole);
      if (match) return match;
    }
  }
  return db.getCurrentUser();
}

export function requireRole(
  allowedRoles: UserRole[],
  req?: NextRequest
): { user: UserSession; errorResponse?: never } | { errorResponse: NextResponse; user?: never } {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Authentication required. No active session found.', code: 'UNAUTHENTICATED' },
        { status: 401 }
      ),
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      errorResponse: NextResponse.json(
        {
          error: `Permission denied. Required role: [${allowedRoles.join(', ')}], but current role is ${user.role}.`,
          code: 'FORBIDDEN',
        },
        { status: 403 }
      ),
    };
  }

  return { user };
}
