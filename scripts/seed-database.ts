#!/usr/bin/env bun
/**
 * Comprehensive Database Seeding Script for Event Concierge Platform
 *
 * Seeds the Singapore Grand Prix 2025 event with:
 * - Guest categories configuration
 * - Groups (5 groups)
 * - Users (75 users with realistic profiles)
 * - Activities (20 activities with rich content)
 * - User activity exclusions (realistic scenarios)
 *
 * Usage: bun scripts/seed-database.ts
 */

import { PrismaClient } from '@prisma/client';
import { ActivityCategory } from '../src/types/index.js';

const prisma = new PrismaClient();

// Constants from existing data
const EVENT_ID = '68c154dac0327741fb457be9'; // Singapore Grand Prix 2025
const ADMIN_ID = '68c154dac0327741fb457be8'; // Super Admin

// Guest Categories for Singapore GP
const GUEST_CATEGORIES = [
  'VIP',
  'CBL',
  'Media',
  'Staff',
  'Production',
  'Corporate',
  'Standard',
];

// Hotel names from existing hotelConfig
const HOTELS = ['Marina Bay Sands', 'The Fullerton Hotel Singapore'];

// Sample companies and job titles
const COMPANIES = [
  'CBL',
  'Pernod Ricard',
  'Formula 1',
  'Singapore GP',
  'Marina Bay Sands',
  'ESPN',
  'Sky Sports',
  'BBC',
  'CNN',
  'Reuters',
  'Getty Images',
  'Red Bull Racing',
  'Mercedes-AMG',
  'Ferrari',
  'McLaren',
  'Aston Martin',
];

const JOB_TITLES = [
  'Production Manager',
  'Marketing Director',
  'Communications Lead',
  'Event Coordinator',
  'Photographer',
  'Journalist',
  'Camera Operator',
  'Sound Engineer',
  'Producer',
  'Account Manager',
  'Brand Manager',
  'PR Manager',
  'Operations Manager',
  'VIP Relations',
  'Hospitality Manager',
  'Security Manager',
  'Logistics Coordinator',
];

const HOSTS = [
  'Sarah Chen',
  'Michael Thompson',
  'Emma Rodriguez',
  'James Wilson',
  'Lisa Park',
  'David Kumar',
  'Rachel Green',
  'Tom Anderson',
  'Sophie Martinez',
  'Alex Johnson',
];

