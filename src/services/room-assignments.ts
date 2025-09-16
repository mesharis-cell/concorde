import { prisma } from '../config/database.js';
import type { Pagination, PaginatedResponse } from '../types/index.js';
import type { RoomAssignment } from '@prisma/client';
import { AuditTrailService } from './audit-trail.js';

export interface CreateRoomAssignment {
  userId: string;
  eventId: string;
  roomType: string;
  roomNumber?: string;
  status?: string;
  assignedBy: string;
  hotelNotes?: string;
  billingNotes?: string;
  bookingConfirmationNumber?: string;
}

export interface UpdateRoomAssignment {
  roomType?: string;
  roomNumber?: string;
  status?: 'pending' | 'confirmed' | 'checked_in' | 'checked_out';
  hotelNotes?: string;
  billingNotes?: string;
  bookingConfirmationNumber?: string;
  updatedBy: string;
}

export interface RoomInventory {
  roomType: string;
  date: string;
  contracted: number;
  allocated: number;
  available: number;
}

export interface RoomAllocationSummary {
  totalUsers: number;
  usersRequiringRooms: number;
  usersAssignedRooms: number;
  unassignedUsers: number;
  roomTypeBreakdown: Array<{
    roomType: string;
    assigned: number;
    capacity: number;
    utilization: number;
  }>;
}

export class RoomAssignmentService {
  /**
   * Assign a room to a user
   */
  static async assignRoom(data: CreateRoomAssignment): Promise<RoomAssignment> {
    // Check if user already has a room assignment for this event
    const existingAssignment = await prisma.roomAssignment.findUnique({
      where: { userId_eventId: { userId: data.userId, eventId: data.eventId } },
    });

    // If assignment exists, update it instead of creating new one
    if (existingAssignment) {
      const updatedAssignment = await prisma.roomAssignment.update({
        where: { userId_eventId: { userId: data.userId, eventId: data.eventId } },
        data: {
          roomType: data.roomType,
          roomNumber: data.roomNumber || existingAssignment.roomNumber,
          status: data.status || (data.roomNumber ? 'confirmed' : 'assigned'), // assigned → confirmed when room number provided
          updatedBy: data.assignedBy,
          hotelNotes: data.hotelNotes || existingAssignment.hotelNotes,
          billingNotes: data.billingNotes || existingAssignment.billingNotes,
          bookingConfirmationNumber: data.bookingConfirmationNumber || existingAssignment.bookingConfirmationNumber,
        },
      });

      // Log audit trail for room assignment update
      const changedFields = [];
      if (existingAssignment.roomType !== updatedAssignment.roomType) changedFields.push('roomType');
      if (existingAssignment.roomNumber !== updatedAssignment.roomNumber) changedFields.push('roomNumber');
      if (existingAssignment.status !== updatedAssignment.status) changedFields.push('status');
      if (existingAssignment.hotelNotes !== updatedAssignment.hotelNotes) changedFields.push('hotelNotes');
      if (existingAssignment.billingNotes !== updatedAssignment.billingNotes) changedFields.push('billingNotes');

      await AuditTrailService.logUpdate(
        'RoomAssignment',
        updatedAssignment.id,
        existingAssignment,
        updatedAssignment,
        changedFields,
        data.assignedBy,
        data.eventId
      );

      return updatedAssignment;
    }

    // Verify user exists and requires accommodation
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { 
        accommodation: true, 
        profile: true,
        eventId: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.eventId !== data.eventId) {
      throw new Error('User does not belong to this event');
    }

    const accommodation = user.accommodation as any;
    if (!accommodation?.required) {
      throw new Error('User does not require accommodation');
    }

    // Check room availability
    const availability = await this.getRoomAvailability(data.eventId, data.roomType);
    if (availability.available <= 0) {
      throw new Error(`No ${data.roomType} rooms available`);
    }

    // Create room assignment
    const assignment = await prisma.roomAssignment.create({
      data: {
        userId: data.userId,
        eventId: data.eventId,
        roomType: data.roomType,
        roomNumber: data.roomNumber,
        status: data.status || 'assigned', // Default to 'assigned' when room is assigned
        assignedBy: data.assignedBy,
        updatedBy: data.assignedBy,
        hotelNotes: data.hotelNotes,
        billingNotes: data.billingNotes,
        bookingConfirmationNumber: data.bookingConfirmationNumber,
      },
    });

    // Update user accommodation with room assignment details
    const updatedAccommodation = {
      ...accommodation,
      roomType: data.roomType,
      nightsCount: this.calculateNights(accommodation.checkIn, accommodation.checkOut),
    };

    await prisma.user.update({
      where: { id: data.userId },
      data: { accommodation: updatedAccommodation },
    });

    // Log audit trail
    const userEmail = (user.profile as any)?.email || 'Unknown User';
    const admin = await prisma.admin.findUnique({
      where: { id: data.assignedBy },
      select: { email: true },
    });

    await AuditTrailService.log({
      action: 'ASSIGN',
      resourceType: 'User',
      resourceId: data.userId,
      eventId: data.eventId,
      performedBy: data.assignedBy,
      performedByType: 'ADMIN',
      summary: `Assigned ${data.roomType} room to user ${userEmail} (by ${admin?.email || 'Unknown Admin'})`,
      metadata: {
        userEmail,
        adminEmail: admin?.email,
        roomType: data.roomType,
        assignmentId: assignment.id,
      },
    });

    return assignment;
  }

