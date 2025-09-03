import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { UserService } from '../services/users.js';
import { JwtService } from '../utils/jwt.js';
import {
  CreateUserSchema,
  PaginationSchema,
  ApiSuccessSchema,
  ApiErrorSchema,
} from '../types/index.js';
import { EmailService } from '../services/email';
import { EventService } from '../services/events';

const app = new OpenAPIHono();

// Admin user registration moved to /controllers/admin.ts for proper security

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
      return c.json(
        {
          success: false,
          error: 'User not found for this event',
        },
        404
      );
    }

    // fetch event
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

    const magicToken = await UserService.createMagicLink(user.id);

    if (event.config['micrositeUrl'] === 'undefined') {
      return c.json(
        {
          success: false,
          error: 'URL is not set in the event yet',
        },
        404
      );
    }

    // TODO: Send email with magic link
    await EmailService.sendMagicLinkEmail(email, {
      eventName: event.name,
      firstName: (user.profile['firstName'] as string) || '',
      lastName: (user.profile['lastName'] as string) || '',
      magicLink: `https://${event.config['micrositeUrl'] ?? 'undefined'}/auth/magic?token=${magicToken}`,
      unsubscribeLink: `${process.env.APP_URL || 'http://localhost:3001'}/api/unsubscribe/${user.id}/${eventId}`,
    });

    return c.json({
      success: true,
      message: 'Magic link sent to your email',
      data: {
        // In development, return the token for testing
        ...(process.env.NODE_ENV === 'development' && { magicToken }),
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
      return c.json(
        {
          success: false,
          error: 'Invalid or expired magic link',
        },
        401
      );
    }

    const accessToken = JwtService.generateUserAccessToken(
      user.id,
      user.eventId
    );

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
    return c.json(
      {
        success: false,
        error: 'Authentication failed',
        details: error.message,
      },
      401
    );
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
    return c.json(
      {
        success: false,
        error: 'Failed to update user',
        details: error.message,
      },
      400
    );
  }
});

// Patch User (for frontend compatibility)
const patchUserRoute = createRoute({
  method: 'patch',
  path: '/users/{id}',
  tags: ['Users'],
  summary: 'Patch user information',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateUserSchema.omit({ eventId: true }).partial(),
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

app.openapi(patchUserRoute, async (c) => {
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
    return c.json(
      {
        success: false,
        error: 'Failed to update user',
        details: error.message,
      },
      400
    );
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
    return c.json(
      {
        success: false,
        error: 'Assignment failed',
        details: error.message,
      },
      400
    );
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
    return c.json(
      {
        success: false,
        error: 'Unassignment failed',
        details: error.message,
      },
      400
    );
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
    return c.json(
      {
        success: false,
        error: 'Failed to retrieve requirements summary',
        details: error.message,
      },
      500
    );
  }
});

// Get User Statistics for Event
const getUserStatsRoute = createRoute({
  method: 'get',
  path: '/users/stats/{eventId}',
  tags: ['Users'],
  summary: 'Get user statistics for an event',
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

    const [totalUsers, assignedUsers, unassignedUsers, registeredUsers] =
      await prisma.$transaction([
        prisma.user.count({ where: { eventId, active: true } }),
        prisma.user.count({ where: { eventId, active: true, assigned: true } }),
        prisma.user.count({
          where: { eventId, active: true, assigned: false },
        }),
        prisma.user.count({ where: { eventId, active: true } }),
      ]);

    const stats = {
      totalUsers,
      assignedUsers,
      unassignedUsers,
      registeredUsers,
      registrationPercentage:
        totalUsers > 0 ? Math.round((assignedUsers / totalUsers) * 100) : 0,
    };

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Failed to retrieve user statistics',
        details: error.message,
      },
      500
    );
  }
});

// Export Users
const exportUsersRoute = createRoute({
  method: 'get',
  path: '/users/export',
  tags: ['Users'],
  summary: 'Export users data in various formats',
  request: {
    query: z.object({
      eventId: z.string().min(1),
      format: z.enum(['csv', 'json']).optional().default('csv'),
    }),
  },
  responses: {
    200: {
      content: {
        'text/csv': {
          schema: z.string(),
        },
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Users data exported successfully',
    },
  },
});

app.openapi(exportUsersRoute, async (c) => {
  try {
    const { eventId, format } = c.req.valid('query');

    const users = await prisma.user.findMany({
      where: { eventId, active: true },
      include: {
        group: {
          select: { name: true },
        },
      },
      orderBy: { registeredAt: 'desc' },
    });

    if (format === 'csv') {
      // Generate CSV format
      const headers = [
        'Email',
        'First Name',
        'Last Name',
        'Phone',
        'Group',
        'Assigned',
        'Registered At',
        'Email Opt-In',
        'WhatsApp Opt-In',
        'Airline',
        'Flight Number',
        'Arrival',
        'Departure',
        'Hotel Required',
        'Hotel Name',
        'Check-In',
        'Check-Out',
        'Transfer Requirements',
        'Dietary Requirements',
        'Medical Requirements',
        'Accessibility Requirements',
        'Shirt Size',
        'Jacket Size',
        'Hat Size',
        'Emergency Contact Name',
        'Emergency Contact Phone',
        'Emergency Contact Email',
      ];

      const csvData = users.map((user) => {
        const profile = (user.profile as any) || {};
        const communication = (user.communication as any) || {};
        const flight = (user.flight as any) || {};
        const accommodation = (user.accommodation as any) || {};
        const requirements = (user.requirements as any) || {};
        const merchandiseSize = (user.merchandiseSize as any) || {};
        const emergencyContact = (user.emergencyContact as any) || {};

        return [
          profile.email || '',
          profile.firstName || '',
          profile.lastName || '',
          profile.phone || '',
          user.group?.name || 'Unassigned',
          user.assigned ? 'Yes' : 'No',
          user.registeredAt?.toISOString() || '',
          communication.emailOptIn ? 'Yes' : 'No',
          communication.whatsappOptIn ? 'Yes' : 'No',
          flight.airline || '',
          flight.number || '',
          flight.arrival || '',
          flight.departure || '',
          accommodation.required ? 'Yes' : 'No',
          accommodation.hotel || '',
          accommodation.checkIn || '',
          accommodation.checkOut || '',
          user.transferRequirements || '',
          requirements.dietary || '',
          requirements.medical || '',
          requirements.accessibility || '',
          merchandiseSize.shirt || '',
          merchandiseSize.jacket || '',
          merchandiseSize.hat || '',
          emergencyContact.name || '',
          emergencyContact.phone || '',
          emergencyContact.email || '',
        ];
      });

      const csvContent = [headers, ...csvData]
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        )
        .join('\n');

      c.header('Content-Type', 'text/csv');
      c.header(
        'Content-Disposition',
        `attachment; filename="users-${eventId}-${new Date().toISOString().split('T')[0]}.csv"`
      );
      return c.text(csvContent);
    }

    // JSON format
    return c.json({
      success: true,
      data: users,
      message: 'Users exported successfully',
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Failed to export users',
        details: error.message,
      },
      500
    );
  }
});

export default app;
