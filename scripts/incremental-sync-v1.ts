import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as dateFnsTz from 'date-fns-tz';
import * as ExcelJS from 'exceljs';
import { UserActivityExclusionService } from '../src/services/user-activity-exclusions.js';

const prisma = new PrismaClient({
    log: ['error'],
});

// Event configuration
const EVENT_ID = '68c2cd941de2da411f2a2f98'; // Singapore Grand Prix 2025
const EVENT_TIMEZONE = 'Asia/Singapore';
const CUTOFF_DATE = '2025-10-02T00:00:00Z'; // Only sync activities AFTER Oct 1st

// CRITICAL: Email preservation cutoff - users updated AFTER this timestamp will have emails preserved
// This represents when manual email corrections started
const EMAIL_PRESERVATION_CUTOFF = new Date('2025-09-28T17:24:18.168Z');

// For reference: This is approximately 48 hours before event start
// Any user updated after this timestamp had their email manually corrected

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
    crystalGoldLaunch: string;
    clcInterview: string;
    sandyInterview: string;
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
    gpTransfersRequired: string;
    eventTransfersRequired: string;
    marketCarNumber: string;
    marketCarNumberNotes: string;
}

interface SyncStats {
    newUsers: number;
    updatedUsers: number;
    skippedUsers: number;
    emailsPreserved: number;
    emailsUpdated: number;
    activityChanges: number;
    errors: number;
}

interface ActivityChange {
    userName: string;
    activityTitle: string;
    changeType: 'ADDED' | 'REMOVED' | 'UNCHANGED';
    reason: string;
    csvValue: string;
    previousState: string;
    activityDate: string; // Actual date from database
}

interface NewUserRecord {
    userName: string;
    email: string;
    market: string;
    activitiesAssigned: string[];
    activitiesCount: number;
}

interface UserMatch {
    csvRow: CSVRow;
    dbUser: any | null;
    isNew: boolean;
    changes: string[];
    emailWasManuallyFixed: boolean;
}

// Activity mappings for future activities only (Oct 2+)
// Using importKey for stable matching (titles can change for frontend display)
const futureActivityMappings = [
    { csvField: 'airCccc', importKey: 'regal-masterclass-dining-air-cccc', type: 'yesno' },
    { csvField: 'casaFerrari', importKey: 'casa-ferrari-hospitality', type: 'yesno' },
    { csvField: 'prsPaddockClubFri', importKey: 'paddock-club-friday', type: 'yesno' },
    { csvField: 'regalClubFri', importKey: 'regal-club-friday', type: 'yesno' },
    { csvField: 'crystalGoldLoungeFri', importKey: 'crystal-gold-lounge-friday', type: 'yesno' },
    { csvField: 'eveningBar', importKey: 'precision-pour', type: 'venue', venues: ['Manhattan Bar', 'Origin Bar', 'Republic Bar', 'Stay Gold', 'Nutmeg Clove', 'Somma Bar', 'Lobby', 'Atlas'] },
    { csvField: 'fredInterviewSession', importKey: 'fred-vasseur-interview', type: 'yesno' },
    { csvField: 'prsPaddockClubSat', importKey: 'paddock-club-saturday', type: 'yesno' },
    { csvField: 'regalClubSat', importKey: 'regal-club-saturday', type: 'yesno' },
    { csvField: 'crystalGoldLoungeSat', importKey: 'crystal-gold-lounge-saturday', type: 'yesno' },
    { csvField: 'sushiSambaAfterParty', importKey: 'sushi-samba-after-party', type: 'yesno' },
    { csvField: 'prsPaddockClubSun', importKey: 'paddock-club-sunday', type: 'yesno' },
    { csvField: 'regalClubSun', importKey: 'regal-club-sunday', type: 'yesno' },
    { csvField: 'crystalGoldLoungeSun', importKey: 'crystal-gold-lounge-sunday', type: 'yesno' },
    { csvField: 'lavoAfterParty', importKey: 'lavo-after-party', type: 'yesno' },
];

// Helper functions
const parseYesNo = (value: string): boolean => {
    return value === 'Y' || value === 'Yes' || value === 'yes' || value === 'TRUE' || value === 'true';
};

const cleanValue = (value: string): string | null => {
    if (!value || value === 'N/A' || value === '' || value === 'N/a') return null;
    return value.trim();
};

const parseTime = (timeStr: string): string => {
    if (!timeStr || timeStr === 'N/A' || timeStr.trim() === '') return '';
    const cleaned = timeStr.trim();
    const timeMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
    }
    return cleaned;
};

const convertGender = (genderStr: string): string => {
    if (!genderStr || genderStr === 'N/A') return '';
    return genderStr === 'M' ? 'Men' : genderStr === 'W' ? 'Women' : genderStr;
};

/**
 * Load CSV data
 */
