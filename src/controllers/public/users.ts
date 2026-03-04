import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { UserService } from "../../services/users.js";
import { EventService } from "../../services/events.js";
import { EmailService } from "../../services/email.js";
import { env } from "../../config/env.js";
import {
  CreateUserSchema,
  PublicRegistrationSchema,
  ApiSuccessSchema,
  ApiErrorSchema,
} from "../../types/index.js";
import { authenticateUserByEmail, AuthContext } from "../../middleware/auth.js";

const app = new OpenAPIHono<{ Variables: AuthContext }>();

const getRequestOrigin = (requestUrl: string): string | null => {
  try {
    return new URL(requestUrl).origin;
  } catch {
    return null;
  }
};

const getStringFormResponseValue = (
  formResponses: unknown,
  fieldNames: string[],
): string => {
  if (!Array.isArray(formResponses)) {
    return "";
  }

  const normalized = new Set(
    fieldNames.map((fieldName) => fieldName.toLowerCase()),
  );
  for (const entry of formResponses) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const fieldName = record.fieldName;
    if (
      typeof fieldName !== "string" ||
      !normalized.has(fieldName.toLowerCase())
    ) {
      continue;
    }

    const value = record.value;
    if (typeof value === "string") {
      return value.trim();
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }

  return "";
};

const resolveFrontendBaseUrl = (
  requestOrigin: string | null,
  requestHeaderOrigin: string | undefined,
): string => {
  const candidates = [
    env.FRONTEND_URL?.trim(),
    requestHeaderOrigin?.trim(),
    requestOrigin,
    env.APP_URL?.trim(),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      return new URL(candidate).origin;
    } catch {
      continue;
    }
  }

  return "http://localhost:3000";
};

const resolveApiBaseUrl = (
  requestOrigin: string | null,
  requestHeaderOrigin: string | undefined,
): string => {
  const candidates = [
    requestOrigin,
    env.APP_URL?.trim(),
    requestHeaderOrigin?.trim(),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      return new URL(candidate).origin;
    } catch {
      continue;
    }
  }

  return "http://localhost:3001";
};

// Event Registration (Public)
const eventRegisterRoute = createRoute({
  method: "post",
  path: "/events/{eventId}/register",
  tags: ["Public - Registration"],
  summary: "Register user for specific event",
  description: "Complete multi-step registration form for event attendees",
  request: {
    params: z.object({
      eventId: z.string().describe("Event ID to register for"),
    }),
    body: {
      content: {
        "application/json": {
          schema: PublicRegistrationSchema.omit({ eventId: true }),
          example: {
            email: "john.doe@example.com",
            formResponses: [
              {
                fieldName: "firstName",
                fieldLabel: "First Name",
                fieldType: "text",
                value: "John",
                step: "step1",
                order: 1,
              },
              {
                fieldName: "lastName",
                fieldLabel: "Last Name",
                fieldType: "text",
                value: "Doe",
                step: "step1",
                order: 2,
              },
              {
                fieldName: "phone",
                fieldLabel: "Phone Number",
                fieldType: "tel",
                value: "+971501234567",
                step: "step1",
                order: 3,
              },
              {
                fieldName: "dateOfBirth",
                fieldLabel: "Date of Birth",
                fieldType: "date",
                value: "1990-01-01",
                step: "step1",
                order: 5,
              },
              {
                fieldName: "dietaryRequirements",
                fieldLabel: "Dietary Requirements",
                fieldType: "textarea",
                value: "Vegetarian",
                step: "step2",
                order: 1,
              },
            ],
            communication: {
              emailOptIn: true,
              whatsappOptIn: false,
            },
          },
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: ApiSuccessSchema,
          example: {
            success: true,
            data: {
              id: "60f7b3b3b3b3b3b3b3b3b3b3",
              email: "john.doe@example.com",
              assigned: false,
              eventId: "60f7b3b3b3b3b3b3b3b3b3b3",
              wallet: {
                googleWalletUrl:
                  "https://pay.google.com/gp/v/save/example-wallet-token",
                passReferenceId:
                  "user-60f7b3b3b3b3b3b3b3b3b3b3-event-60f7b3b3b3b3b3b3b3b3b3b3",
                expiresAt: "2026-01-10T15:00:00.000Z",
              },
              checkIn: {
                qrPayloadUrl:
                  "https://demo.savvio.digital/api/v1/public/check-in/consume?token=eyJ...",
                token: "eyJ...",
                expiresAt: "2026-01-10T15:00:00.000Z",
              },
            },
            message: "Registration completed successfully",
          },
        },
      },
      description: "User registered successfully",
    },
    400: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
          examples: {
            "already-registered": {
              value: {
                success: false,
                error: "User already registered",
                message:
                  "A user with this email is already registered for this event",
              },
            },
            "registration-closed": {
              value: {
                success: false,
                error: "Registration is closed for this event",
              },
            },
          },
        },
      },
      description: "Registration failed",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: "Event not found",
          },
        },
      },
      description: "Event not found",
    },
    500: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: "Registration check-in payload failed",
            message:
              "Your registration could not be completed right now. Please try again.",
          },
        },
      },
      description: "Registration payload generation failed",
    },
  },
});

