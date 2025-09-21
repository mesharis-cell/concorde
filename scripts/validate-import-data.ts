import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient({
    log: ['error']
});

// Same CSV interface as import script
interface CSVRow {
    market: string;
    firstName: string;
    lastName: string;
    nickname: string;
    jobTitle: string;
    company: string;
    guestType: string;
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
}

// Activity mapping from import script (updated with day suffixes)
const activityMapping = [
    { csvField: 'crystalGoldLaunch', activityTitle: 'Crystal Gold Launch', type: 'yesno' },
    { csvField: 'clcInterview', activityTitle: 'CLC Interview', type: 'yesno' },
    { csvField: 'airCccc', activityTitle: 'AIR CCCC', type: 'yesno' },
    { csvField: 'casaFerrari', activityTitle: 'Casa Ferrari', type: 'yesno' },
    { csvField: 'prsPaddockClubFri', activityTitle: 'PRS Paddock Club - Friday', type: 'yesno' },
    { csvField: 'regalClubFri', activityTitle: 'Regal Club - Friday', type: 'yesno' },
    { csvField: 'crystalGoldLoungeFri', activityTitle: 'Crystal Gold Lounge - Friday', type: 'yesno' },
    { csvField: 'eveningBar', activityTitle: 'Evening Bar - Manhattan Bar', type: 'venue', venues: ['Manhattan Bar', 'Origin Bar', 'Republic Bar Singapore', 'Stay Gold', 'Nutmeg & Clove', 'Somma Bar', 'Lobby', 'Atlas'] },
    { csvField: 'fredInterviewSession', activityTitle: 'Fred Interview Session', type: 'yesno' },
    { csvField: 'prsPaddockClubSat', activityTitle: 'PRS Paddock Club - Saturday', type: 'yesno' },
    { csvField: 'regalClubSat', activityTitle: 'Regal Club - Saturday', type: 'yesno' },
    { csvField: 'crystalGoldLoungeSat', activityTitle: 'Crystal Gold Lounge - Saturday', type: 'yesno' },
    { csvField: 'sushiSambaAfterParty', activityTitle: 'Sushi Samba After Party', type: 'yesno' },
    { csvField: 'prsPaddockClubSun', activityTitle: 'PRS Paddock Club - Sunday', type: 'yesno' },
    { csvField: 'regalClubSun', activityTitle: 'Regal Club - Sunday', type: 'yesno' },
    { csvField: 'crystalGoldLoungeSun', activityTitle: 'Crystal Gold Lounge - Sunday', type: 'yesno' },
    { csvField: 'lavoAfterParty', activityTitle: 'LAVO After Party', type: 'yesno' }
];

interface ValidationResult {
    userId: string;
    userName: string;
    csvRowNumber: number;
    issues: string[];
    validations: {
        profile: boolean;
        group: boolean;
        activities: boolean;
        car: boolean;
        hotel: boolean;
    };
}

// Helper functions from import script
const parseYesNo = (value: string): boolean => {
    return value === 'Y' || value === 'Yes' || value === 'yes' || value === 'TRUE' || value === 'true';
};

const cleanValue = (value: string): string | null => {
    if (!value || value === 'N/A' || value === '' || value === 'N/a') return null;
    return value.trim();
};

/**
 * Get random sample of users from database
 */
async function getRandomUserSample(eventId: string, sampleSize: number = 50): Promise<any[]> {
    const totalUsers = await prisma.user.count({
        where: { eventId, active: true }
    });

    console.log(`📊 Total users in database: ${totalUsers}`);
    console.log(`🎯 Sampling ${Math.min(sampleSize, totalUsers)} users for validation`);

    // Get random users using aggregation pipeline
    const users = await prisma.user.findMany({
        where: { eventId, active: true },
        include: {
            roomAssignments: {
                include: {
                    hotel: { select: { name: true } },
                    roomType: { select: { name: true } }
                }
            }
        },
        take: sampleSize,
        orderBy: { registeredAt: 'asc' } // We'll randomly sample from this
    });

    // Randomly shuffle and take sample
    const shuffled = users.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(sampleSize, totalUsers));
}

