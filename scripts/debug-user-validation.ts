import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient({
  log: ['error'],
});

// Same CSV interface as validation script
interface CSVRow {
  market: string;
  firstName: string;
  lastName: string;
  nickname: string;
  jobTitle: string;
  company: string;
  guestType: string;
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
  roomDrop: string;
  hotelBookingForVisa: string;
  notes: string;
  gpTransfersRequired: string;
  eventTransfersRequired: string;
  // Activity assignments
  crystalGoldLaunch: string;
  clcInterview: string;
  airCccc: string;
  casaFerrari: string;
  prsPaddockClubFri: string;
  regalClubFri: string;
  crystalGoldLoungeFri: string;
  eveningBar: string;
  fredInterviewSession: string;
  prsPaddockClubSat: string;
  regalClubSat: string;
  crystalGoldLoungeSat: string;
  sushiSambaAfterParty: string;
  prsPaddockClubSun: string;
  regalClubSun: string;
  crystalGoldLoungeSun: string;
  lavoAfterParty: string;
  marketCarNumber: string;
  marketCarNumberNotes: string;
}

// Helper functions
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
 * Load CSV data
 */
async function loadCSVData(): Promise<CSVRow[]> {
  const csvPath = path.join(process.cwd(), '.project/reports/data/prod.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');

  const records = parse(csvContent, {
    columns: [
      'market',
      'firstName',
      'lastName',
      'nickname',
      'jobTitle',
      'company',
      'guestType',
      'internalVip',
      'vipGuest',
      'email',
      'contactMobile',
      'host',
      'emergencyContactName',
      'emergencyContactNumber',
      'gender',
      'sizeRequirements',
      'initials',
      'accessibilityRequirements',
      'dietaryRequirements',
      'medicalInformation',
      'transportMode',
      'inboundDepartureFrom',
      'inboundDepartureDate',
      'inboundDepartureTime',
      'inboundDepartureTerminal',
      'inboundFlightNumber',
      'connectingFlight',
      'inboundArrivalDate',
      'inboundArrivalTime',
      'inboundArrivalTo',
      'transportRequired',
      'outboundDepartureFrom',
      'outboundDepartureDate',
      'outboundDepartureTime',
      'outboundDepartureTerminal',
      'outboundFlightNumber',
      'outboundArrivalTo',
      'accommodationRequired',
      'hotelName',
      'roomCategory',
      'occupancy',
      'checkInDate',
      'checkOutDate',
      'numberOfNights',
      'roomDrop',
      'hotelBookingForVisa',
      'notes',
      'gpTransfersRequired',
      'eventTransfersRequired',
      // Activity assignments
      'crystalGoldLaunch',
      'clcInterview',
      'airCccc',
      'casaFerrari',
      'prsPaddockClubFri',
      'regalClubFri',
      'crystalGoldLoungeFri',
      'eveningBar',
      'fredInterviewSession',
      'prsPaddockClubSat',
      'regalClubSat',
      'crystalGoldLoungeSat',
      'sushiSambaAfterParty',
      'prsPaddockClubSun',
      'regalClubSun',
      'crystalGoldLoungeSun',
      'lavoAfterParty',
      'marketCarNumber',
      'marketCarNumberNotes',
    ],
    skip_empty_lines: true,
    trim: true,
    from_line: 2,
  }) as CSVRow[];

  return records;
}

/**
 * Find user by name or CSV row number
 */