  /**
   * Update room assignment
   */
  static async updateAssignment(
    assignmentId: string,
    data: UpdateRoomAssignment
  ): Promise<RoomAssignment> {
    const assignment = await prisma.roomAssignment.findUnique({
      where: { id: assignmentId },
      include: { user: { select: { profile: true } } },
    });

    if (!assignment) {
      throw new Error('Room assignment not found');
    }

    const updatedAssignment = await prisma.roomAssignment.update({
      where: { id: assignmentId },
      data: {
        ...data,
        updatedBy: data.updatedBy,
      },
    });

    // Log audit trail
    const userEmail = (assignment.user.profile as any)?.email || 'Unknown User';
    const admin = await prisma.admin.findUnique({
      where: { id: data.updatedBy },
      select: { email: true },
    });

    const changes = Object.keys(data).filter(key => key !== 'updatedBy');
    await AuditTrailService.log({
      action: 'UPDATE',
      resourceType: 'User',
      resourceId: assignment.userId,
      eventId: assignment.eventId,
      performedBy: data.updatedBy,
      performedByType: 'ADMIN',
      summary: `Updated room assignment for user ${userEmail} - Changed: ${changes.join(', ')} (by ${admin?.email || 'Unknown Admin'})`,
      metadata: {
        userEmail,
        adminEmail: admin?.email,
        assignmentId,
        changes,
      },
    });

    return updatedAssignment;
  }

