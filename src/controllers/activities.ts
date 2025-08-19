import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ActivityService } from '../services/activities.js';
import { 
  CreateActivitySchema, 
  UpdateActivitySchema, 
  PaginationSchema, 
  ActivityCategory,
  ApiSuccessSchema, 
  ApiErrorSchema 
} from '../types/index.js';

const app = new OpenAPIHono();

// Create Activity
const createActivityRoute = createRoute({
  method: 'post',
  path: '/activities',
  tags: ['Activities'],
  summary: 'Create a new activity',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateActivitySchema,
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
      description: 'Invalid input data',
    },
  },
});

app.openapi(createActivityRoute, async (c) => {
  try {
    const data = c.req.valid('json');
    const activity = await ActivityService.create(data);
    
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

// Get Activities by Group
const getActivitiesByGroupRoute = createRoute({
  method: 'get',
  path: '/groups/{groupId}/activities',
  tags: ['Activities'],
  summary: 'Get paginated list of activities for a group',
  request: {
    params: z.object({
      groupId: z.string().min(1),
    }),
    query: PaginationSchema.extend({
      active: z.coerce.boolean().optional(),
      category: ActivityCategory.optional(),
      dateFrom: z.coerce.date().optional(),
      dateTo: z.coerce.date().optional(),
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
      description: 'Activities retrieved successfully',
    },
  },
});

app.openapi(getActivitiesByGroupRoute, async (c) => {
  try {
    const { groupId } = c.req.valid('param');
    const { page, limit, active, category, dateFrom, dateTo, search } = c.req.valid('query');
    
    const result = await ActivityService.findByGroupId(
      groupId, 
      { page, limit }, 
      { active, category, dateFrom, dateTo, search }
    );
    
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

// Get Activities by Event
const getActivitiesByEventRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}/activities',
  tags: ['Activities'],
  summary: 'Get paginated list of activities for an event',
  request: {
    params: z.object({
      eventId: z.string().min(1),
    }),
    query: PaginationSchema.extend({
      active: z.coerce.boolean().optional(),
      category: ActivityCategory.optional(),
      groupId: z.string().optional(),
      dateFrom: z.coerce.date().optional(),
      dateTo: z.coerce.date().optional(),
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
      description: 'Activities retrieved successfully',
    },
  },
});

app.openapi(getActivitiesByEventRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');
    const { page, limit, active, category, groupId, dateFrom, dateTo, search } = c.req.valid('query');
    
    const result = await ActivityService.findByEventId(
      eventId, 
      { page, limit }, 
      { active, category, groupId, dateFrom, dateTo, search }
    );
    
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

// Get Activity by ID
const getActivityByIdRoute = createRoute({
  method: 'get',
  path: '/activities/{id}',
  tags: ['Activities'],
  summary: 'Get activity by ID',
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
    const { id } = c.req.valid('param');
    const activity = await ActivityService.findById(id);
    
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

// Get Group Timeline
const getGroupTimelineRoute = createRoute({
  method: 'get',
  path: '/groups/{groupId}/timeline',
  tags: ['Activities'],
  summary: 'Get timeline of activities for a group',
  request: {
    params: z.object({
      groupId: z.string().min(1),
    }),
    query: z.object({
      dateFrom: z.coerce.date().optional(),
      dateTo: z.coerce.date().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Timeline retrieved successfully',
    },
  },
});

app.openapi(getGroupTimelineRoute, async (c) => {
  try {
    const { groupId } = c.req.valid('param');
    const { dateFrom, dateTo } = c.req.valid('query');
    
    const timeline = await ActivityService.getTimeline(groupId, { dateFrom, dateTo });
    
    return c.json({
      success: true,
      data: timeline,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve timeline',
      details: error.message,
    }, 500);
  }
});

// Get Upcoming Activities
const getUpcomingActivitiesRoute = createRoute({
  method: 'get',
  path: '/groups/{groupId}/activities/upcoming',
  tags: ['Activities'],
  summary: 'Get upcoming activities for a group',
  request: {
    params: z.object({
      groupId: z.string().min(1),
    }),
    query: z.object({
      limit: z.coerce.number().min(1).max(20).default(5),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Upcoming activities retrieved successfully',
    },
  },
});

app.openapi(getUpcomingActivitiesRoute, async (c) => {
  try {
    const { groupId } = c.req.valid('param');
    const { limit } = c.req.valid('query');
    
    const activities = await ActivityService.getUpcomingActivities(groupId, limit);
    
    return c.json({
      success: true,
      data: activities,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve upcoming activities',
      details: error.message,
    }, 500);
  }
});

// Update Activity
const updateActivityRoute = createRoute({
  method: 'put',
  path: '/activities/{id}',
  tags: ['Activities'],
  summary: 'Update an activity',
  request: {
    params: z.object({
      id: z.string().min(1),
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

app.openapi(updateActivityRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    const activity = await ActivityService.update(id, data);
    
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

// Toggle Activity Status
const toggleActivityRoute = createRoute({
  method: 'patch',
  path: '/activities/{id}/toggle',
  tags: ['Activities'],
  summary: 'Activate or deactivate an activity',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            active: z.boolean(),
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
      description: 'Activity status updated successfully',
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

app.openapi(toggleActivityRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const { active, adminId } = c.req.valid('json');
    
    const activity = active 
      ? await ActivityService.activate(id, adminId) 
      : await ActivityService.deactivate(id, adminId);
    
    return c.json({
      success: true,
      data: activity,
      message: `Activity ${active ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to update activity status',
      details: error.message,
    }, 400);
  }
});

// Duplicate Activity
const duplicateActivityRoute = createRoute({
  method: 'post',
  path: '/activities/{id}/duplicate',
  tags: ['Activities'],
  summary: 'Duplicate an activity',
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            adminId: z.string(),
            newTitle: z.string().optional(),
          }),
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
      description: 'Activity duplicated successfully',
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

app.openapi(duplicateActivityRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const { adminId, newTitle } = c.req.valid('json');
    
    const activity = await ActivityService.duplicate(id, adminId, newTitle);
    
    return c.json({
      success: true,
      data: activity,
      message: 'Activity duplicated successfully',
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to duplicate activity',
      details: error.message,
    }, 400);
  }
});

// Delete Activity
const deleteActivityRoute = createRoute({
  method: 'delete',
  path: '/activities/{id}',
  tags: ['Activities'],
  summary: 'Soft delete an activity',
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
      description: 'Activity deleted successfully',
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

app.openapi(deleteActivityRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const { adminId } = c.req.valid('json');
    
    const activity = await ActivityService.softDelete(id, adminId);
    
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
    }, 404);
  }
});

export default app;