async function findUser(
  searchTerm: string,
  eventId: string
): Promise<{ user: any; csvRecord: CSVRow | null; rowNumber: number }> {
  const csvRecords = await loadCSVData();

  // Check if search term is a row number
  const rowNumber = parseInt(searchTerm);
  if (!isNaN(rowNumber) && rowNumber > 0) {
    const csvRecord = csvRecords[rowNumber - 2]; // -2 because array is 0-based and CSV starts from line 2
    if (csvRecord) {
      // Find user by CSV record - get all users and search in memory
      const allUsers = await prisma.user.findMany({
        where: {
          eventId,
          active: true,
        },
        include: {
          roomAssignments: {
            include: {
              hotel: { select: { name: true } },
              roomType: { select: { name: true } },
            },
          },
        },
      });

      const user = allUsers.find((u) => {
        const profile = u.profile as any;
        const dbFirstName = profile?.firstName?.toLowerCase() || '';
        const dbLastName = profile?.lastName?.toLowerCase() || '';
        const csvFirstName = csvRecord.firstName?.toLowerCase() || '';
        const csvLastName = csvRecord.lastName?.toLowerCase() || '';

        // Handle case where CSV has empty firstName but DB doesn't have firstName field
        const firstNameMatch =
          dbFirstName === csvFirstName || (!dbFirstName && !csvFirstName);

        return firstNameMatch && dbLastName === csvLastName;
      });

      if (user) {
        return { user, csvRecord, rowNumber };
      }
    }
  }

  // Search by name - get all users and filter in memory due to JSON field limitations
  const users = await prisma.user.findMany({
    where: {
      eventId,
      active: true,
    },
    include: {
      roomAssignments: {
        include: {
          hotel: { select: { name: true } },
          roomType: { select: { name: true } },
        },
      },
    },
  });

  // Filter users by name in memory
  const filteredUsers = users.filter((user) => {
    const profile = user.profile as any;
    const firstName = profile?.firstName?.toLowerCase() || '';
    const lastName = profile?.lastName?.toLowerCase() || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const searchLower = searchTerm.toLowerCase();

    return (
      firstName.includes(searchLower) ||
      lastName.includes(searchLower) ||
      fullName.includes(searchLower)
    );
  });

  // Find matching CSV record for the first user found
  for (const user of filteredUsers) {
    const profile = user.profile as any;
    const firstName = profile?.firstName?.toLowerCase();
    const lastName = profile?.lastName?.toLowerCase();

    for (let i = 0; i < csvRecords.length; i++) {
      const record = csvRecords[i];
      const csvFirstName = record.firstName?.toLowerCase() || '';
      const csvLastName = record.lastName?.toLowerCase() || '';

      // Handle case where CSV has empty firstName but DB doesn't have firstName field
      const firstNameMatch =
        firstName === csvFirstName || (!firstName && !csvFirstName);

      if (firstNameMatch && lastName === csvLastName) {
        return { user, csvRecord: record, rowNumber: i + 2 };
      }
    }
  }

  return { user: filteredUsers[0] || null, csvRecord: null, rowNumber: -1 };
}

/**
 * Deep dive into activity assignment issue
 */
