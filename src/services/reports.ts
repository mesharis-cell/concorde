import { prisma } from '../config/database.js';
import * as ExcelJS from 'exceljs';
import { toZonedTime, format } from 'date-fns-tz';
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
   * Helper method to safely parse accommodation dates (handles both DD/MM/YYYY strings and ISO strings)
   */
  private static parseAccommodationDate(dateInput: any): Date | null {
    if (!dateInput) return null;

    if (typeof dateInput === 'string' && dateInput.includes('/')) {
      // DD/MM/YYYY format
      const [day, month, year] = dateInput.split('/').map(n => parseInt(n));
      return new Date(year, month - 1, day, 12, 0, 0); // Noon to avoid timezone issues
    } else {
      // ISO string or Date object (backward compatibility)
      return new Date(dateInput);
    }
  }

  /**
   * Helper method to get nested object values by path (e.g., "profile.lastName")
   */
  private static getNestedValue(obj: any, path: string): any {
    if (!obj || !path) return undefined;

    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current == null || typeof current !== 'object') {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Helper method to format values for display in change reports
   */
  private static formatValue(value: any): string {
    if (value == null) return 'null';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'object') {
      // For objects, show a shortened representation
      if (Array.isArray(value)) {
        // Enhanced array display for better readability
        if (value.length === 0) {
          return '[]';
        }

        // For arrays of strings (like car numbers), show the actual values
        if (value.every(item => typeof item === 'string')) {
          return `[${value.join(', ')}]`;
        }

        // For other arrays, show count
        return `[${value.length} items]`;
      }
      return `{${Object.keys(value).length} fields}`;
    }
    return String(value);
  }

  /**
   * Check if a field is a parent object that has child fields also being tracked
   * This prevents meaningless "{2 fields} → {2 fields}" entries
   */
  private static isParentObjectField(field: string, allFields: string[]): boolean {
    // If there are any fields that start with this field + ".", then this is a parent
    const hasChildFields = allFields.some(f => f !== field && f.startsWith(field + '.'));
    return hasChildFields;
  }

  /**
   * Make field names more readable for change reports
   */
  private static makeFieldNameReadable(field: string): string {
    // Split on dots and capitalize each part
    const parts = field.split('.');

    const readableParts = parts.map(part => {
      // Handle common field name patterns
      const fieldMap: Record<string, string> = {
        'firstName': 'First Name',
        'lastName': 'Last Name',
        'preferredFirstName': 'Preferred First Name',
        'guestType': 'Guest Type',
        'jobTitle': 'Job Title',
        'vip': 'VIP Status',
        'emailOptIn': 'Email Opt-in',
        'whatsappOptIn': 'WhatsApp Opt-in',
        'departureFrom': 'Departure From',
        'departureTo': 'Departure To',
        'arrivalDate': 'Arrival Date',
        'arrivalTime': 'Arrival Time',
        'departureDate': 'Departure Date',
        'departureTime': 'Departure Time',
        'flightNumber': 'Flight Number',
        'arrivalToAirport': 'Arrival Airport',
        'departureTerminal': 'Departure Terminal',
        'checkIn': 'Check-in Date',
        'checkOut': 'Check-out Date',
        'roomType': 'Room Type',
        'doubleOccupancy': 'Double Occupancy',
        'visaBookingRequired': 'Visa Booking Required',
        'nightsCount': 'Nights Count',
        'carNumbers': 'Car Numbers',
        'effectiveCarNumbers': 'Effective Car Numbers',
        'transferRequirements': 'Transfer Requirements',
        'guestCategory': 'Guest Category',
        'hotelId': 'Hotel',
        'roomAssignments': 'Room Assignments'
      };

      // Use mapped name if available, otherwise capitalize and add spaces
      if (fieldMap[part]) {
        return fieldMap[part];
      }

      // Convert camelCase to Title Case
      return part
        .replace(/([A-Z])/g, ' $1') // Add space before capitals
        .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
        .trim();
    });

    // Join with " → " for nested fields
    return readableParts.join(' → ');
  }

  /**
   * Get available change dates for dynamic dropdown filtering
   */
  static async getAvailableChangeDates(eventId: string): Promise<string[]> {
    const changes = await prisma.auditTrail.findMany({
      where: {
        eventId,
        action: 'UPDATE',
        resourceType: { in: ['User', 'RoomAssignment'] }
      },
      select: {
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Get unique dates (UTC)
    const uniqueDates = new Set<string>();
    changes.forEach(change => {
      const date = change.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
      uniqueDates.add(date);
    });

    return Array.from(uniqueDates);
  }

  /**
   * 1. Arrival List - Transfer coordination for inbound flights
   */
  static async getArrivalListReport(eventId: string): Promise<ReportData> {
    const [users, groups] = await Promise.all([
      prisma.user.findMany({
        where: {
          eventId,
          active: true,
          flight: { not: null },
          transferRequirements: true, // Boolean field - only true values
        },
        include: {
          roomAssignments: {
            where: { eventId },
          },
        },
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const headers = [
      'Inbound Departure date [dd/mm/yyy]',
      'Inbound Departure time [24hr hh:mm]',
      'Inbound Departure from [station/airport]',
      'Inbound Departure terminal',
      'Inbound Flight number',
      'Inbound Arrival date [dd/mm/yyy]',
      'Inbound Arrival time [24hr hh:mm]',
      'Inbound Arrival to [station/airport]',
      'First Name *as shown on Passport',
      'Surname *as shown on Passport',
      'Guest type [Chivas market host, Cultural creator, Media, CEO/MD, Trade, Photographer/Videographer, Accompanying guest, Agent/Manager]',
      'Market',
      'Contact mobile number *including area code',
      'market host to keep on cc for all comms',
      'Hotel Booking Required for Visa Y/N',
      'VIP Guest',
      'Assigned Cars',
      'Transfer Requirements',
      'Arrival Notes',
      'General notes'
    ];

    const rows = [];
    const rowMetadata = [];
    const groupMap = new Map(groups.map(g => [g.id, g.name]));

    // Sort by arrival date, arrival time, then alpha by last name
    const sortedUsers = users
      .filter(user => (user.flight as any)?.inbound)
      .sort((a, b) => {
        const aFlight = (a.flight as any)?.inbound;
        const bFlight = (b.flight as any)?.inbound;
        const aProfile = a.profile as any;
        const bProfile = b.profile as any;

        // Compare arrival dates first
        if (aFlight?.arrivalDate && bFlight?.arrivalDate) {
          const dateDiff = aFlight.arrivalDate.localeCompare(bFlight.arrivalDate);
          if (dateDiff !== 0) return dateDiff;
        }

        // Then compare arrival times
        if (aFlight?.arrivalTime && bFlight?.arrivalTime) {
          const timeDiff = aFlight.arrivalTime.localeCompare(bFlight.arrivalTime);
          if (timeDiff !== 0) return timeDiff;
        }

        // Finally, sort by last name then first name
        const aLastName = aProfile?.lastName || '';
        const bLastName = bProfile?.lastName || '';
        const aFirstName = aProfile?.firstName || '';
        const bFirstName = bProfile?.firstName || '';

        if (aLastName !== bLastName) {
          return aLastName.localeCompare(bLastName);
        }
        return aFirstName.localeCompare(bFirstName);
      });

    sortedUsers.forEach(user => {
      const profile = user.profile as any;
      const flight = (user.flight as any)?.inbound;
      const accommodation = user.accommodation as any;

      // Get market/group names
      const marketNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      // Get car assignments (individual overrides take precedence)
      const userCarNumbers = (user.carNumbers as string[]) || [];
      const groupCarNumbers = user.groupIds.map(id => {
        const group = groups.find(g => g.id === id);
        return (group as any)?.carNumbers || [];
      }).flat();
      const uniqueGroupCars = [...new Set(groupCarNumbers)];
      const assignedCars = userCarNumbers.length > 0
        ? userCarNumbers.join(', ')
        : uniqueGroupCars.length > 0
          ? uniqueGroupCars.join(', ')
          : 'None';

      rows.push([
        flight?.departureDate || '',
        flight?.departureTime || '',
        flight?.departureFrom || '',
        flight?.departureTerminal || '',
        flight?.flightNumber || '',
        flight?.arrivalDate || '',
        flight?.arrivalTime || '',
        flight?.arrivalToAirport || '',
        profile?.firstName || '',
        profile?.lastName || '',
        profile?.guestType || '',
        marketNames || '',
        profile?.phone || '',
        profile?.host || '',
        accommodation?.visaBookingRequired ? 'Y' : 'N',
        profile?.vip ? 'Y' : 'N', // VIP Guest
        assignedCars, // Assigned Cars
        'Airport transfers required', // Transfer Requirements (always true for this filtered report)
        user.arrivalNotes || '',          // 🎯 Arrival-specific notes
        user.masterGuestNotes || '',      // General notes
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
          transferRequirements: true, // Boolean field - only true values
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
      'Hotel',
      'Outbound Departure from [station/airport]',
      'Outbound Departure date [dd/mm/yyy]',
      'Outbound Departure time [hh:mm]',
      'Outbound Departure Terminal',
      'Outbound Flight number',
      'Outbound Arrival to',
      'First Name',
      'Surname',
      'Guest type',
      'Market',
      'Contact mobile number',
      'Market host',
      'VIP Guest',
      'Assigned Cars',
      'Transfer Requirements',
      'Departure Notes',
      'General notes'
    ];

    const rows = [];
    const rowMetadata = [];

    // Sort by departure date, departure time, then alpha by last name
    const sortedUsers = users
      .filter(user => (user.flight as any)?.outbound)
      .sort((a, b) => {
        const aFlight = (a.flight as any)?.outbound;
        const bFlight = (b.flight as any)?.outbound;
        const aProfile = a.profile as any;
        const bProfile = b.profile as any;

        // Compare departure dates first
        if (aFlight?.departureDate && bFlight?.departureDate) {
          const dateDiff = aFlight.departureDate.localeCompare(bFlight.departureDate);
          if (dateDiff !== 0) return dateDiff;
        }

        // Then compare departure times
        if (aFlight?.departureTime && bFlight?.departureTime) {
          const timeDiff = aFlight.departureTime.localeCompare(bFlight.departureTime);
          if (timeDiff !== 0) return timeDiff;
        }

        // Finally, sort by last name then first name
        const aLastName = aProfile?.lastName || '';
        const bLastName = bProfile?.lastName || '';
        const aFirstName = aProfile?.firstName || '';
        const bFirstName = bProfile?.firstName || '';

        if (aLastName !== bLastName) {
          return aLastName.localeCompare(bLastName);
        }
        return aFirstName.localeCompare(bFirstName);
      });

    sortedUsers.forEach(user => {
      const profile = user.profile as any;
      const flight = (user.flight as any)?.outbound;
      const accommodation = user.accommodation as any;
      const roomAssignment = user.roomAssignments[0];
      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      // Get car assignments (individual overrides take precedence)
      const userCarNumbers = (user.carNumbers as string[]) || [];
      const groupCarNumbers = user.groupIds.map(id => {
        const group = groups.find(g => g.id === id);
        return (group as any)?.carNumbers || [];
      }).flat();
      const uniqueGroupCars = [...new Set(groupCarNumbers)];
      const assignedCars = userCarNumbers.length > 0
        ? userCarNumbers.join(', ')
        : uniqueGroupCars.length > 0
          ? uniqueGroupCars.join(', ')
          : 'None';

      // Get hotel checkout time from room assignment or accommodation
      const hotelName = accommodation?.hotel || roomAssignment?.hotel?.name || '';
      const checkOutDate = this.parseAccommodationDate(accommodation?.checkOut);
      const hotelDepartureTime = checkOutDate ?
        checkOutDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) :
        '12:00'; // Default checkout time

      rows.push([
        hotelName,
        flight?.departureFrom || '',
        flight?.departureDate || '',
        flight?.departureTime || '',
        flight?.departureTerminal || '',
        flight?.flightNumber || '',
        flight?.arrivalToAirport || '',
        profile?.firstName || '',
        profile?.lastName || '',
        profile?.guestType || '',
        groupNames,
        profile?.phone || '',
        profile?.host || '',
        profile?.vip ? 'Y' : 'N', // 🎯 VIP status to match consolidated format
        assignedCars, // Assigned Cars
        'Airport transfers required', // Transfer Requirements (always true for this filtered report)
        user.departureNotes || '', // 🎯 Departure-specific notes
        user.masterGuestNotes || '', // General notes
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
      'First Name',
      'Surname',
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
      'Group Assignment'
    ];

    const rows = [];
    const rowMetadata = [];

    users.forEach(user => {
      const profile = user.profile as any;
      const requirements = user.requirements as any;
      const emergency = user.emergencyContact as any;
      const roomAssignment = user.roomAssignments[0];
      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      rows.push([
        profile?.firstName || '',
        profile?.lastName || '',
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
        groupNames,
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
      'First Name',
      'Surname',
      'Guest Category',
      'Email',
      'Phone',
      'Dietary Requirements',
      'Allergies/Intolerances',
      'Special Meal Requests',
      'Group Assignment',
    ];

    const rows = [];
    const rowMetadata = [];

    users.forEach(user => {
      const profile = user.profile as any;
      const requirements = user.requirements as any;
      const roomAssignment = user.roomAssignments[0];
      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      rows.push([
        profile?.firstName || '',
        profile?.lastName || '',
        user.guestCategory || 'Standard',
        profile?.email || '',
        profile?.phone || '',
        requirements?.dietary?.details || 'Yes',
        requirements?.allergiesIntolerances?.enabled ? requirements.allergiesIntolerances.details || 'Yes' : '',
        '', // Special meal requests
        groupNames,
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
            include: {
              roomType: { select: { name: true } },
              hotel: { select: { name: true } },
            },
          },
        },
        orderBy: {
          updatedAt: 'asc', // Simple ordering first, then manual sort
        },
      }),
    ]);

    if (!event?.dateRange) {
      throw new Error('Event date range not configured');
    }

    // 🎯 FIX: Generate date columns with proper timezone handling
    const dateRange = event.dateRange as any;
    const EVENT_TIMEZONE = 'Asia/Singapore'; // Use event timezone

    // Convert UTC event dates to Singapore timezone for proper calendar dates
    const startDate = toZonedTime(new Date(dateRange.start), EVENT_TIMEZONE);
    const endDate = toZonedTime(new Date(dateRange.end), EVENT_TIMEZONE);

    const eventDates = [];
    const current = new Date(startDate);
    current.setHours(12, 0, 0, 0); // Set to noon to avoid boundary issues

    while (current <= endDate) {
      // Format as YYYY-MM-DD for consistent comparison
      const dateStr = format(current, 'yyyy-MM-dd', { timeZone: EVENT_TIMEZONE });
      eventDates.push(dateStr);
      current.setDate(current.getDate() + 1);
    }

    const headers = [
      'Last Name',
      'First Name',
      'Group',
      'Check-in Date',
      'Flight Arrival Time - Hotel',
      'Check-out Date',
      'Departure Time - Hotel',
      ...eventDates.map((dateStr) => {
        // 🎯 FIX: Format headers in Singapore timezone
        const date = new Date(dateStr + 'T12:00:00'); // Noon to avoid timezone issues
        const singaporeDate = toZonedTime(date, EVENT_TIMEZONE);
        const day = format(singaporeDate, 'EEEE', { timeZone: EVENT_TIMEZONE }); // Monday, Tuesday, etc.
        const shortDate = format(singaporeDate, 'dd/MM/yyyy', { timeZone: EVENT_TIMEZONE }); // 29/09/2025
        return `${day}\n${shortDate}`;
      }),
      'Room Category',
      'Billing Notes',
      'Booking Confirmation Number',
      'Occupancy',
      'Guest Type',
      'Room Drop',
      'VIP Guest',
      'Assigned Cars',
      'Hotel Notes',
      'General notes'
    ];

    const [groups] = await Promise.all([
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map(g => [g.id, g.name]));

    // Sort users by check-in date, then by alpha last name
    users.sort((a, b) => {
      const aAccommodation = a.accommodation as any;
      const bAccommodation = b.accommodation as any;
      const aProfile = a.profile as any;
      const bProfile = b.profile as any;

      // Parse check-in dates
      const aCheckIn = this.parseAccommodationDate(aAccommodation?.checkIn);
      const bCheckIn = this.parseAccommodationDate(bAccommodation?.checkIn);

      // Compare check-in dates first
      if (aCheckIn && bCheckIn) {
        const dateDiff = aCheckIn.getTime() - bCheckIn.getTime();
        if (dateDiff !== 0) return dateDiff;
      } else if (aCheckIn && !bCheckIn) {
        return -1;
      } else if (!aCheckIn && bCheckIn) {
        return 1;
      }

      // If check-in dates are equal (or both null), sort by last name then first name
      const aLastName = aProfile?.lastName || '';
      const bLastName = bProfile?.lastName || '';
      const aFirstName = aProfile?.firstName || '';
      const bFirstName = bProfile?.firstName || '';

      if (aLastName !== bLastName) {
        return aLastName.localeCompare(bLastName);
      }
      return aFirstName.localeCompare(bFirstName);
    });

    const rows = [];
    const rowMetadata = [];

    users.forEach(user => {
      const profile = user.profile as any;
      const accommodation = user.accommodation as any;
      const flight = user.flight as any;
      const roomAssignment = user.roomAssignments[0];
      const checkIn = this.parseAccommodationDate(accommodation?.checkIn);
      const checkOut = this.parseAccommodationDate(accommodation?.checkOut);
      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      // Get car assignments (individual overrides take precedence)
      const userCarNumbers = (user.carNumbers as string[]) || [];
      const groupCarNumbers = user.groupIds.map(id => {
        const group = groups.find(g => g.id === id);
        return (group as any)?.carNumbers || [];
      }).flat();
      const uniqueGroupCars = [...new Set(groupCarNumbers)];
      const assignedCars = userCarNumbers.length > 0
        ? userCarNumbers.join(', ')
        : uniqueGroupCars.length > 0
          ? uniqueGroupCars.join(', ')
          : 'None';

      // 🎯 FIX: Calculate occupancy with proper date comparison
      const occupancyData = eventDates.map(dateStr => {
        if (!checkIn || !checkOut) return null;

        // Convert event date to Date object for comparison
        const eventDate = new Date(dateStr + 'T12:00:00'); // Noon Singapore time

        // Normalize check-in/check-out to Singapore timezone dates
        let checkInSg: Date;
        let checkOutSg: Date;

        if (typeof accommodation.checkIn === 'string' && accommodation.checkIn.includes('/')) {
          // Parse dd/MM/yyyy format
          const [day, month, year] = accommodation.checkIn.split('/').map(n => parseInt(n));
          checkInSg = new Date(year, month - 1, day, 12, 0, 0); // Noon Singapore
        } else {
          checkInSg = toZonedTime(checkIn, EVENT_TIMEZONE);
        }

        if (typeof accommodation.checkOut === 'string' && accommodation.checkOut.includes('/')) {
          // Parse dd/MM/yyyy format  
          const [day, month, year] = accommodation.checkOut.split('/').map(n => parseInt(n));
          checkOutSg = new Date(year, month - 1, day, 12, 0, 0); // Noon Singapore
        } else {
          checkOutSg = toZonedTime(checkOut, EVENT_TIMEZONE);
        }

        // Check if guest is staying on this date (inclusive of check-in, exclusive of check-out)
        const isStaying = eventDate >= checkInSg && eventDate < checkOutSg;
        return isStaying ? '1' : null;
      });

      rows.push([
        profile?.lastName,
        profile?.firstName,
        groupNames,
        checkIn ? checkIn.toLocaleDateString('en-GB') : null,
        flight?.inbound?.arrivalTime,
        checkOut ? checkOut.toLocaleDateString('en-GB') : null,
        flight?.outbound?.departureTime,
        ...occupancyData,
        roomAssignment?.roomType?.name || roomAssignment?.roomType,
        roomAssignment?.billingNotes,
        roomAssignment?.bookingConfirmationNumber,
        accommodation?.occupancy, // 🎯 FIX: Read actual occupancy
        user.guestCategory,
        user.roomDropAssigned,
        profile?.vip ? 'Y' : 'N', // VIP Guest
        assignedCars, // Assigned Cars
        roomAssignment?.hotelNotes || '', // Hotel Notes
        user.masterGuestNotes || '', // General notes
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
        eventId: eventId, // 🎯 ADD: EventId for room matrix generation
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
      'Registration Date',
      'Tickets',
      'Valid Tickets',
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
        new Date(user.registeredAt).toLocaleDateString('en-GB'),
        // Enhanced ticket information
        (user.tickets as any)?.map((t: any) => `${t.name} (${t.number})`).join(', ') || 'No tickets',
        (user.tickets as any)?.filter((t: any) => t.valid).map((t: any) => `${t.name} (${t.number})`).join(', ') || 'None',
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
      'First Name',
      'Surname',
      'Guest Category',
      'Email',
      'Group Assignment',
      'Status',
      'Exclusion Reason',
    ];

    const rows: any[][] = [];
    const rowMetadata = [];

    for (const activity of activities) {
      // Get users assigned to the activity's groups
      const users = await prisma.user.findMany({
        where: {
          eventId,
          active: true,
          groupIds: { hasSome: activity.groups.map(g => g.id) },
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
          profile?.firstName || '',
          profile?.lastName || '',
          user.guestCategory || 'Standard',
          profile?.email || '',
          userGroupNames,
          isExcluded ? 'Excluded' : 'Attending',
          exclusion?.reason || '',
        ]);

        // Add metadata for editing capabilities
        rowMetadata.push({
          userId: user.id,
          entityId: user.id,
          entityType: 'user' as const,
          editable: true,
        });
      });
    }

    return {
      headers,
      rows,
      rowMetadata,
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
      'First Name',
      'Surname',
      'Email',
      'Phone',
      'Group Assignment',
      'Room Type',
      'Room Drop Package',
      'Registration Date',
      'Tickets',
      'Valid Tickets',
    ];

    const rows = [];
    const rowMetadata = [];

    users.forEach(user => {
      const profile = user.profile as any;
      const roomAssignment = user.roomAssignments[0];
      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      rows.push([
        user.guestCategory || 'Standard',
        profile?.firstName || '',
        profile?.lastName || '',
        profile?.email || '',
        profile?.phone || '',
        groupNames,
        roomAssignment?.roomType || '',
        user.roomDropAssigned || '',
        new Date(user.registeredAt).toLocaleDateString('en-GB'),
        // Enhanced ticket information
        (user.tickets as any)?.map((t: any) => `${t.name} (${t.number})`).join(', ') || 'No tickets',
        (user.tickets as any)?.filter((t: any) => t.valid).map((t: any) => `${t.name} (${t.number})`).join(', ') || 'None',
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
    });

    const headers = [
      'Group Name',
      'First Name',
      'Surname',
      'Guest Category',
      'Email',
      'Phone',
      'Room Type',
      'Registration Date',
      'Tickets',
      'Valid Tickets',
    ];

    const rows: any[][] = [];
    const rowMetadata = [];

    for (const group of groups) {
      const groupUsers = users.filter(user =>
        user.groupIds.includes(group.id)
      );

      groupUsers.forEach(user => {
        const profile = user.profile as any;
        const roomAssignment = user.roomAssignments[0];

        rows.push([
          group.name,
          profile?.firstName || '',
          profile?.lastName || '',
          user.guestCategory || 'Standard',
          profile?.email || '',
          profile?.phone || '',
          roomAssignment?.roomType || '',
          new Date(user.registeredAt).toLocaleDateString(),
          // Enhanced ticket information
          (user.tickets as any)?.map((t: any) => `${t.name} (${t.number})`).join(', ') || 'No tickets',
          (user.tickets as any)?.filter((t: any) => t.valid).map((t: any) => `${t.name} (${t.number})`).join(', ') || 'None',
        ]);

        // Add metadata for editing capabilities
        rowMetadata.push({
          userId: user.id,
          entityId: user.id,
          entityType: 'user' as const,
          editable: true,
        });
      });
    }

    return {
      headers,
      rows,
      rowMetadata,
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
      'Ticket Names',
      'Ticket Numbers',
      'Valid Tickets',
      'Invalid Tickets',
    ];

    // Add activity attendance columns dynamically
    const activityHeaders = activities.map(activity => activity.title);
    const headers = [...baseHeaders, ...activityHeaders, 'General notes', 'Arrival Notes', 'Departure Notes', 'Hotel Notes'];

    const rows = [];
    const rowMetadata = [];

    users.forEach(user => {
      const profile = user.profile as any;
      const accommodation = user.accommodation as any;
      const flight = user.flight as any;
      const requirements = user.requirements as any;
      const emergency = user.emergencyContact as any;
      const merchandise = user.merchandiseSize as any;
      const roomAssignment = user.roomAssignments[0];
      const exclusions = new Set(user.activityExclusions.map(e => e.activityId));

      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');
      const checkIn = this.parseAccommodationDate(accommodation?.checkIn);
      const checkOut = this.parseAccommodationDate(accommodation?.checkOut);
      const nights = checkIn && checkOut ? Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)) : '';

      // Base row data
      const baseRow = [
        groupNames,
        profile?.firstName || '',
        profile?.lastName || '',
        user.guestCategory || 'Standard',
        profile?.jobTitle || '',
        profile?.company || '',
        profile?.vip ? 'Yes' : 'No',
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
        // Enhanced ticket information
        (user.tickets as any)?.map((t: any) => t.name).join(', ') || 'No tickets',
        (user.tickets as any)?.map((t: any) => t.number).join(', ') || 'No numbers',
        (user.tickets as any)?.filter((t: any) => t.valid).map((t: any) => t.name).join(', ') || 'None',
        (user.tickets as any)?.filter((t: any) => !t.valid).map((t: any) => t.name).join(', ') || 'None',
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

      rows.push([
        ...baseRow,
        ...activityAttendance,
        user.masterGuestNotes || '',  // General notes (first - most important)
        user.arrivalNotes || '',      // Arrival Notes
        user.departureNotes || '',    // Departure Notes
        roomAssignment?.hotelNotes || '' // Hotel Notes
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
        title: 'Master Guest Report',
        description: 'Complete guest data export with activity attendance',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * 11. User Change Report - Comprehensive user-related changes with enhanced formatting
   */
  static async getUserChangeReport(
    eventId: string,
    pagination: Pagination,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<ReportData> {
    const where: any = {
      eventId,
      // Only user-related operations (including room assignments which affect users)
      resourceType: { in: ['User', 'RoomAssignment'] }
    };

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    // 🎯 FIX: Use direct query approach since aggregation is failing
    console.log('🔍 Using direct query approach for field discovery...');

    const recentLogs = await prisma.auditTrail.findMany({
      where,
      select: { changes: true },
      take: 10000, // Analyze more records to get all fields
      orderBy: { createdAt: 'desc' },
    });

    const allFields = new Set<string>();
    recentLogs.forEach(log => {
      const changes = log.changes as any;
      if (changes?.fields && Array.isArray(changes.fields)) {
        changes.fields.forEach((field: string) => {
          // 🚨 CRITICAL FIX: Only include leaf fields, not parent objects
          // Skip meaningless parent object changes like "flight" or "profile"
          if (!this.isParentObjectField(field, changes.fields)) {
            allFields.add(field);
          }
        });
      }
    });

    const sortedFields = Array.from(allFields).sort();
    console.log(`🔍 Direct query found ${sortedFields.length} fields:`, sortedFields);

    console.log(`🔍 Found ${sortedFields.length} unique changed fields:`, sortedFields.slice(0, 10));

    // 🎯 FIX: Use export-appropriate limits for change reports
    const isExport = pagination.limit >= 1000; // Detect if this is an export request
    const exportLimit = isExport ? 50000 : pagination.limit; // High limit for exports, normal for UI

    const auditLogs = await prisma.auditTrail.findMany({
      where,
      include: {
        admin: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: exportLimit, // 🎯 Use appropriate limit
      skip: isExport ? 0 : (pagination.page - 1) * pagination.limit, // No skip for exports
    });

    // Enhanced headers: Guest info + action + separate old/new columns
    const baseHeaders = [
      'Guest Name',
      'Guest Type',
      'Market',
      'Market Host',
      'Contact Number',
      'VIP Guest',
      'Action',
      'Timestamp',
      'Performed By',
      'Admin Email',
      'Summary',
    ];

    // Create separate old/new columns for each changed field with readable names
    const fieldColumns: string[] = [];
    sortedFields.forEach(field => {
      const readableField = this.makeFieldNameReadable(field);
      fieldColumns.push(`${readableField} (old)`);
      fieldColumns.push(`${readableField} (new)`);
    });

    const headers = [...baseHeaders, ...fieldColumns];

    console.log(`🔍 Final headers (${headers.length} total):`, headers);

    // Build rows with enhanced guest info and separate old/new columns
    const rows = auditLogs.map(log => {
      const metadata = log.metadata as any;
      const changes = log.changes as any;

      // Extract guest information from changes data
      const afterData = changes?.after;
      const beforeData = changes?.before;

      // Get user profile data (prefer after, fallback to before)
      const profile = afterData?.profile || beforeData?.profile || {};
      const guestName = profile?.firstName && profile?.lastName
        ? `${profile.firstName} ${profile.lastName}`
        : profile?.firstName || profile?.lastName || 'Unknown User';
      const guestType = profile?.guestType || afterData?.guestCategory || beforeData?.guestCategory || '';
      const market = metadata?.groupName || ''; // Extract from metadata if available
      const marketHost = profile?.host || '';
      const contactNumber = profile?.phone || '';
      const vipGuest = profile?.vip ? 'Y' : 'N';

      // Base guest and action data
      const baseData = [
        guestName,
        guestType,
        market,
        marketHost,
        contactNumber,
        vipGuest,
        log.action,
        new Date(log.createdAt).toLocaleString(),
        `${log.admin.firstName} ${log.admin.lastName}`,
        log.admin.email,
        log.summary,
      ];

      // Enhanced field matrix with separate old/new columns
      const changedFieldsInThisRecord = (log.changes as any)?.fields || [];
      console.log(`🔍 Processing log for ${log.summary}: fields=`, changedFieldsInThisRecord);

      const fieldMatrix: string[] = [];
      sortedFields.forEach(fieldPath => {
        if (!changedFieldsInThisRecord.includes(fieldPath)) {
          // Field not changed - add empty values for both old and new columns
          fieldMatrix.push(''); // old column
          fieldMatrix.push(''); // new column
          return;
        }

        // Get before and after values for this specific field path
        const beforeValue = ReportsService.getNestedValue(changes?.before, fieldPath);
        const afterValue = ReportsService.getNestedValue(changes?.after, fieldPath);

        // Add separate old and new values
        fieldMatrix.push(beforeValue !== undefined ? ReportsService.formatValue(beforeValue) : ''); // old column
        fieldMatrix.push(afterValue !== undefined ? ReportsService.formatValue(afterValue) : ''); // new column
      });

      return [...baseData, ...fieldMatrix];
    });

    return {
      headers,
      rows,
      metadata: {
        title: 'User Change Report',
        description: `User-related changes with separate old/new columns (${sortedFields.length} tracked fields)`,
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * Activity Change Report - Activity-related changes (WIP)
   */
  static async getActivityChangeReport(
    eventId: string,
    pagination: Pagination,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<ReportData> {
    // TODO: Implement activity change report
    throw new Error('Activity Change Report - Work in Progress');
  }

  /**
   * Group Change Report - Group-related changes (WIP)
   */
  static async getGroupChangeReport(
    eventId: string,
    pagination: Pagination,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<ReportData> {
    // TODO: Implement group change report
    throw new Error('Group Change Report - Work in Progress');
  }

  /**
   * Event Change Report - Event-related changes (WIP)
   */
  static async getEventChangeReport(
    eventId: string,
    pagination: Pagination,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<ReportData> {
    // TODO: Implement event change report
    throw new Error('Event Change Report - Work in Progress');
  }

  /**
   * Operations Change Report - Admin, emails, bulk operations (WIP)
   */
  static async getOperationsChangeReport(
    eventId: string,
    pagination: Pagination,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<ReportData> {
    // TODO: Implement operations change report
    throw new Error('Operations Change Report - Work in Progress');
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
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map(g => [g.id, g.name]));

    const headers = [
      'First Name',
      'Surname',
      'Email',
      'Guest Category',
      'Gender',
      'Size',
      'Group Assignment',
    ];

    const rows = [];
    const rowMetadata = [];

    users.forEach(user => {
      const profile = user.profile as any;
      const merchandise = user.merchandiseSize as any;
      const roomAssignment = user.roomAssignments[0];
      const groupNames = user.groupIds.map(id => groupMap.get(id)).filter(Boolean).join(', ');

      rows.push([
        profile?.firstName || '',
        profile?.lastName || '',
        profile?.email || '',
        user.guestCategory || 'Standard',
        merchandise?.gender || '',
        merchandise?.size || merchandise?.shirt || '',
        groupNames,
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
      }),
    ]);

    const headers = [
      'First Name',
      'Surname',
      'Email',
      'Guest Category',
      'Room Drop Package',
      'Package Description',
      'Room Type',
      'Delivery Status',
      'Assigned Date',
    ];

    const roomDrops = (event?.roomDrops as any)?.drops || [];
    const roomDropMap = new Map(roomDrops.map((drop: any) => [drop.id, drop]));

    const rows = [];
    const rowMetadata = [];

    users.forEach(user => {
      const profile = user.profile as any;
      const roomAssignment = user.roomAssignments[0];
      const roomDrop = roomDropMap.get(user.roomDropAssigned);

      rows.push([
        profile?.firstName || '',
        profile?.lastName || '',
        profile?.email || '',
        user.guestCategory || 'Standard',
        roomDrop?.name || user.roomDropAssigned || '',
        roomDrop?.description || '',
        roomAssignment?.roomType || '',
        'Pending', // TODO: Add delivery status tracking
        user.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : '',
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
        title: 'Room Drops Report',
        description: 'Gift package distribution and delivery tracking',
        generatedAt: new Date(),
        eventName: event?.name,
        totalCount: rows.length,
      },
    };
  }

  /**
   * Car Assignment Report - Shows transport allocation for each user
   */
  static async getCarAssignmentReport(eventId: string): Promise<ReportData> {
    const users = await prisma.user.findMany({
      where: {
        eventId,
        active: true,
        transferRequirements: true, // Boolean field - only true values
      },
      include: {
        roomAssignments: {
          where: { eventId },
        },
      },
      orderBy: {
        registeredAt: 'asc', // Default ordering by registration date
      },
    });

    const groups = await prisma.group.findMany({
      where: { eventId, active: true, deleted: false },
    });

    const groupMap = new Map(groups.map((g) => [g.id, g]));

    // Sort users alphabetically by last name, then first name
    users.sort((a, b) => {
      const aProfile = a.profile as any;
      const bProfile = b.profile as any;

      const aLastName = aProfile?.lastName || '';
      const bLastName = bProfile?.lastName || '';
      const aFirstName = aProfile?.firstName || '';
      const bFirstName = bProfile?.firstName || '';

      // Compare last names first
      if (aLastName !== bLastName) {
        return aLastName.localeCompare(bLastName);
      }
      // If last names are equal, compare first names
      return aFirstName.localeCompare(bFirstName);
    });

    const headers = [
      // Inbound flight fields (from arrival report)
      'Inbound Departure date [dd/mm/yyy]',
      'Inbound Departure time [24hr hh:mm]',
      'Inbound Departure from [station/airport]',
      'Inbound Departure terminal',
      'Inbound Flight number',
      'Inbound Arrival date [dd/mm/yyy]',
      'Inbound Arrival time [24hr hh:mm]',
      'Inbound Arrival to [station/airport]',
      // Outbound flight fields (from departure report)
      'Outbound Departure from [station/airport]',
      'Outbound Departure date [dd/mm/yyy]',
      'Outbound Departure time [hh:mm]',
      'Outbound Departure Terminal',
      'Outbound Flight number',
      'Outbound Arrival to',
      // Hotel
      'Hotel',
      // Personal details
      'First Name',
      'Surname',
      'Guest type',
      'Market',
      'Contact mobile number',
      'Market host',
      'VIP Guest',
      'Transfer Requirements',
      // Car assignment
      'Assigned Cars',
      'Hotel Notes',
      'Arrival Notes',
      'Departure Notes',
      'General notes',
    ];

    const rows: any[][] = [];

    for (const user of users) {
      const profile = user.profile as any;
      const flight = user.flight as any;

      // Get user groups from groupIds array
      const userGroupIds = (user.groupIds as string[]) || [];
      const userGroups = userGroupIds.map((id) => groupMap.get(id)).filter(Boolean);
      const groupNames = userGroups.map((g) => g?.name).join(', ') || 'No Group';

      // Get car assignments (individual overrides take precedence)
      const userCarNumbers = (user.carNumbers as string[]) || [];
      const groupCarNumbers = userGroups.flatMap((g) => (g as any)?.carNumbers || []);
      const uniqueGroupCars = [...new Set(groupCarNumbers)];

      // Use individual cars if assigned, otherwise inherit from groups
      const assignedCars = userCarNumbers.length > 0
        ? userCarNumbers.join(', ')
        : uniqueGroupCars.length > 0
          ? uniqueGroupCars.join(', ')
          : 'None';

      // Get hotel name from room assignment or accommodation
      const accommodation = user.accommodation as any;
      const roomAssignment = user.roomAssignments?.[0];
      const hotelName = accommodation?.hotel || roomAssignment?.hotel?.name || '';

      const row = [
        // Inbound flight fields
        flight?.inbound?.departureDate || '',
        flight?.inbound?.departureTime || '',
        flight?.inbound?.departureFrom || '',
        flight?.inbound?.departureTerminal || '',
        flight?.inbound?.flightNumber || '',
        flight?.inbound?.arrivalDate || '',
        flight?.inbound?.arrivalTime || '',
        flight?.inbound?.arrivalToAirport || '',
        // Outbound flight fields
        flight?.outbound?.departureFrom || '',
        flight?.outbound?.departureDate || '',
        flight?.outbound?.departureTime || '',
        flight?.outbound?.departureTerminal || '',
        flight?.outbound?.flightNumber || '',
        flight?.outbound?.arrivalToAirport || '',
        // Hotel
        hotelName,
        // Personal details
        profile?.firstName || '',
        profile?.lastName || '',
        profile?.guestType || '',
        groupNames,
        profile?.phone || '',
        profile?.host || '',
        profile?.vip ? 'Y' : 'N',
        user.transferRequirements || '',
        // Car assignment
        assignedCars,
        roomAssignment?.hotelNotes || '', // Hotel Notes
        user.arrivalNotes || '', // Arrival Notes
        user.departureNotes || '', // Departure Notes
        user.masterGuestNotes || '', // General notes
      ];

      rows.push(row);
    }

    return {
      headers,
      rows,
      rowMetadata: users.map((user) => ({
        userId: user.id,
        entityId: user.id,
        entityType: 'user' as const,
        editable: true,
      })),
      metadata: {
        title: 'Car Assignment Report',
        description: 'Complete transport allocation report for all event attendees',
        generatedAt: new Date().toISOString(),
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

    // Special handling for Rooming List - add hotel matrix dashboard
    if (reportTitle === 'Rooming List') {
      // Add title and summary rows
      worksheet.mergeCells('A1:D1');
      worksheet.getCell('A1').value = 'HOTEL ROOMING LIST - ROOM ALLOCATION MATRIX';
      worksheet.getCell('A1').font = { bold: true, size: 14 };

      worksheet.mergeCells('A2:D2');
      worksheet.getCell('A2').value = `Generated ${new Date().toLocaleDateString('en-GB')} - Capacity Matrix with Over-allocation Alerts`;

      // Generate room matrix with real data
      const matrixData = await this.generateRoomMatrix(reportData);
      headerRowIndex = this.addRoomMatrixToWorksheet(worksheet, matrixData, 4);
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
   * Generate room allocation matrix for rooming list report
   */
  private static async generateRoomMatrix(reportData: ReportData): Promise<{
    roomTypes: string[];
    dates: string[];
    allocations: { [roomType: string]: { [date: string]: { allocated: number; capacity: number } } };
  }> {
    // Extract date columns from rooming list headers (they start after basic info columns)
    const dateHeaders = reportData.headers.filter(header =>
      header.includes('/') && (header.includes('Monday') || header.includes('Tuesday') ||
        header.includes('Wednesday') || header.includes('Thursday') || header.includes('Friday') ||
        header.includes('Saturday') || header.includes('Sunday'))
    );

    // Extract dates in DD/MM/YYYY format from headers like "Monday\n29/09/2025"
    const dates = dateHeaders.map(header => {
      const parts = header.split('\n');
      return parts[1] || parts[0]; // Get the date part
    });

    // Get unique room types from the data
    const roomTypeIndex = reportData.headers.indexOf('Room Category');
    const roomTypes = Array.from(new Set(
      reportData.rows
        .map(row => row[roomTypeIndex])
        .filter(Boolean)
        .filter(rt => rt !== 'undefined' && rt !== '')
    )).sort();

    // Calculate allocations for each room type and date
    const allocations: { [roomType: string]: { [date: string]: { allocated: number; capacity: number } } } = {};

    // Get event configuration for capacity data
    const eventId = reportData.metadata?.eventId;
    if (eventId) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { hotelConfig: true }
      });

      const hotelConfig = event?.hotelConfig as any;
      const hotel = hotelConfig?.hotels?.[0];

      for (const roomType of roomTypes) {
        allocations[roomType] = {};

        for (const date of dates) {
          // Find capacity from hotel configuration
          const contractedRoom = hotel?.contractedRooms?.find(
            (cr: any) => cr.date === date && cr.roomType === roomType
          );

          // Count actual allocations for this room type and date
          let allocated = 0;
          reportData.rows.forEach((row, rowIndex) => {
            const userRoomType = row[roomTypeIndex];
            if (userRoomType === roomType) {
              // Check if user has "1" in this date column
              const dateColumnIndex = reportData.headers.indexOf(dateHeaders.find(h => h.includes(date)) || '');
              if (dateColumnIndex >= 0 && row[dateColumnIndex] === '1') {
                allocated++;
              }
            }
          });

          allocations[roomType][date] = {
            allocated,
            capacity: contractedRoom?.quantity || 0
          };
        }
      }
    }

    return { roomTypes, dates, allocations };
  }

  /**
   * Add room matrix to Excel worksheet with color coding
   */
  private static addRoomMatrixToWorksheet(
    worksheet: ExcelJS.Worksheet,
    matrixData: { roomTypes: string[]; dates: string[]; allocations: any },
    startRow: number
  ): number {
    const { roomTypes, dates, allocations } = matrixData;

    // Add matrix title
    worksheet.mergeCells(`A${startRow}:${String.fromCharCode(65 + dates.length)}${startRow}`);
    worksheet.getCell(`A${startRow}`).value = 'ROOM ALLOCATION MATRIX - CAPACITY TRACKING';
    worksheet.getCell(`A${startRow}`).font = { bold: true, size: 12 };
    worksheet.getCell(`A${startRow}`).alignment = { horizontal: 'center' };

    // Add matrix headers (Room Type + Date columns)
    const headerRow = startRow + 2;
    worksheet.getCell(`A${headerRow}`).value = 'Room Type';
    worksheet.getCell(`A${headerRow}`).font = { bold: true };
    worksheet.getCell(`A${headerRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' } // Indigo header
    };

    dates.forEach((date, index) => {
      const col = String.fromCharCode(66 + index); // B, C, D, etc.
      worksheet.getCell(`${col}${headerRow}`).value = date;
      worksheet.getCell(`${col}${headerRow}`).font = { bold: true, size: 9 };
      worksheet.getCell(`${col}${headerRow}`).alignment = { horizontal: 'center', wrapText: true };
      worksheet.getCell(`${col}${headerRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F46E5' } // Indigo header
      };
    });

    // Add room type rows with allocation data
    roomTypes.forEach((roomType, roomIndex) => {
      const row = headerRow + 1 + roomIndex;

      // Room type name
      worksheet.getCell(`A${row}`).value = roomType;
      worksheet.getCell(`A${row}`).font = { bold: true };

      // Allocation data for each date
      dates.forEach((date, dateIndex) => {
        const col = String.fromCharCode(66 + dateIndex);
        const allocation = allocations[roomType]?.[date];

        if (allocation) {
          const cellValue = `${allocation.allocated}/${allocation.capacity}`;
          const cell = worksheet.getCell(`${col}${row}`);
          cell.value = cellValue;
          cell.alignment = { horizontal: 'center' };

          // Color coding based on allocation status
          if (allocation.allocated > allocation.capacity) {
            // Over-allocated - RED
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFEF4444' } // Red background
            };
            cell.font = { color: { argb: 'FFFFFF' }, bold: true }; // White text
          } else if (allocation.allocated === allocation.capacity && allocation.capacity > 0) {
            // Fully booked - YELLOW
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFBBF24' } // Yellow background
            };
            cell.font = { color: { argb: 'FF000000' }, bold: true }; // Black text
          } else if (allocation.capacity > 0) {
            // Available - GREEN
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF10B981' } // Green background
            };
            cell.font = { color: { argb: 'FFFFFF' } }; // White text
          } else {
            // No capacity - GRAY
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF6B7280' } // Gray background
            };
            cell.font = { color: { argb: 'FFFFFF' } }; // White text
          }
        }
      });
    });

    // Add legend
    const legendRow = headerRow + roomTypes.length + 2;
    worksheet.getCell(`A${legendRow}`).value = 'Legend:';
    worksheet.getCell(`A${legendRow}`).font = { bold: true };

    // Legend color samples
    const legendItems = [
      { label: 'Over-allocated', color: 'FFEF4444', col: 'B' },
      { label: 'Fully booked', color: 'FFFBBF24', col: 'C' },
      { label: 'Available', color: 'FF10B981', col: 'D' },
      { label: 'No capacity', color: 'FF6B7280', col: 'E' }
    ];

    legendItems.forEach(({ label, color, col }) => {
      const cell = worksheet.getCell(`${col}${legendRow}`);
      cell.value = label;
      cell.font = { size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color }
      };
    });

    return legendRow + 3; // Return next available row for main report data
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
      { id: 'change-report-user', name: 'User Change Report', category: 'Audit Trail' },
      { id: 'change-report-activity', name: 'Activity Change Report (WIP)', category: 'Audit Trail' },
      { id: 'change-report-group', name: 'Group Change Report (WIP)', category: 'Audit Trail' },
      { id: 'change-report-event', name: 'Event Change Report (WIP)', category: 'Audit Trail' },
      { id: 'change-report-operations', name: 'Operations Change Report (WIP)', category: 'Audit Trail' },
      { id: 'merchandise-report', name: 'Merchandise Report', category: 'Operations' },
      { id: 'room-drops', name: 'Room Drops Report', category: 'Operations' },
      { id: 'car-assignment', name: 'Car Assignment Report', category: 'Operations' },
    ];
  }
}