import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { AdminService } from '../services/admins.js';
import { UserService } from '../services/users.js';
import { EventService } from '../services/events.js';
import { GroupService } from '../services/groups.js';
import { ActivityService } from '../services/activities.js';
import { CommunicationLogService } from '../services/communication-logs.js';
import { CommunicationsService } from '../services/communications.js';
import { S3Service } from '../services/s3.js';
import { JwtService } from '../utils/jwt.js';
import { 
  AdminLoginSchema, 
  CreateGroupSchema, 
  UpdateGroupSchema,
  CreateEventSchema,
  CreateActivitySchema,
  UpdateActivitySchema,
  AdminUpdateUserSchema,
  CreateUserSchema,
  PaginationSchema,
  ApiSuccessSchema, 
  ApiErrorSchema 
} from '../types/index.js';

const app = new OpenAPIHono();

// =============================================================================
// 1. ADMIN AUTHENTICATION
// =============================================================================

const adminLoginRoute = createRoute({
  method: 'post',
  path: '/login',
  tags: ['Admin - Authentication'],
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

    const accessToken = JwtService.generateAdminAccessToken(admin.id, admin.role);
    
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
          role: admin.role === 'SUPER' ? 'super' : 'standard',
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

// =============================================================================
// 2. USER MANAGEMENT
// =============================================================================

// Admin User Registration - used by admin dashboard to create users
const adminRegisterUserRoute = createRoute({
  method: 'post',
  path: '/users/register',
  tags: ['Admin - Users'],
  summary: 'Register a new user for an event (Admin Only)',
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

app.openapi(adminRegisterUserRoute, async (c) => {
  try {
    const data = c.req.valid('json');
    const authUser = c.get('user');
    
    // Verify admin has access to this event
    if (authUser.adminData.role !== 'SUPER') {
      // Standard admins can only create users for events they're assigned to
      const hasAccess = authUser.adminData.eventIds?.includes(data.eventId);
      if (!hasAccess) {
        return c.json({
          success: false,
          error: 'Access denied to this event',
        }, 403);
      }
    }
    
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

// Export routes MUST come before parameterized routes to avoid conflicts
const exportUsersRoute = createRoute({
  method: 'get',
  path: '/users/export',
  tags: ['Admin - Data Export'],
  summary: 'Export users data',
  request: {
    query: z.object({
      eventId: z.string().min(1),
      format: z.enum(['csv', 'json']).default('csv'),
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
      description: 'Export completed successfully',
    },
  },
});

app.openapi(exportUsersRoute, async (c) => {
  try {
    const { eventId, format } = c.req.valid('query');
    
    // Get all users for the event
    const users = await UserService.findByEventId(eventId, { page: 1, limit: 10000 }, {});
    
    if (format === 'csv') {
      // CSV headers matching import template exactly
      const headers = [
        'firstName', 'lastName', 'email', 'phone', 'group',
        'dietaryRequirements', 'medicalRequirements', 'accessibilityRequirements',
        'accommodationRequired', 'hotel', 'checkInDate', 'checkOutDate',
        'flightArrival', 'flightDeparture', 'emergencyContactName', 'emergencyContactPhone'
      ];
      
      // Get groups for lookup
      const groups = await GroupService.findByEventId(eventId, { page: 1, limit: 1000 });
      const groupLookup = new Map(groups.items.map(g => [g.id, g.name]));
      
      // Convert users to CSV rows
      const rows = users.items.map(user => {
        const profile = (user.profile as any) || {};
        const requirements = (user.requirements as any) || {};
        const accommodation = (user.accommodation as any) || {};
        const flight = (user.flight as any) || {};
        const emergency = (user.emergencyContact as any) || {};
        
        return [
          profile.firstName || '',
          profile.lastName || '',
          profile.email || '',
          profile.phone || '',
          user.groupId ? (groupLookup.get(user.groupId) || user.groupId) : '',
          requirements.dietary || '',
          requirements.medical || '',
          requirements.accessibility || '',
          accommodation.required ? 'Yes' : 'No',
          accommodation.hotel || '',
          accommodation.checkIn ? new Date(accommodation.checkIn).toISOString().split('T')[0] : '',
          accommodation.checkOut ? new Date(accommodation.checkOut).toISOString().split('T')[0] : '',
          flight.arrival ? new Date(flight.arrival).toISOString().slice(0, 16).replace('T', ' ') : '',
          flight.departure ? new Date(flight.departure).toISOString().slice(0, 16).replace('T', ' ') : '',
          emergency.name || '',
          emergency.phone || ''
        ];
      });
      
      const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
        
      c.header('Content-Type', 'text/csv');
      c.header('Content-Disposition', `attachment; filename="users-${eventId}-${new Date().toISOString().split('T')[0]}.csv"`);
      return c.text(csvContent);
    } else {
      return c.json({
        success: true,
        data: users,
      });
    }
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Export failed',
      details: error.message,
    }, 500);
  }
});

const getUsersRoute = createRoute({
  method: 'get',
  path: '/users',
  tags: ['Admin - Users'],
  summary: 'Get users with comprehensive filters',
  request: {
    query: PaginationSchema.extend({
      eventId: z.string(),
      search: z.string().optional(),
      assigned: z.coerce.boolean().optional(),
      groupId: z.string().optional(),
      requirementType: z.enum(['dietary', 'medical', 'accessibility', 'accommodation', 'any']).optional(),
      communicationType: z.enum(['email-only', 'whatsapp-only', 'both', 'none', 'any']).optional(),
      hasRequirements: z.coerce.boolean().optional(),
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

app.openapi(getUsersRoute, async (c) => {
  try {
    const { 
      page, 
      limit, 
      eventId, 
      search,
      assigned,
      groupId,
      requirementType,
      communicationType,
      hasRequirements
    } = c.req.valid('query');

    const result = await UserService.findByEventId(
      eventId,
      { page: page || 1, limit: limit || 20 },
      { 
        search,
        assigned,
        groupId,
        requirementType,
        communicationType,
        hasRequirements
      }
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

const getUserByIdRoute = createRoute({
  method: 'get',
  path: '/users/{userId}',
  tags: ['Admin - Users'],
  summary: 'Get user by ID',
  request: {
    params: z.object({
      userId: z.string().min(1),
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
    const { userId } = c.req.valid('param');
    const user = await UserService.findById(userId);
    
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

const getUserStatsRoute = createRoute({
  method: 'get',
  path: '/users/stats/{eventId}',
  tags: ['Admin - Users'],
  summary: 'Get user statistics for event',
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
    const authUser = c.get('user');
    
    // Check if admin has access to this event
    if (authUser.adminData?.role !== 'SUPER') {
      const hasAccess = await AdminService.hasEventAccess(authUser.id, eventId);
      if (!hasAccess) {
        return c.json({
          success: false,
          error: 'Access denied to this event',
        }, 403);
      }
    }
    
    const { prisma } = await import('../config/database.js');
    
    const [
      totalUsers,
      assignedUsers,
      unassignedUsers
    ] = await prisma.$transaction([
      prisma.user.count({ where: { eventId, active: true } }),
      prisma.user.count({ where: { eventId, active: true, assigned: true } }),
      prisma.user.count({ where: { eventId, active: true, assigned: false } }),
    ]);

    const stats = {
      total: totalUsers,
      assigned: assignedUsers,
      unassigned: unassignedUsers,
      registrationPercentage: totalUsers > 0 ? Math.round((assignedUsers / totalUsers) * 100) : 0,
    };
    
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

const updateUserRoute = createRoute({
  method: 'put',
  path: '/users/{userId}',
  tags: ['Admin - Users'],
  summary: 'Update user profile',
  request: {
    params: z.object({
      userId: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: AdminUpdateUserSchema,
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
    const { userId } = c.req.valid('param');
    const updates = c.req.valid('json');
    
    // Build the update payload for partial updates - only include changed fields
    const updatePayload: any = {};
    
    // Handle profile fields - only include if any profile field was updated
    const profileFields = ['firstName', 'lastName', 'email', 'phone'];
    const hasProfileUpdates = profileFields.some(field => updates[field] !== undefined);
    
    if (hasProfileUpdates) {
      // Get current user to merge with updates
      const currentUser = await UserService.findById(userId);
      if (!currentUser) {
        throw new Error('User not found');
      }
      
      const currentProfile = currentUser.profile as any || {};
      updatePayload.profile = {
        ...currentProfile,
        // Only update fields that were provided
        ...(updates.firstName !== undefined && { firstName: updates.firstName }),
        ...(updates.lastName !== undefined && { lastName: updates.lastName }),
        ...(updates.email !== undefined && { email: updates.email }),
        ...(updates.phone !== undefined && { phone: updates.phone }),
      };
    }
    
    // Handle other fields - only include if explicitly provided
    // Note: communication field excluded from admin updates for privacy/consent compliance
    if (updates.flight !== undefined) updatePayload.flight = updates.flight;
    if (updates.accommodation !== undefined) updatePayload.accommodation = updates.accommodation;
    if (updates.transferRequirements !== undefined) updatePayload.transferRequirements = updates.transferRequirements;
    if (updates.requirements !== undefined) updatePayload.requirements = updates.requirements;
    if (updates.merchandiseSize !== undefined) updatePayload.merchandiseSize = updates.merchandiseSize;
    if (updates.emergencyContact !== undefined) updatePayload.emergencyContact = updates.emergencyContact;
    
    const user = await UserService.update(userId, updatePayload);
    
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

const deleteUserRoute = createRoute({
  method: 'delete',
  path: '/users/{userId}',
  tags: ['Admin - Users'],
  summary: 'Soft delete user',
  request: {
    params: z.object({
      userId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'User deleted successfully',
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

app.openapi(deleteUserRoute, async (c) => {
  try {
    const { userId } = c.req.valid('param');
    const user = await UserService.softDelete(userId);
    
    return c.json({
      success: true,
      data: user,
      message: 'User deleted successfully',
    });
  } catch (error: any) {
    const statusCode = error.message.includes('not found') ? 404 : 400;
    return c.json({
      success: false,
      error: 'Failed to delete user',
      details: error.message,
    }, statusCode);
  }
});

const assignUserRoute = createRoute({
  method: 'put',
  path: '/users/{userId}/assign',
  tags: ['Admin - Users'],
  summary: 'Assign user to group',
  request: {
    params: z.object({
      userId: z.string().min(1),
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
      description: 'User assigned successfully',
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

app.openapi(assignUserRoute, async (c) => {
  try {
    const { userId } = c.req.valid('param');
    const { groupId } = c.req.valid('json');
    const authUser = c.get('user');
    
    const user = await UserService.assignToGroup(userId, groupId, authUser.id);
    
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

const unassignUserRoute = createRoute({
  method: 'post',
  path: '/users/{userId}/unassign',
  tags: ['Admin - Users'],
  summary: 'Unassign user from group',
  request: {
    params: z.object({
      userId: z.string().min(1),
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
      description: 'User unassigned successfully',
    },
  },
});

app.openapi(unassignUserRoute, async (c) => {
  try {
    const { userId } = c.req.valid('param');
    const authUser = c.get('user');
    
    const user = await UserService.unassignFromGroup(userId, authUser.id);
    
    return c.json({
      success: true,
      data: user,
      message: 'User unassigned successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Unassignment failed',
      details: error.message,
    }, 400);
  }
});

// =============================================================================
// 3. GROUP MANAGEMENT
// =============================================================================

const exportGroupsRoute = createRoute({
  method: 'get',
  path: '/groups/export',
  tags: ['Admin - Data Export'],
  summary: 'Export groups data',
  request: {
    query: z.object({
      eventId: z.string().min(1),
      format: z.enum(['csv', 'json']).default('csv'),
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
      description: 'Export completed successfully',
    },
  },
});

app.openapi(exportGroupsRoute, async (c) => {
  try {
    const { eventId, format } = c.req.valid('query');
    
    const groups = await GroupService.findByEventId(eventId, { page: 1, limit: 10000 });
    
    if (format === 'csv') {
      // CSV headers matching import template exactly
      const headers = ['name', 'description', 'capacity', 'category', 'assignedMembers'];
      
      // Get users to build member lists
      const users = await UserService.findByEventId(eventId, { page: 1, limit: 10000 }, {});
      
      const rows = groups.items.map(group => {
        // Find users assigned to this group
        const assignedUsers = users.items.filter(u => u.groupId === group.id);
        const memberEmails = assignedUsers.map(u => (u.profile as any)?.email).filter(Boolean).join(',');
        
        return [
          group.name,
          group.description || '',
          group.memberCount.toString(),
          'Standard', // category - default value
          memberEmails
        ];
      });
      
      const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
        
      c.header('Content-Type', 'text/csv');
      c.header('Content-Disposition', `attachment; filename="groups-${eventId}-${new Date().toISOString().split('T')[0]}.csv"`);
      return c.text(csvContent);
    } else {
      return c.json({
        success: true,
        data: groups,
      });
    }
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Export failed',
      details: error.message,
    }, 500);
  }
});

const getGroupsRoute = createRoute({
  method: 'get',
  path: '/groups',
  tags: ['Admin - Groups'],
  summary: 'Get groups',
  request: {
    query: z.object({
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
      description: 'Groups retrieved successfully',
    },
  },
});

app.openapi(getGroupsRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('query');
    const result = await GroupService.findByEventId(eventId, { page: 1, limit: 100 });
    
    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve groups',
      details: error.message,
    }, 500);
  }
});

const getGroupByIdRoute = createRoute({
  method: 'get',
  path: '/groups/{groupId}',
  tags: ['Admin - Groups'],
  summary: 'Get group by ID',
  request: {
    params: z.object({
      groupId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Group retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Group not found',
    },
  },
});

app.openapi(getGroupByIdRoute, async (c) => {
  try {
    const { groupId } = c.req.valid('param');
    const group = await GroupService.findById(groupId);
    
    if (!group) {
      return c.json({
        success: false,
        error: 'Group not found',
      }, 404);
    }
    
    return c.json({
      success: true,
      data: group,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve group',
      details: error.message,
    }, 500);
  }
});

const getGroupMembersRoute = createRoute({
  method: 'get',
  path: '/groups/{groupId}/members',
  tags: ['Admin - Groups'],
  summary: 'Get group members',
  request: {
    params: z.object({
      groupId: z.string().min(1),
    }),
    query: PaginationSchema.extend({
      search: z.string().optional(),
      hasRequirements: z.coerce.boolean().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Group members retrieved successfully',
    },
  },
});

app.openapi(getGroupMembersRoute, async (c) => {
  try {
    const { groupId } = c.req.valid('param');
    const { page, limit, search, hasRequirements } = c.req.valid('query');
    const result = await GroupService.getMembers(
      groupId, 
      { page: page || 1, limit: limit || 20 }, 
      { search, hasRequirements }
    );
    
    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve group members',
      details: error.message,
    }, 500);
  }
});

const createGroupRoute = createRoute({
  method: 'post',
  path: '/groups',
  tags: ['Admin - Groups'],
  summary: 'Create group',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateGroupSchema,
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
      description: 'Group created successfully',
    },
  },
});

app.openapi(createGroupRoute, async (c) => {
  try {
    const data = c.req.valid('json');
    const group = await GroupService.create(data);
    
    return c.json({
      success: true,
      data: group,
      message: 'Group created successfully',
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to create group',
      details: error.message,
    }, 400);
  }
});

const updateGroupRoute = createRoute({
  method: 'patch',
  path: '/groups/{groupId}',
  tags: ['Admin - Groups'],
  summary: 'Update group',
  request: {
    params: z.object({
      groupId: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateGroupSchema.partial(),
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
      description: 'Group updated successfully',
    },
  },
});

app.openapi(updateGroupRoute, async (c) => {
  try {
    const { groupId } = c.req.valid('param');
    const data = c.req.valid('json');
    const group = await GroupService.update(groupId, data);
    
    return c.json({
      success: true,
      data: group,
      message: 'Group updated successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to update group',
      details: error.message,
    }, 400);
  }
});

const deleteGroupRoute = createRoute({
  method: 'delete',
  path: '/groups/{groupId}',
  tags: ['Admin - Groups'],
  summary: 'Soft delete group',
  request: {
    params: z.object({
      groupId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Group deleted successfully',
    },
  },
});

app.openapi(deleteGroupRoute, async (c) => {
  try {
    const { groupId } = c.req.valid('param');
    const group = await GroupService.softDelete(groupId);
    
    return c.json({
      success: true,
      data: group,
      message: 'Group deleted successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to delete group',
      details: error.message,
    }, 400);
  }
});

const getEventOverviewStatsRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}/overview',
  tags: ['Admin - Stats'],
  summary: 'Get comprehensive overview statistics for event',
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
      description: 'Overview statistics retrieved successfully',
    },
  },
});

app.openapi(getEventOverviewStatsRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');
    const authUser = c.get('user');
    
    // Check if admin has access to this event
    if (authUser.adminData?.role !== 'SUPER') {
      const hasAccess = await AdminService.hasEventAccess(authUser.id, eventId);
      if (!hasAccess) {
        return c.json({
          success: false,
          error: 'Access denied to this event',
        }, 403);
      }
    }
    
    const { prisma } = await import('../config/database.js');
    
    // Get user statistics
    const [
      totalUsers,
      assignedUsers,
      unassignedUsers
    ] = await prisma.$transaction([
      prisma.user.count({ where: { eventId, active: true } }),
      prisma.user.count({ where: { eventId, active: true, assigned: true } }),
      prisma.user.count({ where: { eventId, active: true, assigned: false } }),
    ]);

    // Get group distribution
    const groups = await prisma.group.findMany({
      where: { eventId, deleted: false },
      include: {
        _count: {
          select: {
            users: { where: { assigned: true, active: true } }
          }
        }
      }
    });

    const groupDistribution = groups.map(group => ({
      id: group.id,
      name: group.name,
      count: group._count.users,
      description: group.description
    }));

    // Get communication preferences
    const users = await prisma.user.findMany({
      where: { eventId, active: true },
      select: { communication: true }
    });

    const emailOptIns = users.filter((u: any) => u.communication?.emailOptIn).length;
    const whatsappOptIns = users.filter((u: any) => u.communication?.whatsappOptIn).length;
    const bothChannels = users.filter((u: any) => u.communication?.emailOptIn && u.communication?.whatsappOptIn).length;
    const noCommunication = users.filter((u: any) => !u.communication?.emailOptIn && !u.communication?.whatsappOptIn).length;

    const communicationPreferences = {
      emailOnly: emailOptIns - bothChannels,
      whatsappOnly: whatsappOptIns - bothChannels,
      bothChannels,
      noCommunication,
      total: users.length
    };

    // Get special requirements breakdown
    const requirementsUsers = await prisma.user.findMany({
      where: { eventId, active: true },
      select: { requirements: true, accommodation: true }
    });

    const requirementStats = {
      dietary: requirementsUsers.filter((u: any) => u.requirements?.dietary).length,
      medical: requirementsUsers.filter((u: any) => u.requirements?.medical).length,
      accessibility: requirementsUsers.filter((u: any) => u.requirements?.accessibility).length,
      accommodation: requirementsUsers.filter((u: any) => u.accommodation?.required).length,
      any: requirementsUsers.filter((u: any) => 
        u.requirements?.dietary || u.requirements?.medical || u.requirements?.accessibility || u.accommodation?.required
      ).length
    };

    const overviewStats = {
      users: {
        total: totalUsers,
        assigned: assignedUsers,
        unassigned: unassignedUsers,
        assignmentPercentage: totalUsers > 0 ? Math.round((assignedUsers / totalUsers) * 100) : 0
      },
      groups: {
        total: groups.length,
        distribution: groupDistribution
      },
      communication: communicationPreferences,
      requirements: requirementStats,
      messages: {
        thisWeek: 0, // TODO: Implement when messaging service exists
        total: 0
      }
    };
    
    return c.json({
      success: true,
      data: overviewStats,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve overview statistics',
      details: error.message,
    }, 500);
  }
});

// =============================================================================
// 4. MESSAGING (Admin JWT Required)
// =============================================================================

const getMessageHistoryRoute = createRoute({
  method: 'get',
  path: '/messages/history',
  tags: ['Admin - Messages'],
  summary: 'Get message history',
  request: {
    query: PaginationSchema.extend({
      eventId: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Message history retrieved successfully',
    },
  },
});

app.openapi(getMessageHistoryRoute, async (c) => {
  try {
    const { page, limit, eventId } = c.req.valid('query');
    
    // TODO: Implement messaging service - for now return empty data
    const result = {
      items: [],
      pagination: {
        page: page || 1,
        limit: limit || 20,
        total: 0,
        totalPages: 0
      },
      stats: {
        total: 0,
        sent: 0,
        pending: 0,
        failed: 0
      }
    };
    
    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve message history',
      details: error.message,
    }, 500);
  }
});

// =============================================================================
// 5. EVENTS (Super Admin Only)
// =============================================================================

const createEventRoute = createRoute({
  method: 'post',
  path: '/events',
  tags: ['Super Admin - Events'],
  summary: 'Create new event (Super Admin only)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateEventSchema,
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
      description: 'Event created successfully',
    },
    403: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Super admin access required',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Invalid input data',
    },
  },
});

app.openapi(createEventRoute, async (c) => {
  try {
    const authUser = c.get('user');
    
    // Check if user is a super admin
    if (!authUser || authUser.adminData?.role !== 'SUPER') {
      return c.json({
        success: false,
        error: 'Super admin access required to create events',
      }, 403);
    }

    const data = c.req.valid('json');
    const event = await EventService.create(data);
    
    return c.json({
      success: true,
      data: event,
      message: 'Event created successfully',
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to create event',
      details: error.message,
    }, 400);
  }
});

const updateEventRoute = createRoute({
  method: 'patch',
  path: '/events/{eventId}',
  tags: ['Admin - Events'],
  summary: 'Update event (Super Admin or assigned Standard Admin)',
  request: {
    params: z.object({
      eventId: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateEventSchema.partial(),
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
      description: 'Event updated successfully',
    },
    403: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Access denied to this event',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Event not found',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Invalid input data',
    },
  },
});

app.openapi(updateEventRoute, async (c) => {
  try {
    const authUser = c.get('user');
    const { eventId } = c.req.valid('param');
    
    // Check if admin has access to this event
    if (authUser.adminData?.role !== 'SUPER') {
      const hasAccess = await AdminService.hasEventAccess(authUser.id, eventId);
      if (!hasAccess) {
        return c.json({
          success: false,
          error: 'Access denied to this event',
        }, 403);
      }
    }
    const data = c.req.valid('json');
    const event = await EventService.update(eventId, data);
    
    return c.json({
      success: true,
      data: event,
      message: 'Event updated successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to update event',
      details: error.message,
    }, 400);
  }
});

const toggleEventStatusRoute = createRoute({
  method: 'patch',
  path: '/events/{eventId}/toggle',
  tags: ['Super Admin - Events'],
  summary: 'Toggle event active status (Super Admin only)',
  request: {
    params: z.object({
      eventId: z.string().min(1),
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
      description: 'Event status updated successfully',
    },
    403: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Super admin access required',
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

app.openapi(toggleEventStatusRoute, async (c) => {
  try {
    const authUser = c.get('user');
    
    // Check if user is a super admin
    if (!authUser || authUser.adminData?.role !== 'SUPER') {
      return c.json({
        success: false,
        error: 'Super admin access required to modify events',
      }, 403);
    }

    const { eventId } = c.req.valid('param');
    const { active } = c.req.valid('json');
    
    const event = await EventService.update(eventId, { active });
    
    return c.json({
      success: true,
      data: event,
      message: `Event ${active ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to update event status',
      details: error.message,
    }, 400);
  }
});

const getEventsRoute = createRoute({
  method: 'get',
  path: '/events',
  tags: ['Super Admin - Events'],
  summary: 'Get all events',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Events retrieved successfully',
    },
  },
});

app.openapi(getEventsRoute, async (c) => {
  try {
    const authUser = c.get('user');
    
    let eventsResult;
    if (authUser.adminData?.role === 'SUPER') {
      // Super admins can see all events
      eventsResult = await EventService.findAll({ page: 1, limit: 100 }, {});
    } else {
      // Standard admins only see assigned events
      const assignedEvents = await AdminService.getAssignedEvents(authUser.id);
      eventsResult = {
        items: assignedEvents,
        pagination: {
          page: 1,
          limit: 100,
          total: assignedEvents.length,
          totalPages: 1
        }
      };
    }
    
    return c.json({
      success: true,
      data: eventsResult,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve events',
      details: error.message,
    }, 500);
  }
});

// =============================================================================
// 4. EVENT MANAGEMENT 
// =============================================================================

const getEventByIdRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}',
  tags: ['Admin - Events'],
  summary: 'Get event by ID',
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
      description: 'Event retrieved successfully',
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

app.openapi(getEventByIdRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');
    const authUser = c.get('user');
    
    // Check if admin has access to this event
    if (authUser.adminData?.role !== 'SUPER') {
      const hasAccess = await AdminService.hasEventAccess(authUser.id, eventId);
      if (!hasAccess) {
        return c.json({
          success: false,
          error: 'Access denied to this event',
        }, 403);
      }
    }
    
    const event = await EventService.findById(eventId);
    
    if (!event) {
      return c.json({
        success: false,
        error: 'Event not found',
      }, 404);
    }
    
    return c.json({
      success: true,
      data: event,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve event',
      details: error.message,
    }, 500);
  }
});

const getEventStatsRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}/stats',
  tags: ['Admin - Events'],
  summary: 'Get event statistics',
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
      description: 'Event statistics retrieved successfully',
    },
  },
});

app.openapi(getEventStatsRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');
    const authUser = c.get('user');
    
    // Check if admin has access to this event
    if (authUser.adminData?.role !== 'SUPER') {
      const hasAccess = await AdminService.hasEventAccess(authUser.id, eventId);
      if (!hasAccess) {
        return c.json({
          success: false,
          error: 'Access denied to this event',
        }, 403);
      }
    }
    
    const { prisma } = await import('../config/database.js');
    
    const [
      totalUsers,
      assignedUsers,
      unassignedUsers,
      registeredUsers,
      totalGroups,
      totalActivities
    ] = await prisma.$transaction([
      prisma.user.count({ where: { eventId, active: true } }),
      prisma.user.count({ where: { eventId, active: true, assigned: true } }),
      prisma.user.count({ where: { eventId, active: true, assigned: false } }),
      prisma.user.count({ where: { eventId, active: true } }),
      prisma.group.count({ where: { eventId, deleted: false } }),
      prisma.activity.count({ where: { eventId, deleted: false } }),
    ]);

    // Handle non-Prisma values separately
    const waitlistCount = 0; // TODO: implement if needed
    const activeAdmins = 0; // TODO: implement if needed  
    const totalMessages = 0; // TODO: implement when messaging exists

    const stats = {
      totalUsers,
      assignedUsers,
      unassignedUsers,
      registeredUsers,
      totalGroups,
      totalActivities,
      registrationPercentage: totalUsers > 0 ? Math.round((registeredUsers / totalUsers) * 100) : 0,
      waitlistCount,
      activeAdmins,
      totalMessages
    };
    
    return c.json({
      success: true,
      data: {
        stats: stats
      },
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve event statistics',
      details: error.message,
    }, 500);
  }
});

const getAdministratorsRoute = createRoute({
  method: 'get',
  path: '/administrators',
  tags: ['Admin - Administrators'],
  summary: 'Get all administrators',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Administrators retrieved successfully',
    },
  },
});

app.openapi(getAdministratorsRoute, async (c) => {
  try {
    const authUser = c.get('user');
    const admins = await AdminService.findAll({ page: 1, limit: 100 });
    
    return c.json({
      success: true,
      data: admins,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve administrators',
      details: error.message,
    }, 500);
  }
});

// =============================================================================
// 5. ACTIVITY MANAGEMENT
// =============================================================================

const exportActivitiesRoute = createRoute({
  method: 'get',
  path: '/activities/export',
  tags: ['Admin - Data Export'],
  summary: 'Export activities data',
  request: {
    query: z.object({
      eventId: z.string().min(1),
      format: z.enum(['csv', 'json']).default('csv'),
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
      description: 'Export completed successfully',
    },
  },
});

app.openapi(exportActivitiesRoute, async (c) => {
  try {
    const { eventId, format } = c.req.valid('query');
    
    const activities = await ActivityService.findByEventId(eventId, { page: 1, limit: 10000 }, {});
    
    if (format === 'csv') {
      // CSV headers matching import template exactly
      const headers = [
        'title', 'group', 'startDateTime', 'endDateTime', 'location', 'address',
        'category', 'description', 'thumbnail', 'mapLink'
      ];
      
      // Get groups for lookup
      const groups = await GroupService.findByEventId(eventId, { page: 1, limit: 1000 });
      const groupLookup = new Map(groups.items.map(g => [g.id, g.name]));
      
      const rows = activities.items.map(activity => {
        const location = (activity.location as any) || {};
        const content = (activity.content as any) || {};
        
        return [
          activity.title,
          groupLookup.get(activity.groupId) || activity.groupId,
          activity.startDateTime.toISOString().slice(0, 16).replace('T', ' '),
          activity.endDateTime.toISOString().slice(0, 16).replace('T', ' '),
          location.name || '',
          location.address || '',
          activity.category,
          content.html || '',
          activity.thumbnail || '',
          location.mapLink || ''
        ];
      });
      
      const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
        
      c.header('Content-Type', 'text/csv');
      c.header('Content-Disposition', `attachment; filename="activities-${eventId}-${new Date().toISOString().split('T')[0]}.csv"`);
      return c.text(csvContent);
    } else {
      return c.json({
        success: true,
        data: activities,
      });
    }
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Export failed',
      details: error.message,
    }, 500);
  }
});

const getActivitiesRoute = createRoute({
  method: 'get',
  path: '/activities',
  tags: ['Admin - Activities'],
  summary: 'Get activities with filters',
  request: {
    query: PaginationSchema.extend({
      eventId: z.string().optional(),
      groupId: z.string().optional(),
      status: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Activities retrieved successfully',
    },
  },
});

app.openapi(getActivitiesRoute, async (c) => {
  try {
    const { page, limit, eventId, groupId, status } = c.req.valid('query');
    
    let result;
    if (eventId) {
      result = await ActivityService.findByEventId(eventId, { page: page || 1, limit: limit || 20 });
    } else if (groupId) {
      result = await ActivityService.findByGroupId(groupId, { page: page || 1, limit: limit || 20 });
    } else {
      result = { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    }
    
    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve activities',
      details: error.message,
    }, 500);
  }
});

const getActivityByIdRoute = createRoute({
  method: 'get',
  path: '/activities/{activityId}',
  tags: ['Admin - Activities'],
  summary: 'Get activity by ID',
  request: {
    params: z.object({
      activityId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Activity retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Activity not found',
    },
  },
});

app.openapi(getActivityByIdRoute, async (c) => {
  try {
    const { activityId } = c.req.valid('param');
    const activity = await ActivityService.findById(activityId);
    
    if (!activity) {
      return c.json({
        success: false,
        error: 'Activity not found',
      }, 404);
    }
    
    return c.json({
      success: true,
      data: activity,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve activity',
      details: error.message,
    }, 500);
  }
});

const deleteActivityRoute = createRoute({
  method: 'delete',
  path: '/activities/{activityId}',
  tags: ['Admin - Activities'],
  summary: 'Delete activity',
  request: {
    params: z.object({
      activityId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Activity deleted successfully',
    },
  },
});

app.openapi(deleteActivityRoute, async (c) => {
  try {
    const { activityId } = c.req.valid('param');
    const authUser = c.get('user');
    const activity = await ActivityService.softDelete(activityId, authUser.id);
    
    return c.json({
      success: true,
      data: activity,
      message: 'Activity deleted successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to delete activity',
      details: error.message,
    }, 400);
  }
});

const createActivityRoute = createRoute({
  method: 'post',
  path: '/activities',
  tags: ['Admin - Activities'],
  summary: 'Create activity',
  description: 'Create a new activity with rich content for a specific group',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateActivitySchema,
          example: {
            eventId: '60f7b3b3b3b3b3b3b3b3b3b3',
            groupId: '60f7b3b3b3b3b3b3b3b3b3b4',
            title: 'Welcome Gala Dinner',
            startDateTime: '2025-09-05T19:00:00Z',
            endDateTime: '2025-09-05T22:00:00Z',
            category: 'HOSPITALITY',
            thumbnail: 'https://example.com/gala-dinner.jpg',
            location: {
              name: 'Grand Ballroom',
              address: '123 Hotel Drive, Monza, Italy',
              mapLink: 'https://maps.google.com/place/grand-ballroom'
            },
            content: {
              html: '<h1>Welcome to F1 Italian Grand Prix</h1><p>Join us for an elegant gala dinner featuring <strong>local Italian cuisine</strong> and networking opportunities.</p><ul><li>Cocktail reception: 7:00 PM</li><li>Dinner service: 8:00 PM</li><li>Networking: 9:30 PM</li></ul>'
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
        },
      },
      description: 'Activity created successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Failed to create activity',
    },
  },
});

app.openapi(createActivityRoute, async (c) => {
  try {
    const data = c.req.valid('json');
    const authUser = c.get('user');
    
    // Add createdBy from authenticated user
    const activityData = {
      ...data,
      createdBy: authUser.id
    };
    
    const activity = await ActivityService.create(activityData);
    
    return c.json({
      success: true,
      data: activity,
      message: 'Activity created successfully',
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to create activity',
      details: error.message,
    }, 400);
  }
});

const updateActivityRoute = createRoute({
  method: 'patch',
  path: '/activities/{activityId}',
  tags: ['Admin - Activities'],
  summary: 'Update activity',
  request: {
    params: z.object({
      activityId: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateActivitySchema,
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
      description: 'Activity updated successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Failed to update activity',
    },
  },
});

app.openapi(updateActivityRoute, async (c) => {
  try {
    const { activityId } = c.req.valid('param');
    const data = c.req.valid('json');
    const authUser = c.get('user');
    
    // Add lastModifiedBy from authenticated user
    const activityData = {
      ...data,
      lastModifiedBy: authUser.id
    };
    
    const activity = await ActivityService.update(activityId, activityData);
    
    return c.json({
      success: true,
      data: activity,
      message: 'Activity updated successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to update activity',
      details: error.message,
    }, 400);
  }
});

// =============================================================================
// 6. FILE UPLOAD MANAGEMENT
// =============================================================================

const generateUploadUrlRoute = createRoute({
  method: 'post',
  path: '/upload/presigned-url',
  tags: ['Admin - File Upload'],
  summary: 'Generate presigned URL for file upload',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            fileName: z.string().min(1),
            contentType: z.string().min(1),
            eventId: z.string().min(1),
            activityId: z.string().optional(),
            folder: z.enum(['activities', 'events', 'assets']).default('activities'),
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
      description: 'Presigned URL generated successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Invalid file type or size',
    },
  },
});

app.openapi(generateUploadUrlRoute, async (c) => {
  try {
    const { fileName, contentType, eventId, activityId, folder } = c.req.valid('json');
    
    // Validate file type for images
    if (!S3Service.isValidImageType(contentType)) {
      return c.json({
        success: false,
        error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.',
      }, 400);
    }
    
    // Generate the appropriate folder path
    let folderPath: string;
    switch (folder) {
      case 'activities':
        folderPath = `events/${eventId}/activities${activityId ? `/${activityId}` : ''}`;
        break;
      case 'events':
        folderPath = `events/${eventId}/assets`;
        break;
      case 'assets':
        folderPath = `events/${eventId}/assets`;
        break;
      default:
        folderPath = `events/${eventId}/activities`;
    }
    
    const result = await S3Service.generatePresignedUploadUrl(
      fileName,
      contentType,
      folderPath,
      3600 // 1 hour expiry
    );
    
    if (!result.success) {
      return c.json({
        success: false,
        error: result.error || 'Failed to generate upload URL',
      }, 500);
    }
    
    return c.json({
      success: true,
      data: {
        uploadUrl: result.uploadUrl,
        fileUrl: result.fileUrl,
        key: result.key,
      },
      message: 'Presigned URL generated successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to generate upload URL',
      details: error.message,
    }, 500);
  }
});

// =============================================================================
// 7. DATA IMPORT/EXPORT MANAGEMENT
// =============================================================================

const importUsersRoute = createRoute({
  method: 'post',
  path: '/users/import',
  tags: ['Admin - Data Import'],
  summary: 'Import users from CSV file',
  request: {
    query: z.object({
      eventId: z.string().min(1),
    }),
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.any(),
            entity: z.string().optional(),
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
      description: 'Import completed successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Import failed',
    },
  },
});

app.openapi(importUsersRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('query');
    const body = await c.req.parseBody();
    const file = body.file as File;
    
    if (!file) {
      return c.json({
        success: false,
        error: 'No file provided',
      }, 400);
    }

    const csvText = await file.text();
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    const headers = lines[0]?.split(',').map(h => h.replace(/"/g, '').trim()) || [];
    const dataRows = lines.slice(1).map(line => 
      line.split(',').map(cell => cell.replace(/"/g, '').trim())
    );

    let imported = 0;
    const errors: string[] = [];

    // Process each row
    for (let i = 0; i < dataRows.length; i++) {
      try {
        const rowData = dataRows[i];
        const userData: any = {
          profile: {},
          communication: { emailOptIn: true, whatsappOptIn: false },
          flight: {},
          accommodation: {},
          requirements: {},
          merchandiseSize: {},
          emergencyContact: {}
        };

        // Map CSV data to user object structure
        headers.forEach((header, index) => {
          const value = rowData[index]?.trim();
          if (!value) return;

          switch (header) {
            case 'firstName':
              userData.profile.firstName = value;
              break;
            case 'lastName':
              userData.profile.lastName = value;
              break;
            case 'email':
              userData.profile.email = value;
              break;
            case 'phone':
              userData.profile.phone = value;
              break;
            case 'dietaryRequirements':
              userData.requirements.dietary = value;
              break;
            case 'medicalRequirements':
              userData.requirements.medical = value;
              break;
            case 'accessibilityRequirements':
              userData.requirements.accessibility = value;
              break;
            case 'accommodationRequired':
              userData.accommodation.required = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
              break;
            case 'hotel':
              userData.accommodation.hotel = value;
              break;
            case 'checkInDate':
              userData.accommodation.checkIn = new Date(value);
              break;
            case 'checkOutDate':
              userData.accommodation.checkOut = new Date(value);
              break;
            case 'flightArrival':
              userData.flight.arrival = new Date(value);
              break;
            case 'flightDeparture':
              userData.flight.departure = new Date(value);
              break;
            case 'arrivalAirport':
              userData.flight.arrivalAirport = value;
              break;
            case 'departureAirport':
              userData.flight.departureAirport = value;
              break;
            case 'airline':
              userData.flight.airline = value;
              break;
            case 'flightNumber':
              userData.flight.number = value;
              break;
            case 'emergencyContactName':
              userData.emergencyContact.name = value;
              break;
            case 'emergencyContactPhone':
              userData.emergencyContact.phone = value;
              break;
            case 'emergencyContactEmail':
              userData.emergencyContact.email = value;
              break;
            case 'emergencyContactRelationship':
              userData.emergencyContact.relationship = value;
              break;
            case 'transferRequirements':
              userData.transferRequirements = value;
              break;
            case 'specialRequests':
              userData.accommodation.specialRequests = value;
              break;
            case 'shirtSize':
              userData.merchandiseSize.shirt = value;
              break;
            case 'jacketSize':
              userData.merchandiseSize.jacket = value;
              break;
            case 'hatSize':
              userData.merchandiseSize.hat = value;
              break;
            case 'emailOptIn':
              userData.communication.emailOptIn = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
              break;
            case 'whatsappOptIn':
              userData.communication.whatsappOptIn = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
              break;
          }
        });

        // Validate required fields
        if (!userData.profile.email || !userData.profile.firstName || !userData.profile.lastName) {
          errors.push(`Row ${i + 2}: Missing required fields (firstName, lastName, email)`);
          continue;
        }

        // Create user
        const createUserData = {
          eventId,
          profile: userData.profile,
          communication: userData.communication,
          flight: Object.keys(userData.flight).length > 0 ? userData.flight : undefined,
          accommodation: Object.keys(userData.accommodation).length > 0 ? userData.accommodation : undefined,
          transferRequirements: userData.transferRequirements,
          requirements: Object.keys(userData.requirements).length > 0 ? userData.requirements : undefined,
          merchandiseSize: Object.keys(userData.merchandiseSize).length > 0 ? userData.merchandiseSize : undefined,
          emergencyContact: Object.keys(userData.emergencyContact).length > 0 ? userData.emergencyContact : undefined,
        };

        await UserService.create(createUserData);
        imported++;
      } catch (error: any) {
        errors.push(`Row ${i + 2}: ${error.message}`);
      }
    }

    return c.json({
      success: true,
      data: {
        imported,
        total: dataRows.length,
        errors: errors.slice(0, 10), // Limit to first 10 errors
      },
      message: `Import completed. ${imported}/${dataRows.length} users imported successfully.`,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Import failed',
      details: error.message,
    }, 500);
  }
});

const importGroupsRoute = createRoute({
  method: 'post',
  path: '/groups/import',
  tags: ['Admin - Data Import'],
  summary: 'Import groups from CSV file',
  request: {
    query: z.object({
      eventId: z.string().min(1),
    }),
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.any(),
            entity: z.string().optional(),
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
      description: 'Import completed successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Import failed',
    },
  },
});

app.openapi(importGroupsRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('query');
    const body = await c.req.parseBody();
    const file = body.file as File;
    
    if (!file) {
      return c.json({
        success: false,
        error: 'No file provided',
      }, 400);
    }

    const csvText = await file.text();
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    const headers = lines[0]?.split(',').map(h => h.replace(/"/g, '').trim()) || [];
    const dataRows = lines.slice(1).map(line => 
      line.split(',').map(cell => cell.replace(/"/g, '').trim())
    );

    let imported = 0;
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      try {
        const rowData = dataRows[i];
        const groupData: any = {};

        headers.forEach((header, index) => {
          const value = rowData[index]?.trim();
          if (!value) return;

          switch (header) {
            case 'name':
              groupData.name = value;
              break;
            case 'description':
              groupData.description = value;
              break;
            case 'capacity':
              groupData.capacity = parseInt(value) || 0;
              break;
            case 'category':
              groupData.category = value;
              break;
            case 'assignedMembers':
              groupData.assignedMembers = value.split(',').map(email => email.trim());
              break;
          }
        });

        if (!groupData.name) {
          errors.push(`Row ${i + 2}: Missing required field (name)`);
          continue;
        }

        const createGroupData = {
          eventId,
          name: groupData.name,
          description: groupData.description || '',
        };

        await GroupService.create(createGroupData);
        imported++;
      } catch (error: any) {
        errors.push(`Row ${i + 2}: ${error.message}`);
      }
    }

    return c.json({
      success: true,
      data: {
        imported,
        total: dataRows.length,
        errors: errors.slice(0, 10),
      },
      message: `Import completed. ${imported}/${dataRows.length} groups imported successfully.`,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Import failed',
      details: error.message,
    }, 500);
  }
});

const importActivitiesRoute = createRoute({
  method: 'post',
  path: '/activities/import',
  tags: ['Admin - Data Import'],
  summary: 'Import activities from CSV file',
  request: {
    query: z.object({
      eventId: z.string().min(1),
    }),
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.any(),
            entity: z.string().optional(),
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
      description: 'Import completed successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Import failed',
    },
  },
});

app.openapi(importActivitiesRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('query');
    const body = await c.req.parseBody();
    const file = body.file as File;
    const authUser = c.get('user');
    
    if (!file) {
      return c.json({
        success: false,
        error: 'No file provided',
      }, 400);
    }

    const csvText = await file.text();
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    const headers = lines[0]?.split(',').map(h => h.replace(/"/g, '').trim()) || [];
    const dataRows = lines.slice(1).map(line => 
      line.split(',').map(cell => cell.replace(/"/g, '').trim())
    );

    // Get existing groups for lookup
    const groups = await GroupService.findByEventId(eventId, { page: 1, limit: 1000 });
    const groupLookup = new Map(groups.items.map(g => [g.name.toLowerCase(), g.id]));

    let imported = 0;
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      try {
        const rowData = dataRows[i];
        const activityData: any = {
          location: {}
        };

        headers.forEach((header, index) => {
          const value = rowData[index]?.trim();
          if (!value) return;

          switch (header) {
            case 'title':
              activityData.title = value;
              break;
            case 'group':
              const groupId = groupLookup.get(value.toLowerCase());
              if (groupId) {
                activityData.groupId = groupId;
              } else {
                errors.push(`Row ${i + 2}: Group "${value}" not found`);
                return;
              }
              break;
            case 'startDateTime':
              activityData.startDateTime = new Date(value);
              break;
            case 'endDateTime':
              activityData.endDateTime = new Date(value);
              break;
            case 'location':
              activityData.location.name = value;
              break;
            case 'address':
              activityData.location.address = value;
              break;
            case 'category':
              activityData.category = value.toUpperCase();
              break;
            case 'description':
              activityData.content = { html: value };
              break;
            case 'thumbnail':
              activityData.thumbnail = value;
              break;
            case 'mapLink':
              activityData.location.mapLink = value;
              break;
          }
        });

        if (!activityData.title || !activityData.groupId || !activityData.startDateTime || !activityData.endDateTime) {
          errors.push(`Row ${i + 2}: Missing required fields (title, group, startDateTime, endDateTime)`);
          continue;
        }

        const createActivityData = {
          eventId,
          groupId: activityData.groupId,
          title: activityData.title,
          startDateTime: activityData.startDateTime,
          endDateTime: activityData.endDateTime,
          thumbnail: activityData.thumbnail,
          category: activityData.category || 'OTHER',
          location: Object.keys(activityData.location).length > 0 ? activityData.location : undefined,
          content: activityData.content || { html: '' },
          createdBy: authUser.id,
        };

        await ActivityService.create(createActivityData);
        imported++;
      } catch (error: any) {
        errors.push(`Row ${i + 2}: ${error.message}`);
      }
    }

    return c.json({
      success: true,
      data: {
        imported,
        total: dataRows.length,
        errors: errors.slice(0, 10),
      },
      message: `Import completed. ${imported}/${dataRows.length} activities imported successfully.`,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Import failed',
      details: error.message,
    }, 500);
  }
});

// =============================================================================
// 8. COMMUNICATION LOGS MANAGEMENT
// =============================================================================

const getCommunicationLogsRoute = createRoute({
  method: 'get',
  path: '/users/{userId}/communication-logs',
  tags: ['Admin - Communication Logs'],
  summary: 'Get user communication logs',
  request: {
    params: z.object({
      userId: z.string().min(1),
    }),
    query: PaginationSchema.extend({
      type: z.enum(['email', 'whatsapp']).optional(),
      purpose: z.enum(['group_assignment', 'event_reminder', 'custom', 'announcement']).optional(),
      status: z.enum(['sent', 'delivered', 'failed', 'pending']).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Communication logs retrieved successfully',
    },
  },
});

app.openapi(getCommunicationLogsRoute, async (c) => {
  try {
    const { userId } = c.req.valid('param');
    const { page, limit, type, purpose, status } = c.req.valid('query');
    
    const result = await CommunicationLogService.findByUserId(
      userId,
      { page: page || 1, limit: limit || 20 },
      { type, purpose, status }
    );
    
    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve communication logs',
      details: error.message,
    }, 500);
  }
});

const getGroupNotificationStatsRoute = createRoute({
  method: 'get',
  path: '/groups/{groupId}/notification-stats',
  tags: ['Admin - Groups'],
  summary: 'Get group notification statistics',
  request: {
    params: z.object({
      groupId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Group notification stats retrieved successfully',
    },
  },
});

app.openapi(getGroupNotificationStatsRoute, async (c) => {
  try {
    const { groupId } = c.req.valid('param');
    const stats = await CommunicationLogService.getGroupNotificationStats(groupId);
    
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve notification stats',
      details: error.message,
    }, 500);
  }
});

const sendGroupNotificationsRoute = createRoute({
  method: 'post',
  path: '/groups/{groupId}/send-notifications',
  tags: ['Admin - Groups'],
  summary: 'Send group assignment notifications to selected users',
  request: {
    params: z.object({
      groupId: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            userIds: z.array(z.string()),
            channel: z.enum(['email', 'whatsapp']).default('email'),
            customMessage: z.string().optional(),
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
      description: 'Notifications sent successfully',
    },
  },
});

app.openapi(sendGroupNotificationsRoute, async (c) => {
  try {
    const { groupId } = c.req.valid('param');
    const { userIds, channel, customMessage } = c.req.valid('json');
    const authUser = c.get('user');
    
    // Get group info for the message
    const group = await GroupService.findById(groupId);
    if (!group) {
      return c.json({
        success: false,
        error: 'Group not found',
      }, 404);
    }
    
    const event = await EventService.findById(group.eventId);
    if (!event) {
      return c.json({
        success: false,
        error: 'Event not found',
      }, 404);
    }

    // Create message content
    const content = {
      html: customMessage || `<p>You have been assigned to the group: <strong>${group.name}</strong></p><p>Event: ${event.name}</p>`,
      text: customMessage || `You have been assigned to the group: ${group.name}. Event: ${event.name}`,
    };
    
    // Log the communications and mark users as notified
    const logs = await CommunicationLogService.logGroupAssignmentNotification(
      userIds,
      groupId,
      group.eventId,
      authUser.id,
      channel,
      content
    );
    
    return c.json({
      success: true,
      data: {
        sent: logs.length,
        logs: logs.map(log => ({ id: log.id, userId: log.userId, status: log.status })),
      },
      message: `Notifications sent to ${logs.length} users`,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to send notifications',
      details: error.message,
    }, 500);
  }
});

const getGroupMembersWithNotificationStatusRoute = createRoute({
  method: 'get',
  path: '/groups/{groupId}/members-with-status',
  tags: ['Admin - Groups'],
  summary: 'Get group members with notification status',
  request: {
    params: z.object({
      groupId: z.string().min(1),
    }),
    query: PaginationSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Group members with notification status retrieved successfully',
    },
  },
});

app.openapi(getGroupMembersWithNotificationStatusRoute, async (c) => {
  try {
    const { groupId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');
    
    const result = await UserService.getUsersWithNotificationStatus(
      groupId,
      { page: page || 1, limit: limit || 20 }
    );
    
    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve group members with status',
      details: error.message,
    }, 500);
  }
});

// =============================================================================
// 9. COMMUNICATIONS MANAGEMENT
// =============================================================================

const sendCommunicationRoute = createRoute({
  method: 'post',
  path: '/communications/send',
  tags: ['Admin - Communications'],
  summary: 'Send communication to users via email',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            eventId: z.string().min(1),
            recipientType: z.enum(['individual', 'group', 'all']),
            recipientIds: z.array(z.string()).optional(),
            subject: z.string().min(1),
            content: z.string().min(1),
            templateType: z.enum(['welcome', 'assignment', 'activity_update', 'announcement', 'custom']).optional(),
            variables: z.record(z.any()).optional(),
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
      description: 'Communication sent successfully',
    },
  },
});

app.openapi(sendCommunicationRoute, async (c) => {
  try {
    const body = c.req.valid('json');
    const authUser = c.get('user');
    
    const request = {
      ...body,
      adminId: authUser.id,
      channel: 'email' as const,
    };
    
    const result = await CommunicationsService.sendCommunication(request);
    
    return c.json({
      success: true,
      data: result,
      message: `Communication sent successfully. ${result.sentCount} sent, ${result.skippedCount} skipped, ${result.failedCount} failed.`,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to send communication',
      details: error.message,
    }, 500);
  }
});

const getCommunicationStatsRoute = createRoute({
  method: 'get',
  path: '/communications/{eventId}/stats',
  tags: ['Admin - Communications'],
  summary: 'Get communication statistics for event',
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
      description: 'Communication stats retrieved successfully',
    },
  },
});

app.openapi(getCommunicationStatsRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');
    const authUser = c.get('user');
    
    // Check if admin has access to this event
    if (authUser.adminData?.role !== 'SUPER') {
      const hasAccess = await AdminService.hasEventAccess(authUser.id, eventId);
      if (!hasAccess) {
        return c.json({
          success: false,
          error: 'Access denied to this event',
        }, 403);
      }
    }
    
    const stats = await CommunicationsService.getCommunicationStats(eventId);
    
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve communication stats',
      details: error.message,
    }, 500);
  }
});

const getEmailTemplatesRoute = createRoute({
  method: 'get',
  path: '/communications/templates',
  tags: ['Admin - Communications'],
  summary: 'Get available email templates',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Email templates retrieved successfully',
    },
  },
});

app.openapi(getEmailTemplatesRoute, async (c) => {
  try {
    const templates = CommunicationsService.getEmailTemplates();
    
    return c.json({
      success: true,
      data: { templates },
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve email templates',
      details: error.message,
    }, 500);
  }
});

const getCommunicationHistoryRoute = createRoute({
  method: 'get',
  path: '/communications/{eventId}/history',
  tags: ['Admin - Communications'],
  summary: 'Get communication history for event',
  request: {
    params: z.object({
      eventId: z.string().min(1),
    }),
    query: PaginationSchema.extend({
      type: z.enum(['email', 'whatsapp']).optional(),
      status: z.enum(['sent', 'delivered', 'failed', 'pending']).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Communication history retrieved successfully',
    },
  },
});

app.openapi(getCommunicationHistoryRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');
    const { page, limit, type, status } = c.req.valid('query');
    const authUser = c.get('user');
    
    // Check if admin has access to this event
    if (authUser.adminData?.role !== 'SUPER') {
      const hasAccess = await AdminService.hasEventAccess(authUser.id, eventId);
      if (!hasAccess) {
        return c.json({
          success: false,
          error: 'Access denied to this event',
        }, 403);
      }
    }
    
    const result = await CommunicationLogService.findByEventId(
      eventId,
      { page: page || 1, limit: limit || 20 },
      { type, status }
    );
    
    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve communication history',
      details: error.message,
    }, 500);
  }
});

export default app;