async function debugActivityIssue(
  user: any,
  csvRecord: CSVRow,
  activityTitle: string,
  eventId: string
): Promise<void> {
  console.log(`\n🔍 DEEP DIVE: Activity "${activityTitle}"`);
  console.log('='.repeat(60));

  // Get the activity
  const activity = await prisma.activity.findFirst({
    where: {
      eventId,
      title: activityTitle,
      active: true,
      deleted: false,
    },
    select: {
      id: true,
      title: true,
      groupIds: true,
      createdBy: true,
      createdAt: true,
      lastModifiedAt: true,
      lastModifiedBy: true,
    },
  });

  if (!activity) {
    console.log(`❌ Activity "${activityTitle}" does not exist in database`);
    return;
  }

  console.log(`✅ Activity found: ${activity.id}`);
  console.log(`   Created: ${activity.createdAt}`);
  console.log(`   Last Modified: ${activity.lastModifiedAt}`);
  console.log(`   Assigned to ${activity.groupIds.length} groups`);

  // Get user's groups
  const userGroups = await prisma.group.findMany({
    where: {
      id: { in: user.groupIds },
      active: true,
      deleted: false,
    },
    select: { id: true, name: true, memberCount: true },
  });

  console.log(`\n👤 USER GROUP ANALYSIS:`);
  console.log(`   User is in ${userGroups.length} groups:`);
  userGroups.forEach((group) => {
    const isActivityGroup = activity.groupIds.includes(group.id);
    console.log(
      `   ${isActivityGroup ? '✅' : '❌'} ${group.name} (${group.id}) - ${group.memberCount} members`
    );
  });

  // Get activity's groups
  const activityGroups = await prisma.group.findMany({
    where: {
      id: { in: activity.groupIds },
      active: true,
      deleted: false,
    },
    select: { id: true, name: true, memberCount: true },
  });

  console.log(`\n🎯 ACTIVITY GROUP ANALYSIS:`);
  console.log(`   Activity is assigned to ${activityGroups.length} groups:`);
  activityGroups.forEach((group) => {
    const userHasGroup = user.groupIds.includes(group.id);
    console.log(
      `   ${userHasGroup ? '✅' : '❌'} ${group.name} (${group.id}) - ${group.memberCount} members`
    );
  });

  // Check for exclusions
  const exclusions = await prisma.userActivityExclusion.findMany({
    where: {
      userId: user.id,
      activityId: activity.id,
    },
    select: {
      id: true,
      reason: true,
      excludedBy: true,
      createdAt: true,
    },
  });

  console.log(`\n🚫 EXCLUSION ANALYSIS:`);
  if (exclusions.length > 0) {
    console.log(
      `   User has ${exclusions.length} exclusions for this activity:`
    );
    exclusions.forEach((exclusion) => {
      console.log(`   ❌ Excluded: ${exclusion.reason || 'No reason'}`);
      console.log(
        `      By: ${exclusion.excludedBy} at ${exclusion.createdAt}`
      );
    });
  } else {
    console.log(`   ✅ No exclusions found for this activity`);
  }

  // Check CSV expectation
  const csvField = getCsvFieldForActivity(activityTitle);
  if (csvField && csvRecord) {
    const csvValue = (csvRecord as any)[csvField];
    const shouldAttend = parseYesNo(csvValue);
    console.log(`\n📋 CSV EXPECTATION:`);
    console.log(`   CSV Field: ${csvField}`);
    console.log(`   CSV Value: "${csvValue}"`);
    console.log(`   Should Attend: ${shouldAttend ? 'YES' : 'NO'}`);
  }

  // Final diagnosis
  console.log(`\n🩺 DIAGNOSIS:`);
  const hasGroupAccess = activity.groupIds.some((groupId) =>
    user.groupIds.includes(groupId)
  );
  const isExcluded = exclusions.length > 0;

  if (!hasGroupAccess) {
    console.log(`❌ ROOT CAUSE: User's groups don't match activity's groups`);
    console.log(
      `   SOLUTION: Either add user to one of the activity's groups, or assign activity to user's groups`
    );
  } else if (isExcluded) {
    console.log(
      `❌ ROOT CAUSE: User is explicitly excluded from this activity`
    );
    console.log(`   SOLUTION: Remove the exclusion record(s)`);
  } else {
    console.log(`✅ User should have access to this activity`);
  }
}

/**
 * Get CSV field name for activity title
 */
function getCsvFieldForActivity(activityTitle: string): string | null {
  const mapping: Record<string, string> = {
    'Crystal Gold Launch': 'crystalGoldLaunch',
    'CLC Interview': 'clcInterview',
    'AIR CCCC': 'airCccc',
    'Casa Ferrari': 'casaFerrari',
    'PRS Paddock Club - Friday': 'prsPaddockClubFri',
    'Regal Club - Friday': 'regalClubFri',
    'Crystal Gold Lounge - Friday': 'crystalGoldLoungeFri',
    'Fred Interview Session': 'fredInterviewSession',
    'PRS Paddock Club - Saturday': 'prsPaddockClubSat',
    'Regal Club - Saturday': 'regalClubSat',
    'Crystal Gold Lounge - Saturday': 'crystalGoldLoungeSat',
    'Sushi Samba After Party': 'sushiSambaAfterParty',
    'PRS Paddock Club - Sunday': 'prsPaddockClubSun',
    'Regal Club - Sunday': 'regalClubSun',
    'Crystal Gold Lounge - Sunday': 'crystalGoldLoungeSun',
    'LAVO After Party': 'lavoAfterParty',
  };

  // Handle evening bar activities
  if (activityTitle.startsWith('Evening Bar - ')) {
    return 'eveningBar';
  }

  return mapping[activityTitle] || null;
}

