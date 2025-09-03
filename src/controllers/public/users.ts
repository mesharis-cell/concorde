import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { UserService } from '../../services/users.js';
import { EventService } from '../../services/events.js';
import { JwtService } from '../../utils/jwt.js';
import {
  CreateUserSchema,
  PublicRegistrationSchema,
  ApiSuccessSchema,
  ApiErrorSchema,
} from '../../types/index.js';
import { authenticateUser } from '../../middleware/auth.js';
import { EmailService } from '../../services/email.js';

// Helper function to send magic link using branded template if available
async function sendMagicLinkWithTemplate(
  email: string,
  variables: {
    eventName: string;
    firstName: string;
    lastName: string;
    magicLink: string;
    eventId: string;
    unsubscribeLink?: string;
  }
) {
  try {
    // Try to find a branded MAGIC_LINK template for this event
    const { TemplateService } = await import('../../services/templates.js');
    const templates = await TemplateService.findByEventId(variables.eventId, {
      type: 'AUTHENTICATION',
      category: 'MAGIC_LINK',
      active: true,
    });

    if (templates.length > 0) {
      // Use the first available branded template
      const brandedTemplate = templates[0];

      const template = {
        subject: brandedTemplate.subject,
        html: brandedTemplate.html,
      };

      return await EmailService.sendEmail(email, template, variables);
    }
  } catch (error) {
    console.warn(
      'Failed to load branded template, falling back to generic:',
      error
    );
  }

  // Fallback to generic template
  return await EmailService.sendMagicLinkEmail(email, variables);
}

const app = new OpenAPIHono();

// Register Bearer Auth security scheme for authenticated endpoints
app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

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
          schema: PublicRegistrationSchema.omit({ eventId: true }),
          example: {
            profile: {
              email: 'john.doe@example.com',
              firstName: 'John',
              lastName: 'Doe',
              phone: '+1-555-0123',
            },
            communication: {
              emailOptIn: true,
              whatsappOptIn: false,
            },
            transferRequirements: 'Need wheelchair accessible vehicle',
            requirements: {
              dietary: 'Vegetarian, nut allergy',
              medical: 'Diabetic, requires refrigeration for insulin',
              accessibility: 'Wheelchair user, requires ramp access',
              specialRequests: 'High floor, quiet room, early check-in',
            },
            merchandiseSize: {
              shirt: 'L',
              jacket: 'XL',
              hat: 'M',
            },
            emergencyContact: {
              name: 'Jane Doe',
              relationship: 'Spouse',
              phone: '+1-555-0124',
              email: 'jane.doe@example.com',
            },
          },
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
                phone: '+1-555-0123',
              },
              assigned: false,
              eventId: '60f7b3b3b3b3b3b3b3b3b3b3',
            },
            message: 'Registration completed successfully',
          },
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
                message:
                  'A user with this email is already registered for this event',
              },
            },
            'registration-closed': {
              value: {
                success: false,
                error: 'Registration is closed for this event',
              },
            },
          },
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
            error: 'Event not found',
          },
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
      return c.json(
        {
          success: false,
          error: 'Event not found',
        },
        404
      );
    }

    if (!event.config?.registrationOpen) {
      return c.json(
        {
          success: false,
          error: 'Registration is closed for this event',
        },
        400
      );
    }

    // Check if user already exists
    const existingUser = await UserService.findByEmail(
      data.profile.email,
      eventId
    );
    if (existingUser) {
      return c.json(
        {
          success: false,
          error: 'User already registered',
          message:
            'A user with this email is already registered for this event',
        },
        400
      );
    }

    // Add eventId to registration data
    const registrationData = { ...data, eventId };
    const user = await UserService.create(registrationData);

    // TODO: Send welcome message via opted-in channels

    return c.json(
      {
        success: true,
        data: {
          id: user.id,
          profile: user.profile,
          assigned: user.assigned,
          eventId: user.eventId,
        },
        message: 'Registration completed successfully',
      },
      201
    );
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Registration failed',
        details: error.message,
      },
      400
    );
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
                timezone: 'Europe/Rome',
              },
              dateRange: {
                start: '2025-09-05T00:00:00Z',
                end: '2025-09-07T23:59:59Z',
              },
              config: {
                registrationOpen: true,
              },
            },
          },
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
            error: 'Event not found',
          },
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
      return c.json(
        {
          success: false,
          error: 'Event not found',
        },
        404
      );
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
    return c.json(
      {
        success: false,
        error: 'Failed to retrieve event information',
        details: error.message,
      },
      500
    );
  }
});

