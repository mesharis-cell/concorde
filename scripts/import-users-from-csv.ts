#!/usr/bin/env bun

import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { prisma } from '../src/config/database.js';
import { UserService } from '../src/services/users.js';
import { AuditTrailService } from '../src/services/audit-trail.js';
import { RoomAssignmentService } from '../src/services/room-assignments.js';
import type { CreateUser } from '../src/types/index.js';

// Configuration
const EVENT_ID = '68c2cd941de2da411f2a2f98';

// Complete group mappings
const GROUP_MAPPING: Record<string, string> = {
  Singapore: '68c2cd941de2da411f2a2f99',
  Mexico: '68c2cd941de2da411f2a2f9a',
  Philippines: '68c2cd941de2da411f2a2f9b', // CSV has "Phillipines" - handled in mapping
  Thailand: '68c2cd941de2da411f2a2f9c',
  Gulf: '68c2cd941de2da411f2a2f9d',
  Indonesia: '68c2cd941de2da411f2a2f9e',
  Malaysia: '68c2cd941de2da411f2a2f9f',
  'Hong Kong': '68c2cd941de2da411f2a2fa0',
  India: '68c2cd941de2da411f2a2fa1',
  Vietnam: '68c2cd941de2da411f2a2fa2',
  Australia: '68c2cd941de2da411f2a2fa3',
  GTR: '68c2cd941de2da411f2a2fa4',
  'Global Creators': '68c2cd941de2da411f2a2fa5',
  'Global Media': '68c2cd941de2da411f2a2fa6',
  CBL: '68c854fcf2f180c94e9075ad',
  Golin: '68c85503f2f180c94e9075ae',
  INVNT: '68c85508f2f180c94e9075af',
};

interface ImportStats {
  totalRows: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  warnings: string[];
  errors: Array<{ row: number; email: string; error: string }>;
  roomAssignments: {
    attempted: number;
    successful: number;
    failed: number;
    skippedNoAccommodation: number;
    skippedInvalidRoomType: number;
    assignments: Array<{
      row: number;
      user: string;
      roomType: string;
      assignmentId: string;
    }>;
  };
}

interface CSVRow {
  [key: string]: string;
}

/**
 * Normalize string values - remove extra spaces, line breaks, trim
 */
function normalizeString(value: string | undefined): string | undefined {
  if (!value || value === 'N/A' || value === '') return undefined;
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Parse emergency contact field with various formats
 * Handles both "/" and "()" patterns
 */
function parseEmergencyContact(contactStr: string): {
  name?: string;
  relationship?: string;
} {
  if (!contactStr || contactStr === 'N/A') return {};

  const normalized = normalizeString(contactStr);
  if (!normalized) return {};

  // Pattern 1: "Name (Relationship)"
  const parenthesesMatch = normalized.match(/^([^(]+)\s*\(([^)]+)\)\s*$/);
  if (parenthesesMatch) {
    return {
      name: normalizeString(parenthesesMatch[1]),
      relationship: normalizeString(parenthesesMatch[2]),
    };
  }

  // Pattern 2: "Name / Relationship"
  const slashMatch = normalized.match(/^([^/]+)\s*\/\s*([^/]+)$/);
  if (slashMatch) {
    return {
      name: normalizeString(slashMatch[1]),
      relationship: normalizeString(slashMatch[2]),
    };
  }

  // Pattern 3: "Name, Relationship"
  const commaMatch = normalized.match(/^([^,]+)\s*,\s*([^,]+)$/);
  if (commaMatch) {
    return {
      name: normalizeString(commaMatch[1]),
      relationship: normalizeString(commaMatch[2]),
    };
  }

  // Fallback: treat as name only
  return { name: normalized };
}

/**
 * Parse date from dd/mm/yyyy or dd/mm/yy formats
 */
function parseDate(dateStr: string): Date | undefined {
  if (!dateStr || dateStr === 'N/A') return undefined;

  const normalized = normalizeString(dateStr);
  if (!normalized) return undefined;

  // Try dd/mm/yyyy format
  let match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Try dd/mm/yy format (assume 2000s)
  match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (match) {
    const [, day, month, year] = match;
    const fullYear = 2000 + parseInt(year);
    return new Date(fullYear, parseInt(month) - 1, parseInt(day));
  }

  return undefined;
}

/**
 * Format date string from dd/mm/yyyy to dd/mm/yyyy (passthrough validation)
 */
function validateDateFormat(dateStr: string): string | undefined {
  if (!dateStr || dateStr === 'N/A') return undefined;

  const normalized = normalizeString(dateStr);
  if (!normalized) return undefined;

  // Validate dd/mm/yyyy format
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    // Ensure valid day/month ranges
    const d = parseInt(day);
    const m = parseInt(month);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      // Return in consistent dd/mm/yyyy format
      return `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${year}`;
    }
  }

  return undefined;
}