/**
 * Debug group assignment issue
 */
async function debugGroupIssue(
  user: any,
  csvRecord: CSVRow,
  eventId: string
): Promise<void> {
  console.log(`\n🔍 DEEP DIVE: Group Assignment`);
  console.log('='.repeat(60));

  const marketName = cleanValue(csvRecord.market);
  const correctedMarketName =
    marketName === 'Phillipines' ? 'Philippines' : marketName;

  console.log(`📋 CSV EXPECTATION:`);
  console.log(`   CSV Market: "${csvRecord.market}"`);
  console.log(`   Corrected Market: "${correctedMarketName}"`);

  // Find the expected group
  const expectedGroup = await prisma.group.findFirst({
    where: {
      eventId,
      name: correctedMarketName,
      active: true,
      deleted: false,
    },
    select: { id: true, name: true, memberCount: true, createdAt: true },
  });

  if (!expectedGroup) {
    console.log(`❌ Expected group "${correctedMarketName}" does not exist`);
    return;
  }

  console.log(`✅ Expected group found: ${expectedGroup.id}`);
  console.log(`   Name: ${expectedGroup.name}`);
  console.log(`   Members: ${expectedGroup.memberCount}`);
  console.log(`   Created: ${expectedGroup.createdAt}`);

  // Get user's actual groups
  const userGroups = await prisma.group.findMany({
    where: {
      id: { in: user.groupIds },
      active: true,
      deleted: false,
    },
    select: { id: true, name: true, memberCount: true },
  });

  console.log(`\n👤 USER'S ACTUAL GROUPS:`);
  if (userGroups.length === 0) {
    console.log(`   ❌ User is not in any groups!`);
  } else {
    userGroups.forEach((group) => {
      const isExpected = group.id === expectedGroup.id;
      console.log(
        `   ${isExpected ? '✅' : '❌'} ${group.name} (${group.id}) - ${group.memberCount} members`
      );
    });
  }

  // Check if user is in expected group
  const isInExpectedGroup = user.groupIds.includes(expectedGroup.id);
  console.log(`\n🩺 DIAGNOSIS:`);
  if (!isInExpectedGroup) {
    console.log(
      `❌ ROOT CAUSE: User is not in the expected group "${correctedMarketName}"`
    );
    console.log(`   SOLUTION: Add user to group ${expectedGroup.id}`);
  } else {
    console.log(`✅ User is correctly assigned to expected group`);
  }
}

/**
 * Debug car assignment issue
 */
async function debugCarIssue(user: any, csvRecord: CSVRow): Promise<void> {
  console.log(`\n🔍 DEEP DIVE: Car Assignment`);
  console.log('='.repeat(60));

  const expectedCar = cleanValue(csvRecord.marketCarNumber);

  console.log(`📋 CSV EXPECTATION:`);
  console.log(`   CSV Car: "${csvRecord.marketCarNumber}"`);
  console.log(`   Cleaned Car: "${expectedCar}"`);
  console.log(`   Car Notes: "${csvRecord.marketCarNumberNotes || 'None'}"`);

  console.log(`\n👤 USER'S ACTUAL CAR ASSIGNMENT:`);
  console.log(`   Assigned Cars: [${user.carNumbers?.join(', ') || 'none'}]`);
  console.log(`   Car Notes: "${user.carAssignmentNotes || 'None'}"`);

  console.log(`\n🩺 DIAGNOSIS:`);
  if (!expectedCar || expectedCar === 'N/A') {
    if (user.carNumbers && user.carNumbers.length > 0) {
      console.log(
        `❌ ROOT CAUSE: CSV says no car needed, but user has cars assigned`
      );
      console.log(`   SOLUTION: Remove car assignments from user`);
    } else {
      console.log(`✅ Correct: No car expected and none assigned`);
    }
  } else {
    if (!user.carNumbers || user.carNumbers.length === 0) {
      console.log(
        `❌ ROOT CAUSE: CSV specifies car "${expectedCar}" but user has no cars`
      );
      console.log(`   SOLUTION: Assign car "${expectedCar}" to user`);
    } else if (!user.carNumbers.includes(expectedCar)) {
      console.log(`❌ ROOT CAUSE: User has wrong car(s) assigned`);
      console.log(`   Expected: "${expectedCar}"`);
      console.log(`   Actual: [${user.carNumbers.join(', ')}]`);
      console.log(
        `   SOLUTION: Change user's car assignment to "${expectedCar}"`
      );
    } else {
      console.log(`✅ Correct: Car assignment matches CSV expectation`);
    }
  }
}