// Legacy /users/register route removed - use event-specific /events/{eventId}/register for public registration

// Request Magic Link (Public)
const requestMagicLinkRoute = createRoute({
  method: 'post',
  path: '/auth/request-magic-link',
  tags: ['Public - Auth'],
  summary: 'Request a magic link for authentication',
  description:
    'Send passwordless login link to user email (24-hour expiration)',
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
            eventId: '60f7b3b3b3b3b3b3b3b3b3b3',
          },
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
            production: {
              value: {
                success: true,
                data: {
                  message: 'Magic link sent to your email',
                },
              },
            },
            development: {
              value: {
                success: true,
                data: {
                  message: 'Magic link sent to your email',
                  token: 'ml_1a2b3c4d5e6f7g8h9i0j',
                },
              },
            },
          },
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
            message: 'No user found with this email for the specified event',
          },
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
      return c.json(
        {
          success: false,
          error: 'User not found',
          message: 'No user found with this email for the specified event',
        },
        404
      );
    }

    // Get event details for the email
    const event = await EventService.findById(eventId);
    if (!event) {
      return c.json(
        {
          success: false,
          error: 'Event not found',
        },
        404
      );
    }

    const magicLink = await UserService.generateMagicLink(user.id);

    // Get user profile for personalization
    const profile = user.profile as any;
    const firstName = profile?.firstName || '';
    const lastName = profile?.lastName || '';

    if (process.env.NODE_ENV === 'development') {
      // In development, just log the magic link
      console.log('🔗 Magic Link Generated:');
      console.log(`📧 To: ${email}`);
      console.log(`🎫 Token: ${magicLink.token}`);
      console.log(`👤 User: ${firstName} ${lastName}`);
      console.log(`🎪 Event: ${event.name}`);
      console.log('---');

      const magicLinkUrl = `${event.config['micrositeUrl']}/auth/magic?token=${magicLink.token}&event=${eventId}`;

      // Try to use branded template first, fall back to generic
      await sendMagicLinkWithTemplate(email, {
        eventName: event.name,
        firstName,
        lastName,
        magicLink: magicLinkUrl,
        eventId,
        unsubscribeLink: `${process.env.APP_URL || 'http://localhost:3001'}/api/unsubscribe/${user.id}/${eventId}`,
      });
    } else {
      // In production, send email via AWS SES
      const magicLinkUrl = `${event.config['micrositeUrl']}/auth/magic?token=${magicLink.token}&event=${eventId}`;

      // Try to use branded template first, fall back to generic
      await sendMagicLinkWithTemplate(email, {
        eventName: event.name,
        firstName,
        lastName,
        magicLink: magicLinkUrl,
        eventId,
        unsubscribeLink: `${process.env.APP_URL || 'http://localhost:3001'}/api/unsubscribe/${user.id}/${eventId}`,
      });
    }

    return c.json({
      success: true,
      data: {
        message: 'Magic link sent to your email',
        // In development, return the token for testing
        ...(process.env.NODE_ENV === 'development' && {
          token: magicLink.token,
        }),
      },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Failed to send magic link',
        details: error.message,
      },
      500
    );
  }
});

// Verify Magic Link (Public)
const verifyMagicLinkRoute = createRoute({
  method: 'post',
  path: '/auth/validate-magic-link',
  tags: ['Public - Auth'],
  summary: 'Verify magic link and get user session',
  description:
    'Validate token from email link and return JWT for authenticated access',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            token: z.string().describe('Magic link token from email'),
          }),
          example: {
            token: 'ml_1a2b3c4d5e6f7g8h9i0j',
          },
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
                  lastName: 'Doe',
                },
                assigned: true,
                groupId: '60f7b3b3b3b3b3b3b3b3b3b4',
                eventId: '60f7b3b3b3b3b3b3b3b3b3b3',
              },
            },
            message: 'Authentication successful',
          },
        },
      },
      description: 'Magic link verified successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
          examples: {
            expired: {
              value: {
                success: false,
                error: 'Invalid or expired magic link',
              },
            },
            'already-used': {
              value: {
                success: false,
                error: 'Magic link already used',
              },
            },
          },
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
      return c.json(
        {
          success: false,
          error: 'Invalid or expired magic link',
        },
        400
      );
    }

    // Generate JWT session token using the utility method
    const sessionToken = JwtService.generateUserAccessToken(
      user.id,
      user.eventId
    );

    // Create session record
    await UserService.createSession(user.id);

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
    return c.json(
      {
        success: false,
        error: 'Authentication failed',
        details: error.message,
      },
      400
    );
  }
});