// Activity categories and realistic F1 weekend activities
const ACTIVITIES_DATA = [
  // Transport
  {
    title: 'Airport Transfer - Arrival',
    description: 'Private transfer from Changi Airport to hotel',
    category: 'TRANSPORT' as ActivityCategory,
    startDateTime: new Date('2025-09-19T08:00:00.000Z'),
    endDateTime: new Date('2025-09-19T20:00:00.000Z'),
    capacity: null,
    content: {
      html: '<p>Complimentary private transfer service from Singapore Changi Airport to your designated hotel. Look for your driver holding a sign with your name at the arrival hall.</p>',
    },
    location: {
      name: 'Singapore Changi Airport',
      address: 'Airport Blvd, Singapore 819643',
      mapLink: 'https://maps.google.com/?q=Singapore+Changi+Airport',
    },
    timingTable: [
      {
        enabled: true,
        time: '08:00',
        description: 'Transfer service begins',
        location: 'Changi Airport Terminal 1-3',
      },
      {
        enabled: true,
        time: '20:00',
        description: 'Last transfer of the day',
        location: 'Changi Airport',
      },
    ],
  },
  {
    title: 'Circuit Shuttle Service',
    description: 'Shuttle service between hotels and Marina Bay Street Circuit',
    category: 'TRANSPORT' as ActivityCategory,
    startDateTime: new Date('2025-09-20T07:00:00.000Z'),
    endDateTime: new Date('2025-09-22T23:00:00.000Z'),
    capacity: null,
    content: {
      html: '<p>Regular shuttle service running every 30 minutes between partner hotels and the Marina Bay Street Circuit. Service includes:</p><ul><li>Air-conditioned coaches</li><li>Professional drivers</li><li>Direct route to paddock entrance</li></ul>',
    },
    location: {
      name: 'Marina Bay Street Circuit',
      address: '1 Republic Blvd, Singapore 038975',
      mapLink: 'https://maps.google.com/?q=Marina+Bay+Street+Circuit',
    },
    timingTable: [
      {
        enabled: true,
        time: '07:00',
        description: 'First shuttle departure',
        location: 'Hotel lobbies',
      },
      {
        enabled: true,
        time: '23:00',
        description: 'Last shuttle return',
        location: 'Circuit main entrance',
      },
    ],
  },

  // Hospitality Events
  {
    title: 'Welcome Reception',
    description: 'Exclusive welcome cocktail reception for all guests',
    category: 'HOSPITALITY' as ActivityCategory,
    startDateTime: new Date('2025-09-19T19:00:00.000Z'),
    endDateTime: new Date('2025-09-19T22:00:00.000Z'),
    capacity: 150,
    content: {
      html: '<h2>Welcome to Singapore Grand Prix 2025</h2><p>Join us for an elegant welcome reception featuring:</p><ul><li>Premium cocktails and canapés</li><li>Live jazz entertainment</li><li>Networking opportunities</li><li>Welcome address by event organizers</li></ul><p><strong>Dress Code:</strong> Smart casual</p>',
    },
    location: {
      name: 'Marina Bay Sands SkyPark',
      address: '10 Bayfront Ave, Singapore 018956',
      mapLink: 'https://maps.google.com/?q=Marina+Bay+Sands+SkyPark',
    },
    timingTable: [
      {
        enabled: true,
        time: '19:00',
        description: 'Reception begins - Cocktails served',
        location: 'SkyPark Observation Deck',
      },
      {
        enabled: true,
        time: '20:00',
        description: 'Welcome address',
        location: 'Main reception area',
      },
      {
        enabled: true,
        time: '21:30',
        description: 'Live jazz performance',
        location: 'Terrace area',
      },
    ],
  },
  {
    title: 'Gala Dinner',
    description: 'Black-tie gala dinner with F1 legends',
    category: 'HOSPITALITY' as ActivityCategory,
    startDateTime: new Date('2025-09-21T19:30:00.000Z'),
    endDateTime: new Date('2025-09-21T23:30:00.000Z'),
    capacity: 120,
    content: {
      html: '<h2>Singapore GP Gala Dinner</h2><p>An unforgettable evening celebrating the pinnacle of motorsport:</p><ul><li>Five-course dinner by Michelin-starred chefs</li><li>Guest speakers: F1 legends and current drivers</li><li>Live auction for charity</li><li>Awards ceremony</li><li>Dancing until late</li></ul><p><strong>Dress Code:</strong> Black tie</p><p><em>Dietary requirements will be accommodated based on your registration preferences.</em></p>',
    },
    location: {
      name: 'The Fullerton Hotel Singapore',
      address: '1 Fullerton Square, Singapore 049178',
      mapLink: 'https://maps.google.com/?q=The+Fullerton+Hotel+Singapore',
    },
    timingTable: [
      {
        enabled: true,
        time: '19:30',
        description: 'Cocktail reception',
        location: 'The Courtyard',
      },
      {
        enabled: true,
        time: '20:30',
        description: 'Dinner service begins',
        location: 'Town Restaurant',
      },
      {
        enabled: true,
        time: '22:00',
        description: 'Guest speaker presentation',
        location: 'Main dining room',
      },
      {
        enabled: true,
        time: '23:00',
        description: 'Dancing and entertainment',
        location: 'The Lighthouse',
      },
    ],
  },

  // Race Weekend Experiences
  {
    title: 'Friday Practice Sessions',
    description: 'Free Practice 1 & 2 viewing from premium grandstand',
    category: 'EXPERIENCE' as ActivityCategory,
    startDateTime: new Date('2025-09-20T13:30:00.000Z'),
    endDateTime: new Date('2025-09-20T17:00:00.000Z'),
    capacity: 80,
    content: {
      html: "<h2>Friday Practice Sessions</h2><p>Experience the thrill of Formula 1 practice sessions:</p><ul><li>Premium grandstand seating with perfect track views</li><li>Complimentary refreshments</li><li>Technical commentary via headsets</li><li>Access to timing screens</li></ul><table class='border-collapse border border-gray-300 w-full my-4'><thead><tr><th class='border border-gray-300 p-2 bg-gray-50'>Session</th><th class='border border-gray-300 p-2 bg-gray-50'>Time</th><th class='border border-gray-300 p-2 bg-gray-50'>Duration</th></tr></thead><tbody><tr><td class='border border-gray-300 p-2'>Free Practice 1</td><td class='border border-gray-300 p-2'>13:30 - 14:30</td><td class='border border-gray-300 p-2'>90 minutes</td></tr><tr><td class='border border-gray-300 p-2'>Free Practice 2</td><td class='border border-gray-300 p-2'>17:00 - 18:00</td><td class='border border-gray-300 p-2'>90 minutes</td></tr></tbody></table>",
    },
    location: {
      name: 'Turn 1 Grandstand',
      address: 'Marina Bay Street Circuit, Singapore',
      mapLink: 'https://maps.google.com/?q=Marina+Bay+Street+Circuit+Turn+1',
    },
    timingTable: [
      {
        enabled: true,
        time: '13:00',
        description: 'Grandstand access opens',
        location: 'Turn 1 Grandstand entrance',
      },
      {
        enabled: true,
        time: '13:30',
        description: 'Free Practice 1 begins',
        location: 'Turn 1 Grandstand',
      },
      {
        enabled: true,
        time: '16:30',
        description: 'Free Practice 2 begins',
        location: 'Turn 1 Grandstand',
      },
    ],
  },
  {
    title: 'Qualifying Session',
    description: 'Saturday qualifying from exclusive Paddock Club',
    category: 'EXPERIENCE' as ActivityCategory,
    startDateTime: new Date('2025-09-21T16:00:00.000Z'),
    endDateTime: new Date('2025-09-21T18:00:00.000Z'),
    capacity: 60,
    content: {
      html: '<h2>Qualifying Session - Paddock Club</h2><p>The most exclusive F1 experience:</p><ul><li>Paddock Club premium hospitality</li><li>Gourmet dining throughout the session</li><li>Premium bar service</li><li>Pit lane walk opportunities</li><li>Meet & greet with F1 personalities</li></ul><p><strong>Includes:</strong> Welcome champagne, three-course lunch, afternoon tea</p>',
    },
    location: {
      name: 'F1 Paddock Club',
      address: 'Marina Bay Street Circuit Paddock',
      mapLink: 'https://maps.google.com/?q=Marina+Bay+Street+Circuit+Paddock',
    },
    timingTable: [
      {
        enabled: true,
        time: '14:00',
        description: 'Paddock Club access',
        location: 'Paddock Club entrance',
      },
      {
        enabled: true,
        time: '15:00',
        description: 'Welcome lunch service',
        location: 'Paddock Club restaurant',
      },
      {
        enabled: true,
        time: '16:00',
        description: 'Qualifying Q1 begins',
        location: 'Paddock Club viewing terrace',
      },
      {
        enabled: true,
        time: '17:30',
        description: 'Post-qualifying reception',
        location: 'Paddock Club lounge',
      },
    ],
  },
  {
    title: 'Race Day - Singapore Grand Prix',
    description: 'The main event - Singapore Grand Prix race',
    category: 'EXPERIENCE' as ActivityCategory,
    startDateTime: new Date('2025-09-22T18:00:00.000Z'),
    endDateTime: new Date('2025-09-22T22:00:00.000Z'),
    capacity: 100,
    content: {
      html: '<h1>Singapore Grand Prix 2025 - Race Day</h1><p>The pinnacle of the weekend - witness history in the making:</p><ul><li>Premium grandstand seating with unobstructed views</li><li>Pre-race champagne reception</li><li>Gourmet dinner service during race</li><li>Post-race celebration access</li><li>Podium ceremony viewing</li></ul><p><strong>Race Distance:</strong> 61 laps / 308.828 km</p><p><em>This is a night race under floodlights - truly spectacular!</em></p>',
    },
    location: {
      name: 'Marina Bay Street Circuit',
      address: '1 Republic Blvd, Singapore 038975',
      mapLink: 'https://maps.google.com/?q=Marina+Bay+Street+Circuit',
    },
    timingTable: [
      {
        enabled: true,
        time: '16:00',
        description: 'Grandstand access opens',
        location: 'Main grandstand',
      },
      {
        enabled: true,
        time: '17:00',
        description: 'Pre-race reception',
        location: 'Hospitality suite',
      },
      {
        enabled: true,
        time: '18:00',
        description: 'Singapore Grand Prix begins',
        location: 'Starting grid',
      },
      {
        enabled: true,
        time: '20:30',
        description: 'Podium ceremony',
        location: 'Main straight',
      },
    ],
  },
  {
    title: 'Pit Lane Walk',
    description: 'Exclusive behind-the-scenes pit lane access',
    category: 'EXPERIENCE' as ActivityCategory,
    startDateTime: new Date('2025-09-21T10:00:00.000Z'),
    endDateTime: new Date('2025-09-21T11:30:00.000Z'),
    capacity: 25,
    content: {
      html: '<h2>Exclusive Pit Lane Walk</h2><p>Get up close to the action with exclusive pit lane access:</p><ul><li>Walk down the famous pit lane</li><li>See the garages and team equipment</li><li>Photo opportunities with F1 cars</li><li>Technical briefing from F1 expert</li><li>Meet team personnel (subject to availability)</li></ul><p><strong>Duration:</strong> 90 minutes</p><p><strong>Group Size:</strong> Maximum 25 people for intimate experience</p>',
    },
    location: {
      name: 'Marina Bay Street Circuit Pit Lane',
      address: 'Marina Bay Street Circuit Paddock',
      mapLink: 'https://maps.google.com/?q=Marina+Bay+Street+Circuit+Pit+Lane',
    },
    timingTable: [
      {
        enabled: true,
        time: '09:45',
        description: 'Meet at paddock entrance',
        location: 'Paddock security checkpoint',
      },
      {
        enabled: true,
        time: '10:00',
        description: 'Pit lane walk begins',
        location: 'Pit lane entry',
      },
      {
        enabled: true,
        time: '10:45',
        description: 'Garage visits',
        location: 'Team garages',
      },
      {
        enabled: true,
        time: '11:15',
        description: 'Q&A with F1 expert',
        location: 'Pit wall area',
      },
    ],
  },

  // Meeting/Business
  {
    title: 'Sponsor Briefing Session',
    description: 'Private briefing for corporate sponsors and partners',
    category: 'MEETING' as ActivityCategory,
    startDateTime: new Date('2025-09-20T09:00:00.000Z'),
    endDateTime: new Date('2025-09-20T11:00:00.000Z'),
    capacity: 40,
    content: {
      html: '<h2>Corporate Sponsor Briefing</h2><p>Exclusive session for sponsors and corporate partners:</p><ul><li>2025 season review and highlights</li><li>2026 partnership opportunities</li><li>Brand activation case studies</li><li>Networking with F1 commercial team</li><li>Q&A session</li></ul><p><strong>Attendees:</strong> Corporate sponsors, partners, and key stakeholders only</p>',
    },
    location: {
      name: 'Marina Bay Sands Convention Centre',
      address: '10 Bayfront Ave, Singapore 018956',
      mapLink: 'https://maps.google.com/?q=Marina+Bay+Sands+Convention+Centre',
    },
    timingTable: [
      {
        enabled: true,
        time: '08:30',
        description: 'Registration and coffee',
        location: 'Convention Centre Lobby',
      },
      {
        enabled: true,
        time: '09:00',
        description: 'Welcome and introductions',
        location: 'Meeting Room A',
      },
      {
        enabled: true,
        time: '09:30',
        description: 'Season review presentation',
        location: 'Meeting Room A',
      },
      {
        enabled: true,
        time: '10:30',
        description: 'Partnership opportunities',
        location: 'Meeting Room A',
      },
    ],
  },
  {
    title: 'Media Briefing',
    description: 'Press conference and media briefing session',
    category: 'MEETING' as ActivityCategory,
    startDateTime: new Date('2025-09-20T14:00:00.000Z'),
    endDateTime: new Date('2025-09-20T15:30:00.000Z'),
    capacity: 50,
    content: {
      html: '<h2>Media Briefing Session</h2><p>Official press conference for accredited media:</p><ul><li>Driver interviews and Q&A</li><li>Team principal statements</li><li>Race weekend preview</li><li>Technical regulations update</li><li>Photo opportunities</li></ul><p><strong>Accreditation Required:</strong> Valid media credentials must be presented</p>',
    },
    location: {
      name: 'Marina Bay Street Circuit Media Centre',
      address: 'Marina Bay Street Circuit',
      mapLink:
        'https://maps.google.com/?q=Marina+Bay+Street+Circuit+Media+Centre',
    },
    timingTable: [
      {
        enabled: true,
        time: '13:45',
        description: 'Media check-in',
        location: 'Media Centre entrance',
      },
      {
        enabled: true,
        time: '14:00',
        description: 'Press conference begins',
        location: 'Media Centre auditorium',
      },
      {
        enabled: true,
        time: '14:45',
        description: 'Individual interviews',
        location: 'Interview rooms',
      },
      {
        enabled: true,
        time: '15:15',
        description: 'Photo session',
        location: 'Media Centre terrace',
      },
    ],
  },

  // Additional Activities
  {
    title: 'Singapore City Tour',
    description: "Guided tour of Singapore's iconic landmarks",
    category: 'EXPERIENCE' as ActivityCategory,
    startDateTime: new Date('2025-09-19T14:00:00.000Z'),
    endDateTime: new Date('2025-09-19T18:00:00.000Z'),
    capacity: 35,
    content: {
      html: "<h2>Discover Singapore</h2><p>Explore the Lion City's most famous attractions:</p><ul><li>Merlion Park and Marina Bay</li><li>Gardens by the Bay</li><li>Chinatown heritage district</li><li>Little India cultural quarter</li><li>Clarke Quay riverside</li></ul><p>Includes air-conditioned coach transport and professional guide.</p>",
    },
    location: {
      name: 'Singapore City Centre',
      address: 'Various locations',
      mapLink: 'https://maps.google.com/?q=Singapore+City+Centre',
    },
    timingTable: [
      {
        enabled: true,
        time: '14:00',
        description: 'Departure from hotels',
        location: 'Hotel lobbies',
      },
      {
        enabled: true,
        time: '14:30',
        description: 'Merlion Park visit',
        location: 'Merlion Park',
      },
      {
        enabled: true,
        time: '15:30',
        description: 'Gardens by the Bay',
        location: 'Gardens by the Bay',
      },
      {
        enabled: true,
        time: '17:00',
        description: 'Chinatown exploration',
        location: 'Chinatown',
      },
    ],
  },
  {
    title: 'Sunrise Breakfast',
    description: 'Early morning breakfast with panoramic city views',
    category: 'HOSPITALITY' as ActivityCategory,
    startDateTime: new Date('2025-09-21T06:30:00.000Z'),
    endDateTime: new Date('2025-09-21T08:30:00.000Z'),
    capacity: 30,
    content: {
      html: '<h2>Sunrise Breakfast Experience</h2><p>Start your race day with a spectacular sunrise breakfast:</p><ul><li>Panoramic views of Singapore skyline</li><li>Continental and Asian breakfast options</li><li>Fresh tropical fruits</li><li>Premium coffee and teas</li><li>Perfect photo opportunities</li></ul><p><em>Early start but worth it for the views!</em></p>',
    },
    location: {
      name: 'Marina Bay Sands SkyPark',
      address: '10 Bayfront Ave, Singapore 018956',
      mapLink: 'https://maps.google.com/?q=Marina+Bay+Sands+SkyPark',
    },
    timingTable: [
      {
        enabled: true,
        time: '06:30',
        description: 'Breakfast service begins',
        location: 'SkyPark observation deck',
      },
      {
        enabled: true,
        time: '07:00',
        description: 'Sunrise viewing',
        location: 'East-facing terrace',
      },
      {
        enabled: true,
        time: '08:00',
        description: 'Coffee and pastries',
        location: 'Indoor dining area',
      },
    ],
  },
  {
    title: 'VIP Lounge Access',
    description: 'Exclusive access to VIP hospitality lounge',
    category: 'HOSPITALITY' as ActivityCategory,
    startDateTime: new Date('2025-09-20T10:00:00.000Z'),
    endDateTime: new Date('2025-09-22T22:00:00.000Z'),
    capacity: 25,
    content: {
      html: '<h2>VIP Hospitality Lounge</h2><p>Exclusive lounge access throughout the weekend:</p><ul><li>Private lounge with air conditioning</li><li>Premium bar and dining service</li><li>Comfortable seating areas</li><li>Private restroom facilities</li><li>Concierge service</li><li>Wi-Fi and charging stations</li></ul><p><strong>Access:</strong> VIP guests only</p>',
    },
    location: {
      name: 'Marina Bay Street Circuit VIP Lounge',
      address: 'Marina Bay Street Circuit',
      mapLink: 'https://maps.google.com/?q=Marina+Bay+Street+Circuit',
    },
    timingTable: [
      {
        enabled: true,
        time: '10:00',
        description: 'Lounge opens',
        location: 'VIP Lounge entrance',
      },
      {
        enabled: true,
        time: '12:00',
        description: 'Lunch service',
        location: 'VIP Lounge dining area',
      },
      {
        enabled: true,
        time: '17:00',
        description: 'Evening cocktails',
        location: 'VIP Lounge bar',
      },
    ],
  },
  {
    title: 'Photography Workshop',
    description: 'Professional motorsport photography workshop',
    category: 'EXPERIENCE' as ActivityCategory,
    startDateTime: new Date('2025-09-20T11:00:00.000Z'),
    endDateTime: new Date('2025-09-20T13:00:00.000Z'),
    capacity: 15,
    content: {
      html: '<h2>Motorsport Photography Workshop</h2><p>Learn from professional F1 photographers:</p><ul><li>Camera settings for high-speed action</li><li>Composition techniques</li><li>Best shooting locations around the circuit</li><li>Post-processing tips</li><li>Equipment recommendations</li></ul><p><strong>Bring:</strong> Your own camera equipment</p><p><strong>Level:</strong> Intermediate to advanced</p>',
    },
    location: {
      name: 'Marina Bay Street Circuit Media Centre',
      address: 'Marina Bay Street Circuit',
      mapLink:
        'https://maps.google.com/?q=Marina+Bay+Street+Circuit+Media+Centre',
    },
    timingTable: [
      {
        enabled: true,
        time: '11:00',
        description: 'Workshop introduction',
        location: 'Media Centre classroom',
      },
      {
        enabled: true,
        time: '11:30',
        description: 'Technical session',
        location: 'Media Centre classroom',
      },
      {
        enabled: true,
        time: '12:00',
        description: 'Practical shooting',
        location: 'Circuit trackside',
      },
      {
        enabled: true,
        time: '12:45',
        description: 'Review and feedback',
        location: 'Media Centre classroom',
      },
    ],
  },
  {
    title: 'Farewell Brunch',
    description: 'Sunday farewell brunch before departures',
    category: 'HOSPITALITY' as ActivityCategory,
    startDateTime: new Date('2025-09-23T10:00:00.000Z'),
    endDateTime: new Date('2025-09-23T13:00:00.000Z'),
    capacity: 80,
    content: {
      html: '<h2>Farewell Brunch</h2><p>A relaxed farewell gathering before departures:</p><ul><li>International brunch buffet</li><li>Mimosas and fresh juices</li><li>Live acoustic music</li><li>Photo slideshow from the weekend</li><li>Exchange of contact details</li><li>Thank you gifts</li></ul><p>Perfect way to end an incredible weekend!</p>',
    },
    location: {
      name: 'The Fullerton Hotel Singapore',
      address: '1 Fullerton Square, Singapore 049178',
      mapLink: 'https://maps.google.com/?q=The+Fullerton+Hotel+Singapore',
    },
    timingTable: [
      {
        enabled: true,
        time: '10:00',
        description: 'Brunch service begins',
        location: 'The Courtyard',
      },
      {
        enabled: true,
        time: '11:00',
        description: 'Weekend photo slideshow',
        location: 'Main dining area',
      },
      {
        enabled: true,
        time: '12:00',
        description: 'Thank you presentation',
        location: 'Main dining area',
      },
      {
        enabled: true,
        time: '12:30',
        description: 'Farewell networking',
        location: 'Terrace area',
      },
    ],
  },
  {
    title: 'Airport Transfer - Departure',
    description: 'Private transfer from hotel to Changi Airport',
    category: 'TRANSPORT' as ActivityCategory,
    startDateTime: new Date('2025-09-23T06:00:00.000Z'),
    endDateTime: new Date('2025-09-23T18:00:00.000Z'),
    capacity: null,
    content: {
      html: '<p>Complimentary private transfer service from your hotel to Singapore Changi Airport. Please confirm your departure time with concierge at least 24 hours in advance.</p><p><strong>Recommended:</strong> Allow 3 hours before international flights</p>',
    },
    location: {
      name: 'Singapore Changi Airport',
      address: 'Airport Blvd, Singapore 819643',
      mapLink: 'https://maps.google.com/?q=Singapore+Changi+Airport',
    },
    timingTable: [
      {
        enabled: true,
        time: '06:00',
        description: 'First departure transfer',
        location: 'Hotel lobbies',
      },
      {
        enabled: true,
        time: '18:00',
        description: 'Last departure transfer',
        location: 'Hotel lobbies',
      },
    ],
  },
];