async function loadCSVData(): Promise<CSVRow[]> {
    console.log('📄 Loading CSV data...');
    const csvPath = path.join(process.cwd(), '.project/reports/data/prod.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const records = parse(csvContent, {
        columns: [
            'market', 'firstName', 'lastName', 'nickname', 'guestType', 'jobTitle', 'company',
            'internalVip', 'vipGuest', 'email', 'contactMobile', 'host',
            'emergencyContactName', 'emergencyContactNumber', 'gender', 'sizeRequirements',
            'initials', 'accessibilityRequirements', 'dietaryRequirements', 'medicalInformation',
            'transportMode', 'inboundDepartureFrom', 'inboundDepartureDate', 'inboundDepartureTime',
            'inboundDepartureTerminal', 'inboundFlightNumber', 'connectingFlight',
            'inboundArrivalDate', 'inboundArrivalTime', 'inboundArrivalTo', 'transportRequired',
            'outboundDepartureFrom', 'outboundDepartureDate', 'outboundDepartureTime',
            'outboundDepartureTerminal', 'outboundFlightNumber', 'outboundArrivalTo',
            'accommodationRequired', 'hotelName', 'roomCategory', 'occupancy',
            'checkInDate', 'checkOutDate', 'numberOfNights', 'hotelBookingForVisa',
            'notes', 'roomDrop',
            null, null, null, null, null, // Skip columns 48-52
            'crystalGoldLaunch', null, 'clcInterview', 'sandyInterview', 'airCccc',
            'casaFerrari', 'prsPaddockClubFri', 'regalClubFri', 'crystalGoldLoungeFri',
            'eveningBar', 'fredInterviewSession', null,
            'prsPaddockClubSat', 'regalClubSat', 'crystalGoldLoungeSat', 'sushiSambaAfterParty',
            'prsPaddockClubSun', 'regalClubSun', null, 'crystalGoldLoungeSun', 'lavoAfterParty',
            'gpTransfersRequired', 'eventTransfersRequired', 'marketCarNumber', 'marketCarNumberNotes',
        ],
        skip_empty_lines: true,
        trim: true,
        from_line: 2,
    }) as CSVRow[];

    console.log(`✅ Loaded ${records.length} CSV records`);
    return records;
}

/**
 * Match CSV records with existing DB users
 */
async function matchUsers(csvRecords: CSVRow[]): Promise<UserMatch[]> {
    console.log('\n🔍 Matching CSV users with database...');

    // Get all existing users
    const existingUsers = await prisma.user.findMany({
        where: { eventId: EVENT_ID, active: true },
        include: {
            roomAssignments: {
                include: {
                    hotel: { select: { name: true } },
                    roomType: { select: { name: true } },
                },
            },
        },
    });

    console.log(`   Found ${existingUsers.length} existing users in database`);

    const matches: UserMatch[] = [];

    for (const csvRow of csvRecords) {
        // Skip empty rows
        if (!csvRow.firstName && !csvRow.lastName) continue;

        const csvFirstName = csvRow.firstName?.toLowerCase().trim();
        const csvLastName = csvRow.lastName?.toLowerCase().trim();

        // Match by name (NOT email - emails were manually corrected)
        const dbUser = existingUsers.find((user) => {
            const profile = user.profile as any;
            const dbFirstName = profile?.firstName?.toLowerCase().trim() || '';
            const dbLastName = profile?.lastName?.toLowerCase().trim() || '';
            return dbFirstName === csvFirstName && dbLastName === csvLastName;
        });

        const isNew = !dbUser;
        const changes: string[] = [];
        let emailWasManuallyFixed = false;

        if (dbUser) {
            // Check if email was manually corrected (updated after cutoff timestamp)
            const profile = dbUser.profile as any;
            const csvEmail = cleanValue(csvRow.email)?.toLowerCase();
            const dbEmail = profile?.email?.toLowerCase();

            if (csvEmail !== dbEmail && dbEmail) {
                // User updated AFTER cutoff = manual correction, preserve it
                emailWasManuallyFixed = dbUser.updatedAt > EMAIL_PRESERVATION_CUTOFF;

                if (emailWasManuallyFixed) {
                    changes.push(`Email preserved (manual fix): "${dbEmail}" (CSV has "${csvEmail}")`);
                } else {
                    changes.push(`Email will update: "${dbEmail}" → "${csvEmail}"`);
                }
            }

            // Note: Other changes (room, car, profile) intentionally NOT tracked per user request
            // Only emails and activities (analyzed separately) matter
        }

        matches.push({
            csvRow,
            dbUser,
            isNew,
            changes,
            emailWasManuallyFixed,
        });
    }

    const newCount = matches.filter((m) => m.isNew).length;
    const updateCount = matches.filter((m) => !m.isNew && m.changes.length > 0).length;
    const noChangeCount = matches.filter((m) => !m.isNew && m.changes.length === 0).length;

    console.log(`   📊 Match Summary:`);
    console.log(`      New users: ${newCount}`);
    console.log(`      Users with changes: ${updateCount}`);
    console.log(`      Users unchanged: ${noChangeCount}`);

    return matches;
}

