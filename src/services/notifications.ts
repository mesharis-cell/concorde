import { prisma } from '../config/database.js';
import { EmailService } from './email.js';
import { WhatsAppService } from './whatsapp.js';
import type { CreateMessage, MessageDelivery, UserCommunication } from '../types/index.js';

export interface NotificationResult {
  success: boolean;
  deliveries: MessageDelivery[];
  error?: string;
}

export class NotificationService {
  static async sendNotification(data: CreateMessage): Promise<NotificationResult> {
    try {
      // Get recipients based on type
      const recipients = await this.getRecipients(data);
      const deliveries: MessageDelivery[] = [];

      // Send notifications to each recipient
      for (const recipient of recipients) {
        const delivery = await this.sendToRecipient(recipient, data);
        deliveries.push(delivery);
      }

      // Save message record
      await prisma.message.create({
        data: {
          eventId: data.eventId,
          type: data.type,
          emailSubject: data.emailSubject,
          emailContent: data.emailContent,
          whatsappTemplate: data.whatsappTemplate,
          templateVariables: data.templateVariables,
          recipientType: data.recipientType,
          recipientIds: data.recipientIds,
          deliveries,
          sentBy: data.sentBy,
        },
      });

      return {
        success: true,
        deliveries,
      };
    } catch (error: any) {
      console.error('Failed to send notification:', error);
      return {
        success: false,
        deliveries: [],
        error: error.message,
      };
    }
  }

  private static async getRecipients(data: CreateMessage) {
    switch (data.recipientType) {
      case 'INDIVIDUAL':
        return prisma.user.findMany({
          where: {
            id: { in: data.recipientIds },
            eventId: data.eventId,
            active: true,
          },
          select: {
            id: true,
            profile: true,
            communication: true,
          },
        });

      case 'GROUP':
        return prisma.user.findMany({
          where: {
            groupId: { in: data.recipientIds },
            eventId: data.eventId,
            active: true,
            assigned: true,
          },
          select: {
            id: true,
            profile: true,
            communication: true,
          },
        });

      case 'ALL':
        return prisma.user.findMany({
          where: {
            eventId: data.eventId,
            active: true,
            assigned: true,
          },
          select: {
            id: true,
            profile: true,
            communication: true,
          },
        });

      default:
        return [];
    }
  }

  private static async sendToRecipient(
    recipient: any,
    data: CreateMessage
  ): Promise<MessageDelivery> {
    const profile = recipient.profile as any;
    const communication = recipient.communication as UserCommunication;
    
    const delivery: MessageDelivery = {
      user: recipient.id,
      channels: {},
    };

    // Send email if user opted in
    if (communication.emailOptIn && profile.email) {
      if (data.emailSubject && data.emailContent) {
        const emailResult = await EmailService.sendEmail(
          profile.email,
          {
            subject: data.emailSubject,
            html: data.emailContent,
          },
          {
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            ...data.templateVariables,
          }
        );

        delivery.channels.email = {
          sent: emailResult.success,
          sentAt: emailResult.success ? new Date() : undefined,
          delivered: false, // Would be updated by webhook
          error: emailResult.error,
        };
      }
    }

    // Send WhatsApp if user opted in
    if (communication.whatsappOptIn && profile.phone) {
      if (data.whatsappTemplate) {
        const whatsappResult = await WhatsAppService.sendTemplate(
          profile.phone,
          data.whatsappTemplate,
          {
            firstName: profile.firstName,
            lastName: profile.lastName,
            ...data.templateVariables,
          }
        );

        delivery.channels.whatsapp = {
          sent: whatsappResult.success,
          sentAt: whatsappResult.success ? new Date() : undefined,
          delivered: false, // Would be updated by webhook
          error: whatsappResult.error,
        };
      }
    }

    return delivery;
  }

  // Predefined notification methods
  static async sendWelcomeNotification(
    eventId: string,
    userId: string,
    adminId: string
  ): Promise<NotificationResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { event: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const profile = user.profile as any;
    const event = user.event;

    return this.sendNotification({
      eventId,
      type: 'WELCOME',
      emailSubject: `Welcome to ${event.name} - Registration Confirmed`,
      emailContent: `Welcome ${profile.firstName}! Your registration for ${event.name} has been confirmed.`,
      whatsappTemplate: 'welcome_template',
      templateVariables: {
        eventName: event.name,
        firstName: profile.firstName,
        lastName: profile.lastName,
      },
      recipientType: 'INDIVIDUAL',
      recipientIds: [userId],
      sentBy: adminId,
    });
  }