/**
 * Load and parse CSV data
 */
async function loadCSVData(): Promise<CSVRow[]> {
    console.log('📄 Loading CSV data...');
    const csvPath = path.join(process.cwd(), '.project/reports/data/prod.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const records = parse(csvContent, {
        columns: [
            'market', 'firstName', 'lastName', 'nickname', 'jobTitle', 'company', 'guestType',
            'vipGuest', 'email', 'contactMobile', 'host', 'emergencyContactName',
            'emergencyContactNumber', 'gender', 'sizeRequirements', 'initials',
            'accessibilityRequirements', 'dietaryRequirements', 'medicalInformation',
            'transportMode', 'inboundDepartureFrom', 'inboundDepartureDate',
            'inboundDepartureTime', 'inboundDepartureTerminal', 'inboundFlightNumber',
            'connectingFlight', 'inboundArrivalDate', 'inboundArrivalTime',
            'inboundArrivalTo', 'transportRequired', 'outboundDepartureFrom',
            'outboundDepartureDate', 'outboundDepartureTime', 'outboundDepartureTerminal',
            'outboundFlightNumber', 'outboundArrivalTo', 'accommodationRequired',
            'hotelName', 'roomCategory', 'occupancy', 'checkInDate', 'checkOutDate',
            'numberOfNights', 'hotelBookingForVisa', 'notes',
            // Activity assignments
            'crystalGoldLaunch', 'clcInterview', 'airCccc', 'casaFerrari',
            'prsPaddockClubFri', 'regalClubFri', 'crystalGoldLoungeFri', 'eveningBar',
            'fredInterviewSession', 'prsPaddockClubSat', 'regalClubSat', 'crystalGoldLoungeSat',
            'sushiSambaAfterParty', 'prsPaddockClubSun', 'regalClubSun', 'crystalGoldLoungeSun',
            'lavoAfterParty', 'marketCarNumber'
        ],
        skip_empty_lines: true,
        trim: true,
        from_line: 2
    }) as CSVRow[];

    console.log(`✅ Loaded ${records.length} CSV records`);
    return records;
}

/**
 * Find matching CSV record for a user with improved matching
 */
function findCSVRecord(user: any, csvRecords: CSVRow[]): { record: CSVRow | null, rowNumber: number } {
    const profile = user.profile as any;
    const firstName = profile?.firstName?.toLowerCase().trim();
    const lastName = profile?.lastName?.toLowerCase().trim();
    const email = profile?.email?.toLowerCase().trim();

    console.log(`🔍 Looking for user: "${firstName} ${lastName}" email: "${email}"`);

    for (let i = 0; i < csvRecords.length; i++) {
        const record = csvRecords[i];
        const csvFirstName = record.firstName?.toLowerCase().trim();
        const csvLastName = record.lastName?.toLowerCase().trim();
        const csvEmail = record.email?.toLowerCase().trim();

        // PRIORITIZE name matching over email (more reliable)
        if (firstName && lastName && csvFirstName && csvLastName) {
            if (firstName === csvFirstName && lastName === csvLastName) {
                const csvLineNumber = i + 2; // +2 because CSV parser skips header (from_line: 2)
                console.log(`   ✅ Found by name: Row ${csvLineNumber} (CSV line ${csvLineNumber}) - ${csvFirstName} ${csvLastName}`);
                return { record, rowNumber: csvLineNumber };
            }
        }
    }

    // Only use email as fallback if name match fails (and only if email is unique)
    if (email && email !== '') {
        const emailMatches = csvRecords.filter(r =>
            r.email?.toLowerCase().trim() === email
        );

        if (emailMatches.length === 1) {
            const recordIndex = csvRecords.indexOf(emailMatches[0]);
            const csvLineNumber = recordIndex + 2;
            console.log(`   ✅ Found by unique email: Row ${csvLineNumber} - ${emailMatches[0].firstName} ${emailMatches[0].lastName}`);
            return { record: emailMatches[0], rowNumber: csvLineNumber };
        } else if (emailMatches.length > 1) {
            console.log(`   ⚠️ Email "${email}" matches ${emailMatches.length} CSV records - skipping email match`);
        }
    }

    console.log(`   ❌ No match found for "${firstName} ${lastName}"`);
    return { record: null, rowNumber: -1 };
}

