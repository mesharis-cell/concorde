import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcrypt';
import * as dateFnsTz from 'date-fns-tz';
import * as ExcelJS from 'exceljs';
import { RoomAssignmentService } from '../src/services/room-assignments.js';
import { GroupService } from '../src/services/groups.js';
import { ActivityService } from '../src/services/activities.js';
import { UserActivityExclusionService } from '../src/services/user-activity-exclusions.js';

const prisma = new PrismaClient({
  log: ['error'],
});

// Event timezone for proper date handling
const EVENT_TIMEZONE = 'Asia/Singapore';

// Dynamic group cache for created groups
const groupCache = new Map<string, string>();

interface CSVRow {
  market: string;
  firstName: string;
  lastName: string;
  nickname: string;
  guestType: string;
  jobTitle: string;
  company: string;
  internalVip: string;
  vipGuest: string;
  email: string;
  contactMobile: string;
  host: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  gender: string;
  sizeRequirements: string;
  initials: string;
  accessibilityRequirements: string;
  dietaryRequirements: string;
  medicalInformation: string;
  transportMode: string;
  inboundDepartureFrom: string;
  inboundDepartureDate: string;
  inboundDepartureTime: string;
  inboundDepartureTerminal: string;
  inboundFlightNumber: string;
  connectingFlight: string;
  inboundArrivalDate: string;
  inboundArrivalTime: string;
  inboundArrivalTo: string;
  transportRequired: string;
  outboundDepartureFrom: string;
  outboundDepartureDate: string;
  outboundDepartureTime: string;
  outboundDepartureTerminal: string;
  outboundFlightNumber: string;
  outboundArrivalTo: string;
  accommodationRequired: string;
  hotelName: string;
  roomCategory: string;
  occupancy: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfNights: string;
  hotelBookingForVisa: string;
  notes: string;
  roomDrop: string;
  // Skip columns 48-52 (all "-" empty columns)
  // Activity assignments
  crystalGoldLaunch: string;
  // Skip column 54 ("-" empty column)
  clcInterview: string;
  sandyInterview: string; // New column
  airCccc: string;
  casaFerrari: string;
  prsPaddockClubFri: string;
  regalClubFri: string;
  crystalGoldLoungeFri: string;
  eveningBar: string; // Special: contains venue name rather than Y/N
  fredInterviewSession: string;
  // Skip column 64 ("-" empty column)
  prsPaddockClubSat: string;
  regalClubSat: string;
  crystalGoldLoungeSat: string;
  sushiSambaAfterParty: string;
  prsPaddockClubSun: string;
  regalClubSun: string;
  // Skip column 71 ("-" empty column)
  crystalGoldLoungeSun: string;
  lavoAfterParty: string;
  gpTransfersRequired: string;
  eventTransfersRequired: string;
  // Car assignment
  marketCarNumber: string;
  marketCarNumberNotes: string;
}

// Helper to generate MongoDB ObjectId
const generateObjectId = (): string => {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0');
  const random = Math.random().toString(16).substring(2, 18).padStart(16, '0');
  return timestamp + random.substring(0, 16);
};

// Event configuration
const eventConfig = {
  _id: '68c2cd941de2da411f2a2f98',
  active: true,
  config: {
    micrositeUrl: 'https://events.company.com/sgp2025',
    registrationOpen: true,
  },
  dateRange: {
    start: '2025-09-25T12:00:00.000Z',
    end: '2025-10-05T16:00:00.000Z',
  },
  location: {
    city: 'Singapore',
    country: 'Singapore',
    venue: 'Marina Bay Street Circuit',
    timezone: 'Asia/Singapore',
  },
  name: 'Singapore Grand Prix 2025',
  shortName: 'SGP2025',
};

const hotelConfig = {
  name: 'Mondrian Singapore Duxton',
  isDefault: true,
  checkInTime: '15:00',
  checkOutTime: '12:00',
  address: '',
  phone: '',
  email: '',
};

const roomTypes = [
  {
    name: 'Signature King',
    description: 'Spacious king room with city views',
    basePrice: 0,
  },
  {
    name: 'Suite King',
    description: 'Premium king suite with enhanced amenities',
    basePrice: 0,
  },
  {
    name: 'Shophouse suite',
    description: 'Premium suite in heritage shophouse',
    basePrice: 0,
  },
  {
    name: 'Signature Twin',
    description: 'Signature room with twin beds',
    basePrice: 0,
  },
];

// Car configuration for Singapore Grand Prix 2025
const carConfig = [
  { id: '1', name: 'Car 1', type: 'standard', plate: '', driver: '' },
  { id: '2', name: 'Car 2', type: 'standard', plate: '', driver: '' },
  { id: '3', name: 'Car 3', type: 'standard', plate: '', driver: '' },
  { id: '4', name: 'Car 4', type: 'standard', plate: '', driver: '' },
  { id: '5', name: 'Car 5', type: 'standard', plate: '', driver: '' },
  { id: '6', name: 'Car 6', type: 'standard', plate: '', driver: '' },
  { id: '7', name: 'Car 7', type: 'standard', plate: '', driver: '' },
  { id: '8', name: 'Car 8', type: 'standard', plate: '', driver: '' },
  { id: '9', name: 'Car 9', type: 'standard', plate: '', driver: '' },
  { id: '10', name: 'Car 10', type: 'standard', plate: '', driver: '' },
  { id: '11', name: 'Car 11', type: 'standard', plate: '', driver: '' },
  { id: '12', name: 'Car 12', type: 'standard', plate: '', driver: '' },
  { id: '13', name: 'Car 13', type: 'standard', plate: '', driver: '' },
  { id: '14', name: 'Car 14', type: 'standard', plate: '', driver: '' },
  { id: '15', name: 'Car 15', type: 'standard', plate: '', driver: '' },
  { id: '16', name: 'Car 16', type: 'standard', plate: '', driver: '' },
  { id: '17', name: 'Car 17', type: 'standard', plate: '', driver: '' },
  { id: '18', name: 'Car 18', type: 'standard', plate: '', driver: '' },
  { id: '19', name: 'Car 19', type: 'standard', plate: '', driver: '' },
  { id: '20', name: 'Car 20', type: 'standard', plate: '', driver: '' },
  { id: '21', name: 'Car 21', type: 'standard', plate: '', driver: '' },
  { id: '22', name: 'Car 22', type: 'standard', plate: '', driver: '' },
  { id: '23', name: 'Car 23', type: 'standard', plate: '', driver: '' },
  { id: '24', name: 'Car 24', type: 'standard', plate: '', driver: '' },
  { id: '25', name: 'Car 25', type: 'standard', plate: '', driver: '' },
  { id: '26', name: 'Car 26', type: 'standard', plate: '', driver: '' },
  { id: '27', name: 'Car 27', type: 'standard', plate: '', driver: '' },
];

// Activity definitions with dates and scheduling
interface ActivityDefinition {
  title: string;
  date: string; // DD/MM/YYYY
  time: string; // HH:MM (approximate)
  description: string;
  category: string;
  csvField: keyof CSVRow;
  isEveningBar?: boolean; // Special handling for evening bar
  eveningBarOptions?: string[]; // Available evening bar venues
}