/**
 * Debug hotel assignment issue
 */
async function debugHotelIssue(user: any, csvRecord: CSVRow): Promise<void> {
  console.log(`\n🔍 DEEP DIVE: Hotel Assignment`);
  console.log('='.repeat(60));

  const expectedRoomType = cleanValue(csvRecord.roomCategory);

  console.log(`📋 CSV EXPECTATION:`);
  console.log(
    `   Accommodation Required: "${csvRecord.accommodationRequired}"`
  );
  console.log(`   Hotel: "${csvRecord.hotelName}"`);
  console.log(`   Room Type: "${csvRecord.roomCategory}"`);
  console.log(`   Occupancy: "${csvRecord.occupancy}"`);
  console.log(`   Check In: "${csvRecord.checkInDate}"`);
  console.log(`   Check Out: "${csvRecord.checkOutDate}"`);

  console.log(`\n👤 USER'S ACTUAL HOTEL ASSIGNMENT:`);
  if (!user.roomAssignments || user.roomAssignments.length === 0) {
    console.log(`   ❌ No room assignments found`);
  } else {
    user.roomAssignments.forEach((assignment: any, index: number) => {
      console.log(`   Assignment ${index + 1}:`);
      console.log(`     Hotel: ${assignment.hotel?.name || 'Unknown'}`);
      console.log(`     Room Type: ${assignment.roomType?.name || 'Unknown'}`);
      console.log(`     Check In: ${assignment.checkInDate || 'Not set'}`);
      console.log(`     Check Out: ${assignment.checkOutDate || 'Not set'}`);
    });
  }

  console.log(`\n🩺 DIAGNOSIS:`);
  if (!expectedRoomType) {
    console.log(`ℹ️ No specific room type expected from CSV`);
    return;
  }

  if (!user.roomAssignments || user.roomAssignments.length === 0) {
    console.log(
      `❌ ROOT CAUSE: CSV specifies room type "${expectedRoomType}" but no room assigned`
    );
    console.log(`   SOLUTION: Assign user to a "${expectedRoomType}" room`);
  } else {
    const assignment = user.roomAssignments[0];
    const actualRoomType = assignment.roomType?.name;

    if (actualRoomType !== expectedRoomType) {
      console.log(`❌ ROOT CAUSE: Room type mismatch`);
      console.log(`   Expected: "${expectedRoomType}"`);
      console.log(`   Actual: "${actualRoomType}"`);
      console.log(
        `   SOLUTION: Change user's room assignment to "${expectedRoomType}"`
      );
    } else {
      console.log(`✅ Correct: Room type matches CSV expectation`);
    }
  }
}

/**
 * Main debug function
 */
