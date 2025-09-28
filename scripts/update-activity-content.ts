import { prisma } from '../src/config/database.js';
import { readFileSync } from 'fs';

/**
 * Activity Content Updater - Updates CONTENT ONLY, preserves timing
 * 
 * ✅ UPDATES THESE FIELDS:
 * - description (activity description text)
 * - content (rich HTML content from TipTap editor) 
 * - thumbnail (S3 image URL)
 * - location (name, address, mapLink object)
 * - category (EXPERIENCE, HOSPITALITY, MEETING, etc.)
 * - capacity (attendance limit)
 * - active (activity status)
 * 
 * ❌ NEVER TOUCHES TIMING FIELDS:
 * - startDateTime (preserved from import)
 * - endDateTime (preserved from import)
 * - timingTable (preserved from import)
 * 
 * Usage:
 * - Dry run: bun scripts/update-activity-content.ts --dry-run
 * - Apply updates: bun scripts/update-activity-content.ts
 */

// Note: Timing fields are preserved - this script only updates content

async function updateActivityContent() {
    // Check for dry run mode
    const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--preview');

    if (isDryRun) {
        console.log('🔍 DRY RUN MODE - No database changes will be made');
        console.log('📋 Previewing what would be updated...\n');
    } else {
        console.log('🔄 Updating activity content and timing after nightly import...');
    }

    const contentUpdates = JSON.parse(
        readFileSync('./scripts/copy.final.activities.json', 'utf-8')
    );

    let updated = 0;
    let notFound = 0;
    let errors = 0;

    for (const updateData of contentUpdates) {
        try {
            const existing = await prisma.activity.findFirst({
                where: {
                    importKey: updateData.importKey,
                    deleted: false
                }
            });

            if (!existing) {
                console.warn(`❌ Activity not found with importKey: ${updateData.importKey} (${updateData.title})`);
                notFound++;
                continue;
            }

            // Skip timing fields - only update content fields
            console.log(`   📝 Updating content fields only (timings will be preserved)`)

            // Build update data dynamically
            const updatePayload: any = {
                lastModifiedAt: new Date()
            };

            // CONTENT FIELDS ONLY - No timing updates
            if (updateData.description !== undefined) updatePayload.description = updateData.description;
            if (updateData.content) updatePayload.content = updateData.content;
            if (updateData.thumbnail !== undefined) updatePayload.thumbnail = updateData.thumbnail;
            if (updateData.location !== undefined) updatePayload.location = updateData.location;
            if (updateData.category) updatePayload.category = updateData.category;
            if (updateData.capacity !== undefined) updatePayload.capacity = updateData.capacity;
            if (updateData.active !== undefined) updatePayload.active = updateData.active;

            // Execute update or preview changes
            if (!isDryRun) {
                await prisma.activity.update({
                    where: { id: existing.id },
                    data: updatePayload
                });
            } else {
                console.log(`   📝 Would update fields: ${Object.keys(updatePayload).filter(k => k !== 'lastModifiedAt').join(', ')}`);
            }

            // Log what was updated (content fields only)
            const updateTypes = [];
            if (updateData.description !== undefined || updateData.content || updateData.thumbnail !== undefined || updateData.location !== undefined) {
                updateTypes.push('content');
            }
            if (updateData.category || updateData.capacity !== undefined || updateData.active !== undefined) {
                updateTypes.push('metadata');
            }
            if (!updateTypes.length) updateTypes.push('fields');

            const action = isDryRun ? 'Would update' : 'Updated';
            console.log(`${isDryRun ? '🔍' : '✅'} ${action} ${updateTypes.join(' + ')}: ${updateData.title}`);
            updated++;

        } catch (error: any) {
            console.error(`💥 Error updating ${updateData.title}:`, error.message);
            errors++;
        }
    }

    const summaryTitle = isDryRun
        ? '📊 DRY RUN Summary - What Would Be Updated:'
        : '📊 Content Update Summary (Timing Preserved):';

    console.log(`\n${summaryTitle}`);
    console.log(`  ${isDryRun ? '🔍' : '✅'} ${isDryRun ? 'Would update' : 'Updated'}: ${updated} activities`);
    console.log(`  ❌ Not Found: ${notFound} activities`);
    console.log(`  💥 Errors: ${errors} activities`);

    if (isDryRun) {
        console.log(`\n💡 To apply changes, run: bun scripts/update-activity-content.ts`);
    }
}

updateActivityContent()
    .catch(console.error)
    .finally(() => prisma.$disconnect());