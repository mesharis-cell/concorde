import { prisma } from '../config/database.js';
import type { CreateGroup, UpdateGroup, Pagination, PaginatedResponse } from '../types/index.js';
import type { Group } from '@prisma/client';

export class GroupService {
  static async create(data: CreateGroup): Promise<Group> {
    return prisma.group.create({
      data: {
        eventId: data.eventId,
        name: data.name,
        description: data.description,
      },
    });
  }

  static async findById(id: string): Promise<Group | null> {
    return prisma.group.findUnique({
      where: { id, deleted: false },
      include: {
        event: true,
        _count: {
          select: {
            activities: { where: { deleted: false } },
          },
        },
      },
    });
  }

  static async findByEventId(
    eventId: string,
    pagination: Pagination,
    filters: {
      active?: boolean;
      search?: string;
    } = {}
  ): Promise<PaginatedResponse<Group>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { 
      eventId, 
      deleted: false 
    };
    
    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await prisma.$transaction([
      prisma.group.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              activities: { where: { deleted: false } },
            },
          },
        },
      }),
      prisma.group.count({ where }),
    ]);

    // Calculate user counts manually for multi-group structure
    const enrichedItems = await Promise.all(
      items.map(async (group) => {
        const userCount = await prisma.user.count({
          where: {
            groupIds: { has: group.id },
            assigned: true,
            active: true,
          },
        });

        return {
          ...group,
          memberCount: userCount,
          _count: {
            ...group._count,
            users: userCount,
          },
        };
      })
    );

    return {
      items: enrichedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async update(id: string, data: UpdateGroup): Promise<Group> {
    return prisma.group.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description && { description: data.description }),
      },
    });
  }

  static async updateMemberCount(groupId: string): Promise<void> {
    const count = await prisma.user.count({
      where: { 
        groupIds: { has: groupId }, // User has this group in their groupIds array
        assigned: true,
        active: true,
      },
    });

    await prisma.group.update({
      where: { id: groupId },
      data: { memberCount: count },
    });
  }

  static async deactivate(id: string): Promise<Group> {
    return prisma.group.update({
      where: { id },
      data: { active: false },
    });
  }

  static async activate(id: string): Promise<Group> {
    return prisma.group.update({
      where: { id },
      data: { active: true },
    });
  }

  static async softDelete(id: string): Promise<Group> {
    // Cannot delete group if it has users assigned
    const userCount = await prisma.user.count({
      where: { groupId: id, assigned: true },
    });

    if (userCount > 0) {
      throw new Error('Cannot delete group with assigned users');
    }

    return prisma.group.update({
      where: { id },
      data: { 
        deleted: true,
        deletedAt: new Date(),
        active: false,
      },
    });
  }

  static async getWithDetails(id: string) {
    const group = await prisma.group.findUnique({
      where: { id, deleted: false },
      include: {
        event: true,
        users: {
          where: { assigned: true, active: true },
          select: {
            id: true,
            profile: true,
            communication: true,
            requirements: true,
            assignedAt: true,
          },
        },
        activities: {
          where: { deleted: false, active: true },
          orderBy: { startDateTime: 'asc' },
          select: {
            id: true,
            title: true,
            startDateTime: true,
            endDateTime: true,
            category: true,
            location: true,
          },
        },
        _count: {
          select: {
            activities: { where: { deleted: false } },
          },
        },
      },
    });

    return group;
  }

  static async getMembers(
    groupId: string, 
    pagination: Pagination,
    filters: {
      search?: string;
      hasRequirements?: boolean;
    } = {}
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { 
      groupId, 
      assigned: true,
      active: true,
    };

    // Get all users first, then filter in JavaScript (MongoDB JSON field limitations)
    const allUsers = await prisma.user.findMany({
      where: {
        groupId, 
        assigned: true,
        active: true,
      },
      orderBy: { assignedAt: 'desc' },
      select: {
        id: true,
        profile: true,
        communication: true,
        flight: true,
        accommodation: true,
        requirements: true,
        emergencyContact: true,
        assignedAt: true,
        registeredAt: true,
      },
    });

    // Apply JavaScript filters for JSON field searching
    let filteredUsers = allUsers;

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filteredUsers = filteredUsers.filter(user => {
        const profile = user.profile as any;
        const firstName = profile?.firstName?.toLowerCase() || '';
        const lastName = profile?.lastName?.toLowerCase() || '';
        const email = profile?.email?.toLowerCase() || '';
        return firstName.includes(searchLower) || 
               lastName.includes(searchLower) || 
               email.includes(searchLower);
      });
    }

    if (filters.hasRequirements) {
      filteredUsers = filteredUsers.filter(user => {
        const requirements = user.requirements as any;
        return requirements?.dietary || 
               requirements?.medical || 
               requirements?.accessibility;
      });
    }

    // Apply pagination to filtered results
    const total = filteredUsers.length;
    const items = filteredUsers.slice(skip, skip + limit);

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

  /**
   * Get group members with multi-group support
   */
  static async getMembersWithMultiGroup(
    groupId: string,
    pagination: Pagination,
    filters: { search?: string; hasRequirements?: boolean } = {}
  ): Promise<PaginatedResponse<any>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    // Get all users who have this group in their groupIds array
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: {
          groupIds: { has: groupId },
          assigned: true,
          active: true,
        },
        orderBy: { registeredAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({
        where: {
          groupIds: { has: groupId },
          assigned: true,
          active: true,
        },
      }),
    ]);

    // Enrich users with their other group memberships
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        // Get all groups this user belongs to
        const userGroups = await prisma.group.findMany({
          where: {
            id: { in: user.groupIds },
            active: true,
            deleted: false,
          },
          select: { id: true, name: true },
        });

        return {
          ...user,
          groups: userGroups,
          groupCount: userGroups.length,
        };
      })
    );

    // Apply client-side filtering
    let filtered = enrichedUsers;

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

    return {
      items: filtered,
      pagination: {
        page,
        limit,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / limit),
      },
    };
  }
}