async function debugUser(
  searchTerm: string,
  issueType?: string
): Promise<void> {
  try {
    console.log(`🔍 Debugging user: "${searchTerm}"`);

    // Get event
    const event = await prisma.event.findFirst({
      where: { shortName: 'SGP2025' },
    });

    if (!event) {
      throw new Error('Event SGP2025 not found');
    }

    // Find user
    const { user, csvRecord, rowNumber } = await findUser(searchTerm, event.id);

    if (!user) {
      console.log(`❌ User not found: "${searchTerm}"`);
      return;
    }

    const profile = user.profile as any;
    const userName =
      `${profile?.firstName || 'Unknown'} ${profile?.lastName || 'User'}`.trim();

    console.log(`\n✅ Found user: ${userName}`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   CSV Row: ${rowNumber > 0 ? rowNumber : 'Not found'}`);
    console.log(
      `   Groups: ${user.groupIds.length} (${user.groupIds.join(', ')})`
    );
    console.log(`   Cars: [${user.carNumbers?.join(', ') || 'none'}]`);
    console.log(`   Room Assignments: ${user.roomAssignments?.length || 0}`);

    if (!csvRecord) {
      console.log(`⚠️ No matching CSV record found`);
      return;
    }

    // Debug specific issue type or all issues
    if (!issueType || issueType === 'activity') {
      // Check for activity issues - debug the first one found
      const activityFields = [
        { field: 'crystalGoldLaunch', title: 'Crystal Gold Launch' },
        { field: 'clcInterview', title: 'CLC Interview' },
        { field: 'airCccc', title: 'AIR CCCC' },
        { field: 'casaFerrari', title: 'Casa Ferrari' },
        { field: 'prsPaddockClubFri', title: 'PRS Paddock Club - Friday' },
        { field: 'regalClubFri', title: 'Regal Club - Friday' },
        {
          field: 'crystalGoldLoungeFri',
          title: 'Crystal Gold Lounge - Friday',
        },
        { field: 'fredInterviewSession', title: 'Fred Interview Session' },
        { field: 'prsPaddockClubSat', title: 'PRS Paddock Club - Saturday' },
        { field: 'regalClubSat', title: 'Regal Club - Saturday' },
        {
          field: 'crystalGoldLoungeSat',
          title: 'Crystal Gold Lounge - Saturday',
        },
        { field: 'sushiSambaAfterParty', title: 'Sushi Samba After Party' },
        { field: 'prsPaddockClubSun', title: 'PRS Paddock Club - Sunday' },
        { field: 'regalClubSun', title: 'Regal Club - Sunday' },
        {
          field: 'crystalGoldLoungeSun',
          title: 'Crystal Gold Lounge - Sunday',
        },
        { field: 'lavoAfterParty', title: 'LAVO After Party' },
      ];

      for (const { field, title } of activityFields) {
        const csvValue = (csvRecord as any)[field];
        const shouldAttend = parseYesNo(csvValue);
        if (shouldAttend) {
          await debugActivityIssue(user, csvRecord, title, event.id);
          break; // Debug first activity issue found
        }
      }
    }

    if (!issueType || issueType === 'group') {
      await debugGroupIssue(user, csvRecord, event.id);
    }

    if (!issueType || issueType === 'car') {
      await debugCarIssue(user, csvRecord);
    }

    if (!issueType || issueType === 'hotel') {
      await debugHotelIssue(user, csvRecord);
    }
  } catch (error) {
    console.error('💥 Debug failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// CLI usage
const searchTerm = process.argv[2];
const issueType = process.argv[3]; // optional: 'activity', 'group', 'car', 'hotel'

if (!searchTerm) {
  console.log(`
🔍 USER VALIDATION DEBUGGER

Usage: bun scripts/debug-user-validation.ts <search> [issue-type]

Arguments:
  <search>      User name (partial) or CSV row number
  [issue-type]  Optional: 'activity', 'group', 'car', 'hotel' (default: all)

Examples:
  bun scripts/debug-user-validation.ts "Unknown Mathur"
  bun scripts/debug-user-validation.ts 116
  bun scripts/debug-user-validation.ts "John" activity
  bun scripts/debug-user-validation.ts 42 group
`);
  process.exit(1);
}

debugUser(searchTerm, issueType);