app.openapi(eventRegisterRoute, async (c) => {
  try {
    const { eventId } = c.req.valid("param");
    const data = c.req.valid("json");
    const requestOrigin = getRequestOrigin(c.req.url);
    const requestHeaderOrigin = c.req.header("origin");

    // Check if event exists and registration is open
    const event = await EventService.findById(eventId);
    if (!event) {
      return c.json(
        {
          success: false,
          error: "Event not found",
        },
        404,
      );
    }

    if (!event.active) {
      return c.json(
        {
          success: false,
          error: "Registration is not available for inactive events",
        },
        400,
      );
    }

    const eventConfig = event.config as any;
    if (!eventConfig?.registrationOpen) {
      return c.json(
        {
          success: false,
          error: "Registration is closed for this event",
        },
        400,
      );
    }

    // Check if user already exists
    const existingUser = await UserService.findByEmail(data.email, eventId);
    if (existingUser) {
      return c.json(
        {
          success: false,
          error: "User already registered",
          message:
            "A user with this email is already registered for this event",
        },
        400,
      );
    }

    // Add eventId to registration data
    const registrationData = { ...data, eventId };
    const user = await UserService.create(registrationData);

    // Auto-assign to group if groupId is provided (binding assignment)
    let finalUser = user;
    if (data.groupId) {
      try {
        finalUser = await UserService.assignToGroup(
          user.id,
          data.groupId,
          "system-registration",
        );
      } catch (assignError: any) {
        console.warn(
          "Group assignment during registration failed:",
          assignError.message,
        );
        // Continue with registration even if group assignment fails
      }
    }

    // TODO: Send welcome message via opted-in channels

    const { WalletService } = await import("../../services/wallet.js");
    let walletPayload: Awaited<
      ReturnType<typeof WalletService.getOrCreateWalletPass>
    > | null = null;
    let walletWarningMessage: string | null = null;

    try {
      walletPayload = await WalletService.getOrCreateWalletPass({
        userId: finalUser.id,
        eventId: finalUser.eventId,
        email: finalUser.email,
        formResponses: finalUser.formResponses,
      });
    } catch (walletError: unknown) {
      walletWarningMessage =
        walletError instanceof Error
          ? walletError.message
          : "Unknown wallet generation error";
      console.warn(
        `Wallet pass generation failed for ${finalUser.id}. Continuing with QR-only confirmation.`,
        walletWarningMessage,
      );
    }

    let checkInPayload: Awaited<
      ReturnType<typeof WalletService.generateCheckInQr>
    >;
    try {
      checkInPayload = await WalletService.generateCheckInQr({
        userId: finalUser.id,
        eventId: finalUser.eventId,
        checkInBaseUrl: resolveApiBaseUrl(requestOrigin, requestHeaderOrigin),
      });
    } catch (checkInError: unknown) {
      const checkInErrorMessage =
        checkInError instanceof Error
          ? checkInError.message
          : "Unknown check-in payload generation error";

      try {
        await UserService.deactivate(finalUser.id);
      } catch (deactivateError) {
        console.error(
          "Failed to deactivate user after check-in payload generation failure:",
          deactivateError,
        );
      }

      return c.json(
        {
          success: false,
          error: "Registration check-in payload failed",
          message:
            "Your registration could not be completed right now. Please try again.",
          details: checkInErrorMessage,
        },
        500,
      );
    }

    const firstName = getStringFormResponseValue(finalUser.formResponses, [
      "firstName",
      "firstname",
      "givenName",
    ]);
    const lastName = getStringFormResponseValue(finalUser.formResponses, [
      "lastName",
      "lastname",
      "familyName",
      "surname",
    ]);
    const eventName = event.shortName || event.name || "Savvio Concorde Event";
    const frontendBaseUrl = resolveFrontendBaseUrl(
      requestOrigin,
      requestHeaderOrigin,
    );
    const passPageUrl = new URL("/pass", frontendBaseUrl);
    passPageUrl.searchParams.set("token", checkInPayload.token);

    const unsubscribeUrl = `${env.APP_URL.replace(/\/$/, "")}/api/unsubscribe/${finalUser.id}/${finalUser.eventId}`;
    const passReferenceId =
      walletPayload?.passReferenceId ||
      `user-${finalUser.id}-event-${finalUser.eventId}`;

    try {
      const sendResult = await EmailService.sendRegistrationSuccessEmail(
        finalUser.email,
        {
          eventName,
          firstName: firstName || undefined,
          passLink: passPageUrl.toString(),
          walletLink: walletPayload?.googleWalletUrl || null,
          passReferenceId,
          unsubscribeLink: unsubscribeUrl,
          fromEmail: event.fromEmail || undefined,
          fromName: event.fromName || undefined,
        },
      );

      if (!sendResult.success) {
        console.warn(
          `Registration success email skipped for ${finalUser.id}: ${sendResult.error || "unknown send error"}`,
        );
      }
    } catch (emailError) {
      console.warn(
        `Registration success email failed for ${finalUser.id}:`,
        emailError,
      );
    }

    const responseMessage = walletPayload
      ? "Registration completed successfully"
      : "Registration completed successfully. Wallet pass is temporarily unavailable.";

    return c.json(
      {
        success: true,
        data: {
          id: finalUser.id,
          email: finalUser.email,
          assigned: finalUser.assigned,
          eventId: finalUser.eventId,
          wallet: walletPayload,
          checkIn: checkInPayload,
        },
        message: responseMessage,
        ...(walletWarningMessage
          ? {
              warnings: [
                `Wallet pass generation unavailable: ${walletWarningMessage}`,
              ],
            }
          : {}),
      },
      201,
    );
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: "Registration failed",
        details: error.message,
      },
      400,
    );
  }
});

