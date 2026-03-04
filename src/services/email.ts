import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { Resend } from "resend";
import { env } from "../config/env.js";

const sesClient =
  env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
    ? new SESClient({
        region: env.AWS_REGION,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      })
    : new SESClient({ region: env.AWS_REGION });

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

type TemplateVariables = Record<
  string,
  string | number | boolean | null | undefined
>;

interface SendEmailOptions {
  fromEmail?: string;
  fromName?: string;
  unsubscribeUrl?: string;
}

interface SenderIdentity {
  fromEmail: string;
  fromName?: string;
  fromAddress: string;
}

export class EmailService {
  private static resolveSenderIdentity(
    options?: SendEmailOptions,
  ): SenderIdentity | null {
    const fromEmail =
      options?.fromEmail?.trim() ||
      env.EMAIL_FROM_ADDRESS?.trim() ||
      env.SES_FROM_EMAIL?.trim() ||
      "";

    if (!fromEmail) {
      return null;
    }

    const fromName =
      options?.fromName?.trim() ||
      env.EMAIL_FROM_NAME?.trim() ||
      env.SES_FROM_NAME?.trim() ||
      undefined;

    return {
      fromEmail,
      fromName,
      fromAddress: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    };
  }

  private static buildListUnsubscribeHeaders(
    unsubscribeUrl?: string,
  ): Record<string, string> {
    if (!unsubscribeUrl) {
      return {};
    }

    try {
      const normalizedUrl = new URL(unsubscribeUrl);
      if (normalizedUrl.protocol !== "https:") {
        return {};
      }

      return {
        "List-Unsubscribe": `<${normalizedUrl.toString()}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    } catch {
      return {};
    }
  }

  static async sendEmail(
    to: string | string[],
    template: EmailTemplate,
    variables: TemplateVariables = {},
    options?: SendEmailOptions,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const senderIdentity = this.resolveSenderIdentity(options);
      if (!senderIdentity) {
        return {
          success: false,
          error: "Sender identity is not configured",
        };
      }

      const recipients = Array.isArray(to) ? to : [to];

      // Replace variables in template
      const subject = this.replaceVariables(template.subject, variables);
      const htmlBody = this.replaceVariables(template.html, variables);
      const textBody = template.text
        ? this.replaceVariables(template.text, variables)
        : undefined;
      const unsubscribeUrl =
        options?.unsubscribeUrl ||
        (typeof variables.unsubscribeLink === "string"
          ? variables.unsubscribeLink
          : undefined);
      const unsubscribeHeaders =
        this.buildListUnsubscribeHeaders(unsubscribeUrl);

      if (env.EMAIL_PROVIDER === "resend") {
        if (!resend) {
          return {
            success: false,
            error: "Resend API key is not configured",
          };
        }
        // Use Resend (new and improved!)
        const { data, error } = await resend.emails.send({
          from: senderIdentity.fromAddress,
          to: recipients,
          subject,
          html: htmlBody,
          ...(textBody && { text: textBody }),
          ...(Object.keys(unsubscribeHeaders).length > 0
            ? { headers: unsubscribeHeaders }
            : {}),
        });

        if (error) {
          console.error("Failed to send email via Resend:", error);
          return {
            success: false,
            error: error.message,
          };
        }

        return {
          success: true,
          messageId: data?.id,
        };
      } else {
        // Fallback to AWS SES
        const command = new SendEmailCommand({
          Source: senderIdentity.fromAddress,
          Destination: {
            ToAddresses: recipients,
          },
          Message: {
            Subject: {
              Data: subject,
              Charset: "UTF-8",
            },
            Body: {
              Html: {
                Data: htmlBody,
                Charset: "UTF-8",
              },
              ...(textBody && {
                Text: {
                  Data: textBody,
                  Charset: "UTF-8",
                },
              }),
            },
          },
        });

        const result = await sesClient.send(command);

        return {
          success: true,
          messageId: result.MessageId,
        };
      }
    } catch (error: unknown) {
      console.error("Failed to send email:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown email error",
      };
    }
  }

  static async sendRegistrationSuccessEmail(
    email: string,
    input: {
      eventName: string;
      firstName?: string;
      passLink: string;
      walletLink?: string | null;
      passReferenceId: string;
      unsubscribeLink?: string;
      fromEmail?: string;
      fromName?: string;
    },
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const firstName = input.firstName?.trim() || "there";
    const walletLineHtml = input.walletLink
      ? `<p style="margin: 0 0 12px;">Google Wallet: <a href="{{walletLink}}" style="color: #1a73e8;">Add to Google Wallet</a></p>`
      : "";
    const walletLineText = input.walletLink
      ? `Add to Google Wallet: {{walletLink}}\n`
      : "";
    const unsubscribeLineHtml = input.unsubscribeLink
      ? `<p style="margin: 20px 0 0; font-size: 12px; color: #6b7280;">To stop receiving event emails, <a href="{{unsubscribeLink}}" style="color: #6b7280;">unsubscribe</a>.</p>`
      : "";
    const unsubscribeLineText = input.unsubscribeLink
      ? `To stop receiving event emails: {{unsubscribeLink}}\n`
      : "";

    const template: EmailTemplate = {
      subject: "Registration confirmed: {{eventName}}",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
          <p style="display:none!important;visibility:hidden;mso-hide:all;opacity:0;height:0;width:0;overflow:hidden;">
            Your entry pass is ready.
          </p>
          <p style="margin: 0 0 12px;">Your entry pass is ready.</p>
          <p style="margin: 0 0 12px;">Hi {{firstName}},</p>
          <p style="margin: 0 0 12px;">Your registration for {{eventName}} is confirmed.</p>
          <p style="margin: 20px 0;">
            <a href="{{passLink}}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">
              Open your entry pass
            </a>
          </p>
          ${walletLineHtml}
          <p style="margin: 0 0 12px; font-size: 13px; color: #4b5563;">Pass reference: {{passReferenceId}}</p>
          ${unsubscribeLineHtml}
        </div>
      `,
      text: `Your entry pass is ready.

Hi {{firstName}},

Your registration for {{eventName}} is confirmed.
Open your entry pass: {{passLink}}
${walletLineText}Pass reference: {{passReferenceId}}
${unsubscribeLineText}`,
    };

    return this.sendEmail(
      email,
      template,
      {
        eventName: input.eventName,
        firstName,
        passLink: input.passLink,
        walletLink: input.walletLink || "",
        passReferenceId: input.passReferenceId,
        unsubscribeLink: input.unsubscribeLink || "",
      },
      {
        fromEmail: input.fromEmail,
        fromName: input.fromName,
        unsubscribeUrl: input.unsubscribeLink,
      },
    );
  }

  static async sendWelcomeEmail(
    email: string,
    variables: {
      eventName: string;
      firstName: string;
      lastName: string;
    },
  ) {
    const template: EmailTemplate = {
      subject: "Welcome to {{eventName}} - Registration Confirmed",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2c3e50;">Welcome to {{eventName}}</h1>
          
          <p>Dear {{firstName}} {{lastName}},</p>
          
          <p>Thank you for registering for <strong>{{eventName}}</strong>. Your registration has been successfully confirmed.</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>What's Next?</h3>
            <ul>
              <li>You will receive your group assignment and itinerary shortly</li>
              <li>Our team is reviewing your requirements and preferences</li>
              <li>You'll be notified via your preferred communication channels</li>
            </ul>
          </div>
          
          <p>If you have any questions or need to update your information, please don't hesitate to contact us.</p>
          
          <p>Looking forward to seeing you at {{eventName}}!</p>
          
          <p>Best regards,<br>The {{eventName}} Team</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #666; text-align: center;">
            This email was sent for {{eventName}}. 
            <a href="{{unsubscribeLink}}" style="color: #666;">Unsubscribe</a>
          </p>
        </div>
      `,
    };

    return this.sendEmail(email, template, variables);
  }

  static async sendGroupAssignmentEmail(
    email: string,
    variables: {
      eventName: string;
      firstName: string;
      lastName: string;
      groupName: string;
      itineraryLink: string;
    },
  ) {
    const template: EmailTemplate = {
      subject: "Your {{eventName}} Itinerary is Ready!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2c3e50;">Your Itinerary is Ready!</h1>
          
          <p>Dear {{firstName}} {{lastName}},</p>
          
          <p>Great news! You have been assigned to <strong>{{groupName}}</strong> for {{eventName}}.</p>
          
          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>🎉 Your Group: {{groupName}}</h3>
            <p>Your personalized itinerary is now available with all the activities and events planned for your group.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="{{itineraryLink}}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Your Itinerary</a>
          </div>
          
          <p>You can access your itinerary at any time using the link above. Make sure to check back regularly for any updates or changes.</p>
          
          <p>We're excited to have you join {{groupName}} and look forward to an amazing {{eventName}}!</p>
          
          <p>Best regards,<br>The {{eventName}} Team</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #666; text-align: center;">
            This email was sent for {{eventName}}. 
            <a href="{{unsubscribeLink}}" style="color: #666;">Unsubscribe</a>
          </p>
        </div>
      `,
    };

    return this.sendEmail(email, template, variables);
  }

  static async sendActivityUpdateEmail(
    email: string,
    variables: {
      eventName: string;
      firstName: string;
      lastName: string;
      activityTitle: string;
      updateDetails: string;
      itineraryLink: string;
    },
  ) {
    const template: EmailTemplate = {
      subject: "Schedule Update: {{activityTitle}}",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2c3e50;">Schedule Update</h1>
          
          <p>Dear {{firstName}} {{lastName}},</p>
          
          <p>We have an important update regarding <strong>{{activityTitle}}</strong> in your {{eventName}} itinerary.</p>
          
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h3>📅 Update Details:</h3>
            <p>{{updateDetails}}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="{{itineraryLink}}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Updated Itinerary</a>
          </div>
          
          <p>Please check your updated itinerary for the latest information. We apologize for any inconvenience and appreciate your understanding.</p>
          
          <p>Best regards,<br>The {{eventName}} Team</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #666; text-align: center;">
            This email was sent for {{eventName}}. 
            <a href="{{unsubscribeLink}}" style="color: #666;">Unsubscribe</a>
          </p>
        </div>
      `,
    };

    return this.sendEmail(email, template, variables);
  }

  static async sendAnnouncementEmail(
    email: string,
    variables: {
      eventName: string;
      firstName: string;
      lastName: string;
      announcementSubject: string;
      announcementContent: string;
    },
  ) {
    const template: EmailTemplate = {
      subject: "{{eventName}} - {{announcementSubject}}",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2c3e50;">{{announcementSubject}}</h1>
          
          <p>Dear {{firstName}} {{lastName}},</p>
          
          <div style="padding: 20px; margin: 20px 0;">
            {{announcementContent}}
          </div>
          
          <p>Thank you for your attention.</p>
          
          <p>Best regards,<br>The {{eventName}} Team</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #666; text-align: center;">
            This email was sent for {{eventName}}. 
            <a href="{{unsubscribeLink}}" style="color: #666;">Unsubscribe</a>
          </p>
        </div>
      `,
    };

    return this.sendEmail(email, template, variables);
  }

  static async sendMagicLinkEmail(
    email: string,
    variables: {
      eventName: string;
      firstName: string;
      lastName: string;
      magicLink: string;
      unsubscribeLink?: string;
    },
  ) {
    const template: EmailTemplate = {
      subject: "Access Your {{eventName}} Itinerary",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2c3e50;">Access Your Itinerary</h1>
          
          <p>Dear {{firstName}} {{lastName}},</p>
          
          <p>Click the button below to securely access your {{eventName}} itinerary:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="{{magicLink}}" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px;">Access My Itinerary</a>
          </div>
          
          <div style="background-color: #f8d7da; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <p><strong>⚠️ Security Notice:</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
              <li>This link expires in 24 hours</li>
              <li>It can only be used once</li>
              <li>Do not share this link with others</li>
            </ul>
          </div>
          
          <p>If you didn't request this link, please ignore this email.</p>
          
          <p>Best regards,<br>The {{eventName}} Team</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #666; text-align: center;">
            This email was sent for {{eventName}}. 
            <a href="{{unsubscribeLink}}" style="color: #666;">Unsubscribe</a>
          </p>
        </div>
      `,
    };

    return this.sendEmail(email, template, variables);
  }

  private static replaceVariables(
    template: string,
    variables: TemplateVariables,
  ): string {
    let result = template;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      result = result.replace(
        regex,
        value === undefined || value === null ? "" : String(value),
      );
    });

    return result;
  }
}