const activityDefinitions: ActivityDefinition[] = [
  // TUESDAY 30th September 2025
  {
    title: 'Crystal Gold Launch',
    date: '30/09/2025',
    time: '19:00',
    description: '',
    category: 'EXPERIENCE',
    csvField: 'crystalGoldLaunch',
  },

  // WEDNESDAY 1st October 2025
  {
    title: 'CLC Interview',
    date: '01/10/2025',
    time: '14:00',
    description: '',
    category: 'MEETING',
    csvField: 'clcInterview',
  },
  {
    title: 'Sandy Interview',
    date: '01/10/2025',
    time: '15:00',
    description: '',
    category: 'MEETING',
    csvField: 'sandyInterview',
  },

  // THURSDAY 2nd October 2025
  {
    title: 'AIR CCCC',
    date: '02/10/2025',
    time: '15:00',
    description: '',
    category: 'EXPERIENCE',
    csvField: 'airCccc',
  },

  // FRIDAY 3rd October 2025
  {
    title: 'Casa Ferrari',
    date: '03/10/2025',
    time: '12:00',
    description: '',
    category: 'EXPERIENCE',
    csvField: 'casaFerrari',
  },
  {
    title: 'PRS Paddock Club - Friday',
    date: '03/10/2025',
    time: '14:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'prsPaddockClubFri',
  },
  {
    title: 'Regal Club - Friday',
    date: '03/10/2025',
    time: '16:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'regalClubFri',
  },
  {
    title: 'Crystal Gold Lounge - Friday',
    date: '03/10/2025',
    time: '18:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'crystalGoldLoungeFri',
  },
  // Evening bar options - these will be created as separate activities
  {
    title: 'Evening Bar - Manhattan Bar',
    date: '03/10/2025',
    time: '20:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'eveningBar',
    isEveningBar: true,
    eveningBarOptions: [
      'Manhattan Bar',
      'Origin Bar',
      'Republic Bar Singapore',
      'Stay Gold',
      'Nutmeg & Clove',
      'Somma Bar',
      'Lobby',
      'Atlas',
    ],
  },
  {
    title: 'Evening Bar - Origin Bar',
    date: '03/10/2025',
    time: '20:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'eveningBar',
    isEveningBar: true,
  },
  {
    title: 'Evening Bar - Republic Bar Singapore',
    date: '03/10/2025',
    time: '20:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'eveningBar',
    isEveningBar: true,
  },
  {
    title: 'Evening Bar - Stay Gold',
    date: '03/10/2025',
    time: '20:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'eveningBar',
    isEveningBar: true,
  },
  {
    title: 'Evening Bar - Nutmeg & Clove',
    date: '03/10/2025',
    time: '20:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'eveningBar',
    isEveningBar: true,
  },
  {
    title: 'Evening Bar - Somma Bar',
    date: '03/10/2025',
    time: '20:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'eveningBar',
    isEveningBar: true,
  },
  {
    title: 'Evening Bar - Lobby',
    date: '03/10/2025',
    time: '20:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'eveningBar',
    isEveningBar: true,
  },
  {
    title: 'Evening Bar - Atlas',
    date: '03/10/2025',
    time: '20:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'eveningBar',
    isEveningBar: true,
  },

  // SATURDAY 4th October 2025
  {
    title: 'Fred Interview Session',
    date: '04/10/2025',
    time: '10:00',
    description: '',
    category: 'MEETING',
    csvField: 'fredInterviewSession',
  },
  {
    title: 'PRS Paddock Club - Saturday',
    date: '04/10/2025',
    time: '14:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'prsPaddockClubSat',
  },
  {
    title: 'Regal Club - Saturday',
    date: '04/10/2025',
    time: '16:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'regalClubSat',
  },
  {
    title: 'Crystal Gold Lounge - Saturday',
    date: '04/10/2025',
    time: '18:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'crystalGoldLoungeSat',
  },
  {
    title: 'Sushi Samba After Party',
    date: '04/10/2025',
    time: '22:00',
    description: '',
    category: 'EXPERIENCE',
    csvField: 'sushiSambaAfterParty',
  },

  // SUNDAY 5th October 2025
  {
    title: 'PRS Paddock Club - Sunday',
    date: '05/10/2025',
    time: '14:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'prsPaddockClubSun',
  },
  {
    title: 'Regal Club - Sunday',
    date: '05/10/2025',
    time: '16:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'regalClubSun',
  },
  {
    title: 'Crystal Gold Lounge - Sunday',
    date: '05/10/2025',
    time: '18:00',
    description: '',
    category: 'HOSPITALITY',
    csvField: 'crystalGoldLoungeSun',
  },
  {
    title: 'LAVO After Party',
    date: '05/10/2025',
    time: '22:00',
    description: '',
    category: 'EXPERIENCE',
    csvField: 'lavoAfterParty',
  },
];

// Activity cache for created activities
const activityCache = new Map<string, string>();

// Helper functions
const parseDate = (dateStr: string): Date | null => {
  if (
    !dateStr ||
    dateStr === 'N/A' ||
    dateStr.trim() === '' ||
    dateStr.includes('*') ||
    dateStr.includes('[')
  )
    return null;

  // Handle dd/mm/yyyy format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // Month is 0-indexed
    const year = parseInt(parts[2]);

    // Validate date components
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    // Handle 2-digit years
    const fullYear =
      year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year;

    // 🎯 TIMEZONE FIX: Create date at noon Singapore time to avoid boundary issues
    const singaporeDate = new Date(fullYear, month, day, 12, 0, 0);

    // Check if date is valid
    if (isNaN(singaporeDate.getTime())) return null;

    // 🎯 CRITICAL: Convert Singapore time to UTC for consistent storage
    return dateFnsTz.fromZonedTime(singaporeDate, EVENT_TIMEZONE);
  }

  return null;
};

const parseTime = (timeStr: string): string => {
  if (!timeStr || timeStr === 'N/A' || timeStr.trim() === '') return '';

  const cleaned = timeStr.trim();

  // Check if it's already in HH:MM format or needs padding
  const timeMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);

  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);

    // Validate time values
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      // Ensure HH:MM format with zero-padding
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }

  // If parsing fails, return original value (for debugging)
  console.warn(`⚠️ Invalid time format: "${cleaned}" - storing as-is`);
  return cleaned;
};

const convertGender = (genderStr: string): string => {
  if (!genderStr || genderStr === 'N/A') return '';
  return genderStr === 'M' ? 'Men' : genderStr === 'W' ? 'Women' : genderStr;
};

const parseYesNo = (value: string): boolean => {
  return (
    value === 'Y' ||
    value === 'Yes' ||
    value === 'yes' ||
    value === 'TRUE' ||
    value === 'true'
  );
};

const cleanValue = (value: string): string | null => {
  if (!value || value === 'N/A' || value === '' || value === 'N/a') return null;
  return value.trim();
};

/**
 * Get or create a group for the given market name
 */
