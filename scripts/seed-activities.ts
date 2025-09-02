import { prisma } from '../src/config/database.js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const EVENT_ID = '68b5aa94b9d13b18bb4694c6'; // Our Italian Grand Prix 2025 event
const ACTIVITIES_JSON_PATH = path.join(
  process.cwd(),
  'scripts',
  'inputs',
  'test.activities.json'
);

interface ActivityInput {
  _id: { $oid: string };
  event: { $oid: string };
  group?: { $oid: string } | null;
  title: string;
  description?: string;
  startDateTime: { $date: string };
  endDateTime: { $date: string };
  thumbnail?: string;
  category: string;
  location?: {
    name: string;
    address: string;
    mapLink: string;
  };
  content: {
    html: string;
  };
  active: boolean;
  deleted: boolean;
  createdBy: { $oid: string };
  lastModifiedBy?: { $oid: string };
  createdAt: { $date: string };
  updatedAt: { $date: string };
}

// Category mapping from JSON to Prisma enum
function mapCategory(
  category: string
): 'TRANSPORT' | 'HOSPITALITY' | 'EXPERIENCE' | 'MEETING' | 'OTHER' {
  const categoryLower = category.toLowerCase();

  switch (categoryLower) {
    case 'transport':
    case 'transportation':
      return 'TRANSPORT';
    case 'hospitality':
    case 'reception':
    case 'dinner':
      return 'HOSPITALITY';
    case 'experience':
    case 'tour':
    case 'activity':
      return 'EXPERIENCE';
    case 'meeting':
    case 'conference':
    case 'interview':
      return 'MEETING';
    default:
      return 'OTHER';
  }
}

// Clean and validate title
function cleanTitle(title: string): string {
  return title.replace(/^\[EXAMPLE\]\s*/, '').trim();
}

async function main(): Promise<void> {
  console.log('🚀 Starting activities seeding from JSON...');
  console.log(`📁 Reading from: ${ACTIVITIES_JSON_PATH}`);
  console.log(`🎯 Target Event ID: ${EVENT_ID}`);

  try {
    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: EVENT_ID },
      select: { id: true, name: true },
    });

    if (!event) {
      throw new Error(`Event with ID ${EVENT_ID} not found`);
    }

    console.log(`✅ Event found: ${event.name}`);

    // Get admin to use as creator (use first super admin)
    const admin = await prisma.admin.findFirst({
      where: { role: 'SUPER', active: true },
    });

    if (!admin) {
      throw new Error('No super admin found to assign as activity creator');
    }

    console.log(
      `✅ Using admin: ${admin.firstName} ${admin.lastName} (${admin.email})`
    );

    // Read activities JSON
    if (!fs.existsSync(ACTIVITIES_JSON_PATH)) {
      throw new Error(`Activities file not found: ${ACTIVITIES_JSON_PATH}`);
    }

    const activitiesData: ActivityInput[] = JSON.parse(
      fs.readFileSync(ACTIVITIES_JSON_PATH, 'utf8')
    );
    console.log(`📊 Found ${activitiesData.length} activities to process`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    console.log('\n💾 Processing activities...');

    for (let i = 0; i < activitiesData.length; i++) {
      const activityInput = activitiesData[i];

      try {
        // Clean and transform the data
        const cleanedTitle = cleanTitle(activityInput.title);
        const mappedCategory = mapCategory(activityInput.category);

        // Convert MongoDB dates to JS dates
        const startDateTime = new Date(activityInput.startDateTime.$date);
        const endDateTime = new Date(activityInput.endDateTime.$date);
        const createdAt = new Date(activityInput.createdAt.$date);
        const updatedAt = new Date(activityInput.updatedAt.$date);

        // Skip deleted activities
        if (activityInput.deleted) {
          console.log(`⏭️  Skipping deleted activity: ${cleanedTitle}`);
          skipped++;
          continue;
        }

        // Create the activity
        const activity = await prisma.activity.create({
          data: {
            eventId: EVENT_ID,
            groupId: null, // These activities aren't assigned to specific groups
            title: cleanedTitle,
            description: activityInput.description || null,
            startDateTime,
            endDateTime,
            thumbnail: activityInput.thumbnail || null,
            category: mappedCategory,
            location: activityInput.location || null,
            content: activityInput.content,
            active: activityInput.active,
            deleted: false, // Force to false since we're skipping deleted ones
            createdBy: admin.id,
            lastModifiedBy: admin.id, // Always use our admin as modifier
            createdAt,
            updatedAt,
          },
        });

        console.log(`✅ Created: ${cleanedTitle} (${mappedCategory})`);
        created++;
      } catch (error: any) {
        console.error(
          `❌ Failed to create activity "${activityInput.title}":`,
          error.message
        );
        errors++;
      }
    }

    console.log('\n✅ Activities seeding completed!');
    console.log(`- Created: ${created} activities`);
    console.log(`- Skipped: ${skipped} activities (deleted)`);
    console.log(`- Errors: ${errors} activities`);

    if (created > 0) {
      console.log('\n📋 Created activities summary:');
      const newActivities = await prisma.activity.findMany({
        where: { eventId: EVENT_ID },
        select: {
          title: true,
          category: true,
          active: true,
          startDateTime: true,
        },
        orderBy: { startDateTime: 'asc' },
      });

      newActivities.forEach((activity, index) => {
        const date = activity.startDateTime.toLocaleDateString();
        const time = activity.startDateTime.toLocaleTimeString();
        console.log(
          `  ${index + 1}. ${activity.title} (${
            activity.category
          }) - ${date} ${time}`
        );
      });
    }
  } catch (error) {
    console.error('💥 Fatal error during activities seeding:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
