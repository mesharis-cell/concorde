import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcrypt';
import { RoomAssignmentService } from '../src/services/room-assignments.js';
import { GroupService } from '../src/services/groups.js';

const prisma = new PrismaClient({
  log: ['error']
});

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
  checkOutTime: "11:00",
  address: "1 Duxton Hill, Singapore 089597",
  phone: "+65 6922 8001",
  email: "reservations@mondrian-singapore.com"
};

const roomTypes = [
  {
    name: "Signature King",
    description: "Spacious king room with city views",
    maxOccupancy: 2,
    basePrice: 500
  },
  {
    name: "Signature Twin",
    description: "Twin beds with city views",
    maxOccupancy: 2,
    basePrice: 500
  },
  {
    name: "Shophouse suite",
    description: "Premium suite in heritage shophouse",
    maxOccupancy: 4,
    basePrice: 800
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

    const date = new Date(fullYear, month, day);

    // Check if date is valid
    if (isNaN(date.getTime())) return null;

    return date;
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
          <h2>Event Terms and Conditions</h2>
          <p>Welcome to the Singapore Grand Prix 2025 exclusive hospitality experience.</p>

          <h3>1. Registration & Attendance</h3>
          <ul>
            <li>Registration confirmation required for all attendees</li>
            <li>Valid photo identification must be presented at check-in</li>
            <li>Dress code: Smart casual for all events</li>
          </ul>

          <h3>2. Hotel & Accommodation</h3>
          <ul>
            <li>Room assignments are final and cannot be changed 48 hours prior to event</li>
            <li>Early check-in and late check-out subject to availability</li>
            <li>Special requests will be accommodated when possible</li>
          </ul>

          <h3>3. Communication Preferences</h3>
          <ul>
            <li>Email communications are mandatory for event updates</li>
            <li>WhatsApp communications are optional but recommended</li>
            <li>Unsubscribe options available at any time</li>
          </ul>

          <h3>4. Privacy & Data Protection</h3>
          <p>Your personal information will be handled in accordance with our Privacy Policy.</p>

          <p><strong>By registering, you agree to these terms and conditions.</strong></p>
        `,
        privacyPolicy: `
          <h2>Privacy Policy</h2>
          <p><em>Last updated: September 2025</em></p>

          <h3>Data Collection</h3>
          <p>We collect personal information necessary for event management including:</p>
          <ul>
            <li>Contact details (name, email, phone)</li>
            <li>Travel information (flight details, accommodation preferences)</li>
            <li>Dietary and medical requirements</li>
            <li>Emergency contact information</li>
          </ul>

          <h3>Data Usage</h3>
          <p>Your information is used exclusively for:</p>
          <ul>
            <li>Event logistics and coordination</li>
            <li>Communication about event updates</li>
            <li>Accommodation and travel arrangements</li>
            <li>Dietary and accessibility accommodations</li>
          </ul>

          <h3>Data Sharing</h3>
          <p>We share your information only with:</p>
          <ul>
            <li>Hotel partners for accommodation arrangements</li>
            <li>Catering services for dietary requirements</li>
            <li>Medical staff for health-related needs</li>
            <li>Emergency contacts as necessary</li>
          </ul>

          <h3>Data Retention</h3>
          <p>Personal data is retained for 12 months post-event for:</p>
          <ul>
            <li>Follow-up communications</li>
            <li>Future event invitations</li>
            <li>Preference management</li>
          </ul>

          <h3>Your Rights</h3>
          <p>You have the right to:</p>
          <ul>
            <li>Access your personal data</li>
            <li>Correct inaccurate information</li>
            <li>Request data deletion</li>
            <li>Opt-out of communications</li>
          </ul>

          <p>For privacy questions, contact: privacy@company.com</p>
        `,
        active: true
      }
    });
    console.log('✅ Event created:', event.name);

    // Step 2: Create super admin for assignments
    const passwordHash = await bcrypt.hash('admin123', 12);
    console.log('👤 Creating super admin...');
    const superAdmin = await prisma.admin.create({
      data: {
        email: 'admin@eventconcierge.com',
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
          maxOccupancy: roomType.maxOccupancy,
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
              { date: "28/09/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "29/09/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "30/09/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "01/10/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "02/10/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "03/10/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "04/10/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "05/10/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              { date: "06/10/2025", roomType: "Signature King", quantity: 50, allocated: 0 },
              // Signature Twin rooms
              { date: "28/09/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "29/09/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "30/09/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "01/10/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "02/10/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "03/10/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "04/10/2025", roomType: "Signature Twin", quantity: 30, allocated: 0 },
              { date: "05/10/2025", roomType: "Signature Twin", quantity: 15, allocated: 0 },
              // Shophouse suite rooms
              { date: "30/09/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "01/10/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "02/10/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "03/10/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "04/10/2025", roomType: "Shophouse suite", quantity: 5, allocated: 0 },
              { date: "05/10/2025", roomType: "Shophouse suite", quantity: 2, allocated: 0 }
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

    for (const record of records) {
      try {
        // Skip empty rows or rows without names
        if (!record.firstName && !record.lastName) {
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
          guestCategory: cleanValue(record.guestType) || 'Standard',
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
            await RoomAssignmentService.assignRoom({
              userId: user.id,
              eventId: event.id,
              hotelId: hotel.id,
              roomTypeId: roomType.id,
              roomNumber: undefined,
              assignedBy: superAdmin.id,
              hotelNotes: userData.accommodation.specialRequests || '',
              billingNotes: '',
            });
            console.log(`🛏️ Room assigned for ${user.profile.firstName} ${user.profile.lastName}`);
          }
        }

        imported++;
        console.log(`✅ Imported user ${imported}: ${user.profile.firstName} ${user.profile.lastName} (${user.profile.email || 'no email'})`);

      } catch (error) {
        console.error(`❌ Failed to import record:`, record.firstName, record.lastName, error);
        skipped++;
      }
    }


    console.log('📈 Import Summary:');
    console.log(`✅ Successfully imported: ${imported} users`);
    console.log(`⏭️ Skipped: ${skipped} records`);
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

    console.log('\n🎉 CSV import completed successfully!');

  } catch (error) {
    console.error('💥 Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();