async function getOrCreateGroup(
  marketName: string,
  eventId: string,
  adminId: string
): Promise<string> {
  // Check cache first
  if (groupCache.has(marketName)) {
    return groupCache.get(marketName)!;
  }

  try {
    // Check if group already exists
    const existingGroup = await prisma.group.findFirst({
      where: {
        eventId: eventId,
        name: marketName,
        active: true,
      },
    });

    if (existingGroup) {
      console.log(
        `🔍 Found existing group: "${marketName}" (${existingGroup.id})`
      );
      groupCache.set(marketName, existingGroup.id);
      return existingGroup.id;
    }

    // Create new group
    console.log(`✨ Creating new group: "${marketName}"`);
    const newGroup = await GroupService.create({
      eventId: eventId,
      name: marketName,
      description: `Market group: ${marketName}`,
    });

    groupCache.set(marketName, newGroup.id);
    console.log(`✅ Created group: "${marketName}" (${newGroup.id})`);
    return newGroup.id;
  } catch (error: any) {
    console.error(
      `❌ Failed to get/create group "${marketName}":`,
      error.message
    );
    throw error;
  }
}

/**
 * Create or get activity based on activity definition
 */
async function getOrCreateActivity(
  activityDef: ActivityDefinition,
  eventId: string,
  adminId: string
): Promise<string> {
  // Use title + date as cache key to handle same activity on different days
  const cacheKey = `${activityDef.title}_${activityDef.date}`;

  // Check cache first
  if (activityCache.has(cacheKey)) {
    return activityCache.get(cacheKey)!;
  }

  try {
    // Parse activity date for exact matching
    const activityDate = parseDate(activityDef.date);
    if (!activityDate) {
      throw new Error(
        `Invalid date for activity ${activityDef.title}: ${activityDef.date}`
      );
    }

    const [hours, minutes] = activityDef.time
      .split(':')
      .map((n) => parseInt(n));

    // 🎯 FIX: Parse date components directly to avoid double timezone conversion
    const dateParts = activityDef.date.split('/');
    const day = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1; // JavaScript months are 0-indexed
    const year = parseInt(dateParts[2]);

    // Create the datetime directly in Singapore timezone
    const singaporeDateTime = new Date(year, month, day, hours, minutes, 0, 0);
    const utcStartDateTime = dateFnsTz.fromZonedTime(
      singaporeDateTime,
      EVENT_TIMEZONE
    );

    // Check if activity already exists with same title and date
    const existingActivity = await prisma.activity.findFirst({
      where: {
        eventId: eventId,
        title: activityDef.title,
        startDateTime: utcStartDateTime,
        deleted: false,
      },
    });

    if (existingActivity) {
      console.log(
        `🔍 Found existing activity: "${activityDef.title}" (${existingActivity.id})`
      );
      activityCache.set(cacheKey, existingActivity.id);
      return existingActivity.id;
    }

    // End time is 2 hours later by default (can be adjusted per activity type)
    const endDateTime = new Date(utcStartDateTime);
    endDateTime.setHours(endDateTime.getHours() + 2);

    console.log(
      `✨ Creating new activity: "${activityDef.title}" on ${activityDef.date} at ${activityDef.time}`
    );
    console.log(
      `   📅 Singapore time: ${singaporeDateTime.toLocaleString('en-SG', { timeZone: EVENT_TIMEZONE })}`
    );
    console.log(`   🌍 UTC time: ${utcStartDateTime.toISOString()}`);

    // Use direct Prisma call to avoid ActivityService validation issues during import
    const newActivity = await prisma.activity.create({
      data: {
        eventId: eventId,
        groupIds: [], // Will be assigned when users are processed
        title: activityDef.title,
        description: activityDef.description,
        startDateTime: utcStartDateTime,
        endDateTime: endDateTime,
        category: activityDef.category as any,
        location: null,
        content: { html: `${activityDef.description}` },
        capacity: null, // No capacity limits for Singapore activities
        timingTable: [],
        createdBy: adminId,
        lastModifiedBy: adminId,
        lastModifiedAt: new Date(),
        active: true,
      },
    });

    activityCache.set(cacheKey, newActivity.id);
    console.log(
      `✅ Created activity: "${activityDef.title}" (${newActivity.id})`
    );
    return newActivity.id;
  } catch (error: any) {
    console.error(
      `❌ Failed to get/create activity "${activityDef.title}":`,
      error.message
    );
    throw error;
  }
}

// Activity assignment logic moved to smart assignment phase

/**
 * Analyze CSV data to determine which groups should have access to each activity
 */
async function analyzeActivityGroupPatterns(
  csvRecords: CSVRow[],
  eventId: string
): Promise<
  Map<
    string,
    {
      groupIds: string[];
      userPatterns: Array<{
        userId: string;
        shouldAttend: boolean;
        venue?: string;
      }>;
    }
  >
> {
  console.log('\n🧠 ANALYZING ACTIVITY PATTERNS...');

  // Get all groups for this event
  const allGroups = await prisma.group.findMany({
    where: { eventId, active: true, deleted: false },
    select: { id: true, name: true },
  });

  // Get all users for this event to match CSV records
  const allUsers = await prisma.user.findMany({
    where: { eventId, active: true },
    select: { id: true, profile: true, groupIds: true },
  });

  const groupNameToId = new Map(allGroups.map((g) => [g.name, g.id]));
  const activityPatterns = new Map<
    string,
    {
      groupIds: string[];
      userPatterns: Array<{
        userId: string;
        shouldAttend: boolean;
        venue?: string;
      }>;
    }
  >();

  // Process each activity definition
  for (const activityDef of activityDefinitions) {
    console.log(`\n📊 Analyzing "${activityDef.title}":`);

    const groupsNeeded = new Set<string>();
    const userPatterns: Array<{
      userId: string;
      shouldAttend: boolean;
      venue?: string;
    }> = [];

    // Analyze each CSV record
    for (const record of csvRecords) {
      // Find corresponding user in database
      const user = allUsers.find((u) => {
        const profile = u.profile as any;
        const dbFirstName = profile?.firstName?.toLowerCase() || '';
        const dbLastName = profile?.lastName?.toLowerCase() || '';
        const csvFirstName = record.firstName?.toLowerCase() || '';
        const csvLastName = record.lastName?.toLowerCase() || '';

        return dbFirstName === csvFirstName && dbLastName === csvLastName;
      });

      if (!user) {
        console.log(
          `   ⚠️ Could not find user ${record.firstName} ${record.lastName} in database`
        );
        continue;
      }

      // Get CSV value for this activity
      const csvValue = (record as any)[activityDef.csvField] as string;

      if (activityDef.isEveningBar) {
        // Evening bar: check if user selected this specific venue
        const expectedVenueName = activityDef.title.replace(
          'Evening Bar - ',
          ''
        );
        const shouldAttend = csvValue && csvValue.trim() === expectedVenueName;

        if (shouldAttend) {
          // Add user's groups to the needed groups
          user.groupIds.forEach((groupId) => groupsNeeded.add(groupId));
          userPatterns.push({
            userId: user.id,
            shouldAttend: true,
            venue: expectedVenueName,
          });
          console.log(
            `   ✅ ${record.firstName} ${record.lastName} should attend (venue: ${expectedVenueName})`
          );
        } else {
          userPatterns.push({ userId: user.id, shouldAttend: false });
        }
      } else {
        // Regular Y/N activity
        const shouldAttend = parseYesNo(csvValue);

        if (shouldAttend) {
          // Add user's groups to the needed groups
          user.groupIds.forEach((groupId) => groupsNeeded.add(groupId));
          userPatterns.push({ userId: user.id, shouldAttend: true });
          console.log(
            `   ✅ ${record.firstName} ${record.lastName} should attend`
          );
        } else {
          userPatterns.push({ userId: user.id, shouldAttend: false });
        }
      }
    }

    const finalGroupIds = Array.from(groupsNeeded);
    const groupNames = finalGroupIds.map(
      (id) => allGroups.find((g) => g.id === id)?.name || 'Unknown'
    );

    console.log(
      `   🎯 Activity should be assigned to groups: [${groupNames.join(', ')}]`
    );
    console.log(
      `   👥 Users who should attend: ${userPatterns.filter((p) => p.shouldAttend).length}`
    );
    console.log(
      `   🚫 Users who should be excluded: ${userPatterns.filter((p) => !p.shouldAttend).length}`
    );

    activityPatterns.set(activityDef.title, {
      groupIds: finalGroupIds,
      userPatterns,
    });
  }

  return activityPatterns;
}

