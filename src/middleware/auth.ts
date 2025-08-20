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

// Authentication middleware for admins
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

// Authentication middleware for users
export async function authenticateUser(c: Context, next: Next) {
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

    if (payload.role !== 'user') {
      return c.json({
        success: false,
        error: 'Invalid token type',
      }, 401);
    }

    const user = await UserService.findById(payload.id);
    if (!user) {
      return c.json({
        success: false,
        error: 'User not found',
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
      error: 'Invalid or expired token',
    }, 401);
  }
}

// Optional authentication middleware
export async function optionalAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    try {
      const payload = JwtService.verify(token);

      if (payload.role === 'admin') {
        const admin = await AdminService.findById(payload.id);
        if (admin) {
          c.set('user', {
            id: admin.id,
            role: 'admin' as const,
            adminData: admin,
          });
        }
      } else if (payload.role === 'user') {
        const user = await UserService.findById(payload.id);
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
      // Ignore invalid tokens in optional auth
    }
  }

  await next();
}