// =============================================================================
// AUTHENTICATED USER ENDPOINTS (JWT Required from /auth/validate-magic-link)
// =============================================================================

// Get User Itinerary (Authenticated)
const getUserItineraryRoute = createRoute({
  method: 'get',
  path: '/user/itinerary',
  tags: ['Public - User (Authenticated)'],
  summary: 'Get user assigned group activities',
  description:
    "Retrieve activities for the user's assigned group - requires JWT from magic link validation",
  middleware: [authenticateUser] as const,
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
          example: {
            success: true,
            data: {
              group: {
                id: '60f7b3b3b3b3b3b3b3b3b3b4',
                name: 'VIP Group A',
                eventId: '60f7b3b3b3b3b3b3b3b3b3b3',
              },
              timeline: [
                {
                  id: '60f7b3b3b3b3b3b3b3b3b3b5',
                  title: 'Welcome Reception',
                  startDateTime: '2025-09-05T19:00:00Z',
                  endDateTime: '2025-09-05T21:00:00Z',
                  content: '<p>Join us for cocktails and networking...</p>',
                  groupId: '60f7b3b3b3b3b3b3b3b3b3b4',
                },
              ],
            },
          },
        },
      },
      description: 'Itinerary retrieved successfully',
    },
    401: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: 'Missing or invalid authorization header',
          },
        },
      },
      description: 'Unauthorized - JWT required',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: 'Not assigned to any group yet',
          },
        },
      },
      description: 'User not assigned to group',
    },
  },
});

app.openapi(getUserItineraryRoute, async (c) => {
  // Manually run authentication middleware
  const authResult = await authenticateUser(c, async () => {});
  if (authResult) {
    return authResult; // Return auth error response
  }

  try {
    const userContext = c.get('user');

    if (!userContext || !userContext.userData) {
      return c.json(
        {
          success: false,
          error: 'User not authenticated',
        },
        401
      );
    }

    if (!userContext.userData?.groupId) {
      return c.json(
        {
          success: false,
          error: 'Not assigned to any group yet',
        },
        404
      );
    }

    // Get user-specific activities (filtered for exclusions)
    const { ActivityService } = await import('../../services/activities.js');
    const activities = await ActivityService.getUserTimeline(
      userContext.userData.id
    );

    return c.json({
      success: true,
      data: {
        group: userContext.userData.group,
        timeline: activities,
      },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Failed to retrieve itinerary',
        details: error.message,
      },
      500
    );
  }
});

// Get User Profile (Authenticated)
const getUserProfileRoute = createRoute({
  method: 'get',
  path: '/user/profile',
  tags: ['Public - User (Authenticated)'],
  summary: 'Get current user profile',
  description:
    'Retrieve complete user profile information - requires JWT from magic link validation',
  middleware: [authenticateUser] as const,
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
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
                phone: '+1-555-0123',
              },
              communication: {
                emailOptIn: true,
                whatsappOptIn: false,
              },
              assigned: true,
              groupId: '60f7b3b3b3b3b3b3b3b3b3b4',
              eventId: '60f7b3b3b3b3b3b3b3b3b3b3',
              flight: {
                airline: 'British Airways',
                number: 'BA123',
                arrival: '2024-09-15T14:30:00Z',
                departure: '2024-09-18T16:45:00Z',
              },
              accommodation: {
                required: true,
                hotel: 'Grand Hotel Milano',
              },
            },
          },
        },
      },
      description: 'Profile retrieved successfully',
    },
    401: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: 'Missing or invalid authorization header',
          },
        },
      },
      description: 'Unauthorized - JWT required',
    },
  },
});

app.openapi(getUserProfileRoute, async (c) => {
  // Manually run authentication middleware
  const authResult = await authenticateUser(c, async () => {});
  if (authResult) {
    return authResult; // Return auth error response
  }

  try {
    const userContext = c.get('user');

    if (!userContext || !userContext.userData) {
      return c.json(
        {
          success: false,
          error: 'User not authenticated',
        },
        401
      );
    }

    return c.json({
      success: true,
      data: userContext.userData,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Failed to retrieve profile',
        details: error.message,
      },
      500
    );
  }
});

