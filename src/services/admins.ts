import { prisma } from '../config/database.js';
import bcrypt from 'bcryptjs';
import type { CreateAdmin, AdminLogin, Pagination, PaginatedResponse } from '../types/index.js';
import type { Admin } from '@prisma/client';

export class AdminService {
  static async create(data: CreateAdmin): Promise<Omit<Admin, 'passwordHash'>> {
    const hashedPassword = await bcrypt.hash(data.password, 12);

    // With Prisma v6 omit, passwordHash is automatically excluded from the result
    const admin = await prisma.admin.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash: hashedPassword,
        role: data.role,
      },
    });

    return admin;
  }

  static async findById(id: string): Promise<Omit<Admin, 'passwordHash'> | null> {
    // With Prisma v6 omit feature, passwordHash is automatically omitted
    const admin = await prisma.admin.findUnique({
      where: { id, active: true },
      include: {
        adminEvents: {
          include: {
            event: {
              select: { id: true, name: true, shortName: true, active: true },
            },
          },
        },
      },
    });

    return admin;
  }

  static async findByEmail(email: string): Promise<Admin | null> {
    // For authentication, we need the passwordHash, so we override the global omit
    return prisma.admin.findUnique({
      where: { email, active: true },
      omit: {
        passwordHash: false, // Include passwordHash for authentication
      },
    });
  }

  static async findAll(
    pagination: Pagination,
    filters: {
      role?: 'SUPER' | 'STANDARD';
      search?: string;
    } = {}
  ): Promise<PaginatedResponse<Omit<Admin, 'passwordHash'>>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = { active: true };
    
    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [admins, total] = await prisma.$transaction([
      prisma.admin.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        // With Prisma v6 omit, we don't need to manually select fields to exclude passwordHash
      }),
      prisma.admin.count({ where }),
    ]);

    return {
      items: admins,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async authenticate(credentials: AdminLogin): Promise<Omit<Admin, 'passwordHash'> | null> {
    const admin = await this.findByEmail(credentials.email);
    if (!admin) return null;

    const isValidPassword = await bcrypt.compare(credentials.password, admin.passwordHash);
    if (!isValidPassword) return null;

    // Update last login and return admin without passwordHash (using Prisma v6 omit)
    const updatedAdmin = await prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    return updatedAdmin;
  }

  static async update(
    id: string, 
    data: Partial<Omit<CreateAdmin, 'password'>>
  ): Promise<Omit<Admin, 'passwordHash'>> {
    const updateData: any = {};

    if (data.firstName) updateData.firstName = data.firstName;
    if (data.lastName) updateData.lastName = data.lastName;
    if (data.email) updateData.email = data.email;
    if (data.role) updateData.role = data.role;

    // With Prisma v6 omit, passwordHash is automatically excluded
    const admin = await prisma.admin.update({
      where: { id },
      data: updateData,
    });

    return admin;
  }

  static async changePassword(id: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.admin.update({
      where: { id },
      data: { passwordHash: hashedPassword },
    });
  }

  static async deactivate(id: string): Promise<Omit<Admin, 'passwordHash'>> {
    // With Prisma v6 omit, passwordHash is automatically excluded
    const admin = await prisma.admin.update({
      where: { id },
      data: { active: false },
    });

    return admin;
  }

  static async activate(id: string): Promise<Omit<Admin, 'passwordHash'>> {
    // With Prisma v6 omit, passwordHash is automatically excluded
    const admin = await prisma.admin.update({
      where: { id },
      data: { active: true },
    });

    return admin;
  }

  static async assignToEvent(adminId: string, eventId: string): Promise<void> {
    // Check if assignment already exists
    const existing = await prisma.adminEvent.findUnique({
      where: {
        adminId_eventId: {
          adminId,
          eventId,
        },
      },
    });

    if (existing) return;

    await prisma.adminEvent.create({
      data: {
        adminId,
        eventId,
      },
    });
  }

  static async unassignFromEvent(adminId: string, eventId: string): Promise<void> {
    await prisma.adminEvent.delete({
      where: {
        adminId_eventId: {
          adminId,
          eventId,
        },
      },
    });
  }

  static async getAssignedEvents(adminId: string) {
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      include: {
        adminEvents: {
          include: {
            event: {
              select: {
                id: true,
                name: true,
                shortName: true,
                location: true,
                dateRange: true,
                active: true,
              },
            },
          },
        },
      },
    });

    if (!admin) return [];

    return admin.adminEvents.map(ae => ae.event);
  }

  static async hasEventAccess(adminId: string, eventId: string): Promise<boolean> {
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      select: { role: true },
    });

    if (!admin) return false;

    // Super admins have access to all events
    if (admin.role === 'SUPER') return true;

    // Standard admins need explicit assignment
    const assignment = await prisma.adminEvent.findUnique({
      where: {
        adminId_eventId: {
          adminId,
          eventId,
        },
      },
    });

    return !!assignment;
  }
}