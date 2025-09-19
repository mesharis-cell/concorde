import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcrypt';
import * as dateFnsTz from 'date-fns-tz';
import * as ExcelJS from 'exceljs';
import { RoomAssignmentService } from '../src/services/room-assignments.js';
import { GroupService } from '../src/services/groups.js';

const prisma = new PrismaClient({
  log: ['error']
});

// Event timezone for proper date handling
const EVENT_TIMEZONE = 'Asia/Singapore';

// Dynamic group cache for created groups
const groupCache = new Map<string, string>();

interface CSVRow {
  market: string;
  firstName: string;
  lastName: string;
  nickname: string;
  jobTitle: string;
  company: string;
  guestType: string;
  vipGuest: string;
  email: string;
  contactMobile: string;
  host: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  gender: string;
  sizeRequirements: string;
  initials: string;
  accessibilityRequirements: string;
  dietaryRequirements: string;
  medicalInformation: string;
  transportMode: string;
  inboundDepartureFrom: string;
  inboundDepartureDate: string;
  inboundDepartureTime: string;
  inboundDepartureTerminal: string;
  inboundFlightNumber: string;
  connectingFlight: string;
  inboundArrivalDate: string;
  inboundArrivalTime: string;
  inboundArrivalTo: string;
  transportRequired: string;
  outboundDepartureFrom: string;
  outboundDepartureDate: string;
  outboundDepartureTime: string;
  outboundDepartureTerminal: string;
  outboundFlightNumber: string;
  outboundArrivalTo: string;
  accommodationRequired: string;
  hotelName: string;
  roomCategory: string;
  occupancy: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfNights: string;
  hotelBookingForVisa: string;
  notes: string;
}

// Helper to generate MongoDB ObjectId
const generateObjectId = (): string => {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const random = Math.random().toString(16).substring(2, 18).padStart(16, '0');
  return timestamp + random.substring(0, 16);
};

// Event configuration
const eventConfig = {
  _id: "68c2cd941de2da411f2a2f98",
  active: true,
  config: {
    micrositeUrl: "https://events.company.com/sgp2025",
    registrationOpen: true
  },
  dateRange: {
    start: "2025-09-28T17:00:00.000Z",
    end: "2025-10-05T16:00:00.000Z"
  },
  location: {
    city: "Singapore",
    country: "Singapore",
    venue: "Marina Bay Street Circuit",
    timezone: "Asia/Singapore"
  },
  name: "Singapore Grand Prix 2025",
  shortName: "SGP2025"
};

const hotelConfig = {
  name: "Mondrian Singapore Duxton",
  isDefault: true,
  checkInTime: "15:00",
  checkOutTime: "12:00",
  address: "",
  phone: "",
  email: ""
};

const roomTypes = [
  {
    name: "Signature King",
    description: "Spacious king room with city views",
    basePrice: 0
  },
  {
    name: "Signature Twin",
    description: "Twin beds with city views",
    basePrice: 0
  },
  {
    name: "Shophouse suite",
    description: "Premium suite in heritage shophouse",
    basePrice: 0
  }
];

// Helper functions
const parseDate = (dateStr: string): Date | null => {
  if (!dateStr || dateStr === 'N/A' || dateStr.trim() === '' || dateStr.includes('*') || dateStr.includes('[')) return null;

  // Handle dd/mm/yyyy format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // Month is 0-indexed
    const year = parseInt(parts[2]);

    // Validate date components
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    // Handle 2-digit years
    const fullYear = year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year;

    // 🎯 TIMEZONE FIX: Create date at noon Singapore time to avoid boundary issues
    const singaporeDate = new Date(fullYear, month, day, 12, 0, 0);

    // Check if date is valid
    if (isNaN(singaporeDate.getTime())) return null;

    // 🎯 CRITICAL: Convert Singapore time to UTC for consistent storage
    return dateFnsTz.fromZonedTime(singaporeDate, EVENT_TIMEZONE);
  }

  return null;
};

const parseTime = (timeStr: string): string => {
  if (!timeStr || timeStr === 'N/A' || timeStr.trim() === '') return '';
  return timeStr.trim();
};

