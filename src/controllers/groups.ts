import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { GroupService } from '../services/groups.js';
import { CreateGroupSchema, UpdateGroupSchema, PaginationSchema, ApiSuccessSchema, ApiErrorSchema } from '../types/index.js';

const app = new OpenAPIHono();

// Create Group
const createGroupRoute = createRoute({
  method: 'post',
  path: '/groups',
  tags: ['Groups'],
  summary: 'Create a new group',
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

// Get Groups by Event
const getGroupsByEventRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}/groups',
  tags: ['Groups'],
  summary: 'Get paginated list of groups for an event',
  request: {
    params: z.object({
      eventId: z.string().min(1),
    }),
    query: PaginationSchema.extend({
      active: z.coerce.boolean().optional(),
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
      description: 'Groups retrieved successfully',
    },
  },
});

app.openapi(getGroupsByEventRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');
    const { page, limit, active, search } = c.req.valid('query');
    const result = await GroupService.findByEventId(eventId, { page, limit }, { active, search });
    
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

// Get Group by ID
const getGroupByIdRoute = createRoute({
  method: 'get',
  path: '/groups/{id}',
  tags: ['Groups'],
  summary: 'Get group by ID',
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
    const { id } = c.req.valid('param');
    const group = await GroupService.findById(id);
    
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

// Get Group with Details
const getGroupDetailsRoute = createRoute({
  method: 'get',
  path: '/groups/{id}/details',
  tags: ['Groups'],
  summary: 'Get group with members and activities',
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
      description: 'Group details retrieved successfully',
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

app.openapi(getGroupDetailsRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const groupDetails = await GroupService.getWithDetails(id);
    
    if (!groupDetails) {
      return c.json({
        success: false,
        error: 'Group not found',
      }, 404);
    }
    
    return c.json({
      success: true,
      data: groupDetails,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve group details',
      details: error.message,
    }, 500);
  }
});

// Get Group Members
const getGroupMembersRoute = createRoute({
  method: 'get',
  path: '/groups/{id}/members',
  tags: ['Groups'],
  summary: 'Get paginated list of group members',
  request: {
    params: z.object({
      id: z.string().min(1),
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
    const { id } = c.req.valid('param');
    const { page, limit, search, hasRequirements } = c.req.valid('query');
    const result = await GroupService.getMembers(id, { page, limit }, { search, hasRequirements });
    
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

// Update Group
const updateGroupRoute = createRoute({
  method: 'put',
  path: '/groups/{id}',
  tags: ['Groups'],
  summary: 'Update a group',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateGroupSchema,
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

app.openapi(updateGroupRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    const group = await GroupService.update(id, data);
    
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

// Toggle Group Status
const toggleGroupRoute = createRoute({
  method: 'patch',
  path: '/groups/{id}/toggle',
  tags: ['Groups'],
  summary: 'Activate or deactivate a group',
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
      description: 'Group status updated successfully',
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

app.openapi(toggleGroupRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const { active } = c.req.valid('json');
    
    const group = active 
      ? await GroupService.activate(id) 
      : await GroupService.deactivate(id);
    
    return c.json({
      success: true,
      data: group,
      message: `Group ${active ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to update group status',
      details: error.message,
    }, 400);
  }
});

// Delete Group
const deleteGroupRoute = createRoute({
  method: 'delete',
  path: '/groups/{id}',
  tags: ['Groups'],
  summary: 'Soft delete a group',
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
      description: 'Group deleted successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Cannot delete group with assigned users',
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

app.openapi(deleteGroupRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const group = await GroupService.softDelete(id);
    
    return c.json({
      success: true,
      data: group,
      message: 'Group deleted successfully',
    });
  } catch (error: any) {
    const statusCode = error.message.includes('assigned users') ? 400 : 404;
    return c.json({
      success: false,
      error: 'Failed to delete group',
      details: error.message,
    }, statusCode);
  }
});

export default app;