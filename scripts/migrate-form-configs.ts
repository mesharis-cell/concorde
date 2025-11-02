#!/usr/bin/env bun

/**
 * Migration Script: Add Default Form Configurations to Existing Events
 * 
 * This script updates all existing events that don't have a registrationFormConfig
 * with the default 2-step simplified form configuration.
 * 
 * Usage: bun scripts/migrate-form-configs.ts
 */

import { prisma } from '../src/config/database.js';
import { DEFAULT_REGISTRATION_FORM_CONFIG } from '../src/config/default-form-config.js';
import { RegistrationFormConfigSchema } from '../src/types/index.js';

async function migrateFormConfigs() {
    console.log('🔄 Starting form configuration migration...\n');

    try {
        // Validate default config first
        console.log('📋 Validating default form configuration...');
        const configValidation = RegistrationFormConfigSchema.safeParse(DEFAULT_REGISTRATION_FORM_CONFIG);

        if (!configValidation.success) {
            console.error('❌ Default form configuration is invalid!');
            console.error(configValidation.error.format());
            process.exit(1);
        }
        console.log('✅ Default configuration is valid\n');

        // Find all events without form config
        console.log('🔍 Finding events without form configuration...');
        const eventsWithoutConfig = await prisma.event.findMany({
            where: {
                OR: [
                    { registrationFormConfig: null },
                    { registrationFormConfig: { equals: undefined } },
                ],
            },
            select: {
                id: true,
                name: true,
                shortName: true,
                active: true,
            },
        });

        console.log(`Found ${eventsWithoutConfig.length} events without form configuration\n`);

        if (eventsWithoutConfig.length === 0) {
            console.log('✅ All events already have form configurations. Nothing to migrate.');
            return;
        }

        // Update each event with default config
        console.log('📝 Updating events with default form configuration...\n');

        let successCount = 0;
        let errorCount = 0;

        for (const event of eventsWithoutConfig) {
            try {
                await prisma.event.update({
                    where: { id: event.id },
                    data: {
                        registrationFormConfig: DEFAULT_REGISTRATION_FORM_CONFIG as any,
                    },
                });

                console.log(`✅ Updated: ${event.name} (${event.shortName}) - ${event.id}`);
                successCount++;
            } catch (error: any) {
                console.error(`❌ Failed to update ${event.name}: ${error.message}`);
                errorCount++;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 Migration Summary:');
        console.log(`   Total Events: ${eventsWithoutConfig.length}`);
        console.log(`   ✅ Successfully Updated: ${successCount}`);
        console.log(`   ❌ Failed: ${errorCount}`);
        console.log('='.repeat(60) + '\n');

        if (errorCount > 0) {
            console.log('⚠️  Some events failed to update. Please review the errors above.');
            process.exit(1);
        }

        console.log('🎉 Migration completed successfully!');

    } catch (error: any) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run migration
migrateFormConfigs();


