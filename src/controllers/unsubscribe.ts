import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { UserService } from "../services/users.js";
import type { AuthContext } from "../middleware/auth.js";
import { ApiSuccessSchema, ApiErrorSchema } from "../types/index.js";

const app = new OpenAPIHono<{ Variables: AuthContext }>();

const getWhatsappOptIn = (communication: unknown): boolean => {
  if (!communication || typeof communication !== "object") {
    return false;
  }

  const record = communication as Record<string, unknown>;
  return record.whatsappOptIn === true;
};

// Simple Unsubscribe Route
const unsubscribeRoute = createRoute({
  method: "get",
  path: "/unsubscribe/{userId}/{eventId}",
  tags: ["Public - Unsubscribe"],
  summary: "Unsubscribe user from event communications",
  description: "Simple one-click unsubscribe from event emails",
  request: {
    params: z.object({
      userId: z.string().describe("User ID to unsubscribe"),
      eventId: z.string().describe("Event ID"),
    }),
  },
  responses: {
    200: {
      content: {
        "text/html": {
          schema: z.string(),
        },
      },
      description: "Unsubscribe confirmation page",
    },
    404: {
      content: {
        "text/html": {
          schema: z.string(),
        },
      },
      description: "User not found",
    },
    500: {
      content: {
        "text/html": {
          schema: z.string(),
        },
      },
      description: "Server error",
    },
  },
});

app.get("/unsubscribe/:userId/:eventId", async (c) => {
  try {
    const { userId, eventId } = c.req.param();

    // Find user and update email preferences
    const user = await UserService.findById(userId);
    if (!user || user.eventId !== eventId) {
      return c.html(
        `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Unsubscribe - User Not Found</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center;">
          <h1 style="color: #dc3545;">User Not Found</h1>
          <p>We couldn't find your subscription. It may have already been removed or the link is invalid.</p>
          <p style="margin-top: 30px; font-size: 14px; color: #666;">
            If you continue to receive emails, please contact support.
          </p>
        </body>
        </html>
      `,
        404,
      );
    }

    // Update email preferences to opt out
    await UserService.updateCommunicationPreferences(userId, {
      emailOptIn: false,
      whatsappOptIn: getWhatsappOptIn(user.communication), // Keep WhatsApp as-is
    });

    // Return simple confirmation HTML
    return c.html(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Unsubscribed Successfully</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center;">
        <h1 style="color: #28a745;">✅ You've been unsubscribed</h1>
        <p style="font-size: 18px; margin: 20px 0;">
          You will no longer receive email notifications for this event.
        </p>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 30px 0; text-align: left;">
          <h3 style="margin-top: 0;">What this means:</h3>
          <ul style="margin: 0; padding-left: 20px;">
            <li>No more marketing or promotional emails</li>
            <li>No more event updates or announcements</li>
            <li>You may still receive critical account-related emails</li>
          </ul>
        </div>
        <p style="margin-top: 30px; font-size: 14px; color: #666;">
          You can update your preferences anytime by logging into your account.
        </p>
      </body>
      </html>
    `,
      200,
    );
  } catch (error: any) {
    return c.html(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Unsubscribe Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center;">
        <h1 style="color: #dc3545;">Something went wrong</h1>
        <p>We encountered an error while processing your unsubscribe request.</p>
        <p style="margin-top: 30px; font-size: 14px; color: #666;">
          Please try again later or contact support if the problem persists.
        </p>
      </body>
      </html>
    `,
      500,
    );
  }
});

app.post("/unsubscribe/:userId/:eventId", async (c) => {
  try {
    const { userId, eventId } = c.req.param();
    const user = await UserService.findById(userId);

    // One-click unsubscribe should always return 200 and be idempotent.
    if (!user || !user.active || user.eventId !== eventId) {
      return c.text("OK", 200);
    }

    await UserService.updateCommunicationPreferences(userId, {
      emailOptIn: false,
      whatsappOptIn: getWhatsappOptIn(user.communication),
    });

    return c.text("OK", 200);
  } catch (error) {
    console.warn("One-click unsubscribe failed silently:", error);
    return c.text("OK", 200);
  }
});

export default app;
