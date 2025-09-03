import { prisma } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  CreateUser,
  Pagination,
  PaginatedResponse,
  UserSession,
  UserMagicLink,
} from '../types/index.js';
import type { User } from '@prisma/client';
import { GroupService } from './groups.js';

export class UserService {
  static async create(data: CreateUser): Promise<User> {
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
        profile: data.profile,
        communication: data.communication,
        flight: data.flight,
        accommodation: data.accommodation,
        transferRequirements: data.transferRequirements,
        requirements: data.requirements,
        merchandiseSize: data.merchandiseSize,
        emergencyContact: data.emergencyContact,
        sessions: [],
        magicLinks: [],
      },
    });

    return user;
  }

  static async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id, active: true },
      include: {
        event: {
          select: { id: true, name: true, shortName: true },
        },
        group: {
          select: { id: true, name: true, description: true },
        },
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
      where.groupId = filters.groupId;
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
        ...(filters.groupId && { groupId: filters.groupId }),
      },
      orderBy: { registeredAt: 'desc' },
      include: {
        group: {
          select: { id: true, name: true },
        },
      },
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

  static async update(id: string, data: Partial<CreateUser>): Promise<User> {
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

    return prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  static async assignToGroup(
    userId: string,
    groupId: string,
    adminId: string
  ): Promise<User> {
    // Check if user is already assigned to a group
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { assigned: true, groupId: true, eventId: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.assigned && user.groupId) {
      throw new Error('User is already assigned to a group');
    }

    // Verify group exists and belongs to same event
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { eventId: true, active: true, deleted: true },
    });

    if (!group || group.deleted || !group.active) {
      throw new Error('Group not found or inactive');
    }

    if (group.eventId !== user.eventId) {
      throw new Error('Group and user must belong to the same event');
    }

    // Update user assignment
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        groupId,
        assigned: true,
        assignedAt: new Date(),
        assignedBy: adminId,
      },
    });

    // Update group member count
    await GroupService.updateMemberCount(groupId);

    return updatedUser;
  }

  static async unassignFromGroup(
    userId: string,
    adminId: string
  ): Promise<User> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { groupId: true, assigned: true },
    });

    if (!user || !user.assigned || !user.groupId) {
      throw new Error('User is not assigned to any group');
    }

    const oldGroupId = user.groupId;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        groupId: null,
        assigned: false,
        assignedAt: null,
        assignedBy: adminId,
      },
    });

    // Update old group member count
    await GroupService.updateMemberCount(oldGroupId);

    return updatedUser;
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

  static async createMagicLink(userId: string): Promise<string> {
    const token = uuidv4();
    const createdAt = new Date();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { magicLinks: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const magicLinks = user.magicLinks as UserMagicLink[];

    // Add new magic link
    magicLinks.push({
      token,
      createdAt,
      expiresAt,
      used: false,
    });

    await prisma.user.update({
      where: { id: userId },
      data: { magicLinks },
    });

    return token;
  }

  // Alias for compatibility with controller
  static async generateMagicLink(userId: string): Promise<{ token: string }> {
    const token = await this.createMagicLink(userId);
    return { token };
  }

  static async validateMagicLink(token: string): Promise<User | null> {
    // Since MongoDB JSON field querying is complex, get all users and filter in JavaScript
    const allUsers = await prisma.user.findMany({
      where: { active: true },
    });

    let matchingUser: any = null;
    let linkIndex = -1;

    for (const user of allUsers) {
      const magicLinks = (user.magicLinks as UserMagicLink[]) || [];
      const index = magicLinks.findIndex((link) => link.token === token);

      if (index !== -1) {
        matchingUser = user;
        linkIndex = index;
        break;
      }
    }

    if (!matchingUser || linkIndex === -1) return null;

    const magicLinks = matchingUser.magicLinks as UserMagicLink[];
    const link = magicLinks[linkIndex];

    // Check if expired or already used
    if (link.used || new Date() > new Date(link.expiresAt)) {
      return null;
    }

    // Mark as used and update last accessed
    magicLinks[linkIndex] = {
      ...link,
      used: true,
      lastAccessedAt: new Date(),
    };

    const updatedUser = await prisma.user.update({
      where: { id: matchingUser.id },
      data: {
        magicLinks,
        lastLoginAt: new Date(),
      },
      include: {
        event: {
          select: { id: true, name: true, shortName: true },
        },
        group: {
          select: { id: true, name: true, description: true },
        },
      },
    });

    return updatedUser;
  }

  // Alias for compatibility with controller
  static async verifyMagicLink(token: string): Promise<User | null> {
    return this.validateMagicLink(token);
  }

  static async createSession(
    userId: string,
    sessionToken?: string
  ): Promise<string> {
    const token = uuidv4();
    const createdAt = new Date();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessions: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const sessions = user.sessions as UserSession[];

    // Add new session
    sessions.push({
      token,
      createdAt,
      expiresAt,
      used: false,
    });

    await prisma.user.update({
      where: { id: userId },
      data: { sessions },
    });

    return token;
  }

  static async validateSession(token: string): Promise<User | null> {
    // Since MongoDB JSON field querying is complex, get all users and filter in JavaScript
    const allUsers = await prisma.user.findMany({
      where: { active: true },
    });

    for (const user of allUsers) {
      const sessions = (user.sessions as UserSession[]) || [];
      const session = sessions.find((s) => s.token === token);

      if (
        session &&
        !session.used &&
        new Date() <= new Date(session.expiresAt)
      ) {
        return user;
      }
    }

    return null;
  }

  static async invalidateSession(token: string): Promise<void> {
    // Since MongoDB JSON field querying is complex, get all users and filter in JavaScript
    const allUsers = await prisma.user.findMany({
      where: { active: true },
    });

    for (const user of allUsers) {
      const sessions = (user.sessions as UserSession[]) || [];
      const sessionIndex = sessions.findIndex((s) => s.token === token);

      if (sessionIndex !== -1) {
        sessions[sessionIndex] = {
          ...sessions[sessionIndex],
          used: true,
        };

        await prisma.user.update({
          where: { id: user.id },
          data: { sessions },
        });
        break;
      }
    }
  }

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
          groupId,
          assigned: true,
          active: true,
        },
        skip,
        take: limit,
        orderBy: { assignedAt: 'desc' },
      }),
      prisma.user.count({
        where: {
          groupId,
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

  static async softDelete(userId: string): Promise<User> {
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
        assigned: false, // Unassign from group when deleted
        groupId: null,
      },
    });

    // Update group member count if user was assigned
    if (user.groupId) {
      await GroupService.updateMemberCount(user.groupId);
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
}
