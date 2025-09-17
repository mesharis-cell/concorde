import { prisma } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  CreateUser,
  Pagination,
  PaginatedResponse,
} from '../types/index.js';
import type { User } from '@prisma/client';
import { GroupService } from './groups.js';
import { AuditTrailService } from './audit-trail.js';
import { JwtService } from '../utils/jwt.js';
import { ConflictDetectionService } from './conflict-detection.js';

export class UserService {
  static async create(data: CreateUser, performedBy?: string): Promise<User> {
    // Normalize email and check if user with same email already exists in this event
    if (data.profile?.email) {
      data.profile.email = data.profile.email.toLowerCase();

      const existingUser = await this.findByEmailAndEvent(
        data.profile.email,
        data.eventId
      );
      if (existingUser) {
        throw new Error(
          `User with email ${data.profile.email} already exists in this event`
        );
      }
    }

    const user = await prisma.user.create({
      data: {
        eventId: data.eventId,
        groupIds: [], // Initialize with empty array
        profile: data.profile,
        communication: data.communication,
        flight: data.flight,
        accommodation: data.accommodation,
        transferRequirements: data.transferRequirements,
        requirements: data.requirements,
        merchandiseSize: data.merchandiseSize,
        emergencyContact: data.emergencyContact,
      },
    });

    // Log audit trail
    if (performedBy) {
      await AuditTrailService.logCreate(
        'User',
        user.id,
        {
          email: data.profile?.email,
          firstName: data.profile?.firstName,
          lastName: data.profile?.lastName,
          eventId: data.eventId,
        },
        performedBy,
        data.eventId
      );
    }

    return user;
  }

