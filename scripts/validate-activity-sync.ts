import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient({ log: ['error'] });

const EVENT_ID = '68c2cd941de2da411f2a2f98';

interface CSVRow {
    market: string;
    firstName: string;
    lastName: string;
    [key: string]: string;
}

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
    try {
        console.log('🔍 ACTIVITY SYNC VALIDATION TOOL');
        console.log('='.repeat(80));

        // Check if user specified a name or email to search
        const searchTerm = process.argv[2];
        const sampleSize = parseInt(process.argv[3]) || 5;

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
        }) as CSVRow[];

        // Get all future activities (include importKey for stable matching)
        const allActivities = await prisma.activity.findMany({
            where: {
                eventId: EVENT_ID,
                active: true,
                deleted: false,
                startDateTime: { gte: new Date('2025-10-02T00:00:00Z') },
            },
            select: { id: true, title: true, importKey: true, groupIds: true },
        });

        console.log(`✅ Loaded ${records.length} CSV records`);
        console.log(`✅ Found ${allActivities.length} future activities`);
        console.log('');

        // Get users based on search term or random sample
        let users;

        if (searchTerm && !searchTerm.match(/^\d+$/)) {
            // Search by name or email
            console.log(`🔍 Searching for user: "${searchTerm}"`);
            console.log('');

            const allUsers = await prisma.user.findMany({
                where: { eventId: EVENT_ID, active: true },
                include: {
                    activityExclusions: {
                        select: { activityId: true },
                    },
                },
            });

            // Search in firstName, lastName, or email
            const searchLower = searchTerm.toLowerCase();
            users = allUsers.filter(user => {
                const profile = user.profile as any;
                const firstName = profile?.firstName?.toLowerCase() || '';
                const lastName = profile?.lastName?.toLowerCase() || '';
                const email = profile?.email?.toLowerCase() || '';
                return firstName.includes(searchLower) ||
                    lastName.includes(searchLower) ||
                    email.includes(searchLower);
            });

            if (users.length === 0) {
                console.log(`❌ No users found matching "${searchTerm}"`);
                return;
            }

            console.log(`✅ Found ${users.length} matching user(s)`);
            console.log('');
        } else {
            // Random sample
            const actualSampleSize = searchTerm && searchTerm.match(/^\d+$/) ? parseInt(searchTerm) : sampleSize;
            console.log(`📊 Analyzing ${actualSampleSize} RANDOM users for manual verification:`);
            console.log('');

            const allUsers = await prisma.user.findMany({
                where: { eventId: EVENT_ID, active: true },
                include: {
                    activityExclusions: {
                        select: { activityId: true },
                    },
                },
            });

            // Randomly shuffle and take sample
            const shuffled = allUsers.sort(() => Math.random() - 0.5);
            users = shuffled.slice(0, Math.min(actualSampleSize, allUsers.length));

            console.log(`   (Selected ${users.length} random users from ${allUsers.length} total)`);
            console.log('');
        }

        for (const user of users) {
            const profile = user.profile as any;
            const userName = `${profile?.firstName} ${profile?.lastName}`;

            // Find CSV record
            const csvRecord = records.find((r) => {
                const csvFirst = r.firstName?.toLowerCase().trim();
                const csvLast = r.lastName?.toLowerCase().trim();
                const dbFirst = profile?.firstName?.toLowerCase().trim();
                const dbLast = profile?.lastName?.toLowerCase().trim();
                return csvFirst === dbFirst && csvLast === dbLast;
            });

            if (!csvRecord) {
                console.log(`⚠️ ${userName}: No CSV match found (might be deleted from sheet)`);
                continue;
            }

            console.log(`\n👤 ${userName}:`);
            console.log('-'.repeat(80));

            // Get current activities
            const excludedIds = new Set(user.activityExclusions.map(e => e.activityId));
            const activitiesViaGroups = allActivities.filter(activity =>
                activity.groupIds.some((groupId: string) => user.groupIds.includes(groupId))
            );
            const currentActivities = activitiesViaGroups.filter(a => !excludedIds.has(a.id));

            console.log(`📋 CURRENT STATE (Database):`);
            if (currentActivities.length === 0) {
                console.log(`   No future activities assigned`);
            } else {
                currentActivities.forEach(a => console.log(`   ✓ ${a.title}`));
            }

            console.log(`\n📋 EXPECTED STATE (CSV):`);
            const expectedActivities: Array<{ title: string; importKey: string }> = [];
            for (const mapping of futureActivityMappings) {
                const csvValue = (csvRecord as any)[mapping.csvField];

                if (mapping.type === 'yesno') {
                    if (parseYesNo(csvValue)) {
                        const activity = allActivities.find(a => a.importKey === mapping.importKey);
                        if (activity) {
                            expectedActivities.push({ title: activity.title, importKey: mapping.importKey });
                            console.log(`   ✓ ${activity.title} (CSV: ${csvValue})`);
                        }
                    }
                } else if (mapping.type === 'venue' && mapping.venues) {
                    const venue = cleanValue(csvValue);
                    if (venue && mapping.venues.includes(venue)) {
                        const venueSlug = venue.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '');
                        const importKey = `precision-pour-${venueSlug}`;
                        const activity = allActivities.find(a => a.importKey === importKey);
                        if (activity) {
                            expectedActivities.push({ title: activity.title, importKey });
                            console.log(`   ✓ ${activity.title} (CSV: ${csvValue})`);
                        }
                    }
                }
            }

            if (expectedActivities.length === 0) {
                console.log(`   No future activities in CSV`);
            }

            // Show differences (match by importKey, display title)
            console.log(`\n🔄 CHANGES NEEDED:`);
            const currentKeys = new Set(currentActivities.map(a => a.importKey));
            const expectedKeys = new Set(expectedActivities.map(a => a.importKey));

            const toAdd = expectedActivities.filter(a => !currentKeys.has(a.importKey));
            const toRemove = currentActivities.filter(a => !expectedKeys.has(a.importKey));

            if (toAdd.length === 0 && toRemove.length === 0) {
                console.log(`   ✅ No changes needed - perfectly aligned!`);
            } else {
                if (toAdd.length > 0) {
                    console.log(`   🟢 TO ADD (${toAdd.length}):`);
                    toAdd.forEach(a => console.log(`      + ${a.title}`));
                }
                if (toRemove.length > 0) {
                    console.log(`   🔴 TO REMOVE (${toRemove.length}):`);
                    toRemove.forEach(a => console.log(`      - ${a.title}`));
                }
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('💡 USAGE OPTIONS:');
        console.log('');
        console.log('Search specific user:');
        console.log('   bun scripts/validate-activity-sync.ts antoine');
        console.log('   bun scripts/validate-activity-sync.ts brocas');
        console.log('   bun scripts/validate-activity-sync.ts kellie.galer');
        console.log('');
        console.log('Random sample:');
        console.log('   bun scripts/validate-activity-sync.ts 10  (checks 10 random users)');
        console.log('   bun scripts/validate-activity-sync.ts     (checks 5 random users)');
        console.log('');
        console.log('💡 VERIFICATION STEPS:');
        console.log('1. For each user above, check your Google Sheet');
        console.log('2. Verify the CSV values match what you see in sheet');
        console.log('3. Confirm the changes make sense');
        console.log('4. If all looks good, run: bun scripts/incremental-sync-v1.ts --live');
        console.log('');

    } catch (error) {
        console.error('💥 Validation failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();