/**
 * Validate time format hh:mm (24-hour)
 */
function validateTimeFormat(timeStr: string): string | undefined {
  if (!timeStr || timeStr === 'N/A') return undefined;

  const normalized = normalizeString(timeStr);
  if (!normalized) return undefined;

  // Validate hh:mm format (24-hour)
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, hours, minutes] = match;
    const h = parseInt(hours);
    const m = parseInt(minutes);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      // Return in consistent hh:mm format
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
  }

  return undefined;
}

/**
 * Convert CSV row to User data structure
 */
function mapCSVRowToUser(row: CSVRow, rowNumber: number): CreateUser | null {
  try {
    // Handle group mapping with spelling correction
    let groupName = normalizeString(row['Group']);
    if (groupName === 'Phillipines') {
      groupName = 'Philippines'; // Fix spelling
    }

    const groupId = groupName ? GROUP_MAPPING[groupName] : undefined;
    if (groupName && !groupId) {
      throw new Error(`Unknown group: "${groupName}"`);
    }

    // Parse emergency contact
    const emergencyContact = parseEmergencyContact(
      row['Emergency contact name & relationship']
    );
    const emergencyContactPhone = normalizeString(
      row['Emergency contact number']
    );
    if (emergencyContact.name || emergencyContactPhone) {
      if (emergencyContactPhone) {
        (emergencyContact as any).phone = emergencyContactPhone;
      }
    }

    // Build profile object
    const profile = {
      email: normalizeString(row['Email address'])?.toLowerCase(),
      firstName: normalizeString(row['First Name']),
      lastName: normalizeString(row['Surname']),
      phone: normalizeString(row['Contact mobile number ']), // Note trailing space in CSV header
      preferredFirstName: normalizeString(row['Nickname']),
      jobTitle: normalizeString(row['Job Title']),
      company: normalizeString(row['Company']),
      guestType: normalizeString(row['Guest type']),
      vip: row['VIP Guest'] === 'Y',
      initials: normalizeString(row['Initials for personalisation']),
      host: normalizeString(
        row['Chivas market host to keep on cc for all comms']
      ),
    };

    // Communication preferences (default both to true as requested)
    const communication = {
      emailOptIn: true,
      whatsappOptIn: true,
    };

    // Build requirements object
    const dietaryDetails = normalizeString(row['Dietary requirements']);
    const medicalDetails = normalizeString(row['Medical information']);
    const accessibilityDetails = normalizeString(
      row['Accessibility Requirements']
    );

    const requirements = {
      ...(dietaryDetails && {
        dietary: { enabled: true, details: dietaryDetails },
      }),
      ...(medicalDetails && {
        medical: { enabled: true, details: medicalDetails },
      }),
      ...(accessibilityDetails && {
        accessibility: { enabled: true, details: accessibilityDetails },
      }),
    };

    // Build accommodation object
    const accommodationRequired = row['Accommodation required '] === 'Y'; // Note trailing space
    const accommodation = accommodationRequired
      ? {
          required: true,
          hotel: normalizeString(row['Hotel name']),
          checkIn: parseDate(row['Check in date [dd/mm/yyy]']),
          checkOut: parseDate(row['Check out date [dd/mm/yyy]']),
          doubleOccupancy: {
            enabled:
              normalizeString(row['Single or Double occupancy']) === 'Double',
          },
          visaBookingRequired: row['Hotel Booking Required for Visa'] === 'Y',
        }
      : { required: false };

    // Build flight object - store date and time as separate validated string fields
    const inboundDepartureDate = validateDateFormat(
      row['Inbound Departure date [dd/mm/yyy]']
    );
    const inboundDepartureTime = validateTimeFormat(
      row['Inbound Departure time [24hr hh:mm]']
    );
    const inboundArrivalDate = validateDateFormat(
      row['Inbound Arrival date [dd/mm/yyy]']
    );
    const inboundArrivalTime = validateTimeFormat(
      row['Inbound Arrival time [24hr hh:mm]']
    );
    const outboundDepartureDate = validateDateFormat(
      row['Outbound Departure date [dd/mm/yyy]']
    );
    const outboundDepartureTime = validateTimeFormat(
      row['Outbound Departure time [24hr hh:mm]']
    );
    const outboundArrivalDate = validateDateFormat(
      row['Outbound Arrival date [dd/mm/yyy]']
    );
    const outboundArrivalTime = validateTimeFormat(
      row['Outbound Arrival time [24hr hh:mm]']
    );

    const flight = {
      ...(inboundDepartureDate && {
        inbound: {
          departureFrom: normalizeString(
            row['Inbound Departure from [station/airport]']
          ),
          departureDate: inboundDepartureDate,
          departureTime: inboundDepartureTime,
          departureTerminal: normalizeString(row['Inbound Departure terminal']),
          flightNumber: normalizeString(row['Inbound Flight number']),
          airline: normalizeString(row['Inbound Airline']),
          arrivalDate: inboundArrivalDate,
          arrivalTime: inboundArrivalTime,
          arrivalToAirport: normalizeString(
            row['Inbound Arrival to [station/airport]']
          ),
        },
      }),
      ...(outboundDepartureDate && {
        outbound: {
          departureFrom: normalizeString(
            row['Outbound Departure from [station/airport]']
          ),
          departureDate: outboundDepartureDate,
          departureTime: outboundDepartureTime,
          departureTerminal: normalizeString(
            row['Outbound Departure Terminal']
          ),
          flightNumber: normalizeString(row['Outbound Flight number']),
          airline: normalizeString(row['Outbound Airline']),
          arrivalDate: outboundArrivalDate,
          arrivalTime: outboundArrivalTime,
          arrivalToAirport: normalizeString(row['Outbound Arrival to']),
        },
      }),
    };

    // Build merchandise size
    const gender = row['Gender'];
    const size = normalizeString(row['Size requirements']);
    const merchandiseSize = {
      ...(gender === 'M' && { gender: 'Men' as const }),
      ...(gender === 'W' && { gender: 'Women' as const }),
      ...(size &&
        size !== 'N/A' && { size: size as 'XS' | 'S' | 'M' | 'L' | 'XL' }),
    };

    const userData: CreateUser = {
      eventId: EVENT_ID,
      profile,
      communication,
      ...(Object.keys(requirements).length > 0 && { requirements }),
      ...(Object.keys(flight).length > 0 && { flight }),
      ...(accommodation.required && { accommodation }),
      ...(Object.keys(merchandiseSize).length > 0 && { merchandiseSize }),
      ...(emergencyContact.name && { emergencyContact }),
    };

    return userData;
  } catch (error) {
    console.error(`Error mapping row ${rowNumber}:`, error);
    return null;
  }
}

