import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyImport() {
  try {
    const eventId = "68c2cd941de2da411f2a2f98";

    // Count users
    const userCount = await prisma.user.count({
      where: { eventId }
    });

    // Count room assignments
    const roomAssignmentCount = await prisma.roomAssignment.count({
      where: { eventId }
    });

    // Count hotels
    const hotelCount = await prisma.hotel.count({
      where: { eventId }
    });

    // Count room types
    const roomTypeCount = await prisma.roomType.count({
      where: { eventId }
    });

    // Get some sample users
    const sampleUsers = await prisma.user.findMany({
      where: { eventId },
      take: 5,
      select: {
        id: true,
        profile: true,
        guestCategory: true,
        accommodation: true,
        roomAssignments: {
          select: {
            roomType: { select: { name: true } },
            hotel: { select: { name: true } }
          }
        }
      }
    });

    console.log('📊 Import Verification Results:');
    console.log(`✅ Users imported: ${userCount}`);
    console.log(`✅ Room assignments: ${roomAssignmentCount}`);
    console.log(`✅ Hotels created: ${hotelCount}`);
    console.log(`✅ Room types created: ${roomTypeCount}`);

    console.log('\n📋 Sample Users:');
    sampleUsers.forEach((user, index) => {
      const profile = user.profile as any;
      console.log(`${index + 1}. ${profile.firstName} ${profile.lastName} (${profile.email || 'no email'})`);
      console.log(`   Category: ${user.guestCategory || 'none'}`);
      console.log(`   Room: ${user.roomAssignments[0]?.roomType?.name || 'none'} at ${user.roomAssignments[0]?.hotel?.name || 'none'}`);
    });

  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyImport();