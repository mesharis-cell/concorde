import { prisma } from '../config/database.js';
import type { UserActivityExclusion } from '@prisma/client';

export interface CreateExclusion {
  userId: string;
  activityId: string;
  groupId: string;
  eventId: string;
  excludedBy: string;
  reason?: string;
}

export class UserActivityExclusionService {
  static async excludeUserFromActivity(data: CreateExclusion): Promise<UserActivityExclusion> {
    // Validate that user is in the group and activity belongs to same group
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { groupId: true, eventId: true, assigned: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.assigned || user.groupId !== data.groupId) {
      throw new Error('User must be assigned to the same group as the activity');
    }

    if (user.eventId !== data.eventId) {
      throw new Error('User and activity must belong to the same event');
    }

    // Validate activity exists and belongs to the same group/event
    const activity = await prisma.activity.findUnique({
      where: { id: data.activityId },
      select: { groupId: true, eventId: true, deleted: true, active: true },
    });

    if (!activity || activity.deleted || !activity.active) {
      throw new Error('Activity not found or inactive');
    }

    if (activity.groupId !== data.groupId) {
      throw new Error('Activity must belong to the same group as the user');
    }

    if (activity.eventId !== data.eventId) {
      throw new Error('Activity and user must belong to the same event');
    }

    // Check if exclusion already exists
    const existing = await prisma.userActivityExclusion.findUnique({
      where: {
        userId_activityId: {
          userId: data.userId,
          activityId: data.activityId,
        },
      },
    });

    if (existing) {
      throw new Error('User is already excluded from this activity');
    }

    // Create exclusion
    return await prisma.userActivityExclusion.create({
      data: {
        userId: data.userId,
        activityId: data.activityId,
        groupId: data.groupId,
        eventId: data.eventId,
        excludedBy: data.excludedBy,
        reason: data.reason,
      },
    });
  }

  static async includeUserInActivity(userId: string, activityId: string): Promise<void> {
    const exclusion = await prisma.userActivityExclusion.findUnique({
      where: {
        userId_activityId: {
          userId,
          activityId,
        },
      },
    });

    if (!exclusion) {
      throw new Error('User is not excluded from this activity');
    }

    await prisma.userActivityExclusion.delete({
      where: {
        userId_activityId: {
          userId,
          activityId,
        },
      },
    });
  }

  static async getUserExclusions(userId: string): Promise<UserActivityExclusion[]> {
    return await prisma.userActivityExclusion.findMany({
      where: { userId },
      include: {
        activity: {
          select: {
            id: true,
            title: true,
            startDateTime: true,
            endDateTime: true,
            category: true,
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
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getGroupUserExclusions(groupId: string): Promise<
    Array<{
      userId: string;
      user: { id: string; profile: any; firstName?: string; lastName?: string };
      exclusions: Array<{
        activityId: string;
        activity: { id: string; title: string; startDateTime: Date; endDateTime: Date };
        reason?: string;
        excludedBy: string;
        admin: { firstName: string; lastName: string };
        createdAt: Date;
      }>;
    }>
  > {
    const exclusions = await prisma.userActivityExclusion.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            profile: true,
          },
        },
        activity: {
          select: {
            id: true,
            title: true,
            startDateTime: true,
            endDateTime: true,
          },
        },
        admin: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by user
    const grouped = exclusions.reduce((acc, exclusion) => {
      const userId = exclusion.userId;
      if (!acc[userId]) {
        acc[userId] = {
          userId,
          user: {
            ...exclusion.user,
            firstName: (exclusion.user.profile as any)?.firstName,
            lastName: (exclusion.user.profile as any)?.lastName,
          },
          exclusions: [],
        };
      }
      
      acc[userId].exclusions.push({
        activityId: exclusion.activityId,
        activity: exclusion.activity,
        reason: exclusion.reason,
        excludedBy: exclusion.excludedBy,
        admin: exclusion.admin,
        createdAt: exclusion.createdAt,
      });
      
      return acc;
    }, {} as Record<string, any>);

    return Object.values(grouped);
  }

  static async getActivityExclusions(activityId: string): Promise<UserActivityExclusion[]> {
    return await prisma.userActivityExclusion.findMany({
      where: { activityId },
      include: {
        user: {
          select: {
            id: true,
            profile: true,
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
      orderBy: { createdAt: 'desc' },
    });
  }
}