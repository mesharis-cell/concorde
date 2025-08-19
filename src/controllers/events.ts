import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { EventService } from '../services/events.js';
import { CreateEventSchema, PaginationSchema, ApiSuccessSchema, ApiErrorSchema } from '../types/index.js';

const app = new OpenAPIHono();

// Create Event
const createEventRoute = createRoute({
  method: 'post',
  path: '/events',
  tags: ['Events'],
  summary: 'Create a new event',
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

// Get Events List
const getEventsRoute = createRoute({
  method: 'get',
  path: '/events',
  tags: ['Events'],
  summary: 'Get paginated list of events',
  request: {
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
      description: 'Events retrieved successfully',
    },
  },
});

app.openapi(getEventsRoute, async (c) => {
  try {
    const { page, limit, active, search } = c.req.valid('query');
    const result = await EventService.findAll({ page, limit }, { active, search });
    
    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve events',
      details: error.message,
    }, 500);
  }
});

// Get Event by ID
const getEventByIdRoute = createRoute({
  method: 'get',
  path: '/events/{id}',
  tags: ['Events'],
  summary: 'Get event by ID',
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
    const { id } = c.req.valid('param');
    const event = await EventService.findById(id);
    
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

// Get Event with Statistics
const getEventStatsRoute = createRoute({
  method: 'get',
  path: '/events/{id}/stats',
  tags: ['Events'],
  summary: 'Get event with detailed statistics',
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
      description: 'Event statistics retrieved successfully',
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

app.openapi(getEventStatsRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const eventWithStats = await EventService.getWithStats(id);
    
    if (!eventWithStats) {
      return c.json({
        success: false,
        error: 'Event not found',
      }, 404);
    }
    
    return c.json({
      success: true,
      data: eventWithStats,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve event statistics',
      details: error.message,
    }, 500);
  }
});

// Update Event
const updateEventRoute = createRoute({
  method: 'put',
  path: '/events/{id}',
  tags: ['Events'],
  summary: 'Update an event',
  request: {
    params: z.object({
      id: z.string().min(1),
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

app.openapi(updateEventRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    const event = await EventService.update(id, data);
    
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

// Activate/Deactivate Event
const toggleEventRoute = createRoute({
  method: 'patch',
  path: '/events/{id}/toggle',
  tags: ['Events'],
  summary: 'Activate or deactivate an event',
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
      description: 'Event status updated successfully',
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

app.openapi(toggleEventRoute, async (c) => {
  try {
    const { id } = c.req.valid('param');
    const { active } = c.req.valid('json');
    
    const event = active 
      ? await EventService.activate(id) 
      : await EventService.deactivate(id);
    
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

export default app;