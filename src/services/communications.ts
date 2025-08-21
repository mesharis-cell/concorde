import { EmailService, EmailTemplate } from './email.js';
import { CommunicationLogService } from './communication-logs.js';
import { UserService } from './users.js';
import { EventService } from './events.js';
import { GroupService } from './groups.js';

export interface SendCommunicationRequest {
  eventId: string;
  adminId: string;
  recipientType: 'individual' | 'group' | 'all';
  recipientIds?: string[]; // User IDs or Group IDs based on recipientType
  subject: string;
  content: string; // HTML content
  channel: 'email'; // For now, email only as per requirements
  templateType?: 'welcome' | 'assignment' | 'activity_update' | 'announcement' | 'custom';
  variables?: Record<string, any>;
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
  static async sendCommunication(request: SendCommunicationRequest): Promise<CommunicationResult> {
    const recipients = await this.getRecipients(request.eventId, request.recipientType, request.recipientIds);
    
    // Filter to only email opt-in users
    const eligibleRecipients = recipients.filter(r => r.emailOptIn);
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
          ...request.variables,
        };

        const emailResult = await EmailService.sendEmail(recipient.email, template, variables);
        
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
            recipientType: request.recipientType === 'individual' ? 'single' : request.recipientType,
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
            recipientType: request.recipientType === 'individual' ? 'single' : request.recipientType,
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
    const skippedRecipients = recipients.filter(r => !r.emailOptIn);
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

  private static async getRecipients(
    eventId: string,
    recipientType: 'individual' | 'group' | 'all',
    recipientIds?: string[]
  ): Promise<CommunicationRecipient[]> {
    let users: any[] = [];

    switch (recipientType) {
      case 'individual':
        if (!recipientIds?.length) throw new Error('User IDs required for individual recipients');
        users = await Promise.all(
          recipientIds.map(userId => UserService.findById(userId))
        );
        users = users.filter(Boolean);
        break;

      case 'group':
        if (!recipientIds?.length) throw new Error('Group IDs required for group recipients');
        for (const groupId of recipientIds) {
          const groupUsers = await GroupService.getMembers(groupId, { page: 1, limit: 1000 });
          users.push(...groupUsers.items);
        }
        break;

      case 'all':
        const allUsers = await UserService.findByEventId(eventId, { page: 1, limit: 10000 });
        users = allUsers.items;
        break;
    }

    return users.map(user => ({
      userId: user.id,
      email: (user.profile as any)?.email,
      firstName: (user.profile as any)?.firstName,
      lastName: (user.profile as any)?.lastName,
      emailOptIn: (user.communication as any)?.emailOptIn || false,
      groupId: user.groupId,
    })).filter(r => r.email); // Filter out users without email
  }

  private static getPurposeFromTemplateType(templateType?: string): string {
    switch (templateType) {
      case 'welcome': return 'event_reminder';
      case 'assignment': return 'group_assignment';
      case 'activity_update': return 'event_reminder';
      case 'announcement': return 'announcement';
      default: return 'custom';
    }
  }

  private static replaceVariables(template: string, variables: Record<string, any>): string {
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
    const logs = await CommunicationLogService.findByEventId(eventId, { page: 1, limit: 10000 });
    
    const totalMessages = logs.items.length;
    const emailMessages = logs.items.filter(log => log.type === 'email').length;
    const deliveredMessages = logs.items.filter(log => log.status === 'delivered' || log.status === 'sent').length;
    const failedMessages = logs.items.filter(log => log.status === 'failed').length;

    // Get user communication preferences
    const users = await UserService.findByEventId(eventId, { page: 1, limit: 10000 });
    const emailOnly = users.items.filter(u => (u.communication as any)?.emailOptIn && !(u.communication as any)?.whatsappOptIn).length;
    const whatsappOnly = users.items.filter(u => !(u.communication as any)?.emailOptIn && (u.communication as any)?.whatsappOptIn).length;
    const both = users.items.filter(u => (u.communication as any)?.emailOptIn && (u.communication as any)?.whatsappOptIn).length;
    const neither = users.items.filter(u => !(u.communication as any)?.emailOptIn && !(u.communication as any)?.whatsappOptIn).length;

    return {
      totalMessages,
      emailMessages,
      deliveredMessages,
      failedMessages,
      optInStats: {
        emailOnly,
        whatsappOnly,
        both,
        neither,
      },
    };
  }

  static getEmailTemplates(): { id: string; name: string; subject: string; type: string }[] {
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