/**
 * Validate user profile data (ignoring empty/undefined mismatches)
 */
function validateProfile(user: any, csvRecord: CSVRow): string[] {
    const issues: string[] = [];
    const profile = user.profile as any;

    // Normalize empty values for comparison
    const normalizeValue = (val: any): string | null => {
        if (!val || val === '' || val === 'N/A' || val === 'undefined') return null;
        return typeof val === 'string' ? val.trim() : String(val);
    };

    const csvFirstName = normalizeValue(csvRecord.firstName);
    const dbFirstName = normalizeValue(profile?.firstName);
    const csvLastName = normalizeValue(csvRecord.lastName);
    const dbLastName = normalizeValue(profile?.lastName);
    const csvEmail = normalizeValue(csvRecord.email);
    const dbEmail = normalizeValue(profile?.email);

    if (csvFirstName !== dbFirstName) {
        issues.push(`First name mismatch: CSV="${csvRecord.firstName}" vs DB="${profile?.firstName}"`);
    }

    if (csvLastName !== dbLastName) {
        issues.push(`Last name mismatch: CSV="${csvRecord.lastName}" vs DB="${profile?.lastName}"`);
    }

    if (csvEmail !== dbEmail) {
        // Only flag if both have values and they differ, not for empty vs undefined
        if ((csvEmail && dbEmail && csvEmail !== dbEmail) ||
            (csvEmail && !dbEmail) ||
            (!csvEmail && dbEmail)) {
            issues.push(`Email mismatch: CSV="${csvRecord.email}" vs DB="${profile?.email}"`);
        }
    }

    return issues;
}

/**
 * Validate group assignment
 */
async function validateGroup(user: any, csvRecord: CSVRow): Promise<string[]> {
    const issues: string[] = [];
    const marketName = cleanValue(csvRecord.market);

    if (!marketName) {
        return issues; // No market specified in CSV
    }

    const correctedMarketName = marketName === 'Phillipines' ? 'Philippines' : marketName;

    // Get user's groups
    const userGroups = await prisma.group.findMany({
        where: {
            id: { in: user.groupIds },
            active: true,
            deleted: false
        },
        select: { name: true, id: true }
    });

    const hasCorrectGroup = userGroups.some(group => group.name === correctedMarketName);

    if (!hasCorrectGroup) {
        const groupNames = userGroups.map(g => g.name).join(', ');
        issues.push(`Group assignment mismatch: Expected="${correctedMarketName}" but user is in groups: [${groupNames}]`);
    }

    return issues;
}

/**
 * Cache activities and exclusions to avoid repeated queries
 */
let activityCache: any[] | null = null;
let userExclusionsCache: Map<string, string[]> | null = null; // userId -> excluded activity IDs

/**
 * Validate activity assignments with PROPER exclusion checking
 */