/**
 * Apply smart activity assignments and exclusions
 */
async function applySmartActivityAssignments(
  activityPatterns: Map<
    string,
    {
      groupIds: string[];
      userPatterns: Array<{
        userId: string;
        shouldAttend: boolean;
        venue?: string;
      }>;
    }
  >,
  eventId: string,
  adminId: string
): Promise<void> {
  console.log('\n🎯 APPLYING SMART ACTIVITY ASSIGNMENTS...');

  for (const [activityTitle, pattern] of activityPatterns) {
    try {
      console.log(`\n🔄 Processing "${activityTitle}":`);

      // Find the activity
      const activity = await prisma.activity.findFirst({
        where: {
          eventId,
          title: activityTitle,
          active: true,
          deleted: false,
        },
      });

      if (!activity) {
        console.log(`   ❌ Activity not found: "${activityTitle}"`);
        continue;
      }

      // Update activity with group assignments
      if (pattern.groupIds.length > 0) {
        await prisma.activity.update({
          where: { id: activity.id },
          data: {
            groupIds: pattern.groupIds,
            lastModifiedBy: adminId,
            lastModifiedAt: new Date(),
          },
        });

        console.log(
          `   ✅ Assigned activity to ${pattern.groupIds.length} groups`
        );

        // Create exclusions for users who shouldn't attend
        const exclusionsToCreate = pattern.userPatterns.filter(
          (p) => !p.shouldAttend
        );

        if (exclusionsToCreate.length > 0) {
          console.log(
            `   🚫 Creating ${exclusionsToCreate.length} exclusions...`
          );

          for (const exclusionPattern of exclusionsToCreate) {
            try {
              // Get user details for exclusion
              const user = await prisma.user.findUnique({
                where: { id: exclusionPattern.userId },
                select: { groupIds: true, eventId: true, profile: true },
              });

              if (!user) continue;

              // Create exclusion for each group this activity is assigned to that the user is also in
              const userGroupsInActivity = user.groupIds.filter((groupId) =>
                pattern.groupIds.includes(groupId)
              );

              for (const groupId of userGroupsInActivity) {
                await UserActivityExclusionService.excludeUserFromActivity({
                  userId: exclusionPattern.userId,
                  activityId: activity.id,
                  groupId: groupId,
                  eventId: user.eventId,
                  excludedBy: adminId,
                  reason: 'Not attending per CSV data',
                });
              }

              const profile = user.profile as any;
              console.log(
                `     🚫 Excluded ${profile?.firstName} ${profile?.lastName} from "${activityTitle}"`
              );
            } catch (exclusionError: any) {
              console.warn(
                `     ⚠️ Failed to create exclusion: ${exclusionError.message}`
              );
            }
          }
        }
      } else {
        console.log(
          `   ℹ️ No groups needed for "${activityTitle}" (no users attending)`
        );
      }
    } catch (error: any) {
      console.error(
        `   ❌ Failed to process activity "${activityTitle}": ${error.message}`
      );
    }
  }
}

