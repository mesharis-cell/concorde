#!/usr/bin/env bun

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as bcrypt from 'bcryptjs';
import {
  PrismaClient,
  ActivityCategory,
  AdminRole,
  TemplateType,
  TemplateCategory,
} from '@prisma/client';

type DemoContract = {
  event: {
    name: string;
    shortName: string;
    timezone: string;
    location: {
      city: string;
      country: string;
      venue: string;
    };
    dateRange: {
      start: string;
      end: string;
    };
    config: {
      micrositeUrl: string;
      registrationOpen: boolean;
    };
  };
  admins: {
    superAdmin: {
      email: string;
      firstName: string;
      lastName: string;
    };
    standardAdmin: {
      email: string;
      firstName: string;
      lastName: string;
    };
  };
  walkthroughIdentities: {
    primaryAttendeeEmail: string;
  };
  groups: Array<{
    name: string;
    description: string;
  }>;
  activities: Array<{
    title: string;
    description: string;
    category: ActivityCategory;
    groupNames: string[];
    start: string;
    end: string;
    location: {
      name: string;
      address: string;
      mapLink: string;
    };
  }>;
  attendees: Array<{
    firstName: string;
    lastName: string;
    email: string;
    groupNames: string[];
    guestCategory: string;
    formResponses: Array<{
      fieldName: string;
      fieldLabel: string;
      fieldType: string;
      value: string | boolean | number;
      step: string;
      order: number;
    }>;
    communication: {
      emailOptIn: boolean;
      whatsappOptIn: boolean;
    };
    accommodation: {
      hotelName: string;
      roomTypeName: string;
      checkIn: string;
      checkOut: string;
      confirmationNumber: string;
    };
    transport: {
      arrivalTransfer: boolean;
      departureTransfer: boolean;
      carNumbers: string[];
    };
    flight: {
      arrival: {
        flightNumber: string;
        airport: string;
        dateTime: string;
      };
      departure: {
        flightNumber: string;
        airport: string;
        dateTime: string;
      };
    };
  }>;
  accommodation: {
    hotels: Array<{
      name: string;
      isDefault: boolean;
      checkInTime: string;
      checkOutTime: string;
      roomTypes: Array<{
        name: string;
        maxOccupancy: number;
        amenities: string[];
      }>;
    }>;
  };
  transport: {
    groupCarDefaults: Record<string, string[]>;
    notes: string;
  };
};

const prisma = new PrismaClient();