/**
 * Get or create group by market name
 */
async function getOrCreateGroup(marketName: string, adminId: string): Promise<string> {
    const correctedMarketName = marketName === 'Phillipines' ? 'Philippines' : marketName;

    const existingGroup = await prisma.group.findFirst({
        where: {
            eventId: EVENT_ID,
            name: correctedMarketName,
            active: true,
        },
    });

    if (existingGroup) return existingGroup.id;

    // Create new group
    const newGroup = await prisma.group.create({
        data: {
            eventId: EVENT_ID,
            name: correctedMarketName,
            description: `Market group: ${correctedMarketName}`,
        },
    });

    console.log(`   ✨ Created new group: "${correctedMarketName}"`);
    return newGroup.id;
}

/**
 * Create a new user from CSV data
 */
async function createNewUser(csvRow: CSVRow, adminId: string, allGroups: any[]): Promise<void> {
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

    const userData = {
        eventId: EVENT_ID,
        profile: {
            firstName: cleanValue(csvRow.firstName) || undefined,
            lastName: cleanValue(csvRow.lastName) || undefined,
            preferredFirstName: cleanValue(csvRow.nickname) || undefined,
            email: cleanValue(csvRow.email) || undefined,
            phone: cleanValue(csvRow.contactMobile) || undefined,
            jobTitle: cleanValue(csvRow.jobTitle) || undefined,
            company: cleanValue(csvRow.company) || undefined,
            guestType: cleanValue(csvRow.guestType) || undefined,
            vip: parseYesNo(csvRow.vipGuest),
            internalVip: parseYesNo(csvRow.internalVip) || false,
            initials: cleanValue(csvRow.initials) || undefined,
            host: cleanValue(csvRow.host) || undefined,
        },
        communication: {
            emailOptIn: true,
            whatsappOptIn: false,
        },
        guestCategory: cleanValue(csvRow.guestType) || undefined,
        tickets: [],
        merchandiseSize: {
            gender: convertGender(csvRow.gender),
            size: cleanValue(csvRow.sizeRequirements) || undefined,
        },
        accommodation: {
            required: parseYesNo(csvRow.accommodationRequired),
            hotel: cleanValue(csvRow.hotelName) || undefined,
            roomType: cleanValue(csvRow.roomCategory) || undefined,
            checkIn: csvRow.checkInDate ? normalizeDateFormat(cleanValue(csvRow.checkInDate) || '') : undefined,
            checkOut: csvRow.checkOutDate ? normalizeDateFormat(cleanValue(csvRow.checkOutDate) || '') : undefined,
            nightsCount: csvRow.numberOfNights ? parseInt(csvRow.numberOfNights) || 0 : 0,
            hotelNotes: cleanValue(csvRow.notes) || undefined,
            occupancy:
                csvRow.occupancy === 'Single' ? 'single' :
                    csvRow.occupancy === 'Double' ? 'double' :
                        csvRow.occupancy === 'Twin' ? 'twin' :
                            csvRow.occupancy === 'Room Sharer' ? 'room_sharer' :
                                csvRow.occupancy === 'N/A' || !csvRow.occupancy || csvRow.occupancy.trim() === '' ? 'N/A' :
                                    undefined,
            doubleOccupancy: {
                enabled: csvRow.occupancy === 'Double' || csvRow.occupancy === 'Twin' || csvRow.occupancy === 'Room Sharer',
            },
            visaBookingRequired: parseYesNo(csvRow.hotelBookingForVisa),
        },
        flight: {
            inbound: {
                departureFrom: cleanValue(csvRow.inboundDepartureFrom) || undefined,
                departureDate: cleanValue(csvRow.inboundDepartureDate) || undefined,
                departureTime: parseTime(csvRow.inboundDepartureTime) || undefined,
                departureTerminal: cleanValue(csvRow.inboundDepartureTerminal) || undefined,
                flightNumber: cleanValue(csvRow.inboundFlightNumber) || undefined,
                arrivalDate: cleanValue(csvRow.inboundArrivalDate) || undefined,
                arrivalTime: parseTime(csvRow.inboundArrivalTime) || undefined,
                arrivalToAirport: cleanValue(csvRow.inboundArrivalTo) || undefined,
            },
            outbound: {
                departureFrom: cleanValue(csvRow.outboundDepartureFrom) || undefined,
                departureDate: cleanValue(csvRow.outboundDepartureDate) || undefined,
                departureTime: parseTime(csvRow.outboundDepartureTime) || undefined,
                departureTerminal: cleanValue(csvRow.outboundDepartureTerminal) || undefined,
                flightNumber: cleanValue(csvRow.outboundFlightNumber) || undefined,
                arrivalToAirport: cleanValue(csvRow.outboundArrivalTo) || undefined,
            },
        },
        requirements: {
            dietary: {
                enabled: !!cleanValue(csvRow.dietaryRequirements),
                details: cleanValue(csvRow.dietaryRequirements) || undefined,
            },
            medical: {
                enabled: !!cleanValue(csvRow.medicalInformation),
                details: cleanValue(csvRow.medicalInformation) || undefined,
            },
            accessibility: {
                enabled: !!cleanValue(csvRow.accessibilityRequirements),
                details: cleanValue(csvRow.accessibilityRequirements) || undefined,
            },
        },
        emergencyContact: {
            name: cleanValue(csvRow.emergencyContactName) || undefined,
            relationship: undefined,
            phone: cleanValue(csvRow.emergencyContactNumber) || undefined,
            email: undefined,
        },
        transferRequirements: parseYesNo(csvRow.transportRequired) || false,
        gpTransfersRequired: parseYesNo(csvRow.gpTransfersRequired) || false,
        eventTransfersRequired: parseYesNo(csvRow.eventTransfersRequired) || false,
        masterGuestNotes: cleanValue(csvRow.notes) || undefined,
        carAssignmentNotes: cleanValue(csvRow.marketCarNumberNotes) || undefined,
        roomDropAssigned: parseYesNo(csvRow.roomDrop) ? 'standard_drop_sgp2025' : null,
        assigned: false,
        active: true,
    };

    // Create user
    const user = await prisma.user.create({ data: userData });

    // Assign to group
    if (csvRow.market && cleanValue(csvRow.market)) {
        const groupId = await getOrCreateGroup(csvRow.market, adminId);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                groupIds: [groupId],
                assigned: true,
                assignedAt: new Date(),
                assignedBy: adminId,
            },
        });
    }

    // Assign car if specified
    const carNumber = cleanValue(csvRow.marketCarNumber);
    if (carNumber && carNumber !== 'N/A') {
        await prisma.user.update({
            where: { id: user.id },
            data: { carNumbers: [carNumber] },
        });
    }

    console.log(`   ✅ Created user: ${userData.profile.firstName} ${userData.profile.lastName}`);
}

