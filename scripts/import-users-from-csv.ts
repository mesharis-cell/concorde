#!/usr/bin/env bun

import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { prisma } from '../src/config/database.js';
import { UserService } from '../src/services/users.js';
import { AuditTrailService } from '../src/services/audit-trail.js';
import type { CreateUser } from '../src/types/index.js';

// Configuration
const EVENT_ID = '68c2cd941de2da411f2a2f98';

// Complete group mappings
const GROUP_MAPPING: Record<string, string> = {
    'Singapore': '68c2cd941de2da411f2a2f99',
    'Mexico': '68c2cd941de2da411f2a2f9a',
    'Philippines': '68c2cd941de2da411f2a2f9b', // CSV has "Phillipines" - handled in mapping
    'Thailand': '68c2cd941de2da411f2a2f9c',
    'Gulf': '68c2cd941de2da411f2a2f9d',
    'Indonesia': '68c2cd941de2da411f2a2f9e',
    'Malaysia': '68c2cd941de2da411f2a2f9f',
    'Hong Kong': '68c2cd941de2da411f2a2fa0',
    'India': '68c2cd941de2da411f2a2fa1',
    'Vietnam': '68c2cd941de2da411f2a2fa2',
    'Australia': '68c2cd941de2da411f2a2fa3',
    'GTR': '68c2cd941de2da411f2a2fa4',
    'Global Creators': '68c2cd941de2da411f2a2fa5',
    'Global Media': '68c2cd941de2da411f2a2fa6',
    'CBL': '68c854fcf2f180c94e9075ad',
    'Golin': '68c85503f2f180c94e9075ae',
    'INVNT': '68c85508f2f180c94e9075af',
};