// Group configurations
const GROUPS_DATA = [
  {
    name: 'VIP Guests',
    description:
      'Premium VIP guests with exclusive access and personalized service',
  },
  {
    name: 'Corporate Partners',
    description: 'Corporate sponsors, partners, and key business stakeholders',
  },
  {
    name: 'Media & Press',
    description: 'Accredited journalists, photographers, and media personnel',
  },
  {
    name: 'Production Team',
    description: 'Event production staff, coordinators, and technical crew',
  },
  {
    name: 'Hospitality Staff',
    description: 'Guest services, catering, and hospitality management team',
  },
];

// Sample user data generator
function generateUserProfile(index: number) {
  const firstNames = [
    'Emma',
    'James',
    'Sophie',
    'Michael',
    'Isabella',
    'William',
    'Olivia',
    'Alexander',
    'Ava',
    'Benjamin',
    'Charlotte',
    'Lucas',
    'Amelia',
    'Henry',
    'Harper',
    'Sebastian',
    'Evelyn',
    'Theodore',
    'Abigail',
    'Oliver',
    'Emily',
    'Daniel',
    'Elizabeth',
    'Matthew',
    'Sofia',
    'Jackson',
    'Avery',
    'David',
    'Ella',
    'Joseph',
    'Scarlett',
    'Samuel',
    'Grace',
    'John',
    'Chloe',
    'Luke',
    'Victoria',
    'Anthony',
    'Riley',
    'Isaac',
    'Aria',
    'Gabriel',
    'Zoey',
    'Julian',
    'Lily',
    'Levi',
    'Eleanor',
    'Christopher',
    'Hannah',
    'Joshua',
    'Lillian',
    'Andrew',
    'Addison',
    'Elias',
    'Natalie',
    'Wayne',
    'Luna',
    'Kevin',
    'Savannah',
    'Thomas',
    'Brooklyn',
    'Caleb',
    'Leah',
    'Ryan',
    'Zoe',
    'Nathan',
    'Stella',
    'Adrian',
    'Hazel',
    'Richard',
    'Ellie',
    'Brian',
    'Paisley',
    'Josiah',
    'Audrey',
    'Miles',
    'Skylar',
    'Noah',
    'Violet',
    'Aaron',
  ];

  const lastNames = [
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Garcia',
    'Miller',
    'Davis',
    'Rodriguez',
    'Martinez',
    'Hernandez',
    'Lopez',
    'Gonzalez',
    'Wilson',
    'Anderson',
    'Thomas',
    'Taylor',
    'Moore',
    'Jackson',
    'Martin',
    'Lee',
    'Perez',
    'Thompson',
    'White',
    'Harris',
    'Sanchez',
    'Clark',
    'Ramirez',
    'Lewis',
    'Robinson',
    'Walker',
    'Young',
    'Allen',
    'King',
    'Wright',
    'Scott',
    'Torres',
    'Nguyen',
    'Hill',
    'Flores',
    'Green',
    'Adams',
    'Nelson',
    'Baker',
    'Hall',
    'Rivera',
    'Campbell',
    'Mitchell',
    'Carter',
    'Roberts',
    'Gomez',
    'Phillips',
    'Evans',
    'Turner',
    'Diaz',
    'Parker',
    'Cruz',
    'Edwards',
    'Collins',
    'Reyes',
    'Stewart',
    'Morris',
    'Morales',
    'Murphy',
    'Cook',
    'Rogers',
    'Gutierrez',
    'Ortiz',
    'Morgan',
    'Cooper',
    'Peterson',
    'Bailey',
  ];

  const firstName = firstNames[index % firstNames.length];
  const lastName =
    lastNames[Math.floor(index / firstNames.length) % lastNames.length];
  const company = COMPANIES[index % COMPANIES.length];
  const jobTitle = JOB_TITLES[index % JOB_TITLES.length];
  const host = HOSTS[index % HOSTS.length];
  const guestCategory = GUEST_CATEGORIES[index % GUEST_CATEGORIES.length];

  // Generate realistic phone numbers
  const countryCode = ['+44', '+1', '+33', '+49', '+61', '+65', '+852'][
    index % 7
  ];
  const phoneNumber = `${countryCode} ${Math.floor(Math.random() * 9000000000 + 1000000000)}`;

  // Generate email
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${company.toLowerCase().replace(/\s+/g, '')}.com`;

  return {
    profile: {
      email,
      firstName,
      lastName,
      phone: phoneNumber,
      preferredFirstName: Math.random() > 0.7 ? firstName : undefined,
      jobTitle,
      company,
      vip: guestCategory === 'VIP' || Math.random() > 0.8,
      host,
    },
    guestCategory,
    communication: {
      emailOptIn: Math.random() > 0.1, // 90% opt in to email
      whatsappOptIn: Math.random() > 0.3, // 70% opt in to WhatsApp
    },
    flight:
      Math.random() > 0.2
        ? {
            inbound: {
              departureFrom: [
                'London Heathrow (LHR)',
                'New York JFK',
                'Tokyo Narita (NRT)',
                'Sydney (SYD)',
                'Dubai (DXB)',
              ][index % 5],
              departureDateTime: new Date(
                `2025-09-${18 + (index % 2)}T${String(8 + (index % 12)).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}:00.000Z`
              ),
              departureTerminal: `Terminal ${(index % 5) + 1}`,
              flightNumber: `${['BA', 'AA', 'JL', 'QF', 'EK'][index % 5]} ${1000 + ((index * 13) % 8000)}`,
              airline: [
                'British Airways',
                'American Airlines',
                'Japan Airlines',
                'Qantas',
                'Emirates',
              ][index % 5],
              arrivalDateTime: new Date(
                `2025-09-${19 + (index % 2)}T${String(10 + (index % 10)).padStart(2, '0')}:${String((index * 11) % 60).padStart(2, '0')}:00.000Z`
              ),
              arrivalToAirport: 'Singapore Changi (SIN)',
              arrivalToTerminal: `Terminal ${(index % 3) + 1}`,
            },
            outbound: {
              departureFrom: 'Singapore Changi (SIN)',
              departureDateTime: new Date(
                `2025-09-${23 + (index % 3)}T${String(6 + (index % 12)).padStart(2, '0')}:${String((index * 17) % 60).padStart(2, '0')}:00.000Z`
              ),
              departureTerminal: `Terminal ${(index % 3) + 1}`,
              flightNumber: `${['BA', 'AA', 'JL', 'QF', 'EK'][index % 5]} ${2000 + ((index * 19) % 7000)}`,
              airline: [
                'British Airways',
                'American Airlines',
                'Japan Airlines',
                'Qantas',
                'Emirates',
              ][index % 5],
              arrivalToAirport: [
                'London Heathrow (LHR)',
                'New York JFK',
                'Tokyo Narita (NRT)',
                'Sydney (SYD)',
                'Dubai (DXB)',
              ][index % 5],
            },
          }
        : undefined,
    accommodation:
      Math.random() > 0.1
        ? {
            required: true,
            hotel: HOTELS[index % HOTELS.length],
            checkIn: new Date(
              `2025-09-${18 + (index % 2)}T${14 + (index % 4)}:00:00.000Z`
            ),
            checkOut: new Date(
              `2025-09-${23 + (index % 3)}T${10 + (index % 4)}:00:00.000Z`
            ),
            doubleOccupancy:
              Math.random() > 0.7
                ? {
                    enabled: true,
                    guestType: Math.random() > 0.5 ? 'official' : 'plus-one',
                    guestName:
                      Math.random() > 0.5
                        ? `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`
                        : undefined,
                    guestRelation: ['Spouse', 'Partner', 'Colleague'][
                      Math.floor(Math.random() * 3)
                    ],
                  }
                : { enabled: false },
            visaBookingRequired: Math.random() > 0.8,
          }
        : undefined,
    requirements:
      Math.random() > 0.6
        ? {
            dietary:
              Math.random() > 0.7
                ? {
                    enabled: true,
                    details: [
                      'Vegetarian',
                      'Vegan',
                      'Halal',
                      'Kosher',
                      'Gluten-free',
                      'No shellfish',
                    ][Math.floor(Math.random() * 6)],
                  }
                : undefined,
            medical:
              Math.random() > 0.9
                ? {
                    enabled: true,
                    details: 'Requires wheelchair access',
                  }
                : undefined,
            allergiesIntolerances:
              Math.random() > 0.8
                ? {
                    enabled: true,
                    details: [
                      'Nut allergy',
                      'Dairy intolerance',
                      'Shellfish allergy',
                    ][Math.floor(Math.random() * 3)],
                  }
                : undefined,
          }
        : undefined,
    merchandiseSize:
      Math.random() > 0.3
        ? {
            gender: Math.random() > 0.5 ? 'Men' : 'Women',
            size: ['S', 'M', 'L', 'XL'][Math.floor(Math.random() * 4)],
          }
        : undefined,
    emergencyContact:
      Math.random() > 0.2
        ? {
            name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
            relationship: ['Spouse', 'Partner', 'Parent', 'Sibling', 'Friend'][
              Math.floor(Math.random() * 5)
            ],
            phone: `${countryCode} ${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
            email:
              Math.random() > 0.3
                ? `emergency${Math.floor(Math.random() * 1000)}@example.com`
                : undefined,
          }
        : undefined,
  };
}