/**
 * Analyze activity changes for a user
 */
async function analyzeActivityChanges(
    csvRow: CSVRow,
    dbUser: any,
    allActivities: any[],
    activityChangesLog: ActivityChange[]
): Promise<void> {
    const userName = `${csvRow.firstName} ${csvRow.lastName}`;

    // Get user's current activity access (via groups, minus exclusions)
    const userExclusions = await prisma.userActivityExclusion.findMany({
        where: { userId: dbUser.id },
        select: { activityId: true },
    });
    const excludedActivityIds = new Set(userExclusions.map(e => e.activityId));

    const activitiesViaGroups = allActivities.filter(activity =>
        activity.groupIds.some((groupId: string) => dbUser.groupIds.includes(groupId))
    );

    const currentActivities = activitiesViaGroups.filter(
        activity => !excludedActivityIds.has(activity.id)
    );

    // Check each future activity mapping (use importKey for stable matching)
    for (const mapping of futureActivityMappings) {
        const csvValue = (csvRow as any)[mapping.csvField];

        if (mapping.type === 'yesno') {
            const shouldAttend = parseYesNo(csvValue);
            // Match by importKey (stable) not title (can change for frontend)
            const matchedActivity = currentActivities.find(a => a.importKey === mapping.importKey);

            if (shouldAttend && !matchedActivity) {
                // Find activity to get current title and date
                const activity = allActivities.find(a => a.importKey === mapping.importKey);
                activityChangesLog.push({
                    userName,
                    activityTitle: activity?.title || mapping.importKey,
                    changeType: 'ADDED',
                    csvValue: csvValue || 'Y',
                    previousState: 'Not assigned',
                    reason: 'CSV indicates should attend',
                    activityDate: activity?.startDateTime.toISOString().split('T')[0] || 'Unknown',
                });
            } else if (!shouldAttend && matchedActivity) {
                activityChangesLog.push({
                    userName,
                    activityTitle: matchedActivity.title,
                    changeType: 'REMOVED',
                    csvValue: csvValue || 'N',
                    previousState: 'Currently assigned',
                    reason: 'CSV indicates should not attend',
                    activityDate: matchedActivity.startDateTime.toISOString().split('T')[0],
                });
            }
        } else if (mapping.type === 'venue' && mapping.venues) {
            const selectedVenue = cleanValue(csvValue);

            if (selectedVenue) {
                // Evening bar importKeys follow pattern: precision-pour-{venue-slug}
                const venueSlug = selectedVenue.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '');
                const expectedImportKey = `precision-pour-${venueSlug}`;

                const matchedActivity = currentActivities.find(a => a.importKey === expectedImportKey);

                if (!matchedActivity) {
                    const activity = allActivities.find(a => a.importKey === expectedImportKey);
                    activityChangesLog.push({
                        userName,
                        activityTitle: activity?.title || `Evening Bar - ${selectedVenue}`,
                        changeType: 'ADDED',
                        csvValue: selectedVenue,
                        previousState: 'Not assigned',
                        reason: `CSV indicates venue: ${selectedVenue}`,
                        activityDate: activity?.startDateTime.toISOString().split('T')[0] || 'Unknown',
                    });
                }

                // Check if user should be removed from other evening bar venues
                mapping.venues.filter(v => v !== selectedVenue).forEach(otherVenue => {
                    const otherSlug = otherVenue.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '');
                    const otherImportKey = `precision-pour-${otherSlug}`;
                    const isAttendingOther = currentActivities.find(a => a.importKey === otherImportKey);

                    if (isAttendingOther) {
                        activityChangesLog.push({
                            userName,
                            activityTitle: isAttendingOther.title,
                            changeType: 'REMOVED',
                            csvValue: selectedVenue,
                            previousState: `Assigned to ${otherVenue}`,
                            reason: `CSV changed venue to ${selectedVenue}`,
                            activityDate: isAttendingOther.startDateTime.toISOString().split('T')[0],
                        });
                    }
                });
            }
        }
    }
}

