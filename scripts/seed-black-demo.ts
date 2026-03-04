#!/usr/bin/env bun

import bcrypt from 'bcryptjs';
import { AdminRole, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_EVENT_KEY = 'black-demo-2026';
const DEMO_EVENT_NAME = 'BLACK Intl. Demo — RSVP Check-In';
const DEMO_EVENT_SHORT_NAME = 'BLACK RSVP Demo';

const DEFAULT_ADMIN_EMAIL = 'demo@savvio.digital';
const DEFAULT_ADMIN_PASSWORD = 'BlackDemo2026!';
const DEFAULT_ADMIN_FIRST_NAME = 'BLACK';
const DEFAULT_ADMIN_LAST_NAME = 'Demo';

const DEFAULT_DASHBOARD_URL = 'https://black-demo-dashboard.netlify.app';
const DEFAULT_REGISTRATION_URL = 'https://black-demo-registration.netlify.app/registration';
const DEFAULT_SCANNER_URL = 'https://black-demo-scanner.netlify.app';

type EventConfigRecord = {
  micrositeUrl: string;
  registrationOpen: boolean;
  demoKey: string;
};

type DemoAttendee = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  dietaryRequirements?: string;
  checkedIn: boolean;
  daysAgoRegistered: number;
};

const demoAttendees: DemoAttendee[] = [
  {
    firstName: 'Leila',
    lastName: 'Haddad',
    email: 'leila.haddad+black-demo@savvio.digital',
    phone: '+971501110001',
    company: 'Black International',
    jobTitle: 'Client Partner',
    dietaryRequirements: 'Vegetarian',
    checkedIn: true,
    daysAgoRegistered: 4,
  },
  {
    firstName: 'Omar',
    lastName: 'Saad',
    email: 'omar.saad+black-demo@savvio.digital',
    phone: '+971501110002',
    company: 'Black International',
    jobTitle: 'Operations Lead',
    dietaryRequirements: 'No shellfish',
    checkedIn: true,
    daysAgoRegistered: 3,
  },
  {
    firstName: 'Maya',
    lastName: 'Rossi',
    email: 'maya.rossi+black-demo@savvio.digital',
    phone: '+971501110003',
    company: 'Aether Capital',
    jobTitle: 'Senior Associate',
    dietaryRequirements: '',
    checkedIn: false,
    daysAgoRegistered: 2,
  },
  {
    firstName: 'Daniel',
    lastName: 'Kim',
    email: 'daniel.kim+black-demo@savvio.digital',
    phone: '+971501110004',
    company: 'Nova Aviation',
    jobTitle: 'Regional Director',
    dietaryRequirements: 'Halal',
    checkedIn: false,
    daysAgoRegistered: 1,
  },
  {
    firstName: 'Sofia',
    lastName: 'Martins',
    email: 'sofia.martins+black-demo@savvio.digital',
    phone: '+971501110005',
    company: 'Parallax Group',
    jobTitle: 'Head of Strategy',
    dietaryRequirements: '',
    checkedIn: false,
    daysAgoRegistered: 0,
  },
];

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function buildDateRange(): { start: string; end: string } {
  const start = new Date();
  start.setDate(start.getDate() + 14);
  start.setHours(9, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  end.setHours(18, 0, 0, 0);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function buildRegistrationFormConfig() {
  return {
    step1: {
      label: 'Personal Information',
      subLabel: 'Tell us about yourself',
      order: 1,
      fields: [
        {
          name: 'firstName',
          type: 'text',
          label: 'First Name',
          placeholder: 'Enter your first name',
          required: true,
          validation: { required: true, minLength: 2, maxLength: 50 },
          order: 1,
        },
        {
          name: 'lastName',
          type: 'text',
          label: 'Last Name',
          placeholder: 'Enter your last name',
          required: true,
          validation: { required: true, minLength: 2, maxLength: 50 },
          order: 2,
        },
        {
          name: 'email',
          type: 'email',
          label: 'Email Address',
          placeholder: 'name@company.com',
          required: true,
          validation: { required: true, email: true },
          order: 3,
        },
        {
          name: 'phone',
          type: 'tel',
          label: 'Phone Number',
          placeholder: '+971 50 123 4567',
          required: true,
          validation: { required: true, minLength: 7, maxLength: 20 },
          order: 4,
        },
      ],
    },
    step2: {
      label: 'Professional Details',
      subLabel: 'A few more details for your pass',
      order: 2,
      fields: [
        {
          name: 'company',
          type: 'text',
          label: 'Company',
          placeholder: 'Enter your company',
          required: true,
          validation: { required: true, minLength: 2, maxLength: 80 },
          order: 1,
        },
        {
          name: 'jobTitle',
          type: 'text',
          label: 'Job Title',
          placeholder: 'Enter your role',
          required: true,
          validation: { required: true, minLength: 2, maxLength: 80 },
          order: 2,
        },
        {
          name: 'dietaryRequirements',
          type: 'textarea',
          label: 'Dietary Requirements',
          placeholder: 'Optional dietary notes',
          required: false,
          validation: { maxLength: 300 },
          rows: 4,
          order: 3,
        },
      ],
    },
  };
}

function toFormResponses(attendee: DemoAttendee) {
  return [
    {
      fieldName: 'firstName',
      fieldLabel: 'First Name',
      fieldType: 'text',
      value: attendee.firstName,
      step: 'step1',
      order: 1,
    },
    {
      fieldName: 'lastName',
      fieldLabel: 'Last Name',
      fieldType: 'text',
      value: attendee.lastName,
      step: 'step1',
      order: 2,
    },
    {
      fieldName: 'email',
      fieldLabel: 'Email Address',
      fieldType: 'email',
      value: attendee.email,
      step: 'step1',
      order: 3,
    },
    {
      fieldName: 'phone',
      fieldLabel: 'Phone Number',
      fieldType: 'tel',
      value: attendee.phone,
      step: 'step1',
      order: 4,
    },
    {
      fieldName: 'company',
      fieldLabel: 'Company',
      fieldType: 'text',
      value: attendee.company,
      step: 'step2',
      order: 1,
    },
    {
      fieldName: 'jobTitle',
      fieldLabel: 'Job Title',
      fieldType: 'text',
      value: attendee.jobTitle,
      step: 'step2',
      order: 2,
    },
    {
      fieldName: 'dietaryRequirements',
      fieldLabel: 'Dietary Requirements',
      fieldType: 'textarea',
      value: attendee.dietaryRequirements || '',
      step: 'step2',
      order: 3,
    },
  ];
}

function dateDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function buildRegistrationUrl(registrationBaseUrl: string, eventId: string): string {
  try {
    const parsed = new URL(registrationBaseUrl);
    parsed.searchParams.set('eventId', eventId);
    return parsed.toString();
  } catch {
    const separator = registrationBaseUrl.includes('?') ? '&' : '?';
    return `${registrationBaseUrl}${separator}eventId=${eventId}`;
  }
}

async function findExistingBlackEvent() {
  const candidates = await prisma.event.findMany({
    where: {
      OR: [{ name: DEMO_EVENT_NAME }, { shortName: DEMO_EVENT_SHORT_NAME }],
    },
    select: {
      id: true,
      config: true,
      createdAt: true,
    },
  });

  const markerCandidate = candidates.find((candidate) => {
    const config = toRecord(candidate.config);
    return config.demoKey === DEMO_EVENT_KEY;
  });

  if (markerCandidate) {
    return markerCandidate.id;
  }

  if (candidates.length > 0) {
    const newest = [...candidates].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    )[0];
    return newest.id;
  }

  return null;
}

async function upsertDemoEvent(registrationBaseUrl: string) {
  const eventId = await findExistingBlackEvent();
  const dateRange = buildDateRange();

  const eventPayload = {
    name: DEMO_EVENT_NAME,
    shortName: DEMO_EVENT_SHORT_NAME,
    location: {
      city: 'Dubai',
      country: 'United Arab Emirates',
      venue: 'Savvio Concorde Demo Lounge',
      timezone: 'Asia/Dubai',
    },
    dateRange,
    config: {
      micrositeUrl: registrationBaseUrl,
      registrationOpen: true,
      demoKey: DEMO_EVENT_KEY,
    } satisfies EventConfigRecord,
    registrationFormConfig: buildRegistrationFormConfig(),
    termsConditions: null,
    privacyPolicy: null,
    active: true,
  };

  if (!eventId) {
    return prisma.event.create({ data: eventPayload });
  }

  return prisma.event.update({
    where: { id: eventId },
    data: eventPayload,
  });
}

async function upsertDemoAdmin(eventId: string) {
  const email = envOrDefault('BLACK_DEMO_ADMIN_EMAIL', DEFAULT_ADMIN_EMAIL).toLowerCase();
  const password = envOrDefault('BLACK_DEMO_ADMIN_PASSWORD', DEFAULT_ADMIN_PASSWORD);
  const firstName = envOrDefault('BLACK_DEMO_ADMIN_FIRST_NAME', DEFAULT_ADMIN_FIRST_NAME);
  const lastName = envOrDefault('BLACK_DEMO_ADMIN_LAST_NAME', DEFAULT_ADMIN_LAST_NAME);
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: {
      firstName,
      lastName,
      passwordHash,
      role: AdminRole.STANDARD,
      active: true,
    },
    create: {
      email,
      firstName,
      lastName,
      passwordHash,
      role: AdminRole.STANDARD,
      active: true,
    },
  });

  await prisma.adminEvent.upsert({
    where: {
      adminId_eventId: {
        adminId: admin.id,
        eventId,
      },
    },
    update: {},
    create: {
      adminId: admin.id,
      eventId,
    },
  });

  return { admin, password };
}

