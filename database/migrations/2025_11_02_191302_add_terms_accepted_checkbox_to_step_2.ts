import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';

const termsField = {
  name: 'termsAccepted',
  type: 'checkbox',
  label: 'I accept the Terms and Conditions and Privacy Policy',
  helperText: 'Please review and accept our terms to complete your registration',
  required: true,
  validation: {
    required: true,
    message: 'You must accept the terms and conditions to proceed',
  },
  defaultValue: false,
  order: 4,
  rows: undefined,
  options: undefined,
  multiple: undefined,
  accept: undefined,
  metadata: undefined,
};

const migration: MigrationAction = {
  async migrate() {
    console.log('🔄 Adding termsAccepted checkbox to step2 in all events...');

    // Get all events with registrationFormConfig
    const events = await prisma.event.findMany({
      where: {
        registrationFormConfig: { not: null },
      },
    });

    console.log(`📝 Found ${events.length} events with form configs`);

    let updated = 0;

    for (const event of events) {
      const config = event.registrationFormConfig as any;

      // Check if step2 exists and doesn't already have termsAccepted
      if (config?.step2?.fields && !config.step2.fields.some((f: any) => f.name === 'termsAccepted')) {
        // Add the termsAccepted field to step2
        config.step2.fields.push(termsField);

        // Update the event
        await prisma.event.update({
          where: { id: event.id },
          data: {
            registrationFormConfig: config,
          },
        });

        updated++;
        console.log(`✅ Updated event: ${event.name}`);
      }
    }

    console.log(`✅ Added termsAccepted checkbox to ${updated} events`);
    console.log('✅ Migration completed: add terms accepted checkbox to step 2');
  },

  async rollback() {
    console.log('🔄 Removing termsAccepted checkbox from step2 in all events...');

    // Get all events with registrationFormConfig
    const events = await prisma.event.findMany({
      where: {
        registrationFormConfig: { not: null },
      },
    });

    let updated = 0;

    for (const event of events) {
      const config = event.registrationFormConfig as any;

      // Check if step2 exists and has termsAccepted
      if (config?.step2?.fields) {
        const initialLength = config.step2.fields.length;
        config.step2.fields = config.step2.fields.filter((f: any) => f.name !== 'termsAccepted');

        if (config.step2.fields.length < initialLength) {
          // Update the event
          await prisma.event.update({
            where: { id: event.id },
            data: {
              registrationFormConfig: config,
            },
          });

          updated++;
          console.log(`✅ Reverted event: ${event.name}`);
        }
      }
    }

    console.log(`✅ Removed termsAccepted checkbox from ${updated} events`);
    console.log('✅ Migration rolled back: add terms accepted checkbox to step 2');
  },
};

export default migration;