  /**
   * Get room availability for a specific room type
   */
  static async getRoomAvailability(
    eventId: string,
    roomType: string
  ): Promise<{ contracted: number; allocated: number; available: number }> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hotelConfig: true },
    });

    if (!event?.hotelConfig) {
      throw new Error('Hotel configuration not found for this event');
    }

    const hotelConfig = event.hotelConfig as any;
    const hotels = hotelConfig.hotels || [];
    
    // Sum contracted rooms across all hotels for this room type
    let totalContracted = 0;
    for (const hotel of hotels) {
      const contractedRooms = hotel.contractedRooms || [];
      for (const room of contractedRooms) {
        if (room.roomType === roomType) {
          totalContracted += room.quantity || 0;
        }
      }
    }

    // Count allocated rooms
    const allocated = await prisma.roomAssignment.count({
      where: {
        eventId,
        roomType,
      },
    });

    return {
      contracted: totalContracted,
      allocated,
      available: totalContracted - allocated,
    };
  }

  /**
   * Get room allocation summary for an event
   */
  static async getAllocationSummary(eventId: string): Promise<RoomAllocationSummary> {
    const [users, assignments, event] = await Promise.all([
      prisma.user.findMany({
        where: { eventId, active: true },
        select: { accommodation: true },
      }),
      prisma.roomAssignment.findMany({
        where: { eventId },
        select: { roomType: true },
      }),
      prisma.event.findUnique({
        where: { id: eventId },
        select: { hotelConfig: true },
      }),
    ]);

    const usersRequiringRooms = users.filter(
      u => (u.accommodation as any)?.required
    ).length;

    // Get room type breakdown
    const hotelConfig = event?.hotelConfig as any;
    const hotels = hotelConfig?.hotels || [];
    
    const roomTypeCapacities: Record<string, number> = {};
    for (const hotel of hotels) {
      const contractedRooms = hotel.contractedRooms || [];
      for (const room of contractedRooms) {
        roomTypeCapacities[room.roomType] = 
          (roomTypeCapacities[room.roomType] || 0) + (room.quantity || 0);
      }
    }

    const roomTypeAssignments: Record<string, number> = {};
    for (const assignment of assignments) {
      roomTypeAssignments[assignment.roomType] = 
        (roomTypeAssignments[assignment.roomType] || 0) + 1;
    }

    const roomTypeBreakdown = Object.keys(roomTypeCapacities).map(roomType => ({
      roomType,
      assigned: roomTypeAssignments[roomType] || 0,
      capacity: roomTypeCapacities[roomType],
      utilization: roomTypeCapacities[roomType] > 0 
        ? Math.round(((roomTypeAssignments[roomType] || 0) / roomTypeCapacities[roomType]) * 100)
        : 0,
    }));

    return {
      totalUsers: users.length,
      usersRequiringRooms,
      usersAssignedRooms: assignments.length,
      unassignedUsers: usersRequiringRooms - assignments.length,
      roomTypeBreakdown,
    };
  }

  /**
   * Get users requiring room assignments
   */
  static async getUsersRequiringRooms(
    eventId: string,
    pagination: Pagination,
    filters: {
      assigned?: boolean;
      roomType?: string;
      guestCategory?: string;
    } = {}
  ): Promise<PaginatedResponse<any>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: any = {
      eventId,
      active: true,
      accommodation: { not: null },
    };

    // Filter by assignment status
    if (filters.assigned !== undefined) {
      if (filters.assigned) {
        where.roomAssignment = { isNot: null };
      } else {
        where.roomAssignment = null;
        // Also ensure they actually require accommodation
        where.AND = {
          accommodation: {
            path: ['required'],
            equals: true,
          },
        };
      }
    }

    if (filters.guestCategory) {
      where.guestCategory = filters.guestCategory;
    }

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          roomAssignments: {
            where: { eventId },
          },
        },
        orderBy: [
          { guestCategory: 'asc' },
          { registeredAt: 'desc' },
        ],
      }),
      prisma.user.count({ where }),
    ]);

    // Filter by room type if specified
    let filteredUsers = users;
    if (filters.roomType) {
      filteredUsers = users.filter(user => 
        user.roomAssignments[0]?.roomType === filters.roomType
      );
    }

    return {
      items: filteredUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Assign guest category and room drop to user
   */
  static async assignGuestCategoryAndDrop(
    userId: string,
    guestCategory: string,
    roomDropId: string | null,
    assignedBy: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        profile: true,
        guestCategory: true,
        roomDropAssigned: true,
        eventId: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        guestCategory,
        roomDropAssigned: roomDropId,
      },
    });

    // Log audit trail
    const userEmail = (user.profile as any)?.email || 'Unknown User';
    const admin = await prisma.admin.findUnique({
      where: { id: assignedBy },
      select: { email: true },
    });

    await AuditTrailService.log({
      action: 'UPDATE',
      resourceType: 'User',
      resourceId: userId,
      eventId: user.eventId,
      performedBy: assignedBy,
      performedByType: 'ADMIN',
      summary: `Updated guest category for user ${userEmail} to ${guestCategory}${roomDropId ? ` with room drop` : ''} (by ${admin?.email || 'Unknown Admin'})`,
      metadata: {
        userEmail,
        adminEmail: admin?.email,
        guestCategory,
        roomDropId,
      },
    });
  }

  /**
   * Get room inventory dashboard data
   */
  static async getRoomInventory(eventId: string): Promise<RoomInventory[]> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hotelConfig: true, dateRange: true },
    });

    if (!event?.hotelConfig) {
      return [];
    }

    const hotelConfig = event.hotelConfig as any;
    const hotels = hotelConfig.hotels || [];
    const dateRange = event.dateRange as any;
    
    const inventory: RoomInventory[] = [];
    
    for (const hotel of hotels) {
      const contractedRooms = hotel.contractedRooms || [];
      
      for (const room of contractedRooms) {
        // Get allocation count for this room type and date
        const allocated = await prisma.roomAssignment.count({
          where: {
            eventId,
            roomType: room.roomType,
          },
        });

        inventory.push({
          roomType: room.roomType,
          date: room.date,
          contracted: room.quantity || 0,
          allocated,
          available: (room.quantity || 0) - allocated,
        });
      }
    }

    return inventory;
  }

  /**
   * Export rooming list for hotels
   */
  static async exportRoomingList(eventId: string): Promise<Array<{
    roomNumber: string;
    roomType: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    specialRequests?: string;
    bookingConfirmation?: string;
    guestCategory?: string;
    status: string;
  }>> {
    const assignments = await prisma.roomAssignment.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            profile: true,
            accommodation: true,
            guestCategory: true,
          },
        },
      },
      orderBy: [
        { roomType: 'asc' },
        { roomNumber: 'asc' },
      ],
    });

    return assignments.map(assignment => {
      const profile = assignment.user.profile as any;
      const accommodation = assignment.user.accommodation as any;
      
      return {
        roomNumber: assignment.roomNumber || 'TBD',
        roomType: assignment.roomType,
        guestName: `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
        checkIn: accommodation?.checkIn ? new Date(accommodation.checkIn).toISOString().split('T')[0] : 'TBD',
        checkOut: accommodation?.checkOut ? new Date(accommodation.checkOut).toISOString().split('T')[0] : 'TBD',
        specialRequests: accommodation?.specialRequests || '',
        bookingConfirmation: assignment.bookingConfirmationNumber || '',
        guestCategory: assignment.user.guestCategory || 'Standard',
        status: assignment.status,
      };
    });
  }

  /**
   * Update room numbers (typically received from hotel)
   */
  static async bulkUpdateRoomNumbers(
    updates: Array<{ assignmentId: string; roomNumber: string }>,
    updatedBy: string
  ): Promise<void> {
    await Promise.all(
      updates.map(update =>
        prisma.roomAssignment.update({
          where: { id: update.assignmentId },
          data: {
            roomNumber: update.roomNumber,
            updatedBy,
            status: 'confirmed', // Auto-confirm when room number is assigned
          },
        })
      )
    );

    // Log audit trail for bulk update
    await AuditTrailService.log({
      action: 'UPDATE',
      resourceType: 'BulkOperation',
      resourceId: `room-numbers-${Date.now()}`,
      performedBy: updatedBy,
      performedByType: 'ADMIN',
      summary: `Updated ${updates.length} room numbers from hotel`,
      metadata: {
        updateCount: updates.length,
        updates,
      },
    });
  }

  /**
   * Helper: Calculate number of nights
   */
  private static calculateNights(checkIn: any, checkOut: any): number {
    if (!checkIn || !checkOut) return 0;
    
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Remove room assignment
   */
  static async unassignRoom(assignmentId: string, unassignedBy: string): Promise<void> {
    const assignment = await prisma.roomAssignment.findUnique({
      where: { id: assignmentId },
      include: { user: { select: { profile: true } } },
    });

    if (!assignment) {
      throw new Error('Room assignment not found');
    }

    await prisma.roomAssignment.delete({
      where: { id: assignmentId },
    });

    // Clear room assignment from user accommodation
    const user = await prisma.user.findUnique({
      where: { id: assignment.userId },
      select: { accommodation: true },
    });

    if (user?.accommodation) {
      const accommodation = user.accommodation as any;
      const updatedAccommodation = {
        ...accommodation,
        roomType: undefined,
        roomNumber: undefined,
        nightsCount: undefined,
      };

      await prisma.user.update({
        where: { id: assignment.userId },
        data: { accommodation: updatedAccommodation },
      });
    }

    // Log audit trail
    const userEmail = (assignment.user.profile as any)?.email || 'Unknown User';
    const admin = await prisma.admin.findUnique({
      where: { id: unassignedBy },
      select: { email: true },
    });

    await AuditTrailService.log({
      action: 'UNASSIGN',
      resourceType: 'User',
      resourceId: assignment.userId,
      eventId: assignment.eventId,
      performedBy: unassignedBy,
      performedByType: 'ADMIN',
      summary: `Removed ${assignment.roomType} room assignment from user ${userEmail} (by ${admin?.email || 'Unknown Admin'})`,
      metadata: {
        userEmail,
        adminEmail: admin?.email,
        roomType: assignment.roomType,
        assignmentId,
      },
    });
  }
}