// Event Information (Public)
const eventInfoRoute = createRoute({
  method: "get",
  path: "/events/{eventId}/info",
  tags: ["Public - Events"],
  summary: "Get public event information",
  description: "Retrieve public event details for microsite display",
  request: {
    params: z.object({
      eventId: z.string().describe("Event ID to get information for"),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ApiSuccessSchema,
          example: {
            success: true,
            data: {
              id: "60f7b3b3b3b3b3b3b3b3b3b3",
              name: "Concorde Showcase Summit 2026",
              shortName: "Concorde Demo 2026",
              location: {
                city: "Geneva",
                country: "Switzerland",
                venue: "Concorde Convention Centre",
                timezone: "Europe/Zurich",
              },
              dateRange: {
                start: "2026-06-10T00:00:00Z",
                end: "2026-06-13T23:59:59Z",
              },
              config: {
                registrationOpen: true,
              },
              hotelConfig: {
                hotels: [
                  {
                    name: "Concorde Grand Hotel",
                    isDefault: true,
                    roomTypes: ["Deluxe King", "Premium Twin", "Suite"],
                    checkInTime: "15:00",
                    checkOutTime: "11:00",
                  },
                ],
              },
              termsConditions: "<p>Event terms and conditions...</p>",
              privacyPolicy: "<p>Privacy policy content...</p>",
            },
          },
        },
      },
      description: "Event information retrieved successfully",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: "Event not found",
          },
        },
      },
      description: "Event not found",
    },
  },
});

