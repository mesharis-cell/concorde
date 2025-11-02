import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';

const migration: MigrationAction = {
  async migrate() {
    // Add mock flight data to users who don't have flight information
    const mockFlightData = {
      inbound: {
        departureFrom: 'Mock Airport',
        departureDate: '2025-05-23',
        departureTime: '14:30',
        departureTerminal: 'Terminal 1',
        flightNumber: 'MK123',
        arrivalDate: '2025-05-23',
        arrivalTime: '16:45',
        arrivalTo: 'Destination Airport',
      },
      outbound: {
        departureFrom: 'Destination Airport',
        departureDate: '2025-05-26',
        departureTime: '10:15',
        departureTerminal: 'Terminal 2',
        flightNumber: 'MK456',
        arrivalDate: '2025-05-26',
        arrivalTime: '12:30',
        arrivalTo: 'Mock Airport',
      },
    };

    // Update users who don't have flight data using MongoDB raw command
    const result = await prisma.$runCommandRaw({
      update: 'users',
      updates: [
        {
          q: {
            $or: [{ flight: null }, { flight: { $exists: false } }],
          },
          u: {
            $set: {
              flight: mockFlightData,
            },
          },
          multi: true,
        },
      ],
    });

    console.log(
      `✅ Migration completed: Added mock flight data to ${result.modifiedCount || result.nModified || 'some'
      } users`
    );
  },

  async rollback() {
    // Remove mock flight data by setting flight field back to null
    // We'll target users with our specific mock data to avoid removing real flight data
    const result = await prisma.$runCommandRaw({
      update: 'users',
      updates: [
        {
          q: {
            'flight.inbound.flightNumber': 'MK123',
          },
          u: {
            $set: {
              flight: null,
            },
          },
          multi: true,
        },
      ],
    });

    console.log(
      `✅ Migration rolled back: Removed mock flight data from ${result.modifiedCount || result.nModified || 'some'
      } users`
    );
  },
};

export default migration;