// Update Communication Preferences (Authenticated)
const updateCommunicationPreferencesRoute = createRoute({
  method: 'put',
  path: '/user/communication-preferences',
  tags: ['Public - User (Authenticated)'],
  summary: 'Update user communication preferences',
  description:
    'Update email and WhatsApp notification preferences - requires JWT from magic link validation',
  middleware: [authenticateUser] as const,
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            emailOptIn: z.boolean().describe('Enable email notifications'),
            whatsappOptIn: z
              .boolean()
              .describe('Enable WhatsApp notifications'),
          }),
          example: {
            emailOptIn: true,
            whatsappOptIn: false,
          },
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
              id: '60f7b3b3b3b3b3b3b3b3b3b3',
              communication: {
                emailOptIn: true,
                whatsappOptIn: false,
              },
            },
            message: 'Communication preferences updated successfully',
          },
        },
      },
      description: 'Preferences updated successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: 'Failed to update preferences',
            details: 'Invalid request body',
          },
        },
      },
      description: 'Invalid request',
    },
    401: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: 'Missing or invalid authorization header',
          },
        },
      },
      description: 'Unauthorized - JWT required',
    },
  },
});

app.openapi(updateCommunicationPreferencesRoute, async (c) => {
  // Manually run authentication middleware
  const authResult = await authenticateUser(c, async () => {});
  if (authResult) {
    return authResult; // Return auth error response
  }

  try {
    const userContext = c.get('user');
    const body = c.req.valid('json');

    if (!userContext || !userContext.userData) {
      return c.json(
        {
          success: false,
          error: 'User not authenticated',
        },
        401
      );
    }

    const updatedUser = await UserService.updateCommunicationPreferences(
      userContext.userData.id,
      {
        emailOptIn: body.emailOptIn,
        whatsappOptIn: body.whatsappOptIn,
      }
    );

    return c.json({
      success: true,
      data: updatedUser,
      message: 'Communication preferences updated successfully',
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Failed to update preferences',
        details: error.message,
      },
      400
    );
  }
});

// =============================================================================
// PUBLIC ACTIVITY ENDPOINTS (No Authentication Required)
// =============================================================================

// Get Activity Details
const getActivityInfoRoute = createRoute({
  method: 'get',
  path: '/activity/{activityId}/info',
  tags: ['Public - Activities'],
  summary: 'Get public activity information',
  description:
    'Retrieve activity details for public display (no authentication required)',
  request: {
    params: z.object({
      activityId: z.string().min(1).openapi({
        description: 'Activity ID to get information for',
      }),
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
              id: '60f7b3b3b3b3b3b3b3b3b3b5',
              title: 'Welcome Reception',
              startDateTime: '2025-09-05T19:00:00Z',
              endDateTime: '2025-09-05T21:00:00Z',
              category: 'HOSPITALITY',
              location: {
                name: 'Grand Ballroom',
                address: '123 Main St, City, State',
                mapLink: 'https://maps.google.com/...',
              },
              content: {
                html: '<p>Join us for cocktails and networking...</p>',
              },
              thumbnail: 'https://example.com/reception.jpg',
              group: {
                id: '60f7b3b3b3b3b3b3b3b3b3b4',
                name: 'VIP Group A',
              },
              event: {
                id: '60f7b3b3b3b3b3b3b3b3b3b3',
                name: 'Corporate Event 2025',
                shortName: 'CE2025',
              },
            },
          },
        },
      },
      description: 'Activity information retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: 'Activity not found',
          },
        },
      },
      description: 'Activity not found',
    },
  },
});

app.openapi(getActivityInfoRoute, async (c) => {
  try {
    const { activityId } = c.req.valid('param');

    const { ActivityService } = await import('../../services/activities.js');
    const activity = await ActivityService.findById(activityId);

    if (!activity) {
      return c.json(
        {
          success: false,
          error: 'Activity not found',
        },
        404
      );
    }

    // Return public activity information
    return c.json({
      success: true,
      data: {
        id: activity.id,
        title: activity.title,
        description: activity.description,
        startDateTime: activity.startDateTime,
        endDateTime: activity.endDateTime,
        category: activity.category,
        location: activity.location,
        content: activity.content,
        thumbnail: activity.thumbnail,
        group: activity.group
          ? {
              id: activity.group.id,
              name: activity.group.name,
            }
          : null,
        event: activity.event
          ? {
              id: activity.event.id,
              name: activity.event.name,
              shortName: activity.event.shortName,
            }
          : null,
      },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Failed to retrieve activity information',
        details: error.message,
      },
      500
    );
  }
});

