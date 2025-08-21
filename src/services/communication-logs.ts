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
          groupId,
          assigned: true,
          active: true,
        },
      }),
      prisma.user.count({
        where: {
          groupId,
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
}