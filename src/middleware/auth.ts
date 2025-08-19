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
export async function authenticateAdmin(c: Context, next: Next) {
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
    
    if (payload.role !== 'admin') {
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
      role: 'admin' as const,
      adminData: admin,
    });

    await next();
  } catch (error) {
    return c.json({
      success: false,
      error: 'Invalid or expired token',
    }, 401);
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

// Authorization middleware for admin roles
export function requireAdminRole(role?: 'SUPER' | 'STANDARD') {
  return async function(c: Context, next: Next) {
    const user = c.get('user');
    
    if (!user || user.role !== 'admin') {
      return c.json({
        success: false,
        error: 'Admin access required',
      }, 403);
    }

    if (role && user.adminData?.role !== role && user.adminData?.role !== 'SUPER') {
      return c.json({
        success: false,
        error: `${role} admin role required`,
      }, 403);
    }

    await next();
  };
}

// Event access control middleware
export function requireEventAccess() {
  return async function(c: Context, next: Next) {
    const user = c.get('user');
    
    if (!user || user.role !== 'admin') {
      return c.json({
        success: false,
        error: 'Admin access required',
      }, 403);
    }

    // Extract eventId from params or body
    const eventId = c.req.param('eventId') || c.req.param('id');
    
    if (!eventId) {
      return c.json({
        success: false,
        error: 'Event ID required',
      }, 400);
    }

    const hasAccess = await AdminService.hasEventAccess(user.id, eventId);
    
    if (!hasAccess) {
      return c.json({
        success: false,
        error: 'Access denied to this event',
      }, 403);
    }

    await next();
  };
}

// Middleware to ensure user can only access their own event data
export async function requireSameEvent(c: Context, next: Next) {
  const user = c.get('user');
  
  if (!user) {
    return c.json({
      success: false,
      error: 'Authentication required',
    }, 401);
  }

  if (user.role === 'admin') {
    // Admins with event access can proceed (handled by requireEventAccess)
    await next();
    return;
  }

  // For users, check if they belong to the requested event
  const eventId = c.req.param('eventId');
  
  if (eventId && user.eventId !== eventId) {
    return c.json({
      success: false,
      error: 'Access denied to this event',
    }, 403);
  }

  await next();
}