import { prisma } from '../config/database.js';
import type { Pagination, PaginatedResponse } from '../types/index.js';
import type { RoomAssignment } from '@prisma/client';
import { AuditTrailService } from './audit-trail.js';

export interface CreateRoomAssignment {
  userId: string;
  eventId: string;
  hotelId: string;
  roomTypeId: string;
  assignedBy: string;
  hotelNotes?: string;
  billingNotes?: string;
  bookingConfirmationNumber?: string;
}

export interface UpdateRoomAssignment {
  hotelId?: string;
  roomTypeId?: string;
  hotelNotes?: string;
  billingNotes?: string;
  bookingConfirmationNumber?: string;
  updatedBy: string;
}

export interface RoomInventory {
  roomTypeId: string;
  roomTypeName: string;
  hotelId: string;
  hotelName: string;
  allocated: number;
  maxOccupancy: number;
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
          hotelId: data.hotelId,
          roomTypeId: data.roomTypeId,
          updatedBy: data.assignedBy,
          hotelNotes: data.hotelNotes || existingAssignment.hotelNotes,
          billingNotes: data.billingNotes || existingAssignment.billingNotes,
          bookingConfirmationNumber: data.bookingConfirmationNumber || existingAssignment.bookingConfirmationNumber,
        },
      });

      // Log audit trail for room assignment update
      const changedFields = [];
      if (existingAssignment.hotelId !== updatedAssignment.hotelId) changedFields.push('hotelId');
      if (existingAssignment.roomTypeId !== updatedAssignment.roomTypeId) changedFields.push('roomTypeId');
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

    // Verify hotel and room type exist and belong to the event
    const roomType = await prisma.roomType.findUnique({
      where: { id: data.roomTypeId },
      include: { hotel: true },
    });

    if (!roomType) {
      throw new Error('Room type not found');
    }

    if (roomType.eventId !== data.eventId) {
      throw new Error('Room type does not belong to this event');
    }

    if (roomType.hotelId !== data.hotelId) {
      throw new Error('Room type does not belong to the specified hotel');
    }

    // Check room availability using the room matrix
    await this.checkRoomAvailability(data.eventId, roomType.hotel.name, roomType.name, accommodation);

    // Create room assignment
    const assignment = await prisma.roomAssignment.create({
      data: {
        userId: data.userId,
        eventId: data.eventId,
        hotelId: data.hotelId,
        roomTypeId: data.roomTypeId,
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
      nightsCount: this.calculateNights(accommodation.checkIn, accommodation.checkOut),
    };

    await prisma.user.update({
      where: { id: data.userId },
      data: {
        accommodation: updatedAccommodation,
        hotelId: data.hotelId, // Update hotel reference on user
      },
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
      summary: `Assigned ${roomType.name} room at ${roomType.hotel.name} to user ${userEmail} (by ${admin?.email || 'Unknown Admin'})`,
      metadata: {
        userEmail,
        adminEmail: admin?.email,
        hotelId: data.hotelId,
        roomTypeId: data.roomTypeId,
        roomTypeName: roomType.name,
        hotelName: roomType.hotel.name,
        assignmentId: assignment.id,
      },
    });

    // Update event hotel configuration allocated counts
    await this.updateEventRoomAllocations(data.eventId);

    return assignment;
  }

  /**
   * Check room availability using the room matrix
   */
  static async checkRoomAvailability(
    eventId: string,
    hotelName: string,
    roomTypeName: string,
    accommodation: any
  ): Promise<void> {
    if (!accommodation?.checkIn || !accommodation?.checkOut) {
      throw new Error('User accommodation dates are required for room assignment');
    }

    // Get event hotel configuration
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hotelConfig: true },
    });

    if (!event?.hotelConfig) {
      throw new Error('Hotel configuration not found for this event');
    }

    const hotelConfig = event.hotelConfig as any;
    const hotel = hotelConfig.hotels?.find((h: any) => h.name === hotelName);

    if (!hotel || !hotel.contractedRooms) {
      throw new Error(`Room matrix not configured for hotel: ${hotelName}`);
    }

    // Generate user's stay dates in dd/MM/yyyy format
    let checkIn: Date;
    let checkOut: Date;

    // Handle both string dates (dd/MM/yyyy) and Date objects
    if (typeof accommodation.checkIn === 'string') {
      // Parse dd/MM/yyyy format
      const [day, month, year] = accommodation.checkIn.split('/').map(n => parseInt(n));
      checkIn = new Date(year, month - 1, day);
    } else {
      checkIn = new Date(accommodation.checkIn);
    }

    if (typeof accommodation.checkOut === 'string') {
      // Parse dd/MM/yyyy format
      const [day, month, year] = accommodation.checkOut.split('/').map(n => parseInt(n));
      checkOut = new Date(year, month - 1, day);
    } else {
      checkOut = new Date(accommodation.checkOut);
    }

    const stayDates = [];
    const current = new Date(checkIn);

    while (current < checkOut) {
      // Format as dd/MM/yyyy to match room matrix
      const dateStr = `${current.getDate().toString().padStart(2, '0')}/${(current.getMonth() + 1).toString().padStart(2, '0')}/${current.getFullYear()}`;
      stayDates.push(dateStr);
      current.setDate(current.getDate() + 1);
    }

    // Check availability for each date of the stay
    for (const dateStr of stayDates) {
      const contractedRoom = hotel.contractedRooms.find(
        (cr: any) => cr.date === dateStr && cr.roomType === roomTypeName
      );

      if (!contractedRoom) {
        throw new Error(
          `No room inventory configured for ${roomTypeName} at ${hotelName} on ${dateStr}`
        );
      }

      if (contractedRoom.allocated >= contractedRoom.quantity) {
        throw new Error(
          `No available ${roomTypeName} rooms at ${hotelName} on ${dateStr} (${contractedRoom.allocated}/${contractedRoom.quantity} used)`
        );
      }
    }
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

    // If changing hotel or room type, check availability
    if (data.hotelId || data.roomTypeId) {
      const hotelId = data.hotelId || assignment.hotelId;
      const roomTypeId = data.roomTypeId || assignment.roomTypeId;

      // Get hotel and room type info
      const roomType = await prisma.roomType.findUnique({
        where: { id: roomTypeId },
        include: { hotel: true },
      });

      if (!roomType || roomType.hotelId !== hotelId) {
        throw new Error('Invalid hotel or room type combination');
      }

      // Get user accommodation details
      const user = await prisma.user.findUnique({
        where: { id: assignment.userId },
        select: { accommodation: true },
      });

      if (user?.accommodation) {
        // Check availability for the new assignment
        await this.checkRoomAvailability(
          assignment.eventId,
          roomType.hotel.name,
          roomType.name,
          user.accommodation
        );
      }
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

    // Update event hotel configuration allocated counts if room type or hotel changed
    if (data.hotelId || data.roomTypeId) {
      await this.updateEventRoomAllocations(assignment.eventId);
    }

    return updatedAssignment;
  }

  /**
   * Get room availability for a specific room type
   */
  static async getRoomAvailability(
    eventId: string,
    roomTypeId: string
  ): Promise<{ allocated: number; capacity: number; available: number }> {
    const [roomType, event] = await Promise.all([
      prisma.roomType.findUnique({
        where: { id: roomTypeId },
        select: { id: true, name: true, eventId: true },
      }),
      prisma.event.findUnique({
        where: { id: eventId },
        select: { hotelConfig: true },
      }),
    ]);

    if (!roomType || roomType.eventId !== eventId) {
      throw new Error('Room type not found or does not belong to this event');
    }

    // Count allocated rooms for this room type
    const allocated = await prisma.roomAssignment.count({
      where: {
        eventId,
        roomTypeId,
      },
    });

    // 🎯 FIX: Calculate real capacity from hotel configuration
    let capacity = 0;
    if (event?.hotelConfig) {
      const hotelConfig = event.hotelConfig as any;
      if (hotelConfig.hotels) {
        for (const hotel of hotelConfig.hotels) {
          if (hotel.contractedRooms) {
            for (const contractedRoom of hotel.contractedRooms) {
              if (contractedRoom.roomType === roomType.name) {
                capacity += contractedRoom.quantity || 0;
              }
            }
          }
        }
      }
    }

    return {
      allocated,
      capacity,
      available: capacity - allocated,
    };
  }

  /**
   * Get room allocation summary for an event
   */
  static async getAllocationSummary(eventId: string): Promise<RoomAllocationSummary> {
    const [users, assignments, roomTypes, event] = await Promise.all([
      prisma.user.findMany({
        where: { eventId, active: true },
        select: { accommodation: true },
      }),
      prisma.roomAssignment.findMany({
        where: { eventId },
        include: {
          roomType: { select: { name: true } }, // 🎯 Removed maxOccupancy - not needed
        },
      }),
      prisma.roomType.findMany({
        where: { eventId, active: true },
        select: { id: true, name: true }, // 🎯 Removed maxOccupancy - not needed
      }),
      prisma.event.findUnique({
        where: { id: eventId },
        select: { hotelConfig: true },
      }),
    ]);

    const usersRequiringRooms = users.filter(
      u => (u.accommodation as any)?.required
    ).length;

    // Get room type breakdown using normalized data
    const roomTypeAssignments: Record<string, number> = {};
    for (const assignment of assignments) {
      const roomTypeName = assignment.roomType.name;
      roomTypeAssignments[roomTypeName] =
        (roomTypeAssignments[roomTypeName] || 0) + 1;
    }

    // Calculate real capacity from hotel configuration
    const roomTypeCapacities: Record<string, number> = {};
    if (event?.hotelConfig) {
      const hotelConfig = event.hotelConfig as any;
      if (hotelConfig.hotels) {
        for (const hotel of hotelConfig.hotels) {
          if (hotel.contractedRooms) {
            for (const contractedRoom of hotel.contractedRooms) {
              const roomTypeName = contractedRoom.roomType;
              roomTypeCapacities[roomTypeName] =
                (roomTypeCapacities[roomTypeName] || 0) + (contractedRoom.quantity || 0);
            }
          }
        }
      }
    }

    const roomTypeBreakdown = roomTypes.map(roomType => {
      const assigned = roomTypeAssignments[roomType.name] || 0;
      const capacity = roomTypeCapacities[roomType.name] || 0; // 🎯 FIX: Use actual room inventory

      return {
        roomType: roomType.name,
        assigned,
        capacity,
        utilization: capacity > 0 ? Math.round((assigned / capacity) * 100) : 0,
      };
    });

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
      // Get room type ID for the filter
      const roomTypeRecord = await prisma.roomType.findFirst({
        where: {
          eventId,
          name: filters.roomType,
          active: true,
        },
      });

      if (roomTypeRecord) {
        filteredUsers = users.filter(user =>
          user.roomAssignments[0]?.roomTypeId === roomTypeRecord.id
        );
      }
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

    // Handle room drop inventory if assigning a new room drop
    if (roomDropId && roomDropId !== user.roomDropAssigned) {
      await this.checkAndUpdateRoomDropInventory(user.eventId, roomDropId, 'assign');
    }

    // Handle room drop inventory if unassigning an existing room drop
    if (user.roomDropAssigned && user.roomDropAssigned !== roomDropId) {
      await this.checkAndUpdateRoomDropInventory(user.eventId, user.roomDropAssigned, 'unassign');
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
    const [roomTypes, event] = await Promise.all([
      prisma.roomType.findMany({
        where: { eventId, active: true },
        include: {
          hotel: { select: { id: true, name: true } },
        },
      }),
      prisma.event.findUnique({
        where: { id: eventId },
        select: { hotelConfig: true },
      }),
    ]);

    // Calculate room capacities from hotel configuration
    const roomTypeCapacities: Record<string, number> = {};
    if (event?.hotelConfig) {
      const hotelConfig = event.hotelConfig as any;
      if (hotelConfig.hotels) {
        for (const hotel of hotelConfig.hotels) {
          if (hotel.contractedRooms) {
            for (const contractedRoom of hotel.contractedRooms) {
              const roomTypeName = contractedRoom.roomType;
              roomTypeCapacities[roomTypeName] =
                (roomTypeCapacities[roomTypeName] || 0) + (contractedRoom.quantity || 0);
            }
          }
        }
      }
    }

    const inventory: RoomInventory[] = [];

    for (const roomType of roomTypes) {
      // Get allocation count for this room type
      const allocated = await prisma.roomAssignment.count({
        where: {
          eventId,
          roomTypeId: roomType.id,
        },
      });

      const capacity = roomTypeCapacities[roomType.name] || 0; // 🎯 FIX: Use real room inventory

      inventory.push({
        roomTypeId: roomType.id,
        roomTypeName: roomType.name,
        hotelId: roomType.hotelId,
        hotelName: roomType.hotel.name,
        allocated,
        maxOccupancy: capacity, // Keep interface compatibility but use real capacity
        available: capacity - allocated,
      });
    }

    return inventory;
  }

  /**
   * Export rooming list for hotels
   */
  static async exportRoomingList(eventId: string): Promise<Array<{
    roomType: string;
    hotelName: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    specialRequests?: string;
    bookingConfirmation?: string;
    guestCategory?: string;
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
        roomType: { select: { name: true } },
        hotel: { select: { name: true } },
      },
      orderBy: [
        { hotel: { name: 'asc' } },
        { roomType: { name: 'asc' } },
      ],
    });

    return assignments.map(assignment => {
      const profile = assignment.user.profile as any;
      const accommodation = assignment.user.accommodation as any;

      return {
        roomType: assignment.roomType.name,
        hotelName: assignment.hotel.name,
        guestName: `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
        checkIn: accommodation?.checkIn ? new Date(accommodation.checkIn).toISOString().split('T')[0] : 'TBD',
        checkOut: accommodation?.checkOut ? new Date(accommodation.checkOut).toISOString().split('T')[0] : 'TBD',
        specialRequests: accommodation?.specialRequests || '',
        bookingConfirmation: assignment.bookingConfirmationNumber || '',
        guestCategory: assignment.user.guestCategory || 'Standard',
      };
    });
  }


  /**
   * Check and update room drop inventory
   */
  static async checkAndUpdateRoomDropInventory(
    eventId: string,
    roomDropId: string,
    action: 'assign' | 'unassign'
  ): Promise<void> {
    // Get event room drops configuration
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { roomDrops: true },
    });

    if (!event?.roomDrops) {
      throw new Error('Room drops configuration not found for this event');
    }

    const roomDrops = event.roomDrops as any;
    const roomDrop = roomDrops.drops?.find((drop: any) => drop.id === roomDropId);

    if (!roomDrop) {
      throw new Error(`Room drop package not found: ${roomDropId}`);
    }

    if (action === 'assign') {
      // Check if room drop is available
      if (roomDrop.assigned >= roomDrop.stock) {
        throw new Error(
          `No available ${roomDrop.name} packages (${roomDrop.assigned}/${roomDrop.stock} used)`
        );
      }

      // Increment assigned count
      roomDrop.assigned = (roomDrop.assigned || 0) + 1;
    } else {
      // Decrement assigned count
      roomDrop.assigned = Math.max((roomDrop.assigned || 0) - 1, 0);
    }

    // Update the event configuration
    await prisma.event.update({
      where: { id: eventId },
      data: {
        roomDrops: roomDrops,
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
        nightsCount: undefined,
      };

      await prisma.user.update({
        where: { id: assignment.userId },
        data: {
          accommodation: updatedAccommodation,
          hotelId: null,
        },
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
      summary: `Removed room assignment from user ${userEmail} (by ${admin?.email || 'Unknown Admin'})`,
      metadata: {
        userEmail,
        adminEmail: admin?.email,
        assignmentId,
      },
    });

    // Update event hotel configuration allocated counts
    await this.updateEventRoomAllocations(assignment.eventId);
  }

  /**
   * Update event hotel configuration with real-time allocated counts
   */
  /**
   * Validate room matrix integrity
   */
  static async validateRoomMatrix(eventId: string): Promise<{
    isValid: boolean;
    errors: string[];
    summary: {
      totalContractedRooms: number;
      totalAllocatedRooms: number;
      overAllocatedDates: string[];
    };
  }> {
    const errors: string[] = [];
    const overAllocatedDates: string[] = [];
    let totalContractedRooms = 0;
    let totalAllocatedRooms = 0;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hotelConfig: true },
    });

    if (!event?.hotelConfig) {
      return {
        isValid: false,
        errors: ['No hotel configuration found'],
        summary: { totalContractedRooms: 0, totalAllocatedRooms: 0, overAllocatedDates: [] }
      };
    }

    const hotelConfig = event.hotelConfig as any;

    for (const hotel of hotelConfig.hotels || []) {
      for (const contractedRoom of hotel.contractedRooms || []) {
        totalContractedRooms += contractedRoom.quantity;
        totalAllocatedRooms += contractedRoom.allocated || 0;

        if ((contractedRoom.allocated || 0) > contractedRoom.quantity) {
          const overageAmount = (contractedRoom.allocated || 0) - contractedRoom.quantity;
          overAllocatedDates.push(`${hotel.name} - ${contractedRoom.roomType} on ${contractedRoom.date}: ${overageAmount} over capacity`);
          errors.push(`Over-allocated: ${hotel.name} - ${contractedRoom.roomType} on ${contractedRoom.date}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      summary: {
        totalContractedRooms,
        totalAllocatedRooms,
        overAllocatedDates
      }
    };
  }

  static async updateEventRoomAllocations(eventId: string): Promise<void> {
    try {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { hotelConfig: true },
      });

      if (!event?.hotelConfig) return;

      const hotelConfig = event.hotelConfig as any;
      if (!hotelConfig.hotels) return;

      // Get all room assignments for this event
      const roomAssignments = await prisma.roomAssignment.findMany({
        where: { eventId },
        include: {
          roomType: { select: { name: true } },
          user: {
            select: {
              accommodation: true,
            },
          },
        },
      });

      // Calculate allocated counts for each hotel and room type by date
      for (const hotel of hotelConfig.hotels) {
        if (!hotel.contractedRooms) continue;

        for (const contractedRoom of hotel.contractedRooms) {
          const roomDateStr = contractedRoom.date; // Now a dd/MM/yyyy string
          const roomTypeName = contractedRoom.roomType;

          // Parse the contracted room date
          let roomDate: Date;
          if (typeof roomDateStr === 'string' && roomDateStr.includes('/')) {
            const [day, month, year] = roomDateStr.split('/').map(n => parseInt(n));
            roomDate = new Date(year, month - 1, day);
          } else {
            roomDate = new Date(roomDateStr);
          }

          // Count how many assignments exist for this room type and date
          const allocatedCount = roomAssignments.filter((assignment) => {
            const assignmentRoomType = assignment.roomType.name;
            const userAccommodation = assignment.user.accommodation as any;

            if (assignmentRoomType !== roomTypeName) return false;

            // Check if user is staying on this specific date
            if (userAccommodation?.checkIn && userAccommodation?.checkOut) {
              let checkIn: Date;
              let checkOut: Date;

              // Handle both string dates (dd/MM/yyyy) and Date objects for user accommodation
              if (typeof userAccommodation.checkIn === 'string' && userAccommodation.checkIn.includes('/')) {
                const [day, month, year] = userAccommodation.checkIn.split('/').map(n => parseInt(n));
                checkIn = new Date(year, month - 1, day);
              } else {
                checkIn = new Date(userAccommodation.checkIn);
              }

              if (typeof userAccommodation.checkOut === 'string' && userAccommodation.checkOut.includes('/')) {
                const [day, month, year] = userAccommodation.checkOut.split('/').map(n => parseInt(n));
                checkOut = new Date(year, month - 1, day);
              } else {
                checkOut = new Date(userAccommodation.checkOut);
              }

              return roomDate >= checkIn && roomDate < checkOut;
            }

            return false;
          }).length;

          // Update allocated count
          contractedRoom.allocated = allocatedCount;
        }
      }

      // Update the event with new allocated counts
      await prisma.event.update({
        where: { id: eventId },
        data: {
          hotelConfig: hotelConfig,
        },
      });

      // Validate room matrix integrity after update
      const validation = await this.validateRoomMatrix(eventId);
      if (!validation.isValid) {
        console.warn(`⚠️ Room matrix integrity issues for event ${eventId}:`, validation.errors);
      } else {
        console.log(`✅ Updated room allocations for event ${eventId} - Matrix validated: ${validation.summary.totalAllocatedRooms}/${validation.summary.totalContractedRooms} rooms allocated`);
      }
    } catch (error) {
      console.error('❌ Failed to update event room allocations:', error);
    }
  }
}