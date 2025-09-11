import { prisma } from '../config/database.js';
import type {
  CreateActivity,
  UpdateActivity,
  Pagination,
  PaginatedResponse,
} from '../types/index.js';
import type { Activity } from '@prisma/client';
import { AdminService } from './admins.js';
import { AuditTrailService } from './audit-trail.js';
import { ConflictDetectionService } from './conflict-detection.js';

export class ActivityService {
  static async create(data: CreateActivity, performedBy?: string): Promise<Activity> {
    // Fetch event to validate dates and timezone
    const event = await prisma.event.findUnique({
      where: { id: data.eventId },
      select: {
        dateRange: true,
        location: true,
      },
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
      throw new Error(
        `Activity start date must be within event dates (${eventStart.toISOString()} - ${eventEnd.toISOString()})`
      );
    }

    if (activityEnd < eventStart || activityEnd > eventEnd) {
      throw new Error(
        `Activity end date must be within event dates (${eventStart.toISOString()} - ${eventEnd.toISOString()})`
      );
    }

    if (activityStart >= activityEnd) {
      throw new Error('Activity start date must be before end date');
    }

    // Check for conflicts if activity is assigned to groups and has capacity limit, and conflicts are not allowed
    if (data.groupIds && data.groupIds.length > 0 && data.capacity && !data.allowConflicts) {
      const validation = await ConflictDetectionService.validateNewActivityCapacity(
        data.groupIds,
        data.capacity,
        data.title
      );
      
      if (validation.hasConflicts) {
        const conflictDetails = validation.issues.map(issue => 
          `Groups have ${issue.affectedUserCount + issue.capacity} total members but activity capacity is only ${issue.capacity}`
        ).join(', ');
        throw new Error(`Capacity conflict: ${conflictDetails}`);
      }
    }

    // Store dates in UTC (they should already be converted by the frontend)
    const activity = await prisma.activity.create({
      data: {
        eventId: data.eventId,
        groupIds: data.groupIds || [], // Array of group IDs
        title: data.title,
        description: data.description,
        startDateTime: activityStart, // Store in UTC
        endDateTime: activityEnd, // Store in UTC
        thumbnail: data.thumbnail,
        category: data.category,
        location: data.location,
        content: data.content,
        capacity: data.capacity, // Optional capacity limit
        timingTable: data.timingTable || [], // Structured timing details
        createdBy: data.createdBy,
        lastModifiedBy: data.createdBy,
        lastModifiedAt: new Date(),
      },
    });

    // Calculate initial attendee count
    if (data.groupIds?.length > 0) {
      await ConflictDetectionService.updateActivityAttendeeCount(activity.id);
    }

    // Log audit trail
    if (performedBy) {
      await AuditTrailService.logCreate(
        'Activity',
        activity.id,
        {
          title: data.title,
          eventId: data.eventId,
          groupIds: data.groupIds,
          capacity: data.capacity,
        },
        performedBy,
        data.eventId
      );
    }

    return activity;
  }

  static async findById(id: string): Promise<Activity | null> {
    return prisma.activity.findUnique({
      where: { id, deleted: false },
      include: {
        event: {
          select: { id: true, name: true, shortName: true },
        },
        groups: {
          select: { id: true, name: true, memberCount: true },
        },
        createdByAdmin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        lastModifiedByAdmin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  // Check if admin can modify this activity
  static async canAdminModifyActivity(
    activityId: string,
    adminId: string
  ): Promise<{ canModify: boolean; reason?: string }> {
    const activity = await prisma.activity.findUnique({
      where: { id: activityId, deleted: false },
      select: { createdBy: true },
    });

    if (!activity) {
      return { canModify: false, reason: 'Activity not found' };
    }

    const admin = await AdminService.findById(adminId);
    if (!admin) {
      return { canModify: false, reason: 'Admin not found' };
    }

    // Super admins can modify any activity
    if (admin.role === 'SUPER') {
      return { canModify: true };
    }

    // Regular admins can only modify activities they created
    if (activity.createdBy === adminId) {
      return { canModify: true };
    }

    return {
      canModify: false,
      reason:
        'You can only modify activities that you created. Contact a super admin if you need to modify this activity.',
    };
  }

  static async assignToGroup(
    activityId: string,
    groupId: string,
    adminId: string
  ): Promise<Activity> {
    // Check if activity exists and admin has permission
    const activity = await prisma.activity.findUnique({
      where: { id: activityId, deleted: false },
      select: { id: true, groupIds: true, eventId: true, title: true },
    });

    if (!activity) {
      throw new Error('Activity not found');
    }

    if (activity.groupIds?.includes(groupId)) {
      throw new Error('Activity is already assigned to this group');
    }

    // Verify group exists and belongs to same event
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { eventId: true, active: true, deleted: true },
    });

    if (!group || group.deleted || !group.active) {
      throw new Error('Group not found or inactive');
    }

    if (group.eventId !== activity.eventId) {
      throw new Error('Activity and group must belong to the same event');
    }

    // Add group to activity's groupIds array
    const updatedGroupIds = [...(activity.groupIds || []), groupId];

    return await prisma.activity.update({
      where: { id: activityId },
      data: {
        groupIds: updatedGroupIds,
        lastModifiedBy: adminId,
        updatedAt: new Date(),
      },
    });
  }

  static async unassignFromGroup(
    activityId: string,
    adminId: string
  ): Promise<Activity> {
    const activity = await prisma.activity.findUnique({
      where: { id: activityId, deleted: false },
      select: { id: true, groupIds: true, title: true },
    });

    if (!activity) {
      throw new Error('Activity not found');
    }

    if (!activity.groupIds || activity.groupIds.length === 0) {
      throw new Error('Activity is not assigned to any groups');
    }

    // Clear all group assignments
    return await prisma.activity.update({
      where: { id: activityId },
      data: {
        groupIds: [],
        lastModifiedBy: adminId,
        updatedAt: new Date(),
      },
    });
  }

  // New method: Remove from specific group
  static async removeFromGroup(
    activityId: string,
    groupId: string,
    adminId: string
  ): Promise<Activity> {
    const activity = await prisma.activity.findUnique({
      where: { id: activityId, deleted: false },
      select: { id: true, groupIds: true, eventId: true, title: true },
    });

    if (!activity) {
      throw new Error('Activity not found');
    }

    if (!activity.groupIds?.includes(groupId)) {
      throw new Error('Activity is not assigned to this group');
    }

    // Remove specific group from groupIds array
    const updatedGroupIds = activity.groupIds.filter((id) => id !== groupId);

    return await prisma.activity.update({
      where: { id: activityId },
      data: {
        groupIds: updatedGroupIds,
        lastModifiedBy: adminId,
        updatedAt: new Date(),
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
      groupIds: { has: groupId }, // MongoDB array contains check
      deleted: false,
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
      where.OR = [{ title: { contains: filters.search, mode: 'insensitive' } }];
    }

    const [items, total] = await prisma.$transaction([
      prisma.activity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDateTime: 'asc' },
        include: {
          groups: {
            select: { id: true, name: true },
          },
          createdByAdmin: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          lastModifiedByAdmin: {
            select: { id: true, firstName: true, lastName: true, email: true },
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

  static async findByMultipleGroupIds(
    groupIds: string[],
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
      groupIds: { hasSome: groupIds }, // MongoDB array intersection check
      deleted: false,
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
      where.OR = [{ title: { contains: filters.search, mode: 'insensitive' } }];
    }

    const [items, total] = await prisma.$transaction([
      prisma.activity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDateTime: 'asc' },
        include: {
          groups: {
            select: { id: true, name: true },
          },
          createdByAdmin: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          lastModifiedByAdmin: {
            select: { id: true, firstName: true, lastName: true, email: true },
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
      deleted: false,
    };

    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.groupId) {
      where.groupIds = { has: filters.groupId }; // MongoDB array contains
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
      where.OR = [{ title: { contains: filters.search, mode: 'insensitive' } }];
    }

    const [items, total] = await prisma.$transaction([
      prisma.activity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDateTime: 'asc' },
        include: {
          groups: {
            select: { id: true, name: true },
          },
          createdByAdmin: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          lastModifiedByAdmin: {
            select: { id: true, firstName: true, lastName: true, email: true },
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
        },
      });

      if (!currentActivity) {
        throw new Error('Activity not found');
      }

      // Get event for validation
      const event = await prisma.event.findUnique({
        where: { id: currentActivity.eventId },
        select: {
          dateRange: true,
        },
      });

      if (!event || !event.dateRange) {
        throw new Error('Event or event date range not found');
      }

      // Use updated dates or current dates
      const activityStart = data.startDateTime
        ? new Date(data.startDateTime)
        : new Date(currentActivity.startDateTime);
      const activityEnd = data.endDateTime
        ? new Date(data.endDateTime)
        : new Date(currentActivity.endDateTime);

      const eventStart = new Date(event.dateRange.start);
      const eventEnd = new Date(event.dateRange.end);

      // Validate dates are within event range
      if (activityStart < eventStart || activityStart > eventEnd) {
        throw new Error(
          `Activity start date must be within event dates (${eventStart.toISOString()} - ${eventEnd.toISOString()})`
        );
      }

      if (activityEnd < eventStart || activityEnd > eventEnd) {
        throw new Error(
          `Activity end date must be within event dates (${eventStart.toISOString()} - ${eventEnd.toISOString()})`
        );
      }

      if (activityStart >= activityEnd) {
        throw new Error('Activity start date must be before end date');
      }
    }

    // Check for capacity conflicts if updating capacity or group assignments
    if ((data.capacity !== undefined) || (data.groupIds !== undefined)) {
      // Get current activity data to determine final state
      const currentActivity = await prisma.activity.findUnique({
        where: { id },
        select: { capacity: true, groupIds: true, title: true },
      });

      if (!currentActivity) {
        throw new Error('Activity not found');
      }

      const finalCapacity = data.capacity !== undefined ? data.capacity : currentActivity.capacity;
      const finalGroupIds = data.groupIds !== undefined ? data.groupIds : currentActivity.groupIds;

      // Only validate if there's a capacity limit and groups are assigned, and conflicts are not allowed
      if (finalCapacity && finalGroupIds && finalGroupIds.length > 0 && !data.allowConflicts) {
        const validation = await ConflictDetectionService.validateNewActivityCapacity(
          finalGroupIds,
          finalCapacity,
          currentActivity.title
        );
        
        if (validation.hasConflicts) {
          const conflictDetails = validation.issues.map(issue => 
            `Groups have ${issue.affectedUserCount + issue.capacity} total members but activity capacity is only ${issue.capacity}`
          ).join(', ');
          throw new Error(`Capacity conflict: ${conflictDetails}`);
        }
      }
    }

    const updateData: any = {
      lastModifiedBy: data.lastModifiedBy,
    };

    if (data.title) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.startDateTime)
      updateData.startDateTime = new Date(data.startDateTime); // Ensure UTC
    if (data.endDateTime) updateData.endDateTime = new Date(data.endDateTime); // Ensure UTC
    if (data.thumbnail !== undefined) updateData.thumbnail = data.thumbnail;
    if (data.category) updateData.category = data.category;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.content) updateData.content = data.content;
    if (data.groupIds !== undefined) updateData.groupIds = data.groupIds; // Handle group assignments
    if (data.capacity !== undefined) updateData.capacity = data.capacity; // Handle capacity updates
    if (data.timingTable !== undefined) updateData.timingTable = data.timingTable; // Handle timing updates
    
    // Always update modification timestamp and user
    updateData.lastModifiedAt = new Date();

    const updatedActivity = await prisma.activity.update({
      where: { id },
      data: updateData,
    });

    // Recalculate attendee count if group assignments changed
    if (data.groupIds !== undefined) {
      await ConflictDetectionService.updateActivityAttendeeCount(id);
    }

    return updatedActivity;
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
      groupIds: { has: groupId }, // MongoDB array contains check
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
        description: true,
        startDateTime: true,
        endDateTime: true,
        category: true,
        thumbnail: true,
        location: true,
        content: true,
        createdBy: true,
        lastModifiedBy: true,
      },
    });

    // Group activities by date for better timeline presentation
    const timeline: Record<string, typeof activities> = {};

    activities.forEach((activity) => {
      const date = activity.startDateTime.toISOString().split('T')[0];
      if (!timeline[date]) {
        timeline[date] = [];
      }
      timeline[date].push(activity);
    });

    return timeline;
  }

  // Get timeline for a specific user with exclusions filtered out
  static async getUserTimeline(
    userId: string,
    filters: {
      dateFrom?: Date;
      dateTo?: Date;
    } = {}
  ) {
    // Use the new multi-group timeline method for backward compatibility
    return this.getUserMultiGroupTimeline(userId, filters);
  }

  // Keep old method as legacy (hidden implementation)
  static async getUserTimelineLegacy(
    userId: string,
    filters: {
      dateFrom?: Date;
      dateTo?: Date;
    } = {}
  ) {
    // First get the user's groups (updated for multi-group)
    const user = await prisma.user.findUnique({
      where: { id: userId, active: true, assigned: true },
      select: { groupIds: true, eventId: true },
    });

    if (!user || user.groupIds.length === 0) {
      throw new Error('User not found or not assigned to any groups');
    }

    // Get all activities for all groups
    const where: any = {
      groupIds: { hasSome: user.groupIds }, // MongoDB array intersection check
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
        description: true,
        startDateTime: true,
        endDateTime: true,
        category: true,
        thumbnail: true,
        location: true,
        content: true,
        createdBy: true,
        lastModifiedBy: true,
      },
    });

    // Get user's exclusions for this group
    const exclusions = await prisma.userActivityExclusion.findMany({
      where: { userId, groupId: user.groupId },
      select: { activityId: true },
    });

    const excludedActivityIds = new Set(exclusions.map((e) => e.activityId));

    // Filter out excluded activities
    const filteredActivities = activities.filter(
      (activity) => !excludedActivityIds.has(activity.id)
    );

    // Group activities by date for better timeline presentation
    const timeline: Record<string, typeof filteredActivities> = {};

    filteredActivities.forEach((activity) => {
      const date = activity.startDateTime.toISOString().split('T')[0];
      if (!timeline[date]) {
        timeline[date] = [];
      }
      timeline[date].push(activity);
    });

    return timeline;
  }

  static async duplicate(
    id: string,
    adminId: string,
    newTitle?: string
  ): Promise<Activity> {
    const original = await prisma.activity.findUnique({
      where: { id, deleted: false },
    });

    if (!original) {
      throw new Error('Activity not found');
    }

    return prisma.activity.create({
      data: {
        eventId: original.eventId,
        groupIds: original.groupIds || [], // Copy group assignments
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

  static async getUpcomingActivities(groupId: string, limit: number = 5) {
    const now = new Date();

    return prisma.activity.findMany({
      where: {
        groupIds: { has: groupId }, // MongoDB array contains check
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
        createdBy: true,
        lastModifiedBy: true,
      },
    });
  }

  // ============================================================================
  // Enhanced Multi-Group and Capacity Methods
  // ============================================================================

  /**
   * Get activities with capacity monitoring for specific groups
   */
  static async getActivitiesWithCapacity(groupIds: string[], pagination: Pagination): Promise<PaginatedResponse<any>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where: {
          groupIds: { hasSome: groupIds },
          active: true,
          deleted: false,
        },
        orderBy: { startDateTime: 'asc' },
        skip,
        take: limit,
      }),
      prisma.activity.count({
        where: {
          groupIds: { hasSome: groupIds },
          active: true,
          deleted: false,
        },
      }),
    ]);

    // Add capacity analysis to each activity
    const activitiesWithCapacity = await Promise.all(
      activities.map(async (activity) => {
        const capacityStatus = await ConflictDetectionService.getActivityCapacityStatus(activity.id);
        return {
          ...activity,
          capacityStatus,
        };
      })
    );

    return {
      items: activitiesWithCapacity,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user timeline merging activities from all assigned groups
   */
  static async getUserMultiGroupTimeline(
    userId: string,
    filters: { dateFrom?: Date; dateTo?: Date } = {}
  ): Promise<Record<string, any[]>> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { groupIds: true, eventId: true },
    });

