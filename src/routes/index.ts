import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';

// Import controllers
import publicUsersController from '../controllers/public/users.js';
import adminController from '../controllers/admin.js';

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

// =============================================================================
// PUBLIC API ROUTES (No Authentication Required)
// =============================================================================

// Public user operations (registration, magic links)
app.route('/api/v1/public', publicUsersController);

// =============================================================================
// ADMIN API ROUTES (Admin JWT Authentication Required)
// =============================================================================

// Apply admin authentication to all admin routes except login
app.use('/api/v1/admin/*', async (c, next) => {
  // Skip auth for login endpoint
  if (c.req.path === '/api/v1/admin/login') {
    return next();
  }
  return authenticateAdmin(c, next);
});

// All admin endpoints in one consolidated controller
app.route('/api/v1/admin', adminController);

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

// Get user profile (matches /api/user/profile)
userRoutes.get('/profile', async (c) => {
  const user = c.get('user');
  return c.json({
    success: true,
    data: user.userData,
  });
});

// Update user preferences (matches /api/user/preferences)
userRoutes.put('/preferences', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    
    const { UserService } = await import('../services/users.js');
    const updatedUser = await UserService.updateCommunicationPreferences(
      user.userData.id,
      {
        emailOptIn: body.emailOptIn,
        whatsappOptIn: body.whatsappOptIn,
      }
    );
    
    return c.json({
      success: true,
      data: updatedUser,
      message: 'Communication preferences updated successfully',
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'Failed to update preferences',
      details: error.message,
    }, 400);
  }
});

app.route('/api/v1/user', userRoutes);

// Mount user routes directly under /api for microsite compatibility
app.route('/api/user', userRoutes);

// Mount activity routes directly under /api for microsite compatibility  
const activityRoutes = new OpenAPIHono();
activityRoutes.use(authenticateUser);

activityRoutes.get('/{activityId}', async (c) => {
  try {
    const activityId = c.req.param('activityId');
    const user = c.get('user');
    
    const { ActivityService } = await import('../services/activities.js');
    const activity = await ActivityService.findById(activityId);
    
    if (!activity) {
      return c.json({
        success: false,
        error: 'Activity not found',
      }, 404);
    }

    // Ensure user can only see activities from their group
    if (activity.groupId !== user.userData?.groupId) {
      return c.json({
        success: false,
        error: 'Access denied - Activity not in your group',
      }, 403);
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

app.route('/api/activities', activityRoutes);

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