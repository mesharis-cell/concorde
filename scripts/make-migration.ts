#!/usr/bin/env bun

import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(import.meta.dir, '../database/migrations');

function formatDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
}

function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}_${month}_${day}_${hours}${minutes}${seconds}`;
}

function generateMigrationTemplate(description: string): string {
  const className = description
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  return `import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';

const migration: MigrationAction = {
  async migrate() {
    // TODO: Implement forward migration for: ${description.replace(/_/g, ' ')}
    
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
    
    console.log('✅ Migration completed: ${description.replace(/_/g, ' ')}');
  },

  async rollback() {
    // TODO: Implement rollback for: ${description.replace(/_/g, ' ')}
    
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
    
    console.log('✅ Migration rolled back: ${description.replace(/_/g, ' ')}');
  },
};

export default migration;
`;
}

async function createMigration(description: string) {
  if (!description) {
    console.error('❌ Error: Migration description is required');
    console.log('\n📝 Usage:');
    console.log('  bun run make:migration "Add user preferences"');
    console.log('  bun run make:migration "Update activity schema"');
    console.log('  bun run make:migration "Rename old field to new field"');
    process.exit(1);
  }

  const timestamp = generateTimestamp();
  const formattedDescription = formatDescription(description);
  const fileName = `${timestamp}_${formattedDescription}.ts`;
  const filePath = join(MIGRATIONS_DIR, fileName);

  // Check if file already exists
  if (existsSync(filePath)) {
    console.error(`❌ Error: Migration file already exists: ${fileName}`);
    console.log('💡 Try again in a few seconds or use a different description');
    process.exit(1);
  }

  try {
    const content = generateMigrationTemplate(formattedDescription);
    writeFileSync(filePath, content, 'utf8');

    console.log('🎉 Migration created successfully!');
    console.log(`📁 File: ${fileName}`);
    console.log(`📍 Path: ${filePath}`);
    console.log('');
    console.log('📝 Next steps:');
    console.log('1. Edit the migration file to implement your changes');
    console.log('2. Run: bun run migrate:status');
    console.log('3. Run: bun run migrate');
    console.log('');
    console.log(
      '💡 Remember to implement both migrate() and rollback() methods!'
    );
  } catch (error) {
    console.error('❌ Failed to create migration file:', error);
    process.exit(1);
  }
}

// Main execution
const description = process.argv[2];

if (!description) {
  console.log(`
🎯 Event Concierge Migration Generator

Usage:
  bun run make:migration "Description of your migration"

Examples:
  bun run make:migration "Add description to activities"
  bun run make:migration "Update user preferences schema"  
  bun run make:migration "Rename suburb to city in addresses"
  bun run make:migration "Add email templates table"

The description will be:
- Converted to snake_case for the filename
- Used as-is in the migration template comments
- Timestamped automatically (YYYY_MM_DD_HHMMSS format)
`);
  process.exit(0);
}

await createMigration(description);
