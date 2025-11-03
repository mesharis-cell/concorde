import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';

const migration: MigrationAction = {
  async migrate() {
    // TODO: Implement forward migration for: add inbound and outbound flight mock data

    // Example patterns:

    // Add optional field to existing documents
    // await prisma.model.updateMany({
    //   where: { newField: null },
    //   data: { newField: "default_value" }
    // });

    // Rename field using MongoDB operations
    // await prisma.$runCommandRaw({
    //   update: "collection_name",
    //   updates: [{
    //     q: {},
    //     u: { $rename: { "oldField": "newField" } },
    //     multi: true
    //   }]
    // });

    // Complex data transformation
    // const records = await prisma.model.findMany({
    //   where: { needsUpdate: true }
    // });
    //
    // for (const record of records) {
    //   await prisma.model.update({
    //     where: { id: record.id },
    //     data: { newField: transformData(record.oldField) }
    //   });
    // }

    console.log(
      '✅ Migration completed: add inbound and outbound flight mock data'
    );
  },

  async rollback() {
    // TODO: Implement rollback for: add inbound and outbound flight mock data

    // Example rollback patterns:

    // Remove field
    // await prisma.$runCommandRaw({
    //   update: "collection_name",
    //   updates: [{
    //     q: {},
    //     u: { $unset: { fieldToRemove: "" } },
    //     multi: true
    //   }]
    // });

    // Rename field back
    // await prisma.$runCommandRaw({
    //   update: "collection_name",
    //   updates: [{
    //     q: {},
    //     u: { $rename: { "newField": "oldField" } },
    //     multi: true
    //   }]
    // });

    console.log(
      '✅ Migration rolled back: add inbound and outbound flight mock data'
    );
  },
};

export default migration;
