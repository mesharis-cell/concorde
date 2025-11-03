import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';

const migration: MigrationAction = {
  async migrate() {
    console.log('🔄 Restructuring User schema to use formResponses array...');
    console.log('⚠️  This migration will CLEAR all existing user data (as requested)');

    // Since we're restructuring from profile/requirements to email/formResponses,
    // and user doesn't want to preserve old data, we'll clean slate this.

    // Delete all existing users
    const deleteResult = await prisma.user.deleteMany({});
    console.log(`✅ Deleted ${deleteResult.count} existing users (old schema)`);

    console.log('✅ Migration completed: Users table ready for new schema');
    console.log('📋 New schema structure:');
    console.log('   - email: String (core identity field)');
    console.log('   - formResponses: Json (array of field responses with metadata)');
    console.log('   - communication: Json (separate from form data)');
    console.log('   - Event assignments kept as-is');
  },

  async rollback() {
    console.log('⚠️  Rollback not possible - old user data was intentionally cleared');
    console.log('ℹ️  To restore old schema, revert Prisma schema changes and run prisma:push');
    throw new Error('Rollback not supported for this migration');
  },
};

export default migration;