    if (!user || user.groupIds.length === 0) {
      return {};
    }

    // Get activities from all assigned groups
    const whereClause: any = {
      groupIds: { hasSome: user.groupIds },
      active: true,
      deleted: false,
    };

    if (filters.dateFrom) {
      whereClause.startDateTime = { ...whereClause.startDateTime, gte: filters.dateFrom };
    }
    if (filters.dateTo) {
      whereClause.endDateTime = { ...whereClause.endDateTime, lte: filters.dateTo };
    }

    const activities = await prisma.activity.findMany({
      where: whereClause,
      orderBy: { startDateTime: 'asc' },
      include: {
        userExclusions: {
          where: { userId },
        },
      },
    });

    // Filter out excluded activities
    const availableActivities = activities.filter(
      activity => activity.userExclusions.length === 0
    );

    // Add group context and conflict analysis
    const enrichedActivities = await Promise.all(
      availableActivities.map(async (activity) => {
        // Get groups for this activity
        const activityGroups = await prisma.group.findMany({
          where: { id: { in: activity.groupIds } },
          select: { id: true, name: true },
        });

        // Get capacity status
        const capacityStatus = await ConflictDetectionService.getActivityCapacityStatus(activity.id);

        return {
          ...activity,
          groups: activityGroups,
          userGroups: activityGroups.filter(g => user.groupIds.includes(g.id)), // Groups this user is in
          capacityStatus,
        };
      })
    );

