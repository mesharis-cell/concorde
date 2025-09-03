import { EmailService, EmailTemplate } from './email.js';
import { TemplateService } from './templates.js';
import { CommunicationLogService } from './communication-logs.js';
import { UserService } from './users.js';
import { EventService } from './events.js';
import { GroupService } from './groups.js';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

export interface SendCommunicationRequest {
  eventId: string;
  adminId: string;
  recipientType: 'individual' | 'group' | 'all';
  recipientIds?: string[]; // User IDs or Group IDs based on recipientType
  templateId?: string; // Use template-based sending (preferred)
  subject?: string; // Fallback for non-template sending
  content?: string; // Fallback HTML content
  channel: 'email'; // For now, email only as per requirements
  variables?: Record<string, any>;
}

export interface SendTemplateEmailRequest {
  templateId: string;
  recipientType: 'individual' | 'group' | 'all';
  recipientIds?: string[]; // For authentication, only single user allowed
  variables?: Record<string, any>;
  adminId: string;
}

export interface CommunicationRecipient {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  emailOptIn: boolean;
  groupId?: string;
}

export interface CommunicationResult {
  totalRecipients: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  deliveries: {
    userId: string;
    email: string;
    status: 'sent' | 'skipped' | 'failed';
    error?: string;
    messageId?: string;
  }[];
}

export class CommunicationsService {
  static async sendCommunication(
    request: SendCommunicationRequest
  ): Promise<CommunicationResult> {
    const recipients = await this.getRecipients(
      request.eventId,
      request.recipientType,
      request.recipientIds
    );

    // Filter to only email opt-in users
    const eligibleRecipients = recipients.filter((r) => r.emailOptIn);
    const skippedCount = recipients.length - eligibleRecipients.length;

    const result: CommunicationResult = {
      totalRecipients: recipients.length,
      sentCount: 0,
      skippedCount,
      failedCount: 0,
      deliveries: [],
    };

    // Send emails to eligible recipients
    for (const recipient of eligibleRecipients) {
      try {
        const template: EmailTemplate = {
          subject: request.subject,
          html: request.content,
        };

        // Replace variables in template
        const variables = {
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          unsubscribeLink: `${env.APP_URL || 'http://localhost:3001'}/api/unsubscribe/${recipient.userId}/${request.eventId}`,
          ...request.variables,
        };

        const emailResult = await EmailService.sendEmail(
          recipient.email,
          template,
          variables
        );

        if (emailResult.success) {
          // Log successful communication
          await CommunicationLogService.create({
            userId: recipient.userId,
            eventId: request.eventId,
            groupId: recipient.groupId,
            adminId: request.adminId,
            type: 'email',
            channel: 'email',
            purpose: this.getPurposeFromTemplateType(request.templateType),
            subject: this.replaceVariables(request.subject, variables),
            content: {
              html: this.replaceVariables(request.content, variables),
            },
            recipientType:
              request.recipientType === 'individual'
                ? 'single'
                : request.recipientType,
            recipientIds: request.recipientIds,
            status: 'sent',
            metadata: { messageId: emailResult.messageId },
          });

          result.sentCount++;
          result.deliveries.push({
            userId: recipient.userId,
            email: recipient.email,
            status: 'sent',
            messageId: emailResult.messageId,
          });
        } else {
          // Log failed communication
          await CommunicationLogService.create({
            userId: recipient.userId,
            eventId: request.eventId,
            groupId: recipient.groupId,
            adminId: request.adminId,
            type: 'email',
            channel: 'email',
            purpose: this.getPurposeFromTemplateType(request.templateType),
            subject: request.subject,
            content: {
              html: request.content,
            },
            recipientType:
              request.recipientType === 'individual'
                ? 'single'
                : request.recipientType,
            recipientIds: request.recipientIds,
            status: 'failed',
            metadata: { error: emailResult.error },
          });

          result.failedCount++;
          result.deliveries.push({
            userId: recipient.userId,
            email: recipient.email,
            status: 'failed',
            error: emailResult.error,
          });
        }
      } catch (error: any) {
        result.failedCount++;
        result.deliveries.push({
          userId: recipient.userId,
          email: recipient.email,
          status: 'failed',
          error: error.message,
        });
      }
    }

    // Add skipped recipients to deliveries
    const skippedRecipients = recipients.filter((r) => !r.emailOptIn);
    for (const recipient of skippedRecipients) {
      result.deliveries.push({
        userId: recipient.userId,
        email: recipient.email,
        status: 'skipped',
        error: 'User has opted out of email communications',
      });
    }

    return result;
  }

