import { prisma } from '../config/database.js';

export interface CapacityIssue {
  type: 'capacity_exceeded' | 'capacity_warning'
  activityId: string
  activityTitle: string
  capacity: number
  currentAttendees: number
  affectedUserCount: number
  severity: 'low' | 'medium' | 'high'
}

export interface TimingConflict {
  type: 'timing_overlap'
  userId: string
  userEmail?: string
  activities: Array<{
    id: string
    title: string
    groupId: string
    groupName?: string
    startDateTime: Date
    endDateTime: Date
  }>
  overlapDuration: number // in minutes
  severity: 'low' | 'medium' | 'high'
}

export interface ConflictAnalysis {
  hasIssues: boolean
  capacityIssues: CapacityIssue[]
  timingConflicts: TimingConflict[]
  summary: {
    totalIssues: number
    highSeverityCount: number
    affectedActivities: number
    affectedUsers: number
  }
}

export class ConflictDetectionService {
  /**
   * Check if a new activity with given capacity would create conflicts
   */
  static async validateNewActivityCapacity(
    groupIds: string[],
    capacity: number,
    activityTitle: string = 'New Activity'
  ): Promise<{ hasConflicts: boolean; issues: CapacityIssue[] }> {
    const issues: CapacityIssue[] = [];

    // Get total member count for the groups
    const groups = await prisma.group.findMany({
      where: {
        id: { in: groupIds },
        active: true,
        deleted: false,
      },
      select: { id: true, name: true, memberCount: true },
    });

    const totalPotentialAttendees = groups.reduce((sum, group) => sum + group.memberCount, 0);

    if (totalPotentialAttendees > capacity) {
      const overage = totalPotentialAttendees - capacity;
      issues.push({
        type: 'capacity_exceeded',
        activityId: 'new',
        activityTitle,
        capacity,
        currentAttendees: 0,
        affectedUserCount: overage,
        severity: overage > capacity * 0.5 ? 'high' : 
                 overage > capacity * 0.2 ? 'medium' : 'low',
      });
    }

    return {
      hasConflicts: issues.length > 0,
      issues
    };
  }

  /**
   * Analyze capacity issues for activities in specific groups
   */
  static async analyzeActivityCapacity(groupIds: string[]): Promise<CapacityIssue[]> {
    const issues: CapacityIssue[] = [];

    // Get all activities for the groups with capacity limits
    const activities = await prisma.activity.findMany({
      where: {
        groupIds: { hasSome: groupIds },
        capacity: { not: null },
        active: true,
        deleted: false,
      },
      include: {
        groups: {
          select: { id: true, name: true, memberCount: true },
        },
      },
    });

    for (const activity of activities) {
      const totalPotentialAttendees = activity.groups
        .filter(group => groupIds.includes(group.id))
        .reduce((sum, group) => sum + group.memberCount, 0);

      if (activity.capacity && totalPotentialAttendees > activity.capacity) {
        const overage = totalPotentialAttendees - activity.capacity;
        
        issues.push({
          type: 'capacity_exceeded',
          activityId: activity.id,
          activityTitle: activity.title,
          capacity: activity.capacity,
          currentAttendees: activity.currentAttendees,
          affectedUserCount: overage,
          severity: overage > activity.capacity * 0.5 ? 'high' : 
                   overage > activity.capacity * 0.2 ? 'medium' : 'low',
        });
      } else if (activity.capacity && totalPotentialAttendees > activity.capacity * 0.8) {
        // Warning when at 80% capacity
        issues.push({
          type: 'capacity_warning',
          activityId: activity.id,
          activityTitle: activity.title,
          capacity: activity.capacity,
          currentAttendees: activity.currentAttendees,
          affectedUserCount: totalPotentialAttendees,
          severity: 'low',
        });
      }
    }

    return issues;
  }