    // Group by date for timeline display
    const timeline: Record<string, any[]> = {};
    enrichedActivities.forEach(activity => {
      const dateKey = activity.startDateTime.toISOString().split('T')[0];
      if (!timeline[dateKey]) {
        timeline[dateKey] = [];
      }
      timeline[dateKey].push(activity);
    });

    return timeline;
  }

  /**
   * Get capacity warnings for specific activities
   */
  static async getCapacityWarnings(activityIds: string[]): Promise<any[]> {
    const warnings = [];
    
    for (const activityId of activityIds) {
      const status = await ConflictDetectionService.getActivityCapacityStatus(activityId);
      if (status && (status.status === 'warning' || status.status === 'full' || status.status === 'exceeded')) {
        warnings.push({
          activityId,
          ...status,
        });
      }
    }

    return warnings;
  }

  /**
   * Bulk update activity capacity settings
   */
  static async updateCapacitySettings(
    updates: Array<{
      id: string;
      capacity?: number | null;
      timingTable?: any[];
    }>,
    performedBy?: string
  ): Promise<void> {
    await Promise.all(
      updates.map(async (update) => {
        const currentActivity = await prisma.activity.findUnique({
          where: { id: update.id },
        });

        if (!currentActivity) return;

        const updateData: any = {
          lastModifiedBy: performedBy,
          lastModifiedAt: new Date(),
        };

        if (update.capacity !== undefined) updateData.capacity = update.capacity;
        if (update.timingTable !== undefined) updateData.timingTable = update.timingTable;

        await prisma.activity.update({
          where: { id: update.id },
          data: updateData,
        });

        // Recalculate attendee count
        await ConflictDetectionService.updateActivityAttendeeCount(update.id);

        // Log audit trail
        if (performedBy) {
          const changedFields = [];
          if (update.capacity !== undefined) changedFields.push('capacity');
          if (update.timingTable !== undefined) changedFields.push('timingTable');

          if (changedFields.length > 0) {
            await AuditTrailService.logUpdate(
              'Activity',
              update.id,
              currentActivity,
              { ...currentActivity, ...updateData },
              changedFields,
              performedBy,
              currentActivity.eventId
            );
          }
        }
      })
    );
  }
}
