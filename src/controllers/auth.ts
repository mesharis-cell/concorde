import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { OTPService } from '../services/otp.js';
import { UserService } from '../services/users.js';
import type { AuthContext } from '../middleware/auth.js';
import { RequestOTPSchema, ValidateOTPSchema, ApiSuccessSchema, ApiErrorSchema } from '../types/index.js';

const app = new OpenAPIHono<{ Variables: AuthContext }>();

// =============================================================================
// OTP AUTHENTICATION ROUTES
// =============================================================================

// Request OTP Route
const requestOTPRoute = createRoute({
  method: 'post',
  path: '/request-email-otp',
  tags: ['Authentication - OTP'],
  summary: 'Request OTP for guest login',
  description: 'Send a 4-digit OTP code to user email for authentication. Rate limited to 3 requests per 5 minutes.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: RequestOTPSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              otpId: z.string(),
              message: z.string(),
              retryAfter: z.number().optional(),
            }),
          }),
        },
      },
      description: 'OTP sent successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema.extend({
            retryAfter: z.number().optional(),
          }),
        },
      },
      description: 'Rate limited or validation error',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'User not found',
    },
    500: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Server error',
    },
  },
});

app.openapi(requestOTPRoute, async (c) => {
  try {
    const { email, eventId, channel } = c.req.valid('json');

    // Find user by email and event
    const user = await UserService.findByEmail(email, eventId);
    if (!user) {
      return c.json(
        {
          success: false,
          error: 'User not found',
          details: 'No user found with this email for the specified event',
        },
        404
      );
    }

    // Request OTP
    const result = await OTPService.requestOTP({
      userId: user.id,
      eventId,
      userEmail: email,
      channel: channel || 'email',
    });

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
          ...(result.retryAfter && { retryAfter: result.retryAfter }),
        },
        result.retryAfter ? 429 : 400
      );
    }

    return c.json({
      success: true,
      data: {
        otpId: result.otpId!,
        message: result.message!,
      },
    });

  } catch (error: any) {
    console.error('Request OTP error:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to process OTP request',
        details: error.message,
      },
      500
    );
  }
});

// Validate OTP Route
const validateOTPRoute = createRoute({
  method: 'post',
  path: '/validate-otp',
  tags: ['Authentication - OTP'],
  summary: 'Validate OTP and get JWT token',
  description: 'Validate the 4-digit OTP code and receive a 7-day JWT token for guest access',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ValidateOTPSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              token: z.string(),
              userData: z.any(),
              expiresIn: z.string(),
            }),
            message: z.string(),
          }),
        },
      },
      description: 'OTP validated successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ApiErrorSchema.extend({
            attemptsRemaining: z.number().optional(),
          }),
        },
      },
      description: 'Invalid OTP or validation error',
    },
    404: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'OTP not found',
    },
    500: {
      content: {
        'application/json': {
          schema: ApiErrorSchema,
        },
      },
      description: 'Server error',
    },
  },
});

app.openapi(validateOTPRoute, async (c) => {
  try {
    const { otpId, otpCode } = c.req.valid('json');

    // Validate OTP
    const result = await OTPService.validateOTP({
      otpId,
      otpCode,
    });

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
          ...(result.attemptsRemaining !== undefined && { 
            attemptsRemaining: result.attemptsRemaining 
          }),
        },
        400
      );
    }

    return c.json({
      success: true,
      data: {
        token: result.token!,
        userData: result.userData,
        expiresIn: '7 days',
      },
      message: 'Authentication successful',
    });

  } catch (error: any) {
    console.error('Validate OTP error:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to validate OTP',
        details: error.message,
      },
      500
    );
  }
});

// [V1] Removed public OTP status debug endpoint from active demo path (Task 2.5.3).

export default app;
