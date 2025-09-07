import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { UserService } from '../../services/users.js';
import { EventService } from '../../services/events.js';
import {
  CreateUserSchema,
  PublicRegistrationSchema,
  ApiSuccessSchema,
  ApiErrorSchema,
} from '../../types/index.js';
import { authenticateUser, AuthContext } from '../../middleware/auth.js';



const app = new OpenAPIHono<{ Variables: AuthContext }>();



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
              name: 'F1 Singapore Grand Prix 2025',
              shortName: 'Singapore 2025',
              location: {
                city: 'Singapore',
                country: 'Singapore',
                venue: 'Marina Bay Street Circuit',
                timezone: 'Asia/Singapore',
              },
              dateRange: {
                start: '2025-09-18T00:00:00Z',
                end: '2025-09-21T23:59:59Z',
              },
              config: {
                registrationOpen: true,
              },
              hotelConfig: {
                hotels: [{
                  name: 'Grand Hotel Singapore',
                  isDefault: true,
                  roomTypes: ['Deluxe King', 'Premium Twin', 'Suite'],
                  checkInTime: '15:00',
                  checkOutTime: '11:00'
                }]
              },
              termsConditions: '<p>Event terms and conditions...</p>',
              privacyPolicy: '<p>Privacy policy content...</p>',
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
        // Singapore Phase 2 additions
        hotelConfig: event.hotelConfig || null,
        termsConditions: event.termsConditions || null,
        privacyPolicy: event.privacyPolicy || null,
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









// =============================================================================
// AUTHENTICATED USER ENDPOINTS (Email Required in Request Body)
// =============================================================================

// Get User Itinerary (Authenticated)
const getUserItineraryRoute = createRoute({
  method: 'post',
  path: '/user/itinerary',
  tags: ['Public - User (Authenticated)'],
  summary: 'Get user assigned group activities',
  description:
    "Retrieve activities for the user's assigned group - requires email in request body",
  middleware: [authenticateUser] as const,
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email().describe('User email for authentication'),
          }),
          example: {
            email: 'john.doe@example.com',
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
      description: 'Unauthorized - email required',
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
  // Apply authentication middleware manually
  const authResult = await authenticateUser(c, async () => { });
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
  method: 'post',
  path: '/user/profile',
  tags: ['Public - User (Authenticated)'],
  summary: 'Get current user profile',
  description:
    'Retrieve complete user profile information - requires email in request body',
  middleware: [authenticateUser] as const,
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email().describe('User email for authentication'),
          }),
          example: {
            email: 'john.doe@example.com',
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
      description: 'Unauthorized - email required',
    },
  },
});

app.openapi(getUserProfileRoute, async (c) => {
  // Apply authentication middleware manually
  const authResult = await authenticateUser(c, async () => { });
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
    'Update email and WhatsApp notification preferences - requires email in request body',
  middleware: [authenticateUser] as const,
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email().describe('User email for authentication'),
            emailOptIn: z.boolean().describe('Enable email notifications'),
            whatsappOptIn: z
              .boolean()
              .describe('Enable WhatsApp notifications'),
          }),
          example: {
            email: 'john.doe@example.com',
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
      description: 'Unauthorized - email required',
    },
  },
});

app.openapi(updateCommunicationPreferencesRoute, async (c) => {
  // Manually run authentication middleware
  const authResult = await authenticateUser(c, async () => { });
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
      return c.json({
        success: false,
        error: result.error || 'Failed to unsubscribe'
      }, statusCode);
    }

    // Get user details for personalized confirmation
    const profile = result.user?.profile as any;
    const event = result.user?.event as any;
    const firstName = profile?.firstName || '';
    const eventName = event?.name || 'the event';

    return c.json({
      success: true,
      message: `${firstName} successfully unsubscribed from ${eventName}`
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'An unexpected error occurred'
    }, 500);
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
