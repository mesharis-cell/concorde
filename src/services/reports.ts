import { prisma } from '../config/database.js';
import * as ExcelJS from 'exceljs';
import type { Pagination } from '../types/index.js';

export interface ReportData {
  headers: string[];
  rows: any[][];
  rowMetadata?: Array<{
    userId?: string;
    entityId?: string;
    entityType?: 'user' | 'activity' | 'group';
    editable: boolean;
  }>;
  metadata?: {
    title: string;
    description: string;
    generatedAt: Date;
    eventName?: string;
    totalCount: number;
  };
}

export class ReportsService {
  /**
   * 1. Arrival List - Transfer coordination for inbound flights
   */
  static async getArrivalListReport(eventId: string): Promise<ReportData> {
    const users = await prisma.user.findMany({
      where: {
        eventId,
        active: true,
        flight: { not: null },
      },
      include: {
        roomAssignments: {
          where: { eventId },
        },
      },
      orderBy: [
        { guestCategory: 'asc' },
        { updatedAt: 'asc' },
      ],
    });

    const headers = [
      'Guest Name',
      'Guest Category', 
      'Email',
      'Phone',
      'Flight Number',
      'Airline',
      'Departure From',
      'Departure Date',
      'Departure Time',
      'Arrival Date',
      'Arrival Time',
      'Arrival Terminal',
      'Room Type',
      'Room Number',
      'Transfer Requirements',
      'Special Requests'
    ];

    const rows = users
      .filter(user => (user.flight as any)?.inbound)
      .map(user => {
        const profile = user.profile as any;
        const flight = (user.flight as any)?.inbound;
        const accommodation = user.accommodation as any;
        const roomAssignment = user.roomAssignments[0];

        return [
          `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
          user.guestCategory || 'Standard',
          profile?.email || '',
          profile?.phone || '',
          flight?.flightNumber || '',
          flight?.airline || '',
          flight?.departureFrom || '',
          flight?.departureDateTime ? new Date(flight.departureDateTime).toLocaleDateString() : '',
          flight?.departureDateTime ? new Date(flight.departureDateTime).toLocaleTimeString() : '',
          flight?.arrivalDateTime ? new Date(flight.arrivalDateTime).toLocaleDateString() : '',
          flight?.arrivalDateTime ? new Date(flight.arrivalDateTime).toLocaleTimeString() : '',
          flight?.arrivalToTerminal || '',
          roomAssignment?.roomType || accommodation?.roomType || '',
          roomAssignment?.roomNumber || '',
          user.transferRequirements || '',
          accommodation?.specialRequests || '',
        ];
      });

    return {
      headers,
      rows,
      metadata: {
        title: 'Arrival List',
        description: 'Inbound flight coordination and transfer details',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * 2. Departure List - Transfer coordination for outbound flights
   */
  static async getDepartureListReport(eventId: string): Promise<ReportData> {
    const [users, groups] = await Promise.all([
      prisma.user.findMany({
        where: {
          eventId,
          active: true,
          flight: { not: null },
        },
        include: {
          roomAssignments: {
            where: { eventId },
          },
        },
        orderBy: [
          { guestCategory: 'asc' },
          { updatedAt: 'asc' },
        ],
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map(g => [g.id, g.name]));

    const headers = [
      'Outbound Departure Date',
      'Departure From',
      'Departure Time',
      'First Name',
      'Surname',
      'Outbound Departure From',
      'Outbound Departure Terminal',
      'Outbound Flight Number',
      'Outbound Arrival To',
      'Outbound Flight Departure Time',
      'VIP',
      'Group',
      'Company',
      'Guest Type',
      'Vehicle to be Allocated',
      'Driver Name',
      'Driver Reg',
      'Notes (departure specific)'
    ];

    const rows = users
      .filter(user => (user.flight as any)?.outbound)
      .map(user => {
        const profile = user.profile as any;
        const flight = (user.flight as any)?.outbound;
        const accommodation = user.accommodation as any;
        const roomAssignment = user.roomAssignments[0];
        const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

        return [
          flight?.departureDateTime ? new Date(flight.departureDateTime).toLocaleDateString('en-GB') : '',
          flight?.departureFrom || '',
          flight?.departureDateTime ? new Date(flight.departureDateTime).toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5) : '',
          profile?.firstName || '',
          profile?.lastName || '',
          flight?.departureFrom || '',
          flight?.departureTerminal || '',
          flight?.flightNumber || '',
          flight?.arrivalToAirport || '',
          flight?.departureDateTime ? new Date(flight.departureDateTime).toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5) : '',
          user.guestCategory?.includes('VIP') || user.guestCategory?.includes('Panoramic') || user.guestCategory?.includes('Suite') ? 'Yes' : 'No',
          groupNames,
          '', // Company - not stored in profile
          user.guestCategory || 'Standard',
          '1', // Default vehicle allocation
          '', // Driver name - not stored
          '', // Driver registration - not stored
          accommodation?.specialRequests || roomAssignment?.hotelNotes || '',
        ];
      });

    return {
      headers,
      rows,
      metadata: {
        title: 'Departure List',
        description: 'Outbound flight coordination and checkout details',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * 3. Medical List - Medical team preparation
   */
  static async getMedicalListReport(eventId: string): Promise<ReportData> {
    const [users, groups] = await Promise.all([
      prisma.user.findMany({
        where: {
          eventId,
          active: true,
          OR: [
            { requirements: { not: null } },
            { emergencyContact: { not: null } },
          ],
        },
        include: {
          roomAssignments: {
            where: { eventId },
          },
        },
        orderBy: [
          { guestCategory: 'asc' },
          { updatedAt: 'asc' },
        ],
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map(g => [g.id, g.name]));

    const headers = [
      'Guest Name',
      'Guest Category',
      'Email',
      'Phone',
      'Medical Conditions',
      'Allergies/Intolerances', 
      'Accessibility Needs',
      'Emergency Contact Name',
      'Emergency Contact Phone',
      'Emergency Contact Email',
      'Relationship',
      'Room Number',
      'Group Assignment'
    ];

    const rows = users.map(user => {
      const profile = user.profile as any;
      const requirements = user.requirements as any;
      const emergency = user.emergencyContact as any;
      const roomAssignment = user.roomAssignments[0];
      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      return [
        `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
        user.guestCategory || 'Standard',
        profile?.email || '',
        profile?.phone || '',
        requirements?.medical?.enabled ? requirements.medical.details || 'Yes' : '',
        requirements?.allergiesIntolerances?.enabled ? requirements.allergiesIntolerances.details || 'Yes' : '',
        requirements?.accessibility?.enabled ? requirements.accessibility.details || 'Yes' : '',
        emergency?.name || '',
        emergency?.phone || '',
        emergency?.email || '',
        emergency?.relationship || '',
        roomAssignment?.roomNumber || '',
        groupNames,
      ];
    });

    return {
      headers,
      rows,
      metadata: {
        title: 'Medical List',
        description: 'Medical requirements and emergency contacts',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * 4. Dietary List - Catering coordination
   */
  static async getDietaryListReport(eventId: string): Promise<ReportData> {
    const [users, groups] = await Promise.all([
      prisma.user.findMany({
        where: {
          eventId,
          active: true,
          requirements: { not: null },
        },
        include: {
          roomAssignments: {
            where: { eventId },
          },
        },
        orderBy: [
          { guestCategory: 'asc' },
          { updatedAt: 'asc' },
        ],
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map(g => [g.id, g.name]));

    const headers = [
      'Guest Name',
      'Guest Category',
      'Email',
      'Phone',
      'Dietary Requirements',
      'Allergies/Intolerances',
      'Special Meal Requests',
      'Group Assignment',
      'Room Number',
    ];

    const rows = users.map(user => {
      const profile = user.profile as any;
      const requirements = user.requirements as any;
      const roomAssignment = user.roomAssignments[0];
      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      return [
        `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
        user.guestCategory || 'Standard',
        profile?.email || '',
        profile?.phone || '',
        requirements?.dietary?.details || 'Yes',
        requirements?.allergiesIntolerances?.enabled ? requirements.allergiesIntolerances.details || 'Yes' : '',
        '', // Special meal requests
        groupNames,
        roomAssignment?.roomNumber || '',
      ];
    });

    return {
      headers,
      rows,
      metadata: {
        title: 'Dietary List',
        description: 'Dietary restrictions and catering requirements',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * 5. Rooming List - Hotel room allocation with daily occupancy grid
   */
  static async getRoomingListReport(eventId: string): Promise<ReportData> {
    const [event, users] = await Promise.all([
      prisma.event.findUnique({
        where: { id: eventId },
        select: { dateRange: true, name: true },
      }),
      prisma.user.findMany({
        where: {
          eventId,
          active: true,
          accommodation: { not: null },
        },
        include: {
          roomAssignments: {
            where: { eventId },
          },
        },
        orderBy: [
          { guestCategory: 'asc' },
          { updatedAt: 'asc' },
        ],
      }),
    ]);

    if (!event?.dateRange) {
      throw new Error('Event date range not configured');
    }

    // Generate date columns for occupancy grid
    const dateRange = event.dateRange as any;
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    const eventDates = [];
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      eventDates.push(new Date(d).toLocaleDateString());
    }

    const headers = [
      'Last Name',
      'First Name',
      'Group',
      'Check-in Date',
      'Flight Arrival Time - Hotel',
      'Check-out Date',
      'Departure Time - Hotel',
      ...eventDates.map((date, index) => {
        const d = new Date(date);
        const day = d.toLocaleDateString('en-US', { weekday: 'long' });
        const shortDate = d.toLocaleDateString('en-GB');
        return `${day}\n${shortDate}`;
      }),
      'Room Category',
      'Billing Notes',
      'Booking Confirmation Number',
      'Occupancy',
      'Guest Type',
      'Room Drop',
      'NOTES (rooming list specific)'
    ];

    const [groups] = await Promise.all([
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map(g => [g.id, g.name]));

    const rows = [];
    const rowMetadata = [];

    users.forEach(user => {
      const profile = user.profile as any;
      const accommodation = user.accommodation as any;
      const flight = user.flight as any;
      const roomAssignment = user.roomAssignments[0];
      const checkIn = accommodation?.checkIn ? new Date(accommodation.checkIn) : null;
      const checkOut = accommodation?.checkOut ? new Date(accommodation.checkOut) : null;
      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      // Calculate occupancy for each event date (1 for occupied, empty for not)
      const occupancyData = eventDates.map(dateStr => {
        const date = new Date(dateStr);
        const isOccupied = checkIn && checkOut && date >= checkIn && date < checkOut;
        return isOccupied ? '1' : '';
      });

      rows.push([
        profile?.lastName || '',
        profile?.firstName || '',
        groupNames,
        checkIn ? checkIn.toLocaleDateString('en-GB') : '',
        flight?.inbound?.arrivalDateTime ? new Date(flight.inbound.arrivalDateTime).toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5) : '',
        checkOut ? checkOut.toLocaleDateString('en-GB') : '',
        flight?.outbound?.departureDateTime ? new Date(flight.outbound.departureDateTime).toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5) : '',
        ...occupancyData,
        roomAssignment?.roomType || accommodation?.roomType || 'Standard King',
        roomAssignment?.billingNotes || 'All charges to Master Account',
        roomAssignment?.bookingConfirmationNumber || '',
        'Single', // Default occupancy
        user.guestCategory || 'Production',
        user.roomDropAssigned ? user.roomDropAssigned : '',
        accommodation?.specialRequests || roomAssignment?.hotelNotes || '',
      ]);

      // Add metadata for editing capabilities
      rowMetadata.push({
        userId: user.id,
        entityId: user.id,
        entityType: 'user' as const,
        editable: true,
      });
    });

    return {
      headers,
      rows,
      rowMetadata,
      metadata: {
        title: 'Rooming List',
        description: 'Hotel room allocation with daily occupancy grid',
        generatedAt: new Date(),
        eventName: event.name,
        totalCount: rows.length,
      },
    };
  }

  /**
   * 6. Guest List by Alpha - Alphabetical reference
   */
  static async getGuestListAlphaReport(eventId: string): Promise<ReportData> {
    const [users, groups] = await Promise.all([
      prisma.user.findMany({
        where: {
          eventId,
          active: true,
        },
        include: {
          roomAssignments: {
            where: { eventId },
          },
        },
        orderBy: {
          updatedAt: 'asc',
        },
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map(g => [g.id, g.name]));

    const headers = [
      'Last Name',
      'First Name',
      'Email',
      'Phone',
      'Guest Category',
      'Group Assignment',
      'Room Type',
      'Room Number',
      'Registration Date',
    ];

    const rows = [];
    const rowMetadata = [];

    users.forEach(user => {
      const profile = user.profile as any;
      const roomAssignment = user.roomAssignments[0];
      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      rows.push([
        profile?.lastName || '',
        profile?.firstName || '',
        profile?.email || '',
        profile?.phone || '',
        user.guestCategory || 'Standard',
        groupNames,
        roomAssignment?.roomType || '',
        roomAssignment?.roomNumber || '',
        new Date(user.registeredAt).toLocaleDateString('en-GB'),
      ]);

      rowMetadata.push({
        userId: user.id,
        entityId: user.id,
        entityType: 'user' as const,
        editable: true,
      });
    });

    return {
      headers,
      rows,
      rowMetadata,
      metadata: {
        title: 'Guest List by Alpha',
        description: 'Alphabetical guest listing for reference',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * 7. Activity Attendance List - Per-activity guest management
   */
  static async getActivityAttendanceReport(eventId: string, activityId?: string): Promise<ReportData> {
    const activities = await prisma.activity.findMany({
      where: {
        eventId,
        active: true,
        deleted: false,
        ...(activityId && { id: activityId }),
      },
      include: {
        groups: {
          select: { id: true, name: true },
        },
        userExclusions: {
          include: {
            user: {
              select: { id: true, profile: true },
            },
          },
        },
      },
      orderBy: { startDateTime: 'asc' },
    });

    const headers = [
      'Activity Title',
      'Date & Time',
      'Guest Name',
      'Guest Category',
      'Email',
      'Group Assignment',
      'Status',
      'Exclusion Reason',
    ];

    const rows: any[][] = [];
    
    for (const activity of activities) {
      // Get users assigned to the activity's groups
      const users = await prisma.user.findMany({
        where: {
          eventId,
          active: true,
          groupIds: { hasSome: activity.groups.map(g => g.id) },
        },
        orderBy: {
          updatedAt: 'asc',
        },
      });

      const excludedUserIds = activity.userExclusions.map(e => e.user.id);

      users.forEach(user => {
        const profile = user.profile as any;
        const isExcluded = excludedUserIds.includes(user.id);
        const exclusion = activity.userExclusions.find(e => e.user.id === user.id);
        const userGroupNames = activity.groups
          .filter(g => user.groupIds.includes(g.id))
          .map(g => g.name)
          .join(', ');

        rows.push([
          activity.title,
          `${new Date(activity.startDateTime).toLocaleDateString('en-GB')} ${new Date(activity.startDateTime).toLocaleTimeString('en-GB')}`,
          `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
          user.guestCategory || 'Standard',
          profile?.email || '',
          userGroupNames,
          isExcluded ? 'Excluded' : 'Attending',
          exclusion?.reason || '',
        ]);
      });
    }

    return {
      headers,
      rows,
      metadata: {
        title: 'Activity Attendance List',
        description: 'Per-activity guest management and attendance tracking',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * 8. Guest List by Type - Segmented by guest categories
   */
  static async getGuestListByTypeReport(eventId: string): Promise<ReportData> {
    const [users, groups] = await Promise.all([
      prisma.user.findMany({
        where: {
          eventId,
          active: true,
        },
        include: {
          roomAssignments: {
            where: { eventId },
          },
        },
        orderBy: [
          { guestCategory: 'asc' },
          { updatedAt: 'asc' },
        ],
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map(g => [g.id, g.name]));

    const headers = [
      'Guest Category',
      'Guest Name',
      'Email',
      'Phone',
      'Group Assignment',
      'Room Type',
      'Room Number',
      'Room Drop Package',
      'Registration Date',
    ];

    const rows = users.map(user => {
      const profile = user.profile as any;
      const roomAssignment = user.roomAssignments[0];
      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      return [
        user.guestCategory || 'Standard',
        `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
        profile?.email || '',
        profile?.phone || '',
        groupNames,
        roomAssignment?.roomType || '',
        roomAssignment?.roomNumber || '',
        user.roomDropAssigned || '',
        new Date(user.registeredAt).toLocaleDateString('en-GB'),
      ];
    });

    return {
      headers,
      rows,
      metadata: {
        title: 'Guest List by Type',
        description: 'Guests segmented by categories',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * 9. Guest List by Group - Segmented by guest groups
   */
  static async getGuestListByGroupReport(eventId: string): Promise<ReportData> {
    const groups = await prisma.group.findMany({
      where: {
        eventId,
        active: true,
        deleted: false,
      },
      orderBy: { name: 'asc' },
    });

    const users = await prisma.user.findMany({
      where: {
        eventId,
        active: true,
        assigned: true,
      },
      include: {
        roomAssignments: {
          where: { eventId },
        },
      },
      orderBy: {
        updatedAt: 'asc',
      },
    });

    const headers = [
      'Group Name',
      'Guest Name',
      'Guest Category',
      'Email',
      'Phone',
      'Room Type',
      'Room Number',
      'Registration Date',
    ];

    const rows: any[][] = [];

    for (const group of groups) {
      const groupUsers = users.filter(user => 
        user.groupIds.includes(group.id)
      );

      groupUsers.forEach(user => {
        const profile = user.profile as any;
        const roomAssignment = user.roomAssignments[0];
        
        rows.push([
          group.name,
          `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
          user.guestCategory || 'Standard',
          profile?.email || '',
          profile?.phone || '',
          roomAssignment?.roomType || '',
          roomAssignment?.roomNumber || '',
          new Date(user.registeredAt).toLocaleDateString(),
        ]);
      });
    }

    return {
      headers,
      rows,
      metadata: {
        title: 'Guest List by Group',
        description: 'Guests organized by assigned groups',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * 10. Master Guest Report - Complete data export with activity attendance
   */
  static async getMasterGuestReport(eventId: string): Promise<ReportData> {
    const [users, groups, activities] = await Promise.all([
      prisma.user.findMany({
        where: {
          eventId,
          active: true,
        },
        include: {
          roomAssignments: {
            where: { eventId },
          },
          activityExclusions: {
            where: { eventId },
            select: { activityId: true },
          },
        },
        orderBy: {
          updatedAt: 'asc',
        },
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
      prisma.activity.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, title: true, groupIds: true },
        orderBy: { startDateTime: 'asc' },
      }),
    ]);

    const groupMap = new Map(groups.map(g => [g.id, g.name]));

    // Base headers
    const baseHeaders = [
      'Group',
      'First Name',
      'Surname',
      'Guest Type',
      'Job Title',
      'Company',
      'VIP',
      'Country of Origin',
      'Email Address',
      'Contact Mobile Number',
      'Market Host',
      'Emergency Contact Name',
      'Emergency Contact Mobile Number',
      'Size Requirements',
      'Accessibility Requirements',
      'Dietary Requirements',
      'Medical Information',
      'Mode of Transportation',
      'Accommodation Required',
      'Hotel',
      'Room Type',
      'Check In Date',
      'Check Out Date',
      'Number of Nights',
      'Room Drop Y/N',
      'Hotel Billing Notes',
    ];

    // Add activity attendance columns dynamically
    const activityHeaders = activities.map(activity => activity.title);
    const headers = [...baseHeaders, ...activityHeaders, 'Notes'];

    const rows = users.map(user => {
      const profile = user.profile as any;
      const accommodation = user.accommodation as any;
      const flight = user.flight as any;
      const requirements = user.requirements as any;
      const emergency = user.emergencyContact as any;
      const merchandise = user.merchandiseSize as any;
      const roomAssignment = user.roomAssignments[0];
      const exclusions = new Set(user.activityExclusions.map(e => e.activityId));

      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');
      const checkIn = accommodation?.checkIn ? new Date(accommodation.checkIn) : null;
      const checkOut = accommodation?.checkOut ? new Date(accommodation.checkOut) : null;
      const nights = checkIn && checkOut ? Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)) : '';

      // Base row data
      const baseRow = [
        groupNames,
        profile?.firstName || '',
        profile?.lastName || '',
        user.guestCategory || 'Standard',
        '', // Job Title - not stored in profile
        '', // Company - not stored in profile
        user.guestCategory?.includes('VIP') || user.guestCategory?.includes('Panoramic') || user.guestCategory?.includes('Suite') ? 'Yes' : 'No',
        '', // Country - not stored
        profile?.email || '',
        profile?.phone || '',
        '', // Market host - not stored
        emergency?.name || '',
        emergency?.phone || '',
        merchandise?.size || merchandise?.shirt || '',
        requirements?.accessibility?.enabled ? requirements.accessibility.details || 'Yes' : 'N/A',
        requirements?.dietary?.enabled ? requirements.dietary.details || 'Yes' : 'N/A',
        requirements?.medical?.enabled ? requirements.medical.details || 'Yes' : 'N/A',
        flight?.inbound ? 'Airplane' : 'N/A',
        accommodation?.required ? 'Y' : 'N',
        accommodation?.hotel || roomAssignment?.roomType?.includes('Casa') ? 'Casa Brera' : '',
        roomAssignment?.roomType || accommodation?.roomType || '',
        checkIn ? checkIn.toLocaleDateString('en-GB') : '',
        checkOut ? checkOut.toLocaleDateString('en-GB') : '',
        nights,
        user.roomDropAssigned ? 'Y' : 'N',
        roomAssignment?.billingNotes || 'All charges to Master Account',
      ];

      // Add activity attendance (Y/N for each activity)
      const activityAttendance = activities.map(activity => {
        // Check if user is in activity's groups and not excluded
        const isInActivityGroup = activity.groupIds.some(groupId => user.groupIds.includes(groupId));
        const isExcluded = exclusions.has(activity.id);

        if (isInActivityGroup && !isExcluded) {
          return 'Y';
        } else if (isInActivityGroup && isExcluded) {
          return 'N';
        } else {
          return 'N/A';
        }
      });

      return [...baseRow, ...activityAttendance, '']; // Empty notes column
    });

    return {
      headers,
      rows,
      metadata: {
        title: 'Master Guest Report',
        description: 'Complete guest data export with activity attendance',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * 11. Change Report - Timestamped audit trail
   */
  static async getChangeReport(
    eventId: string, 
    pagination: Pagination,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<ReportData> {
    const where: any = { eventId };
    
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    const auditLogs = await prisma.auditTrail.findMany({
      where,
      include: {
        admin: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: pagination.limit,
      skip: (pagination.page - 1) * pagination.limit,
    });

    const headers = [
      'Timestamp',
      'Action',
      'Resource Type', 
      'Resource ID',
      'Summary',
      'Performed By',
      'Admin Email',
      'User Email',
      'Details',
    ];

    const rows = auditLogs.map(log => [
      new Date(log.createdAt).toLocaleString(),
      log.action,
      log.resourceType,
      log.resourceId,
      log.summary,
      `${log.admin.firstName} ${log.admin.lastName}`,
      log.admin.email,
      (log.metadata as any)?.userEmail || '',
      JSON.stringify(log.changes || {}),
    ]);

    return {
      headers,
      rows,
      metadata: {
        title: 'Change Report',
        description: 'Timestamped audit trail of all changes',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * 12. Merchandise Report - Size distribution
   */
  static async getMerchandiseReport(eventId: string): Promise<ReportData> {
    const [users, groups] = await Promise.all([
      prisma.user.findMany({
        where: {
          eventId,
          active: true,
          merchandiseSize: { not: null },
        },
        include: {
          roomAssignments: {
            where: { eventId },
          },
        },
        orderBy: {
          updatedAt: 'asc',
        },
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map(g => [g.id, g.name]));

    const headers = [
      'Guest Name',
      'Email',
      'Guest Category',
      'Gender',
      'Size',
      'Group Assignment',
      'Room Number',
    ];

    const rows = [];
    const rowMetadata = [];

    users.forEach(user => {
      const profile = user.profile as any;
      const merchandise = user.merchandiseSize as any;
      const roomAssignment = user.roomAssignments[0];
      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      rows.push([
        `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
        profile?.email || '',
        user.guestCategory || 'Standard',
        merchandise?.gender || '',
        merchandise?.size || merchandise?.shirt || '',
        groupNames,
        roomAssignment?.roomNumber || '',
      ]);

      rowMetadata.push({
        userId: user.id,
        entityId: user.id,
        entityType: 'user' as const,
        editable: true,
      });
    });

    return {
      headers,
      rows,
      rowMetadata,
      metadata: {
        title: 'Merchandise Report',
        description: 'Size distribution and inventory tracking',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * 13. Room Drops Report - Gift distribution tracking
   */
  static async getRoomDropsReport(eventId: string): Promise<ReportData> {
    const [event, users] = await Promise.all([
      prisma.event.findUnique({
        where: { id: eventId },
        select: { roomDrops: true, name: true },
      }),
      prisma.user.findMany({
        where: {
          eventId,
          active: true,
          roomDropAssigned: { not: null },
        },
        include: {
          roomAssignments: {
            where: { eventId },
          },
        },
        orderBy: {
          updatedAt: 'asc',
        },
      }),
    ]);

    const headers = [
      'Guest Name',
      'Email',
      'Guest Category',
      'Room Drop Package',
      'Package Description',
      'Room Type',
      'Room Number',
      'Delivery Status',
      'Assigned Date',
    ];

    const roomDrops = (event?.roomDrops as any)?.drops || [];
    const roomDropMap = new Map(roomDrops.map((drop: any) => [drop.id, drop]));

    const rows = users.map(user => {
      const profile = user.profile as any;
      const roomAssignment = user.roomAssignments[0];
      const roomDrop = roomDropMap.get(user.roomDropAssigned);
      
      return [
        `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
        profile?.email || '',
        user.guestCategory || 'Standard',
        roomDrop?.name || user.roomDropAssigned || '',
        roomDrop?.description || '',
        roomAssignment?.roomType || '',
        roomAssignment?.roomNumber || '',
        'Pending', // TODO: Add delivery status tracking
        user.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : '',
      ];
    });

    return {
      headers,
      rows,
      metadata: {
        title: 'Room Drops Report',
        description: 'Gift package distribution and delivery tracking',
        generatedAt: new Date(),
        eventName: event?.name,
        totalCount: rows.length,
      },
    };
  }

  /**
   * Generate Excel file from report data with professional formatting
   */
  static async generateExcelFile(reportData: ReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const reportTitle = reportData.metadata?.title || 'Report';
    const worksheet = workbook.addWorksheet(reportTitle);

    let headerRowIndex = 1;

    // Special handling for Rooming List - add hotel summary header
    if (reportTitle === 'Rooming List') {
      // Add title and summary rows
      worksheet.mergeCells('B1:D1');
      worksheet.getCell('B1').value = 'HOTEL ROOMING LIST';
      worksheet.getCell('B1').font = { bold: true, size: 14 };

      worksheet.mergeCells('B2:D2');
      worksheet.getCell('B2').value = `Version 1 - Generated ${new Date().toLocaleDateString('en-GB')}`;

      // Add room inventory summary (mock data for now)
      const roomCategories = ['Standard ROH', 'Premium ROH', 'Junior Suite', 'Panoramic'];
      roomCategories.forEach((category, index) => {
        const row = 3 + index;
        worksheet.getCell(`H${row}`).value = category;
        worksheet.getCell(`I${row}`).value = Math.floor(Math.random() * 20) + 5; // Mock room count
      });

      headerRowIndex = 8; // Start data after summary
    }

    // Add headers
    const headerRow = worksheet.insertRow(headerRowIndex, reportData.headers);

    // Style headers with professional formatting
    headerRow.font = { bold: true, color: { argb: 'FF000000' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    headerRow.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    // Add data rows with alternating colors
    reportData.rows.forEach((row, index) => {
      const dataRow = worksheet.insertRow(headerRowIndex + 1 + index, row);

      // Alternating row colors
      if (index % 2 === 1) {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8F8FF' }
        };
      }

      // Add borders
      dataRow.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
        };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });

      // Format date columns (European format)
      dataRow.eachCell((cell, colNumber) => {
        if (typeof cell.value === 'string' && cell.value.match(/\d{2}\/\d{2}\/\d{4}/)) {
          cell.numFmt = 'dd/mm/yyyy';
        }
      });
    });

    // Enhanced auto-sizing with better column management
    worksheet.columns.forEach((column, index) => {
      if (column.values && column.values.length > 0) {
        const lengths = column.values
          .filter(v => v != null)
          .map(v => v.toString().length);

        if (lengths.length > 0) {
          const maxLength = Math.max(...lengths);
          const header = reportData.headers[index];
          const headerLength = header ? header.length : 10;

          // Use larger of content or header, with min/max bounds
          column.width = Math.min(Math.max(maxLength, headerLength, 10), 40);
        } else {
          column.width = 15;
        }
      }
    });

    // Add report metadata and generation info
    if (reportData.metadata) {
      const lastRow = worksheet.rowCount + 2;
      worksheet.getCell(`A${lastRow}`).value = `Generated: ${reportData.metadata.generatedAt.toLocaleString('en-GB')}`;
      worksheet.getCell(`A${lastRow + 1}`).value = `Total Records: ${reportData.metadata.totalCount}`;
      worksheet.getCell(`A${lastRow + 2}`).value = `Description: ${reportData.metadata.description}`;

      // Style metadata
      [lastRow, lastRow + 1, lastRow + 2].forEach(row => {
        const cell = worksheet.getCell(`A${row}`);
        cell.font = { italic: true, size: 10 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF0F0F0' }
        };
      });
    }

    return await workbook.xlsx.writeBuffer() as Buffer;
  }

  /**
   * Get all available reports metadata
   */
  static getAvailableReports() {
    return [
      { id: 'arrival-list', name: 'Arrival List', category: 'Flight Coordination' },
      { id: 'departure-list', name: 'Departure List', category: 'Flight Coordination' },
      { id: 'medical-list', name: 'Medical List', category: 'Requirements' },
      { id: 'dietary-list', name: 'Dietary List', category: 'Requirements' },
      { id: 'rooming-list', name: 'Rooming List', category: 'Accommodation' },
      { id: 'guest-list-alpha', name: 'Guest List by Alpha', category: 'Guest Lists' },
      { id: 'activity-attendance', name: 'Activity Attendance List', category: 'Activities' },
      { id: 'guest-list-type', name: 'Guest List by Type', category: 'Guest Lists' },
      { id: 'guest-list-group', name: 'Guest List by Group', category: 'Guest Lists' },
      { id: 'master-guest', name: 'Master Guest Report', category: 'Complete Data' },
      { id: 'change-report', name: 'Change Report', category: 'Audit Trail' },
      { id: 'merchandise-report', name: 'Merchandise Report', category: 'Operations' },
      { id: 'room-drops', name: 'Room Drops Report', category: 'Operations' },
    ];
  }
}