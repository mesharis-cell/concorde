import { prisma } from '../config/database.js';
import type { CreateActivity, UpdateActivity, Pagination, PaginatedResponse } from '../types/index.js';
import type { Activity } from '@prisma/client';

export class ActivityService {
  static async create(data: CreateActivity): Promise<Activity> {
    // Fetch event to validate dates and timezone
    const event = await prisma.event.findUnique({
      where: { id: data.eventId },
      select: {
        dateRange: true,
        location: true
      }
    });

    if (!event) {
      throw new Error('Event not found');
    }

    if (!event.dateRange) {
      throw new Error('Event date range not configured');
    }

    // Convert activity dates to UTC for comparison
    const activityStart = new Date(data.startDateTime);
    const activityEnd = new Date(data.endDateTime);
    
    // Event dates should already be in UTC in the database
    const eventStart = new Date(event.dateRange.start);
    const eventEnd = new Date(event.dateRange.end);

    // Validate activity dates are within event dates
    if (activityStart < eventStart || activityStart > eventEnd) {
      throw new Error(`Activity start date must be within event dates (${eventStart.toISOString()} - ${eventEnd.toISOString()})`);
    }

    if (activityEnd < eventStart || activityEnd > eventEnd) {
      throw new Error(`Activity end date must be within event dates (${eventStart.toISOString()} - ${eventEnd.toISOString()})`);
    }

    if (activityStart >= activityEnd) {
      throw new Error('Activity start date must be before end date');
    }

    // Store dates in UTC (they should already be converted by the frontend)
    return prisma.activity.create({
      data: {
        eventId: data.eventId,
        groupId: data.groupId,
        title: data.title,
        startDateTime: activityStart, // Store in UTC
        endDateTime: activityEnd, // Store in UTC
        thumbnail: data.thumbnail,
        category: data.category,
        location: data.location,
        content: data.content,
        createdBy: data.createdBy,
        lastModifiedBy: data.createdBy,
      }
    });
  }

  static async findById(id: string): Promise<Activity | null> {
    return prisma.activity.findUnique({
      where: { id, deleted: false },
      include: {
        event: {
          select: { id: true, name: true, shortName: true },
        },
        group: {
          select: { id: true, name: true, memberCount: true },
        },
      },
    });
  }

  static async findByGroupId(
    groupId: string,
    pagination: Pagination,
    filters: {
      active?: boolean;
      category?: string;
      dateFrom?: Date;
      dateTo?: Date;
      search?: string;
    } = {}
  ): Promise<PaginatedResponse<Activity>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { 
      groupId, 
      deleted: false 
    };
    
    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.startDateTime = {};
      if (filters.dateFrom) {
        where.startDateTime.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.startDateTime.lte = filters.dateTo;
      }
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await prisma.$transaction([
      prisma.activity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDateTime: 'asc' },
        include: {
          group: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.activity.count({ where }),
    ]);