app.openapi(eventInfoRoute, async (c) => {
  try {
    const { eventId } = c.req.valid("param");

    const event = await EventService.findById(eventId, true); // Include groups
    if (!event || !event.active) {
      return c.json(
        {
          success: false,
          error: "Event not found",
        },
        404,
      );
    }

    // Import default form config helper
    const { getFormConfigOrDefault } = await import(
      "../../config/default-form-config.js"
    );

    // Get form config with fallback to default
    const formConfig = getFormConfigOrDefault(event.registrationFormConfig);

    return c.json({
      success: true,
      data: {
        id: event.id,
        name: event.name,
        shortName: event.shortName,
        location: event.location,
        dateRange: event.dateRange,
        config: {
          registrationOpen: (event.config as any)?.registrationOpen || false,
        },
        // Singapore Phase 2 additions
        hotelConfig: event.hotelConfig || null,
        termsConditions: event.termsConditions || null,
        privacyPolicy: event.privacyPolicy || null,
        // Groups for registration binding assignment
        groups: (event as any).groups || [],
        // Dynamic registration form configuration
        registrationFormConfig: formConfig,
      },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: "Failed to retrieve event information",
        details: error.message,
      },
      500,
    );
  }
});

// Legacy /users/register route removed - use event-specific /events/{eventId}/register for public registration

// =============================================================================
// AUTHENTICATED USER ENDPOINTS (Email Required in Request Body)
// =============================================================================

// Get User Itinerary (Authenticated)
const getUserItineraryRoute = createRoute({
  method: "post",
  path: "/user/itinerary",
  tags: ["Public - User (Authenticated)"],
  summary: "Get user assigned group activities",
  description:
    "Retrieve activities for the user's assigned group - requires email in request body",
  middleware: [authenticateUserByEmail] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            email: z.string().email().describe("User email for authentication"),
          }),
          example: {
            email: "john.doe@example.com",
          },
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ApiSuccessSchema,
          example: {
            success: true,
            data: {
              group: {
                id: "60f7b3b3b3b3b3b3b3b3b3b4",
                name: "VIP Group A",
                eventId: "60f7b3b3b3b3b3b3b3b3b3b3",
              },
              timeline: [
                {
                  id: "60f7b3b3b3b3b3b3b3b3b3b5",
                  title: "Welcome Reception",
                  startDateTime: "2025-09-05T19:00:00Z",
                  endDateTime: "2025-09-05T21:00:00Z",
                  content: "<p>Join us for cocktails and networking...</p>",
                  groupId: "60f7b3b3b3b3b3b3b3b3b3b4",
                },
              ],
            },
          },
        },
      },
      description: "Itinerary retrieved successfully",
    },
    401: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: "Missing or invalid authorization header",
          },
        },
      },
      description: "Unauthorized - email required",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: "Not assigned to any group yet",
          },
        },
      },
      description: "User not assigned to group",
    },
  },
});

app.openapi(getUserItineraryRoute, async (c) => {
  // [V1] Legacy email-body auth endpoint disabled in Phase 1 demo path.
  return c.json(
    {
      success: false,
      error:
        "Deprecated endpoint. Use /api/v1/user/itinerary with JWT bearer token.",
    },
    410,
  );

  // Apply authentication middleware manually
  const authResult = await authenticateUserByEmail(c, async () => {});
  if (authResult) {
    return authResult; // Return auth error response
  }

  try {
    const userContext = c.get("user");

    if (!userContext || !userContext.userData) {
      return c.json(
        {
          success: false,
          error: "User not authenticated",
        },
        401,
      );
    }

    if (
      !userContext.userData?.groupIds ||
      userContext.userData.groupIds.length === 0
    ) {
      return c.json(
        {
          success: false,
          error: "Not assigned to any group yet",
        },
        404,
      );
    }

    // Get user-specific activities (filtered for exclusions)
    const { ActivityService } = await import("../../services/activities.js");
    const activities = await ActivityService.getUserTimeline(
      userContext.userData.id,
    );

    return c.json({
      success: true,
      data: {
        group: userContext.userData.group,
        timeline: activities,
      },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: "Failed to retrieve itinerary",
        details: error.message,
      },
      500,
    );
  }
});

