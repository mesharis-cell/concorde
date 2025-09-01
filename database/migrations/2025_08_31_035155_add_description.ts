import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';

const migration: MigrationAction = {
  async migrate() {
    // Add mock descriptions to activities that don't already have them
    // Use raw MongoDB query to properly handle null values
    const result = await prisma.$runCommandRaw({
      update: 'activities',
      updates: [
        {
          q: {
            $or: [{ description: null }, { description: { $exists: false } }],
          },
          u: {
            $set: {
              description:
                'This is an activity description that shows on the microsite, and it should be cut and trailed by three dots (auto-generated)',
            },
          },
          multi: true,
        },
      ],
    });

    console.log(
      `✅ Migration completed: Added descriptions to ${
        result.modifiedCount || result.nModified || 'some'
      } activities`
    );
  },

  async rollback() {
    // Remove the auto-generated descriptions we added
    const result = await prisma.activity.updateMany({
      where: {
        description:
          'This is an activity description that shows on the microsite, and it should be cut and trailed by three dots (auto-generated)',
      },
      data: {
        description: null,
      },
    });

    console.log(
      `✅ Migration rolled back: Removed descriptions from ${result.count} activities`
    );
  },
};

export default migration;