  // Template-based email sending with tracking and monitoring
  static async sendTemplateEmail(
    request: SendTemplateEmailRequest
  ): Promise<CommunicationResult> {
    // Get template and validate access
    const template = await TemplateService.findById(request.templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Check admin access to template
    const accessCheck = await TemplateService.checkAccess(
      request.templateId,
      request.adminId
    );
    if (!accessCheck.canAccess) {
      throw new Error(
        'Access denied - insufficient permissions for this template type'
      );
    }

    // Authentication templates can only be sent to single users
    if (
      template.type === 'AUTHENTICATION' &&
      request.recipientType !== 'individual'
    ) {
      throw new Error(
        'Authentication templates can only be sent to single users'
      );
    }

    if (
      template.type === 'AUTHENTICATION' &&
      (!request.recipientIds || request.recipientIds.length !== 1)
    ) {
      throw new Error('Authentication templates require exactly one recipient');
    }

    // Get recipients
    const recipients = await this.getRecipients(
      template.eventId,
      request.recipientType,
      request.recipientIds
    );

    // Filter to only email opt-in users (except for authentication emails which bypass opt-in)
    const eligibleRecipients =
      template.type === 'AUTHENTICATION'
        ? recipients.filter((r) => r.email)
        : recipients.filter((r) => r.emailOptIn);

    const skippedCount = recipients.length - eligibleRecipients.length;

    const result: CommunicationResult = {
      totalRecipients: recipients.length,
      sentCount: 0,
      skippedCount,
      failedCount: 0,
      deliveries: [],
    };

    // Get event info for variable substitution
    const event = await prisma.event.findUnique({
      where: { id: template.eventId },
      select: { name: true, shortName: true, location: true, dateRange: true },
    });

    // Build base variables that will be the same for all recipients
    const baseVariables = {
      eventName: event?.name || 'Event',
      eventLocation: (event?.location as any)?.city || 'TBD',
      eventDate: event?.dateRange
        ? new Date((event.dateRange as any).start).toLocaleDateString()
        : 'TBD',
      ...request.variables,
    };

    // Create message record with processed subject
    const processedSubject = this.replaceVariables(
      template.subject,
      baseVariables
    );

    const message = await prisma.message.create({
      data: {
        eventId: template.eventId,
        templateId: template.id,
        type: this.getMessageTypeFromCategory(template.category),
        emailSubject: processedSubject, // Store the processed subject
        recipientType: this.convertRecipientType(request.recipientType),
        recipientIds: request.recipientIds || [],
        templateVariables: baseVariables,
        sentBy: request.adminId,
        status: 'sending',
        monitoringEmailSent: false,
        deliveries: [],
      },
    });

    // Send emails to eligible recipients
    const deliveries = [];
    for (const recipient of eligibleRecipients) {
      try {
        // Generate tracking URL
        const trackingUrl = await TemplateService.generateTrackingUrl(
          message.id,
          recipient.userId
        );

        // Build variables for template substitution (combine base + recipient-specific)
        const variables = {
          ...baseVariables,
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          email: recipient.email,
          unsubscribeLink: `${env.APP_URL || 'http://localhost:3001'}/api/unsubscribe/${recipient.userId}/${template.eventId}`,
        };

        // Inject tracking pixel into HTML
        const trackingPixel = `<img src="${env.APP_URL || 'http://localhost:3001'}${trackingUrl}" width="1" height="1" style="display:none;" alt="" />`;
        const htmlWithTracking = template.html.replace(
          '</body>',
          `${trackingPixel}</body>`
        );

        const emailTemplate: EmailTemplate = {
          subject: this.replaceVariables(template.subject, variables),
          html: this.replaceVariables(htmlWithTracking, variables),
        };

        const emailResult = await EmailService.sendEmail(
          recipient.email,
          emailTemplate,
          {}
        );

        if (emailResult.success) {
          // Create communication log for statistics and user tracking
          await CommunicationLogService.create({
            userId: recipient.userId,
            eventId: template.eventId,
            groupId: recipient.groupId,
            adminId: request.adminId,
            type: 'email',
            channel: 'email',
            purpose:
              template.type === 'AUTHENTICATION'
                ? 'authentication'
                : 'communication',
            subject: this.replaceVariables(template.subject, variables),
            content: {
              html: this.replaceVariables(template.html, variables),
              templateId: template.id,
              variables,
            },
            recipientType:
              request.recipientType === 'individual'
                ? 'single'
                : request.recipientType,
            recipientIds: request.recipientIds || [],
            status: 'sent',
            metadata: { messageId: emailResult.messageId, trackingUrl },
          });

          result.sentCount++;
          deliveries.push({
            user: recipient.userId,
            email: {
              sent: true,
              sentAt: new Date(),
              opened: false,
              openedAt: null,
              delivered: false,
              deliveredAt: null,
              error: null,
            },
          });

          result.deliveries.push({
            userId: recipient.userId,
            email: recipient.email,
            status: 'sent',
            messageId: emailResult.messageId,
          });
        } else {
          // Create communication log for failed emails
          await CommunicationLogService.create({
            userId: recipient.userId,
            eventId: template.eventId,
            groupId: recipient.groupId,
            adminId: request.adminId,
            type: 'email',
            channel: 'email',
            purpose:
              template.type === 'AUTHENTICATION'
                ? 'authentication'
                : 'communication',
            subject: this.replaceVariables(template.subject, variables),
            content: {
              html: this.replaceVariables(template.html, variables),
              templateId: template.id,
              variables,
            },
            recipientType:
              request.recipientType === 'individual'
                ? 'single'
                : request.recipientType,
            recipientIds: request.recipientIds || [],
            status: 'failed',
            metadata: { error: emailResult.error },
          });

          result.failedCount++;
          deliveries.push({
            user: recipient.userId,
            email: {
              sent: false,
              sentAt: null,
              opened: false,
              openedAt: null,
              delivered: false,
              deliveredAt: null,
              error: emailResult.error,
            },
          });

          result.deliveries.push({
            userId: recipient.userId,
            email: recipient.email,
            status: 'failed',
            error: emailResult.error,
          });
        }
      } catch (error: any) {
        // Create communication log for general errors
        try {
          await CommunicationLogService.create({
            userId: recipient.userId,
            eventId: template.eventId,
            groupId: recipient.groupId,
            adminId: request.adminId,
            type: 'email',
            channel: 'email',
            purpose:
              template.type === 'AUTHENTICATION'
                ? 'authentication'
                : 'communication',
            subject: template.subject,
            content: {
              html: template.html,
              templateId: template.id,
              variables,
            },
            recipientType:
              request.recipientType === 'individual'
                ? 'single'
                : request.recipientType,
            recipientIds: request.recipientIds || [],
            status: 'failed',
            metadata: { error: error.message },
          });
        } catch (logError) {
          console.error('Failed to create communication log:', logError);
        }

        result.failedCount++;
        deliveries.push({
          user: recipient.userId,
          email: {
            sent: false,
            sentAt: null,
            opened: false,
            openedAt: null,
            delivered: false,
            deliveredAt: null,
            error: error.message,
          },
        });

        result.deliveries.push({
          userId: recipient.userId,
          email: recipient.email,
          status: 'failed',
          error: error.message,
        });
      }
    }

    // Send monitoring email if configured
    const monitoringEmail = env.MONITORING_EMAIL;
    if (monitoringEmail && result.sentCount > 0) {
      try {
        const monitoringSubject = `[MONITORING] ${template.subject} - Sent to ${result.sentCount} recipients`;
        const monitoringContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h3>Email Campaign Summary</h3>
            <table style="border-collapse: collapse; width: 100%;">
              <tr><td><strong>Template:</strong></td><td>${template.name} (${template.type})</td></tr>
              <tr><td><strong>Event:</strong></td><td>${(template as any).event?.name || 'Unknown'}</td></tr>
              <tr><td><strong>Recipients:</strong></td><td>${result.sentCount} sent, ${result.skippedCount} skipped, ${result.failedCount} failed</td></tr>
              <tr><td><strong>Sent by:</strong></td><td>Admin ID ${request.adminId}</td></tr>
              <tr><td><strong>Time:</strong></td><td>${new Date().toISOString()}</td></tr>
            </table>
          </div>
        `;

        await EmailService.sendEmail(
          monitoringEmail,
          {
            subject: monitoringSubject,
            html: monitoringContent,
          },
          {}
        );

        await prisma.message.update({
          where: { id: message.id },
          data: { monitoringEmailSent: true },
        });
      } catch (error) {
        console.error('Failed to send monitoring email:', error);
      }
    }

    // Update message with final status and deliveries
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status:
          result.failedCount === 0
            ? 'sent'
            : result.sentCount > 0
              ? 'partial'
              : 'failed',
        deliveries,
      },
    });

    return result;
  }

  private static getMessageTypeFromCategory(category: string): any {
    switch (category) {
      case 'WELCOME':
        return 'WELCOME';
      case 'ASSIGNMENT':
        return 'ASSIGNMENT';
      case 'ACTIVITY_UPDATE':
        return 'ACTIVITY_UPDATE';
      case 'ANNOUNCEMENT':
        return 'ANNOUNCEMENT';
      case 'MAGIC_LINK':
        return 'MAGIC_LINK';
      default:
        return 'ANNOUNCEMENT';
    }
  }

  private static convertRecipientType(type: string): any {
    switch (type) {
      case 'individual':
        return 'INDIVIDUAL';
      case 'group':
        return 'GROUP';
      case 'all':
        return 'ALL';
      default:
        return 'INDIVIDUAL';
    }
  }

  private static async getRecipients(
    eventId: string,
    recipientType: 'individual' | 'group' | 'all',
    recipientIds?: string[]
  ): Promise<CommunicationRecipient[]> {
    let users: any[] = [];

    switch (recipientType) {
      case 'individual':
        if (!recipientIds?.length)
          throw new Error('User IDs required for individual recipients');
        users = await Promise.all(
          recipientIds.map((userId) => UserService.findById(userId))
        );
        users = users.filter(Boolean);
        break;

      case 'group':
        if (!recipientIds?.length)
          throw new Error('Group IDs required for group recipients');
        for (const groupId of recipientIds) {
          const groupUsers = await GroupService.getMembers(groupId, {
            page: 1,
            limit: 1000,
          });
          users.push(...groupUsers.items);
        }
        break;

      case 'all':
        const allUsers = await UserService.findByEventId(eventId, {
          page: 1,
          limit: 10000,
        });
        users = allUsers.items;
        break;
    }

    return users
      .map((user) => ({
        userId: user.id,
        email: (user.profile as any)?.email,
        firstName: (user.profile as any)?.firstName,
        lastName: (user.profile as any)?.lastName,
        emailOptIn: (user.communication as any)?.emailOptIn || false,
        groupId: user.groupId,
      }))
      .filter((r) => r.email); // Filter out users without email
  }

  private static getPurposeFromTemplateType(templateType?: string): string {
    switch (templateType) {
      case 'welcome':
        return 'event_reminder';
      case 'assignment':
        return 'group_assignment';
      case 'activity_update':
        return 'event_reminder';
      case 'announcement':
        return 'announcement';
      default:
        return 'custom';
    }
  }

  private static replaceVariables(
    template: string,
    variables: Record<string, any>
  ): string {
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    });
    return result;
  }

  static async getCommunicationStats(eventId: string): Promise<{
    totalMessages: number;
    emailMessages: number;
    deliveredMessages: number;
    failedMessages: number;
    optInStats: {
      emailOnly: number;
      whatsappOnly: number;
      both: number;
      neither: number;
    };
  }> {
    // Get communication logs stats
    const logs = await CommunicationLogService.findByEventId(eventId, {
      page: 1,
      limit: 10000,
    });

    const totalMessages = logs.items.length;
    const emailMessages = logs.items.filter(
      (log) => log.type === 'email'
    ).length;
    const deliveredMessages = logs.items.filter(
      (log) => log.status === 'delivered' || log.status === 'sent'
    ).length;
    const failedMessages = logs.items.filter(
      (log) => log.status === 'failed'
    ).length;

    // Get user communication preferences
    const users = await UserService.findByEventId(eventId, {
      page: 1,
      limit: 10000,
    });
    const emailOnly = users.items.filter(
      (u) =>
        (u.communication as any)?.emailOptIn &&
        !(u.communication as any)?.whatsappOptIn
    ).length;
    const whatsappOnly = users.items.filter(
      (u) =>
        !(u.communication as any)?.emailOptIn &&
        (u.communication as any)?.whatsappOptIn
    ).length;
    const both = users.items.filter(
      (u) =>
        (u.communication as any)?.emailOptIn &&
        (u.communication as any)?.whatsappOptIn
    ).length;
    const neither = users.items.filter(
      (u) =>
        !(u.communication as any)?.emailOptIn &&
        !(u.communication as any)?.whatsappOptIn
    ).length;

    // Calculate opened messages from message tracking
    const messages = await prisma.message.findMany({
      where: { eventId },
      include: {
        emailTracking: true,
      },
    });

    const openedMessages = messages.reduce((count, message) => {
      return (
        count +
        message.emailTracking.filter((tracking) => tracking.opened).length
      );
    }, 0);

    return {
      totalMessages,
      emailMessages,
      deliveredMessages,
      failedMessages,
      openedMessages,
      optInStats: {
        emailOnly,
        whatsappOnly,
        both,
        neither,
      },
    };
  }

  static getEmailTemplates(): {
    id: string;
    name: string;
    subject: string;
    type: string;
  }[] {
    return [
      {
        id: 'welcome',
        name: 'Welcome Email',
        subject: 'Welcome to {{eventName}} - Registration Confirmed',
        type: 'welcome',
      },
      {
        id: 'assignment',
        name: 'Group Assignment',
        subject: 'Your {{eventName}} Itinerary is Ready!',
        type: 'assignment',
      },
      {
        id: 'activity_update',
        name: 'Activity Update',
        subject: 'Schedule Update: {{activityTitle}}',
        type: 'activity_update',
      },
      {
        id: 'announcement',
        name: 'Announcement',
        subject: '{{eventName}} - {{announcementSubject}}',
        type: 'announcement',
      },
      {
        id: 'custom',
        name: 'Custom Message',
        subject: 'Custom Subject',
        type: 'custom',
      },
    ];
  }
}