function readDemoContract(): DemoContract {
  const contractPath = path.resolve(process.cwd(), 'scripts/demo-data-contract.json');
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Missing demo contract at ${contractPath}`);
  }

  const raw = fs.readFileSync(contractPath, 'utf8');
  return JSON.parse(raw) as DemoContract;
}

function envOrFallback(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  return value.trim();
}

async function clearEventScopedData(eventId: string): Promise<void> {
  await prisma.emailTracking.deleteMany({ where: { user: { eventId } } });
  await prisma.userOTP.deleteMany({ where: { eventId } });
  await prisma.communicationLog.deleteMany({ where: { eventId } });
  await prisma.userActivityExclusion.deleteMany({ where: { eventId } });
  await prisma.roomAssignment.deleteMany({ where: { eventId } });
  await prisma.roomType.deleteMany({ where: { eventId } });
  await prisma.hotel.deleteMany({ where: { eventId } });
  await prisma.message.deleteMany({ where: { eventId } });
  await prisma.emailTemplate.deleteMany({ where: { eventId } });
  await prisma.auditTrail.deleteMany({ where: { eventId } });
  await prisma.user.deleteMany({ where: { eventId } });
  await prisma.activity.deleteMany({ where: { eventId } });
  await prisma.group.deleteMany({ where: { eventId } });
  await prisma.adminEvent.deleteMany({ where: { eventId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
}

async function fullForceReset(): Promise<void> {
  console.warn('⚠️ --force-reset enabled: removing all seeded entities');

  await prisma.emailTracking.deleteMany({});
  await prisma.userOTP.deleteMany({});
  await prisma.communicationLog.deleteMany({});
  await prisma.userActivityExclusion.deleteMany({});
  await prisma.roomAssignment.deleteMany({});
  await prisma.roomType.deleteMany({});
  await prisma.hotel.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.emailTemplate.deleteMany({});
  await prisma.auditTrail.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.adminEvent.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.admin.deleteMany({});
}

async function seedDemo(): Promise<void> {
  const forceReset = process.argv.includes('--force-reset');
  const contract = readDemoContract();

  const superAdminEmail = envOrFallback('DEMO_SUPERADMIN_EMAIL', contract.admins.superAdmin.email);
  const standardAdminEmail = envOrFallback('DEMO_STANDARD_ADMIN_EMAIL', contract.admins.standardAdmin.email);
  const superAdminPassword = envOrFallback('DEMO_SUPERADMIN_PASSWORD', 'DemoOwner123!');
  const standardAdminPassword = envOrFallback('DEMO_STANDARD_ADMIN_PASSWORD', 'DemoOps123!');

  if (forceReset) {
    await fullForceReset();
  } else {
    const existingDemoEvents = await prisma.event.findMany({
      where: {
        OR: [{ shortName: contract.event.shortName }, { name: contract.event.name }],
      },
      select: { id: true },
    });

    for (const event of existingDemoEvents) {
      await clearEventScopedData(event.id);
    }
  }

  const superAdminHash = await bcrypt.hash(superAdminPassword, 12);
  const standardAdminHash = await bcrypt.hash(standardAdminPassword, 12);

  const superAdmin = await prisma.admin.upsert({
    where: { email: superAdminEmail },
    update: {
      firstName: contract.admins.superAdmin.firstName,
      lastName: contract.admins.superAdmin.lastName,
      passwordHash: superAdminHash,
      role: AdminRole.SUPER,
      active: true,
    },
    create: {
      email: superAdminEmail,
      firstName: contract.admins.superAdmin.firstName,
      lastName: contract.admins.superAdmin.lastName,
      passwordHash: superAdminHash,
      role: AdminRole.SUPER,
      active: true,
    },
  });

  const standardAdmin = await prisma.admin.upsert({
    where: { email: standardAdminEmail },
    update: {
      firstName: contract.admins.standardAdmin.firstName,
      lastName: contract.admins.standardAdmin.lastName,
      passwordHash: standardAdminHash,
      role: AdminRole.STANDARD,
      active: true,
    },
    create: {
      email: standardAdminEmail,
      firstName: contract.admins.standardAdmin.firstName,
      lastName: contract.admins.standardAdmin.lastName,
      passwordHash: standardAdminHash,
      role: AdminRole.STANDARD,
      active: true,
    },
  });

  const event = await prisma.event.create({
    data: {
      name: contract.event.name,
      shortName: contract.event.shortName,
      location: {
        city: contract.event.location.city,
        country: contract.event.location.country,
        venue: contract.event.location.venue,
        timezone: contract.event.timezone,
      },
      dateRange: {
        start: new Date(contract.event.dateRange.start),
        end: new Date(contract.event.dateRange.end),
      },
      config: contract.event.config,
      fromEmail: 'no-reply@savvio.digital',
      fromName: 'Savvio Concorde',
      guestCategories: ['VIP', 'Standard'],
      hotelConfig: contract.accommodation,
      carConfig: contract.transport,
    },
  });

  await prisma.adminEvent.createMany({
    data: [
      { adminId: superAdmin.id, eventId: event.id },
      { adminId: standardAdmin.id, eventId: event.id },
    ],
  });

  // [V4] Ensure communications compose flow has deterministic templates in freshly seeded demo data.
  await prisma.emailTemplate.createMany({
    data: [
      {
        eventId: event.id,
        name: 'Demo Announcement',
        type: TemplateType.COMMUNICATION,
        category: TemplateCategory.ANNOUNCEMENT,
        subject: '{{eventName}} Update for {{firstName}} {{lastName}}',
        html: '<p>Hello {{firstName}},</p><p>{{eventName}} has a new update for you.</p><p>See you at the summit.</p>',
        requiredVariables: ['eventName', 'firstName', 'lastName'],
        createdBy: superAdmin.id,
      },
      {
        eventId: event.id,
        name: 'Demo Assignment',
        type: TemplateType.COMMUNICATION,
        category: TemplateCategory.ASSIGNMENT,
        subject: 'Your {{eventName}} agenda is ready',
        html: '<p>Hello {{firstName}},</p><p>Your personalized activities are now available in your itinerary.</p><p>Access your itinerary here: {{itineraryLink}}</p>',
        requiredVariables: ['eventName', 'firstName', 'itineraryLink'],
        createdBy: superAdmin.id,
      },
      {
        eventId: event.id,
        name: 'Demo OTP Access',
        type: TemplateType.AUTHENTICATION,
        category: TemplateCategory.OTP_VERIFICATION,
        subject: 'Your Savvio Concorde access code',
        html: '<p>Hello {{firstName}},</p><p>Your one-time access code is <strong>{{otpCode}}</strong>.</p>',
        requiredVariables: ['firstName', 'otpCode'],
        createdBy: superAdmin.id,
      },
    ],
  });

  const hotelByName = new Map<string, { id: string }>();
  const roomTypeByHotelAndName = new Map<string, { id: string }>();

  for (const hotel of contract.accommodation.hotels) {
    const createdHotel = await prisma.hotel.create({
      data: {
        eventId: event.id,
        name: hotel.name,
        isDefault: hotel.isDefault,
        checkInTime: hotel.checkInTime,
        checkOutTime: hotel.checkOutTime,
        active: true,
      },
    });

    hotelByName.set(hotel.name, { id: createdHotel.id });

    for (const roomType of hotel.roomTypes) {
      const createdRoomType = await prisma.roomType.create({
        data: {
          eventId: event.id,
          hotelId: createdHotel.id,
          name: roomType.name,
          maxOccupancy: roomType.maxOccupancy,
          amenities: roomType.amenities,
          active: true,
        },
      });

      roomTypeByHotelAndName.set(`${hotel.name}::${roomType.name}`, { id: createdRoomType.id });
    }
  }

  const groupByName = new Map<string, { id: string; name: string }>();

  for (const group of contract.groups) {
    const createdGroup = await prisma.group.create({
      data: {
        eventId: event.id,
        name: group.name,
        description: group.description,
        memberCount: 0,
        activityIds: [],
        carNumbers: contract.transport.groupCarDefaults[group.name] ?? [],
      },
    });

    groupByName.set(group.name, { id: createdGroup.id, name: createdGroup.name });
  }

  const activityIdsByGroup = new Map<string, string[]>();

  for (const activity of contract.activities) {
    const resolvedGroupIds = activity.groupNames
      .map((groupName) => groupByName.get(groupName)?.id)
      .filter((id): id is string => Boolean(id));

    const createdActivity = await prisma.activity.create({
      data: {
        eventId: event.id,
        groupIds: resolvedGroupIds,
        title: activity.title,
        description: activity.description,
        startDateTime: new Date(activity.start),
        endDateTime: new Date(activity.end),
        category: activity.category,
        location: activity.location,
        content: {
          html: `<p>${activity.description}</p>`,
        },
        timingTable: [
          {
            enabled: true,
            time: new Date(activity.start).toISOString().slice(11, 16),
            description: activity.title,
            location: activity.location.name,
          },
        ],
        createdBy: superAdmin.id,
        lastModifiedBy: superAdmin.id,
        lastModifiedAt: new Date(),
      },
    });

    for (const groupId of resolvedGroupIds) {
      const existing = activityIdsByGroup.get(groupId) ?? [];
      existing.push(createdActivity.id);
      activityIdsByGroup.set(groupId, existing);
    }
  }

  for (const group of groupByName.values()) {
    await prisma.group.update({
      where: { id: group.id },
      data: { activityIds: activityIdsByGroup.get(group.id) ?? [] },
    });
  }

  const createdUsers: Array<{
    id: string;
    hotelName: string;
    roomTypeName: string;
    assigned: boolean;
  }> = [];

  for (const attendee of contract.attendees) {
    const resolvedGroupIds = attendee.groupNames
      .map((groupName) => groupByName.get(groupName)?.id)
      .filter((id): id is string => Boolean(id));

    const assigned = resolvedGroupIds.length > 0;
    const hotelRef = hotelByName.get(attendee.accommodation.hotelName);

    const user = await prisma.user.create({
      data: {
        eventId: event.id,
        groupIds: resolvedGroupIds,
        email: attendee.email,
        formResponses: attendee.formResponses,
        communication: attendee.communication,
        guestCategory: attendee.guestCategory,
        accommodation: attendee.accommodation,
        flight: attendee.flight,
        transferRequirements:
          attendee.transport.arrivalTransfer || attendee.transport.departureTransfer,
        gpTransfersRequired: attendee.transport.arrivalTransfer,
        eventTransfersRequired: attendee.transport.departureTransfer,
        carNumbers: attendee.transport.carNumbers,
        assigned,
        assignedAt: assigned ? new Date() : null,
        assignedBy: assigned ? standardAdmin.id : null,
        hotelId: hotelRef?.id,
      },
    });

    createdUsers.push({
      id: user.id,
      hotelName: attendee.accommodation.hotelName,
      roomTypeName: attendee.accommodation.roomTypeName,
      assigned,
    });
  }

  let roomAssignmentsCreated = 0;

  for (const user of createdUsers) {
    const hotelRef = hotelByName.get(user.hotelName);
    const roomRef = roomTypeByHotelAndName.get(`${user.hotelName}::${user.roomTypeName}`);

    if (!hotelRef || !roomRef) {
      continue;
    }

    await prisma.roomAssignment.create({
      data: {
        userId: user.id,
        eventId: event.id,
        hotelId: hotelRef.id,
        roomTypeId: roomRef.id,
        assignedBy: standardAdmin.id,
        updatedBy: standardAdmin.id,
        bookingConfirmationNumber: `ROOM-${user.id.slice(-6)}`,
      },
    });

    roomAssignmentsCreated += 1;
  }

  for (const group of groupByName.values()) {
    const memberCount = await prisma.user.count({
      where: {
        eventId: event.id,
        groupIds: { has: group.id },
      },
    });

    await prisma.group.update({
      where: { id: group.id },
      data: { memberCount },
    });
  }

  const primaryAttendee = await prisma.user.findFirst({
    where: {
      eventId: event.id,
      email: contract.walkthroughIdentities.primaryAttendeeEmail,
    },
    select: { id: true, email: true },
  });

  const assignedCount = await prisma.user.count({
    where: { eventId: event.id, assigned: true },
  });
  const unassignedCount = await prisma.user.count({
    where: { eventId: event.id, assigned: false },
  });

  console.log('✅ Demo seed completed');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Event ID: ${event.id}`);
  console.log(`Event Name: ${event.name}`);
  console.log(`Super Admin: ${superAdmin.email}`);
  console.log(`Standard Admin: ${standardAdmin.email}`);
  console.log(`Primary Attendee: ${primaryAttendee?.email ?? 'MISSING'} (${primaryAttendee?.id ?? 'N/A'})`);
  console.log(`Users: ${contract.attendees.length} (assigned: ${assignedCount}, unassigned: ${unassignedCount})`);
  console.log(`Groups: ${contract.groups.length}`);
  console.log(`Activities: ${contract.activities.length}`);
  console.log(`Room Assignments: ${roomAssignmentsCreated}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

seedDemo()
  .catch((error) => {
    console.error('❌ Demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
