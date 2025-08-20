import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { AdminService } from '../services/admins.js';
import { JwtService } from '../utils/jwt.js';
import { AdminLoginSchema, ApiSuccessSchema, ApiErrorSchema } from '../types/index.js';

const app = new OpenAPIHono();

// Admin Login
const adminLoginRoute = createRoute({
  method: 'post',
  path: '/auth/admin/login',
  tags: ['Authentication'],
  summary: 'Admin login',
  request: {
    body: {
      content: {
        'application/json': {
          schema: AdminLoginSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Login successful',
    },
    401: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Invalid credentials',
    },
  },
});

app.openapi(adminLoginRoute, async (c) => {
  try {
    const credentials = c.req.valid('json');
    const admin = await AdminService.authenticate(credentials);
    
    if (!admin) {
      return c.json({
        success: false,
        error: 'Invalid email or password',
      }, 401);
    }

    const accessToken = JwtService.generateAdminAccessToken(admin.id);
    
    // Get admin's assigned events for frontend
    const assignedEvents = await AdminService.getAssignedEvents(admin.id);
    
    return c.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: admin.id,
          email: admin.email,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: admin.role === 'SUPER' ? 'super' : 'standard', // Convert to frontend format
          events: assignedEvents.map(event => ({
            id: event.id,
            name: event.name,
          })),
        },
      },
      message: 'Login successful',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Login failed',
      details: error.message,
    }, 500);
  }
});

export default app;