async function validateActivities(user: any, csvRecord: CSVRow, eventId: string): Promise<string[]> {
    const issues: string[] = [];

    // Load activities once and cache
    if (!activityCache) {
        activityCache = await prisma.activity.findMany({
            where: { eventId, active: true, deleted: false },
            select: { id: true, title: true, groupIds: true }
        });
    }

    // Load ALL user exclusions once and cache
    if (!userExclusionsCache) {
        console.log('📊 Loading all user exclusions for accurate validation...');
        const allExclusions = await prisma.userActivityExclusion.findMany({
            where: { eventId },
            select: { userId: true, activityId: true }
        });

        userExclusionsCache = new Map();
        allExclusions.forEach(exclusion => {
            if (!userExclusionsCache!.has(exclusion.userId)) {
                userExclusionsCache!.set(exclusion.userId, []);
            }
            userExclusionsCache!.get(exclusion.userId)!.push(exclusion.activityId);
        });

        console.log(`✅ Loaded exclusions for ${userExclusionsCache.size} users (${allExclusions.length} total exclusions)`);
    }

    const allActivities = activityCache;

    if (allActivities.length === 0) {
        issues.push(`SYSTEM ISSUE: No activities exist in database for event ${eventId}`);
        return issues;
    }

    // Get activities where user's groups intersect with activity groups
    const activitiesViaGroups = allActivities.filter(activity =>
        activity.groupIds.some(groupId => user.groupIds.includes(groupId))
    );

    // Get user's exclusions
    const userExclusions = userExclusionsCache.get(user.id) || [];

    // REAL activities user can see = activities via groups - exclusions
    const actualUserActivities = activitiesViaGroups.filter(activity =>
        !userExclusions.includes(activity.id)
    );

    // Validate each activity mapping
    for (const mapping of activityMapping) {
        const csvValue = (csvRecord as any)[mapping.csvField] as string;

        if (mapping.type === 'yesno') {
            const shouldBeAssigned = parseYesNo(csvValue);
            const isActuallyAssigned = actualUserActivities.some(activity => activity.title === mapping.activityTitle);

            if (shouldBeAssigned && !isActuallyAssigned) {
                // Detailed diagnosis
                const activityExists = allActivities.some(activity => activity.title === mapping.activityTitle);
                const hasGroupAccess = activitiesViaGroups.some(activity => activity.title === mapping.activityTitle);
                const isExcluded = userExclusions.length > 0 && activitiesViaGroups.some(activity =>
                    activity.title === mapping.activityTitle && userExclusions.includes(activity.id)
                );

                if (!activityExists) {
                    issues.push(`Missing activity: "${mapping.activityTitle}" - Activity doesn't exist in database`);
                } else if (!hasGroupAccess) {
                    issues.push(`Missing activity: "${mapping.activityTitle}" - Activity exists but not assigned to user's groups`);
                } else if (isExcluded) {
                    issues.push(`Missing activity: "${mapping.activityTitle}" - User is excluded from this activity`);
                } else {
                    issues.push(`Missing activity: "${mapping.activityTitle}" - Unknown reason`);
                }
            } else if (!shouldBeAssigned && isActuallyAssigned) {
                issues.push(`Unexpected activity: "${mapping.activityTitle}" - CSV has "N" but user can see activity`);
            }
        } else if (mapping.type === 'venue' && mapping.venues) {
            const expectedVenue = cleanValue(csvValue);
            if (expectedVenue && mapping.venues.includes(expectedVenue)) {
                const expectedActivityTitle = `Evening Bar - ${expectedVenue}`;
                const isActuallyAssigned = actualUserActivities.some(activity => activity.title === expectedActivityTitle);

                if (!isActuallyAssigned) {
                    // Detailed diagnosis  
                    const activityExists = allActivities.some(activity => activity.title === expectedActivityTitle);
                    const hasGroupAccess = activitiesViaGroups.some(activity => activity.title === expectedActivityTitle);
                    const isExcluded = userExclusions.length > 0 && activitiesViaGroups.some(activity =>
                        activity.title === expectedActivityTitle && userExclusions.includes(activity.id)
                    );

                    if (!activityExists) {
                        issues.push(`Missing evening bar: "${expectedActivityTitle}" - Activity doesn't exist in database`);
                    } else if (!hasGroupAccess) {
                        issues.push(`Missing evening bar: "${expectedActivityTitle}" - Activity exists but not assigned to user's groups`);
                    } else if (isExcluded) {
                        issues.push(`Missing evening bar: "${expectedActivityTitle}" - User is excluded from this activity`);
                    } else {
                        issues.push(`Missing evening bar: "${expectedActivityTitle}" - Unknown reason`);
                    }
                }
            }
        }
    }

    return issues;
}

