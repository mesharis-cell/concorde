import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';

const migration: MigrationAction = {
  async migrate() {
    console.log('🔄 Converting single groupId to groupIds array...');

    // Step 1: Add groupIds array field to all activities
    console.log('📝 Step 1: Adding groupIds array field...');
    const step1Result = await prisma.$runCommandRaw({
      update: 'activities',
      updates: [
        {
          q: { groupIds: { $exists: false } },
          u: { $set: { groupIds: [] } },
          multi: true,
        },
      ],
    });
    console.log(
      `✅ Added groupIds array to ${
        step1Result.modifiedCount || step1Result.nModified || 0
      } activities`
    );

    // Step 2: Migrate existing groupId values to groupIds arrays
    console.log('📝 Step 2: Converting existing groupId to groupIds array...');
    const step2Result = await prisma.$runCommandRaw({
      update: 'activities',
      updates: [
        {
          q: {
            groupId: { $ne: null },
            $expr: { $eq: [{ $size: '$groupIds' }, 0] }, // Only if groupIds is empty
          },
          u: [
            {
              $set: {
                groupIds: ['$groupId'], // Convert single ID to array
              },
            },
          ],
          multi: true,
        },
      ],
    });
    console.log(
      `✅ Converted ${
        step2Result.modifiedCount || step2Result.nModified || 0
      } activities to array format`
    );

    // Step 3: Simple verification using Prisma counts
    console.log('📝 Step 3: Verifying data integrity...');
    const totalActivities = await prisma.activity.count();
    const activitiesWithGroupId = await prisma.activity.count({
      where: { groupId: { not: null } },
    });

    // Use raw query to count arrays
    const arrayCountResult = await prisma.$runCommandRaw({
      count: 'activities',
      query: {
        $expr: { $gt: [{ $size: { $ifNull: ['$groupIds', []] } }, 0] },
      },
    });

    console.log('📊 Migration verification:', {
      totalActivities,
      withOldGroupId: activitiesWithGroupId,
      withNewGroupIds: arrayCountResult.n || 0,
    });

    console.log(
      '✅ Migration completed: Convert single groupId to groupIds array'
    );
  },

  async rollback() {
    console.log('🔄 Rolling back to single groupId...');

    // Step 1: Convert groupIds arrays back to single groupId
    console.log('📝 Step 1: Converting groupIds arrays back to groupId...');
    const step1Result = await prisma.$runCommandRaw({
      update: 'activities',
      updates: [
        {
          q: {
            groupIds: { $exists: true, $ne: [] },
            groupId: null,
          },
          u: [
            {
              $set: {
                groupId: { $arrayElemAt: ['$groupIds', 0] }, // Take first group ID
              },
            },
          ],
          multi: true,
        },
      ],
    });
    console.log(
      `✅ Restored groupId for ${
        step1Result.modifiedCount || step1Result.nModified || 0
      } activities`
    );

    // Step 2: Remove groupIds array field
    console.log('📝 Step 2: Removing groupIds array field...');
    const step2Result = await prisma.$runCommandRaw({
      update: 'activities',
      updates: [
        {
          q: {},
          u: { $unset: { groupIds: '' } },
          multi: true,
        },
      ],
    });
    console.log(
      `✅ Removed groupIds from ${
        step2Result.modifiedCount || step2Result.nModified || 0
      } activities`
    );

    console.log(
      '✅ Migration rolled back: Convert single groupId to groupIds array'
    );
  },
};

export default migration;