async function upsertDemoAttendees(eventId: string) {
  for (const attendee of demoAttendees) {
    const email = attendee.email.toLowerCase();
    const checkedInAt = attendee.checkedIn ? dateDaysAgo(attendee.daysAgoRegistered) : null;
    const registeredAt = dateDaysAgo(attendee.daysAgoRegistered);

    const existingUser = await prisma.user.findFirst({
      where: {
        eventId,
        email,
      },
      select: {
        id: true,
      },
    });

    const baseData = {
      eventId,
      groupIds: [],
      email,
      formResponses: toFormResponses(attendee),
      communication: {
        emailOptIn: true,
        whatsappOptIn: false,
      },
      assigned: false,
      checkedIn: attendee.checkedIn,
      checkedInAt,
      registeredAt,
      active: true,
    };

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: baseData,
      });
      continue;
    }

    await prisma.user.create({
      data: baseData,
    });
  }
}

function printReadyBlock(input: {
  eventId: string;
  adminEmail: string;
  adminPassword: string;
  dashboardUrl: string;
  registrationUrl: string;
  scannerUrl: string;
  totalAttendees: number;
  checkedInCount: number;
  pendingCount: number;
}) {
  const lines = [
    '',
    '═══════════════════════════════════════════════',
    '  BLACK Intl. Demo Environment — Ready',
    '═══════════════════════════════════════════════',
    '',
    `  Event ID:        ${input.eventId}`,
    `  Event Name:      ${DEMO_EVENT_NAME}`,
    '',
    '  Dashboard Login:',
    `    URL:           ${input.dashboardUrl}`,
    `    Email:         ${input.adminEmail}`,
    `    Password:      ${input.adminPassword}`,
    '',
    `  Registration:    ${input.registrationUrl}`,
    `  Staff Scanner:   ${input.scannerUrl}`,
    '',
    `  Pre-seeded attendees: ${input.totalAttendees} (${input.checkedInCount} checked in, ${input.pendingCount} pending)`,
    '',
    '═══════════════════════════════════════════════',
    '',
  ];

  console.log(lines.join('\n'));
}

