import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';

const migration: MigrationAction = {
  async migrate() {
    // Convert old flight format to new inbound/outbound format
    // Old format: { airline, number, arrival, departure, arrivalAirport, departureAirport }
    // New format: { inbound: {...}, outbound: {...} }

    // Use MongoDB aggregation to transform the data
    const result = await prisma.$runCommandRaw({
      update: 'users',
      updates: [
        {
          q: {
            // Find users with old flight format (has "airline" field but no "inbound" field)
            $and: [
              { 'flight.airline': { $exists: true } },
              { 'flight.inbound': { $exists: false } },
            ],
          },
          u: [
            {
              $set: {
                flight: {
                  inbound: {
                    departureFrom: '$flight.departureAirport',
                    departureDate: {
                      $dateToString: {
                        format: '%Y-%m-%d',
                        date: '$flight.departure',
                      },
                    },
                    departureTime: {
                      $dateToString: {
                        format: '%H:%M',
                        date: '$flight.departure',
                      },
                    },
                    departureTerminal: 'Terminal 1',
                    flightNumber: '$flight.number',
                    arrivalDate: {
                      $dateToString: {
                        format: '%Y-%m-%d',
                        date: '$flight.arrival',
                      },
                    },
                    arrivalTime: {
                      $dateToString: {
                        format: '%H:%M',
                        date: '$flight.arrival',
                      },
                    },
                    arrivalTo: '$flight.arrivalAirport',
                  },
                  outbound: {
                    departureFrom: '$flight.arrivalAirport',
                    departureDate: {
                      $dateToString: {
                        format: '%Y-%m-%d',
                        date: '$flight.departure',
                      },
                    },
                    departureTime: {
                      $dateToString: {
                        format: '%H:%M',
                        date: '$flight.departure',
                      },
                    },
                    departureTerminal: 'Terminal 2',
                    flightNumber: { $concat: ['OUT', '$flight.number'] },
                    arrivalDate: {
                      $dateToString: {
                        format: '%Y-%m-%d',
                        date: '$flight.arrival',
                      },
                    },
                    arrivalTime: {
                      $dateToString: {
                        format: '%H:%M',
                        date: '$flight.arrival',
                      },
                    },
                    arrivalTo: '$flight.departureAirport',
                  },
                },
              },
            },
          ],
          multi: true,
        },
      ],
    });

    console.log(
      `✅ Migration completed: Converted ${result.modifiedCount || result.nModified || 'some'
      } users to inbound/outbound flight format`
    );
  },

  async rollback() {
    // Convert back from inbound/outbound format to old format
    // New format: { inbound: {...}, outbound: {...} }
    // Old format: { airline, number, arrival, departure, arrivalAirport, departureAirport }

    const result = await prisma.$runCommandRaw({
      update: 'users',
      updates: [
        {
          q: {
            // Find users with new flight format (has "inbound" field)
            'flight.inbound': { $exists: true },
          },
          u: [
            {
              $set: {
                flight: {
                  airline: 'Converted Airline',
                  number: '$flight.inbound.flightNumber',
                  arrival: {
                    $dateFromString: {
                      dateString: {
                        $concat: [
                          '$flight.inbound.arrivalDate',
                          'T',
                          '$flight.inbound.arrivalTime',
                          ':00.000Z',
                        ],
                      },
                    },
                  },
                  departure: {
                    $dateFromString: {
                      dateString: {
                        $concat: [
                          '$flight.outbound.departureDate',
                          'T',
                          '$flight.outbound.departureTime',
                          ':00.000Z',
                        ],
                      },
                    },
                  },
                  arrivalAirport: '$flight.inbound.arrivalTo',
                  departureAirport: '$flight.inbound.departureFrom',
                },
              },
            },
          ],
          multi: true,
        },
      ],
    });

    console.log(
      `✅ Migration rolled back: Converted ${result.modifiedCount || result.nModified || 'some'
      } users back to old flight format`
    );
  },
};

export default migration;
