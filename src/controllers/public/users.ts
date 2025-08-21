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
  description: 'Complete multi-step registration form for event attendees',
  request: {
    params: z.object({
      eventId: z.string().describe('Event ID to register for'),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateUserSchema.omit({ eventId: true }),
          example: {
            profile: {
              email: 'john.doe@example.com',
              firstName: 'John',
              lastName: 'Doe',
              phone: '+1-555-0123'
            },
            communication: {
              emailOptIn: true,
              whatsappOptIn: false
            },
            flight: {
              airline: 'British Airways',
              number: 'BA123',
              arrival: '2024-09-15T14:30:00Z',
              departure: '2024-09-18T16:45:00Z',
              arrivalAirport: 'LHR',
              departureAirport: 'JFK'
            },
            accommodation: {
              required: true,
              hotel: 'Grand Hotel Milano',
              checkIn: '2024-09-15T00:00:00Z',
              checkOut: '2024-09-18T00:00:00Z',
              specialRequests: 'High floor, quiet room'
            },
            requirements: {
              dietary: 'Vegetarian, no nuts',
              medical: 'Diabetic - requires refrigerated medication',
              accessibility: 'Wheelchair accessible rooms'
            },
            merchandiseSize: {
              shirt: 'L',
              jacket: 'XL',
              hat: 'M'
            },
            emergencyContact: {
              name: 'Jane Doe',
              relationship: 'Spouse',
              phone: '+1-555-0124',
              email: 'jane.doe@example.com'
            }
          }
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
          example: {
            success: true,
            data: {
              id: '60f7b3b3b3b3b3b3b3b3b3b3',
              profile: {
                email: 'john.doe@example.com',
                firstName: 'John',
                lastName: 'Doe',
                phone: '+1-555-0123'
              },
              assigned: false,
              eventId: '60f7b3b3b3b3b3b3b3b3b3b3'
            },
            message: 'Registration completed successfully'
          }
        },
      },
      description: 'User registered successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
          examples: {
            'already-registered': {
              value: {
                success: false,
                error: 'User already registered',
                message: 'A user with this email is already registered for this event'
              }
            },
            'registration-closed': {
              value: {
                success: false,
                error: 'Registration is closed for this event'
              }
            }
          }
        },
      },
      description: 'Registration failed',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: 'Event not found'
          }
        },
      },
      description: 'Event not found',
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
  description: 'Retrieve public event details for microsite display',
  request: {
    params: z.object({
      eventId: z.string().describe('Event ID to get information for'),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
          example: {
            success: true,
            data: {
              id: '60f7b3b3b3b3b3b3b3b3b3b3',
              name: 'F1 Italian Grand Prix 2025',
              shortName: 'Monza 2025',
              location: {
                city: 'Monza',
                country: 'Italy',
                venue: 'Autodromo Nazionale Monza',
                timezone: 'Europe/Rome'
              },
              dateRange: {
                start: '2025-09-05T00:00:00Z',
                end: '2025-09-07T23:59:59Z'
              },
              config: {
                registrationOpen: true
              }
            }
          }
        },
      },
      description: 'Event information retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: 'Event not found'
          }
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
  description: 'Send passwordless login link to user email (24-hour expiration)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email().describe('User email address'),
            eventId: z.string().describe('Event ID user wants to access'),
          }),
          example: {
            email: 'john.doe@example.com',
            eventId: '60f7b3b3b3b3b3b3b3b3b3b3'
          }
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
          examples: {
            'production': {
              value: {
                success: true,
                data: {
                  message: 'Magic link sent to your email'
                }
              }
            },
            'development': {
              value: {
                success: true,
                data: {
                  message: 'Magic link sent to your email',
                  token: 'ml_1a2b3c4d5e6f7g8h9i0j'
                }
              }
            }
          }
        },
      },
      description: 'Magic link sent successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: 'User not found',
            message: 'No user found with this email for the specified event'
          }
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
  description: 'Validate token from email link and return JWT for authenticated access',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            token: z.string().describe('Magic link token from email'),
          }),
          example: {
            token: 'ml_1a2b3c4d5e6f7g8h9i0j'
          }
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
          example: {
            success: true,
            data: {
              sessionToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              user: {
                id: '60f7b3b3b3b3b3b3b3b3b3b3',
                profile: {
                  email: 'john.doe@example.com',
                  firstName: 'John',
                  lastName: 'Doe'
                },
                assigned: true,
                groupId: '60f7b3b3b3b3b3b3b3b3b3b4',
                eventId: '60f7b3b3b3b3b3b3b3b3b3b3'
              }
            },
            message: 'Authentication successful'
          }
        },
      },
      description: 'Magic link verified successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
          examples: {
            'expired': {
              value: {
                success: false,
                error: 'Invalid or expired magic link'
              }
            },
            'already-used': {
              value: {
                success: false,
                error: 'Magic link already used'
              }
            }
          }
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