    return {
      items,
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
    filters: {
      active?: boolean;
      category?: string;
      groupId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      search?: string;
    } = {}
  ): Promise<PaginatedResponse<Activity>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { 
      eventId, 
      deleted: false 
    };
    
    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.groupId) {
      where.groupId = filters.groupId;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.startDateTime = {};
      if (filters.dateFrom) {
        where.startDateTime.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.startDateTime.lte = filters.dateTo;
      }
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await prisma.$transaction([
      prisma.activity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDateTime: 'asc' },
        include: {
          group: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.activity.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async update(id: string, data: UpdateActivity): Promise<Activity> {
    // If updating dates, validate against event dates
    if (data.startDateTime || data.endDateTime) {
      // Get current activity to get eventId and current dates
      const currentActivity = await prisma.activity.findUnique({
        where: { id },
        select: {
          eventId: true,
          startDateTime: true,
          endDateTime: true,
        }
      });

      if (!currentActivity) {
        throw new Error('Activity not found');
      }

      // Get event for validation
      const event = await prisma.event.findUnique({
        where: { id: currentActivity.eventId },
        select: {
          dateRange: true,
        }
      });

      if (!event || !event.dateRange) {
        throw new Error('Event or event date range not found');
      }

      // Use updated dates or current dates
      const activityStart = data.startDateTime ? new Date(data.startDateTime) : new Date(currentActivity.startDateTime);
      const activityEnd = data.endDateTime ? new Date(data.endDateTime) : new Date(currentActivity.endDateTime);
      
      const eventStart = new Date(event.dateRange.start);
      const eventEnd = new Date(event.dateRange.end);

      // Validate dates are within event range
      if (activityStart < eventStart || activityStart > eventEnd) {
        throw new Error(`Activity start date must be within event dates (${eventStart.toISOString()} - ${eventEnd.toISOString()})`);
      }

      if (activityEnd < eventStart || activityEnd > eventEnd) {
        throw new Error(`Activity end date must be within event dates (${eventStart.toISOString()} - ${eventEnd.toISOString()})`);
      }

      if (activityStart >= activityEnd) {
        throw new Error('Activity start date must be before end date');
      }
    }

    const updateData: any = {
      lastModifiedBy: data.lastModifiedBy,
    };

    if (data.title) updateData.title = data.title;
    if (data.startDateTime) updateData.startDateTime = new Date(data.startDateTime); // Ensure UTC
    if (data.endDateTime) updateData.endDateTime = new Date(data.endDateTime); // Ensure UTC
    if (data.thumbnail !== undefined) updateData.thumbnail = data.thumbnail;
    if (data.category) updateData.category = data.category;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.content) updateData.content = data.content;

    return prisma.activity.update({
      where: { id },
      data: updateData,
    });
  }

  static async deactivate(id: string, adminId: string): Promise<Activity> {
    return prisma.activity.update({
      where: { id },
      data: { 
        active: false,
        lastModifiedBy: adminId,
      },
    });
  }

  static async activate(id: string, adminId: string): Promise<Activity> {
    return prisma.activity.update({
      where: { id },
      data: { 
        active: true,
        lastModifiedBy: adminId,
      },
    });
  }

  static async softDelete(id: string, adminId: string): Promise<Activity> {
    return prisma.activity.update({
      where: { id },
      data: { 
        deleted: true,
        deletedAt: new Date(),
        active: false,
        lastModifiedBy: adminId,
      },
    });
  }

  static async getTimeline(
    groupId: string,
    filters: {
      dateFrom?: Date;
      dateTo?: Date;
    } = {}
  ) {
    const where: any = { 
      groupId, 
      deleted: false,
      active: true,
    };

    if (filters.dateFrom || filters.dateTo) {
      where.startDateTime = {};
      if (filters.dateFrom) {
        where.startDateTime.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.startDateTime.lte = filters.dateTo;
      }
    }

    const activities = await prisma.activity.findMany({
      where,
      orderBy: { startDateTime: 'asc' },
      select: {
        id: true,
        title: true,
        startDateTime: true,
        endDateTime: true,
        category: true,
        thumbnail: true,
        location: true,
        content: true,
      },
    });

    // Group activities by date for better timeline presentation
    const timeline: Record<string, typeof activities> = {};
    
    activities.forEach(activity => {
      const date = activity.startDateTime.toISOString().split('T')[0];
      if (!timeline[date]) {
        timeline[date] = [];
      }
      timeline[date].push(activity);
    });

    return timeline;
  }

  static async duplicate(id: string, adminId: string, newTitle?: string): Promise<Activity> {
    const original = await prisma.activity.findUnique({
      where: { id, deleted: false },
    });

    if (!original) {
      throw new Error('Activity not found');
    }

    return prisma.activity.create({
      data: {
        eventId: original.eventId,
        groupId: original.groupId,
        title: newTitle || `${original.title} (Copy)`,
        startDateTime: original.startDateTime,
        endDateTime: original.endDateTime,
        thumbnail: original.thumbnail,
        category: original.category,
        location: original.location,
        content: original.content,
        createdBy: adminId,
        lastModifiedBy: adminId,
      },
    });
  }

  static async getUpcomingActivities(
    groupId: string,
    limit: number = 5
  ) {
    const now = new Date();
    
    return prisma.activity.findMany({
      where: {
        groupId,
        deleted: false,
        active: true,
        startDateTime: {
          gte: now,
        },
      },
      orderBy: { startDateTime: 'asc' },
      take: limit,
      select: {
        id: true,
        title: true,
        startDateTime: true,
        endDateTime: true,
        category: true,
        thumbnail: true,
        location: true,
      },
    });
  }
}