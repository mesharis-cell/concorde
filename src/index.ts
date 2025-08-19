import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { timeout } from 'hono/timeout';

// Import configuration
import { env } from './config/env.js';
import { prisma } from './config/database.js';

// Import routes
import apiRoutes from './routes/index.js';

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', requestId());
app.use('*', secureHeaders());
app.use('*', timeout(30000)); // 30 second timeout

// CORS configuration
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Mount API routes
app.route('/', apiRoutes);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Event Concierge API',
    version: '1.0.0',
    description: 'Multi-event management platform with personalized itinerary management',
    documentation: '/docs',
    health: '/health',
    openapi: '/openapi.json',
  });
});

// Database connection test
app.get('/db-health', async (c) => {
  try {
    // For MongoDB, we can't use raw SQL queries, so let's do a simple find operation
    await prisma.event.findFirst();
    return c.json({
      success: true,
      message: 'Database connection healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: 'Database connection failed',
      error: error.message,
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// Start server
const port = parseInt(env.PORT);

console.log(`🚀 Starting Event Concierge API server...`);
console.log(`📊 Environment: ${env.NODE_ENV}`);
console.log(`🔧 Port: ${port}`);


// uncomment the below line to serve on nodeJS, this project uses bun
// serve({
//   fetch: app.fetch,
//   port,
// });

console.log(`✅ Server running on http://localhost:${port}`);
console.log(`📚 API Documentation: http://localhost:${port}/docs`);
console.log(`🔍 Health Check: http://localhost:${port}/health`);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await prisma.$disconnect();
  process.exit(0);
});

export default app;