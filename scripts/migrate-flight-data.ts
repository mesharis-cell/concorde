import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Migration script to convert flight data from DateTime fields to separate date/time string fields
 * Old format: departureDateTime, arrivalDateTime (JavaScript Date objects)
 * New format: departureDate (dd/mm/yyyy), departureTime (hh:mm), arrivalDate (dd/mm/yyyy), arrivalTime (hh:mm)
 */

function formatDateString(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatTimeString(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

async function migrateFlightData() {
  console.log('🚀 Starting flight data migration...');

  const users = await prisma.user.findMany({
    where: {
      flight: { not: null },
    },
  });

  console.log(`📊 Found ${users.length} users with flight data`);

  let migratedCount = 0;

  for (const user of users) {
    const flight = user.flight as any;
    let needsUpdate = false;
    const updatedFlight = { ...flight };

    // Migrate inbound flight
    if (flight?.inbound) {
      const inbound = { ...flight.inbound };

      // Convert departureDateTime to separate fields
      if (inbound.departureDateTime) {
        const depDate = new Date(inbound.departureDateTime);
        inbound.departureDate = formatDateString(depDate);
        inbound.departureTime = formatTimeString(depDate);
        delete inbound.departureDateTime;
        needsUpdate = true;
      }

      // Convert arrivalDateTime to separate fields
      if (inbound.arrivalDateTime) {
        const arrDate = new Date(inbound.arrivalDateTime);
        inbound.arrivalDate = formatDateString(arrDate);
        inbound.arrivalTime = formatTimeString(arrDate);
        delete inbound.arrivalDateTime;
        needsUpdate = true;
      }

      updatedFlight.inbound = inbound;
    }

    // Migrate outbound flight
    if (flight?.outbound) {
      const outbound = { ...flight.outbound };

      // Convert departureDateTime to separate fields
      if (outbound.departureDateTime) {
        const depDate = new Date(outbound.departureDateTime);
        outbound.departureDate = formatDateString(depDate);
        outbound.departureTime = formatTimeString(depDate);
        delete outbound.departureDateTime;
        needsUpdate = true;
      }

      // Convert arrivalDateTime to separate fields
      if (outbound.arrivalDateTime) {
        const arrDate = new Date(outbound.arrivalDateTime);
        outbound.arrivalDate = formatDateString(arrDate);
        outbound.arrivalTime = formatTimeString(arrDate);
        delete outbound.arrivalDateTime;
        needsUpdate = true;
      }

      updatedFlight.outbound = outbound;
    }

    // Update the user if changes were made
    if (needsUpdate) {
      await prisma.user.update({
        where: { id: user.id },
        data: { flight: updatedFlight },
      });
      migratedCount++;
      console.log(`✅ Migrated user ${user.id} (${migratedCount}/${users.length})`);
    }
  }

  console.log(`🎉 Migration completed! Migrated ${migratedCount} users`);
}

async function main() {
  try {
    await migrateFlightData();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();