// Get User Profile (Authenticated)
const getUserProfileRoute = createRoute({
  method: "post",
  path: "/user/profile",
  tags: ["Public - User (Authenticated)"],
  summary: "Get current user profile",
  description:
    "Retrieve complete user profile information - requires email in request body",
  middleware: [authenticateUserByEmail] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            email: z.string().email().describe("User email for authentication"),
          }),
          example: {
            email: "john.doe@example.com",
          },
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ApiSuccessSchema,
          example: {
            success: true,
            data: {
              id: "60f7b3b3b3b3b3b3b3b3b3b3",
              profile: {
                email: "john.doe@example.com",
                firstName: "John",
                lastName: "Doe",
                phone: "+1-555-0123",
              },
              communication: {
                emailOptIn: true,
                whatsappOptIn: false,
              },
              assigned: true,
              groupId: "60f7b3b3b3b3b3b3b3b3b3b4",
              eventId: "60f7b3b3b3b3b3b3b3b3b3b3",
              flight: {
                airline: "British Airways",
                number: "BA123",
                arrival: "2024-09-15T14:30:00Z",
                departure: "2024-09-18T16:45:00Z",
              },
              accommodation: {
                required: true,
                hotel: "Grand Hotel Milano",
              },
            },
          },
        },
      },
      description: "Profile retrieved successfully",
    },
    401: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: "Missing or invalid authorization header",
          },
        },
      },
      description: "Unauthorized - email required",
    },
  },
});

app.openapi(getUserProfileRoute, async (c) => {
  // [V1] Legacy email-body auth endpoint disabled in Phase 1 demo path.
  return c.json(
    {
      success: false,
      error:
        "Deprecated endpoint. Use /api/v1/user/profile with JWT bearer token.",
    },
    410,
  );

  // Apply authentication middleware manually
  const authResult = await authenticateUserByEmail(c, async () => {});
  if (authResult) {
    return authResult; // Return auth error response
  }

  try {
    const userContext = c.get("user");

    if (!userContext || !userContext.userData) {
      return c.json(
        {
          success: false,
          error: "User not authenticated",
        },
        401,
      );
    }

    return c.json({
      success: true,
      data: userContext.userData,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: "Failed to retrieve profile",
        details: error.message,
      },
      500,
    );
  }
});

// Update Communication Preferences (Authenticated)
const updateCommunicationPreferencesRoute = createRoute({
  method: "put",
  path: "/user/communication-preferences",
  tags: ["Public - User (Authenticated)"],
  summary: "Update user communication preferences",
  description:
    "Update email and WhatsApp notification preferences - requires email in request body",
  middleware: [authenticateUserByEmail] as const,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            email: z.string().email().describe("User email for authentication"),
            emailOptIn: z.boolean().describe("Enable email notifications"),
            whatsappOptIn: z
              .boolean()
              .describe("Enable WhatsApp notifications"),
          }),
          example: {
            email: "john.doe@example.com",
            emailOptIn: true,
            whatsappOptIn: false,
          },
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ApiSuccessSchema,
          example: {
            success: true,
            data: {
              id: "60f7b3b3b3b3b3b3b3b3b3b3",
              communication: {
                emailOptIn: true,
                whatsappOptIn: false,
              },
            },
            message: "Communication preferences updated successfully",
          },
        },
      },
      description: "Preferences updated successfully",
    },
    400: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: "Failed to update preferences",
            details: "Invalid request body",
          },
        },
      },
      description: "Invalid request",
    },
    401: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: "Missing or invalid authorization header",
          },
        },
      },
      description: "Unauthorized - email required",
    },
  },
});