/**
 * Import users from CSV file
 */
async function importUsersFromCSV(
  filePath: string,
  performedBy: string
): Promise<ImportStats> {
  const stats: ImportStats = {
    totalRows: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    warnings: [],
    errors: [],
    roomAssignments: {
      attempted: 0,
      successful: 0,
      failed: 0,
      skippedNoAccommodation: 0,
      skippedInvalidRoomType: 0,
      assignments: [],
    },
  };

  return new Promise((resolve, reject) => {
    const rows: CSVRow[] = [];

    createReadStream(filePath)
      .pipe(csv())
      .on('data', (row: CSVRow) => {
        rows.push(row);
        stats.totalRows++;
      })
      .on('end', async () => {
        console.log(`ðŸ“Š Found ${stats.totalRows} rows to process`);

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowNumber = i + 2; // +2 because CSV is 1-indexed and we skip header
          stats.processed++;

          // Skip rows without names - names are required
          if (!row['First Name'] && !row['Surname']) {
            stats.skipped++;
            console.log(`â­ï¸  Row ${rowNumber}: Skipped (no name)`);
            continue;
          }

          try {
            const userData = mapCSVRowToUser(row, rowNumber);
            if (!userData) {
              stats.failed++;
              continue;
            }

            // Allow duplicate emails - create user directly with Prisma to bypass service validation
            let user;
            try {
              user = await UserService.create(userData, performedBy);
            } catch (error: any) {
              // If it's a duplicate email error, create directly with Prisma
              if (error.message.includes('already exists in this event')) {
                user = await prisma.user.create({
                  data: {
                    eventId: userData.eventId,
                    groupIds: [],
                    profile: userData.profile,
                    communication: userData.communication,
                    flight: userData.flight,
                    accommodation: userData.accommodation,
                    transferRequirements: userData.transferRequirements,
                    requirements: userData.requirements,
                    merchandiseSize: userData.merchandiseSize,
                    emergencyContact: userData.emergencyContact,
                  },
                });

                // Log audit trail manually since we bypassed the service
                if (performedBy) {
                  await AuditTrailService.logCreate(
                    'User',
                    user.id,
                    {
                      email: userData.profile?.email,
                      firstName: userData.profile?.firstName,
                      lastName: userData.profile?.lastName,
                      eventId: userData.eventId,
                    },
                    performedBy,
                    userData.eventId
                  );
                }
              } else {
                throw error; // Re-throw other errors
              }
            }

            // Assign to group if group mapping exists
            const groupName = normalizeString(row['Group']);
            const correctedGroupName =
              groupName === 'Phillipines' ? 'Philippines' : groupName;
            const groupId = correctedGroupName
              ? GROUP_MAPPING[correctedGroupName]
              : undefined;

            if (groupId) {
              await UserService.assignToGroups(user.id, [groupId], performedBy);
            }

            // Handle room assignment with detailed logging
            const roomCategory = normalizeString(row['Room catagory']); // Note: "catagory" spelling in CSV
            const validRoomTypes = ['Signature King', 'Shophouse suite'];
            const accommodationRequired = userData.accommodation?.required;
            const userEmail =
              userData.profile?.email ||
              userData.profile?.firstName ||
              'Unknown';

            console.log(
              `ðŸ¨ Row ${rowNumber} (${userEmail}): Room assignment analysis:`
            );
            console.log(
              `   - Accommodation required: ${accommodationRequired}`
            );
            console.log(
              `   - Room category in CSV: "${roomCategory || 'EMPTY'}"`
            );
            console.log(
              `   - Valid room type: ${roomCategory ? validRoomTypes.includes(roomCategory) : false}`
            );

            if (
              accommodationRequired &&
              roomCategory &&
              validRoomTypes.includes(roomCategory)
            ) {
              stats.roomAssignments.attempted++;
              try {
                console.log(
                  `   - âœ… ATTEMPTING room assignment: ${roomCategory}`
                );
                const roomAssignment = await RoomAssignmentService.assignRoom({
                  userId: user.id,
                  eventId: EVENT_ID,
                  roomType: roomCategory,
                  assignedBy: performedBy,
                  status: 'assigned',
                });
                stats.roomAssignments.successful++;
                stats.roomAssignments.assignments.push({
                  row: rowNumber,
                  user: userEmail,
                  roomType: roomCategory,
                  assignmentId: roomAssignment.id,
                });
                console.log(
                  `   - âœ… SUCCESS: Room assigned! Assignment ID: ${roomAssignment.id}`
                );
                console.log(
                  `ðŸ¨ Row ${rowNumber}: âœ… SUCCESSFULLY assigned ${roomCategory} room to ${userEmail}`
                );
              } catch (roomError: any) {
                stats.roomAssignments.failed++;
                console.log(`   - âŒ FAILED: ${roomError.message}`);
                console.warn(
                  `âš ï¸  Row ${rowNumber}: Room assignment FAILED - ${roomError.message}`
                );
                stats.warnings.push(
                  `Row ${rowNumber}: Room assignment failed for ${roomCategory} - ${roomError.message}`
                );
              }
            } else {
              let reason = 'No room assignment - ';
              if (!accommodationRequired) {
                reason += 'accommodation not required';
                stats.roomAssignments.skippedNoAccommodation++;
              } else if (!roomCategory) {
                reason += 'no room category specified';
                stats.roomAssignments.skippedInvalidRoomType++;
              } else if (!validRoomTypes.includes(roomCategory)) {
                reason += `invalid room type "${roomCategory}"`;
                stats.roomAssignments.skippedInvalidRoomType++;
              }

              console.log(`   - â­ï¸  SKIPPED: ${reason}`);
              console.log(
                `ðŸ¨ Row ${rowNumber}: â­ï¸  NO room assignment for ${userEmail} - ${reason}`
              );
            }

            stats.successful++;
            console.log(
              `âœ… Row ${rowNumber}: Created user ${userData.profile?.email || userData.profile?.firstName || 'Unknown'}`
            );
          } catch (error: any) {
            stats.failed++;
            const email = row['Email address'] || 'No email';
            stats.errors.push({
              row: rowNumber,
              email,
              error: error.message,
            });
            console.error(
              `âŒ Row ${rowNumber}: Failed to create user - ${error.message}`
            );
          }
        }

        // Log audit trail for bulk import
        const { ObjectId } = await import('mongodb');
        await AuditTrailService.log({
          action: 'IMPORT',
          resourceType: 'BulkOperation',
          resourceId: new ObjectId().toString(),
          eventId: EVENT_ID,
          performedBy,
          performedByType: 'ADMIN',
          summary: `Bulk CSV import: ${stats.successful} users created, ${stats.roomAssignments.successful} rooms assigned, ${stats.failed} failed, ${stats.skipped} skipped`,
          metadata: {
            bulkOperation: {
              totalItems: stats.totalRows,
              successCount: stats.successful,
              failedCount: stats.failed,
              fileName: filePath.split('/').pop(),
            },
            additionalContext: {
              skipped: stats.skipped,
              warningCount: stats.warnings.length,
              errorCount: stats.errors.length,
              roomAssignments: {
                attempted: stats.roomAssignments.attempted,
                successful: stats.roomAssignments.successful,
                failed: stats.roomAssignments.failed,
                skippedNoAccommodation:
                  stats.roomAssignments.skippedNoAccommodation,
                skippedInvalidRoomType:
                  stats.roomAssignments.skippedInvalidRoomType,
              },
            },
          },
        });

        resolve(stats);
      })
      .on('error', reject);
  });
}

