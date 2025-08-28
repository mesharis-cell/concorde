#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Sample data arrays
const firstNames = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Nancy', 'Daniel', 'Lisa',
  'Matthew', 'Betty', 'Anthony', 'Helen', 'Mark', 'Sandra', 'Donald', 'Donna'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
  'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young'
];


const airlines = [
  'American Airlines', 'Delta Air Lines', 'United Airlines', 'Southwest Airlines',
  'British Airways', 'Lufthansa', 'Emirates', 'Air France', 'KLM', 'Singapore Airlines'
];

const hotels = [
  'Grand Hyatt', 'The Ritz-Carlton', 'Four Seasons', 'St. Regis', 'W Hotel',
  'Marriott', 'Hilton', 'Intercontinental', 'Westin', 'Sheraton'
];

const dietaryRequirements = [
  null, null, null, // Most people have no special requirements
  'Vegetarian', 'Vegan', 'Gluten-free', 'Kosher', 'Halal',
  'Nut allergy', 'Dairy-free', 'Low-sodium'
];

const medicalRequirements = [
  null, null, null, null, // Most people have no medical requirements
  'Wheelchair accessible', 'Hearing impaired', 'Visual impairment',
  'Mobility assistance', 'Medication storage needed'
];

const accessibilityRequirements = [
  null, null, null, null, // Most people have no accessibility requirements
  'Wheelchair accessible', 'Hearing assistance', 'Visual assistance',
  'Sign language interpreter', 'Mobility assistance'
];

const shirtSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const jacketSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const hatSizes = ['S/M', 'L/XL', 'One Size'];

const relationships = ['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Colleague'];

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generatePhoneNumber() {
  const areaCode = Math.floor(Math.random() * 900) + 100;
  const exchange = Math.floor(Math.random() * 900) + 100;
  const number = Math.floor(Math.random() * 9000) + 1000;
  return `+1${areaCode}${exchange}${number}`;
}

function generateFlightNumber() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefix = letters.charAt(Math.floor(Math.random() * letters.length)) + 
                letters.charAt(Math.floor(Math.random() * letters.length));
  const number = Math.floor(Math.random() * 9000) + 1000;
  return prefix + number;
}

function generateDummyUser(eventId, index) {
  const firstName = randomChoice(firstNames);
  const lastName = randomChoice(lastNames);
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${index}@example.com`;
  
  const hasDietary = Math.random() > 0.7; // 30% have dietary requirements
  const hasMedical = Math.random() > 0.9; // 10% have medical requirements
  const hasAccessibility = Math.random() > 0.95; // 5% have accessibility requirements
  const hasSpecialRequests = Math.random() > 0.6; // 40% have special requests
  
  return {
    eventId,
    // USER-PROVIDED FIELDS (required for public registration)
    profile: {
      email,
      firstName,
      lastName,
      phone: generatePhoneNumber(),
    },
    communication: {
      emailOptIn: Math.random() > 0.1, // 90% opt into email
      whatsappOptIn: Math.random() > 0.4, // 60% opt into WhatsApp
    },
    transferRequirements: Math.random() > 0.8 ? randomChoice([
      'Airport pickup required',
      'Wheelchair accessible vehicle',
      'Large vehicle for luggage',
      'Child car seat needed'
    ]) : null,
    requirements: {
      dietary: hasDietary ? randomChoice(dietaryRequirements.filter(r => r !== null)) : null,
      medical: hasMedical ? randomChoice(medicalRequirements.filter(r => r !== null)) : null,
      accessibility: hasAccessibility ? randomChoice(accessibilityRequirements.filter(r => r !== null)) : null,
      specialRequests: hasSpecialRequests ? randomChoice([
        'High floor room', 'Ocean view', 'Non-smoking', 'Late checkout', 'Early checkin',
        'Extra pillows', 'Room service setup', 'Quiet room away from elevators'
      ]) : null,
    },
    merchandiseSize: {
      shirt: randomChoice(shirtSizes),
      jacket: randomChoice(jacketSizes),
      hat: randomChoice(hatSizes),
    },
    emergencyContact: {
      name: `${randomChoice(firstNames)} ${randomChoice(lastNames)}`,
      relationship: randomChoice(relationships),
      phone: generatePhoneNumber(),
      email: Math.random() > 0.3 ? `emergency${index}@example.com` : null,
    },
    
    // ADMIN-MANAGED FIELDS (not provided during public registration, added by admins later)
    // These are set to null/empty and will be managed by admins
    flight: null, // Admin will add flight information later
    accommodation: null, // Admin will manage accommodation details
    
    // System fields
    sessions: [],
    magicLinks: [],
  };
}

async function createDummyUsers() {
  console.log('🚀 Creating dummy users for testing...');

  try {
    // Get all events
    const events = await prisma.event.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });

    if (events.length === 0) {
      console.log('❌ No active events found. Please create an event first.');
      return;
    }

    console.log(`📅 Found ${events.length} active event(s)`);

    let totalUsersCreated = 0;

    for (const event of events) {
      console.log(`\n📝 Creating users for event: ${event.name}`);
      
      // Check if users already exist for this event
      const existingCount = await prisma.user.count({
        where: { eventId: event.id },
      });

      if (existingCount > 0) {
        console.log(`   ⚠️  Event already has ${existingCount} users. Skipping...`);
        continue;
      }

      // Create 25-50 dummy users per event
      const userCount = Math.floor(Math.random() * 26) + 25; // 25-50 users
      console.log(`   🎯 Creating ${userCount} dummy users...`);

      const users = [];
      for (let i = 1; i <= userCount; i++) {
        users.push(generateDummyUser(event.id, i));
      }

      // Create users individually to handle duplicates
      let createdCount = 0;
      for (const userData of users) {
        try {
          await prisma.user.create({
            data: userData,
          });
          createdCount++;
        } catch (error) {
          // Skip duplicates or other errors
          console.log(`   ⚠️  Skipped user ${userData.profile.email}: ${error.message}`);
        }
      }

      console.log(`   ✅ Created ${createdCount} users for ${event.name}`);
      totalUsersCreated += createdCount;
    }

    console.log(`\n🎉 Total dummy users created: ${totalUsersCreated}`);
    console.log('📊 User distribution:');
    
    for (const event of events) {
      const count = await prisma.user.count({
        where: { eventId: event.id },
      });
      console.log(`   • ${event.name}: ${count} users`);
    }

    console.log('\n🔍 Sample user data created with:');
    console.log('   • Realistic names and contact information');
    console.log('   • Communication preferences (90% email, 60% WhatsApp)');
    console.log('   • Transfer requirements (20% of users)');
    console.log('   • Personal requirements:');
    console.log('     - Dietary requirements (30% of users)');
    console.log('     - Medical requirements (10% of users)');
    console.log('     - Accessibility requirements (5% of users)');
    console.log('     - Special requests (40% of users)');
    console.log('   • Merchandise sizes for all users');
    console.log('   • Emergency contacts for all users');
    console.log('   • Flight & accommodation data: Set to null (admin-managed)');
    
    console.log('\n📱 Next steps:');
    console.log('   1. View users in the admin dashboard');
    console.log('   2. Create groups and assign users');
    console.log('   3. Test export functionality');
    console.log('   4. Test communication features');

  } catch (error) {
    console.error('❌ Failed to create dummy users:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createDummyUsers();