const convertGender = (genderStr: string): string => {
  if (!genderStr || genderStr === 'N/A') return '';
  return genderStr === 'M' ? 'Men' : genderStr === 'W' ? 'Women' : genderStr;
};

const parseYesNo = (value: string): boolean => {
  return value === 'Y' || value === 'Yes' || value === 'yes' || value === 'TRUE' || value === 'true';
};

const cleanValue = (value: string): string | null => {
  if (!value || value === 'N/A' || value === '' || value === 'N/a') return null;
  return value.trim();
};

/**
 * Get or create a group for the given market name
 */
async function getOrCreateGroup(marketName: string, eventId: string, adminId: string): Promise<string> {
  // Check cache first
  if (groupCache.has(marketName)) {
    return groupCache.get(marketName)!;
  }

  try {
    // Check if group already exists
    const existingGroup = await prisma.group.findFirst({
      where: {
        eventId: eventId,
        name: marketName,
        active: true,
      },
    });

    if (existingGroup) {
      console.log(`🔍 Found existing group: "${marketName}" (${existingGroup.id})`);
      groupCache.set(marketName, existingGroup.id);
      return existingGroup.id;
    }

    // Create new group
    console.log(`✨ Creating new group: "${marketName}"`);
    const newGroup = await GroupService.create({
      eventId: eventId,
      name: marketName,
      description: `Market group: ${marketName}`,
    });

    groupCache.set(marketName, newGroup.id);
    console.log(`✅ Created group: "${marketName}" (${newGroup.id})`);
    return newGroup.id;
  } catch (error: any) {
    console.error(`❌ Failed to get/create group "${marketName}":`, error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Starting CSV import process...');

    // Step 1: Create the event
    console.log('📅 Creating event...');
    const event = await prisma.event.create({
      data: {
        id: eventConfig._id,
        name: eventConfig.name,
        shortName: eventConfig.shortName,
        location: eventConfig.location,
        dateRange: {
          start: "2025-09-28T17:00:00.000Z",
          end: "2025-10-05T16:00:00.000Z"
        },
        config: eventConfig.config,
        hotelConfig: null, // Will be populated when we create hotels
        roomDrops: { drops: [] },
        guestCategories: {
          categories: ["CBL", "Global Creators", "Global Media", "Chivas market host", "Cultural Creator", "Media", "Trade", "CEO", "APAC CODI", "Agent/Manager", "Cultural creator"]
        },
        termsConditions: `
          <h2>Event Terms and Conditions</h2>`,
        privacyPolicy: `
          <h2>Privacy Policy</h2>`,
        active: true
      }
    });
    console.log('✅ Event created:', event.name);

    // Step 2: Create super admin for assignments
    const passwordHash = await bcrypt.hash('admin123', 12);
    console.log('👤 Creating super admin...');
    const superAdmin = await prisma.admin.create({
      data: {
        email: 'meshari.s@homeofpmg.com',
        firstName: 'System',
        lastName: 'Administrator',
        role: 'SUPER',
        passwordHash: passwordHash, // Placeholder password hash
        active: true,
        adminEvents: {
          create: {
            eventId: event.id
          }
        }
      }
    });
    console.log('✅ Super admin created:', superAdmin.email);

    // Step 3: Create default hotel
    console.log('🏨 Creating hotel...');
    const hotel = await prisma.hotel.create({
      data: {
        eventId: event.id,
        name: hotelConfig.name,
        isDefault: hotelConfig.isDefault,
        checkInTime: hotelConfig.checkInTime,
        checkOutTime: hotelConfig.checkOutTime,
        address: hotelConfig.address,
        phone: hotelConfig.phone,
        email: hotelConfig.email,
        active: true
      }
    });
    console.log('✅ Hotel created:', hotel.name);

    // Step 3: Create room types
    console.log('🛏️ Creating room types...');
    const createdRoomTypes: any[] = [];
    for (const roomType of roomTypes) {
      const created = await prisma.roomType.create({
        data: {
          eventId: event.id,
          hotelId: hotel.id,
          name: roomType.name,
          description: roomType.description,
          maxOccupancy: 2, // Default value for schema compatibility
          basePrice: roomType.basePrice,
          amenities: [],
          active: true
        }
      });
      createdRoomTypes.push(created);
      console.log(`✅ Room type created: ${created.name}`);
    }

    // Step 4: Update event with hotel configuration BEFORE importing users
    console.log('🔄 Setting up hotel configuration with room matrix...');
    await prisma.event.update({
      where: { id: event.id },
      data: {
        hotelConfig: {
          hotels: [{
            name: hotel.name,
            isDefault: hotel.isDefault,
            checkInTime: hotel.checkInTime,
            checkOutTime: hotel.checkOutTime,
            contractedRooms: [
              // Signature King rooms
              { date: "25/09/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "26/09/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "27/09/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "29/09/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "30/09/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "01/10/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "02/10/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "03/10/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "04/10/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "05/10/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "06/10/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              // Signature Twin rooms
              { date: "25/09/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "26/09/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "27/09/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "28/09/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "29/09/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "30/09/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "01/10/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "02/10/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "03/10/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "04/10/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "05/10/2025", roomType: "Signature Twin", quantity: 15, allocated: 0 },
              { date: "06/10/2025", roomType: "Signature Twin", quantity: 15, allocated: 0 },
              // Shophouse suite rooms
              { date: "25/09/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "26/09/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "27/09/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "28/09/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "30/09/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "01/10/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "02/10/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "03/10/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "04/10/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "05/10/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "06/10/2025", roomType: "Shophouse suite", quantity: 2, allocated: 0 },
            ]
          }]
        }
      }
    });
    console.log('✅ Hotel configuration set up successfully');

    // Step 5: Read and parse CSV
    console.log('📄 Reading CSV file...');
    const csvPath = path.join(process.cwd(), '.project/reports/data/prod.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const records = parse(csvContent, {
      columns: [
        'market', 'firstName', 'lastName', 'nickname', 'jobTitle', 'company', 'guestType',
        'vipGuest', 'email', 'contactMobile', 'host', 'emergencyContactName',
        'emergencyContactNumber', 'gender', 'sizeRequirements', 'initials',
        'accessibilityRequirements', 'dietaryRequirements', 'medicalInformation',
        'transportMode', 'inboundDepartureFrom', 'inboundDepartureDate',
        'inboundDepartureTime', 'inboundDepartureTerminal', 'inboundFlightNumber',
        'connectingFlight', 'inboundArrivalDate', 'inboundArrivalTime',
        'inboundArrivalTo', 'transportRequired', 'outboundDepartureFrom',
        'outboundDepartureDate', 'outboundDepartureTime', 'outboundDepartureTerminal',
        'outboundFlightNumber', 'outboundArrivalTo', 'accommodationRequired',
        'hotelName', 'roomCategory', 'occupancy', 'checkInDate', 'checkOutDate',
        'numberOfNights', 'hotelBookingForVisa', 'notes'
      ],
      skip_empty_lines: true,
      trim: true,
      from_line: 2 // Skip header row
    }) as CSVRow[];

    console.log(`📊 Found ${records.length} records to import`);

    // Step 5: Import users
    let imported = 0;
    let skipped = 0;
    const successfulImports: CSVRow[] = [];
    const failedImports: Array<{ record: CSVRow; error: string; rowNumber: number }> = [];
    const skippedImports: Array<{ record: CSVRow; reason: string; rowNumber: number }> = [];

    for (const record of records) {
      const rowNumber = records.indexOf(record) + 2;
      try {
        // Skip empty rows or rows without names
        if (!record.firstName && !record.lastName) {
          console.log(`⏭️ Skipping empty, row number: ${rowNumber}`);
          skippedImports.push({
            record,
            reason: 'Empty row - missing first name and last name',
            rowNumber
          });
          skipped++;
          continue;
        }

        // Parse dates and convert to dd/MM/yyyy string format
        const checkInDate = parseDate(record.checkInDate);
        const checkOutDate = parseDate(record.checkOutDate);

        // Format dates as dd/MM/yyyy strings for room matrix compatibility
        const checkInFormatted = checkInDate ?
          `${checkInDate.getDate().toString().padStart(2, '0')}/${(checkInDate.getMonth() + 1).toString().padStart(2, '0')}/${checkInDate.getFullYear()}`
          : undefined;
        const checkOutFormatted = checkOutDate ?
          `${checkOutDate.getDate().toString().padStart(2, '0')}/${(checkOutDate.getMonth() + 1).toString().padStart(2, '0')}/${checkOutDate.getFullYear()}`
          : undefined;

        // Calculate nights count from string or provided number
        let nightsCount = 0;
        if (record.numberOfNights && record.numberOfNights !== 'N/A') {
          nightsCount = parseInt(record.numberOfNights) || 0;
        }

        // ALLOW DUPLICATE USERS
        // Check for duplicate users early (track as skipped rather than failed)
        // const emailToCheck = cleanValue(record.email);
        // if (emailToCheck) {
        //   const users = await prisma.user.findMany({
        //     where: { eventId: event.id, active: true },
        //   });

        //   const duplicate = users.find((user) => {
        //     const profile = user.profile as any;
        //     return profile?.email?.toLowerCase() === emailToCheck.toLowerCase();
        //   });

        //   if (duplicate) {
        //     console.log(`⏭️ Skipping duplicate user: ${emailToCheck}`);
        //     skippedImports.push({
        //       record,
        //       reason: `Duplicate email address: ${emailToCheck}`,
        //       rowNumber
        //     });
        //     skipped++;
        //     continue;
        //   }
        // }

        // Create user data structure
        const userData = {
          eventId: event.id,
          profile: {
            firstName: cleanValue(record.firstName) || undefined,
            lastName: cleanValue(record.lastName) || undefined,
            preferredFirstName: cleanValue(record.nickname) || undefined,
            email: cleanValue(record.email) || undefined,
            phone: cleanValue(record.contactMobile) || undefined,
            jobTitle: cleanValue(record.jobTitle) || undefined,
            company: cleanValue(record.company) || undefined,
            guestType: cleanValue(record.guestType) || undefined,
            vip: parseYesNo(record.vipGuest),
            initials: cleanValue(record.initials) || undefined,
            host: cleanValue(record.host) || undefined
          },
          communication: {
            emailOptIn: true,
            whatsappOptIn: false
          },
          guestCategory: cleanValue(record.guestType) || undefined,
          ticketNumbers: [],
          merchandiseSize: {
            gender: convertGender(record.gender),
            size: cleanValue(record.sizeRequirements) || undefined
          },
          accommodation: {
            required: parseYesNo(record.accommodationRequired),
            hotel: cleanValue(record.hotelName) || undefined,
            roomType: cleanValue(record.roomCategory) || undefined,
            checkIn: checkInDate || undefined,
            checkOut: checkOutDate || undefined,
            nightsCount: nightsCount,
            specialRequests: cleanValue(record.notes) || undefined,
            // 🎯 FIX: Store actual occupancy type without auto-defaulting N/A values
            occupancy: record.occupancy === 'Single' ? 'single' :
              record.occupancy === 'Double' ? 'double' :
                record.occupancy === 'Twin' ? 'twin' :
                  record.occupancy === 'Room Sharer' ? 'room_sharer' :
                    (record.occupancy === 'N/A' || !record.occupancy || record.occupancy.trim() === '') ? 'N/A' : undefined,
            doubleOccupancy: {
              enabled: record.occupancy === 'Double' || record.occupancy === 'Twin' || record.occupancy === 'Room Sharer'
            },
            visaBookingRequired: parseYesNo(record.hotelBookingForVisa)
          },
          flight: {
            inbound: {
              departureFrom: cleanValue(record.inboundDepartureFrom) || undefined,
              departureDate: cleanValue(record.inboundDepartureDate) || undefined,
              departureTime: parseTime(record.inboundDepartureTime) || undefined,
              departureTerminal: cleanValue(record.inboundDepartureTerminal) || undefined,
              flightNumber: cleanValue(record.inboundFlightNumber) || undefined,
              arrivalDate: cleanValue(record.inboundArrivalDate) || undefined,
              arrivalTime: parseTime(record.inboundArrivalTime) || undefined,
              arrivalToAirport: cleanValue(record.inboundArrivalTo) || undefined
            },
            outbound: {
              departureFrom: cleanValue(record.outboundDepartureFrom) || undefined,
              departureDate: cleanValue(record.outboundDepartureDate) || undefined,
              departureTime: parseTime(record.outboundDepartureTime) || undefined,
              departureTerminal: cleanValue(record.outboundDepartureTerminal) || undefined,
              flightNumber: cleanValue(record.outboundFlightNumber) || undefined,
              arrivalToAirport: cleanValue(record.outboundArrivalTo) || undefined
            }
          },
          requirements: {
            dietary: {
              enabled: !!(cleanValue(record.dietaryRequirements)),
              details: cleanValue(record.dietaryRequirements) || undefined
            },
            medical: {
              enabled: !!(cleanValue(record.medicalInformation)),
              details: cleanValue(record.medicalInformation) || undefined
            },
            accessibility: {
              enabled: !!(cleanValue(record.accessibilityRequirements)),
              details: cleanValue(record.accessibilityRequirements) || undefined
            }
          },
          emergencyContact: {
            name: cleanValue(record.emergencyContactName) || undefined,
            relationship: undefined, // Not clearly separated in CSV
            phone: cleanValue(record.emergencyContactNumber) || undefined,
            email: undefined // Not provided in CSV
          },
          transferRequirements: parseYesNo(record.transportRequired) ? 'Airport transfers required' : undefined,
          assigned: true,
          active: true
        };

        // Create user
        const user = await prisma.user.create({
          data: userData
        });

        // Assign user to group based on Market field
        if (record.market && cleanValue(record.market)) {
          try {
            const marketName = cleanValue(record.market)!;
            const correctedMarketName = marketName === 'Phillipines' ? 'Philippines' : marketName;
            const groupId = await getOrCreateGroup(correctedMarketName, event.id, superAdmin.id);

            // Add user to group
            await prisma.user.update({
              where: { id: user.id },
              data: {
                groupIds: [groupId]
              }
            });

            console.log(`👥 Assigned ${(user.profile as any).firstName} ${(user.profile as any).lastName} to group "${correctedMarketName}"`);
          } catch (groupError: any) {
            console.warn(`⚠️ Failed to assign user to group: ${groupError.message}`);
          }
        }

        // Assign room if accommodation is required and room type is specified
        if (userData.accommodation?.required && userData.accommodation?.roomType) {
          const roomType = createdRoomTypes.find(rt => rt.name === userData.accommodation?.roomType);
          console.log(`🛏️ Looking for room type: "${userData.accommodation?.roomType}" - Found: ${roomType ? 'YES' : 'NO'}`);

          if (roomType) {
            try {
              await RoomAssignmentService.assignRoom({
                userId: user.id,
                eventId: event.id,
                hotelId: hotel.id,
                roomTypeId: roomType.id,
                assignedBy: superAdmin.id,
                hotelNotes: userData.accommodation.specialRequests || '',
                billingNotes: '',
              });
              console.log(`🛏️ Room assigned for ${(user.profile as any).firstName} ${(user.profile as any).lastName}`);
            } catch (roomError: any) {
              console.warn(`⚠️ Room assignment failed for ${(user.profile as any).firstName} ${(user.profile as any).lastName}: ${roomError.message}`);
              // Don't fail the entire import - just log the issue
            }
          } else {
            console.warn(`⚠️ Room type "${userData.accommodation.roomType}" not found for ${(user.profile as any).firstName} ${(user.profile as any).lastName}`);
          }
        }

        imported++;
        successfulImports.push(record);
        console.log(`✅ Imported user ${imported}: ${(user.profile as any).firstName} ${(user.profile as any).lastName} (${(user.profile as any).email || 'no email'})`);

      } catch (error: any) {
        console.error(`❌ Failed to import record:`, record.firstName, record.lastName, error);
        failedImports.push({
          record,
          error: error.message || error.toString(),
          rowNumber
        });
        skipped++;
      }
    }


    console.log('📈 Import Summary:');
    console.log(`✅ Successfully imported: ${imported} users`);
    console.log(`❌ Failed: ${failedImports.length} records`);
    console.log(`⏭️ Skipped: ${skippedImports.length} records`);
    console.log(`🏨 Created: 1 hotel (${hotel.name})`);
    console.log(`🛏️ Created: ${createdRoomTypes.length} room types`);
    console.log(`👥 Created/used: ${groupCache.size} groups`);
    console.log(`📅 Created: 1 event (${event.name})`);

    if (groupCache.size > 0) {
      console.log('\n👥 Groups created/used:');
      for (const [groupName, groupId] of groupCache.entries()) {
        console.log(`   - ${groupName} (${groupId})`);
      }
    }

    if (failedImports.length > 0) {
      console.log('\n❌ Failed imports:');
      failedImports.forEach(({ record, error, rowNumber }) => {
        console.log(`   Row ${rowNumber}: ${record.firstName} ${record.lastName} - ${error}`);
      });
    }

    if (skippedImports.length > 0) {
      console.log('\n⏭️ Skipped imports:');
      skippedImports.forEach(({ record, reason, rowNumber }) => {
        console.log(`   Row ${rowNumber}: ${record.firstName || 'N/A'} ${record.lastName || 'N/A'} - ${reason}`);
      });
    }

    // Step 6: Generate Excel report
    console.log('📊 Generating import report...');
    const workbook = new ExcelJS.Workbook();

    // Get original CSV headers
    const csvHeaders = Object.keys(records[0] || {});

    // Successful imports sheet
    const successSheet = workbook.addWorksheet('Successfully Imported');
    successSheet.addRow(csvHeaders);

    successfulImports.forEach(record => {
      const row = csvHeaders.map(header => (record as any)[header] || '');
      successSheet.addRow(row);
    });

    // Style the successful sheet
    successSheet.getRow(1).font = { bold: true };
    successSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF90EE90' } // Light green header
    };

    // Failed imports sheet
    const failedSheet = workbook.addWorksheet('Failed to Import');
    failedSheet.addRow([...csvHeaders, 'Error Reason', 'Row Number']);

    failedImports.forEach(({ record, error, rowNumber }) => {
      const row = csvHeaders.map(header => (record as any)[header] || '');
      row.push(error, rowNumber.toString());
      failedSheet.addRow(row);
    });

    // Style the failed sheet
    failedSheet.getRow(1).font = { bold: true };
    failedSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF6B6B' } // Light red header
    };

    // Skipped imports sheet
    const skippedSheet = workbook.addWorksheet('Skipped Records');
    skippedSheet.addRow([...csvHeaders, 'Skip Reason', 'Row Number']);

    skippedImports.forEach(({ record, reason, rowNumber }) => {
      const row = csvHeaders.map(header => (record as any)[header] || '');
      row.push(reason, rowNumber.toString());
      skippedSheet.addRow(row);
    });

    // Style the skipped sheet
    skippedSheet.getRow(1).font = { bold: true };
    skippedSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF99' } // Light yellow header
    };

    // Auto-fit columns for all sheets
    [successSheet, failedSheet, skippedSheet].forEach(sheet => {
      sheet.columns.forEach(column => {
        column.width = 15; // Set reasonable default width
      });
    });

    // Save the Excel file
    const reportPath = path.join(process.cwd(), '.project/reports/output', `import-report-${new Date().toISOString().split('T')[0]}.xlsx`);

    // Ensure output directory exists
    const outputDir = path.dirname(reportPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await workbook.xlsx.writeFile(reportPath);
    console.log(`📋 Import report saved: ${reportPath}`);

    console.log('\n🎉 CSV import completed successfully!');

  } catch (error) {
    console.error('💥 Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();