/**
 * Validate car assignment with detailed logging
 */
function validateCar(user: any, csvRecord: CSVRow): string[] {
    const issues: string[] = [];
    const profile = user.profile as any;
    const userName = `${profile?.firstName || 'Unknown'} ${profile?.lastName || 'User'}`.trim();
    const expectedCar = cleanValue(csvRecord.marketCarNumber);

    console.log(`🚗 CAR VALIDATION for ${userName}:`);
    console.log(`   CSV car: "${csvRecord.marketCarNumber}" → cleaned: "${expectedCar}"`);
    console.log(`   DB cars: [${user.carNumbers?.join(', ') || 'none'}]`);

    if (!expectedCar || expectedCar === 'N/A') {
        // No car expected
        if (user.carNumbers && user.carNumbers.length > 0) {
            console.log(`   ❌ Issue: User has cars but CSV says none`);
            issues.push(`Unexpected car: CSV has no car but user assigned to cars: [${user.carNumbers.join(', ')}]`);
        } else {
            console.log(`   ✅ Correct: No car expected and none assigned`);
        }
    } else {
        // Car expected
        if (!user.carNumbers || user.carNumbers.length === 0) {
            console.log(`   ❌ Issue: User missing car`);
            issues.push(`Missing car: CSV specifies car "${expectedCar}" but user has no cars assigned`);
        } else if (!user.carNumbers.includes(expectedCar)) {
            console.log(`   ❌ Issue: Wrong car assigned`);
            issues.push(`Wrong car: CSV specifies "${expectedCar}" but user assigned to: [${user.carNumbers.join(', ')}]`);
        } else {
            console.log(`   ✅ Correct: Car assignment matches`);
        }
    }

    return issues;
}

/**
 * Validate hotel assignment with detailed logging
 */
function validateHotel(user: any, csvRecord: CSVRow): string[] {
    const issues: string[] = [];
    const profile = user.profile as any;
    const userName = `${profile?.firstName || 'Unknown'} ${profile?.lastName || 'User'}`.trim();
    const expectedRoomType = cleanValue(csvRecord.roomCategory);

    console.log(`🏨 HOTEL VALIDATION for ${userName}:`);
    console.log(`   CSV room type: "${csvRecord.roomCategory}" → cleaned: "${expectedRoomType}"`);
    console.log(`   CSV accommodation required: "${csvRecord.accommodationRequired}"`);
    console.log(`   Room assignments: ${user.roomAssignments?.length || 0}`);

    if (!expectedRoomType) {
        console.log(`   ℹ️ No room type expected from CSV`);
        return issues; // No room type expected
    }

    if (!user.roomAssignments || user.roomAssignments.length === 0) {
        console.log(`   ❌ Issue: User missing room assignment`);
        issues.push(`Missing room assignment: CSV specifies room type "${expectedRoomType}" but no room assigned`);
    } else {
        const assignment = user.roomAssignments[0];
        const actualRoomType = assignment.roomType?.name;

        console.log(`   DB room type: "${actualRoomType}"`);
        console.log(`   Hotel: "${assignment.hotel?.name}"`);

        if (actualRoomType !== expectedRoomType) {
            console.log(`   ❌ Issue: Room type mismatch`);
            issues.push(`Room type mismatch: CSV="${expectedRoomType}" vs DB="${actualRoomType}"`);
        } else {
            console.log(`   ✅ Correct: Room type matches`);
        }
    }

    return issues;
}

/**
 * Main validation function
 */
