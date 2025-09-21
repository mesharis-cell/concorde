import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Dummy data generators
const firstNames = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'William', 'Sophia', 'Mason', 'Isabella', 'James', 'Charlotte', 'Benjamin', 'Mia', 'Lucas', 'Amelia', 'Alexander', 'Harper', 'Henry', 'Evelyn'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson'];
const companies = ['Formula 1', 'Mercedes-AMG', 'Red Bull Racing', 'Ferrari', 'McLaren', 'Aston Martin', 'Alpine', 'Williams', 'AlphaTauri', 'Haas F1', 'BBC Sport', 'Sky Sports', 'ESPN', 'CNN Sport', 'Reuters'];
const airlines = ['Singapore Airlines', 'Emirates', 'British Airways', 'Lufthansa', 'Air France', 'KLM', 'Qatar Airways', 'Cathay Pacific'];
const airports = [
  { code: 'LHR', name: 'London Heathrow' },
  { code: 'JFK', name: 'New York JFK' },
  { code: 'CDG', name: 'Paris Charles de Gaulle' },
  { code: 'FRA', name: 'Frankfurt' },
  { code: 'DXB', name: 'Dubai' },
  { code: 'SIN', name: 'Singapore Changi' },
  { code: 'HKG', name: 'Hong Kong' },
  { code: 'NRT', name: 'Tokyo Narita' }
];
const guestCategories = ['VIP', 'Standard', 'Media', 'Staff', 'Production', 'Corporate'];
const dietaryOptions = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'No shellfish', 'Halal', 'Kosher'];
const medicalConditions = ['Diabetes', 'Heart condition', 'Asthma', 'Allergies', 'Mobility assistance', 'Visual impairment'];

// Utility functions
function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function generateFlightNumber(): string {
  const carriers = ['BA', 'SQ', 'EK', 'LH', 'AF', 'QF', 'CX', 'JL'];
  const carrier = randomChoice(carriers);
  const number = Math.floor(Math.random() * 9000) + 1000;
  return `${carrier} ${number}`;
}

function generatePhoneNumber(): string {
  const countryCode = randomChoice(['+44', '+1', '+33', '+49', '+65', '+971', '+852', '+81']);
  const number = Math.floor(Math.random() * 9000000000) + 1000000000;
  return `${countryCode} ${number.toString().substring(0, 10)}`;
}

