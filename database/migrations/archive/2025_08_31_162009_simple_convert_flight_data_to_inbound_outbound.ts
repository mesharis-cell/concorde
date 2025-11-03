import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';

const migration: MigrationAction = {
  async migrate() {
    // Get all users with old flight format and convert them manually
    console.log('🔄 Converting flight data to inbound/outbound format...');

    // Find users with old flight format (has "airline" field but no "inbound")
    const usersWithOldFormat = await prisma.$runCommandRaw({
      find: 'users',
      filter: {
        $and: [
          { 'flight.airline': { $exists: true } },
          { 'flight.inbound': { $exists: false } },
        ],
      },
    });

    const users = usersWithOldFormat.cursor?.firstBatch || [];
    console.log(`📍 Found ${users.length} users with old flight format`);

    let convertedCount = 0;

    // Convert each user individually
    for (const user of users) {
      if (user.flight && user.flight.airline) {
        const oldFlight = user.flight;

        // Create new flight format with mock string values
        const newFlight = {
          inbound: {
            departureFrom:
              oldFlight.departureAirport || 'Old Departure Airport',
            departureDate: '2025-05-23',
            departureTime: '14:30',
            departureTerminal: 'Terminal 1',
            flightNumber: oldFlight.number || 'OLD123',
            arrivalDate: '2025-05-23',
            arrivalTime: '16:45',
            arrivalTo: oldFlight.arrivalAirport || 'Old Arrival Airport',
          },
          outbound: {
            departureFrom: oldFlight.arrivalAirport || 'Old Arrival Airport',
            departureDate: '2025-05-26',
            departureTime: '10:15',
            departureTerminal: 'Terminal 2',
            flightNumber: `OUT${oldFlight.number || '123'}`,
            arrivalDate: '2025-05-26',
            arrivalTime: '12:30',
            arrivalTo: oldFlight.departureAirport || 'Old Departure Airport',
          },
        };

        // Update the user with new flight format
        await prisma.$runCommandRaw({
          update: 'users',
          updates: [
            {
              q: { _id: user._id },
              u: {
                $set: { flight: newFlight },
              },
            },
          ],
        });

        convertedCount++;
        console.log(`✅ Converted user: ${user.profile?.email || 'Unknown'}`);
      }
    }

    console.log(
      `🎉 Migration completed: Converted ${convertedCount} users to inbound/outbound flight format`
    );
  },

  async rollback() {
    // Convert back to old format
    console.log('🔄 Rolling back flight data to old format...');

    const usersWithNewFormat = await prisma.$runCommandRaw({
      find: 'users',
      filter: {
        'flight.inbound': { $exists: true },
      },
    });

    const users = usersWithNewFormat.cursor?.firstBatch || [];
    console.log(`📍 Found ${users.length} users with new flight format`);

    let rolledBackCount = 0;

    for (const user of users) {
      if (user.flight && user.flight.inbound) {
        const newFlight = user.flight;

        // Create old flight format
        const oldFlight = {
          airline: 'Converted Airline',
          number: newFlight.inbound.flightNumber,
          arrival: new Date('2025-05-23T16:45:00.000Z'),
          departure: new Date('2025-05-26T10:15:00.000Z'),
          arrivalAirport: newFlight.inbound.arrivalTo,
          departureAirport: newFlight.inbound.departureFrom,
        };

        // Update the user with old flight format
        await prisma.$runCommandRaw({
          update: 'users',
          updates: [
            {
              q: { _id: user._id },
              u: {
                $set: { flight: oldFlight },
              },
            },
          ],
        });

        rolledBackCount++;
        console.log(`✅ Rolled back user: ${user.profile?.email || 'Unknown'}`);
      }
    }

    console.log(
      `🎉 Migration rolled back: Converted ${rolledBackCount} users back to old flight format`
    );
  },
};

export default migration;