async function validateUser(user: any, csvRecord: CSVRow, rowNumber: number, eventId: string): Promise<ValidationResult> {
    const profile = user.profile as any;
    const userName = `${profile?.firstName || 'Unknown'} ${profile?.lastName || 'User'}`.trim();

    console.log(`🔍 Validating user: ${userName} (Row ${rowNumber})`);

    const issues: string[] = [];

    // Validate profile
    const profileIssues = validateProfile(user, csvRecord);
    issues.push(...profileIssues);

    // Validate group
    const groupIssues = await validateGroup(user, csvRecord);
    issues.push(...groupIssues);

    // Validate activities
    const activityIssues = await validateActivities(user, csvRecord, eventId);
    issues.push(...activityIssues);

    // Validate car
    const carIssues = validateCar(user, csvRecord);
    issues.push(...carIssues);

    // Validate hotel
    const hotelIssues = validateHotel(user, csvRecord);
    issues.push(...hotelIssues);

    return {
        userId: user.id,
        userName,
        csvRowNumber: rowNumber,
        issues,
        validations: {
            profile: profileIssues.length === 0,
            group: groupIssues.length === 0,
            activities: activityIssues.length === 0,
            car: carIssues.length === 0,
            hotel: hotelIssues.length === 0
        }
    };
}

/**
 * Generate validation report
 */
function generateReport(results: ValidationResult[]): void {
    console.log('\n' + '='.repeat(80));
    console.log('📋 VALIDATION REPORT');
    console.log('='.repeat(80));

    const totalUsers = results.length;
    let perfectUsers = 0;
    const issueStats = {
        profile: 0,
        group: 0,
        activities: 0,
        car: 0,
        hotel: 0
    };

    results.forEach(result => {
        if (result.issues.length === 0) {
            perfectUsers++;
        } else {
            Object.keys(issueStats).forEach(category => {
                if (!result.validations[category as keyof typeof issueStats]) {
                    issueStats[category as keyof typeof issueStats]++;
                }
            });
        }
    });

    console.log(`\n📊 SUMMARY STATISTICS:`);
    console.log(`   Total Users Validated: ${totalUsers}`);
    console.log(`   Perfect Users (no issues): ${perfectUsers} (${((perfectUsers / totalUsers) * 100).toFixed(1)}%)`);
    console.log(`   Users with Issues: ${totalUsers - perfectUsers} (${(((totalUsers - perfectUsers) / totalUsers) * 100).toFixed(1)}%)`);

    console.log(`\n🎯 ISSUE BREAKDOWN:`);
    Object.entries(issueStats).forEach(([category, count]) => {
        const percentage = ((count / totalUsers) * 100).toFixed(1);
        console.log(`   ${category.toUpperCase()} Issues: ${count}/${totalUsers} (${percentage}%)`);
    });

    console.log(`\n📋 DETAILED ISSUES:`);
    results.forEach(result => {
        if (result.issues.length > 0) {
            console.log(`\n❌ ${result.userName} (Row ${result.csvRowNumber}):`);
            result.issues.forEach(issue => {
                console.log(`   - ${issue}`);
            });
        }
    });

    console.log(`\n✅ PERFECT USERS (${perfectUsers} total):`);
    results.forEach(result => {
        if (result.issues.length === 0) {
            console.log(`   ✓ ${result.userName} (Row ${result.csvRowNumber})`);
        }
    });
}

/**
 * Debug activity assignment issue
 */
async function debugActivitySystem(eventId: string): Promise<void> {
    console.log('\n🔍 ACTIVITY SYSTEM DEBUG:');

    // Check if activities exist
    const activities = await prisma.activity.findMany({
        where: { eventId, active: true, deleted: false },
        select: { id: true, title: true, groupIds: true, createdBy: true, createdAt: true }
    });

    console.log(`   🎯 Found ${activities.length} activities`);

    if (activities.length === 0) {
        console.log(`   ❌ ROOT CAUSE: No activities exist!`);
        console.log(`   💡 Activities failed to create during import due to ObjectId errors`);
        return;
    }

    // Check if activities have group assignments
    const activitiesWithGroups = activities.filter(a => a.groupIds.length > 0);
    const activitiesWithoutGroups = activities.filter(a => a.groupIds.length === 0);

    console.log(`   📊 Activities with group assignments: ${activitiesWithGroups.length}`);
    console.log(`   📊 Activities without group assignments: ${activitiesWithoutGroups.length}`);

    if (activitiesWithoutGroups.length === activities.length) {
        console.log(`   ❌ ROOT CAUSE: All activities have empty groupIds arrays!`);
        console.log(`   💡 Activities exist but aren't assigned to any groups`);
    }

    // Show sample activities
    console.log(`   🎯 Sample activities (first 10):`);
    activities.slice(0, 10).forEach(activity => {
        console.log(`      - "${activity.title}" (groups: [${activity.groupIds.join(', ')}]) created: ${activity.createdAt}`);
    });
}

