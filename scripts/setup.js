#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function setup() {
  console.log('🚀 Setting up Event Concierge Platform...');

  try {
    // Check if super admin already exists
    const existingAdmin = await prisma.admin.findFirst({
      where: { role: 'SUPER' },
    });

    if (existingAdmin) {
      console.log('✅ Super admin already exists');
      return;
    }

    // Create super admin
    const passwordHash = await bcrypt.hash('admin123', 12);
    
    const admin = await prisma.admin.create({
      data: {
        email: 'admin@eventconcierge.com',
        firstName: 'Super',
        lastName: 'Admin',
        passwordHash,
        role: 'SUPER',
      },
    });

    console.log('✅ Super admin created successfully!');
    console.log('📧 Email: admin@eventconcierge.com');
    console.log('🔑 Password: admin123');
    console.log('⚠️  Please change the password after first login');
    console.log('');

    // Create a sample event
    const event = await prisma.event.create({
      data: {
        name: 'Sample Corporate Event 2025',
        shortName: 'SCE2025',
        location: {
          city: 'San Francisco',
          country: 'USA',
          venue: 'Grand Hotel Convention Center',
          timezone: 'America/Los_Angeles',
        },
        dateRange: {
          start: new Date('2025-03-15'),
          end: new Date('2025-03-17'),
        },
        config: {
          micrositeUrl: 'https://events.company.com/sce2025',
          registrationOpen: true,
        },
      },
    });

    // Assign admin to event
    await prisma.adminEvent.create({
      data: {
        adminId: admin.id,
        eventId: event.id,
      },
    });

    console.log('✅ Sample event created: ' + event.name);
    console.log('📅 Date: March 15-17, 2025');
    console.log('📍 Location: San Francisco, USA');
    console.log('');
    console.log('🎉 Setup complete! You can now start the server with:');
    console.log('   bun run dev');
    console.log('');
    console.log('📚 API Documentation: http://localhost:3000/docs');
    console.log('🔍 Health Check: http://localhost:3000/health');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setup();