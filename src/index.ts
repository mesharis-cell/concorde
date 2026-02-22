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
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-File-Name',
    'Access-Control-Allow-Origin'
  ],
  credentials: false, // Set to false when using origin: '*'
  maxAge: 86400,
}))

// Mount API routes
app.route('/', apiRoutes);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Savvio Concorde API',
    version: '1.0.0',
    description: 'Demo event management platform with personalized itinerary management',
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

console.log(`🚀 Starting Savvio Concorde API server...`);
console.log(`📊 Environment: ${env.NODE_ENV}`);
console.log(`🔧 Port: ${port}`);


// For Node.js deployment (uncomment if needed)
// serve({
//   fetch: app.fetch,
//   port,
// });

// For Bun deployment
export default {
  port,
  fetch: app.fetch,
};

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

// export default app;
