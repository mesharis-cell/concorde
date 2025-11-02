import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';
import { DEFAULT_REGISTRATION_FORM_CONFIG } from '../../src/config/default-form-config.js';

const migration: MigrationAction = {
  async migrate() {
    console.log('🔄 Adding registrationFormConfig field to existing events...');

    // Add registrationFormConfig field to all events that don't have it
    const result = await prisma.$runCommandRaw({
      update: 'events',
      updates: [{
        q: { registrationFormConfig: { $exists: false } },
        u: { $set: { registrationFormConfig: DEFAULT_REGISTRATION_FORM_CONFIG } },
        multi: true
      }]
    });

    console.log(`✅ Added registrationFormConfig to ${result.modifiedCount || result.nModified || 0} events`);
    console.log('✅ Migration completed: add registration form config field');
  },

  async rollback() {
    console.log('🔄 Removing registrationFormConfig field from events...');

    // Remove registrationFormConfig field from all events
    const result = await prisma.$runCommandRaw({
      update: 'events',
      updates: [{
        q: {},
        u: { $unset: { registrationFormConfig: '' } },
        multi: true
      }]
    });

    console.log(`✅ Removed registrationFormConfig from ${result.modifiedCount || result.nModified || 0} events`);
    console.log('✅ Migration rolled back: add registration form config field');
  },
};

export default migration;