async function main() {
  const dashboardUrl = envOrDefault('BLACK_DEMO_DASHBOARD_URL', DEFAULT_DASHBOARD_URL);
  const registrationBaseUrl = envOrDefault(
    'BLACK_DEMO_REGISTRATION_URL',
    DEFAULT_REGISTRATION_URL
  );
  const scannerUrl = envOrDefault('BLACK_DEMO_SCANNER_URL', DEFAULT_SCANNER_URL);

  const event = await upsertDemoEvent(registrationBaseUrl);
  const { admin, password } = await upsertDemoAdmin(event.id);
  await upsertDemoAttendees(event.id);

  const [totalAttendees, checkedInCount] = await Promise.all([
    prisma.user.count({ where: { eventId: event.id, active: true } }),
    prisma.user.count({ where: { eventId: event.id, active: true, checkedIn: true } }),
  ]);

  const pendingCount = Math.max(totalAttendees - checkedInCount, 0);
  const registrationUrl = buildRegistrationUrl(registrationBaseUrl, event.id);

  printReadyBlock({
    eventId: event.id,
    adminEmail: admin.email,
    adminPassword: password,
    dashboardUrl,
    registrationUrl,
    scannerUrl,
    totalAttendees,
    checkedInCount,
    pendingCount,
  });
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Failed to seed BLACK Intl. demo environment:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
