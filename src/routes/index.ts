import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';

// Import all controllers
import eventsController from '../controllers/events.js';
import groupsController from '../controllers/groups.js';
import activitiesController from '../controllers/activities.js';
import usersController from '../controllers/users.js';
import adminsController from '../controllers/admins.js';

// Import middleware
import { authenticateAdmin, authenticateUser, requireAdminRole, requireEventAccess } from '../middleware/auth.js';

const app = new OpenAPIHono();

// Health check
app.get('/health', (c) => {
  return c.json({
    success: true,
    message: 'Event Concierge API is running',
    timestamp: new Date().toISOString(),
  });
});

// Public routes (no authentication required)
app.route('/api/v1', usersController); // User registration, magic link requests, auth
app.route('/api/v1', adminsController); // Admin management (includes public login endpoint)

// Admin routes (authentication required) - exclude /admins/login
app.use('/api/v1/admins/*', (c, next) => {
  // Skip authentication for login endpoint
  if (c.req.path === '/api/v1/admins/login') {
    return next();
  }
  return authenticateAdmin(c, next);
});
app.use('/api/v1/events/*', authenticateAdmin);
app.use('/api/v1/groups/*', authenticateAdmin);
app.use('/api/v1/activities/*', authenticateAdmin);

// Event management
app.route('/api/v1', eventsController);

// Group management  
app.route('/api/v1', groupsController);

// Activity management
app.route('/api/v1', activitiesController);

// User management (admin access)
const userAdminRoutes = new OpenAPIHono();
userAdminRoutes.use(authenticateAdmin);
userAdminRoutes.route('/', usersController);
app.route('/api/v1/admin', userAdminRoutes);

// User-facing routes (user authentication required)
const userRoutes = new OpenAPIHono();
userRoutes.use(authenticateUser);

// User can view their own data and itinerary
userRoutes.get('/me', async (c) => {
  const user = c.get('user');
  return c.json({
    success: true,
    data: user.userData,
  });
});

userRoutes.get('/itinerary', async (c) => {
  const user = c.get('user');
  
  if (!user.userData?.groupId) {
    return c.json({
      success: false,
      error: 'Not assigned to any group yet',
    }, 404);
  }

  // Get group activities
  const { ActivityService } = await import('../services/activities.js');
  const activities = await ActivityService.getTimeline(user.userData.groupId);
  
  return c.json({
    success: true,
    data: {
      group: user.userData.group,
      timeline: activities,
    },
  });
});

app.route('/api/v1/user', userRoutes);

// OpenAPI documentation
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Event Concierge API',
    version: '1.0.0',
    description: 'Multi-event management platform with personalized itinerary management',
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'API v1',
    },
  ],
});

// Swagger UI
app.get('/docs', swaggerUI({ 
  url: '/openapi.json',
}));

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Endpoint not found',
    message: 'The requested endpoint does not exist',
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);
  
  return c.json({
    success: false,
    error: 'Internal server error',
    message: 'Something went wrong processing your request',
    ...(process.env.NODE_ENV === 'development' && {
      details: err.message,
      stack: err.stack,
    }),
  }, 500);
});

export default app;