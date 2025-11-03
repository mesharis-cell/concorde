import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';

const emailField = {
  name: 'email',
  type: 'email',
  label: 'Email Address',
  placeholder: 'Enter your email address',
  helperText: 'We will use this email for all event communications',
  required: true,
  validation: {
    required: true,
    email: true,
    message: 'Please enter a valid email address',
  },
  conditional: undefined,
  options: undefined,
  defaultValue: undefined,
  order: 3,
  rows: undefined,
  multiple: undefined,
  accept: undefined,
  metadata: undefined,
};

const migration: MigrationAction = {
  async migrate() {
    console.log('🔄 Adding email field to step1 and updating order numbers...');

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

      // Check if step1 exists and doesn't already have email
      if (config?.step1?.fields && !config.step1.fields.some((f: any) => f.name === 'email')) {
        // Insert email field after lastName (before initials)
        const lastNameIndex = config.step1.fields.findIndex((f: any) => f.name === 'lastName');

        if (lastNameIndex !== -1) {
          // Insert email after lastName
          config.step1.fields.splice(lastNameIndex + 1, 0, emailField);

          // Update order numbers for fields after email
          config.step1.fields.forEach((field: any, index: number) => {
            field.order = index + 1;
          });

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
    }

    console.log(`✅ Added email field to ${updated} events`);
    console.log('✅ Migration completed: add email field to step 1');
  },

  async rollback() {
    console.log('🔄 Removing email field from step1...');

    // Get all events with registrationFormConfig
    const events = await prisma.event.findMany({
      where: {
        registrationFormConfig: { not: null },
      },
    });

    let updated = 0;

    for (const event of events) {
      const config = event.registrationFormConfig as any;

      // Check if step1 exists and has email
      if (config?.step1?.fields) {
        const initialLength = config.step1.fields.length;
        config.step1.fields = config.step1.fields.filter((f: any) => f.name !== 'email');

        if (config.step1.fields.length < initialLength) {
          // Recalculate order numbers
          config.step1.fields.forEach((field: any, index: number) => {
            field.order = index + 1;
          });

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

    console.log(`✅ Removed email field from ${updated} events`);
    console.log('✅ Migration rolled back: add email field to step 1');
  },
};

export default migration;
