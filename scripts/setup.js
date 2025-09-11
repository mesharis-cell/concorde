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
        email: 'meshari.s@homeofpmg.com',
        firstName: 'Super',
        lastName: 'Admin',
        passwordHash,
        role: 'SUPER',
      },
    });

    console.log('✅ Super admin created successfully!');
    console.log('📧 Email: meshari.s@homeofpmg.com');
    console.log('🔑 Password: admin123');
    console.log('⚠️  Please change the password after first login');
    console.log('');

    // Create a sample event with Phase 2 features
    const event = await prisma.event.create({
      data: {
        name: 'Singapore Grand Prix 2025',
        shortName: 'SGP2025',
        location: {
          city: 'Singapore',
          country: 'Singapore',
          venue: 'Marina Bay Street Circuit',
          timezone: 'Asia/Singapore',
        },
        dateRange: {
          start: new Date('2025-09-19'),
          end: new Date('2025-09-22'),
        },
        config: {
          micrositeUrl: 'https://events.company.com/sgp2025',
          registrationOpen: true,
        },
        // Phase 2: Hotel Configuration
        hotelConfig: {
          hotels: [
            {
              name: 'Marina Bay Sands',
              isDefault: true,
              checkInTime: '15:00',
              checkOutTime: '11:00',
              contractedRooms: [
                // Sep 19 - Arrival Day
                {
                  date: new Date('2025-09-19'),
                  roomType: 'Deluxe King',
                  quantity: 50,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-19'),
                  roomType: 'Premier Twin',
                  quantity: 30,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-19'),
                  roomType: 'Club Suite',
                  quantity: 15,
                  allocated: 0,
                },
                // Sep 20 - Event Day 1
                {
                  date: new Date('2025-09-20'),
                  roomType: 'Deluxe King',
                  quantity: 50,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-20'),
                  roomType: 'Premier Twin',
                  quantity: 30,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-20'),
                  roomType: 'Club Suite',
                  quantity: 15,
                  allocated: 0,
                },
                // Sep 21 - Event Day 2
                {
                  date: new Date('2025-09-21'),
                  roomType: 'Deluxe King',
                  quantity: 50,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-21'),
                  roomType: 'Premier Twin',
                  quantity: 30,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-21'),
                  roomType: 'Club Suite',
                  quantity: 15,
                  allocated: 0,
                },
                // Sep 22 - Checkout Day
                {
                  date: new Date('2025-09-22'),
                  roomType: 'Deluxe King',
                  quantity: 25,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-22'),
                  roomType: 'Premier Twin',
                  quantity: 15,
                  allocated: 0,
                },
              ],
            },
            {
              name: 'The Fullerton Hotel Singapore',
              isDefault: false,
              checkInTime: '14:00',
              checkOutTime: '12:00',
              contractedRooms: [
                {
                  date: new Date('2025-09-19'),
                  roomType: 'Premier Room',
                  quantity: 20,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-19'),
                  roomType: 'Premier Harbour View',
                  quantity: 10,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-20'),
                  roomType: 'Premier Room',
                  quantity: 20,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-20'),
                  roomType: 'Premier Harbour View',
                  quantity: 10,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-21'),
                  roomType: 'Premier Room',
                  quantity: 20,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-21'),
                  roomType: 'Premier Harbour View',
                  quantity: 10,
                  allocated: 0,
                },
              ],
            },
            {
              name: 'Raffles Singapore',
              isDefault: false,
              checkInTime: '15:00',
              checkOutTime: '11:00',
              contractedRooms: [
                {
                  date: new Date('2025-09-19'),
                  roomType: 'Palm Court Suite',
                  quantity: 8,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-19'),
                  roomType: 'Presidential Suite',
                  quantity: 2,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-20'),
                  roomType: 'Palm Court Suite',
                  quantity: 8,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-20'),
                  roomType: 'Presidential Suite',
                  quantity: 2,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-21'),
                  roomType: 'Palm Court Suite',
                  quantity: 8,
                  allocated: 0,
                },
                {
                  date: new Date('2025-09-21'),
                  roomType: 'Presidential Suite',
                  quantity: 2,
                  allocated: 0,
                },
              ],
            },
          ],
        },
        // Phase 2: Terms & Conditions
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
        // Phase 2: Privacy Policy
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
      },
    });

    // Assign admin to event
    await prisma.adminEvent.create({
      data: {
        adminId: admin.id,
        eventId: event.id,
      },
    });

    console.log('✅ Singapore Grand Prix event created: ' + event.name);
    console.log('📅 Date: September 19-22, 2025');
    console.log('📍 Location: Singapore, Marina Bay Street Circuit');
    console.log('🏨 Hotels configured: 3 luxury hotels with room inventory');
    console.log(
      '   • Marina Bay Sands (Default): 3 room types, 4-day inventory'
    );
    console.log('   • The Fullerton Hotel: 2 room types, 3-day inventory');
    console.log('   • Raffles Singapore: 2 room types, 3-day inventory');
    console.log('📋 Legal content: Terms & Conditions + Privacy Policy ready');
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