/**
 * Perform incremental sync
 */
async function performSync(
    matches: UserMatch[],
    dryRun: boolean = true,
    activityChangesLog: ActivityChange[] = [],
    newUserRecords: NewUserRecord[] = []
): Promise<SyncStats> {
    console.log(`\n${dryRun ? '🧪 DRY RUN MODE' : '🚀 LIVE SYNC MODE'}`);

    const stats: SyncStats = {
        newUsers: 0,
        updatedUsers: 0,
        skippedUsers: 0,
        emailsPreserved: 0,
        emailsUpdated: 0,
        activityChanges: 0,
        errors: 0,
    };

    // Get admin for assignments
    const admin = await prisma.admin.findFirst({
        where: { email: 'meshari.s@homeofpmg.com' },
    });

    if (!admin) {
        throw new Error('Admin not found');
    }

    // Get all groups for lookups
    const allGroups = await prisma.group.findMany({
        where: { eventId: EVENT_ID, active: true, deleted: false },
    });

    // Get all activities (use importKey for stable matching)
    const allActivities = await prisma.activity.findMany({
        where: {
            eventId: EVENT_ID,
            active: true,
            deleted: false,
            startDateTime: { gte: new Date(CUTOFF_DATE) }, // Only future activities
        },
        select: { id: true, title: true, importKey: true, startDateTime: true, groupIds: true },
    });

    console.log(`   📅 Syncing ${allActivities.length} future activities (after Oct 1st)`);

    for (const match of matches) {
        try {
            if (match.isNew) {
                // NEW USER - Create
                console.log(`\n➕ NEW USER: ${match.csvRow.firstName} ${match.csvRow.lastName}`);
                console.log(`   Email: ${match.csvRow.email}`);
                console.log(`   Market: ${match.csvRow.market}`);

                // Track activities for new user (for reporting) - use importKey
                const newUserActivities: string[] = [];
                for (const mapping of futureActivityMappings) {
                    const csvValue = (match.csvRow as any)[mapping.csvField];
                    if (mapping.type === 'yesno' && parseYesNo(csvValue)) {
                        const activity = allActivities.find(a => a.importKey === mapping.importKey);
                        if (activity) newUserActivities.push(activity.title);
                    } else if (mapping.type === 'venue' && mapping.venues) {
                        const venue = cleanValue(csvValue);
                        if (venue && mapping.venues.includes(venue)) {
                            const venueSlug = venue.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '');
                            const importKey = `precision-pour-${venueSlug}`;
                            const activity = allActivities.find(a => a.importKey === importKey);
                            if (activity) newUserActivities.push(activity.title);
                        }
                    }
                }

                newUserRecords.push({
                    userName: `${match.csvRow.firstName} ${match.csvRow.lastName}`,
                    email: match.csvRow.email,
                    market: match.csvRow.market,
                    activitiesAssigned: newUserActivities,
                    activitiesCount: newUserActivities.length,
                });

                if (!dryRun) {
                    await createNewUser(match.csvRow, admin.id, allGroups);
                    stats.newUsers++;
                }
            } else {
                // EXISTING USER - Analyze activity changes
                await analyzeActivityChanges(match.csvRow, match.dbUser, allActivities, activityChangesLog);

                if (match.changes.length > 0) {
                    console.log(`\n🔄 ${match.csvRow.firstName} ${match.csvRow.lastName}:`);
                    match.changes.forEach((change) => console.log(`   • ${change}`));

                    if (match.emailWasManuallyFixed) {
                        stats.emailsPreserved++;
                    } else {
                        stats.emailsUpdated++;
                    }

                    if (!dryRun) {
                        // Update email if not preserved
                        if (!match.emailWasManuallyFixed) {
                            const csvEmail = cleanValue(match.csvRow.email);
                            if (csvEmail) {
                                const profile = match.dbUser.profile as any;
                                await prisma.user.update({
                                    where: { id: match.dbUser.id },
                                    data: {
                                        profile: {
                                            ...profile,
                                            email: csvEmail,
                                        },
                                    },
                                });
                            }
                        }
                        stats.updatedUsers++;
                    }
                } else {
                    stats.skippedUsers++;
                }
            }
        } catch (error: any) {
            console.error(`   ❌ Error processing ${match.csvRow.firstName} ${match.csvRow.lastName}:`, error.message);
            stats.errors++;
        }
    }

    stats.activityChanges = activityChangesLog.length;

    // Log activity changes summary
    if (activityChangesLog.length > 0) {
        console.log(`\n📊 Activity Changes Summary:`);
        console.log(`   Total changes: ${activityChangesLog.length}`);
        const added = activityChangesLog.filter(c => c.changeType === 'ADDED').length;
        const removed = activityChangesLog.filter(c => c.changeType === 'REMOVED').length;
        console.log(`   🟢 Assignments to ADD: ${added}`);
        console.log(`   🔴 Assignments to REMOVE: ${removed}`);

        // Apply activity changes if live mode
        if (!dryRun) {
            console.log(`\n🚀 LIVE MODE: Applying activity changes...`);
            console.log(`⚠️  This will make REAL database changes!`);
            console.log('');

            // Show what will be executed
            console.log('📋 Operations that will be performed:');
            const addOperations = activityChangesLog.filter(c => c.changeType === 'ADDED');
            const removeOperations = activityChangesLog.filter(c => c.changeType === 'REMOVED');

            console.log(`   🟢 Remove ${addOperations.length} exclusions (allow users to attend)`);
            console.log(`   🔴 Create ${removeOperations.length} exclusions (prevent users from attending)`);
            console.log('');

            await applyActivityChanges(activityChangesLog, allActivities, admin.id);
            console.log(`✅ Activity changes applied successfully!`);
        }
    }

    return stats;
}

/**
 * Apply activity assignment changes (add/remove exclusions)
 */
async function applyActivityChanges(
    changes: ActivityChange[],
    allActivities: any[],
    adminId: string
): Promise<void> {
    // Group changes by user for batch processing
    const changesByUser = new Map<string, ActivityChange[]>();

    changes.forEach(change => {
        if (!changesByUser.has(change.userName)) {
            changesByUser.set(change.userName, []);
        }
        changesByUser.get(change.userName)!.push(change);
    });

    console.log(`   Processing changes for ${changesByUser.size} users...`);

    for (const [userName, userChanges] of changesByUser) {
        try {
            // Get user from database
            const [firstName, ...lastNameParts] = userName.split(' ');
            const lastName = lastNameParts.join(' ');

            const user = await prisma.user.findFirst({
                where: {
                    eventId: EVENT_ID,
                    active: true,
                },
            });

            if (!user) {
                console.warn(`   ⚠️ User not found: ${userName}`);
                continue;
            }

            const profile = user.profile as any;
            if (profile?.firstName?.toLowerCase() !== firstName.toLowerCase() ||
                profile?.lastName?.toLowerCase() !== lastName.toLowerCase()) {
                continue; // Skip if names don't match
            }

            // Process each change for this user
            for (const change of userChanges) {
                const activity = allActivities.find(a => a.title === change.activityTitle);
                if (!activity) continue;

                // Find the group this user is in that's assigned to this activity
                const userGroupInActivity = user.groupIds.find((gid: string) =>
                    activity.groupIds.includes(gid)
                );

                if (change.changeType === 'ADDED') {
                    // Remove exclusion if exists (user should now attend)
                    const existing = await prisma.userActivityExclusion.findUnique({
                        where: {
                            userId_activityId: {
                                userId: user.id,
                                activityId: activity.id,
                            },
                        },
                    });

                    if (existing) {
                        await prisma.userActivityExclusion.delete({
                            where: { id: existing.id },
                        });
                        console.log(`      ✅ Removed exclusion for ${userName} from "${activity.title}"`);
                    }
                } else if (change.changeType === 'REMOVED' && userGroupInActivity) {
                    // Add exclusion (user should not attend)
                    try {
                        await UserActivityExclusionService.excludeUserFromActivity({
                            userId: user.id,
                            activityId: activity.id,
                            groupId: userGroupInActivity,
                            eventId: EVENT_ID,
                            excludedBy: adminId,
                            reason: 'Updated per CSV sync',
                        });
                        console.log(`      ✅ Added exclusion for ${userName} from "${activity.title}"`);
                    } catch (e: any) {
                        if (!e.message.includes('already excluded')) {
                            console.warn(`      ⚠️ Failed to exclude ${userName}: ${e.message}`);
                        }
                    }
                }
            }
        } catch (error: any) {
            console.error(`   ❌ Failed to process ${userName}: ${error.message}`);
        }
    }
}

/**
 * Generate comprehensive sync report
 */
async function generateSyncReport(
    matches: UserMatch[],
    stats: SyncStats,
    activityChanges: ActivityChange[],
    newUserRecords: NewUserRecord[]
): Promise<void> {
    console.log('\n📊 Generating comprehensive sync report...');

    const workbook = new ExcelJS.Workbook();

    // ==================== SHEET 1: SUMMARY ====================
    const summarySheet = workbook.addWorksheet('📊 Summary');
    summarySheet.addRow(['SYNC SUMMARY REPORT']);
    summarySheet.addRow(['Generated:', new Date().toISOString()]);
    summarySheet.addRow([]);
    summarySheet.addRow(['Metric', 'Count']);
    summarySheet.addRow(['New Users Added', stats.newUsers]);
    summarySheet.addRow(['Users Updated', stats.updatedUsers]);
    summarySheet.addRow(['Users Unchanged', stats.skippedUsers]);
    summarySheet.addRow(['Emails Preserved (manual fixes)', stats.emailsPreserved]);
    summarySheet.addRow(['Emails Updated from CSV', stats.emailsUpdated]);
    summarySheet.addRow(['Activity Assignment Changes', stats.activityChanges]);
    summarySheet.addRow(['Errors', stats.errors]);

    // Style summary
    summarySheet.getRow(1).font = { bold: true, size: 14 };
    summarySheet.getColumn(1).width = 35;
    summarySheet.getColumn(2).width = 15;

    // ==================== SHEET 2: NEW USERS ====================
    const newUsersSheet = workbook.addWorksheet('➕ New Users');
    newUsersSheet.addRow([
        'First Name',
        'Last Name',
        'Email',
        'Market',
        'Activities Count',
        'Activities List'
    ]);

    matches
        .filter((m) => m.isNew)
        .forEach((m) => {
            const newUserRecord = newUserRecords.find(
                (r) => r.userName === `${m.csvRow.firstName} ${m.csvRow.lastName}`
            );

            newUsersSheet.addRow([
                m.csvRow.firstName,
                m.csvRow.lastName,
                m.csvRow.email,
                m.csvRow.market,
                newUserRecord?.activitiesCount || 0,
                newUserRecord?.activitiesAssigned.join(', ') || '',
            ]);
        });

    // Style header
    newUsersSheet.getRow(1).font = { bold: true };
    newUsersSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF90EE90' },
    };

    // ==================== SHEET 3: UPDATED USERS ====================
    const updatesSheet = workbook.addWorksheet('🔄 Updated Users');
    updatesSheet.addRow([
        'First Name',
        'Last Name',
        'Email (DB)',
        'Changes Count',
        'Changes Detail'
    ]);

    matches
        .filter((m) => !m.isNew && m.changes.length > 0)
        .forEach((m) => {
            const dbEmail = (m.dbUser.profile as any)?.email;
            updatesSheet.addRow([
                m.csvRow.firstName,
                m.csvRow.lastName,
                dbEmail,
                m.changes.length,
                m.changes.join(' | '),
            ]);
        });

    updatesSheet.getRow(1).font = { bold: true };
    updatesSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFA500' },
    };
    updatesSheet.getColumn(5).width = 80;

    // ==================== SHEET 4: ACTIVITY CHANGES ====================
    const activitySheet = workbook.addWorksheet('🎯 Activity Changes');
    activitySheet.addRow([
        'User Name',
        'Activity',
        'Change Type',
        'CSV Value',
        'Previous State',
        'Reason',
        'Activity Date'
    ]);

    activityChanges.forEach((change) => {
        activitySheet.addRow([
            change.userName,
            change.activityTitle,
            change.changeType,
            change.csvValue,
            change.previousState,
            change.reason,
            change.activityDate, // Actual date from database
        ]);
    });

    activitySheet.getRow(1).font = { bold: true };
    activitySheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF87CEEB' },
    };
    activitySheet.getColumn(2).width = 40;
    activitySheet.getColumn(4).width = 20;
    activitySheet.getColumn(5).width = 30;
    activitySheet.getColumn(6).width = 40;

    // Color code by change type
    activitySheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
            const changeType = row.getCell(3).value;
            if (changeType === 'ADDED') {
                row.getCell(3).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF90EE90' },
                };
            } else if (changeType === 'REMOVED') {
                row.getCell(3).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFF6B6B' },
                };
            }
        }
    });

    // ==================== SHEET 5: EMAILS PRESERVED ====================
    const emailsSheet = workbook.addWorksheet('🔒 Emails Preserved');
    emailsSheet.addRow([
        'First Name',
        'Last Name',
        'DB Email (KEPT)',
        'CSV Email (IGNORED)',
        'Last Updated',
        'Reason'
    ]);

    matches
        .filter((m) => m.emailWasManuallyFixed)
        .forEach((m) => {
            const dbEmail = (m.dbUser.profile as any)?.email;
            emailsSheet.addRow([
                m.csvRow.firstName,
                m.csvRow.lastName,
                dbEmail,
                m.csvRow.email,
                m.dbUser.updatedAt.toISOString(),
                `Manually corrected after ${EMAIL_PRESERVATION_CUTOFF.toISOString()} - PRESERVED`,
            ]);
        });

    emailsSheet.getRow(1).font = { bold: true };
    emailsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF99' },
    };
    emailsSheet.getColumn(3).width = 30;
    emailsSheet.getColumn(4).width = 30;
    emailsSheet.getColumn(5).width = 25;
    emailsSheet.getColumn(6).width = 40;

    // ==================== SHEET 6: UNCHANGED USERS ====================
    const unchangedSheet = workbook.addWorksheet('✅ Unchanged Users');
    unchangedSheet.addRow(['First Name', 'Last Name', 'Email', 'Status']);

    matches
        .filter((m) => !m.isNew && m.changes.length === 0)
        .forEach((m) => {
            const dbEmail = (m.dbUser.profile as any)?.email;
            unchangedSheet.addRow([
                m.csvRow.firstName,
                m.csvRow.lastName,
                dbEmail,
                'No changes detected'
            ]);
        });

    unchangedSheet.getRow(1).font = { bold: true };
    unchangedSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCCCCCC' },
    };

    // Save report
    const reportPath = path.join(
        process.cwd(),
        '.project/reports/output',
        `sync-report-${new Date().toISOString().split('T')[0]}-${Date.now()}.xlsx`
    );

    await workbook.xlsx.writeFile(reportPath);
    console.log(`✅ Comprehensive sync report saved: ${reportPath}`);
    console.log(`\n📋 Report Contents:`);
    console.log(`   📊 Summary - Overall statistics`);
    console.log(`   ➕ New Users (${stats.newUsers}) - With activity assignments`);
    console.log(`   🔄 Updated Users (${stats.updatedUsers}) - Email changes only`);
    console.log(`   🎯 Activity Changes (${activityChanges.length}) - Before/after comparison`);
    console.log(`   🔒 Emails Preserved (${stats.emailsPreserved}) - Manual fixes kept`);
    console.log(`   ✅ Unchanged Users (${stats.skippedUsers}) - For reference`);
}

