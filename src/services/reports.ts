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
    eventId?: string;
    totalCount: number;
  };
}

export class ReportsService {
  private static asRecord(
    value: unknown
  ): Record<string, unknown> | undefined {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private static getFormResponses(user: unknown): Array<Record<string, unknown>> {
    const userRecord = this.asRecord(user);
    const formResponses = userRecord?.formResponses;
    if (!Array.isArray(formResponses)) {
      return [];
    }

    return formResponses
      .map((entry) => this.asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => !!entry);
  }

  private static getFormResponseString(
    user: unknown,
    fieldNames: string[]
  ): string {
    const normalizedTargets = new Set(fieldNames.map((name) => name.toLowerCase()));

    for (const entry of this.getFormResponses(user)) {
      const fieldName = entry.fieldName;
      if (typeof fieldName !== 'string') {
        continue;
      }

      if (!normalizedTargets.has(fieldName.toLowerCase())) {
        continue;
      }

      const value = entry.value;
      if (typeof value === 'string') {
        return value.trim();
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
    }

    return '';
  }

  private static getFormResponseBoolean(
    user: unknown,
    fieldNames: string[]
  ): boolean {
    const normalizedTargets = new Set(fieldNames.map((name) => name.toLowerCase()));

    for (const entry of this.getFormResponses(user)) {
      const fieldName = entry.fieldName;
      if (typeof fieldName !== 'string') {
        continue;
      }

      if (!normalizedTargets.has(fieldName.toLowerCase())) {
        continue;
      }

      const value = entry.value;
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', 'yes', 'y', '1'].includes(normalized)) {
          return true;
        }
        if (['false', 'no', 'n', '0'].includes(normalized)) {
          return false;
        }
      }
      if (typeof value === 'number') {
        return value !== 0;
      }
    }

    return false;
  }

  private static getProfile(user: unknown): {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    host: string;
    vip: boolean;
    guestType: string;
    jobTitle: string;
    company: string;
  } {
    const userRecord = this.asRecord(user);
    const emailFromModel = typeof userRecord?.email === 'string' ? userRecord.email : '';

    return {
      firstName: this.getFormResponseString(user, ['firstName', 'preferredFirstName']),
      lastName: this.getFormResponseString(user, ['lastName', 'surname', 'familyName']),
      email: this.getFormResponseString(user, ['email']) || emailFromModel,
      phone: this.getFormResponseString(user, ['phone', 'phoneNumber', 'mobile']),
      host: this.getFormResponseString(user, ['host', 'marketHost']),
      vip: this.getFormResponseBoolean(user, ['vip', 'isVip']),
      guestType: this.getFormResponseString(user, ['guestType', 'guestCategory']),
      jobTitle: this.getFormResponseString(user, ['jobTitle']),
      company: this.getFormResponseString(user, ['company']),
    };
  }

  private static getRequirements(user: unknown): {
    dietary: { enabled: boolean; details: string };
    allergiesIntolerances: { enabled: boolean; details: string };
    medical: { enabled: boolean; details: string };
    accessibility: { enabled: boolean; details: string };
  } {
    const dietaryDetails = this.getFormResponseString(user, [
      'dietary',
      'dietaryRequirements',
      'specialDietaryRequirements',
    ]);
    const allergiesDetails = this.getFormResponseString(user, [
      'allergies',
      'allergiesIntolerances',
      'allergiesAndIntolerances',
    ]);
    const medicalDetails = this.getFormResponseString(user, [
      'medical',
      'medicalConditions',
      'medicalInformation',
    ]);
    const accessibilityDetails = this.getFormResponseString(user, [
      'accessibility',
      'accessibilityNeeds',
    ]);

    return {
      dietary: { enabled: dietaryDetails.length > 0, details: dietaryDetails },
      allergiesIntolerances: {
        enabled: allergiesDetails.length > 0,
        details: allergiesDetails,
      },
      medical: { enabled: medicalDetails.length > 0, details: medicalDetails },
      accessibility: {
        enabled: accessibilityDetails.length > 0,
        details: accessibilityDetails,
      },
    };
  }

  private static getEmergencyContact(user: unknown): {
    name: string;
    phone: string;
    email: string;
    relationship: string;
  } {
    return {
      name: this.getFormResponseString(user, ['emergencyContactName']),
      phone: this.getFormResponseString(user, ['emergencyContactPhone']),
      email: this.getFormResponseString(user, ['emergencyContactEmail']),
      relationship: this.getFormResponseString(user, ['emergencyContactRelationship']),
    };
  }

  private static getMerchandiseSize(user: unknown): {
    gender: string;
    size: string;
    shirt: string;
  } {
    const size = this.getFormResponseString(user, ['merchandiseSize', 'shirtSize']);

    return {
      gender: this.getFormResponseString(user, ['gender']),
      size,
      shirt: size,
    };
  }

  private static getRoomAssignments(user: unknown): Array<Record<string, unknown>> {
    const userRecord = this.asRecord(user);
    const roomAssignments = userRecord?.roomAssignments;
    if (!Array.isArray(roomAssignments)) {
      return [];
    }

    return roomAssignments
      .map((assignment) => this.asRecord(assignment))
      .filter((assignment): assignment is Record<string, unknown> => !!assignment);
  }

  private static getRoomAssignmentHotelName(roomAssignment: unknown): string {
    const record = this.asRecord(roomAssignment);
    const hotelRecord = this.asRecord(record?.hotel);
    if (typeof hotelRecord?.name === 'string') {
      return hotelRecord.name;
    }
    return '';
  }

  private static getRoomAssignmentRoomType(roomAssignment: unknown): string {
    const record = this.asRecord(roomAssignment);
    const roomTypeRecord = this.asRecord(record?.roomType);
    if (typeof roomTypeRecord?.name === 'string') {
      return roomTypeRecord.name;
    }
    if (typeof record?.roomType === 'string') {
      return record.roomType;
    }
    if (typeof record?.roomTypeId === 'string') {
      return record.roomTypeId;
    }
    return '';
  }

  private static getActivityExclusionIds(user: unknown): string[] {
    const userRecord = this.asRecord(user);
    const activityExclusions = userRecord?.activityExclusions;
    if (!Array.isArray(activityExclusions)) {
      return [];
    }

    return activityExclusions
      .map((exclusion) => this.asRecord(exclusion)?.activityId)
      .filter((id): id is string => typeof id === 'string');
  }

  private static getRoomDrops(roomDrops: unknown): Array<{
    id: string;
    name: string;
    description: string;
  }> {
    const roomDropsRecord = this.asRecord(roomDrops);
    const drops = roomDropsRecord?.drops;
    if (!Array.isArray(drops)) {
      return [];
    }

    return drops
      .map((drop) => this.asRecord(drop))
      .filter((drop): drop is Record<string, unknown> => !!drop)
      .map((drop) => ({
        id: typeof drop.id === 'string' ? drop.id : '',
        name: typeof drop.name === 'string' ? drop.name : '',
        description:
          typeof drop.description === 'string' ? drop.description : '',
      }))
      .filter((drop) => drop.id.length > 0);
  }