async function main() {
  console.log('🌱 Starting comprehensive database seeding...');

  try {
    // 1. Update Event with guest categories
    console.log('📝 Adding guest categories to Singapore GP event...');
    await prisma.event.update({
      where: { id: EVENT_ID },
      data: {
        guestCategories: {
          categories: GUEST_CATEGORIES,
        },
      },
    });

    // 2. Create Groups
    console.log('👥 Creating groups...');
    const createdGroups = [];
    for (const groupData of GROUPS_DATA) {
      const group = await prisma.group.create({
        data: {
          eventId: EVENT_ID,
          name: groupData.name,
          description: groupData.description,
        },
      });
      createdGroups.push(group);
      console.log(`   ✅ Created group: ${group.name}`);
    }

    // 3. Create Activities
    console.log('🎯 Creating activities...');
    const createdActivities = [];
    for (const activityData of ACTIVITIES_DATA) {
      // Assign activity to 1-3 random groups
      const numGroups = Math.floor(Math.random() * 3) + 1;
      const assignedGroups = createdGroups
        .sort(() => 0.5 - Math.random())
        .slice(0, numGroups);

      const activity = await prisma.activity.create({
        data: {
          eventId: EVENT_ID,
          groupIds: assignedGroups.map((g) => g.id),
          title: activityData.title,
          description: activityData.description,
          startDateTime: activityData.startDateTime,
          endDateTime: activityData.endDateTime,
          thumbnail: null,
          category: activityData.category,
          location: activityData.location,
          content: activityData.content,
          capacity: activityData.capacity,
          timingTable: activityData.timingTable,
          createdBy: ADMIN_ID,
          lastModifiedBy: ADMIN_ID,
          lastModifiedAt: new Date(),
        },
      });

      // Update group activityIds arrays
      for (const group of assignedGroups) {
        await prisma.group.update({
          where: { id: group.id },
          data: {
            activityIds: {
              push: activity.id,
            },
          },
        });
      }

      createdActivities.push(activity);
      console.log(
        `   ✅ Created activity: ${activity.title} (assigned to ${assignedGroups.length} groups)`
      );
    }

    // 4. Create Users
    console.log('👤 Creating users...');
    const createdUsers = [];
    for (let i = 0; i < 75; i++) {
      const userData = generateUserProfile(i);

      // Assign user to 1-2 random groups
      const numGroups = Math.random() > 0.7 ? 2 : 1;
      const assignedGroups = createdGroups
        .sort(() => 0.5 - Math.random())
        .slice(0, numGroups);

      const user = await prisma.user.create({
        data: {
          eventId: EVENT_ID,
          groupIds: assignedGroups.map((g) => g.id),
          profile: userData.profile,
          communication: userData.communication,
          flight: userData.flight,
          accommodation: userData.accommodation,
          requirements: userData.requirements,
          merchandiseSize: userData.merchandiseSize,
          emergencyContact: userData.emergencyContact,
          guestCategory: userData.guestCategory,
          assigned: true,
          assignedAt: new Date(),
          assignedBy: ADMIN_ID,
        },
      });

      createdUsers.push(user);

      if ((i + 1) % 10 === 0) {
        console.log(`   ✅ Created ${i + 1}/75 users...`);
      }
    }

    // 5. Update group member counts
    console.log('📊 Updating group member counts...');
    for (const group of createdGroups) {
      const memberCount = await prisma.user.count({
        where: {
          groupIds: { has: group.id },
          assigned: true,
          active: true,
        },
      });

      await prisma.group.update({
        where: { id: group.id },
        data: { memberCount },
      });

      console.log(`   ✅ Group "${group.name}": ${memberCount} members`);
    }

    // 6. Create realistic User Activity Exclusions
    console.log('🚫 Creating user activity exclusions...');
    const exclusionScenarios = [
      // Dietary exclusions
      {
        reason: 'Severe nut allergy - cannot attend dinner events',
        activityPattern: 'dinner|gala',
      },
      {
        reason: 'Vegan dietary requirements - excluded from non-vegan events',
        activityPattern: 'dinner|brunch',
      },

      // Schedule conflicts
      {
        reason: 'Conflicting business meeting - requested exclusion',
        activityPattern: 'briefing|meeting',
      },
      {
        reason: 'Early flight departure - cannot attend farewell events',
        activityPattern: 'farewell|brunch',
      },

      // Access restrictions
      {
        reason: 'Media access restricted for private sponsor events',
        activityPattern: 'sponsor|vip',
      },
      {
        reason: 'Non-VIP guest - excluded from VIP-only activities',
        activityPattern: 'vip',
      },

      // Personal preferences
      {
        reason: 'Guest requested to skip early morning events',
        activityPattern: 'sunrise|breakfast',
      },
      {
        reason:
          'Mobility restrictions - cannot participate in walking activities',
        activityPattern: 'walk|tour',
      },
    ];

    let exclusionsCreated = 0;
    for (const scenario of exclusionScenarios) {
      // Find matching activities
      const matchingActivities = createdActivities.filter((activity) =>
        new RegExp(scenario.activityPattern, 'i').test(activity.title)
      );

      for (const activity of matchingActivities) {
        // Find users in groups that have this activity
        const eligibleUsers = createdUsers.filter((user) =>
          user.groupIds.some((groupId) => activity.groupIds.includes(groupId))
        );

        // Create exclusions for 10-30% of eligible users
        const exclusionCount = Math.max(
          1,
          Math.floor(eligibleUsers.length * (0.1 + Math.random() * 0.2))
        );
        const usersToExclude = eligibleUsers
          .sort(() => 0.5 - Math.random())
          .slice(0, exclusionCount);

        for (const user of usersToExclude) {
          // Find the group context for this exclusion
          const contextGroupId = user.groupIds.find((groupId) =>
            activity.groupIds.includes(groupId)
          );

          if (contextGroupId) {
            try {
              await prisma.userActivityExclusion.create({
                data: {
                  userId: user.id,
                  activityId: activity.id,
                  groupId: contextGroupId,
                  eventId: EVENT_ID,
                  excludedBy: ADMIN_ID,
                  reason: scenario.reason,
                },
              });
              exclusionsCreated++;
            } catch (error) {
              // Skip if exclusion already exists (unique constraint)
              if (!error.message.includes('Unique constraint')) {
                throw error;
              }
            }
          }
        }
      }
    }

    console.log(`   ✅ Created ${exclusionsCreated} user activity exclusions`);

    // 7. Update activity attendee counts
    console.log('📈 Updating activity attendee counts...');
    for (const activity of createdActivities) {
      // Count users in activity's groups minus exclusions
      const totalPotentialAttendees = await prisma.user.count({
        where: {
          groupIds: { hasSome: activity.groupIds },
          assigned: true,
          active: true,
        },
      });

      const excludedCount = await prisma.userActivityExclusion.count({
        where: { activityId: activity.id },
      });

      const currentAttendees = totalPotentialAttendees - excludedCount;

      await prisma.activity.update({
        where: { id: activity.id },
        data: { currentAttendees },
      });
    }

    console.log('✅ Database seeding completed successfully!');
    console.log('\n📊 SEEDING SUMMARY:');
    console.log(
      `   • Event: Singapore Grand Prix 2025 (updated with guest categories)`
    );
    console.log(`   • Groups: ${createdGroups.length}`);
    console.log(`   • Activities: ${createdActivities.length}`);
    console.log(`   • Users: ${createdUsers.length}`);
    console.log(`   • User Activity Exclusions: ${exclusionsCreated}`);
    console.log(`   • Guest Categories: ${GUEST_CATEGORIES.length}`);

    // Display group statistics
    console.log('\n👥 GROUP STATISTICS:');
    for (const group of createdGroups) {
      const memberCount = await prisma.user.count({
        where: {
          groupIds: { has: group.id },
          assigned: true,
          active: true,
        },
      });
      const activityCount = await prisma.activity.count({
        where: {
          groupIds: { has: group.id },
          active: true,
          deleted: false,
        },
      });
      console.log(
        `   • ${group.name}: ${memberCount} members, ${activityCount} activities`
      );
    }

    // Display guest category distribution
    console.log('\n🎫 GUEST CATEGORY DISTRIBUTION:');
    for (const category of GUEST_CATEGORIES) {
      const count = await prisma.user.count({
        where: { guestCategory: category, active: true },
      });
      console.log(`   • ${category}: ${count} users`);
    }
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
