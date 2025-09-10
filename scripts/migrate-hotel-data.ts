#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateHotelData() {
  console.log('🔧 Migrating hotel data to Single Source of Truth...');

  try {
    // Get all events with hotel config
    const events = await prisma.event.findMany({
      where: {
        hotelConfig: { not: null },
      },
    });

    console.log(`Found ${events.length} events with hotel configuration`);

    for (const event of events) {
      const hotelConfig = event.hotelConfig as any;

      if (hotelConfig?.hotels) {
        console.log(`\nProcessing event: ${event.name}`);

        let migrated = false;
        const updatedHotels = hotelConfig.hotels.map((hotel: any) => {
          // Check if this hotel has the old roomTypes field
          if (hotel.roomTypes && Array.isArray(hotel.roomTypes)) {
            console.log(`  Hotel: ${hotel.name}`);
            console.log(`    Old roomTypes: [${hotel.roomTypes.join(', ')}]`);
            console.log(
              `    Contracted rooms: ${hotel.contractedRooms?.length || 0} entries`
            );

            // Clean up contractedRooms to only include valid room types
            if (hotel.contractedRooms && Array.isArray(hotel.contractedRooms)) {
              const cleanedContractedRooms = hotel.contractedRooms.filter(
                (cr: any) => hotel.roomTypes.includes(cr.roomType)
              );

              console.log(
                `    Cleaned contracted rooms: ${cleanedContractedRooms.length} entries (removed ${hotel.contractedRooms.length - cleanedContractedRooms.length} orphans)`
              );

              // Remove roomTypes field and keep cleaned contractedRooms
              const { roomTypes, ...cleanedHotel } = hotel;
              migrated = true;

              return {
                ...cleanedHotel,
                contractedRooms: cleanedContractedRooms,
              };
            }
          }

          return hotel;
        });

        if (migrated) {
          // Update the event
          await prisma.event.update({
            where: { id: event.id },
            data: {
              hotelConfig: {
                hotels: updatedHotels,
              },
            },
          });
          console.log(`  ✅ Migrated hotel data for ${event.name}`);
        } else {
          console.log(`  ⏭️  No migration needed for ${event.name}`);
        }
      }
    }

    console.log('\n✅ Hotel data migration completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateHotelData();