/**
 * Main sync execution
 */
async function main() {
    try {
        const dryRun = process.argv[2] !== '--live';

        console.log('🚀 Starting Incremental Sync...');
        console.log(`📅 Event: Singapore Grand Prix 2025 (${EVENT_ID})`);
        console.log(`🔒 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE SYNC'}`);
        console.log(`⏰ Email preservation cutoff: ${EMAIL_PRESERVATION_CUTOFF.toISOString()}`);
        console.log(`   (Users updated AFTER this timestamp will have emails preserved)`);
        console.log(`📅 Activity sync cutoff: After ${CUTOFF_DATE}`);

        // Verify event exists
        const event = await prisma.event.findUnique({
            where: { id: EVENT_ID },
        });

        if (!event) {
            throw new Error('Event not found - check EVENT_ID');
        }

        // Load CSV
        const csvRecords = await loadCSVData();

        // Match users
        const matches = await matchUsers(csvRecords);

        // Track changes for reporting
        const activityChanges: ActivityChange[] = [];
        const newUserRecords: NewUserRecord[] = [];

        // Perform sync (will populate activityChanges and newUserRecords)
        const stats = await performSync(matches, dryRun, activityChanges, newUserRecords);

        // Generate comprehensive report
        await generateSyncReport(matches, stats, activityChanges, newUserRecords);

        // Print summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 SYNC SUMMARY');
        console.log('='.repeat(80));
        console.log(`✅ New users: ${stats.newUsers}`);
        console.log(`🔄 Updated users: ${stats.updatedUsers}`);
        console.log(`⏭️  Skipped (no changes): ${stats.skippedUsers}`);
        console.log(`🔒 Emails preserved: ${stats.emailsPreserved}`);
        console.log(`📧 Emails updated: ${stats.emailsUpdated}`);
        console.log(`🎯 Activity changes: ${stats.activityChanges}`);
        console.log(`❌ Errors: ${stats.errors}`);

        if (dryRun) {
            console.log('\n💡 This was a DRY RUN - no changes were made');
            console.log('   Run with --live flag to apply changes: bun scripts/incremental-sync-v1.ts --live');
        }

        console.log('\n🎉 Sync completed!');
    } catch (error) {
        console.error('💥 Sync failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();

