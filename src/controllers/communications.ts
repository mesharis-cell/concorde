import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { prisma } from '../config/database.js';
import { ApiSuccessSchema, ApiErrorSchema } from '../types/index.js';
import { CommunicationLogService } from '../services/communication-logs.js';
import type { AuthContext } from '../middleware/auth.js';

const app = new OpenAPIHono<{ Variables: AuthContext }>();

// Get Communication Statistics for Event
const getCommunicationStatsRoute = createRoute({
  method: 'get',
  path: '/communications/stats/{eventId}',
  tags: ['Communications'],
  summary: 'Get communication statistics for an event',
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
      description: 'Communication statistics retrieved successfully',
    },
  },
});

app.openapi(getCommunicationStatsRoute, async (c) => {
  try {
    const { eventId } = c.req.valid('param');

    const [
      totalMessages,
      emailMessages,
      whatsappMessages,
      deliveredMessages
    ] = await prisma.$transaction([
      prisma.message.count({ where: { eventId } }),
      prisma.message.count({ where: { eventId, emailContent: { not: null } } }),
      prisma.message.count({
        where: { eventId, whatsappTemplate: { not: null } },
      }),
      prisma.message.count({ where: { eventId, status: 'sent' } }),
    ]);

    const stats = {
      totalMessages,
      emailMessages,
      whatsappMessages,
      deliveredMessages,
      deliveryRate: totalMessages > 0 ? Math.round((deliveredMessages / totalMessages) * 100) : 0,
    };

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to retrieve communication statistics',
      details: error.message,
    }, 500);
  }
});

// Get Communication Log Detail with All Recipients
const getCommunicationDetailRoute = createRoute({
  method: 'get',
  path: '/communications/log/{logId}',
  tags: ['Communications'],
  summary: 'Get detailed communication log with all recipients and delivery status',
  request: {
    params: z.object({
      logId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ApiSuccessSchema,
        },
      },
      description: 'Communication log details retrieved successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Communication log not found',
    },
  },
});

app.openapi(getCommunicationDetailRoute, async (c) => {
  try {
    const { logId } = c.req.valid('param');

    const communicationDetail = await CommunicationLogService.getCommunicationDetail(logId);

    if (!communicationDetail) {
      return c.json({
        success: false,
        error: 'Communication log not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: communicationDetail,
    });
  } catch (error: any) {
    console.error('Failed to retrieve communication log detail:', error);
    return c.json({
      success: false,
      error: 'Failed to retrieve communication log details',
      details: error.message,
    }, 500);
  }
});

export default app;