  /**
   * Helper method to safely parse accommodation dates (handles both DD/MM/YYYY strings and ISO strings)
   */
  private static parseAccommodationDate(dateInput: any): Date | null {
    if (!dateInput) return null;

    if (typeof dateInput === 'string' && dateInput.includes('/')) {
      // DD/MM/YYYY format
      const [day, month, year] = dateInput.split('/').map((n) => parseInt(n));
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
        if (value.every((item) => typeof item === 'string')) {
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
  private static isParentObjectField(
    field: string,
    allFields: string[]
  ): boolean {
    // If there are any fields that start with this field + ".", then this is a parent
    const hasChildFields = allFields.some(
      (f) => f !== field && f.startsWith(field + '.')
    );
    return hasChildFields;
  }

  /**
   * Make field names more readable for change reports
   */
  private static makeFieldNameReadable(field: string): string {
    // Split on dots and capitalize each part
    const parts = field.split('.');

    const readableParts = parts.map((part) => {
      // Handle common field name patterns
      const fieldMap: Record<string, string> = {
        firstName: 'First Name',
        lastName: 'Last Name',
        preferredFirstName: 'Preferred First Name',
        guestType: 'Guest Type',
        jobTitle: 'Job Title',
        vip: 'VIP Status',
        emailOptIn: 'Email Opt-in',
        whatsappOptIn: 'WhatsApp Opt-in',
        departureFrom: 'Departure From',
        departureTo: 'Departure To',
        arrivalDate: 'Arrival Date',
        arrivalTime: 'Arrival Time',
        departureDate: 'Departure Date',
        departureTime: 'Departure Time',
        flightNumber: 'Flight Number',
        arrivalToAirport: 'Arrival Airport',
        departureTerminal: 'Departure Terminal',
        checkIn: 'Check-in Date',
        checkOut: 'Check-out Date',
        roomType: 'Room Type',
        doubleOccupancy: 'Double Occupancy',
        visaBookingRequired: 'Visa Booking Required',
        nightsCount: 'Nights Count',
        carNumbers: 'Car Numbers',
        effectiveCarNumbers: 'Effective Car Numbers',
        transferRequirements: 'Transfer Requirements',
        guestCategory: 'Guest Category',
        hotelId: 'Hotel',
        roomAssignments: 'Room Assignments',
      };

      // Use mapped name if available, otherwise capitalize and add spaces
      if (fieldMap[part]) {
        return fieldMap[part];
      }

      // Convert camelCase to Title Case
      return part
        .replace(/([A-Z])/g, ' $1') // Add space before capitals
        .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
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
        resourceType: { in: ['User', 'RoomAssignment'] },
      },
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get unique dates (UTC)
    const uniqueDates = new Set<string>();
    changes.forEach((change) => {
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
      // [V1] Decontaminated legacy report header label for demo-safe exports.
      'Guest type [Market host, Cultural creator, Media, CEO/MD, Trade, Photographer/Videographer, Accompanying guest, Agent/Manager]',
      'Market',
      'Contact mobile number *including area code',
      'market host to keep on cc for all comms',
      'Hotel Booking Required for Visa Y/N',
      'VIP Guest',
      'Assigned Cars',
      'Transfer Requirements',
      'Arrival Notes',
      'General notes',
    ];

    const rows = [];
    const rowMetadata = [];
    const groupMap = new Map(groups.map((g) => [g.id, g.name]));

    // Sort by arrival date, arrival time, then alpha by last name
    const sortedUsers = users
      .filter((user) => (user.flight as any)?.inbound)
      .sort((a, b) => {
        const aFlight = (a.flight as any)?.inbound;
        const bFlight = (b.flight as any)?.inbound;
        const aProfile = this.getProfile(a);
        const bProfile = this.getProfile(b);

        // Compare arrival dates first
        if (aFlight?.arrivalDate && bFlight?.arrivalDate) {
          const dateDiff = aFlight.arrivalDate.localeCompare(
            bFlight.arrivalDate
          );
          if (dateDiff !== 0) return dateDiff;
        }

        // Then compare arrival times
        if (aFlight?.arrivalTime && bFlight?.arrivalTime) {
          const timeDiff = aFlight.arrivalTime.localeCompare(
            bFlight.arrivalTime
          );
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

    sortedUsers.forEach((user) => {
      const profile = this.getProfile(user);
      const flight = (user.flight as any)?.inbound;
      const accommodation = user.accommodation as any;

      // Get market/group names
      const marketNames = user.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean)
        .join(', ');

      // Get car assignments (individual overrides take precedence)
      const userCarNumbers = (user.carNumbers as string[]) || [];
      const groupCarNumbers = user.groupIds
        .map((id) => {
          const group = groups.find((g) => g.id === id);
          return (group as any)?.carNumbers || [];
        })
        .flat();
      const uniqueGroupCars = [...new Set(groupCarNumbers)];
      const assignedCars =
        userCarNumbers.length > 0
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
        user.arrivalNotes || '', // 🎯 Arrival-specific notes
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
        orderBy: [{ guestCategory: 'asc' }, { updatedAt: 'asc' }],
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map((g) => [g.id, g.name]));

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
      'General notes',
    ];

    const rows = [];
    const rowMetadata = [];

    // Sort by departure date, departure time, then alpha by last name
    const sortedUsers = users
      .filter((user) => (user.flight as any)?.outbound)
      .sort((a, b) => {
        const aFlight = (a.flight as any)?.outbound;
        const bFlight = (b.flight as any)?.outbound;
        const aProfile = this.getProfile(a);
        const bProfile = this.getProfile(b);

        // Compare departure dates first
        if (aFlight?.departureDate && bFlight?.departureDate) {
          const dateDiff = aFlight.departureDate.localeCompare(
            bFlight.departureDate
          );
          if (dateDiff !== 0) return dateDiff;
        }

        // Then compare departure times
        if (aFlight?.departureTime && bFlight?.departureTime) {
          const timeDiff = aFlight.departureTime.localeCompare(
            bFlight.departureTime
          );
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

    sortedUsers.forEach((user) => {
      const profile = this.getProfile(user);
      const flight = (user.flight as any)?.outbound;
      const accommodation = user.accommodation as any;
      const roomAssignment = this.getRoomAssignments(user)[0];
      const groupNames = user.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean)
        .join(', ');

      // Get car assignments (individual overrides take precedence)
      const userCarNumbers = (user.carNumbers as string[]) || [];
      const groupCarNumbers = user.groupIds
        .map((id) => {
          const group = groups.find((g) => g.id === id);
          return (group as any)?.carNumbers || [];
        })
        .flat();
      const uniqueGroupCars = [...new Set(groupCarNumbers)];
      const assignedCars =
        userCarNumbers.length > 0
          ? userCarNumbers.join(', ')
          : uniqueGroupCars.length > 0
            ? uniqueGroupCars.join(', ')
            : 'None';

      // Get hotel checkout time from room assignment or accommodation
      const hotelName =
        accommodation?.hotel || this.getRoomAssignmentHotelName(roomAssignment) || '';
      const checkOutDate = this.parseAccommodationDate(accommodation?.checkOut);
      const hotelDepartureTime = checkOutDate
        ? checkOutDate.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })
        : '12:00'; // Default checkout time

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
        },
        include: {
          roomAssignments: {
            where: { eventId },
          },
        },
        orderBy: [{ guestCategory: 'asc' }, { updatedAt: 'asc' }],
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map((g) => [g.id, g.name]));

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
      'Group Assignment',
    ];

    const rows = [];
    const rowMetadata = [];

    users.forEach((user) => {
      const profile = this.getProfile(user);
      const requirements = this.getRequirements(user);
      const emergency = this.getEmergencyContact(user);
      const roomAssignment = this.getRoomAssignments(user)[0];
      const groupNames = user.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean)
        .join(', ');

      rows.push([
        profile?.firstName || '',
        profile?.lastName || '',
        user.guestCategory || 'Standard',
        profile?.email || '',
        profile?.phone || '',
        requirements?.medical?.enabled
          ? requirements.medical.details || 'Yes'
          : '',
        requirements?.allergiesIntolerances?.enabled
          ? requirements.allergiesIntolerances.details || 'Yes'
          : '',
        requirements?.accessibility?.enabled
          ? requirements.accessibility.details || 'Yes'
          : '',
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
        orderBy: [{ guestCategory: 'asc' }, { updatedAt: 'asc' }],
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

    const groupMap = new Map(groups.map((g) => [g.id, g.name]));

    // Base headers: Name fields first, then dietary columns immediately, then minimal other fields
    const baseHeaders = [
      'First Name',
      'Surname',
      'Dietary Requirements',
      'Allergies/Intolerances',
      'Special Meal Requests',
      'Guest Category',
      'Email',
      'Phone',
      'Market',
    ];

    // Add activity attendance columns dynamically
    const activityHeaders = activities.map((activity) => activity.title);
    const headers = [...baseHeaders, ...activityHeaders];

    const rows = [];
    const rowMetadata = [];

    users.forEach((user) => {
      const profile = this.getProfile(user);
      const requirements = this.getRequirements(user);
      const roomAssignment = this.getRoomAssignments(user)[0];
      const groupNames = user.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean)
        .join(', ');
      const exclusions = new Set(this.getActivityExclusionIds(user));

      // Base row data matching the baseHeaders order
      const baseRow = [
        profile?.firstName || '',
        profile?.lastName || '',
        requirements?.dietary?.details || '',
        requirements?.allergiesIntolerances?.enabled
          ? requirements.allergiesIntolerances.details || ''
          : '',
        '', // Special meal requests
        user.guestCategory || '',
        profile?.email || '',
        profile?.phone || '',
        groupNames,
      ];

      // Add activity attendance (Y/N for each activity)
      const activityAttendance = activities.map((activity) => {
        // Check if user is in activity's groups and not excluded
        const isInActivityGroup = activity.groupIds.some((groupId) =>
          user.groupIds.includes(groupId)
        );
        const isExcluded = exclusions.has(activity.id);

        if (isInActivityGroup && !isExcluded) {
          return 'Y';
        } else if (isInActivityGroup && isExcluded) {
          return 'N';
        } else {
          return 'N/A';
        }
      });

      rows.push([...baseRow, ...activityAttendance]);

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
        description:
          'Dietary restrictions and catering requirements with activity attendance',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * Dietary Requirements Export - Custom report for catering coordination
   * Shows only users with dietary.enabled = true
   */
  static async getDietaryRequirementsReport(
    eventId: string
  ): Promise<ReportData> {
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
        orderBy: [{ guestCategory: 'asc' }, { updatedAt: 'asc' }],
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

    const groupMap = new Map(groups.map((g) => [g.id, g.name]));

    // Filter users with dietary requirements enabled
    const usersWithDietary = users.filter((user) => {
      const requirements = this.getRequirements(user);
      return requirements?.dietary?.enabled === true;
    });

    // Base headers: Name fields first, then dietary columns immediately, then minimal other fields
    const baseHeaders = [
      'First Name',
      'Surname',
      'Dietary Requirements',
      'Guest Category',
      'Email',
      'Phone',
      'Market',
    ];

    // Add activity attendance columns dynamically
    const activityHeaders = activities.map((activity) => activity.title);
    const headers = [...baseHeaders, ...activityHeaders];

    const rows = [];
    const rowMetadata = [];

    usersWithDietary.forEach((user) => {
      const profile = this.getProfile(user);
      const requirements = this.getRequirements(user);
      const groupNames = user.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean)
        .join(', ');
      const exclusions = new Set(this.getActivityExclusionIds(user));

      // Base row data matching the baseHeaders order
      const baseRow = [
        profile?.firstName || '',
        profile?.lastName || '',
        requirements?.dietary?.details || '',
        user.guestCategory || '',
        profile?.email || '',
        profile?.phone || '',
        groupNames,
      ];

      // Add activity attendance (Y/N for each activity)
      const activityAttendance = activities.map((activity) => {
        // Check if user is in activity's groups and not excluded
        const isInActivityGroup = activity.groupIds.some((groupId) =>
          user.groupIds.includes(groupId)
        );
        const isExcluded = exclusions.has(activity.id);

        if (isInActivityGroup && !isExcluded) {
          return 'Y';
        } else {
          return 'N'; // Always N for not attending (either excluded or not in group)
        }
      });

      rows.push([...baseRow, ...activityAttendance]);

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
        title: 'Dietary Requirements Export',
        description:
          'Users with dietary requirements for catering coordination with activity attendance',
        generatedAt: new Date(),
        totalCount: rows.length,
      },
    };
  }

  /**
   * Emergency Contact Report - Emergency contacts and market information
   */
  static async getEmergencyReport(eventId: string): Promise<ReportData> {
    const [users, groups] = await Promise.all([
      prisma.user.findMany({
        where: {
          eventId,
          active: true,
        },
        orderBy: [{ guestCategory: 'asc' }, { updatedAt: 'asc' }],
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map((g) => [g.id, g.name]));

    const headers = [
      'Guest Name',
      'Guest Phone',
      'Guest Email',
      'Market Host',
      'Market/Group',
      'Emergency Contact Name',
      'Emergency Contact Phone',
      'Emergency Contact Email',
      'Emergency Contact Relationship',
    ];

    const rows = [];
    const rowMetadata = [];

    users.forEach((user) => {
      const profile = this.getProfile(user);
      const emergency = this.getEmergencyContact(user);
      const groupNames = user.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean)
        .join(', ');

      // Combine first name and last name for the Name column
      const fullName = [profile?.firstName, profile?.lastName]
        .filter(Boolean)
        .join(' ');

      rows.push([
        fullName,
        profile?.phone || '',
        profile?.email || '',
        profile?.host || '', // Market host
        groupNames,
        emergency?.name || '',
        emergency?.phone || '',
        emergency?.email || '',
        emergency?.relationship || '',
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
        title: 'Emergency Report',
        description: 'Emergency contacts and market information',
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
      const dateStr = format(current, 'yyyy-MM-dd', {
        timeZone: EVENT_TIMEZONE,
      });
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
        const shortDate = format(singaporeDate, 'dd/MM/yyyy', {
          timeZone: EVENT_TIMEZONE,
        }); // 29/09/2025
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
      'General notes',
    ];

    const [groups] = await Promise.all([
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map((g) => [g.id, g.name]));

    // Filter out users without check-in date
    const usersWithCheckIn = users.filter((user) => {
      const accommodation = user.accommodation as any;
      const checkIn = this.parseAccommodationDate(accommodation?.checkIn);
      return checkIn !== null;
    });

    // Sort users by check-in date, then by alpha last name
    usersWithCheckIn.sort((a, b) => {
      const aAccommodation = a.accommodation as any;
      const bAccommodation = b.accommodation as any;
      const aProfile = this.getProfile(a);
      const bProfile = this.getProfile(b);

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

    usersWithCheckIn.forEach((user) => {
      const profile = this.getProfile(user);
      const accommodation = user.accommodation as any;
      const flight = user.flight as any;
      const roomAssignment = this.getRoomAssignments(user)[0];
      const checkIn = this.parseAccommodationDate(accommodation?.checkIn);
      const checkOut = this.parseAccommodationDate(accommodation?.checkOut);
      const groupNames = user.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean)
        .join(', ');

      // Get car assignments (individual overrides take precedence)
      const userCarNumbers = (user.carNumbers as string[]) || [];
      const groupCarNumbers = user.groupIds
        .map((id) => {
          const group = groups.find((g) => g.id === id);
          return (group as any)?.carNumbers || [];
        })
        .flat();
      const uniqueGroupCars = [...new Set(groupCarNumbers)];
      const assignedCars =
        userCarNumbers.length > 0
          ? userCarNumbers.join(', ')
          : uniqueGroupCars.length > 0
            ? uniqueGroupCars.join(', ')
            : 'None';

      // 🎯 FIX: Calculate occupancy with proper date comparison
      const occupancyData = eventDates.map((dateStr) => {
        if (!checkIn || !checkOut) return null;

        // Convert event date to Date object for comparison
        const eventDate = new Date(dateStr + 'T12:00:00'); // Noon Singapore time

        // Normalize check-in/check-out to Singapore timezone dates
        let checkInSg: Date;
        let checkOutSg: Date;

        if (
          typeof accommodation.checkIn === 'string' &&
          accommodation.checkIn.includes('/')
        ) {
          // Parse dd/MM/yyyy format
          const [day, month, year] = accommodation.checkIn
            .split('/')
            .map((n) => parseInt(n));
          checkInSg = new Date(year, month - 1, day, 12, 0, 0); // Noon Singapore
        } else {
          checkInSg = toZonedTime(checkIn, EVENT_TIMEZONE);
        }

        if (
          typeof accommodation.checkOut === 'string' &&
          accommodation.checkOut.includes('/')
        ) {
          // Parse dd/MM/yyyy format
          const [day, month, year] = accommodation.checkOut
            .split('/')
            .map((n) => parseInt(n));
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
        this.getRoomAssignmentRoomType(roomAssignment),
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

    const groupMap = new Map(groups.map((g) => [g.id, g.name]));

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

    users.forEach((user) => {
      const profile = this.getProfile(user);
      const roomAssignment = this.getRoomAssignments(user)[0];
      const groupNames = user.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean)
        .join(', ');

      rows.push([
        profile?.lastName || '',
        profile?.firstName || '',
        profile?.email || '',
        profile?.phone || '',
        user.guestCategory || 'Standard',
        groupNames,
        this.getRoomAssignmentRoomType(roomAssignment),
        new Date(user.registeredAt).toLocaleDateString('en-GB'),
        // Enhanced ticket information
        (user.tickets as any)
          ?.map((t: any) => `${t.name} (${t.number})`)
          .join(', ') || 'No tickets',
        (user.tickets as any)
          ?.filter((t: any) => t.valid)
          .map((t: any) => `${t.name} (${t.number})`)
          .join(', ') || 'None',
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
   * Activity Attendance Report - Enhanced with transfer requirements and single-tab all activities
   * Single Activity: Traditional multi-tab format
   * All Activities: Single tab with Y/N columns for each activity (like dietary report)
   */
  static async getActivityAttendanceReport(
    eventId: string,
    activityId?: string
  ): Promise<ReportData & { isMultiTab?: boolean; activityTabs?: any[] }> {
    // Get activities (single or all)
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
              select: { id: true, email: true, formResponses: true },
            },
          },
        },
      },
      orderBy: { startDateTime: 'asc' },
    });

    // Get all groups for car assignment resolution
    const allGroups = await prisma.group.findMany({
      where: { eventId, active: true, deleted: false },
    });
    const groupMap = new Map(allGroups.map((g) => [g.id, g]));

    const isMultiActivity = activities.length > 1;
    const isSingleActivity = !!activityId;

    // SINGLE ACTIVITY MODE: Use multi-tab format (existing behavior)
    if (isSingleActivity) {
      return this.generateSingleActivityReport(
        activities[0],
        allGroups,
        groupMap,
        eventId
      );
    }

    // ALL ACTIVITIES MODE: Use single tab with Y/N columns for each activity
    if (isMultiActivity) {
      return this.generateAllActivitiesReport(
        activities,
        allGroups,
        groupMap,
        eventId
      );
    }

    // Fallback for single activity without activityId specified
    return this.generateSingleActivityReport(
      activities[0],
      allGroups,
      groupMap,
      eventId
    );
  }

  /**
   * Generate single activity report (multi-tab format for consistency)
   */
  private static async generateSingleActivityReport(
    activity: any,
    allGroups: any[],
    groupMap: Map<string, any>,
    eventId: string
  ): Promise<ReportData & { isMultiTab?: boolean; activityTabs?: any[] }> {
    // Define headers with enhanced transfer requirements
    const headers = [
      'First Name',
      'Surname',
      'Hotel',
      'Guest type',
      'Market', // Group names
      'Contact mobile number',
      'Market host',
      'VIP Guest',
      'GP Transfers Required', // NEW: Grand Prix transfers
      'Event Transfers Required', // NEW: General event transfers
      'Transfer Requirements', // Existing: General transfer flag
      'Assigned Cars',
      'General notes',
    ];

    // Get users assigned to this activity's groups
    const users = await prisma.user.findMany({
      where: {
        eventId,
        active: true,
        groupIds: { hasSome: activity.groups.map((g: any) => g.id) },
      },
      include: {
        roomAssignments: {
          where: { eventId },
        },
      },
      orderBy: [{ registeredAt: 'asc' }],
    });

    // Sort users alphabetically by last name, then first name
    users.sort((a, b) => {
      const aProfile = this.getProfile(a);
      const bProfile = this.getProfile(b);

      const aLastName = aProfile?.lastName || '';
      const bLastName = bProfile?.lastName || '';
      const aFirstName = aProfile?.firstName || '';
      const bFirstName = bProfile?.firstName || '';

      if (aLastName !== bLastName) {
        return aLastName.localeCompare(bLastName);
      }
      return aFirstName.localeCompare(bFirstName);
    });

    const excludedUserIds = activity.userExclusions.map((e: any) => e.user.id);
    const activityRows: any[][] = [];
    const activityRowMetadata: any[] = [];

    // Process each user (excluding those with exclusions)
    users
      .filter((user) => !excludedUserIds.includes(user.id))
      .forEach((user) => {
        const profile = this.getProfile(user);
        const accommodation = user.accommodation as any;

        // Get user groups from groupIds array
        const userGroupIds = (user.groupIds as string[]) || [];
        const userGroups = userGroupIds
          .map((id) => groupMap.get(id))
          .filter(Boolean);
        const groupNames =
          userGroups.map((g) => g?.name).join(', ') || 'No Group';

        // Get car assignments (individual overrides take precedence)
        const userCarNumbers = (user.carNumbers as string[]) || [];
        const groupCarNumbers = userGroups.flatMap(
          (g) => (g as any)?.carNumbers || []
        );
        const uniqueGroupCars = [...new Set(groupCarNumbers)];

        const assignedCars =
          userCarNumbers.length > 0
            ? userCarNumbers.join(', ')
            : uniqueGroupCars.length > 0
              ? uniqueGroupCars.join(', ')
              : 'None';

        // Get hotel name from room assignment or accommodation
        const roomAssignment = this.getRoomAssignments(user)[0];
        const hotelName =
          accommodation?.hotel || this.getRoomAssignmentHotelName(roomAssignment) || '';

        const row = [
          profile?.firstName || '',
          profile?.lastName || '',
          hotelName,
          profile?.guestType || '',
          groupNames,
          profile?.phone || '',
          profile?.host || '',
          profile?.vip ? 'Y' : 'N',
          user.gpTransfersRequired ? 'Y' : 'N', // NEW: GP transfers
          user.eventTransfersRequired ? 'Y' : 'N', // NEW: Event transfers
          user.transferRequirements ? 'Y' : 'N', // Existing: General transfers
          assignedCars,
          user.masterGuestNotes || '',
        ];

        activityRows.push(row);

        activityRowMetadata.push({
          userId: user.id,
          entityId: user.id,
          entityType: 'user' as const,
          editable: true,
        });
      });

    // Store activity tab data
    const activityTabs = [
      {
        activityId: activity.id,
        activityName: activity.title,
        startDateTime: activity.startDateTime,
        headers,
        rows: activityRows,
        rowMetadata: activityRowMetadata,
        attendeeCount: activityRows.length,
        excludedCount: excludedUserIds.length,
      },
    ];

    return {
      headers,
      rows: activityRows,
      rowMetadata: activityRowMetadata,
      metadata: {
        title: `Activity Attendance - ${activity.title}`,
        description:
          'Single activity attendance report with detailed guest information',
        generatedAt: new Date(),
        totalCount: activityRows.length,
      },
      isMultiTab: true, // Keep multi-tab for consistency
      activityTabs,
    };
  }

  /**
   * Generate all activities report (single tab with Y/N columns)
   */
  private static async generateAllActivitiesReport(
    activities: any[],
    allGroups: any[],
    groupMap: Map<string, any>,
    eventId: string
  ): Promise<ReportData & { isMultiTab?: boolean; activityTabs?: any[] }> {
    // Get all users for the event
    const [users] = await Promise.all([
      prisma.user.findMany({
        where: {
          eventId,
          active: true,
          assigned: true, // Only assigned users
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
        orderBy: [{ registeredAt: 'asc' }],
      }),
    ]);

    // Sort users alphabetically by last name, then first name
    users.sort((a, b) => {
      const aProfile = this.getProfile(a);
      const bProfile = this.getProfile(b);

      const aLastName = aProfile?.lastName || '';
      const bLastName = bProfile?.lastName || '';
      const aFirstName = aProfile?.firstName || '';
      const bFirstName = bProfile?.firstName || '';

      if (aLastName !== bLastName) {
        return aLastName.localeCompare(bLastName);
      }
      return aFirstName.localeCompare(bFirstName);
    });

    // Base headers with enhanced transfer requirements
    const baseHeaders = [
      'First Name',
      'Surname',
      'Hotel',
      'Guest type',
      'Market', // Group names
      'Contact mobile number',
      'Market host',
      'VIP Guest',
      'GP Transfers Required', // NEW: Grand Prix transfers
      'Event Transfers Required', // NEW: General event transfers
      'Transfer Requirements', // Existing: General transfer flag
      'Assigned Cars',
      'General notes',
    ];

    // Add activity attendance columns dynamically (like dietary report)
    const activityHeaders = activities.map((activity) => activity.title);
    const headers = [...baseHeaders, ...activityHeaders];

    const rows: any[][] = [];
    const rowMetadata: any[] = [];

    users.forEach((user) => {
      const profile = this.getProfile(user);
      const accommodation = user.accommodation as any;
      const roomAssignment = this.getRoomAssignments(user)[0];
      const groupNames = user.groupIds
        .map((id: string) => groupMap.get(id)?.name)
        .filter(Boolean)
        .join(', ');
      const exclusions = new Set(this.getActivityExclusionIds(user));

      // Get user groups for car assignments
      const userGroupIds = (user.groupIds as string[]) || [];
      const userGroups = userGroupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean);

      // Get car assignments (individual overrides take precedence)
      const userCarNumbers = (user.carNumbers as string[]) || [];
      const groupCarNumbers = userGroups.flatMap(
        (g) => (g as any)?.carNumbers || []
      );
      const uniqueGroupCars = [...new Set(groupCarNumbers)];

      const assignedCars =
        userCarNumbers.length > 0
          ? userCarNumbers.join(', ')
          : uniqueGroupCars.length > 0
            ? uniqueGroupCars.join(', ')
            : 'None';

      // Get hotel name from room assignment or accommodation
      const hotelName =
        accommodation?.hotel || this.getRoomAssignmentHotelName(roomAssignment) || '';

      // Base row data matching the baseHeaders order
      const baseRow = [
        profile?.firstName || '',
        profile?.lastName || '',
        hotelName,
        profile?.guestType || '',
        groupNames,
        profile?.phone || '',
        profile?.host || '',
        profile?.vip ? 'Y' : 'N',
        user.gpTransfersRequired ? 'Y' : 'N', // NEW: GP transfers
        user.eventTransfersRequired ? 'Y' : 'N', // NEW: Event transfers
        user.transferRequirements ? 'Y' : 'N', // Existing: General transfers
        assignedCars,
        user.masterGuestNotes || '',
      ];

      // Add activity attendance (Y/N for each activity) - Same logic as dietary report
      const activityAttendance = activities.map((activity) => {
        // Check if user is in activity's groups and not excluded
        const isInActivityGroup = activity.groupIds.some((groupId: string) =>
          user.groupIds.includes(groupId)
        );
        const isExcluded = exclusions.has(activity.id);

        if (isInActivityGroup && !isExcluded) {
          return 'Y';
        } else if (isInActivityGroup && isExcluded) {
          return 'N'; // Explicitly excluded
        } else {
          return 'N/A'; // Not in activity's groups
        }
      });

      rows.push([...baseRow, ...activityAttendance]);

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
        title: 'Activities Attendance - All Activities',
        description: `All activities attendance report with Y/N columns for ${activities.length} activities`,
        generatedAt: new Date(),
        totalCount: rows.length,
      },
      isMultiTab: false, // Single tab format
      activityTabs: [], // No separate tabs
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
        orderBy: [{ guestCategory: 'asc' }, { updatedAt: 'asc' }],
      }),
      prisma.group.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, name: true },
      }),
    ]);

    const groupMap = new Map(groups.map((g) => [g.id, g.name]));

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

    users.forEach((user) => {
      const profile = this.getProfile(user);
      const roomAssignment = this.getRoomAssignments(user)[0];
      const groupNames = user.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean)
        .join(', ');

      rows.push([
        user.guestCategory || 'Standard',
        profile?.firstName || '',
        profile?.lastName || '',
        profile?.email || '',
        profile?.phone || '',
        groupNames,
        this.getRoomAssignmentRoomType(roomAssignment),
        user.roomDropAssigned || '',
        new Date(user.registeredAt).toLocaleDateString('en-GB'),
        // Enhanced ticket information
        (user.tickets as any)
          ?.map((t: any) => `${t.name} (${t.number})`)
          .join(', ') || 'No tickets',
        (user.tickets as any)
          ?.filter((t: any) => t.valid)
          .map((t: any) => `${t.name} (${t.number})`)
          .join(', ') || 'None',
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
      const groupUsers = users.filter((user) =>
        user.groupIds.includes(group.id)
      );

      groupUsers.forEach((user) => {
        const profile = this.getProfile(user);
        const roomAssignment = this.getRoomAssignments(user)[0];

        rows.push([
          group.name,
          profile?.firstName || '',
          profile?.lastName || '',
          user.guestCategory || 'Standard',
          profile?.email || '',
          profile?.phone || '',
          this.getRoomAssignmentRoomType(roomAssignment),
          new Date(user.registeredAt).toLocaleDateString(),
          // Enhanced ticket information
          (user.tickets as any)
            ?.map((t: any) => `${t.name} (${t.number})`)
            .join(', ') || 'No tickets',
          (user.tickets as any)
            ?.filter((t: any) => t.valid)
            .map((t: any) => `${t.name} (${t.number})`)
            .join(', ') || 'None',
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

    const groupMap = new Map(groups.map((g) => [g.id, g.name]));

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
    const activityHeaders = activities.map((activity) => activity.title);
    const headers = [
      ...baseHeaders,
      ...activityHeaders,
      'General notes',
      'Arrival Notes',
      'Departure Notes',
      'Hotel Notes',
    ];

    const rows = [];
    const rowMetadata = [];

    users.forEach((user) => {
      const profile = this.getProfile(user);
      const accommodation = user.accommodation as any;
      const flight = user.flight as any;
      const requirements = this.getRequirements(user);
      const emergency = this.getEmergencyContact(user);
      const merchandise = this.getMerchandiseSize(user);
      const roomAssignment = this.getRoomAssignments(user)[0];
      const exclusions = new Set(this.getActivityExclusionIds(user));

      const groupNames = user.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean)
        .join(', ');
      const checkIn = this.parseAccommodationDate(accommodation?.checkIn);
      const checkOut = this.parseAccommodationDate(accommodation?.checkOut);
      const nights =
        checkIn && checkOut
          ? Math.ceil(
            (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
          )
          : '';

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
        requirements?.accessibility?.enabled
          ? requirements.accessibility.details || 'Yes'
          : 'N/A',
        requirements?.dietary?.enabled
          ? requirements.dietary.details || 'Yes'
          : 'N/A',
        requirements?.medical?.enabled
          ? requirements.medical.details || 'Yes'
          : 'N/A',
        flight?.inbound ? 'Airplane' : 'N/A',
        accommodation?.required ? 'Y' : 'N',
        accommodation?.hotel ||
        this.getRoomAssignmentRoomType(roomAssignment).includes('Casa')
          ? 'Casa Brera'
          : '',
        this.getRoomAssignmentRoomType(roomAssignment) ||
          accommodation?.roomType ||
          '',
        checkIn ? checkIn.toLocaleDateString('en-GB') : '',
        checkOut ? checkOut.toLocaleDateString('en-GB') : '',
        nights,
        user.roomDropAssigned ? 'Y' : 'N',
        roomAssignment?.billingNotes || 'All charges to Master Account',
        // Enhanced ticket information
        (user.tickets as any)?.map((t: any) => t.name).join(', ') ||
        'No tickets',
        (user.tickets as any)?.map((t: any) => t.number).join(', ') ||
        'No numbers',
        (user.tickets as any)
          ?.filter((t: any) => t.valid)
          .map((t: any) => t.name)
          .join(', ') || 'None',
        (user.tickets as any)
          ?.filter((t: any) => !t.valid)
          .map((t: any) => t.name)
          .join(', ') || 'None',
      ];

      // Add activity attendance (Y/N for each activity)
      const activityAttendance = activities.map((activity) => {
        // Check if user is in activity's groups and not excluded
        const isInActivityGroup = activity.groupIds.some((groupId) =>
          user.groupIds.includes(groupId)
        );
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
        user.masterGuestNotes || '', // General notes (first - most important)
        user.arrivalNotes || '', // Arrival Notes
        user.departureNotes || '', // Departure Notes
        roomAssignment?.hotelNotes || '', // Hotel Notes
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
      resourceType: { in: ['User', 'RoomAssignment'] },
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
    recentLogs.forEach((log) => {
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
    console.log(
      `🔍 Direct query found ${sortedFields.length} fields:`,
      sortedFields
    );

    console.log(
      `🔍 Found ${sortedFields.length} unique changed fields:`,
      sortedFields.slice(0, 10)
    );

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
    sortedFields.forEach((field) => {
      const readableField = this.makeFieldNameReadable(field);
      fieldColumns.push(`${readableField} (old)`);
      fieldColumns.push(`${readableField} (new)`);
    });

    const headers = [...baseHeaders, ...fieldColumns];

    console.log(`🔍 Final headers (${headers.length} total):`, headers);

    // Build rows with enhanced guest info and separate old/new columns
    const rows = auditLogs.map((log) => {
      const metadata = log.metadata as any;
      const changes = log.changes as any;

      // Extract guest information from changes data
      const afterData = changes?.after;
      const beforeData = changes?.before;

      // Get user profile data (prefer after, fallback to before)
      const profile = afterData?.profile || beforeData?.profile || {};
      const guestName =
        profile?.firstName && profile?.lastName
          ? `${profile.firstName} ${profile.lastName}`
          : profile?.firstName || profile?.lastName || 'Unknown User';
      const guestType =
        profile?.guestType ||
        afterData?.guestCategory ||
        beforeData?.guestCategory ||
        '';
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
      console.log(
        `🔍 Processing log for ${log.summary}: fields=`,
        changedFieldsInThisRecord
      );

      const fieldMatrix: string[] = [];
      sortedFields.forEach((fieldPath) => {
        if (!changedFieldsInThisRecord.includes(fieldPath)) {
          // Field not changed - add empty values for both old and new columns
          fieldMatrix.push(''); // old column
          fieldMatrix.push(''); // new column
          return;
        }

        // Get before and after values for this specific field path
        const beforeValue = ReportsService.getNestedValue(
          changes?.before,
          fieldPath
        );
        const afterValue = ReportsService.getNestedValue(
          changes?.after,
          fieldPath
        );

        // Add separate old and new values
        fieldMatrix.push(
          beforeValue !== undefined
            ? ReportsService.formatValue(beforeValue)
            : ''
        ); // old column
        fieldMatrix.push(
          afterValue !== undefined ? ReportsService.formatValue(afterValue) : ''
        ); // new column
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

    const groupMap = new Map(groups.map((g) => [g.id, g.name]));

    const headers = [
      'First Name',
      'Surname',
      'Guest Category',
      'Market',
      'Gender',
      'Size',
    ];

    const rows = [];
    const rowMetadata = [];

    users.forEach((user) => {
      const profile = this.getProfile(user);
      const merchandise = this.getMerchandiseSize(user);

      // Only include users who have either gender or size data
      const hasGender = merchandise?.gender && merchandise.gender.trim() !== '';
      const hasSize = (merchandise?.size && merchandise.size.trim() !== '') ||
        (merchandise?.shirt && merchandise.shirt.trim() !== '');

      if (!hasGender && !hasSize) {
        return; // Skip this user - no merchandise data
      }

      const roomAssignment = this.getRoomAssignments(user)[0];
      const groupNames = user.groupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean)
        .join(', ');

      rows.push([
        profile?.firstName || '',
        profile?.lastName || '',
        user.guestCategory || 'Standard',
        groupNames, // Market (group names represent markets)
        merchandise?.gender || '',
        merchandise?.size || merchandise?.shirt || '',
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

    const roomDrops = this.getRoomDrops(event?.roomDrops);
    const roomDropMap = new Map(roomDrops.map((drop) => [drop.id, drop]));

    const rows = [];
    const rowMetadata = [];

    users.forEach((user) => {
      const profile = this.getProfile(user);
      const roomAssignment = this.getRoomAssignments(user)[0];
      const roomDrop = roomDropMap.get(user.roomDropAssigned);

      rows.push([
        profile?.firstName || '',
        profile?.lastName || '',
        profile?.email || '',
        user.guestCategory || 'Standard',
        roomDrop?.name || user.roomDropAssigned || '',
        roomDrop?.description || '',
        this.getRoomAssignmentRoomType(roomAssignment),
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

    // Sort users by market (groups) alphabetically, then by first name within each market
    users.sort((a, b) => {
      const aProfile = this.getProfile(a);
      const bProfile = this.getProfile(b);

      // Get market names for comparison
      const aUserGroupIds = (a.groupIds as string[]) || [];
      const bUserGroupIds = (b.groupIds as string[]) || [];
      const aGroupNames =
        aUserGroupIds
          .map((id) => groupMap.get(id)?.name)
          .filter(Boolean)
          .join(', ') || 'ZZZ'; // Put users without groups at end
      const bGroupNames =
        bUserGroupIds
          .map((id) => groupMap.get(id)?.name)
          .filter(Boolean)
          .join(', ') || 'ZZZ';

      // Compare markets first
      if (aGroupNames !== bGroupNames) {
        return aGroupNames.localeCompare(bGroupNames);
      }

      // Within same market, sort by first name
      const aFirstName = aProfile?.firstName || '';
      const bFirstName = bProfile?.firstName || '';
      return aFirstName.localeCompare(bFirstName);
    });

    const headers = [
      'Market',
      'Guest Name',
      'Car Number',
      'Guest Type',
      'Contact',
      'Market Host',
      'VIP',
    ];

    const rows: any[][] = [];

    for (const user of users) {
      const profile = this.getProfile(user);

      // Get user groups from groupIds array
      const userGroupIds = (user.groupIds as string[]) || [];
      const userGroups = userGroupIds
        .map((id) => groupMap.get(id))
        .filter(Boolean);
      const groupNames =
        userGroups.map((g) => g?.name).join(', ') || 'No Group';

      // Get car assignments (individual overrides take precedence)
      const userCarNumbers = (user.carNumbers as string[]) || [];
      const groupCarNumbers = userGroups.flatMap(
        (g) => (g as any)?.carNumbers || []
      );
      const uniqueGroupCars = [...new Set(groupCarNumbers)];

      // Use individual cars if assigned, otherwise inherit from groups
      const assignedCars =
        userCarNumbers.length > 0
          ? userCarNumbers.join(', ')
          : uniqueGroupCars.length > 0
            ? uniqueGroupCars.join(', ')
            : 'None';

      // Combine first name and last name for Guest Name
      const fullName = [profile?.firstName, profile?.lastName]
        .filter(Boolean)
        .join(' ');

      const row = [
        groupNames, // Market
        fullName, // Guest Name
        assignedCars, // Car Number
        user.guestCategory || 'Standard', // Guest Type
        profile?.phone || '', // Contact
        profile?.host || '', // Market Host
        profile?.vip ? 'Yes' : 'No', // VIP
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
        description:
          'Transport allocation organized by market with guest and car details',
        generatedAt: new Date(),
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
      worksheet.getCell('A1').value =
        'HOTEL ROOMING LIST - ROOM ALLOCATION MATRIX';
      worksheet.getCell('A1').font = { bold: true, size: 14 };

      worksheet.mergeCells('A2:D2');
      worksheet.getCell('A2').value =
        `Generated ${new Date().toLocaleDateString('en-GB')} - Capacity Matrix with Over-allocation Alerts`;

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
      fgColor: { argb: 'FFE6E6FA' },
    };
    headerRow.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    headerRow.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };

    // Add data rows with alternating colors
    reportData.rows.forEach((row, index) => {
      const dataRow = worksheet.insertRow(headerRowIndex + 1 + index, row);

      // Alternating row colors
      if (index % 2 === 1) {
        dataRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8F8FF' },
        };
      }

      // Add borders
      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });

      // Format date columns (European format)
      dataRow.eachCell((cell, colNumber) => {
        if (
          typeof cell.value === 'string' &&
          cell.value.match(/\d{2}\/\d{2}\/\d{4}/)
        ) {
          cell.numFmt = 'dd/mm/yyyy';
        }
      });
    });

    // Enhanced auto-sizing with better column management
    worksheet.columns.forEach((column, index) => {
      if (column.values && column.values.length > 0) {
        const lengths = column.values
          .filter((v) => v != null)
          .map((v) => v.toString().length);

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
      worksheet.getCell(`A${lastRow}`).value =
        `Report: ${reportData.metadata.title}`;
      worksheet.getCell(`A${lastRow + 1}`).value =
        `Generated: ${reportData.metadata.generatedAt.toLocaleString('en-GB')}`;
      worksheet.getCell(`A${lastRow + 2}`).value =
        `Total Records: ${reportData.metadata.totalCount}`;
      worksheet.getCell(`A${lastRow + 3}`).value =
        `Description: ${reportData.metadata.description}`;

      // Style metadata
      [lastRow, lastRow + 1, lastRow + 2, lastRow + 3].forEach((row) => {
        const cell = worksheet.getCell(`A${row}`);
        cell.font = { italic: true, size: 10 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF0F0F0' },
        };
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  }

  /**
   * 🚀 Generate Multi-Tab Excel file for Enhanced Activities Attendance Report
   */
  static async generateMultiTabExcelFile(
    reportData: ReportData & { activityTabs?: any[] }
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    if (!reportData.activityTabs || reportData.activityTabs.length === 0) {
      // Fallback to single tab if no activity tabs
      return this.generateExcelFile(reportData);
    }

    // Create a tab for each activity
    reportData.activityTabs.forEach((activityTab, index) => {
      const safeName = activityTab.activityName
        .replace(/[\\\/:*?"<>|]/g, '_') // Remove invalid characters for sheet names
        .substring(0, 31); // Excel sheet name limit

      const worksheet = workbook.addWorksheet(
        safeName || `Activity ${index + 1}`
      );

      // Add activity header info
      worksheet.mergeCells('A1:N1');
      worksheet.getCell('A1').value = `ACTIVITY: ${activityTab.activityName}`;
      worksheet.getCell('A1').font = {
        bold: true,
        size: 14,
        color: { argb: 'FF000000' },
      };
      worksheet.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4A90E2' }, // Blue header
      };
      worksheet.getCell('A1').alignment = {
        horizontal: 'center',
        vertical: 'middle',
      };

      // Add activity details
      worksheet.mergeCells('A2:N2');
      const activityTime = new Date(activityTab.startDateTime).toLocaleString(
        'en-GB'
      );
      worksheet.getCell('A2').value =
        `Time: ${activityTime} | Attendees: ${activityTab.attendeeCount} | Excluded: ${activityTab.excludedCount}`;
      worksheet.getCell('A2').font = { italic: true, size: 12 };
      worksheet.getCell('A2').alignment = { horizontal: 'center' };

      // Add headers starting from row 4
      const headerRow = worksheet.insertRow(4, activityTab.headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E7D32' }, // Green headers
      };
      headerRow.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      headerRow.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };

      // Add data rows with alternating colors
      activityTab.rows.forEach((row: any[], rowIndex: number) => {
        const dataRow = worksheet.insertRow(5 + rowIndex, row);

        // Alternating row colors
        if (rowIndex % 2 === 1) {
          dataRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8F9FA' }, // Light gray for alternate rows
          };
        }

        // Add borders
        dataRow.eachCell((cell: any) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          };
          cell.alignment = { vertical: 'middle', wrapText: true };
        });
      });

      // Auto-size columns
      worksheet.columns.forEach((column: any, colIndex: number) => {
        if (activityTab.rows.length > 0) {
          const headerLength = (activityTab.headers[colIndex] || '').length;
          const maxLength = Math.max(
            ...activityTab.rows.map(
              (row: any[]) => String(row[colIndex] || '').length
            )
          );
          column.width = Math.min(Math.max(maxLength, headerLength, 10), 40);
        } else {
          column.width = 15;
        }
      });

      // Add metadata at the bottom
      const lastRow = worksheet.rowCount + 2;
      worksheet.getCell(`A${lastRow}`).value =
        `Generated: ${new Date().toLocaleString('en-GB')}`;
      worksheet.getCell(`A${lastRow + 1}`).value =
        `Activity: ${activityTab.activityName}`;
      worksheet.getCell(`A${lastRow + 2}`).value =
        `Attendees: ${activityTab.attendeeCount} (Excluding ${activityTab.excludedCount} excluded users)`;

      // Style metadata
      [lastRow, lastRow + 1, lastRow + 2].forEach((row) => {
        const cell = worksheet.getCell(`A${row}`);
        cell.font = { italic: true, size: 10 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF0F0F0' },
        };
      });
    });

    // Add a summary tab if there are multiple activities
    if (reportData.activityTabs.length > 1) {
      const summarySheet = workbook.addWorksheet('Summary');

      // Summary header
      summarySheet.mergeCells('A1:E1');
      summarySheet.getCell('A1').value = 'ACTIVITIES ATTENDANCE SUMMARY';
      summarySheet.getCell('A1').font = { bold: true, size: 16 };
      summarySheet.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF9C27B0' }, // Purple
      };
      summarySheet.getCell('A1').alignment = { horizontal: 'center' };

      // Summary table headers
      const summaryHeaders = [
        'Activity Name',
        'Date & Time',
        'Attendees',
        'Excluded',
        'Total Assigned',
      ];
      const summaryHeaderRow = summarySheet.insertRow(3, summaryHeaders);
      summaryHeaderRow.font = { bold: true };
      summaryHeaderRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' },
      };

      // Add summary data
      reportData.activityTabs.forEach((tab, index) => {
        const summaryRow = [
          tab.activityName,
          new Date(tab.startDateTime).toLocaleString('en-GB'),
          tab.attendeeCount,
          tab.excludedCount,
          tab.attendeeCount + tab.excludedCount,
        ];
        summarySheet.insertRow(4 + index, summaryRow);
      });

      // Auto-size summary columns
      summarySheet.columns.forEach((column: any) => {
        column.width = 20;
      });

      // Keep summary sheet in workbook; ExcelJS appends newly created sheets.
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  }

  /**
   * Generate room allocation matrix for rooming list report
   */
  private static async generateRoomMatrix(reportData: ReportData): Promise<{
    roomTypes: string[];
    dates: string[];
    allocations: {
      [roomType: string]: {
        [date: string]: { allocated: number; capacity: number };
      };
    };
  }> {
    // Extract date columns from rooming list headers (they start after basic info columns)
    const dateHeaders = reportData.headers.filter(
      (header) =>
        header.includes('/') &&
        (header.includes('Monday') ||
          header.includes('Tuesday') ||
          header.includes('Wednesday') ||
          header.includes('Thursday') ||
          header.includes('Friday') ||
          header.includes('Saturday') ||
          header.includes('Sunday'))
    );

    // Extract dates in DD/MM/YYYY format from headers like "Monday\n29/09/2025"
    const dates = dateHeaders.map((header) => {
      const parts = header.split('\n');
      return parts[1] || parts[0]; // Get the date part
    });

    // Get unique room types from the data
    const roomTypeIndex = reportData.headers.indexOf('Room Category');
    const roomTypes = Array.from(
      new Set(
        reportData.rows
          .map((row) => row[roomTypeIndex])
          .filter(Boolean)
          .filter((rt) => rt !== 'undefined' && rt !== '')
      )
    ).sort();

    // Calculate allocations for each room type and date
    const allocations: {
      [roomType: string]: {
        [date: string]: { allocated: number; capacity: number };
      };
    } = {};

    // Get event configuration for capacity data
    const eventId = reportData.metadata?.eventId;
    if (eventId) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { hotelConfig: true },
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
              const dateColumnIndex = reportData.headers.indexOf(
                dateHeaders.find((h) => h.includes(date)) || ''
              );
              if (dateColumnIndex >= 0 && row[dateColumnIndex] === '1') {
                allocated++;
              }
            }
          });

          allocations[roomType][date] = {
            allocated,
            capacity: contractedRoom?.quantity || 0,
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
    worksheet.mergeCells(
      `A${startRow}:${String.fromCharCode(65 + dates.length)}${startRow}`
    );
    worksheet.getCell(`A${startRow}`).value =
      'ROOM ALLOCATION MATRIX - CAPACITY TRACKING';
    worksheet.getCell(`A${startRow}`).font = { bold: true, size: 12 };
    worksheet.getCell(`A${startRow}`).alignment = { horizontal: 'center' };

    // Add matrix headers (Room Type + Date columns)
    const headerRow = startRow + 2;
    worksheet.getCell(`A${headerRow}`).value = 'Room Type';
    worksheet.getCell(`A${headerRow}`).font = { bold: true };
    worksheet.getCell(`A${headerRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' }, // Indigo header
    };

    dates.forEach((date, index) => {
      const col = String.fromCharCode(66 + index); // B, C, D, etc.
      worksheet.getCell(`${col}${headerRow}`).value = date;
      worksheet.getCell(`${col}${headerRow}`).font = { bold: true, size: 9 };
      worksheet.getCell(`${col}${headerRow}`).alignment = {
        horizontal: 'center',
        wrapText: true,
      };
      worksheet.getCell(`${col}${headerRow}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F46E5' }, // Indigo header
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
              fgColor: { argb: 'FFEF4444' }, // Red background
            };
            cell.font = { color: { argb: 'FFFFFF' }, bold: true }; // White text
          } else if (
            allocation.allocated === allocation.capacity &&
            allocation.capacity > 0
          ) {
            // Fully booked - YELLOW
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFBBF24' }, // Yellow background
            };
            cell.font = { color: { argb: 'FF000000' }, bold: true }; // Black text
          } else if (allocation.capacity > 0) {
            // Available - GREEN
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF10B981' }, // Green background
            };
            cell.font = { color: { argb: 'FFFFFF' } }; // White text
          } else {
            // No capacity - GRAY
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF6B7280' }, // Gray background
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
      { label: 'No capacity', color: 'FF6B7280', col: 'E' },
    ];

    legendItems.forEach(({ label, color, col }) => {
      const cell = worksheet.getCell(`${col}${legendRow}`);
      cell.value = label;
      cell.font = { size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: color },
      };
    });

    return legendRow + 3; // Return next available row for main report data
  }

  /**
   * Get all available reports metadata
   */
  static getAvailableReports() {
    return [
      {
        id: 'arrival-list',
        name: 'Arrival List',
        category: 'Flight Coordination',
      },
      {
        id: 'departure-list',
        name: 'Departure List',
        category: 'Flight Coordination',
      },
      { id: 'medical-list', name: 'Medical List', category: 'Requirements' },
      { id: 'dietary-list', name: 'Dietary List', category: 'Requirements' },
      {
        id: 'dietary-requirements',
        name: 'Dietary Requirements Export',
        category: 'Requirements',
      },
      {
        id: 'emergency-report',
        name: 'Emergency Report',
        category: 'Requirements',
      },
      { id: 'rooming-list', name: 'Rooming List', category: 'Accommodation' },
      {
        id: 'guest-list-alpha',
        name: 'Guest List by Alpha',
        category: 'Guest Lists',
      },
      {
        id: 'activity-attendance',
        name: 'Activity Attendance',
        category: 'Activities',
      },
      {
        id: 'guest-list-type',
        name: 'Guest List by Type',
        category: 'Guest Lists',
      },
      {
        id: 'guest-list-group',
        name: 'Guest List by Group',
        category: 'Guest Lists',
      },
      {
        id: 'master-guest',
        name: 'Master Guest Report',
        category: 'Complete Data',
      },
      {
        id: 'change-report-user',
        name: 'User Change Report',
        category: 'Audit Trail',
      },
      {
        id: 'change-report-activity',
        name: 'Activity Change Report (WIP)',
        category: 'Audit Trail',
      },
      {
        id: 'change-report-group',
        name: 'Group Change Report (WIP)',
        category: 'Audit Trail',
      },
      {
        id: 'change-report-event',
        name: 'Event Change Report (WIP)',
        category: 'Audit Trail',
      },
      {
        id: 'change-report-operations',
        name: 'Operations Change Report (WIP)',
        category: 'Audit Trail',
      },
      {
        id: 'merchandise-report',
        name: 'Merchandise Report',
        category: 'Operations',
      },
      { id: 'room-drops', name: 'Room Drops Report', category: 'Operations' },
      {
        id: 'car-assignment',
        name: 'Car Assignment Report',
        category: 'Operations',
      },
    ];
  }
}
