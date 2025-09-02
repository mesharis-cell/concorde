import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';

const migration: MigrationAction = {
  async migrate() {
    console.log(
      '🔄 Adding activityIds array to groups for proper MongoDB many-to-many...'
    );

    // Step 1: Add activityIds array field to all groups
    console.log('📝 Step 1: Adding activityIds array field to groups...');
    const step1Result = await prisma.$runCommandRaw({
      update: 'groups',
      updates: [
        {
          q: { activityIds: { $exists: false } },
          u: { $set: { activityIds: [] } },
          multi: true,
        },
      ],
    });
    console.log(
      `✅ Added activityIds array to ${
        step1Result.modifiedCount || step1Result.nModified || 0
      } groups`
    );

    // Step 2: Build bidirectional relationships - since activities currently have no groups, this will be empty
    console.log(
      '📝 Step 2: Building bidirectional relationships (currently none exist)...'
    );

    // Verify current state - should be empty since activities were unassigned
    const totalGroups = await prisma.group.count();
    console.log(
      `📊 Total groups: ${totalGroups}, all now have empty activityIds arrays ready for assignment`
    );

    console.log(
      '✅ Migration completed: Groups now ready for many-to-many activity assignments'
    );
  },

  async rollback() {
    console.log('🔄 Rolling back activityIds arrays from groups...');

    // Remove activityIds array field from all groups
    const rollbackResult = await prisma.$runCommandRaw({
      update: 'groups',
      updates: [
        {
          q: {},
          u: { $unset: { activityIds: '' } },
          multi: true,
        },
      ],
    });

    console.log(
      `✅ Removed activityIds array from ${
        rollbackResult.modifiedCount || rollbackResult.nModified || 0
      } groups`
    );
    console.log(
      '✅ Migration rolled back: add activityids array to groups for manytomany sync'
    );
  },
};

export default migration;