  /**
   * Analyze timing conflicts for a specific user
   */
  static async analyzeUserTimingConflicts(userId: string): Promise<TimingConflict[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        groupIds: true, 
        email: true,
      },
    });

    if (!user || user.groupIds.length === 0) return [];

    // Get all groups for this user
    const groups = await prisma.group.findMany({
      where: {
        id: { in: user.groupIds },
        active: true,
        deleted: false,
      },
      select: { id: true, name: true },
    });

    // Get all activities from user's groups
    const activities = await prisma.activity.findMany({
      where: {
        groupIds: { hasSome: user.groupIds },
        active: true,
        deleted: false,
      },
      select: {
        id: true,
        title: true,
        startDateTime: true,
        endDateTime: true,
        groupIds: true,
      },
    });

    // Collect all activities with group context
    const allActivities = activities.flatMap(activity => {
      // Find which of the user's groups this activity belongs to
      const activityUserGroups = groups.filter(group => 
        activity.groupIds.includes(group.id)
      );
      
      return activityUserGroups.map(group => ({
        id: activity.id,
        title: activity.title,
        startDateTime: activity.startDateTime,
        endDateTime: activity.endDateTime,
        groupId: group.id,
        groupName: group.name,
      }));
    });

    // Find overlapping activities
    const conflicts: TimingConflict[] = [];
    
    for (let i = 0; i < allActivities.length; i++) {
      const activity1 = allActivities[i];
      const overlapping = [];

      for (let j = i + 1; j < allActivities.length; j++) {
        const activity2 = allActivities[j];
        
        // Check for time overlap
        const start1 = activity1.startDateTime;
        const end1 = activity1.endDateTime;
        const start2 = activity2.startDateTime;
        const end2 = activity2.endDateTime;

        const overlapStart = start1 > start2 ? start1 : start2;
        const overlapEnd = end1 < end2 ? end1 : end2;

        if (overlapStart < overlapEnd) {
          const overlapMinutes = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60));
          
          overlapping.push({
            activity: activity2,
            overlapMinutes,
          });
        }
      }

      if (overlapping.length > 0) {
        const maxOverlap = Math.max(...overlapping.map(o => o.overlapMinutes));
        
        conflicts.push({
          type: 'timing_overlap',
          userId,
          userEmail: user.email,
          activities: [activity1, ...overlapping.map(o => o.activity)],
          overlapDuration: maxOverlap,
          severity: maxOverlap > 60 ? 'high' : maxOverlap > 30 ? 'medium' : 'low',
        });
      }
    }

    return conflicts;
  }

  /**
   * Analyze conflicts for multiple users (bulk assignment scenario)
   */
  static async analyzeBulkUserConflicts(userIds: string[]): Promise<TimingConflict[]> {
    const conflicts: TimingConflict[] = [];
    
    for (const userId of userIds) {
      const userConflicts = await this.analyzeUserTimingConflicts(userId);
      conflicts.push(...userConflicts);
    }

    return conflicts;
  }

  /**
   * Get all system-wide conflicts and issues for a specific event
   */
  static async getAllEventConflicts(eventId: string): Promise<ConflictAnalysis> {
    // Get all active groups for this event
    const groups = await prisma.group.findMany({
      where: {
        eventId,
        active: true,
        deleted: false,
      },
      select: { id: true },
    });

    const groupIds = groups.map(g => g.id);

    // Get all active users for this event
    const users = await prisma.user.findMany({
      where: {
        eventId,
        active: true,
        assigned: true,
      },
      select: { id: true },
    });

    const userIds = users.map(u => u.id);

    // Analyze capacity and timing conflicts
    const [capacityIssues, timingConflicts] = await Promise.all([
      this.analyzeActivityCapacity(groupIds),
      this.analyzeBulkUserConflicts(userIds),
    ]);

    const highSeverityCount = [
      ...capacityIssues.filter(i => i.severity === 'high'),
      ...timingConflicts.filter(c => c.severity === 'high'),
    ].length;

    const affectedActivities = new Set([
      ...capacityIssues.map(i => i.activityId),
      ...timingConflicts.flatMap(c => c.activities.map(a => a.id)),
    ]).size;

    const affectedUsers = new Set(timingConflicts.map(c => c.userId)).size;

    return {
      hasIssues: capacityIssues.length > 0 || timingConflicts.length > 0,
      capacityIssues,
      timingConflicts,
      summary: {
        totalIssues: capacityIssues.length + timingConflicts.length,
        highSeverityCount,
        affectedActivities,
        affectedUsers,
      },
    };
  }

  /**
   * Comprehensive conflict analysis for assignment operations
   */
  static async analyzeAssignmentConflicts(
    userIds: string[],
    groupIds: string[]
  ): Promise<ConflictAnalysis> {
    const [capacityIssues, timingConflicts] = await Promise.all([
      this.analyzeActivityCapacity(groupIds),
      this.analyzeBulkUserConflicts(userIds),
    ]);

    const highSeverityCount = [
      ...capacityIssues.filter(i => i.severity === 'high'),
      ...timingConflicts.filter(c => c.severity === 'high'),
    ].length;

    const affectedActivities = new Set([
      ...capacityIssues.map(i => i.activityId),
      ...timingConflicts.flatMap(c => c.activities.map(a => a.id)),
    ]).size;

    const affectedUsers = new Set([
      ...timingConflicts.map(c => c.userId),
    ]).size;

    return {
      hasIssues: capacityIssues.length > 0 || timingConflicts.length > 0,
      capacityIssues,
      timingConflicts,
      summary: {
        totalIssues: capacityIssues.length + timingConflicts.length,
        highSeverityCount,
        affectedActivities,
        affectedUsers,
      },
    };
  }

  /**
   * Get real-time activity capacity status
   */
  static async getActivityCapacityStatus(activityId: string): Promise<{
    activity: {
      id: string
      title: string
      capacity: number | null
      currentAttendees: number
    }
    status: 'available' | 'warning' | 'full' | 'exceeded'
    availableSlots: number
    waitingList: number
  } | null> {
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      select: {
        id: true,
        title: true,
        capacity: true,
        currentAttendees: true,
      },
    });

    if (!activity || !activity.capacity) {
      return activity ? {
        activity: {
          id: activity.id,
          title: activity.title,
          capacity: null,
          currentAttendees: activity.currentAttendees,
        },
        status: 'available',
        availableSlots: 999999, // Unlimited
        waitingList: 0,
      } : null;
    }

    const availableSlots = Math.max(0, activity.capacity - activity.currentAttendees);
    const waitingList = Math.max(0, activity.currentAttendees - activity.capacity);
    
    let status: 'available' | 'warning' | 'full' | 'exceeded';
    
    if (activity.currentAttendees > activity.capacity) {
      status = 'exceeded';
    } else if (activity.currentAttendees >= activity.capacity) {
      status = 'full';
    } else if (activity.currentAttendees >= activity.capacity * 0.8) {
      status = 'warning';
    } else {
      status = 'available';
    }

    return {
      activity: {
        id: activity.id,
        title: activity.title,
        capacity: activity.capacity,
        currentAttendees: activity.currentAttendees,
      },
      status,
      availableSlots,
      waitingList,
    };
  }

  /**
   * Update activity attendee count (call after user assignments change)
   */
  static async updateActivityAttendeeCount(activityId: string): Promise<void> {
    // Count users assigned to groups that have this activity
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      select: { groupIds: true },
    });

    if (!activity) return;

    const attendeeCount = await prisma.user.count({
      where: {
        groupIds: { hasSome: activity.groupIds },
        assigned: true,
        active: true,
      },
    });

    await prisma.activity.update({
      where: { id: activityId },
      data: { 
        currentAttendees: attendeeCount,
        lastModifiedAt: new Date(),
      },
    });
  }

  /**
   * Batch update attendee counts for multiple activities
   */
  static async batchUpdateAttendeeCount(activityIds: string[]): Promise<void> {
    await Promise.all(
      activityIds.map(id => this.updateActivityAttendeeCount(id))
    );
  }
}
