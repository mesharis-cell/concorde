import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { UserService } from '../../services/users.js';
import { EventService } from '../../services/events.js';
import { JwtService } from '../../utils/jwt.js';
import { CreateUserSchema, ApiSuccessSchema, ApiErrorSchema } from '../../types/index.js';

const app = new OpenAPIHono();

// Event Registration (Public)
const eventRegisterRoute = createRoute({
  method: 'post',
  path: '/events/{eventId}/register',
  tags: ['Public - Registration'],
  summary: 'Register user for specific event',
  request: {
    params: z.object({
      eventId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateUserSchema.omit({ eventId: true }),
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

app.openapi(eventRegisterRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');
    const data = c.req.valid('json');
    
    // Check if event exists and registration is open
    const event = await EventService.findById(eventId);
    if (!event) {
      return c.json({
        success: false,
        error: 'Event not found',
      }, 404);
    }

    if (!event.config?.registrationOpen) {
      return c.json({
        success: false,
        error: 'Registration is closed for this event',
      }, 400);
    }

    // Check if user already exists
    const existingUser = await UserService.findByEmail(data.profile.email, eventId);
    if (existingUser) {
      return c.json({
        success: false,
        error: 'User already registered',
        message: 'A user with this email is already registered for this event',
      }, 400);
    }

    // Add eventId to registration data
    const registrationData = { ...data, eventId };
    const user = await UserService.create(registrationData);
    
    // TODO: Send welcome message via opted-in channels
    
    return c.json({
      success: true,
      data: {
        id: user.id,
        profile: user.profile,
        assigned: user.assigned,
        eventId: user.eventId,
      },
      message: 'Registration completed successfully',
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Registration failed',
      details: error.message,
    }, 400);
  }
});

// Event Information (Public)
const eventInfoRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}/info',
  tags: ['Public - Events'],
  summary: 'Get public event information',
  request: {
    params: z.object({
      eventId: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Event information retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Event not found',
    },
  },
});

app.openapi(eventInfoRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');
    
    const event = await EventService.findById(eventId);
    if (!event || !event.active) {
      return c.json({
        success: false,
        error: 'Event not found',
      }, 404);
    }
    
    return c.json({
      success: true,
      data: {
        id: event.id,
        name: event.name,
        shortName: event.shortName,
        location: event.location,
        dateRange: event.dateRange,
        config: {
          registrationOpen: event.config?.registrationOpen || false,
        },
      },
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve event information',
      details: error.message,
    }, 500);
  }
});

// Legacy User Registration (Public) - keeping for backward compatibility
const registerUserRoute = createRoute({
  method: 'post',
  path: '/users/register',
  tags: ['Public - Users'],
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
        error: 'User already registered',
        message: 'A user with this email is already registered for this event',
      }, 400);
    }

    const user = await UserService.create(data);
    
    return c.json({
      success: true,
      data: {
        id: user.id,
        profile: user.profile,
        assigned: user.assigned,
        groupId: user.groupId,
      },
      message: 'User registered successfully',
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Registration failed',
      details: error.message,
    }, 400);
  }
});

// Request Magic Link (Public)
const requestMagicLinkRoute = createRoute({
  method: 'post',
  path: '/auth/request-magic-link',
  tags: ['Public - Auth'],
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
        error: 'User not found',
        message: 'No user found with this email for the specified event',
      }, 404);
    }

    const magicLink = await UserService.generateMagicLink(user.id);
    
    // TODO: Send email with magic link
    // await EmailService.sendMagicLink(email, magicLink.token);
    
    return c.json({
      success: true,
      data: { 
        message: 'Magic link sent to your email',
        // In development, return the token for testing
        ...(process.env.NODE_ENV === 'development' && { token: magicLink.token })
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

// Verify Magic Link (Public)
const verifyMagicLinkRoute = createRoute({
  method: 'post',
  path: '/auth/validate-magic-link',
  tags: ['Public - Auth'],
  summary: 'Verify magic link and get user session',
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
      description: 'Magic link verified successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Invalid or expired magic link',
    },
  },
});

app.openapi(verifyMagicLinkRoute, async (c) => {
  try {
    const { token } = c.req.valid('json');
    
    const user = await UserService.verifyMagicLink(token);
    if (!user) {
      return c.json({
        success: false,
        error: 'Invalid or expired magic link',
      }, 400);
    }

    // Generate JWT session token
    const sessionToken = JwtService.sign({ 
      id: user.id, 
      role: 'user',
      eventId: user.eventId
    });
    
    // Create session record
    await UserService.createSession(user.id, sessionToken);
    
    return c.json({
      success: true,
      data: {
        sessionToken,
        user: {
          id: user.id,
          profile: user.profile,
          assigned: user.assigned,
          groupId: user.groupId,
          eventId: user.eventId,
        },
      },
      message: 'Authentication successful',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Authentication failed',
      details: error.message,
    }, 400);
  }
});

export default app;