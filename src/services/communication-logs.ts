import { prisma } from '../config/database.js';
import { PaginatedResponse, Pagination } from '../types/index.js';

export interface CommunicationLogData {
  userId: string;
  eventId: string;
  groupId?: string;
  adminId: string;
  type: 'email' | 'whatsapp';
  channel: 'email' | 'whatsapp' | 'sms';
  purpose: 'group_assignment' | 'event_reminder' | 'custom' | 'announcement';
  subject?: string;
  content: {
    html?: string;
    text?: string;
    templateId?: string;
    variables?: Record<string, any>;
  };
  recipientType: 'single' | 'group' | 'event' | 'custom';
  recipientIds?: string[];
  status?: 'sent' | 'delivered' | 'failed' | 'pending';
  metadata?: Record<string, any>;
}

export interface CommunicationLog extends CommunicationLogData {
  id: string;
  sentAt: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  error?: string;
}

export interface CommunicationLogFilters {
  userId?: string;
  eventId?: string;
  groupId?: string;
  adminId?: string;
  type?: string;
  channel?: string;
  purpose?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export class CommunicationLogService {
  static async create(data: CommunicationLogData): Promise<CommunicationLog> {
    const log = await prisma.communicationLog.create({
      data: {
        ...data,
        status: data.status || 'pending',
        recipientIds: data.recipientIds || [],
        metadata: data.metadata || {},
      },
    });

    return log as CommunicationLog;
  }

  static async findById(id: string): Promise<CommunicationLog | null> {
    const log = await prisma.communicationLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            profile: true,
          },
        },
        event: {
          select: {
            id: true,
            name: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
          },
        },
        admin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return log as CommunicationLog | null;
  }

  static async findByUserId(
    userId: string,
    pagination: Pagination,
    filters: CommunicationLogFilters = {}
  ): Promise<PaginatedResponse<CommunicationLog>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {
      userId,
      ...(filters.eventId && { eventId: filters.eventId }),
      ...(filters.groupId && { groupId: filters.groupId }),
      ...(filters.type && { type: filters.type }),
      ...(filters.channel && { channel: filters.channel }),
      ...(filters.purpose && { purpose: filters.purpose }),
      ...(filters.status && { status: filters.status }),
      ...(filters.dateFrom && {
        sentAt: {
          gte: filters.dateFrom,
        },
      }),
      ...(filters.dateTo && {
        sentAt: {
          lte: filters.dateTo,
        },
      }),
    };

    const [logs, total] = await prisma.$transaction([
      prisma.communicationLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sentAt: 'desc' },
        include: {
          event: {
            select: {
              id: true,
              name: true,
            },
          },
          group: {
            select: {
              id: true,
              name: true,
            },
          },
          admin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.communicationLog.count({ where }),
    ]);

    return {
      items: logs as CommunicationLog[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async findByEventId(
    eventId: string,
    pagination: Pagination,
    filters: CommunicationLogFilters = {}
  ): Promise<PaginatedResponse<CommunicationLog>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {
      eventId,
      ...(filters.groupId && { groupId: filters.groupId }),
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.type && { type: filters.type }),
      ...(filters.channel && { channel: filters.channel }),
      ...(filters.purpose && { purpose: filters.purpose }),
      ...(filters.status && { status: filters.status }),
    };

    const [logs, total] = await prisma.$transaction([
      prisma.communicationLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sentAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              profile: true,
            },
          },
          group: {
            select: {
              id: true,
              name: true,
            },
          },
          admin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.communicationLog.count({ where }),
    ]);

    return {
      items: logs as CommunicationLog[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async updateStatus(
    id: string,
    status: 'sent' | 'delivered' | 'failed',
    error?: string,
    metadata?: Record<string, any>
  ): Promise<CommunicationLog> {
    const updateData: any = {
      status,
      ...(status === 'delivered' && { deliveredAt: new Date() }),
      ...(status === 'failed' && { failedAt: new Date(), error }),
      ...(metadata && { metadata }),
    };

    const log = await prisma.communicationLog.update({
      where: { id },
      data: updateData,
    });

    return log as CommunicationLog;
  }

  static async getGroupNotificationStats(groupId: string): Promise<{
    total: number;
    notified: number;
    notNotified: number;
    notificationRate: number;
  }> {
    const [total, notified] = await prisma.$transaction([
      prisma.user.count({
        where: {
          groupIds: {
            has: groupId
          },
          assigned: true,
          active: true,
        },
      }),
      prisma.user.count({
        where: {
          groupIds: {
            has: groupId
          },
          assigned: true,
          active: true,
          groupAssignmentNotified: true,
        },
      }),
    ]);

    return {
      total,
      notified,
      notNotified: total - notified,
      notificationRate: total > 0 ? Math.round((notified / total) * 100) : 0,
    };
  }

  static async logGroupAssignmentNotification(
    userIds: string[],
    groupId: string,
    eventId: string,
    adminId: string,
    channel: 'email' | 'whatsapp',
    content: any
  ): Promise<CommunicationLog[]> {
    const logs = await Promise.all(
      userIds.map(userId =>
        this.create({
          userId,
          eventId,
          groupId,
          adminId,
          type: channel,
          channel,
          purpose: 'group_assignment',
          subject: 'Group Assignment Notification',
          content,
          recipientType: userIds.length > 1 ? 'group' : 'single',
          recipientIds: userIds,
          status: 'sent',
        })
      )
    );

    // Update users as notified
    await prisma.user.updateMany({
      where: {
        id: { in: userIds },
      },
      data: {
        groupAssignmentNotified: true,
        groupAssignmentNotifiedAt: new Date(),
      },
    });

    return logs;
  }

  // GET DETAILED COMMUNICATION LOG WITH ALL RECIPIENTS
  static async getCommunicationDetail(logId: string): Promise<{
    log: CommunicationLog & {
      event: { id: string; name: string };
      group?: { id: string; name: string };
      admin: { id: string; firstName: string; lastName: string; email: string };
    };
    recipients: {
      userId: string;
      email: string;
      firstName: string;
      lastName: string;
      groupName?: string;
      status: 'sent' | 'delivered' | 'failed' | 'pending';
      sentAt?: Date;
      openedAt?: Date;
      error?: string;
      trackingEnabled?: boolean;
    }[];
    summary: {
      totalRecipients: number;
      sentCount: number;
      deliveredCount: number;
      failedCount: number;
      openedCount: number;
      groups: string[];
    };
  } | null> {
    // Get the main communication log
    const log = await prisma.communicationLog.findUnique({
      where: { id: logId },
      include: {
        event: {
          select: { id: true, name: true },
        },
        group: {
          select: { id: true, name: true },
        },
        admin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!log) return null;

    // Get all recipients based on recipientIds and recipientType
    let recipients: any[] = [];
    const recipientDetails: any[] = [];

    if (log.recipientType === 'single') {
      // Single recipient - get the user details
      if (log.recipientIds.length > 0) {
        recipients = await prisma.user.findMany({
          where: { id: { in: log.recipientIds } },
          select: {
            id: true,
            profile: true,
            groupId: true,
            group: {
              select: { name: true },
            },
          },
        });
      }
    } else if (log.recipientType === 'group') {
      // Group recipients - get all users from those groups
      if (log.recipientIds.length > 0) {
        const groups = await prisma.group.findMany({
          where: { id: { in: log.recipientIds } },
          include: {
            users: {
              select: {
                id: true,
                profile: true,
                groupId: true,
                group: {
                  select: { name: true },
                },
              },
            },
          },
        });

        // Flatten all users from all groups
        recipients = groups.flatMap(group => group.users);
      }
    } else if (log.recipientType === 'event') {
      // All event users
      recipients = await prisma.user.findMany({
        where: { eventId: log.eventId },
        select: {
          id: true,
          profile: true,
          groupId: true,
          group: {
            select: { name: true },
          },
        },
      });
    }

    // Get corresponding Message record to check deliveries and email tracking
    const relatedMessages = await prisma.message.findMany({
      where: {
        eventId: log.eventId,
        sentBy: log.adminId,
        createdAt: {
          gte: new Date(new Date(log.sentAt).getTime() - 60000), // Within 1 minute
          lte: new Date(new Date(log.sentAt).getTime() + 60000),
        },
      },
      include: {
        emailTracking: true,
      },
    });

    // Build recipient details with delivery status
    const groups = new Set<string>();
    let sentCount = 0, deliveredCount = 0, failedCount = 0, openedCount = 0;

    for (const recipient of recipients) {
      if (!recipient.profile?.email) continue;

      const profile = recipient.profile as any;
      const groupName = recipient.group?.name;
      if (groupName) groups.add(groupName);

      // Find delivery status in messages
      let status: 'sent' | 'delivered' | 'failed' | 'pending' = 'pending';
      let sentAt: Date | undefined;
      let openedAt: Date | undefined;
      let error: string | undefined;
      let trackingEnabled = false;

      // Check message deliveries
      const messageDelivery = relatedMessages
        .flatMap(msg => (msg.deliveries as any[]) || [])
        .find(d => d.user === recipient.id);

      if (messageDelivery?.email) {
        status = messageDelivery.email.sent ? 'sent' : 'failed';
        sentAt = messageDelivery.email.sentAt ? new Date(messageDelivery.email.sentAt) : undefined;
        error = messageDelivery.email.error;

        if (status === 'sent') sentCount++;
        else if (status === 'failed') failedCount++;
      }

      // Check email tracking for opens
      const tracking = relatedMessages
        .flatMap(msg => msg.emailTracking)
        .find(t => t.userId === recipient.id);

      if (tracking) {
        trackingEnabled = true;
        if (tracking.opened) {
          openedAt = tracking.openedAt || undefined;
          openedCount++;
        }
      }

      recipientDetails.push({
        userId: recipient.id,
        email: profile.email,
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        groupName,
        status,
        sentAt,
        openedAt,
        error,
        trackingEnabled,
      });
    }

    return {
      log: log as any,
      recipients: recipientDetails,
      summary: {
        totalRecipients: recipientDetails.length,
        sentCount,
        deliveredCount,
        failedCount,
        openedCount,
        groups: Array.from(groups),
      },
    };
  }
}