  static async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id, active: true },
      include: {
        event: {
          select: { id: true, name: true, shortName: true },
        },
        roomAssignments: true,
      },
    });
  }

  static async findByEmail(
    email: string,
    eventId: string
  ): Promise<User | null> {
    // Normalize email for case-insensitive comparison
    const normalizedEmail = email.toLowerCase();

    // Use raw query since Prisma doesn't support JSON field queries well with MongoDB
    const users = await prisma.user.findMany({
      where: {
        eventId, // Prisma handles string to ObjectId conversion automatically
        active: true,
      },
    });

    // Filter by email in JavaScript since JSON field querying is limited
    return (
      users.find((user) => {
        const profile = user.profile as any;
        return profile?.email?.toLowerCase() === normalizedEmail;
      }) || null
    );
  }

  static async findByEventId(
    eventId: string,
    pagination: Pagination,
    filters: {
      assigned?: boolean;
      groupId?: string;
      search?: string;
      hasRequirements?: boolean;
      requirementType?:
      | 'dietary'
      | 'medical'
      | 'accessibility'
      | 'accommodation'
      | 'any';
      communicationType?:
      | 'email-only'
      | 'whatsapp-only'
      | 'both'
      | 'none'
      | 'any';
    } = {}
  ): Promise<PaginatedResponse<User>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {
      eventId,
      active: true,
    };

    if (filters.assigned !== undefined) {
      where.assigned = filters.assigned;
    }

    if (filters.groupId) {
      where.groupIds = { hasSome: [filters.groupId] };
    }

    // For now, implement basic filtering without JSON path queries
    // Use simple client-side filtering for complex JSON queries until we implement raw SQL

    // Basic filters that work with Prisma
    let users: User[] = [];
    let filteredCount = 0;

    // Get all users for the event first
    const allUsers = await prisma.user.findMany({
      where: {
        eventId,
        active: true,
        ...(filters.assigned !== undefined && { assigned: filters.assigned }),
        ...(filters.groupId && { groupIds: { hasSome: [filters.groupId] } }),
      },
      orderBy: { registeredAt: 'desc' },
    });

    // Apply client-side filtering for JSON fields
    let filtered = allUsers;

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter((user) => {
        const profile = user.profile as any;
        const firstName = profile?.firstName || '';
        const lastName = profile?.lastName || '';
        const email = profile?.email || '';
        return (
          firstName.toLowerCase().includes(searchLower) ||
          lastName.toLowerCase().includes(searchLower) ||
          email.toLowerCase().includes(searchLower)
        );
      });
    }

    if (filters.requirementType && filters.requirementType !== 'any') {
      filtered = filtered.filter((user) => {
        const requirements = user.requirements as any;
        const accommodation = user.accommodation as any;

        if (filters.requirementType === 'dietary') {
          return requirements?.dietary;
        } else if (filters.requirementType === 'medical') {
          return requirements?.medical;
        } else if (filters.requirementType === 'accessibility') {
          return requirements?.accessibility;
        } else if (filters.requirementType === 'accommodation') {
          return accommodation?.required;
        }
        return false;
      });
    } else if (filters.requirementType === 'any') {
      filtered = filtered.filter((user) => {
        const requirements = user.requirements as any;
        const accommodation = user.accommodation as any;
        return (
          requirements?.dietary ||
          requirements?.medical ||
          requirements?.accessibility ||
          accommodation?.required
        );
      });
    }

    if (filters.communicationType && filters.communicationType !== 'any') {
      filtered = filtered.filter((user) => {
        const communication = user.communication as any;
        const emailOptIn = communication?.emailOptIn || false;
        const whatsappOptIn = communication?.whatsappOptIn || false;

        if (filters.communicationType === 'email-only') {
          return emailOptIn && !whatsappOptIn;
        } else if (filters.communicationType === 'whatsapp-only') {
          return !emailOptIn && whatsappOptIn;
        } else if (filters.communicationType === 'both') {
          return emailOptIn && whatsappOptIn;
        } else if (filters.communicationType === 'none') {
          return !emailOptIn && !whatsappOptIn;
        }
        return false;
      });
    }

    if (filters.hasRequirements) {
      filtered = filtered.filter((user) => {
        const requirements = user.requirements as any;
        const accommodation = user.accommodation as any;
        return (
          requirements?.dietary ||
          requirements?.medical ||
          requirements?.accessibility ||
          accommodation?.required
        );
      });
    }

    // Apply pagination
    filteredCount = filtered.length;
    const startIndex = (page - 1) * limit;
    users = filtered.slice(startIndex, startIndex + limit);

    return {
      items: users,
      pagination: {
        page,
        limit,
        total: filteredCount,
        totalPages: Math.ceil(filteredCount / limit),
      },
    };
  }

  static async update(id: string, data: Partial<CreateUser>, performedBy?: string): Promise<User> {
    // If email is being updated, normalize and check for duplicates within the same event
    if (data.profile?.email) {
      data.profile.email = data.profile.email.toLowerCase();

      const currentUser = await prisma.user.findUnique({
        where: { id },
        select: { eventId: true, profile: true },
      });

      if (currentUser) {
        const currentEmail = (currentUser.profile as any)?.email?.toLowerCase();
        if (currentEmail !== data.profile.email) {
          const existingUser = await this.findByEmailAndEvent(
            data.profile.email,
            currentUser.eventId
          );
          if (existingUser) {
            throw new Error(
              `User with email ${data.profile.email} already exists in this event`
            );
          }
        }
      }
    }

    const updateData: any = {};

    if (data.profile) updateData.profile = data.profile;
    if (data.communication) updateData.communication = data.communication;
    if (data.flight !== undefined) updateData.flight = data.flight;
    if (data.accommodation !== undefined)
      updateData.accommodation = data.accommodation;
    if (data.transferRequirements !== undefined)
      updateData.transferRequirements = data.transferRequirements;
    if (data.requirements !== undefined)
      updateData.requirements = data.requirements;
    if (data.merchandiseSize !== undefined)
      updateData.merchandiseSize = data.merchandiseSize;
    if (data.emergencyContact !== undefined)
      updateData.emergencyContact = data.emergencyContact;

    // Get current user data for audit trail
    const currentUser = performedBy ? await prisma.user.findUnique({ where: { id } }) : null;
    
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    // Log audit trail
    if (performedBy && currentUser) {
      const changedFields = AuditTrailService.getChangedFields(currentUser, updatedUser);
      if (changedFields.length > 0) {
        await AuditTrailService.logUpdate(
          'User',
          id,
          currentUser,
          updatedUser,
          changedFields,
          performedBy,
          updatedUser.eventId
        );
      }
    }

    return updatedUser;
  }

  static async assignToGroups(
    userId: string,
    groupIds: string[],
    adminId: string,
    options: { allowConflicts?: boolean } = {}
  ): Promise<{
    user: User;
    warnings: {
      capacityIssues: any[];
      timingConflicts: any[];
      hasIssues: boolean;
    };
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { groupIds: true, eventId: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify all groups exist and belong to same event
    const groups = await prisma.group.findMany({
      where: { 
        id: { in: groupIds },
        eventId: user.eventId,
        active: true,
        deleted: false,
      },
    });

    if (groups.length !== groupIds.length) {
      throw new Error('One or more groups not found or inactive');
    }

    // Analyze conflicts
    const conflictAnalysis = await ConflictDetectionService.analyzeAssignmentConflicts([userId], groupIds);
    
    // Block assignment if there are high-severity conflicts and conflicts are not allowed
    if (!options.allowConflicts && conflictAnalysis.hasIssues) {
      const highSeverityIssues = [
        ...conflictAnalysis.capacityIssues.filter(i => i.severity === 'high'),
        ...conflictAnalysis.timingConflicts.filter(c => c.severity === 'high'),
      ];
      
      if (highSeverityIssues.length > 0) {
        const issueDetails = [
          ...conflictAnalysis.capacityIssues.map(i => 
            `Activity "${i.activityTitle}" capacity exceeded (${i.capacity} max, ${i.affectedUserCount + i.capacity} potential attendees)`
          ),
          ...conflictAnalysis.timingConflicts.map(c => 
            `Timing conflict: ${c.activities.length} overlapping activities`
          ),
        ].join('; ');
        
        throw new Error(`Cannot assign user due to conflicts: ${issueDetails}`);
      }
    }
    
    // Replace group assignments (not add to existing)
    const newGroupIds = groupIds; // Use provided groups as the complete new set

    // Update user assignment
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        groupIds: newGroupIds,
        assigned: newGroupIds.length > 0, // Only assigned if has groups
        assignedAt: newGroupIds.length > 0 ? new Date() : null,
        assignedBy: adminId,
      },
    });

    // Update all affected group member counts (both old and new groups)
    const allAffectedGroups = Array.from(new Set([...user.groupIds, ...newGroupIds]));
    await Promise.all(allAffectedGroups.map(groupId => GroupService.updateMemberCount(groupId)));

    // Update activity attendee counts for all affected activities
    const activities = await prisma.activity.findMany({
      where: { groupIds: { hasSome: allAffectedGroups } },
      select: { id: true },
    });
    await ConflictDetectionService.batchUpdateAttendeeCount(activities.map(a => a.id));

    // Log audit trail for added groups
    const addedGroups = groupIds.filter(id => !user.groupIds.includes(id));
    for (const groupId of addedGroups) {
      const [group, admin, userProfile] = await Promise.all([
        prisma.group.findUnique({
          where: { id: groupId },
          select: { name: true }
        }),
        prisma.admin.findUnique({
          where: { id: adminId },
          select: { email: true, firstName: true, lastName: true }
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { profile: true }
        })
      ]);

      const userEmail = (userProfile?.profile as any)?.email || 'Unknown User';
      const adminEmail = admin?.email || 'Unknown Admin';
      const summary = `Assigned user ${userEmail} to group "${group?.name || groupId}" (by ${adminEmail})`;

      await AuditTrailService.log({
        action: 'ASSIGN',
        resourceType: 'User',
        resourceId: userId,
        eventId: updatedUser.eventId,
        performedBy: adminId,
        performedByType: 'ADMIN',
        summary,
        metadata: {
          userEmail,
          adminEmail,
          groupName: group?.name || groupId,
          ...(conflictAnalysis.hasIssues ? { conflictsDetected: true } : {})
        }
      });
    }

    // Log audit trail for removed groups
    const removedGroups = user.groupIds.filter(id => !groupIds.includes(id));
    for (const groupId of removedGroups) {
      const [group, admin, userProfile] = await Promise.all([
        prisma.group.findUnique({
          where: { id: groupId },
          select: { name: true }
        }),
        prisma.admin.findUnique({
          where: { id: adminId },
          select: { email: true, firstName: true, lastName: true }
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { profile: true }
        })
      ]);

      const userEmail = (userProfile?.profile as any)?.email || 'Unknown User';
      const adminEmail = admin?.email || 'Unknown Admin';
      const summary = `Removed user ${userEmail} from group "${group?.name || groupId}" (by ${adminEmail})`;

      await AuditTrailService.log({
        action: 'UNASSIGN',
        resourceType: 'User',
        resourceId: userId,
        eventId: updatedUser.eventId,
        performedBy: adminId,
        performedByType: 'ADMIN',
        summary,
        metadata: {
          userEmail,
          adminEmail,
          groupName: group?.name || groupId,
        }
      });
    }

    return {
      user: updatedUser,
      warnings: {
        capacityIssues: conflictAnalysis.capacityIssues,
        timingConflicts: conflictAnalysis.timingConflicts,
        hasIssues: conflictAnalysis.hasIssues,
      },
    };
  }

  // Backward compatibility method
  static async assignToGroup(
    userId: string,
    groupId: string,
    adminId: string
  ): Promise<User> {
    const result = await this.assignToGroups(userId, [groupId], adminId);
    return result.user;
  }

  static async unassignFromGroups(
    userId: string,
    groupIds: string[],
    adminId: string
  ): Promise<{
    user: User;
    removedGroups: string[];
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { groupIds: true, assigned: true, eventId: true },
    });

    if (!user || !user.assigned || user.groupIds.length === 0) {
      throw new Error('User is not assigned to any groups');
    }

    // Filter out the groups to remove
    const remainingGroupIds = user.groupIds.filter(id => !groupIds.includes(id));
    const actuallyRemovedGroups = user.groupIds.filter(id => groupIds.includes(id));

    if (actuallyRemovedGroups.length === 0) {
      throw new Error('User is not assigned to any of the specified groups');
    }

    // Update user assignment
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        groupIds: remainingGroupIds,
        assigned: remainingGroupIds.length > 0,
        assignedAt: remainingGroupIds.length > 0 ? user.assignedAt : null,
        assignedBy: adminId,
      },
    });

    // Update affected group member counts
    await Promise.all([
      ...remainingGroupIds.map(groupId => GroupService.updateMemberCount(groupId)),
      ...actuallyRemovedGroups.map(groupId => GroupService.updateMemberCount(groupId)),
    ]);

    // Update activity attendee counts
    const activities = await prisma.activity.findMany({
      where: { groupIds: { hasSome: [...remainingGroupIds, ...actuallyRemovedGroups] } },
      select: { id: true },
    });
    await ConflictDetectionService.batchUpdateAttendeeCount(activities.map(a => a.id));

    // Log audit trail for each removed group
    for (const groupId of actuallyRemovedGroups) {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true }
      });

      await AuditTrailService.logUnassign(
        'User',
        userId,
        group?.name || groupId,
        'group',
        adminId,
        user.eventId
      );
    }

    return {
      user: updatedUser,
      removedGroups: actuallyRemovedGroups,
    };
  }

  // Backward compatibility method
  static async unassignFromGroup(
    userId: string,
    adminId: string
  ): Promise<User> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { groupIds: true },
    });

    if (!user || user.groupIds.length === 0) {
      throw new Error('User is not assigned to any group');
    }

    // Remove from all groups for backward compatibility
    const result = await this.unassignFromGroups(userId, user.groupIds, adminId);
    return result.user;
  }

  // New method: Remove from specific group
  static async removeFromGroup(
    userId: string,
    groupId: string,
    adminId: string
  ): Promise<User> {
    const result = await this.unassignFromGroups(userId, [groupId], adminId);
    return result.user;
  }

  static async reassignToGroup(
    userId: string,
    newGroupId: string,
    adminId: string
  ): Promise<User> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { groupId: true, assigned: true, eventId: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify new group exists and belongs to same event
    const group = await prisma.group.findUnique({
      where: { id: newGroupId },
      select: { eventId: true, active: true, deleted: true },
    });

    if (!group || group.deleted || !group.active) {
      throw new Error('Group not found or inactive');
    }

    if (group.eventId !== user.eventId) {
      throw new Error('Group and user must belong to the same event');
    }

    const oldGroupId = user.groupId;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        groupId: newGroupId,
        assigned: true,
        assignedAt: new Date(),
        assignedBy: adminId,
      },
    });

    // Update both group member counts
    if (oldGroupId) {
      await GroupService.updateMemberCount(oldGroupId);
    }
    await GroupService.updateMemberCount(newGroupId);

    return updatedUser;
  }

  // Magic link and session methods removed - replaced with OTP authentication
  // See OTPService for new authentication flow

  static async deactivate(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { active: false },
    });
  }

  static async getRequirementsSummary(eventId: string) {
    const users = await prisma.user.findMany({
      where: { eventId, active: true, assigned: true },
      select: {
        requirements: true,
        accommodation: true,
        flight: true,
      },
    });

    const summary = {
      dietary: new Set<string>(),
      medical: new Set<string>(),
      accessibility: new Set<string>(),
      accommodationRequired: 0,
      flightArrivals: 0,
    };

    users.forEach((user: any) => {
      const requirements = user.requirements as any;
      const accommodation = user.accommodation as any;
      const flight = user.flight as any;

      if (requirements?.dietary) {
        summary.dietary.add(requirements.dietary);
      }
      if (requirements?.medical) {
        summary.medical.add(requirements.medical);
      }
      if (requirements?.accessibility) {
        summary.accessibility.add(requirements.accessibility);
      }
      if (accommodation?.required) {
        summary.accommodationRequired++;
      }
      if (flight?.arrival) {
        summary.flightArrivals++;
      }
    });

    return {
      totalUsers: users.length,
      dietary: Array.from(summary.dietary),
      medical: Array.from(summary.medical),
      accessibility: Array.from(summary.accessibility),
      accommodationRequired: summary.accommodationRequired,
      flightArrivals: summary.flightArrivals,
    };
  }

  static async updateCommunicationPreferences(
    userId: string,
    preferences: { emailOptIn: boolean; whatsappOptIn: boolean }
  ): Promise<User> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const currentCommunication = (user.communication as any) || {};
    const updatedCommunication = {
      ...currentCommunication,
      emailOptIn: preferences.emailOptIn,
      whatsappOptIn: preferences.whatsappOptIn,
    };

    return await prisma.user.update({
      where: { id: userId },
      data: { communication: updatedCommunication },
    });
  }

  static async getUsersWithNotificationStatus(
    groupId: string,
    pagination: Pagination
  ): Promise<
    PaginatedResponse<User & { notificationStatus: 'notified' | 'pending' }>
  > {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where: {
          groupIds: {
            has: groupId
          },
          assigned: true,
          active: true,
        },
        skip,
        take: limit,
        orderBy: { assignedAt: 'desc' },
      }),
      prisma.user.count({
        where: {
          groupIds: {
            has: groupId
          },
          assigned: true,
          active: true,
        },
      }),
    ]);

    const usersWithStatus = users.map((user) => ({
      ...user,
      notificationStatus: user.groupAssignmentNotified
        ? 'notified'
        : ('pending' as const),
    }));

    return {
      items: usersWithStatus,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async markUsersAsNotified(userIds: string[]): Promise<void> {
    await prisma.user.updateMany({
      where: {
        id: { in: userIds },
      },
      data: {
        groupAssignmentNotified: true,
        groupAssignmentNotifiedAt: new Date(),
      },
    });
  }

  static async findByEmailAndEvent(
    email: string,
    eventId: string
  ): Promise<User | null> {
    // Normalize email for case-insensitive comparison
    const normalizedEmail = email.toLowerCase();

    // Use raw query since Prisma doesn't support JSON field queries well with MongoDB
    const users = await prisma.user.findMany({
      where: {
        eventId,
        active: true,
      },
    });

    // Filter by email in JavaScript since JSON field querying is limited
    const user =
      users.find((user) => {
        const profile = user.profile as any;
        return profile?.email?.toLowerCase() === normalizedEmail;
      }) || null;

    return user;
  }

  static async softDelete(userId: string, performedBy?: string): Promise<User> {
    // First check if user exists and is not already deleted
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.active) {
      throw new Error('User is already deleted');
    }

    // Soft delete by setting active to false
    const deletedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        active: false,
        assigned: false, // Unassign from all groups when deleted
        groupIds: [], // Clear all group assignments
      },
    });

    // Update group member counts for all groups user was assigned to
    if (user.groupIds && user.groupIds.length > 0) {
      await Promise.all(
        user.groupIds.map(groupId => GroupService.updateMemberCount(groupId))
      );

      // Update activity attendee counts for all affected activities
      const activities = await prisma.activity.findMany({
        where: { groupIds: { hasSome: user.groupIds } },
        select: { id: true },
      });
      
      if (activities.length > 0) {
        await ConflictDetectionService.batchUpdateAttendeeCount(activities.map(a => a.id));
      }
    }

    // Log audit trail
    if (performedBy) {
      const admin = await prisma.admin.findUnique({
        where: { id: performedBy },
        select: { email: true, firstName: true, lastName: true }
      });

      const userEmail = (user.profile as any)?.email || 'Unknown User';
      const adminEmail = admin?.email || 'Unknown Admin';
      const summary = `Deleted user ${userEmail} (by ${adminEmail})`;

      await AuditTrailService.log({
        action: 'DELETE',
        resourceType: 'User',
        resourceId: userId,
        eventId: user.eventId,
        performedBy: performedBy,
        performedByType: 'ADMIN',
        summary,
        metadata: {
          userEmail,
          adminEmail,
          deletedUserProfile: {
            email: (user.profile as any)?.email,
            firstName: (user.profile as any)?.firstName,
            lastName: (user.profile as any)?.lastName,
          }
        }
      });
    }

    return deletedUser;
  }

  /**
   * Unsubscribe user from email communications
   */
  static async unsubscribeFromEmail(
    userId: string,
    eventId: string
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          event: {
            select: { id: true, name: true, shortName: true },
          },
        },
      });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (!user.active) {
        return { success: false, error: 'User account is inactive' };
      }

      // Verify user belongs to the specified event
      if (user.eventId !== eventId) {
        return { success: false, error: 'Invalid request' };
      }

      const currentCommunication = (user.communication as any) || {};
      const updatedCommunication = {
        ...currentCommunication,
        emailOptIn: false,
      };

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { communication: updatedCommunication },
        include: {
          event: {
            select: { name: true, shortName: true },
          },
        },
      });

      return { success: true, user: updatedUser };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate a magic link token for admin preview (no email sent)
   */
  static async generateMagicLink(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const user = await prisma.user.findUnique({
      where: { id: userId, active: true },
      select: { eventId: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Generate magic link token using JWT service
    const token = JwtService.generateMagicLinkToken(userId, user.eventId);
    
    // Calculate expiration (24 hours from now, matching JWT service)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    return {
      token,
      expiresAt,
    };
  }

  /**
   * Utility method to demonstrate flight data sorting and calculations
   * Returns users sorted by flight departure dates with duration calculations
   */
  static async getFlightAnalytics(eventId: string): Promise<{
    usersByDeparture: Array<{
      userId: string;
      email: string;
      departureDate: Date | null;
      arrivalDate: Date | null;
      flightDuration?: number; // in minutes
    }>;
    stats: {
      totalWithFlights: number;
      averageFlightDuration: number;
      earliestDeparture: Date | null;
      latestArrival: Date | null;
    };
  }> {
    const users = await prisma.user.findMany({
      where: {
        eventId,
        active: true,
        flight: { not: null },
      },
      select: {
        id: true,
        profile: true,
        flight: true,
      },
    });

    const userFlightData = users.map(user => {
      const flight = user.flight as any;
      const email = (user.profile as any)?.email;
      
      const inboundDeparture = flight?.inbound?.departureDate ? new Date(flight.inbound.departureDate) : null;
      const inboundArrival = flight?.inbound?.arrivalDate ? new Date(flight.inbound.arrivalDate) : null;
      
      // Calculate flight duration if both dates are available
      let flightDuration;
      if (inboundDeparture && inboundArrival) {
        flightDuration = Math.round((inboundArrival.getTime() - inboundDeparture.getTime()) / (1000 * 60)); // minutes
      }
      
      return {
        userId: user.id,
        email,
        departureDate: inboundDeparture,
        arrivalDate: inboundArrival,
        flightDuration,
      };
    });

    // Sort by departure date (nulls last)
    const sortedUsers = userFlightData.sort((a, b) => {
      if (!a.departureDate) return 1;
      if (!b.departureDate) return -1;
      return a.departureDate.getTime() - b.departureDate.getTime();
    });

    // Calculate stats
    const usersWithValidFlights = userFlightData.filter(u => u.departureDate && u.arrivalDate);
    const durations = usersWithValidFlights.map(u => u.flightDuration).filter(Boolean) as number[];
    const departureDates = userFlightData.map(u => u.departureDate).filter(Boolean) as Date[];
    const arrivalDates = userFlightData.map(u => u.arrivalDate).filter(Boolean) as Date[];

    return {
      usersByDeparture: sortedUsers,
      stats: {
        totalWithFlights: users.length,
        averageFlightDuration: durations.length > 0 
          ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)
          : 0,
        earliestDeparture: departureDates.length > 0 
          ? new Date(Math.min(...departureDates.map(d => d.getTime())))
          : null,
        latestArrival: arrivalDates.length > 0 
          ? new Date(Math.max(...arrivalDates.map(d => d.getTime())))
          : null,
      },
    };
  }
}