app.openapi(updateCommunicationPreferencesRoute, async (c) => {
  // [V1] Legacy email-body auth endpoint disabled in Phase 1 demo path.
  return c.json(
    {
      success: false,
      error:
        "Deprecated endpoint. Use /api/v1/user/preferences with JWT bearer token.",
    },
    410,
  );

  // Manually run authentication middleware
  const authResult = await authenticateUserByEmail(c, async () => {});
  if (authResult) {
    return authResult; // Return auth error response
  }

  try {
    const userContext = c.get("user");
    const body = c.req.valid("json");

    if (!userContext || !userContext.userData) {
      return c.json(
        {
          success: false,
          error: "User not authenticated",
        },
        401,
      );
    }

    const updatedUser = await UserService.updateCommunicationPreferences(
      userContext.userData.id,
      {
        emailOptIn: body.emailOptIn,
        whatsappOptIn: body.whatsappOptIn,
      },
    );

    return c.json({
      success: true,
      data: updatedUser,
      message: "Communication preferences updated successfully",
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: "Failed to update preferences",
        details: error.message,
      },
      400,
    );
  }
});

// =============================================================================
// PUBLIC ACTIVITY ENDPOINTS (No Authentication Required)
// =============================================================================

// Get Activity Details
const getActivityInfoRoute = createRoute({
  method: "get",
  path: "/activity/{activityId}/info",
  tags: ["Public - Activities"],
  summary: "Get public activity information",
  description:
    "Retrieve activity details for public display (no authentication required)",
  request: {
    params: z.object({
      activityId: z.string().min(1).openapi({
        description: "Activity ID to get information for",
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ApiSuccessSchema,
          example: {
            success: true,
            data: {
              id: "60f7b3b3b3b3b3b3b3b3b3b5",
              title: "Welcome Reception",
              startDateTime: "2025-09-05T19:00:00Z",
              endDateTime: "2025-09-05T21:00:00Z",
              category: "HOSPITALITY",
              location: {
                name: "Grand Ballroom",
                address: "123 Main St, City, State",
                mapLink: "https://maps.google.com/...",
              },
              content: {
                html: "<p>Join us for cocktails and networking...</p>",
              },
              thumbnail: "https://example.com/reception.jpg",
              group: {
                id: "60f7b3b3b3b3b3b3b3b3b3b4",
                name: "VIP Group A",
              },
              event: {
                id: "60f7b3b3b3b3b3b3b3b3b3b3",
                name: "Corporate Event 2025",
                shortName: "CE2025",
              },
            },
          },
        },
      },
      description: "Activity information retrieved successfully",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
          example: {
            success: false,
            error: "Activity not found",
          },
        },
      },
      description: "Activity not found",
    },
  },
});

app.openapi(getActivityInfoRoute, async (c) => {
  try {
    const { activityId } = c.req.valid("param");

    const { ActivityService } = await import("../../services/activities.js");
    const activity = await ActivityService.findById(activityId);

    if (!activity) {
      return c.json(
        {
          success: false,
          error: "Activity not found",
        },
        404,
      );
    }

    // Return public activity information
    return c.json({
      success: true,
      data: {
        id: activity.id,
        title: activity.title,
        description: activity.description,
        startDateTime: activity.startDateTime,
        endDateTime: activity.endDateTime,
        category: activity.category,
        location: activity.location,
        content: activity.content,
        thumbnail: activity.thumbnail,
        timingTable: activity.timingTable,
        // Note: group and event relations not included by ActivityService.findById
        // TODO: Update ActivityService to include relations if needed
      },
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: "Failed to retrieve activity information",
        details: error.message,
      },
      500,
    );
  }
});

// =============================================================================
// UNSUBSCRIBE ENDPOINTS (No Authentication Required)
// =============================================================================