async function generateDummyData() {
  console.log('🚀 Starting dummy data generation...');

  // Clean existing data (optional - comment out if you want to keep existing data)
  console.log('🧹 Cleaning existing data...');
  await prisma.auditTrail.deleteMany();
  await prisma.roomAssignment.deleteMany();
  await prisma.userActivityExclusion.deleteMany();
  await prisma.communicationLog.deleteMany();
  await prisma.userOTP.deleteMany();
  await prisma.user.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.group.deleteMany();
  await prisma.adminEvent.deleteMany();
  await prisma.event.deleteMany();
  await prisma.admin.deleteMany();

  // 1. Create Super Admin
  console.log('👤 Creating super admin...');
  const passwordHash = await bcrypt.hash('admin123', 12);
  const superAdmin = await prisma.admin.create({
    data: {
      email: 'admin@eventconcierge.com',
      passwordHash: passwordHash, // password: admin123
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER',
      active: true,
    },
  });

  // 2. Create Event with Hotel Config
  console.log('🎯 Creating event with hotel configuration...');
  const event = await prisma.event.create({
    data: {
      name: 'Monaco Grand Prix 2025',
      shortName: 'Monaco2025',
      location: {
        city: 'Monaco',
        country: 'Monaco',
        venue: 'Circuit de Monaco',
        timezone: 'Europe/Monaco',
      },
      dateRange: {
        start: new Date('2025-05-25'),
        end: new Date('2025-05-28'),
      },
      config: {
        micrositeUrl: 'https://events.monaco.com/gp2025',
        registrationOpen: true,
      },
      hotelConfig: {
        hotels: [
          {
            name: 'Hotel Hermitage Monte-Carlo',
            isDefault: true,
            checkInTime: '15:00',
            checkOutTime: '11:00',
            contractedRooms: [
              {
                id: 'room_deluxe_001',
                date: '2025-05-24T00:00:00.000Z',
                roomType: 'Deluxe Sea View',
                quantity: 20,
                allocated: 0,
              },
              {
                id: 'room_suite_001',
                date: '2025-05-24T00:00:00.000Z',
                roomType: 'Junior Suite',
                quantity: 10,
                allocated: 0,
              },
              {
                id: 'room_presidential_001',
                date: '2025-05-24T00:00:00.000Z',
                roomType: 'Presidential Suite',
                quantity: 5,
                allocated: 0,
              },
            ],
          },
          {
            name: 'Fairmont Monte Carlo',
            isDefault: false,
            checkInTime: '14:00',
            checkOutTime: '12:00',
            contractedRooms: [
              {
                id: 'room_superior_001',
                date: '2025-05-24T00:00:00.000Z',
                roomType: 'Superior Room',
                quantity: 15,
                allocated: 0,
              },
              {
                id: 'room_junior_suite_001',
                date: '2025-05-24T00:00:00.000Z',
                roomType: 'Junior Suite Fairmont',
                quantity: 8,
                allocated: 0,
              },
            ],
          },
        ],
      },
      roomDrops: {
        drops: [
          {
            id: 'drop_vip_welcome',
            name: 'VIP Welcome Package',
            description: 'Champagne, chocolates, branded merchandise',
            stock: 25,
            assigned: 0,
          },
          {
            id: 'drop_standard_welcome',
            name: 'Standard Welcome Package',
            description: 'Welcome card and branded items',
            stock: 50,
            assigned: 0,
          },
        ],
      },
      guestCategories: {
        categories: ['VIP', 'Standard', 'Media', 'Staff', 'Production', 'Corporate', 'Sponsor'],
      },
      termsConditions: `
        <h2>Monaco Grand Prix 2025 - Terms and Conditions</h2>
        <p>Welcome to the most prestigious Formula 1 event.</p>
        <h3>1. Event Access</h3>
        <ul>
          <li>Valid credentials required for all venues</li>
          <li>Dress code: Formal attire for evening events</li>
        </ul>
      `,
      privacyPolicy: `
        <h2>Privacy Policy</h2>
        <p>Your data is handled with utmost care and confidentiality.</p>
      `,
    },
  });

  // Link admin to event
  await prisma.adminEvent.create({
    data: {
      adminId: superAdmin.id,
      eventId: event.id,
    },
  });

  // 3. Create Groups
  console.log('👥 Creating groups...');
  const groups = await Promise.all([
    prisma.group.create({
      data: {
        eventId: event.id,
        name: 'VIP Hospitality',
        description: 'Premium VIP guests and sponsors',
        activityIds: [],
      },
    }),
    prisma.group.create({
      data: {
        eventId: event.id,
        name: 'Media & Press',
        description: 'Journalists, photographers, and media personnel',
        activityIds: [],
      },
    }),
    prisma.group.create({
      data: {
        eventId: event.id,
        name: 'Corporate Partners',
        description: 'Corporate sponsors and business partners',
        activityIds: [],
      },
    }),
    prisma.group.create({
      data: {
        eventId: event.id,
        name: 'Production Team',
        description: 'Event production and technical staff',
        activityIds: [],
      },
    }),
  ]);

  // 4. Create Activities
  console.log('🎪 Creating activities...');
  const activities = await Promise.all([
    prisma.activity.create({
      data: {
        eventId: event.id,
        groupIds: [groups[0].id, groups[2].id], // VIP and Corporate
        title: 'Welcome Reception',
        description: 'Exclusive welcome cocktail reception',
        startDateTime: new Date('2025-05-25T18:00:00.000Z'),
        endDateTime: new Date('2025-05-25T20:00:00.000Z'),
        category: 'HOSPITALITY',
        location: {
          name: 'Hotel Hermitage Terrace',
          address: 'Square Beaumarchais, 98000 Monaco',
          mapLink: 'https://maps.google.com/?q=Hotel+Hermitage+Monaco',
        },
        content: {
          html: '<p>Join us for an exclusive welcome reception overlooking the Mediterranean.</p>',
        },
        capacity: 100,
        currentAttendees: 0,
        timingTable: [
          { enabled: true, time: '18:00', description: 'Arrival and welcome drinks' },
          { enabled: true, time: '19:30', description: 'Opening remarks' },
          { enabled: true, time: '20:00', description: 'Reception concludes' },
        ],
        createdBy: superAdmin.id,
      },
    }),
    prisma.activity.create({
      data: {
        eventId: event.id,
        groupIds: [groups[1].id], // Media only
        title: 'Press Briefing',
        description: 'Pre-race press conference and media briefing',
        startDateTime: new Date('2025-05-26T10:00:00.000Z'),
        endDateTime: new Date('2025-05-26T11:30:00.000Z'),
        category: 'MEETING',
        location: {
          name: 'Monaco Press Center',
          address: 'Port Hercule, 98000 Monaco',
        },
        content: {
          html: '<p>Comprehensive briefing for media personnel covering race weekend.</p>',
        },
        capacity: 50,
        currentAttendees: 0,
        timingTable: [
          { enabled: true, time: '10:00', description: 'Media check-in' },
          { enabled: true, time: '10:15', description: 'Press briefing begins' },
          { enabled: true, time: '11:30', description: 'Q&A session ends' },
        ],
        createdBy: superAdmin.id,
      },
    }),
    prisma.activity.create({
      data: {
        eventId: event.id,
        groupIds: [groups[0].id, groups[1].id, groups[2].id], // All except Production
        title: 'Paddock Club Experience',
        description: 'Exclusive access to F1 Paddock Club during race',
        startDateTime: new Date('2025-05-27T12:00:00.000Z'),
        endDateTime: new Date('2025-05-27T18:00:00.000Z'),
        category: 'EXPERIENCE',
        location: {
          name: 'F1 Paddock Club Monaco',
          address: 'Circuit de Monaco, 98000 Monaco',
        },
        content: {
          html: '<p>Premium viewing experience with gourmet dining and champagne service.</p>',
        },
        capacity: 200,
        currentAttendees: 0,
        timingTable: [
          { enabled: true, time: '12:00', description: 'Paddock Club opens' },
          { enabled: true, time: '14:00', description: 'Race starts' },
          { enabled: true, time: '16:30', description: 'Race concludes' },
          { enabled: true, time: '18:00', description: 'Paddock Club closes' },
        ],
        createdBy: superAdmin.id,
      },
    }),
    prisma.activity.create({
      data: {
        eventId: event.id,
        groupIds: [groups[3].id], // Production only
        title: 'Setup & Technical Meeting',
        description: 'Production team setup and technical coordination',
        startDateTime: new Date('2025-05-24T08:00:00.000Z'),
        endDateTime: new Date('2025-05-24T10:00:00.000Z'),
        category: 'MEETING',
        location: {
          name: 'Circuit Control Room',
          address: 'Circuit de Monaco, 98000 Monaco',
        },
        content: {
          html: '<p>Technical briefing and equipment setup coordination.</p>',
        },
        capacity: 30,
        currentAttendees: 0,
        timingTable: [
          { enabled: true, time: '08:00', description: 'Team assembly' },
          { enabled: true, time: '09:00', description: 'Equipment check' },
          { enabled: true, time: '10:00', description: 'Meeting concludes' },
        ],
        createdBy: superAdmin.id,
      },
    }),
  ]);

  // Update groups with activity IDs
  await Promise.all([
    prisma.group.update({
      where: { id: groups[0].id },
      data: { activityIds: [activities[0].id, activities[2].id] },
    }),
    prisma.group.update({
      where: { id: groups[1].id },
      data: { activityIds: [activities[1].id, activities[2].id] },
    }),
    prisma.group.update({
      where: { id: groups[2].id },
      data: { activityIds: [activities[0].id, activities[2].id] },
    }),
    prisma.group.update({
      where: { id: groups[3].id },
      data: { activityIds: [activities[3].id] },
    }),
  ]);

  // 5. Create Users with Comprehensive Data
  console.log('👤 Creating users with full profiles...');

  const users = [];

  for (let i = 0; i < 15; i++) {
    const firstName = randomChoice(firstNames);
    const lastName = randomChoice(lastNames);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomChoice(companies).toLowerCase().replace(/\s+/g, '')}.com`;

    // Generate flight data
    const departureAirport = randomChoice(airports.filter(a => a.code !== 'SIN'));
    const arrivalAirport = airports.find(a => a.code === 'SIN')!;

    const inboundDate = randomDate(new Date('2025-05-23'), new Date('2025-05-25'));
    const outboundDate = randomDate(new Date('2025-05-28'), new Date('2025-05-30'));

    const flightData = {
      inbound: {
        departureFrom: `${departureAirport.name} (${departureAirport.code})`,
        departureDate: formatDate(inboundDate),
        departureTime: formatTime(randomDate(new Date('2025-01-01T06:00:00'), new Date('2025-01-01T23:00:00'))),
        departureTerminal: `Terminal ${Math.floor(Math.random() * 4) + 1}`,
        flightNumber: generateFlightNumber(),
        airline: randomChoice(airlines),
        arrivalDate: formatDate(new Date(inboundDate.getTime() + (Math.random() * 8 + 4) * 60 * 60 * 1000)), // 4-12 hours later
        arrivalTime: formatTime(randomDate(new Date('2025-01-01T10:00:00'), new Date('2025-01-01T23:59:00'))),
        arrivalToAirport: `${arrivalAirport.name} (${arrivalAirport.code})`,
        arrivalToTerminal: `Terminal ${Math.floor(Math.random() * 4) + 1}`,
      },
      outbound: {
        departureFrom: `${arrivalAirport.name} (${arrivalAirport.code})`,
        departureDate: formatDate(outboundDate),
        departureTime: formatTime(randomDate(new Date('2025-01-01T08:00:00'), new Date('2025-01-01T22:00:00'))),
        departureTerminal: `Terminal ${Math.floor(Math.random() * 4) + 1}`,
        flightNumber: generateFlightNumber(),
        airline: randomChoice(airlines),
        arrivalDate: formatDate(new Date(outboundDate.getTime() + (Math.random() * 8 + 4) * 60 * 60 * 1000)),
        arrivalTime: formatTime(randomDate(new Date('2025-01-01T12:00:00'), new Date('2025-01-01T23:59:00'))),
        arrivalToAirport: `${departureAirport.name} (${departureAirport.code})`,
        arrivalToTerminal: `Terminal ${Math.floor(Math.random() * 4) + 1}`,
      },
    };

    // Generate requirements
    const hasRequirements = Math.random() > 0.3; // 70% have some requirements
    const requirements: any = {};

    if (hasRequirements) {
      if (Math.random() > 0.5) {
        requirements.dietary = {
          enabled: true,
          details: randomChoice(dietaryOptions),
        };
      }
      if (Math.random() > 0.7) {
        requirements.medical = {
          enabled: true,
          details: randomChoice(medicalConditions),
        };
      }
      if (Math.random() > 0.8) {
        requirements.accessibility = {
          enabled: true,
          details: 'Wheelchair accessible room required',
        };
      }
    }

    const user = await prisma.user.create({
      data: {
        eventId: event.id,
        groupIds: [randomChoice(groups).id], // Assign to random group
        profile: {
          email,
          firstName,
          lastName,
          phone: generatePhoneNumber(),
          preferredFirstName: Math.random() > 0.8 ? randomChoice(['Alex', 'Sam', 'Chris', 'Pat']) : firstName,
          jobTitle: randomChoice(['Director', 'Manager', 'Coordinator', 'Producer', 'Journalist', 'Photographer', 'Executive']),
          company: randomChoice(companies),
          vip: Math.random() > 0.7, // 30% VIP
          host: `${randomChoice(firstNames)} ${randomChoice(lastNames)}`,
        },
        communication: {
          emailOptIn: true,
          whatsappOptIn: Math.random() > 0.3, // 70% opt into WhatsApp
        },
        flight: flightData,
        accommodation: {
          required: true,
          hotel: Math.random() > 0.7 ? 'Hotel Hermitage Monte-Carlo' : 'Fairmont Monte Carlo',
          checkIn: new Date('2025-05-24T15:00:00.000Z'),
          checkOut: new Date('2025-05-28T11:00:00.000Z'),
          doubleOccupancy: {
            enabled: Math.random() > 0.6, // 40% double occupancy
            guestType: Math.random() > 0.5 ? 'official' : 'plus-one',
            guestName: Math.random() > 0.5 ? `${randomChoice(firstNames)} ${randomChoice(lastNames)}` : undefined,
            guestRelation: randomChoice(['Spouse', 'Partner', 'Assistant', 'Colleague']),
          },
          visaBookingRequired: Math.random() > 0.7, // 30% need visa
          specialRequests: Math.random() > 0.8 ? 'High floor preferred' : undefined,
        },
        requirements: Object.keys(requirements).length > 0 ? requirements : undefined,
        merchandiseSize: {
          gender: randomChoice(['Men', 'Women']),
          size: randomChoice(['XS', 'S', 'M', 'L', 'XL']),
        },
        emergencyContact: {
          name: `${randomChoice(firstNames)} ${randomChoice(lastNames)}`,
          relationship: randomChoice(['Spouse', 'Parent', 'Sibling', 'Friend', 'Colleague']),
          phone: generatePhoneNumber(),
          email: `emergency${i}@example.com`,
        },
        assigned: true,
        assignedBy: superAdmin.id,
        guestCategory: randomChoice(guestCategories),
        roomDropAssigned: Math.random() > 0.5 ? (Math.random() > 0.3 ? 'drop_standard_welcome' : 'drop_vip_welcome') : undefined,
      },
    });

    users.push(user);
    console.log(`  ✅ Created user ${i + 1}/15: ${firstName} ${lastName} (${email})`);
  }

  // 6. Assign Room Assignments (using new roomConfigId system)
  console.log('🏨 Creating room assignments...');
  const roomTypes = ['room_deluxe_001', 'room_suite_001', 'room_presidential_001', 'room_superior_001', 'room_junior_suite_001'];

  for (let i = 0; i < Math.min(users.length, 12); i++) {
    const user = users[i];
    const roomConfigId = randomChoice(roomTypes);

    // Get the actual room type name for the assignment
    const hotelConfig = event.hotelConfig as any;
    let roomTypeName = 'Unknown';

    for (const hotel of hotelConfig.hotels) {
      const room = hotel.contractedRooms.find((r: any) => r.id === roomConfigId);
      if (room) {
        roomTypeName = room.roomType;
        break;
      }
    }

    await prisma.roomAssignment.create({
      data: {
        userId: user.id,
        eventId: event.id,
        roomConfigId: roomConfigId, // ✅ Reference to hotel config
        roomType: roomTypeName,     // ✅ Computed from reference
        roomNumber: `Room-${Math.floor(Math.random() * 900) + 100}`,
        status: randomChoice(['assigned', 'confirmed']),
        assignedBy: superAdmin.id,
        updatedBy: superAdmin.id,
        hotelNotes: Math.random() > 0.7 ? randomChoice(['High floor', 'Quiet room', 'Near elevator', 'City view']) : undefined,
        billingNotes: 'All charges to master account',
      },
    });

    console.log(`  🏨 Assigned room to ${user.profile.firstName} ${user.profile.lastName}: ${roomTypeName} (${roomConfigId})`);
  }

  // 7. Create some audit trail entries
  console.log('📋 Creating sample audit trail...');
  await prisma.auditTrail.create({
    data: {
      action: 'CREATE',
      resourceType: 'Event',
      resourceId: event.id,
      eventId: event.id,
      performedBy: superAdmin.id,
      performedByType: 'ADMIN',
      summary: `Event created: ${event.name}`,
      metadata: {
        eventDetails: {
          name: event.name,
          shortName: event.shortName,
          location: event.location,
        },
      },
    },
  });

  console.log('\n🎉 Dummy data generation completed!');
  console.log('\n📊 Generated:');
  console.log(`   👤 1 Super Admin: ${superAdmin.email}`);
  console.log(`   🎯 1 Event: ${event.name} (${event.shortName})`);
  console.log(`   👥 ${groups.length} Groups: ${groups.map(g => g.name).join(', ')}`);
  console.log(`   🎪 ${activities.length} Activities: ${activities.map(a => a.title).join(', ')}`);
  console.log(`   👤 ${users.length} Users with complete profiles, flight data, and requirements`);
  console.log(`   🏨 ${Math.min(users.length, 12)} Room assignments using roomConfigId references`);
  console.log(`   🏨 Hotel config with ${roomTypes.length} room types, each with unique IDs`);
  console.log('\n🔑 Admin Login:');
  console.log(`   Email: ${superAdmin.email}`);
  console.log(`   Password: admin123`);
  console.log(`\n🌐 Event ID: ${event.id}`);

  return {
    event,
    users,
    groups,
    activities,
    superAdmin,
  };
}

async function main() {
  try {
    await generateDummyData();
  } catch (error) {
    console.error('❌ Dummy data generation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();