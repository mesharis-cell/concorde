import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { UserService } from '../../services/users.js';
import type { AuthContext } from '../../middleware/auth.js';
import { PaginationSchema, ApiSuccessSchema, ApiErrorSchema } from '../../types/index.js';

const app = new OpenAPIHono<{ Variables: AuthContext }>();

// Get Users by Event (Admin)
const getUsersByEventRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}/users',
  tags: ['Admin - Users'],
  summary: 'Get paginated list of users for an event (Admin)',
  request: {
    params: z.object({
      eventId: z.string().min(1),
    }),
    query: PaginationSchema.extend({
      assigned: z.coerce.boolean().optional(),
      groupId: z.string().optional(),
      search: z.string().optional(),
      hasRequirements: z.coerce.boolean().optional(),
      // Requirements filters
      requirementType: z.enum(['dietary', 'medical', 'accessibility', 'accommodation', 'any']).optional(),
      // Communication filters  
      communicationType: z.enum(['email-only', 'whatsapp-only', 'both', 'none', 'any']).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Users retrieved successfully',
    },
  },
});

app.openapi(getUsersByEventRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');
    const { page, limit, assigned, groupId, search, hasRequirements, requirementType, communicationType } = c.req.valid('query');
    
    const result = await UserService.findByEventId(
      eventId, 
      { page, limit }, 
      { assigned, groupId, search, hasRequirements, requirementType, communicationType }
    );
    
    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve users',
      details: error.message,
    }, 500);
  }
});

// Get User by ID (Admin)
const getUserByIdRoute = createRoute({
  method: 'get',
  path: '/users/{id}',
  tags: ['Admin - Users'],
  summary: 'Get user by ID (Admin)',
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
      description: 'User retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'User not found',
    },
  },
});

app.openapi(getUserByIdRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const user = await UserService.findById(id);
    
    if (!user) {
      return c.json({
        success: false,
        error: 'User not found',
      }, 404);
    }
    
    return c.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve user',
      details: error.message,
    }, 500);
  }
});

// Assign User to Group (Admin)
const assignUserToGroupRoute = createRoute({
  method: 'post',
  path: '/users/{id}/assign',
  tags: ['Admin - Users'],
  summary: 'Assign user to a group (Admin)',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            groupId: z.string(),
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
      description: 'User assigned to group successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Assignment failed',
    },
  },
});

app.openapi(assignUserToGroupRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const { groupId } = c.req.valid('json');
    const authUser = c.get('user');
    
    const user = await UserService.assignToGroup(id, groupId, authUser.id);
    
    return c.json({
      success: true,
      data: user,
      message: 'User assigned to group successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Assignment failed',
      details: error.message,
    }, 400);
  }
});

// Unassign User from Group (Admin)
const unassignUserFromGroupRoute = createRoute({
  method: 'post',
  path: '/users/{id}/unassign',
  tags: ['Admin - Users'],
  summary: 'Unassign user from their group (Admin)',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({}),
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
      description: 'User unassigned from group successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Unassignment failed',
    },
  },
});

app.openapi(unassignUserFromGroupRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const authUser = c.get('user');
    
    const user = await UserService.unassignFromGroup(id, authUser.id);
    
    return c.json({
      success: true,
      data: user,
      message: 'User unassigned from group successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Unassignment failed',
      details: error.message,
    }, 400);
  }
});

// Get Requirements Summary (Admin)
const getRequirementsSummaryRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}/users/requirements-summary',
  tags: ['Admin - Users'],
  summary: 'Get summary of user requirements for an event (Admin)',
  request: {
    params: z.object({
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
      description: 'Requirements summary retrieved successfully',
    },
  },
});

app.openapi(getRequirementsSummaryRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');
    const summary = await UserService.getRequirementsSummary(eventId);
    
    return c.json({
      success: true,
      data: { summary },
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve requirements summary',
      details: error.message,
    }, 500);
  }
});

// Get User Statistics for Event (Admin)
const getUserStatsRoute = createRoute({
  method: 'get',
  path: '/users/stats/{eventId}',
  tags: ['Admin - Users'],
  summary: 'Get user statistics for an event (Admin)',
  request: {
    params: z.object({
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
      description: 'User statistics retrieved successfully',
    },
  },
});

app.openapi(getUserStatsRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');
    const stats = await UserService.getEventStats(eventId);
    
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve user statistics',
      details: error.message,
    }, 500);
  }
});

export default app;
