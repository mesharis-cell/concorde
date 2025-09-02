import { prisma } from '../src/config/database.js';
import * as fs from 'fs';
import * as path from 'path';

type CollectionName =
  | 'users'
  | 'groups'
  | 'events'
  | 'activities'
  | 'admins'
  | 'adminEvents'
  | 'userActivityExclusions'
  | 'emailTemplates'
  | 'emailTracking'
  | 'messages'
  | 'communicationLogs'
  | 'migrations';

interface BackupMetadata {
  collection: CollectionName;
  eventId?: string;
  timestamp: string;
  totalRecords: number;
  backupVersion: string;
  prismaVersion: string;
}

interface BackupFile {
  metadata: BackupMetadata;
  data: any[];
}

const BACKUP_DIR = path.join(process.cwd(), 'scripts', 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function backupCollection(
  collection: CollectionName,
  eventId?: string
): Promise<string> {
  console.log(`📦 Creating backup for collection: ${collection}`);

  let data: any[] = [];
  let whereClause: any = {};

  // Add event filtering if specified
  if (eventId) {
    whereClause.eventId = eventId;
  }

  try {
    // Get data based on collection type with relations
    switch (collection) {
      case 'users':
        data = await prisma.user.findMany({
          where: whereClause,
          include: {
            event: { select: { id: true, name: true } },
            group: { select: { id: true, name: true } },
            communicationLogs: true,
            activityExclusions: true,
            emailTracking: true,
          },
        });
        break;

      case 'groups':
        data = await prisma.group.findMany({
          where: whereClause,
          include: {
            event: { select: { id: true, name: true } },
            users: { select: { id: true } },
            activities: { select: { id: true, title: true } },
            communicationLogs: true,
          },
        });
        break;

      case 'events':
        data = await prisma.event.findMany({
          where: eventId ? { id: eventId } : {},
          include: {
            groups: true,
            activities: true,
            users: { take: 5 }, // Limit users for backup size
            adminEvents: { include: { admin: true } },
          },
        });
        break;

      case 'activities':
        data = await prisma.activity.findMany({
          where: whereClause,
          include: {
            event: { select: { id: true, name: true } },
            group: { select: { id: true, name: true } },
            createdByAdmin: { select: { id: true, email: true } },
            lastModifiedByAdmin: { select: { id: true, email: true } },
          },
        });
        break;

      case 'admins':
        data = await prisma.admin.findMany({
          include: {
            adminEvents: { include: { event: { select: { name: true } } } },
            communicationLogs: true,
            createdActivities: { select: { id: true, title: true } },
          },
        });
        break;

      case 'adminEvents':
        data = await prisma.adminEvent.findMany({
          include: {
            admin: { select: { email: true, firstName: true, lastName: true } },
            event: { select: { name: true } },
          },
        });
        break;

      case 'messages':
        data = await prisma.message.findMany({
          where: whereClause,
          include: {
            event: { select: { name: true } },
            template: { select: { name: true, type: true } },
            emailTracking: true,
          },
        });
        break;

      case 'communicationLogs':
        data = await prisma.communicationLog.findMany({
          where: whereClause,
          include: {
            user: { select: { id: true, profile: true } },
            event: { select: { name: true } },
            group: { select: { name: true } },
            admin: { select: { email: true } },
          },
        });
        break;

      case 'emailTemplates':
        data = await prisma.emailTemplate.findMany({
          where: whereClause,
          include: {
            event: { select: { name: true } },
            createdByAdmin: { select: { email: true } },
            messages: { select: { id: true } },
          },
        });
        break;

      case 'emailTracking':
        data = await prisma.emailTracking.findMany({
          include: {
            message: { select: { id: true, emailSubject: true } },
            user: { select: { id: true, profile: true } },
          },
        });
        break;

      case 'userActivityExclusions':
        data = await prisma.userActivityExclusion.findMany({
          where: whereClause,
          include: {
            user: { select: { id: true, profile: true } },
            activity: { select: { id: true, title: true } },
            group: { select: { name: true } },
            event: { select: { name: true } },
            admin: { select: { email: true } },
          },
        });
        break;

      case 'migrations':
        data = await prisma.migration.findMany();
        break;

      default:
        throw new Error(`Unsupported collection: ${collection}`);
    }

    console.log(`📊 Found ${data.length} records in ${collection}`);

    // Create backup file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${collection}_${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    const backup: BackupFile = {
      metadata: {
        collection,
        eventId,
        timestamp: new Date().toISOString(),
        totalRecords: data.length,
        backupVersion: '1.0',
        prismaVersion: '6.14.0',
      },
      data,
    };

    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), 'utf8');

    console.log(`✅ Backup created: ${filename}`);
    console.log(`📁 Location: ${filepath}`);
    console.log(
      `📏 File size: ${(fs.statSync(filepath).size / 1024 / 1024).toFixed(
        2
      )} MB`
    );

    return filepath;
  } catch (error) {
    console.error(`❌ Backup failed for ${collection}:`, error);
    throw error;
  }
}