// =============================================================================
// UNSUBSCRIBE ENDPOINTS (No Authentication Required)
// =============================================================================

// Unsubscribe from email communications
const unsubscribeRoute = createRoute({
  method: 'get',
  path: '/unsubscribe/{userId}/{eventId}',
  tags: ['Public - Unsubscribe'],
  summary: 'Unsubscribe from email communications',
  description: 'Unsubscribe user from email notifications',
  request: {
    params: z.object({
      userId: z.string().min(1).describe('User ID'),
      eventId: z.string().min(1).describe('Event ID'),
    }),
  },
  responses: {
    200: {
      content: {
        'text/html': {
          schema: { type: 'string' },
        },
      },
      description: 'Unsubscribe confirmation page',
    },
    400: {
      content: {
        'text/html': {
          schema: { type: 'string' },
        },
      },
      description: 'Invalid request',
    },
    404: {
      content: {
        'text/html': {
          schema: { type: 'string' },
        },
      },
      description: 'User or event not found',
    },
  },
});

app.openapi(unsubscribeRoute, async (c) => {
  try {
    const { userId, eventId } = c.req.valid('param');

    // Unsubscribe user
    const result = await UserService.unsubscribeFromEmail(userId, eventId);
    if (!result.success) {
      const statusCode = result.error === 'User not found' ? 404 : 400;
      return c.html(
        generateUnsubscribeErrorPage(result.error || 'Failed to unsubscribe'),
        statusCode
      );
    }

    // Get user details for personalized confirmation
    const profile = result.user?.profile as any;
    const event = result.user?.event as any;
    const firstName = profile?.firstName || '';
    const eventName = event?.name || 'the event';

    return c.html(generateUnsubscribeSuccessPage(firstName, eventName));
  } catch (error: any) {
    return c.html(
      generateUnsubscribeErrorPage('An unexpected error occurred'),
      500
    );
  }
});

/**
 * Generate HTML for successful unsubscribe confirmation
 */
function generateUnsubscribeSuccessPage(
  firstName: string,
  eventName: string
): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Unsubscribed Successfully</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
        }
        .success-icon {
            font-size: 48px;
            color: #22c55e;
            margin-bottom: 20px;
        }
        h1 {
            color: #16a34a;
            margin-bottom: 16px;
            font-size: 28px;
        }
        p {
            margin-bottom: 16px;
            font-size: 16px;
            color: #666;
        }
        .highlight {
            font-weight: 600;
            color: #333;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e5e5;
            font-size: 14px;
            color: #888;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✓</div>
        <h1>You've Been Unsubscribed</h1>
        <p>
            ${firstName ? `Hi ${firstName}, you` : 'You'} have been successfully unsubscribed 
            from email notifications for <span class="highlight">${eventName}</span>.
        </p>
        <p>
            You will no longer receive email communications from us regarding this event.
        </p>
        <p>
            If you change your mind, you can update your preferences by logging into your account 
            or contacting our support team.
        </p>
        <div class="footer">
            <p>This change is effective immediately.</p>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate HTML for unsubscribe error page
 */
function generateUnsubscribeErrorPage(errorMessage: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Unsubscribe Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
        }
        .error-icon {
            font-size: 48px;
            color: #ef4444;
            margin-bottom: 20px;
        }
        h1 {
            color: #dc2626;
            margin-bottom: 16px;
            font-size: 28px;
        }
        p {
            margin-bottom: 16px;
            font-size: 16px;
            color: #666;
        }
        .error-message {
            background: #fef2f2;
            border: 1px solid #fecaca;
            padding: 12px;
            border-radius: 4px;
            color: #991b1b;
            margin: 20px 0;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e5e5;
            font-size: 14px;
            color: #888;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">⚠</div>
        <h1>Unable to Unsubscribe</h1>
        <div class="error-message">
            ${errorMessage}
        </div>
        <p>
            If you're still receiving unwanted emails, please contact our support team 
            and we'll help you resolve this issue.
        </p>
        <div class="footer">
            <p>We apologize for any inconvenience.</p>
        </div>
    </div>
</body>
</html>`;
}

export default app;