  static async sendGroupAssignmentNotification(
    userId: string,
    _groupId: string,
    adminId: string
  ): Promise<NotificationResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { 
        event: true,
        group: true,
      },
    });

    if (!user || !user.group) {
      throw new Error('User or group not found');
    }

    const profile = user.profile as any;
    const event = user.event;
    const group = user.group;
    
    // Generate itinerary link
    const itineraryLink = `${process.env.APP_URL}/events/${event.id}/itinerary`;

    return this.sendNotification({
      eventId: user.eventId,
      type: 'ASSIGNMENT',
      emailSubject: `Your ${event.name} Itinerary is Ready!`,
      emailContent: `${profile.firstName}, you've been assigned to ${group.name}. View your itinerary: ${itineraryLink}`,
      whatsappTemplate: 'assignment_ready_template',
      templateVariables: {
        eventName: event.name,
        firstName: profile.firstName,
        lastName: profile.lastName,
        groupName: group.name,
        itineraryLink,
      },
      recipientType: 'INDIVIDUAL',
      recipientIds: [userId],
      sentBy: adminId,
    });
  }

  static async sendActivityUpdateNotification(
    activityId: string,
    updateDetails: string,
    adminId: string
  ): Promise<NotificationResult> {
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        event: true,
        group: {
          include: {
            users: {
              where: { assigned: true, active: true },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!activity) {
      throw new Error('Activity not found');
    }

    const event = activity.event;
    const userIds = activity.group.users.map((u: any) => u.id);
    
    // Generate itinerary link
    const itineraryLink = `${process.env.APP_URL}/events/${event.id}/itinerary`;

    return this.sendNotification({
      eventId: activity.eventId,
      type: 'ACTIVITY_UPDATE',
      emailSubject: `Schedule Update: ${activity.title}`,
      emailContent: `Update for ${activity.title}: ${updateDetails}. Check your itinerary: ${itineraryLink}`,
      whatsappTemplate: 'activity_update_template',
      templateVariables: {
        activityTitle: activity.title,
        updateDetails,
        itineraryLink,
      },
      recipientType: 'INDIVIDUAL',
      recipientIds: userIds,
      sentBy: adminId,
    });
  }

  static async sendAnnouncementNotification(
    eventId: string,
    subject: string,
    content: string,
    recipientType: 'ALL' | 'GROUP',
    recipientIds: string[],
    adminId: string
  ): Promise<NotificationResult> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    return this.sendNotification({
      eventId,
      type: 'ANNOUNCEMENT',
      emailSubject: `${event.name} - ${subject}`,
      emailContent: content,
      whatsappTemplate: 'announcement_template',
      templateVariables: {
        eventName: event.name,
        announcementSubject: subject,
        announcementText: content,
      },
      recipientType,
      recipientIds,
      sentBy: adminId,
    });
  }

  static async sendMagicLinkNotification(
    userId: string,
    magicToken: string
  ): Promise<NotificationResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { event: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const _profile = user.profile as any;
    const event = user.event;
    
    // Generate magic link
    const magicLink = `${process.env.APP_URL}/auth/magic?token=${magicToken}&event=${event.id}`;

    // Magic links are always sent via email only for security
    return this.sendNotification({
      eventId: user.eventId,
      type: 'MAGIC_LINK',
      emailSubject: `Access Your ${event.name} Itinerary`,
      emailContent: `Click here to access your itinerary: ${magicLink} (expires in 24 hours)`,
      recipientType: 'INDIVIDUAL',
      recipientIds: [userId],
      sentBy: 'system', // System-generated
    });
  }

  // Webhook handlers for delivery confirmations
  static async handleEmailDeliveryWebhook(
    _messageId: string,
    _status: 'delivered' | 'bounced' | 'complaint',
    _timestamp: Date
  ): Promise<void> {
    // Update message delivery status
    // This would be called by AWS SES webhook
  }

  static async handleWhatsAppDeliveryWebhook(
    _messageId: string,
    _status: 'delivered' | 'failed' | 'read',
    _timestamp: Date
  ): Promise<void> {
    // Update message delivery status
    // This would be called by Twilio webhook
  }
}