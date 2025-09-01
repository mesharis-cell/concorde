#!/usr/bin/env bun

import { readdirSync } from 'fs';
import { join } from 'path';
import { prisma } from '../src/config/database.js';
import type { MigrationAction } from '../database/types.js';

const MIGRATIONS_DIR = join(import.meta.dir, '../database/migrations');

async function runMigrations() {
  console.log('🚀 Starting migrations...');

  try {
    // Get all migration files (exclude dot files and examples)
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => !file.startsWith('.'))
      .sort(); // Timestamp sorting ensures correct order

    // Get existing migrations from database
    const existingMigrations = await prisma.migration.findMany({
      orderBy: { batch: 'desc' },
    });

    const existingNames = existingMigrations.map((m) => m.name);
    const pendingMigrations = migrationFiles.filter(
      (file) => !existingNames.includes(file)
    );

    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }

    // Calculate next batch number
    const latestBatch = existingMigrations[0]?.batch ?? 0;
    const nextBatch = latestBatch + 1;

    console.log(`📝 Found ${pendingMigrations.length} pending migrations:`);
    pendingMigrations.forEach((name) => console.log(`  - ${name}`));

    // Run pending migrations
    for (const fileName of pendingMigrations) {
      const migrationPath = join(MIGRATIONS_DIR, fileName);
      const { default: migration }: { default: MigrationAction } = await import(
        migrationPath
      );

      console.log(`⏳ Running: ${fileName}`);

      try {
        await migration.migrate();

        // Record successful migration
        await prisma.migration.create({
          data: {
            name: fileName,
            batch: nextBatch,
          },
        });

        console.log(`✅ Completed: ${fileName}`);
      } catch (error) {
        console.error(`❌ Failed: ${fileName}`);
        console.error(error);
        process.exit(1);
      }
    }

    console.log(`🎉 Successfully ran ${pendingMigrations.length} migrations`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function rollbackMigrations(steps: number = 1) {
  console.log(`🔄 Rolling back ${steps} migration(s)...`);

  try {
    // Get the latest migrations to rollback
    const migrationsToRollback = await prisma.migration.findMany({
      orderBy: { batch: 'desc' },
      take: steps,
    });

    if (migrationsToRollback.length === 0) {
      console.log('⚠️ No migrations to rollback');
      return;
    }

    console.log(`📝 Rolling back migrations:`);
    migrationsToRollback.forEach((m) => console.log(`  - ${m.name}`));

    // Run rollbacks in reverse order
    for (const migrationRecord of migrationsToRollback.reverse()) {
      const migrationPath = join(MIGRATIONS_DIR, migrationRecord.name);

      try {
        const { default: migration }: { default: MigrationAction } =
          await import(migrationPath);

        console.log(`⏳ Rolling back: ${migrationRecord.name}`);
        await migration.rollback();

        // Remove from migration table
        await prisma.migration.delete({
          where: { id: migrationRecord.id },
        });

        console.log(`✅ Rolled back: ${migrationRecord.name}`);
      } catch (error) {
        console.error(`❌ Rollback failed: ${migrationRecord.name}`);
        console.error(error);
        process.exit(1);
      }
    }

    console.log(
      `🎉 Successfully rolled back ${migrationsToRollback.length} migrations`
    );
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function migrationStatus() {
  console.log('📊 Migration Status:');

  try {
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => !file.startsWith('.'))
      .sort();

    const existingMigrations = await prisma.migration.findMany({
      orderBy: { runAt: 'asc' },
    });

    const existingNames = new Set(existingMigrations.map((m) => m.name));

    console.log('\n✅ Completed migrations:');
    existingMigrations.forEach((m) => {
      console.log(`  [Batch ${m.batch}] ${m.name} - ${m.runAt.toISOString()}`);
    });

    const pendingMigrations = migrationFiles.filter(
      (file) => !existingNames.has(file)
    );

    if (pendingMigrations.length > 0) {
      console.log('\n⏳ Pending migrations:');
      pendingMigrations.forEach((name) => console.log(`  ${name}`));
    } else {
      console.log('\n🎉 All migrations up to date!');
    }
  } catch (error) {
    console.error('❌ Status check failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Main execution
const command = process.argv[2];
const param = process.argv[3];

switch (command) {
  case 'up':
  case 'migrate':
    await runMigrations();
    break;
  case 'down':
  case 'rollback':
    const steps = param ? parseInt(param) : 1;
    await rollbackMigrations(steps);
    break;
  case 'status':
    await migrationStatus();
    break;
  default:
    console.log(`
🎯 Event Concierge Migration Tool

Usage:
  bun scripts/migrate.ts [command] [options]

Commands:
  up|migrate     Run pending migrations
  down|rollback  Rollback last migration (add number for multiple)
  status         Show migration status

Examples:
  bun scripts/migrate.ts up
  bun scripts/migrate.ts rollback 2
  bun scripts/migrate.ts status
`);
}
