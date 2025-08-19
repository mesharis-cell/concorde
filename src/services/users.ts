import { prisma } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import type { CreateUser, Pagination, PaginatedResponse, UserSession, UserMagicLink } from '../types/index.js';
import type { User } from '@prisma/client';
import { GroupService } from './groups.js';

export class UserService {
  static async create(data: CreateUser): Promise<User> {
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

  static async findByEmail(email: string, eventId: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: { 
        eventId,
        active: true,
        profile: {
          path: ['email'],
          equals: email,
        },
      },
    });
  }

  static async findByEventId(
    eventId: string,
    pagination: Pagination,
    filters: {
      assigned?: boolean;
      groupId?: string;
      search?: string;
      hasRequirements?: boolean;
      guestType?: string;
    } = {}
  ): Promise<PaginatedResponse<User>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { 
      eventId, 
      active: true 
    };
    
    if (filters.assigned !== undefined) {
      where.assigned = filters.assigned;
    }

    if (filters.groupId) {
      where.groupId = filters.groupId;
    }

    if (filters.guestType) {
      where.profile = {
        path: ['guestType'],
        equals: filters.guestType,
      };
    }

    if (filters.search) {
      where.OR = [
        { profile: { path: ['firstName'], string_contains: filters.search } },
        { profile: { path: ['lastName'], string_contains: filters.search } },
        { profile: { path: ['email'], string_contains: filters.search } },
      ];
    }

    if (filters.hasRequirements) {
      where.OR = [
        { requirements: { path: ['dietary'], not: { equals: null } } },
        { requirements: { path: ['medical'], not: { equals: null } } },
        { requirements: { path: ['accessibility'], not: { equals: null } } },
      ];
    }

    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { registeredAt: 'desc' },
        include: {
          group: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.user.count({ where }),
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

  static async update(id: string, data: Partial<CreateUser>): Promise<User> {
    const updateData: any = {};

    if (data.profile) updateData.profile = data.profile;
    if (data.communication) updateData.communication = data.communication;
    if (data.flight !== undefined) updateData.flight = data.flight;
    if (data.accommodation !== undefined) updateData.accommodation = data.accommodation;
    if (data.transferRequirements !== undefined) updateData.transferRequirements = data.transferRequirements;
    if (data.requirements !== undefined) updateData.requirements = data.requirements;
    if (data.merchandiseSize !== undefined) updateData.merchandiseSize = data.merchandiseSize;
    if (data.emergencyContact !== undefined) updateData.emergencyContact = data.emergencyContact;

    return prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  static async assignToGroup(userId: string, groupId: string, adminId: string): Promise<User> {
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

  static async unassignFromGroup(userId: string, adminId: string): Promise<User> {
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

  static async reassignToGroup(userId: string, newGroupId: string, adminId: string): Promise<User> {
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

  static async validateMagicLink(token: string): Promise<User | null> {
    const user = await prisma.user.findFirst({
      where: {
        magicLinks: {
          path: [],
          array_contains: [{ token }],
        },
        active: true,
      },
    });

    if (!user) return null;

    const magicLinks = user.magicLinks as UserMagicLink[];
    const linkIndex = magicLinks.findIndex(link => link.token === token);
    
    if (linkIndex === -1) return null;

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

    await prisma.user.update({
      where: { id: user.id },
      data: { 
        magicLinks,
        lastLoginAt: new Date(),
      },
    });

    return user;
  }

  static async createSession(userId: string): Promise<string> {
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
    const user = await prisma.user.findFirst({
      where: {
        sessions: {
          path: [],
          array_contains: [{ token }],
        },
        active: true,
      },
    });

    if (!user) return null;

    const sessions = user.sessions as UserSession[];
    const session = sessions.find(s => s.token === token);
    
    if (!session || session.used || new Date() > new Date(session.expiresAt)) {
      return null;
    }

    return user;
  }

  static async invalidateSession(token: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: {
        sessions: {
          path: [],
          array_contains: [{ token }],
        },
      },
    });

    if (!user) return;

    const sessions = user.sessions as UserSession[];
    const sessionIndex = sessions.findIndex(s => s.token === token);
    
    if (sessionIndex === -1) return;

    sessions[sessionIndex] = {
      ...sessions[sessionIndex],
      used: true,
    };

    await prisma.user.update({
      where: { id: user.id },
      data: { sessions },
    });
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
}