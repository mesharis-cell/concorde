import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { TemplateService } from '../services/templates.js';

const app = new OpenAPIHono();

// Email Open Tracking Endpoint
const trackEmailOpenRoute = createRoute({
  method: 'get',
  path: '/track/open/{messageId}/{userId}/{trackingId}',
  tags: ['Public - Email Tracking'],
  summary: 'Track email opens',
  description: 'Track when users open emails - serves 1x1 transparent GIF',
  request: {
    params: z.object({
      messageId: z.string(),
      userId: z.string(),
      trackingId: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        'image/gif': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      description: '1x1 transparent GIF image',
    },
  },
  hide: true, // Hide from OpenAPI docs since it's a tracking pixel
});

app.openapi(trackEmailOpenRoute, async (c) => {
  try {
    const { messageId, userId, trackingId } = c.req.param();
    const userAgent = c.req.header('User-Agent');
    const ipAddress = c.req.header('x-forwarded-for') || 
                      c.req.header('x-real-ip') || 
                      c.env?.CF_CONNECTING_IP || 
                      'unknown';
    
    // Track the email open
    await TemplateService.trackEmailOpen(trackingId, userAgent, ipAddress as string);
    
    // Return 1x1 transparent GIF
    const transparentGif = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
      0x01, 0x00, 0xF0, 0x00, 0x00, 0xFF, 0xFF, 0xFF,
      0x00, 0x00, 0x00, 0x21, 0xF9, 0x04, 0x01, 0x00,
      0x00, 0x00, 0x00, 0x2C, 0x00, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
      0x01, 0x00, 0x3B
    ]);
    
    c.header('Content-Type', 'image/gif');
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    
    return c.body(transparentGif);
  } catch (error) {
    // Still return GIF even on error to not break email display
    const transparentGif = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
      0x01, 0x00, 0xF0, 0x00, 0x00, 0xFF, 0xFF, 0xFF,
      0x00, 0x00, 0x00, 0x21, 0xF9, 0x04, 0x01, 0x00,
      0x00, 0x00, 0x00, 0x2C, 0x00, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
      0x01, 0x00, 0x3B
    ]);
    
    c.header('Content-Type', 'image/gif');
    return c.body(transparentGif);
  }
});

export default app;