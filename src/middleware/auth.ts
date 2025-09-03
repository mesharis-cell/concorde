import { Context, Next } from 'hono';
import { JwtService } from '../utils/jwt.js';
import { AdminService } from '../services/admins.js';
import { UserService } from '../services/users.js';

export interface AuthContext {
  user?: {
    id: string;
    role: 'admin' | 'user';
    eventId?: string;
    adminData?: any;
    userData?: any;
  };
}

// Authentication middleware for admins (keeping JWT for admin routes)
export async function authenticateAdmin(authenticateSuperAdmin: boolean) {
  return async function (c: Context, next: Next) {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        success: false,
        error: 'Missing or invalid authorization header',
      }, 401);
    }

    const token = authHeader.substring(7);

    try {
      const payload = JwtService.verify(token);

      if (authenticateSuperAdmin) {
        if (payload.role !== 'superadmin') {
          return c.json({
            success: false,
            error: 'Invalid token type',
          }, 401);
        }
      } else {
        if (payload.role !== 'admin' && payload.role !== 'superadmin') {
          return c.json({
            success: false,
            error: 'Invalid token type',
          }, 401);
        }

        const admin = await AdminService.findById(payload.id);
        if (!admin) {
          return c.json({
            success: false,
            error: 'Admin not found',
          }, 401);
        }

        // Add admin data to context
        c.set('user', {
          id: admin.id,
          role: admin.role === 'SUPER' ? 'superadmin' : 'admin',
          adminData: admin,
        });
      }

      await next();
    } catch (error) {
      return c.json({
        success: false,
        error: 'Invalid or expired token',
      }, 401);
    }
  }
}

// Simple email-based authentication middleware for users
export async function authenticateUser(c: Context, next: Next) {
  let email: string;
  let eventId: string;

  try {
    // Try to get email from request body
    const body = await c.req.json();

    email = body.email;
    // For testing purposes, use a default eventId or get from request
    eventId = body.eventId || process.env.DEFAULT_EVENT_ID || "68b5aa94b9d13b18bb4694c6";
  } catch (error) {
    return c.json({
      success: false,
      error: 'Failed to parse request body - missing email',
    }, 401);
  }

  if (!email) {
    return c.json({
      success: false,
      error: 'Email is required for authentication',
    }, 401);
  }

  try {
    // Find user by email - this acts as our "authentication"
    const user = await UserService.findByEmail(email, eventId);

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found with provided email',
      }, 401);
    }

    // Add user data to context
    c.set('user', {
      id: user.id,
      role: 'user' as const,
      eventId: user.eventId,
      userData: user,
    });

    await next();
  } catch (error) {
    return c.json({
      success: false,
      error: 'Authentication failed',
    }, 401);
  }
}

// Optional authentication middleware (for backward compatibility, but simplified)
export async function optionalAuth(c: Context, next: Next) {
  try {
    const body = await c.req.json();
    const email = body.email;
    const eventId = body.eventId || process.env.DEFAULT_EVENT_ID || "68b5aa94b9d13b18bb4694c6";

    if (email) {
      const user = await UserService.findByEmail(email, eventId);
      if (user) {
        c.set('user', {
          id: user.id,
          role: 'user' as const,
          eventId: user.eventId,
          userData: user,
        });
      }
    }
  } catch (error) {
    // Ignore errors in optional auth
  }

  await next();
}