async function main() {
    try {
        console.log('🚀 Starting import validation...');

        // Get event (assuming Singapore GP 2025)
        const event = await prisma.event.findFirst({
            where: { shortName: 'SGP2025' }
        });

        if (!event) {
            throw new Error('Event not found. Make sure import completed successfully.');
        }

        console.log(`✅ Found event: ${event.name} (${event.id})`);

        // Load CSV data
        const csvRecords = await loadCSVData();

        // Debug activity system first
        await debugActivitySystem(event.id);

        // Check exclusions system
        const totalExclusions = await prisma.userActivityExclusion.count({
            where: { eventId: event.id }
        });
        console.log(`🚫 Total exclusions in database: ${totalExclusions}`);

        // Get random user sample
        const sampleSize = parseInt(process.argv[2]) || 150;
        const users = await getRandomUserSample(event.id, sampleSize);

        // 🔍 SYSTEM DIAGNOSTICS - Check overall database state
        console.log('\n🔍 SYSTEM DIAGNOSTICS:');

        const [totalUsers, totalGroups, totalActivities, totalRoomAssignments] = await Promise.all([
            prisma.user.count({ where: { eventId: event.id, active: true } }),
            prisma.group.count({ where: { eventId: event.id, active: true, deleted: false } }),
            prisma.activity.count({ where: { eventId: event.id, active: true, deleted: false } }),
            prisma.roomAssignment.count({ where: { eventId: event.id } })
        ]);

        console.log(`   👥 Total Users: ${totalUsers}`);
        console.log(`   🏷️ Total Groups: ${totalGroups}`);
        console.log(`   🎯 Total Activities: ${totalActivities}`);
        console.log(`   🏨 Total Room Assignments: ${totalRoomAssignments}`);

        if (totalActivities === 0) {
            console.log(`   ❌ CRITICAL: No activities found! Import likely failed during activity creation.`);
            console.log(`   🔧 This explains why all users show missing activities.`);
            console.log(`   💡 Check import logs for activity creation errors (ObjectId issues, etc.)`);
        }

        // Show a few sample activities
        if (totalActivities > 0) {
            const sampleActivities = await prisma.activity.findMany({
                where: { eventId: event.id, active: true, deleted: false },
                select: { title: true, groupIds: true },
                take: 5
            });
            console.log(`   🎯 Sample activities:`);
            sampleActivities.forEach(activity => {
                console.log(`      - "${activity.title}" (groups: [${activity.groupIds.join(', ')}])`);
            });
        }

        // Show sample groups
        const sampleGroups = await prisma.group.findMany({
            where: { eventId: event.id, active: true, deleted: false },
            select: { name: true, memberCount: true },
            take: 5
        });
        console.log(`   👥 Sample groups:`);
        sampleGroups.forEach(group => {
            console.log(`      - "${group.name}" (${group.memberCount} members)`);
        });

        // Validate each user
        const results: ValidationResult[] = [];
        for (const user of users) {
            const { record, rowNumber } = findCSVRecord(user, csvRecords);

            if (!record) {
                console.log(`⚠️ Could not find CSV record for user: ${(user.profile as any)?.firstName} ${(user.profile as any)?.lastName}`);
                continue;
            }

            const result = await validateUser(user, record, rowNumber, event.id);
            results.push(result);
        }

        // Generate report
        generateReport(results);

        console.log('\n🎉 Validation completed!');

    } catch (error) {
        console.error('💥 Validation failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run validation
main();
