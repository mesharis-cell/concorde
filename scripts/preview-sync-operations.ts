/**
 * PREVIEW MODE - Shows exact database operations that --live will perform
 * This builds confidence by showing SQL-like operations without executing
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient({ log: ['error'] });
const EVENT_ID = '68c2cd941de2da411f2a2f98';
const EMAIL_PRESERVATION_CUTOFF = new Date('2025-09-28T17:24:18.168Z');
const CUTOFF_DATE = '2025-10-02T00:00:00Z';

const parseYesNo = (value: string): boolean => {
    return value === 'Y' || value === 'Yes' || value === 'yes' || value === 'TRUE' || value === 'true';
};

const cleanValue = (value: string): string | null => {
    if (!value || value === 'N/A' || value === '' || value === 'N/a') return null;
    return value.trim();
};

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

async function main() {
    console.log('🔍 SYNC OPERATIONS PREVIEW');
    console.log('='.repeat(80));
    console.log('This shows EXACTLY what --live mode will do');
    console.log('');

    // Pick specific user to preview
    const searchName = process.argv[2] || 'antoine';

    console.log(`Previewing operations for: "${searchName}"`);
    console.log('');

    // Load CSV
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
            null, null, null, null, null,
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
    }) as any[];

    // Get user
    const allUsers = await prisma.user.findMany({
        where: { eventId: EVENT_ID, active: true },
        include: {
            activityExclusions: { select: { activityId: true, activity: { select: { title: true, importKey: true } } } },
        },
    });

    const searchLower = searchName.toLowerCase();
    const user = allUsers.find(u => {
        const profile = u.profile as any;
        const firstName = profile?.firstName?.toLowerCase() || '';
        const lastName = profile?.lastName?.toLowerCase() || '';
        return firstName.includes(searchLower) || lastName.includes(searchLower);
    });

    if (!user) {
        console.log(`❌ User not found: "${searchName}"`);
        return;
    }

    const profile = user.profile as any;
    const userName = `${profile?.firstName} ${profile?.lastName}`;

    // Find CSV record
    const csvRecord = records.find((r: any) => {
        const csvFirst = r.firstName?.toLowerCase().trim();
        const csvLast = r.lastName?.toLowerCase().trim();
        return csvFirst === profile?.firstName?.toLowerCase() && csvLast === profile?.lastName?.toLowerCase();
    });

    if (!csvRecord) {
        console.log(`❌ CSV record not found for ${userName}`);
        return;
    }

    // Get activities
    const allActivities = await prisma.activity.findMany({
        where: {
            eventId: EVENT_ID,
            active: true,
            deleted: false,
            startDateTime: { gte: new Date(CUTOFF_DATE) },
        },
        select: { id: true, title: true, importKey: true, groupIds: true },
    });

    console.log(`👤 ${userName} (ID: ${user.id})`);
    console.log('='.repeat(80));
    console.log('');

    // Check email operation
    const csvEmail = cleanValue(csvRecord.email)?.toLowerCase();
    const dbEmail = profile?.email?.toLowerCase();

    if (csvEmail !== dbEmail) {
        const emailWasFixed = user.updatedAt > EMAIL_PRESERVATION_CUTOFF;

        console.log('📧 EMAIL OPERATION:');
        if (emailWasFixed) {
            console.log(`   ⏭️  SKIP - Email preserved (manual fix)`);
            console.log(`      DB: "${dbEmail}" (updated ${user.updatedAt.toISOString()})`);
            console.log(`      CSV: "${csvEmail}" (IGNORED)`);
        } else {
            console.log(`   ✏️  UPDATE - Email will change`);
            console.log(`      Current: "${dbEmail}"`);
            console.log(`      New: "${csvEmail}"`);
            console.log(`      Prisma: prisma.user.update({ where: { id: '${user.id}' }, data: { profile: { ...profile, email: '${csvEmail}' } } })`);
        }
        console.log('');
    }

    // Check activity operations
    console.log('🎯 ACTIVITY OPERATIONS:');
    console.log('');

    const excludedIds = new Set(user.activityExclusions.map((e: any) => e.activityId));
    const activitiesViaGroups = allActivities.filter(activity =>
        activity.groupIds.some((groupId: string) => user.groupIds.includes(groupId))
    );
    const currentActivities = activitiesViaGroups.filter(a => !excludedIds.has(a.id));

    let operationCount = 0;

    // DEBUG: Show evening bar CSV value
    const eveningBarValue = (csvRecord as any)['eveningBar'];
    if (eveningBarValue) {
        console.log(`🔍 DEBUG: Evening bar CSV value = "${eveningBarValue}"`);
        console.log('');
    }

    for (const mapping of futureActivityMappings) {
        const csvValue = (csvRecord as any)[mapping.csvField];

        if (mapping.type === 'yesno') {
            const shouldAttend = parseYesNo(csvValue);
            const matchedActivity = currentActivities.find(a => a.importKey === mapping.importKey);

            if (shouldAttend && !matchedActivity) {
                // Will REMOVE exclusion
                const activity = allActivities.find(a => a.importKey === mapping.importKey);
                if (activity) {
                    operationCount++;
                    console.log(`${operationCount}. 🟢 REMOVE EXCLUSION (user will attend)`);
                    console.log(`   Activity: "${activity.title}"`);
                    console.log(`   Prisma: prisma.userActivityExclusion.delete({ where: { userId_activityId: {...} } })`);
                    console.log(`   MongoDB: Delete from user_activity_exclusions where userId='${user.id.substring(0, 8)}...' AND activityId='${activity.id.substring(0, 8)}...'`);
                    console.log('');
                }
            } else if (!shouldAttend && matchedActivity) {
                // Will CREATE exclusion
                operationCount++;
                const userGroupInActivity = user.groupIds.find((gid: string) =>
                    matchedActivity.groupIds.includes(gid)
                );
                console.log(`${operationCount}. 🔴 CREATE EXCLUSION (user will NOT attend)`);
                console.log(`   Activity: "${matchedActivity.title}"`);
                console.log(`   Prisma: UserActivityExclusionService.excludeUserFromActivity({ userId, activityId, ... })`);
                console.log(`   MongoDB: Insert into user_activity_exclusions with userId='${user.id.substring(0, 8)}...' activityId='${matchedActivity.id.substring(0, 8)}...'`);
                console.log('');
            }
        } else if (mapping.type === 'venue' && mapping.venues) {
            // Handle evening bar venues
            const selectedVenue = cleanValue(csvValue);

            if (selectedVenue && mapping.venues.includes(selectedVenue)) {
                // Check if user is assigned to this venue
                const venueSlug = selectedVenue.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '');
                const expectedImportKey = `precision-pour-${venueSlug}`;
                const matchedActivity = currentActivities.find(a => a.importKey === expectedImportKey);

                if (!matchedActivity) {
                    // Will REMOVE exclusion for this venue
                    const activity = allActivities.find(a => a.importKey === expectedImportKey);
                    if (activity) {
                        operationCount++;
                        console.log(`${operationCount}. 🟢 REMOVE EXCLUSION (user will attend evening bar)`);
                        console.log(`   Activity: "${activity.title}"`);
                        console.log(`   Venue: "${selectedVenue}"`);
                        console.log(`   Prisma: prisma.userActivityExclusion.delete({ where: { userId_activityId: {...} } })`);
                        console.log('');
                    }
                }

                // Check if user needs to be removed from OTHER venues
                for (const otherVenue of mapping.venues) {
                    if (otherVenue === selectedVenue) continue;

                    const otherSlug = otherVenue.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '');
                    const otherImportKey = `precision-pour-${otherSlug}`;
                    const isAttendingOther = currentActivities.find(a => a.importKey === otherImportKey);

                    if (isAttendingOther) {
                        // Will CREATE exclusion for other venue
                        operationCount++;
                        const userGroupInActivity = user.groupIds.find((gid: string) =>
                            isAttendingOther.groupIds.includes(gid)
                        );
                        console.log(`${operationCount}. 🔴 CREATE EXCLUSION (remove from other venue)`);
                        console.log(`   Activity: "${isAttendingOther.title}"`);
                        console.log(`   Reason: CSV changed venue to "${selectedVenue}"`);
                        console.log(`   Prisma: UserActivityExclusionService.excludeUserFromActivity({ userId, activityId, ... })`);
                        console.log('');
                    }
                }
            }
        }
    }

    if (operationCount === 0) {
        console.log('   ✅ No operations needed - user is perfectly aligned!');
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('💡 This preview shows the EXACT operations that --live will perform');
    console.log('   The dry run detected these changes, --live will execute them.');
    console.log('');
    console.log('Try different users:');
    console.log('   bun scripts/preview-sync-operations.ts kellie');
    console.log('   bun scripts/preview-sync-operations.ts rhys');
    console.log('');
}

main().finally(() => prisma.$disconnect());

