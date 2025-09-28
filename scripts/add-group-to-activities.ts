import { prisma } from '../src/config/database.js';

// Group ID to add to all activities
const GROUP_ID_TO_ADD = '68d965d797bceeaa4a9d2863';

async function addGroupToAllActivities() {
    const isDryRun = process.argv.includes('--dry-run');

    if (isDryRun) {
        console.log('🔍 DRY RUN MODE - No database changes will be made');
    } else {
        console.log('🔄 Adding group to all activities...');
    }
    console.log(`📋 Group ID to add: ${GROUP_ID_TO_ADD}`);

    try {
        // Get all active activities
        const activities = await prisma.activity.findMany({
            where: {
                active: true,
                deleted: false
            },
            select: {
                id: true,
                title: true,
                groupIds: true
            }
        });

        console.log(`📊 Found ${activities.length} activities to process`);

        let updated = 0;
        let skipped = 0;

        for (const activity of activities) {
            try {
                // Check if group ID is already present
                const currentGroupIds = activity.groupIds || [];
                const alreadyHasGroup = currentGroupIds.includes(GROUP_ID_TO_ADD);

                if (alreadyHasGroup) {
                    console.log(`⏭️  Skipped "${activity.title}" - group already assigned`);
                    skipped++;
                    continue;
                }

                // Add the new group ID to existing array
                const updatedGroupIds = [...currentGroupIds, GROUP_ID_TO_ADD];

                if (!isDryRun) {
                    await prisma.activity.update({
                        where: { id: activity.id },
                        data: {
                            groupIds: updatedGroupIds,
                            lastModifiedAt: new Date()
                        }
                    });
                    console.log(`✅ Added group to "${activity.title}" (${currentGroupIds.length} → ${updatedGroupIds.length} groups)`);
                } else {
                    console.log(`🔍 Would add group to "${activity.title}" (${currentGroupIds.length} → ${updatedGroupIds.length} groups)`);
                }
                updated++;

            } catch (error: any) {
                console.error(`❌ Failed to update "${activity.title}":`, error.message);
            }
        }

        const summaryTitle = isDryRun ? '📊 DRY RUN Summary (No Changes Made):' : '📊 Summary:';
        console.log(`\n${summaryTitle}`);
        console.log(`  ${isDryRun ? '🔍' : '✅'} ${isDryRun ? 'Would update' : 'Updated'}: ${updated} activities`);
        console.log(`  ⏭️  Skipped: ${skipped} activities (already had group)`);
        console.log(`  📋 Total processed: ${activities.length} activities`);

        if (isDryRun) {
            console.log(`\n💡 To apply changes, run: bun scripts/add-group-to-activities.ts`);
        }

        // Verify the group exists
        const group = await prisma.group.findUnique({
            where: { id: GROUP_ID_TO_ADD },
            select: { id: true, name: true, eventId: true }
        });

        if (group) {
            console.log(`\n✅ Verified group exists: "${group.name}" (${group.id})`);
        } else {
            console.warn(`\n⚠️  Warning: Group ${GROUP_ID_TO_ADD} not found in database`);
        }

    } catch (error) {
        console.error('💥 Script failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

addGroupToAllActivities();