/**
 * Main execution
 */
async function main() {
  const filePath = process.argv[2];
  const adminId = process.argv[3];

  if (!filePath) {
    console.error('âŒ Error: CSV file path is required');
    console.log('\nðŸ“ Usage:');
    console.log(
      '  bun scripts/import-users-from-csv.ts path/to/file.csv [adminId]'
    );
    process.exit(1);
  }

  if (!adminId) {
    console.error('âŒ Error: Admin ID is required for audit trail');
    console.log('\nðŸ“ Usage:');
    console.log(
      '  bun scripts/import-users-from-csv.ts path/to/file.csv adminId'
    );
    process.exit(1);
  }

  try {
    console.log('ðŸš€ Starting CSV user import...');
    console.log(`ðŸ“ File: ${filePath}`);
    console.log(`ðŸ‘¤ Performed by: ${adminId}`);
    console.log(`ðŸŽ¯ Event: ${EVENT_ID}`);
    console.log('');

    const stats = await importUsersFromCSV(filePath, adminId);

    console.log('\nðŸ“Š Import Summary:');
    console.log(`   Total rows: ${stats.totalRows}`);
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   âœ… Successful: ${stats.successful}`);
    console.log(`   âŒ Failed: ${stats.failed}`);
    console.log(`   â­ï¸  Skipped: ${stats.skipped}`);
    console.log(`   âš ï¸  Warnings: ${stats.warnings.length}`);

    console.log('\nðŸ¨ Room Assignment Summary:');
    console.log(`   ðŸŽ¯ Attempted: ${stats.roomAssignments.attempted}`);
    console.log(`   âœ… Successful: ${stats.roomAssignments.successful}`);
    console.log(`   âŒ Failed: ${stats.roomAssignments.failed}`);
    console.log(
      `   â­ï¸  Skipped (No Accommodation): ${stats.roomAssignments.skippedNoAccommodation}`
    );
    console.log(
      `   â­ï¸  Skipped (Invalid Room Type): ${stats.roomAssignments.skippedInvalidRoomType}`
    );

    if (stats.roomAssignments.assignments.length > 0) {
      console.log('\nðŸ¨ Successful Room Assignments:');
      stats.roomAssignments.assignments.forEach((assignment) =>
        console.log(
          `   Row ${assignment.row}: ${assignment.user} â†’ ${assignment.roomType} (ID: ${assignment.assignmentId})`
        )
      );
    }

    if (stats.warnings.length > 0) {
      console.log('\nâš ï¸  Warnings:');
      stats.warnings.forEach((warning) => console.log(`   ${warning}`));
    }

    if (stats.errors.length > 0) {
      console.log('\nâŒ Errors:');
      stats.errors.forEach((error) =>
        console.log(`   Row ${error.row} (${error.email}): ${error.error}`)
      );
    }

    console.log('\nðŸŽ‰ Import completed!');
  } catch (error) {
    console.error('âŒ Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (import.meta.main) {
  await main();
}

export {
  importUsersFromCSV,
  mapCSVRowToUser,
  parseEmergencyContact,
  parseDate,
  validateDateFormat,
  validateTimeFormat,
};
