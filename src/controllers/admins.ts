import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { AdminService } from '../services/admins.js';
import { JwtService } from '../utils/jwt.js';
import { CreateAdminSchema, AdminLoginSchema, PaginationSchema, AdminRole, ApiSuccessSchema, ApiErrorSchema } from '../types/index.js';

const app = new OpenAPIHono();

// Admin Login
const adminLoginRoute = createRoute({
  method: 'post',
  path: '/admins/login',
  tags: ['Admins'],
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
    
    return c.json({
      success: true,
      data: {
        admin: {
          id: admin.id,
          email: admin.email,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: admin.role,
        },
        accessToken,
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

// Create Admin (Super Admin only)
const createAdminRoute = createRoute({
  method: 'post',
  path: '/admins',
  tags: ['Admins'],
  summary: 'Create a new admin (Super Admin only)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateAdminSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Admin created successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Failed to create admin',
    },
    409: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Admin with this email already exists',
    },
  },
});

app.openapi(createAdminRoute, async (c) => {
  try {
    const data = c.req.valid('json');
    
    // Check if admin with email already exists
    const existingAdmin = await AdminService.findByEmail(data.email);
    if (existingAdmin) {
      return c.json({
        success: false,
        error: 'Admin with this email already exists',
      }, 409);
    }

    const admin = await AdminService.create(data);
    
    return c.json({
      success: true,
      data: admin,
      message: 'Admin created successfully',
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to create admin',
      details: error.message,
    }, 400);
  }
});

// Get All Admins
const getAdminsRoute = createRoute({
  method: 'get',
  path: '/admins',
  tags: ['Admins'],
  summary: 'Get paginated list of admins',
  request: {
    query: PaginationSchema.extend({
      role: AdminRole.optional(),
      search: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Admins retrieved successfully',
    },
  },
});

app.openapi(getAdminsRoute, async (c) => {
  try {
    const { page, limit, role, search } = c.req.valid('query');
    const result = await AdminService.findAll({ page, limit }, { role, search });
    
    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve admins',
      details: error.message,
    }, 500);
  }
});

// Get Admin by ID
const getAdminByIdRoute = createRoute({
  method: 'get',
  path: '/admins/{id}',
  tags: ['Admins'],
  summary: 'Get admin by ID',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Admin retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Admin not found',
    },
  },
});

app.openapi(getAdminByIdRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const admin = await AdminService.findById(id);
    
    if (!admin) {
      return c.json({
        success: false,
        error: 'Admin not found',
      }, 404);
    }
    
    return c.json({
      success: true,
      data: admin,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve admin',
      details: error.message,
    }, 500);
  }
});

// Update Admin
const updateAdminRoute = createRoute({
  method: 'put',
  path: '/admins/{id}',
  tags: ['Admins'],
  summary: 'Update admin information',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateAdminSchema.omit({ password: true }).partial(),
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
      description: 'Admin updated successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Admin not found',
    },
  },
});

app.openapi(updateAdminRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    const admin = await AdminService.update(id, data);
    
    return c.json({
      success: true,
      data: admin,
      message: 'Admin updated successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to update admin',
      details: error.message,
    }, 400);
  }
});

// Change Admin Password
const changePasswordRoute = createRoute({
  method: 'post',
  path: '/admins/{id}/change-password',
  tags: ['Admins'],
  summary: 'Change admin password',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            newPassword: z.string().min(8),
          }),
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
      description: 'Password changed successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Failed to change password',
    },
  },
});

app.openapi(changePasswordRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const { newPassword } = c.req.valid('json');
    
    await AdminService.changePassword(id, newPassword);
    
    return c.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to change password',
      details: error.message,
    }, 400);
  }
});

// Toggle Admin Status
const toggleAdminRoute = createRoute({
  method: 'patch',
  path: '/admins/{id}/toggle',
  tags: ['Admins'],
  summary: 'Activate or deactivate an admin',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            active: z.boolean(),
          }),
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
      description: 'Admin status updated successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Admin not found',
    },
  },
});

app.openapi(toggleAdminRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const { active } = c.req.valid('json');
    
    const admin = active 
      ? await AdminService.activate(id) 
      : await AdminService.deactivate(id);
    
    return c.json({
      success: true,
      data: admin,
      message: `Admin ${active ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to update admin status',
      details: error.message,
    }, 400);
  }
});

// Assign Admin to Event
const assignAdminToEventRoute = createRoute({
  method: 'post',
  path: '/admins/{adminId}/events/{eventId}',
  tags: ['Admins'],
  summary: 'Assign admin to event',
  request: {
    params: z.object({
      adminId: z.string().min(1),
      eventId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Admin assigned to event successfully',
    },
  },
});

app.openapi(assignAdminToEventRoute, async (c) => {
  try {
    const { adminId, eventId } = c.req.valid('param');
    
    await AdminService.assignToEvent(adminId, eventId);
    
    return c.json({
      success: true,
      message: 'Admin assigned to event successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to assign admin to event',
      details: error.message,
    }, 400);
  }
});

// Unassign Admin from Event
const unassignAdminFromEventRoute = createRoute({
  method: 'delete',
  path: '/admins/{adminId}/events/{eventId}',
  tags: ['Admins'],
  summary: 'Unassign admin from event',
  request: {
    params: z.object({
      adminId: z.string().min(1),
      eventId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Admin unassigned from event successfully',
    },
  },
});

app.openapi(unassignAdminFromEventRoute, async (c) => {
  try {
    const { adminId, eventId } = c.req.valid('param');
    
    await AdminService.unassignFromEvent(adminId, eventId);
    
    return c.json({
      success: true,
      message: 'Admin unassigned from event successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to unassign admin from event',
      details: error.message,
    }, 400);
  }
});

// Get Admin's Assigned Events
const getAdminEventsRoute = createRoute({
  method: 'get',
  path: '/admins/{id}/events',
  tags: ['Admins'],
  summary: 'Get events assigned to admin',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Assigned events retrieved successfully',
    },
  },
});

app.openapi(getAdminEventsRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const events = await AdminService.getAssignedEvents(id);
    
    return c.json({
      success: true,
      data: events,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve assigned events',
      details: error.message,
    }, 500);
  }
});

export default app;