// [V1] Public scanner/check-in endpoint (Task 2.6.3)
const consumeCheckInRoute = createRoute({
  method: "post",
  path: "/check-in/consume",
  tags: ["Public - Check-In"],
  summary: "Consume attendee QR payload and mark check-in state",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            token: z.string().optional(),
            reference: z.string().optional(),
            passReferenceId: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ApiSuccessSchema,
        },
      },
      description: "Check-in consumed successfully",
    },
    400: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "Invalid payload",
    },
  },
});

app.openapi(consumeCheckInRoute, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const queryToken = c.req.query("token");
    const queryReference =
      c.req.query("reference") || c.req.query("passReferenceId");
    const token = body?.token || queryToken;
    const reference =
      body?.reference || body?.passReferenceId || queryReference;

    if (!token && !reference) {
      return c.json(
        {
          success: false,
          error: "Missing check-in token or pass reference",
        },
        400,
      );
    }

    const { WalletService } = await import("../../services/wallet.js");
    const result = token
      ? await WalletService.consumeCheckInToken(token)
      : await WalletService.consumeCheckInReference(reference);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: "Invalid or expired check-in payload",
        details: error.message,
      },
      400,
    );
  }
});

const getCheckInPassRoute = createRoute({
  method: "get",
  path: "/check-in/pass",
  tags: ["Public - Check-In"],
  summary: "Resolve a check-in token to wallet + QR payload (non-consuming)",
  request: {
    query: z.object({
      token: z.string().min(1),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ApiSuccessSchema,
        },
      },
      description: "Pass payload resolved successfully",
    },
    400: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "Invalid or expired token",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "User or event not found",
    },
  },
});

app.openapi(getCheckInPassRoute, async (c) => {
  try {
    const { token } = c.req.valid("query");
    const { WalletService } = await import("../../services/wallet.js");
    const resolvedToken = WalletService.resolveCheckInToken(token);

    const user = await UserService.findById(resolvedToken.userId);
    if (!user || user.eventId !== resolvedToken.eventId) {
      return c.json(
        {
          success: false,
          error: "User not found",
        },
        404,
      );
    }

    const event = await EventService.findById(resolvedToken.eventId);
    if (!event || !event.active) {
      return c.json(
        {
          success: false,
          error: "Event not found",
        },
        404,
      );
    }

    let walletPayload: Awaited<
      ReturnType<typeof WalletService.getOrCreateWalletPass>
    > | null = null;

    try {
      walletPayload = await WalletService.getOrCreateWalletPass({
        userId: user.id,
        eventId: user.eventId,
        email: user.email,
        formResponses: user.formResponses,
      });
    } catch (walletError) {
      console.warn(
        `Pass preview wallet payload unavailable for user ${user.id}:`,
        walletError,
      );
    }

    const requestOrigin = getRequestOrigin(c.req.url);
    const apiBaseUrl = resolveApiBaseUrl(requestOrigin, c.req.header("origin"));
    const qrPayloadUrl = `${apiBaseUrl}/api/v1/public/check-in/consume?token=${encodeURIComponent(token)}`;

    const attendeeFirstName = getStringFormResponseValue(user.formResponses, [
      "firstName",
      "firstname",
      "givenName",
    ]);
    const attendeeLastName = getStringFormResponseValue(user.formResponses, [
      "lastName",
      "lastname",
      "familyName",
      "surname",
    ]);

    return c.json({
      success: true,
      data: {
        event: {
          id: event.id,
          name: event.name,
          shortName: event.shortName,
        },
        attendee: {
          id: user.id,
          email: user.email,
          firstName: attendeeFirstName,
          lastName: attendeeLastName,
        },
        wallet: walletPayload,
        checkIn: {
          qrPayloadUrl,
          token,
          expiresAt: resolvedToken.expiresAt,
          passReferenceId: resolvedToken.passReferenceId,
        },
      },
    });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : "Invalid token";
    return c.json(
      {
        success: false,
        error: "Invalid or expired check-in payload",
        details,
      },
      400,
    );
  }
});

export default app;
