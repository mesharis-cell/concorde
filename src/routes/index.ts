import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';

// Import controllers
import publicUsersController from '../controllers/public/users.js';
import adminController from '../controllers/admin.js';
import adminsController from '../controllers/admins.js';
import trackingController from '../controllers/tracking.js';
import unsubscribeController from '../controllers/unsubscribe.js';
import authController from '../controllers/auth.js';

// Import middleware
import { authenticateAdmin, authenticateUser } from '../middleware/auth.js';
import type { AuthContext } from '../middleware/auth.js';

const app = new OpenAPIHono<{ Variables: AuthContext }>();

// Health check
app.get('/health', (c) => {
  return c.json({
    success: true,
    message: 'Savvio Concorde API is running',
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// PUBLIC API ROUTES (No Authentication Required)
// =============================================================================

// Public user operations (registration)
app.route('/v1/public', publicUsersController);

// Public OTP authentication (no auth required)
app.route('/v1/auth', authController);

// Public tracking endpoints (email opens)
app.route('/', trackingController);

// Public unsubscribe endpoint (no auth required)
app.route('/', unsubscribeController);

// =============================================================================
// ADMIN API ROUTES (Admin JWT Authentication Required)
// =============================================================================

app.use('/v1/admin/*', async (c, next) => {
  // Skip auth for login endpoint
  if (c.req.path === '/v1/admin/login') {
    return next();
  }
  const auth = await authenticateAdmin(false);
  return auth(c, next);
});

// All admin endpoints in one consolidated controller
app.route('/v1/admin', adminController);

// Admin management endpoints (requires admin authentication)
const adminAuth = await authenticateAdmin(true);
app.use('/v1/admins*', adminAuth);
app.route('/v1', adminsController);

// User-facing routes (user authentication required)
const userRoutes = new OpenAPIHono<{ Variables: AuthContext }>();
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

  if (!user.userData?.groupIds || user.userData.groupIds.length === 0) {
    return c.json(
      {
        success: false,
        error: 'Not assigned to any groups yet',
      },
      404
    );
  }

  // Get activities from all assigned groups
  const { ActivityService } = await import('../services/activities.js');
  const timeline = await ActivityService.getUserMultiGroupTimeline(user.userData.id);

  // Get group information
  const { prisma } = await import('../config/database.js');
  const groups = await prisma.group.findMany({
    where: { 
      id: { in: user.userData.groupIds },
      active: true,
      deleted: false,
    },
    select: { id: true, name: true, description: true },
  });

  return c.json({
    success: true,
    data: {
      groups, // Array of groups user belongs to
      timeline, // Merged activities from all groups
      conflictInfo: await import('../services/conflict-detection.js').then(module => 
        module.ConflictDetectionService.analyzeUserTimingConflicts(user.userData.id)
      ),
    },
  });
});

// Get user profile
userRoutes.get('/profile', async (c) => {
  const user = c.get('user');
  return c.json({
    success: true,
    data: user.userData,
  });
});

// [V1] Wallet pass endpoint (Task 2.6.2)
userRoutes.get('/wallet-pass', async (c) => {
  try {
    const user = c.get('user');
    const { WalletService } = await import('../services/wallet.js');

    const passPayload = await WalletService.getOrCreateWalletPass({
      userId: user.userData.id,
      eventId: user.userData.eventId,
      email: user.userData.email,
      formResponses: user.userData.formResponses,
    });

    return c.json({
      success: true,
      data: passPayload,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Failed to generate wallet pass',
        details: error.message,
      },
      500
    );
  }
});

// [V1] Signed attendee-specific check-in QR endpoint (Task 2.6.3)
userRoutes.get('/check-in-qr', async (c) => {
  try {
    const user = c.get('user');
    const { WalletService } = await import('../services/wallet.js');
    const qrPayload = await WalletService.generateCheckInQr({
      userId: user.userData.id,
      eventId: user.userData.eventId,
    });

    return c.json({
      success: true,
      data: qrPayload,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Failed to generate check-in QR payload',
        details: error.message,
      },
      500
    );
  }
});

// Update user preferences
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
    return c.json(
      {
        success: false,
        error: 'Failed to update preferences',
        details: error.message,
      },
      400
    );
  }
});

app.route('/v1/user', userRoutes);

// User activity routes
const activityRoutes = new OpenAPIHono<{ Variables: AuthContext }>();
activityRoutes.use(authenticateUser);

activityRoutes.get('/{activityId}', async (c) => {
  try {
    const activityId = c.req.param('activityId');
    const user = c.get('user');

    const { ActivityService } = await import('../services/activities.js');
    const activity = await ActivityService.findById(activityId);

    if (!activity) {
      return c.json(
        {
          success: false,
          error: 'Activity not found',
        },
        404
      );
    }

    // [V1] Multi-group authorization guard (Task 2.5.5).
    const userGroupIds = user.userData?.groupIds || [];
    const activityGroupIds = activity.groupIds || [];
    const hasAccess = activityGroupIds.some((groupId: string) =>
      userGroupIds.includes(groupId)
    );

    if (!hasAccess) {
      return c.json(
        {
          success: false,
          error: 'Access denied - Activity not assigned to your groups',
        },
        403
      );
    }

    return c.json({
      success: true,
      data: activity,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Failed to retrieve activity',
        details: error.message,
      },
      500
    );
  }
});

app.route('/v1/activities', activityRoutes);

// OpenAPI documentation
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Savvio Concorde API',
    version: '1.0.0',
    description:
      'Demo event management platform with personalized itinerary management',
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Development API',
    },
  ],
});

// Swagger UI
app.get(
  '/docs',
  swaggerUI({
    url: '/openapi.json',
  })
);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: 'Endpoint not found',
      message: 'The requested endpoint does not exist',
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);

  return c.json(
    {
      success: false,
      error: 'Internal server error',
      message: 'Something went wrong processing your request',
      ...(process.env.NODE_ENV === 'development' && {
        details: err.message,
        stack: err.stack,
      }),
    },
    500
  );
});

export default app;