interface ImportStats {
    totalRows: number;
    processed: number;
    successful: number;
    failed: number;
    skipped: number;
    warnings: string[];
    errors: Array<{ row: number; email: string; error: string }>;
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
function parseEmergencyContact(contactStr: string): { name?: string; relationship?: string } {
    if (!contactStr || contactStr === 'N/A') return {};

    const normalized = normalizeString(contactStr);
    if (!normalized) return {};

    // Pattern 1: "Name (Relationship)"
    const parenthesesMatch = normalized.match(/^([^(]+)\s*\(([^)]+)\)\s*$/);
    if (parenthesesMatch) {
        return {
            name: normalizeString(parenthesesMatch[1]),
            relationship: normalizeString(parenthesesMatch[2])
        };
    }

    // Pattern 2: "Name / Relationship" 
    const slashMatch = normalized.match(/^([^/]+)\s*\/\s*([^/]+)$/);
    if (slashMatch) {
        return {
            name: normalizeString(slashMatch[1]),
            relationship: normalizeString(slashMatch[2])
        };
    }

    // Pattern 3: "Name, Relationship"
    const commaMatch = normalized.match(/^([^,]+)\s*,\s*([^,]+)$/);
    if (commaMatch) {
        return {
            name: normalizeString(commaMatch[1]),
            relationship: normalizeString(commaMatch[2])
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
 * Parse datetime from separate date and time fields
 */
function parseDateTime(dateStr: string, timeStr: string): Date | undefined {
    const date = parseDate(dateStr);
    if (!date) return undefined;

    if (!timeStr || timeStr === 'N/A') return date;

    const timeNormalized = normalizeString(timeStr);
    if (!timeNormalized) return date;

    // Parse 24-hour time format (hh:mm)
    const timeMatch = timeNormalized.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
        const [, hours, minutes] = timeMatch;
        date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    }

    return date;
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
        const emergencyContact = parseEmergencyContact(row['Emergency contact name & relationship']);
        const emergencyContactPhone = normalizeString(row['Emergency contact number']);
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
            host: normalizeString(row['Chivas market host to keep on cc for all comms']),
        };

        // Communication preferences (default both to true as requested)
        const communication = {
            emailOptIn: true,
            whatsappOptIn: true,
        };

        // Build requirements object
        const dietaryDetails = normalizeString(row['Dietary requirements']);
        const medicalDetails = normalizeString(row['Medical information']);
        const accessibilityDetails = normalizeString(row['Accessibility Requirements']);

        const requirements = {
            ...(dietaryDetails && {
                dietary: { enabled: true, details: dietaryDetails }
            }),
            ...(medicalDetails && {
                medical: { enabled: true, details: medicalDetails }
            }),
            ...(accessibilityDetails && {
                accessibility: { enabled: true, details: accessibilityDetails }
            }),
        };

        // Build accommodation object
        const accommodationRequired = row['Accommodation required '] === 'Y'; // Note trailing space
        const accommodation = accommodationRequired ? {
            required: true,
            hotel: normalizeString(row['Hotel name']),
            checkIn: parseDate(row['Check in date [dd/mm/yyy]']),
            checkOut: parseDate(row['Check out date [dd/mm/yyy]']),
            doubleOccupancy: {
                enabled: normalizeString(row['Single or Double occupancy']) === 'Double',
            },
            visaBookingRequired: row['Hotel Booking Required for Visa'] === 'Y',
        } : { required: false };

        // Build flight object
        const inboundDepartureDate = row['Inbound Departure date [dd/mm/yyy]'];
        const inboundDepartureTime = row['Inbound Departure time [24hr hh:mm]'];
        const inboundArrivalDate = row['Inbound Arrival date [dd/mm/yyy]'];
        const inboundArrivalTime = row['Inbound Arrival time [24hr hh:mm]'];
        const outboundDepartureDate = row['Outbound Departure date [dd/mm/yyy]'];
        const outboundDepartureTime = row['Outbound Departure time [24hr hh:mm]'];

        const flight = {
            ...(inboundDepartureDate && {
                inbound: {
                    departureFrom: normalizeString(row['Inbound Departure from [station/airport]']),
                    departureDateTime: parseDateTime(inboundDepartureDate, inboundDepartureTime),
                    departureTerminal: normalizeString(row['Inbound Departure terminal']),
                    flightNumber: normalizeString(row['Inbound Flight number']),
                    arrivalDateTime: parseDateTime(inboundArrivalDate, inboundArrivalTime),
                    arrivalToAirport: normalizeString(row['Inbound Arrival to [station/airport]']),
                }
            }),
            ...(outboundDepartureDate && {
                outbound: {
                    departureFrom: normalizeString(row['Outbound Departure from [station/airport]']),
                    departureDateTime: parseDateTime(outboundDepartureDate, outboundDepartureTime),
                    departureTerminal: normalizeString(row['Outbound Departure Terminal']),
                    flightNumber: normalizeString(row['Outbound Flight number']),
                    arrivalToAirport: normalizeString(row['Outbound Arrival to']),
                }
            }),
        };

        // Build merchandise size
        const gender = row['Gender'];
        const size = normalizeString(row['Size requirements']);
        const merchandiseSize = {
            ...(gender === 'M' && { gender: 'Men' as const }),
            ...(gender === 'W' && { gender: 'Women' as const }),
            ...(size && size !== 'N/A' && { size: size as 'XS' | 'S' | 'M' | 'L' | 'XL' }),
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
async function importUsersFromCSV(filePath: string, performedBy: string): Promise<ImportStats> {
    const stats: ImportStats = {
        totalRows: 0,
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        warnings: [],
        errors: [],
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
                console.log(`📊 Found ${stats.totalRows} rows to process`);

                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const rowNumber = i + 2; // +2 because CSV is 1-indexed and we skip header
                    stats.processed++;

                    // Skip rows without names - names are required
                    if (!row['First Name'] && !row['Surname']) {
                        stats.skipped++;
                        console.log(`⏭️  Row ${rowNumber}: Skipped (no name)`);
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
                        const correctedGroupName = groupName === 'Phillipines' ? 'Philippines' : groupName;
                        const groupId = correctedGroupName ? GROUP_MAPPING[correctedGroupName] : undefined;

                        if (groupId) {
                            await UserService.assignToGroups(user.id, [groupId], performedBy);
                        }

                        stats.successful++;
                        console.log(`✅ Row ${rowNumber}: Created user ${userData.profile?.email || userData.profile?.firstName || 'Unknown'}`);

                    } catch (error: any) {
                        stats.failed++;
                        const email = row['Email address'] || 'No email';
                        stats.errors.push({
                            row: rowNumber,
                            email,
                            error: error.message
                        });
                        console.error(`❌ Row ${rowNumber}: Failed to create user - ${error.message}`);
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
                    summary: `Bulk CSV import: ${stats.successful} users created, ${stats.failed} failed, ${stats.skipped} skipped`,
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
                        }
                    }
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
        console.error('❌ Error: CSV file path is required');
        console.log('\n📝 Usage:');
        console.log('  bun scripts/import-users-from-csv.ts path/to/file.csv [adminId]');
        process.exit(1);
    }

    if (!adminId) {
        console.error('❌ Error: Admin ID is required for audit trail');
        console.log('\n📝 Usage:');
        console.log('  bun scripts/import-users-from-csv.ts path/to/file.csv adminId');
        process.exit(1);
    }

    try {
        console.log('🚀 Starting CSV user import...');
        console.log(`📁 File: ${filePath}`);
        console.log(`👤 Performed by: ${adminId}`);
        console.log(`🎯 Event: ${EVENT_ID}`);
        console.log('');

        const stats = await importUsersFromCSV(filePath, adminId);

        console.log('\n📊 Import Summary:');
        console.log(`   Total rows: ${stats.totalRows}`);
        console.log(`   Processed: ${stats.processed}`);
        console.log(`   ✅ Successful: ${stats.successful}`);
        console.log(`   ❌ Failed: ${stats.failed}`);
        console.log(`   ⏭️  Skipped: ${stats.skipped}`);
        console.log(`   ⚠️  Warnings: ${stats.warnings.length}`);

        if (stats.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            stats.warnings.forEach(warning => console.log(`   ${warning}`));
        }

        if (stats.errors.length > 0) {
            console.log('\n❌ Errors:');
            stats.errors.forEach(error =>
                console.log(`   Row ${error.row} (${error.email}): ${error.error}`)
            );
        }

        console.log('\n🎉 Import completed!');

    } catch (error) {
        console.error('❌ Import failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run if called directly
if (import.meta.main) {
    await main();
}

export { importUsersFromCSV, mapCSVRowToUser, parseEmergencyContact, parseDate, parseDateTime };