async function main() {
  try {
    console.log('🚀 Starting CSV import process...');

    // Step 1: Create the event
    console.log('📅 Creating event...');
    const event = await prisma.event.create({
      data: {
        id: eventConfig._id,
        name: eventConfig.name,
        shortName: eventConfig.shortName,
        location: eventConfig.location,
        dateRange: {
          start: '2025-09-25T12:00:00.000Z',
          end: '2025-10-05T16:00:00.000Z',
        },
        config: eventConfig.config,
        hotelConfig: null, // Will be populated when we create hotels
        roomDrops: {
          drops: [
            {
              id: 'standard_drop_sgp2025',
              name: 'Standard Drop',
              description:
                'Standard welcome package for Singapore Grand Prix 2025 attendees',
              stock: 1000,
              assigned: 0,
            },
          ],
        },
        guestCategories: {
          categories: [
            'CBL',
            'Global Creators',
            'Global Media',
            'Chivas market host',
            'Cultural Creator',
            'Media',
            'Trade',
            'CEO',
            'APAC CODI',
            'Agent/Manager',
            'Cultural creator',
          ],
        },
        carConfig: {
          cars: carConfig,
        },
        termsConditions: `
          <h2>Event Terms and Conditions</h2>`,
        privacyPolicy: `
          <h2>Privacy Policy</h2>`,
        active: true,
      },
    });
    console.log('✅ Event created:', event.name);

    // Step 2: Create super admins for assignments
    console.log('👤 Creating super admins...');

    // Create first super admin
    const passwordHash1 = await bcrypt.hash('admin123', 12);
    const superAdmin = await prisma.admin.create({
      data: {
        email: 'meshari.s@homeofpmg.com',
        firstName: 'System',
        lastName: 'Administrator',
        role: 'SUPER',
        passwordHash: passwordHash1,
        active: true,
        adminEvents: {
          create: {
            eventId: event.id,
          },
        },
      },
    });
    console.log('✅ Super admin created:', superAdmin.email);

    // Create second super admin - Louise Guita
    const passwordHash2 = await bcrypt.hash('zz#S9QBJDKCB', 12);
    const superAdmin2 = await prisma.admin.create({
      data: {
        email: 'lguita@invnt.com',
        firstName: 'Louise',
        lastName: 'Guita',
        role: 'SUPER',
        passwordHash: passwordHash2,
        active: true,
        adminEvents: {
          create: {
            eventId: event.id,
          },
        },
      },
    });
    console.log('✅ Super admin created:', superAdmin2.email);

    // Create third super admin - Desislava Nikolova
    const passwordHash3 = await bcrypt.hash('zz#S9QBJDKCB', 12);
    const superAdmin3 = await prisma.admin.create({
      data: {
        email: 'dnikolova@invnt.com',
        firstName: 'Desislava',
        lastName: 'Nikolova',
        passwordHash: passwordHash3,
        active: true,
        adminEvents: {
          create: {
            eventId: event.id,
          },
        },
      },
    });
    console.log('✅ Super admin created:', superAdmin3.email);

    // Step 3: Create default hotel
    console.log('🏨 Creating hotel...');
    const hotel = await prisma.hotel.create({
      data: {
        eventId: event.id,
        name: hotelConfig.name,
        isDefault: hotelConfig.isDefault,
        checkInTime: hotelConfig.checkInTime,
        checkOutTime: hotelConfig.checkOutTime,
        address: hotelConfig.address,
        phone: hotelConfig.phone,
        email: hotelConfig.email,
        active: true,
      },
    });
    console.log('✅ Hotel created:', hotel.name);

    // Step 3: Create room types
    console.log('🛏️ Creating room types...');
    const createdRoomTypes: any[] = [];
    for (const roomType of roomTypes) {
      const created = await prisma.roomType.create({
        data: {
          eventId: event.id,
          hotelId: hotel.id,
          name: roomType.name,
          description: roomType.description,
          maxOccupancy: 2, // Default value for schema compatibility
          basePrice: roomType.basePrice,
          amenities: [],
          active: true,
        },
      });
      createdRoomTypes.push(created);
      console.log(`✅ Room type created: ${created.name}`);
    }

    // Step 4: Update event with hotel configuration BEFORE importing users
    console.log('🔄 Setting up hotel configuration with room matrix...');
    await prisma.event.update({
      where: { id: event.id },
      data: {
        hotelConfig: {
          hotels: [
            {
              name: hotel.name,
              isDefault: hotel.isDefault,
              checkInTime: hotel.checkInTime,
              checkOutTime: hotel.checkOutTime,
              contractedRooms: [
                // Signature King rooms - Updated per hotel matrix
                {
                  date: '25/09/2025',
                  roomType: 'Signature King',
                  quantity: 2,
                  allocated: 0,
                },
                {
                  date: '26/09/2025',
                  roomType: 'Signature King',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '27/09/2025',
                  roomType: 'Signature King',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '28/09/2025',
                  roomType: 'Signature King',
                  quantity: 10,
                  allocated: 0,
                },
                {
                  date: '29/09/2025',
                  roomType: 'Signature King',
                  quantity: 28,
                  allocated: 0,
                },
                {
                  date: '30/09/2025',
                  roomType: 'Signature King',
                  quantity: 63,
                  allocated: 0,
                },
                {
                  date: '01/10/2025',
                  roomType: 'Signature King',
                  quantity: 66,
                  allocated: 0,
                },
                {
                  date: '02/10/2025',
                  roomType: 'Signature King',
                  quantity: 71,
                  allocated: 0,
                },
                {
                  date: '03/10/2025',
                  roomType: 'Signature King',
                  quantity: 66,
                  allocated: 0,
                },
                {
                  date: '04/10/2025',
                  roomType: 'Signature King',
                  quantity: 66,
                  allocated: 0,
                },
                {
                  date: '05/10/2025',
                  roomType: 'Signature King',
                  quantity: 63,
                  allocated: 0,
                },
                {
                  date: '06/10/2025',
                  roomType: 'Signature King',
                  quantity: 10,
                  allocated: 0,
                },
                // Suite King rooms - Updated per hotel matrix
                {
                  date: '25/09/2025',
                  roomType: 'Suite King',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '26/09/2025',
                  roomType: 'Suite King',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '27/09/2025',
                  roomType: 'Suite King',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '28/09/2025',
                  roomType: 'Suite King',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '29/09/2025',
                  roomType: 'Suite King',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '30/09/2025',
                  roomType: 'Suite King',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '01/10/2025',
                  roomType: 'Suite King',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '02/10/2025',
                  roomType: 'Suite King',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '03/10/2025',
                  roomType: 'Suite King',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '04/10/2025',
                  roomType: 'Suite King',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '05/10/2025',
                  roomType: 'Suite King',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '06/10/2025',
                  roomType: 'Suite King',
                  quantity: 0,
                  allocated: 0,
                },
                // Shophouse suite rooms - Updated per hotel matrix
                {
                  date: '25/09/2025',
                  roomType: 'Shophouse suite',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '26/09/2025',
                  roomType: 'Shophouse suite',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '27/09/2025',
                  roomType: 'Shophouse suite',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '28/09/2025',
                  roomType: 'Shophouse suite',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '29/09/2025',
                  roomType: 'Shophouse suite',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '30/09/2025',
                  roomType: 'Shophouse suite',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '01/10/2025',
                  roomType: 'Shophouse suite',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '02/10/2025',
                  roomType: 'Shophouse suite',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '03/10/2025',
                  roomType: 'Shophouse suite',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '04/10/2025',
                  roomType: 'Shophouse suite',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '05/10/2025',
                  roomType: 'Shophouse suite',
                  quantity: 3,
                  allocated: 0,
                },
                {
                  date: '06/10/2025',
                  roomType: 'Shophouse suite',
                  quantity: 0,
                  allocated: 0,
                },
                // Signature Twin rooms - Added for users requiring twin bed setup
                {
                  date: '25/09/2025',
                  roomType: 'Signature Twin',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '26/09/2025',
                  roomType: 'Signature Twin',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '27/09/2025',
                  roomType: 'Signature Twin',
                  quantity: 0,
                  allocated: 0,
                },
                {
                  date: '28/09/2025',
                  roomType: 'Signature Twin',
                  quantity: 2,
                  allocated: 0,
                },
                {
                  date: '29/09/2025',
                  roomType: 'Signature Twin',
                  quantity: 5,
                  allocated: 0,
                },
                {
                  date: '30/09/2025',
                  roomType: 'Signature Twin',
                  quantity: 10,
                  allocated: 0,
                },
                {
                  date: '01/10/2025',
                  roomType: 'Signature Twin',
                  quantity: 10,
                  allocated: 0,
                },
                {
                  date: '02/10/2025',
                  roomType: 'Signature Twin',
                  quantity: 10,
                  allocated: 0,
                },
                {
                  date: '03/10/2025',
                  roomType: 'Signature Twin',
                  quantity: 10,
                  allocated: 0,
                },
                {
                  date: '04/10/2025',
                  roomType: 'Signature Twin',
                  quantity: 10,
                  allocated: 0,
                },
                {
                  date: '05/10/2025',
                  roomType: 'Signature Twin',
                  quantity: 8,
                  allocated: 0,
                },
                {
                  date: '06/10/2025',
                  roomType: 'Signature Twin',
                  quantity: 2,
                  allocated: 0,
                },
              ],
            },
          ],
        },
      },
    });
    console.log('✅ Hotel configuration set up successfully');

    // Step 4.5: Pre-create all activities based on schedule
    console.log('\n🎯 Pre-creating all activities...');
    for (const activityDef of activityDefinitions) {
      try {
        await getOrCreateActivity(activityDef, event.id, superAdmin.id);
      } catch (activityCreationError: any) {
        console.warn(
          `⚠️ Failed to pre-create activity "${activityDef.title}": ${activityCreationError.message}`
        );
      }
    }
    console.log(`✅ Pre-created ${activityCache.size} activities`);

    // Step 5: Read and parse CSV
    console.log('📄 Reading CSV file...');
    const csvPath = path.join(process.cwd(), '.project/reports/data/prod.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const records = parse(csvContent, {
      columns: [
        'market', // 1
        'firstName', // 2
        'lastName', // 3
        'nickname', // 4
        'guestType', // 5
        'jobTitle', // 6
        'company', // 7
        'internalVip', // 8
        'vipGuest', // 9
        'email', // 10
        'contactMobile', // 11
        'host', // 12
        'emergencyContactName', // 13
        'emergencyContactNumber', // 14
        'gender', // 15
        'sizeRequirements', // 16
        'initials', // 17
        'accessibilityRequirements', // 18
        'dietaryRequirements', // 19
        'medicalInformation', // 20
        'transportMode', // 21
        'inboundDepartureFrom', // 22
        'inboundDepartureDate', // 23
        'inboundDepartureTime', // 24
        'inboundDepartureTerminal', // 25
        'inboundFlightNumber', // 26
        'connectingFlight', // 27
        'inboundArrivalDate', // 28
        'inboundArrivalTime', // 29
        'inboundArrivalTo', // 30
        'transportRequired', // 31
        'outboundDepartureFrom', // 32
        'outboundDepartureDate', // 33
        'outboundDepartureTime', // 34
        'outboundDepartureTerminal', // 35
        'outboundFlightNumber', // 36
        'outboundArrivalTo', // 37
        'accommodationRequired', // 38
        'hotelName', // 39
        'roomCategory', // 40
        'occupancy', // 41
        'checkInDate', // 42
        'checkOutDate', // 43
        'numberOfNights', // 44
        'hotelBookingForVisa', // 45
        'notes', // 46
        'roomDrop', // 47
        null, // 48 - Skip "-" column
        null, // 49 - Skip "-" column
        null, // 50 - Skip "-" column
        null, // 51 - Skip "-" column
        null, // 52 - Skip "-" column
        'crystalGoldLaunch', // 53
        null, // 54 - Skip "-" column
        'clcInterview', // 55
        'sandyInterview', // 56
        'airCccc', // 57
        'casaFerrari', // 58
        'prsPaddockClubFri', // 59
        'regalClubFri', // 60
        'crystalGoldLoungeFri', // 61
        'eveningBar', // 62
        'fredInterviewSession', // 63
        null, // 64 - Skip "-" column
        'prsPaddockClubSat', // 65
        'regalClubSat', // 66
        'crystalGoldLoungeSat', // 67
        'sushiSambaAfterParty', // 68
        'prsPaddockClubSun', // 69
        'regalClubSun', // 70
        null, // 71 - Skip "-" column
        'crystalGoldLoungeSun', // 72
        'lavoAfterParty', // 73
        'gpTransfersRequired', // 74
        'eventTransfersRequired', // 75
        'marketCarNumber', // 76
        'marketCarNumberNotes', // 77
      ],
      skip_empty_lines: true,
      trim: true,
      from_line: 2, // Skip header row
    }) as CSVRow[];

    console.log(`📊 Found ${records.length} records to import`);

    // Step 5: Import users
    let imported = 0;
    let skipped = 0;
    const successfulImports: CSVRow[] = [];
    const failedImports: Array<{
      record: CSVRow;
      error: string;
      rowNumber: number;
    }> = [];
    const skippedImports: Array<{
      record: CSVRow;
      reason: string;
      rowNumber: number;
    }> = [];

    for (const record of records) {
      const rowNumber = records.indexOf(record) + 2;
      try {
        // Skip empty rows or rows without names
        if (!record.firstName && !record.lastName) {
          console.log(`⏭️ Skipping empty, row number: ${rowNumber}`);
          skippedImports.push({
            record,
            reason: 'Empty row - missing first name and last name',
            rowNumber,
          });
          skipped++;
          continue;
        }

        // 🎯 CRITICAL: Keep accommodation dates as strings to match flight date format
        // This eliminates ALL timezone conversion issues
        const normalizeDateFormat = (dateStr: string): string => {
          if (!dateStr) return dateStr;
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${day}/${month}/${year}`;
          }
          return dateStr;
        };

        const checkInFormatted = record.checkInDate
          ? normalizeDateFormat(cleanValue(record.checkInDate) || '')
          : undefined;
        const checkOutFormatted = record.checkOutDate
          ? normalizeDateFormat(cleanValue(record.checkOutDate) || '')
          : undefined;

        // Calculate nights count from string or provided number
        let nightsCount = 0;
        if (record.numberOfNights && record.numberOfNights !== 'N/A') {
          nightsCount = parseInt(record.numberOfNights) || 0;
        }

        // ALLOW DUPLICATE USERS
        // Check for duplicate users early (track as skipped rather than failed)
        // const emailToCheck = cleanValue(record.email);
        // if (emailToCheck) {
        //   const users = await prisma.user.findMany({
        //     where: { eventId: event.id, active: true },
        //   });

        //   const duplicate = users.find((user) => {
        //     const profile = user.profile as any;
        //     return profile?.email?.toLowerCase() === emailToCheck.toLowerCase();
        //   });

        //   if (duplicate) {
        //     console.log(`⏭️ Skipping duplicate user: ${emailToCheck}`);
        //     skippedImports.push({
        //       record,
        //       reason: `Duplicate email address: ${emailToCheck}`,
        //       rowNumber
        //     });
        //     skipped++;
        //     continue;
        //   }
        // }

        // Create user data structure
        const userData = {
          eventId: event.id,
          profile: {
            firstName: cleanValue(record.firstName) || undefined,
            lastName: cleanValue(record.lastName) || undefined,
            preferredFirstName: cleanValue(record.nickname) || undefined,
            email: cleanValue(record.email) || undefined,
            phone: cleanValue(record.contactMobile) || undefined,
            jobTitle: cleanValue(record.jobTitle) || undefined,
            company: cleanValue(record.company) || undefined,
            guestType: cleanValue(record.guestType) || undefined,
            vip: parseYesNo(record.vipGuest),
            internalVip: parseYesNo(record.internalVip) || false,
            initials: cleanValue(record.initials) || undefined,
            host: cleanValue(record.host) || undefined,
          },
          communication: {
            emailOptIn: true,
            whatsappOptIn: false,
          },
          guestCategory: cleanValue(record.guestType) || undefined,
          tickets: [], // Enhanced structured tickets will be added post-import if needed
          merchandiseSize: {
            gender: convertGender(record.gender),
            size: cleanValue(record.sizeRequirements) || undefined,
          },
          accommodation: {
            required: parseYesNo(record.accommodationRequired),
            hotel: cleanValue(record.hotelName) || undefined,
            roomType: cleanValue(record.roomCategory) || undefined,
            checkIn: checkInFormatted, // 🎯 String: "25/09/2025"
            checkOut: checkOutFormatted, // 🎯 String: "05/10/2025"
            nightsCount: nightsCount,
            // 🎯 RESTORED: Hotel notes stored directly on user for pre-assignment planning
            hotelNotes: cleanValue(record.notes) || undefined, // Store notes in accommodation for immediate access
            // 🎯 FIX: Store actual occupancy type without auto-defaulting N/A values
            occupancy:
              record.occupancy === 'Single'
                ? 'single'
                : record.occupancy === 'Double'
                  ? 'double'
                  : record.occupancy === 'Twin'
                    ? 'twin'
                    : record.occupancy === 'Room Sharer'
                      ? 'room_sharer'
                      : record.occupancy === 'N/A' ||
                          !record.occupancy ||
                          record.occupancy.trim() === ''
                        ? 'N/A'
                        : undefined,
            doubleOccupancy: {
              enabled:
                record.occupancy === 'Double' ||
                record.occupancy === 'Twin' ||
                record.occupancy === 'Room Sharer',
            },
            visaBookingRequired: parseYesNo(record.hotelBookingForVisa),
          },
          flight: {
            inbound: {
              departureFrom:
                cleanValue(record.inboundDepartureFrom) || undefined,
              departureDate:
                cleanValue(record.inboundDepartureDate) || undefined,
              departureTime:
                parseTime(record.inboundDepartureTime) || undefined,
              departureTerminal:
                cleanValue(record.inboundDepartureTerminal) || undefined,
              flightNumber: cleanValue(record.inboundFlightNumber) || undefined,
              arrivalDate: cleanValue(record.inboundArrivalDate) || undefined,
              arrivalTime: parseTime(record.inboundArrivalTime) || undefined,
              arrivalToAirport:
                cleanValue(record.inboundArrivalTo) || undefined,
            },
            outbound: {
              departureFrom:
                cleanValue(record.outboundDepartureFrom) || undefined,
              departureDate:
                cleanValue(record.outboundDepartureDate) || undefined,
              departureTime:
                parseTime(record.outboundDepartureTime) || undefined,
              departureTerminal:
                cleanValue(record.outboundDepartureTerminal) || undefined,
              flightNumber:
                cleanValue(record.outboundFlightNumber) || undefined,
              arrivalToAirport:
                cleanValue(record.outboundArrivalTo) || undefined,
            },
          },
          requirements: {
            dietary: {
              enabled: !!cleanValue(record.dietaryRequirements),
              details: cleanValue(record.dietaryRequirements) || undefined,
            },
            medical: {
              enabled: !!cleanValue(record.medicalInformation),
              details: cleanValue(record.medicalInformation) || undefined,
            },
            accessibility: {
              enabled: !!cleanValue(record.accessibilityRequirements),
              details:
                cleanValue(record.accessibilityRequirements) || undefined,
            },
          },
          emergencyContact: {
            name: cleanValue(record.emergencyContactName) || undefined,
            relationship: undefined, // Not clearly separated in CSV
            phone: cleanValue(record.emergencyContactNumber) || undefined,
            email: undefined, // Not provided in CSV
          },
          transferRequirements: parseYesNo(record.transportRequired) || false,
          gpTransfersRequired: parseYesNo(record.gpTransfersRequired) || false,
          eventTransfersRequired:
            parseYesNo(record.eventTransfersRequired) || false,
          masterGuestNotes: cleanValue(record.notes) || undefined, // Import notes go to master notes for admin sorting
          carAssignmentNotes:
            cleanValue(record.marketCarNumberNotes) || undefined, // Car assignment notes
          roomDropAssigned: parseYesNo(record.roomDrop)
            ? 'standard_drop_sgp2025'
            : null, // Standard Drop assignment
          assigned: false, // 🎯 FIX: Start as unassigned, will be updated when actually assigned to groups
          active: true,
        };

        // Create user
        const user = await prisma.user.create({
          data: userData,
        });

        // Assign user to group based on Market field
        if (record.market && cleanValue(record.market)) {
          try {
            const marketName = cleanValue(record.market)!;
            const correctedMarketName =
              marketName === 'Phillipines' ? 'Philippines' : marketName;
            const groupId = await getOrCreateGroup(
              correctedMarketName,
              event.id,
              superAdmin.id
            );

            // Add user to group and update assignment status
            await prisma.user.update({
              where: { id: user.id },
              data: {
                groupIds: [groupId],
                assigned: true, // 🎯 FIX: Mark as assigned when successfully added to group
                assignedAt: new Date(),
                assignedBy: superAdmin.id,
              },
            });

            console.log(
              `👥 Assigned ${(user.profile as any).firstName} ${(user.profile as any).lastName} to group "${correctedMarketName}"`
            );
          } catch (groupError: any) {
            console.warn(
              `⚠️ Failed to assign user to group: ${groupError.message}`
            );
          }
        }

        // Activity assignments will be handled in smart assignment phase after all users are imported

        // Handle car number assignment (direct to user override, skip group inheritance)
        try {
          const carNumber = cleanValue(record.marketCarNumber);
          if (carNumber && carNumber !== 'N/A') {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                carNumbers: [carNumber], // Direct user override - no group inheritance
              },
            });
            console.log(
              `🚗 Assigned car ${carNumber} to ${(user.profile as any).firstName} ${(user.profile as any).lastName}`
            );
          }
        } catch (carError: any) {
          console.warn(
            `⚠️ Failed to assign car to ${(user.profile as any).firstName} ${(user.profile as any).lastName}: ${carError.message}`
          );
        }

        // Assign room if accommodation is required and room type is specified
        if (
          userData.accommodation?.required &&
          userData.accommodation?.roomType
        ) {
          const roomType = createdRoomTypes.find(
            (rt) => rt.name === userData.accommodation?.roomType
          );
          console.log(
            `🛏️ Looking for room type: "${userData.accommodation?.roomType}" - Found: ${roomType ? 'YES' : 'NO'}`
          );

          if (roomType) {
            try {
              await RoomAssignmentService.assignRoom({
                userId: user.id,
                eventId: event.id,
                hotelId: hotel.id,
                roomTypeId: roomType.id,
                assignedBy: superAdmin.id,
                hotelNotes: (userData.accommodation as any)?.hotelNotes || '', // Copy from user accommodation
                billingNotes: '',
              });
              console.log(
                `🛏️ Room assigned for ${(user.profile as any).firstName} ${(user.profile as any).lastName}`
              );
            } catch (roomError: any) {
              console.warn(
                `⚠️ Room assignment failed for ${(user.profile as any).firstName} ${(user.profile as any).lastName}: ${roomError.message}`
              );
              // Don't fail the entire import - just log the issue
            }
          } else {
            console.warn(
              `⚠️ Room type "${userData.accommodation.roomType}" not found for ${(user.profile as any).firstName} ${(user.profile as any).lastName}`
            );
          }
        }

        imported++;
        successfulImports.push(record);
        console.log(
          `✅ Imported user ${imported}: ${(user.profile as any).firstName} ${(user.profile as any).lastName} (${(user.profile as any).email || 'no email'})`
        );
      } catch (error: any) {
        console.error(
          `❌ Failed to import record:`,
          record.firstName,
          record.lastName,
          error
        );
        failedImports.push({
          record,
          error: error.message || error.toString(),
          rowNumber,
        });
        skipped++;
      }
    }

    // Step 6: Apply smart activity assignments based on CSV patterns
    console.log('\n🧠 Step 6: Smart Activity Assignment...');
    try {
      // Analyze CSV patterns to determine activity-group mappings
      const activityPatterns = await analyzeActivityGroupPatterns(
        records,
        event.id
      );

      // Apply the smart assignments and exclusions
      await applySmartActivityAssignments(
        activityPatterns,
        event.id,
        superAdmin.id
      );

      console.log('✅ Smart activity assignments completed!');
    } catch (smartAssignmentError: any) {
      console.error(
        '❌ Smart activity assignment failed:',
        smartAssignmentError.message
      );
      // Don't fail the entire import - continue with reporting
    }

    console.log('📈 Import Summary:');
    console.log(`✅ Successfully imported: ${imported} users`);
    console.log(`❌ Failed: ${failedImports.length} records`);
    console.log(`⏭️ Skipped: ${skippedImports.length} records`);
    console.log(`🏨 Created: 1 hotel (${hotel.name})`);
    console.log(`🛏️ Created: ${createdRoomTypes.length} room types`);
    console.log(`👥 Created/used: ${groupCache.size} groups`);
    console.log(`🎯 Created/used: ${activityCache.size} activities`);
    console.log(
      `🧠 Smart assignments: Activities assigned to groups based on CSV patterns`
    );
    console.log(
      `🚫 Exclusions: Created for users not attending activities their groups have access to`
    );
    console.log(`🚗 Configured: ${carConfig.length} cars (1-27)`);
    console.log(`📅 Created: 1 event (${event.name})`);

    // 🎯 FIX: Verify assignment consistency
    console.log('\n🔍 Verifying assignment consistency...');
    const [
      totalUsers,
      assignedUsers,
      unassignedUsers,
      usersWithGroups,
      usersWithoutGroups,
    ] = await prisma.$transaction([
      prisma.user.count({ where: { eventId: event.id, active: true } }),
      prisma.user.count({
        where: { eventId: event.id, active: true, assigned: true },
      }),
      prisma.user.count({
        where: { eventId: event.id, active: true, assigned: false },
      }),
      prisma.user.count({
        where: {
          eventId: event.id,
          active: true,
          groupIds: { isEmpty: false },
        },
      }),
      prisma.user.count({
        where: { eventId: event.id, active: true, groupIds: { isEmpty: true } },
      }),
    ]);

    console.log(`📊 Assignment Verification:`);
    console.log(`   Total Users: ${totalUsers}`);
    console.log(`   assigned: true: ${assignedUsers}`);
    console.log(`   assigned: false: ${unassignedUsers}`);
    console.log(`   Has Groups: ${usersWithGroups}`);
    console.log(`   No Groups: ${usersWithoutGroups}`);

    if (
      assignedUsers !== usersWithGroups ||
      unassignedUsers !== usersWithoutGroups
    ) {
      console.warn(
        '⚠️ INCONSISTENCY DETECTED: assigned field does not match group assignment reality'
      );
    } else {
      console.log('✅ Assignment consistency verified - counts match!');
    }

    if (groupCache.size > 0) {
      console.log('\n👥 Groups created/used:');
      for (const [groupName, groupId] of groupCache.entries()) {
        console.log(`   - ${groupName} (${groupId})`);
      }
    }

    if (activityCache.size > 0) {
      console.log('\n🎯 Activities created/used:');
      for (const [activityTitle, activityId] of activityCache.entries()) {
        console.log(`   - ${activityTitle} (${activityId})`);
      }
    }

    if (failedImports.length > 0) {
      console.log('\n❌ Failed imports:');
      failedImports.forEach(({ record, error, rowNumber }) => {
        console.log(
          `   Row ${rowNumber}: ${record.firstName} ${record.lastName} - ${error}`
        );
      });
    }

    if (skippedImports.length > 0) {
      console.log('\n⏭️ Skipped imports:');
      skippedImports.forEach(({ record, reason, rowNumber }) => {
        console.log(
          `   Row ${rowNumber}: ${record.firstName || 'N/A'} ${record.lastName || 'N/A'} - ${reason}`
        );
      });
    }

    // Step 6: Generate Excel report
    console.log('📊 Generating import report...');
    const workbook = new ExcelJS.Workbook();

    // Get original CSV headers
    const csvHeaders = Object.keys(records[0] || {});

    // Successful imports sheet
    const successSheet = workbook.addWorksheet('Successfully Imported');
    successSheet.addRow(csvHeaders);

    successfulImports.forEach((record) => {
      const row = csvHeaders.map((header) => (record as any)[header] || '');
      successSheet.addRow(row);
    });

    // Style the successful sheet
    successSheet.getRow(1).font = { bold: true };
    successSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF90EE90' }, // Light green header
    };

    // Failed imports sheet
    const failedSheet = workbook.addWorksheet('Failed to Import');
    failedSheet.addRow([...csvHeaders, 'Error Reason', 'Row Number']);

    failedImports.forEach(({ record, error, rowNumber }) => {
      const row = csvHeaders.map((header) => (record as any)[header] || '');
      row.push(error, rowNumber.toString());
      failedSheet.addRow(row);
    });

    // Style the failed sheet
    failedSheet.getRow(1).font = { bold: true };
    failedSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF6B6B' }, // Light red header
    };

    // Skipped imports sheet
    const skippedSheet = workbook.addWorksheet('Skipped Records');
    skippedSheet.addRow([...csvHeaders, 'Skip Reason', 'Row Number']);

    skippedImports.forEach(({ record, reason, rowNumber }) => {
      const row = csvHeaders.map((header) => (record as any)[header] || '');
      row.push(reason, rowNumber.toString());
      skippedSheet.addRow(row);
    });

    // Style the skipped sheet
    skippedSheet.getRow(1).font = { bold: true };
    skippedSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF99' }, // Light yellow header
    };

    // Auto-fit columns for all sheets
    [successSheet, failedSheet, skippedSheet].forEach((sheet) => {
      sheet.columns.forEach((column) => {
        column.width = 15; // Set reasonable default width
      });
    });

    // Save the Excel file
    const reportPath = path.join(
      process.cwd(),
      '.project/reports/output',
      `import-report-${new Date().toISOString().split('T')[0]}.xlsx`
    );

    // Ensure output directory exists
    const outputDir = path.dirname(reportPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await workbook.xlsx.writeFile(reportPath);
    console.log(`📋 Import report saved: ${reportPath}`);

    console.log('\n🎉 CSV import completed successfully!');
  } catch (error) {
    console.error('💥 Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
