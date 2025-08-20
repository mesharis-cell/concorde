import { prisma } from '../config/database.js';
import type { CreateEvent, Pagination, PaginatedResponse } from '../types/index.js';
import type { Event } from '@prisma/client';

export class EventService {
  static async create(data: CreateEvent): Promise<Event> {
    return prisma.event.create({
      data: {
        name: data.name,
        shortName: data.shortName,
        location: data.location,
        dateRange: data.dateRange,
        config: data.config,
      },
    });
  }

  static async findById(id: string): Promise<Event | null> {
    return prisma.event.findUnique({
      where: { id },
    });
  }

  static async findAll(
    pagination: Pagination,
    filters: {
      active?: boolean;
      search?: string;
    } = {}
  ): Promise<PaginatedResponse<Event>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { shortName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await prisma.$transaction([
      prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          adminEvents: {
            include: {
              admin: {
                select: { id: true, email: true, firstName: true, lastName: true, role: true, active: true },
              },
            },
          },
        },
      }),
      prisma.event.count({ where }),
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

  static async update(id: string, data: Partial<CreateEvent>): Promise<Event> {
    return prisma.event.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.shortName && { shortName: data.shortName }),
        ...(data.location && { location: data.location }),
        ...(data.dateRange && { dateRange: data.dateRange }),
        ...(data.config && { config: data.config }),
      },
    });
  }

  static async deactivate(id: string): Promise<Event> {
    return prisma.event.update({
      where: { id },
      data: { active: false },
    });
  }

  static async activate(id: string): Promise<Event> {
    return prisma.event.update({
      where: { id },
      data: { active: true },
    });
  }

  static async delete(id: string): Promise<void> {
    // Soft delete - just deactivate
    await this.deactivate(id);
  }

  static async getWithStats(id: string) {
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            groups: true,
            activities: true,
            users: true,
            messages: true,
          },
        },
      },
    });

    if (!event) return null;

    // Get additional stats
    const [assignedUsers, unassignedUsers, activeGroups] = await prisma.$transaction([
      prisma.user.count({
        where: { eventId: id, assigned: true },
      }),
      prisma.user.count({
        where: { eventId: id, assigned: false },
      }),
      prisma.group.count({
        where: { eventId: id, active: true, deleted: false },
      }),
    ]);

    return {
      ...event,
      stats: {
        totalGroups: event._count.groups,
        activeGroups,
        totalActivities: event._count.activities,
        totalUsers: event._count.users,
        assignedUsers,
        unassignedUsers,
        totalMessages: event._count.messages,
      },
    };
  }
}