async function wipeCollection(
  collection: CollectionName,
  eventId?: string
): Promise<number> {
  console.log(`🗑️ Wiping collection: ${collection}`);

  let whereClause: any = {};

  // Add event filtering if specified
  if (eventId) {
    whereClause.eventId = eventId;
  }

  try {
    let result: any;

    switch (collection) {
      case 'users':
        result = await prisma.user.deleteMany({ where: whereClause });
        break;
      case 'groups':
        result = await prisma.group.deleteMany({ where: whereClause });
        break;
      case 'events':
        result = await prisma.event.deleteMany({
          where: eventId ? { id: eventId } : {},
        });
        break;
      case 'activities':
        result = await prisma.activity.deleteMany({ where: whereClause });
        break;
      case 'admins':
        result = await prisma.admin.deleteMany();
        break;
      case 'adminEvents':
        result = await prisma.adminEvent.deleteMany();
        break;
      case 'userActivityExclusions':
        result = await prisma.userActivityExclusion.deleteMany({
          where: whereClause,
        });
        break;
      case 'emailTemplates':
        result = await prisma.emailTemplate.deleteMany({ where: whereClause });
        break;
      case 'emailTracking':
        result = await prisma.emailTracking.deleteMany();
        break;
      case 'messages':
        result = await prisma.message.deleteMany({ where: whereClause });
        break;
      case 'communicationLogs':
        result = await prisma.communicationLog.deleteMany({
          where: whereClause,
        });
        break;
      case 'migrations':
        result = await prisma.migration.deleteMany();
        break;
      default:
        throw new Error(`Unsupported collection: ${collection}`);
    }

    console.log(`🗑️ Deleted ${result.count} records from ${collection}`);
    return result.count;
  } catch (error) {
    console.error(`❌ Wipe failed for ${collection}:`, error);
    throw error;
  }
}

async function getUserConfirmation(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(
      `\n⚠️  ${prompt}\n   Confirmation required - add --force flag to skip confirmation\n`
    );

    // For now, return false to prevent accidental deletion
    // In real usage, this would wait for user input
    resolve(false);
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('Event Concierge - Backup and Wipe Tool');
    console.log('=====================================');
    console.log('');
    console.log(
      'This tool creates timestamped backups and then wipes collections.'
    );
    console.log('Backups are saved in MongoDB Compass-compatible JSON format.');
    console.log('');
    console.log('Usage:');
    console.log('  bun run backup-wipe <collection> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --event-id <id>    Filter by specific event ID');
    console.log('  --force           Skip confirmation prompts');
    console.log('');
    console.log('Available Collections:');
    const collections: CollectionName[] = [
      'users',
      'groups',
      'events',
      'activities',
      'admins',
      'adminEvents',
      'userActivityExclusions',
      'emailTemplates',
      'emailTracking',
      'messages',
      'communicationLogs',
      'migrations',
    ];
    collections.forEach((collection) => {
      console.log(`  ${collection}`);
    });
    console.log('');
    console.log('Examples:');
    console.log('  bun run backup-wipe users');
    console.log('  bun run backup-wipe users --force');
    console.log(
      '  bun run backup-wipe users --event-id 68b5aa94b9d13b18bb4694c6'
    );
    console.log('');
    console.log('Note: Always creates backup then wipes the collection');
    process.exit(0);
  }

  try {
    const collection = args[0] as CollectionName;

    const validCollections: CollectionName[] = [
      'users',
      'groups',
      'events',
      'activities',
      'admins',
      'adminEvents',
      'userActivityExclusions',
      'emailTemplates',
      'emailTracking',
      'messages',
      'communicationLogs',
      'migrations',
    ];

    if (!validCollections.includes(collection)) {
      throw new Error(
        `Invalid collection: ${collection}. Available: ${validCollections.join(
          ', '
        )}`
      );
    }

    let eventId: string | undefined;
    let force = false;

    // Parse flags
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--event-id' && args[i + 1]) {
        eventId = args[i + 1];
        i++; // Skip next arg
      } else if (args[i] === '--force') {
        force = true;
      }
    }

    console.log(`🚀 Starting backup-and-wipe operation for ${collection}`);
    if (eventId) {
      console.log(`🎯 Filtering by event: ${eventId}`);
    }

    // Backup phase - always backup first
    const backupPath = await backupCollection(collection, eventId);

    // Confirmation for wipe operations
    if (!force) {
      console.log(
        `\n⚠️  WARNING: This will permanently delete data from ${collection}`
      );
      if (eventId) {
        console.log(
          `   This will delete ${collection} data for event: ${eventId}`
        );
      } else {
        console.log(`   This will delete ALL data in ${collection}`);
      }
      console.log(`   This operation cannot be undone!`);
      console.log(`✅ Backup created at: ${backupPath}`);
      console.log(`\n⚠️  Type "DELETE" to confirm or Ctrl+C to cancel:`);

      // For script usage, exit here to require manual confirmation
      process.exit(0);
    }

    // Wipe phase - always wipe after backup
    const deletedCount = await wipeCollection(collection, eventId);

    // Summary
    console.log(`\n✅ Backup and wipe completed successfully!`);
    console.log(`📦 Backup: ${path.basename(backupPath)}`);
    console.log(`🗑️  Deleted: ${deletedCount} records`);
  } catch (error) {
    console.error('💥 Fatal error during backup/wipe operation:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
