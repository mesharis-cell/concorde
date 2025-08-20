import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { prisma } from '../config/database.js';
import { ApiSuccessSchema, ApiErrorSchema } from '../types/index.js';

const app = new OpenAPIHono();

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
      prisma.message.count({ where: { eventId, whatsappContent: { not: null } } }),
      prisma.message.count({ where: { eventId, deliveredAt: { not: null } } }),
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

export default app;