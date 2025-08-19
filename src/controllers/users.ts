import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { UserService } from '../services/users.js';
import { JwtService } from '../utils/jwt.js';
import { CreateUserSchema, PaginationSchema, ApiSuccessSchema, ApiErrorSchema } from '../types/index.js';

const app = new OpenAPIHono();

// User Registration
const registerUserRoute = createRoute({
  method: 'post',
  path: '/users/register',
  tags: ['Users'],
  summary: 'Register a new user for an event',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateUserSchema,
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
      description: 'User registered successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Registration failed',
    },
  },
});

app.openapi(registerUserRoute, async (c) => {
  try {
    const data = c.req.valid('json');
    
    // Check if user already exists
    const existingUser = await UserService.findByEmail(data.profile.email, data.eventId);
    if (existingUser) {
      return c.json({
        success: false,
        error: 'User with this email already registered for this event',
      }, 400);
    }

    const user = await UserService.create(data);
    
    return c.json({
      success: true,
      data: {
        id: user.id,
        profile: user.profile,
        communication: user.communication,
        registeredAt: user.registeredAt,
      },
      message: 'Registration successful',
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Registration failed',
      details: error.message,
    }, 400);
  }
});

// Request Magic Link
const requestMagicLinkRoute = createRoute({
  method: 'post',
  path: '/users/magic-link',
  tags: ['Users'],
  summary: 'Request a magic link for authentication',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email(),
            eventId: z.string(),
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
      description: 'Magic link sent successfully',
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

app.openapi(requestMagicLinkRoute, async (c) => {
  try {
    const { email, eventId } = c.req.valid('json');
    
    const user = await UserService.findByEmail(email, eventId);
    if (!user) {
      return c.json({
        success: false,
        error: 'User not found for this event',
      }, 404);
    }

    const magicToken = await UserService.createMagicLink(user.id);
    
    // TODO: Send email with magic link
    // await EmailService.sendMagicLink(email, magicToken);
    
    return c.json({
      success: true,
      message: 'Magic link sent to your email',
      data: { 
        // In development, return the token for testing
        ...(process.env.NODE_ENV === 'development' && { magicToken })
      },
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to send magic link',
      details: error.message,
    }, 500);
  }
});

// Authenticate with Magic Link
const authenticateMagicLinkRoute = createRoute({
  method: 'post',
  path: '/users/auth/magic',
  tags: ['Users'],
  summary: 'Authenticate using magic link',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            token: z.string(),
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
      description: 'Authentication successful',
    },
    401: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Invalid or expired token',
    },
  },
});

app.openapi(authenticateMagicLinkRoute, async (c) => {
  try {
    const { token } = c.req.valid('json');
    
    const user = await UserService.validateMagicLink(token);
    if (!user) {
      return c.json({
        success: false,
        error: 'Invalid or expired magic link',
      }, 401);
    }

    const accessToken = JwtService.generateUserAccessToken(user.id, user.eventId);
    
    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          profile: user.profile,
          assigned: user.assigned,
          groupId: user.groupId,
        },
        accessToken,
      },
      message: 'Authentication successful',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Authentication failed',
      details: error.message,
    }, 401);
  }
});

// Get Users by Event
const getUsersByEventRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}/users',
  tags: ['Users'],
  summary: 'Get paginated list of users for an event',
  request: {
    params: z.object({
      eventId: z.string().min(1),
    }),
    query: PaginationSchema.extend({
      assigned: z.coerce.boolean().optional(),
      groupId: z.string().optional(),
      search: z.string().optional(),
      hasRequirements: z.coerce.boolean().optional(),
      guestType: z.string().optional(),
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
    const { page, limit, assigned, groupId, search, hasRequirements, guestType } = c.req.valid('query');
    
    const result = await UserService.findByEventId(
      eventId, 
      { page, limit }, 
      { assigned, groupId, search, hasRequirements, guestType }
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

// Get User by ID
const getUserByIdRoute = createRoute({
  method: 'get',
  path: '/users/{id}',
  tags: ['Users'],
  summary: 'Get user by ID',
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

// Update User
const updateUserRoute = createRoute({
  method: 'put',
  path: '/users/{id}',
  tags: ['Users'],
  summary: 'Update user information',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateUserSchema.partial().omit({ eventId: true }),
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
      description: 'User updated successfully',
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

app.openapi(updateUserRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    const user = await UserService.update(id, data);
    
    return c.json({
      success: true,
      data: user,
      message: 'User updated successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to update user',
      details: error.message,
    }, 400);
  }
});

// Assign User to Group
const assignUserToGroupRoute = createRoute({
  method: 'post',
  path: '/users/{id}/assign',
  tags: ['Users'],
  summary: 'Assign user to a group',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            groupId: z.string(),
            adminId: z.string(),
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
    const { groupId, adminId } = c.req.valid('json');
    
    const user = await UserService.assignToGroup(id, groupId, adminId);
    
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

// Unassign User from Group
const unassignUserFromGroupRoute = createRoute({
  method: 'post',
  path: '/users/{id}/unassign',
  tags: ['Users'],
  summary: 'Unassign user from their group',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            adminId: z.string(),
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
    const { adminId } = c.req.valid('json');
    
    const user = await UserService.unassignFromGroup(id, adminId);
    
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

// Get Requirements Summary
const getRequirementsSummaryRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}/users/requirements-summary',
  tags: ['Users'],
  summary: 'Get summary of user requirements for an event',
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
      data: summary,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve requirements summary',
      details: error.message,
    }, 500);
  }
});

export default app;