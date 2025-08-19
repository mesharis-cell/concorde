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
            users: { where: { assigned: true } },
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
              users: { where: { assigned: true } },
              activities: { where: { deleted: false } },
            },
          },
        },
      }),
      prisma.group.count({ where }),
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
      where: { groupId, assigned: true },
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
            users: { where: { assigned: true } },
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

    if (filters.search) {
      // Search in profile JSON field
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
}