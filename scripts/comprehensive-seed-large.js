#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Enhanced activity content templates
const ACTIVITY_CONTENT_TEMPLATES = {
  welcome_gala: `
    <h1>Welcome Gala Dinner</h1>
    <div style="margin: 20px 0;">
      <img src="https://images.unsplash.com/photo-1519671482749-fd09be7ccebf" alt="Elegant Gala Dinner" style="width: 100%; max-width: 600px; border-radius: 8px;"/>
    </div>
    <p>Join us for an <strong>exclusive evening</strong> featuring world-class cuisine and networking opportunities with industry leaders.</p>
    
    <h3>🍽️ Menu Highlights</h3>
    <ul>
      <li>Wagyu beef medallions with truffle reduction</li>
      <li>Pan-seared sea bass with saffron risotto</li>
      <li>Vegetarian: Roasted portobello wellington</li>
      <li>Dessert: Dark chocolate soufflé with gold leaf</li>
    </ul>
    
    <h3>🎵 Entertainment</h3>
    <p>Live performance by the <em>Monaco Philharmonic Quartet</em></p>
    
    <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
      <strong>⚠️ Important Notes:</strong>
      <ul>
        <li>Cocktail reception begins at 7:00 PM</li>
        <li>Dinner service starts promptly at 8:00 PM</li>
        <li>Black tie required</li>
      </ul>
    </div>
  `,

  paddock_access: `
    <h1>Exclusive Paddock Club Access</h1>
    <div style="margin: 20px 0;">
      <img src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64" alt="Formula 1 Paddock" style="width: 100%; max-width: 600px; border-radius: 8px;"/>
    </div>
    <p>Experience the heart of Formula 1 with <strong>unprecedented access</strong> to the paddock and pit lane.</p>
    
    <h3>🏎️ Access Includes</h3>
    <ul>
      <li><strong>Pit Lane Walk</strong> - Get up close with the cars</li>
      <li><strong>Team Garages</strong> - Watch mechanics at work</li>
      <li><strong>Driver Briefing Area</strong> - See drivers prepare</li>
      <li><strong>Media Zone</strong> - Exclusive interviews</li>
    </ul>
    
    <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0;">
      <strong>🎫 Your Paddock Pass</strong><br/>
      Your VIP credentials will be available at registration. Please bring photo ID.
    </div>
  `,

  helicopter_transfer: `
    <h1>Private Helicopter Transfer</h1>
    <div style="margin: 20px 0;">
      <img src="https://images.unsplash.com/photo-1544558958-6a0c05f22e0c" alt="Luxury Helicopter" style="width: 100%; max-width: 600px; border-radius: 8px;"/>
    </div>
    <p>Arrive in style with our <strong>exclusive helicopter service</strong> from the airport directly to the venue.</p>
    
    <h3>✈️ Flight Details</h3>
    <ul>
      <li><strong>Aircraft:</strong> Airbus H125 (6 passengers)</li>
      <li><strong>Flight Time:</strong> 20-30 minutes</li>
      <li><strong>Views:</strong> Spectacular aerial views</li>
    </ul>
    
    <div style="background: #fff3e0; padding: 15px; border-radius: 5px; margin: 15px 0;">
      <strong>📱 Contact Information</strong><br/>
      Emergency: +33 6 12 34 56 78
    </div>
  `,

  backstage_tour: `
    <h1>Exclusive Backstage Tour</h1>
    <div style="margin: 20px 0;">
      <img src="https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f" alt="Backstage Access" style="width: 100%; max-width: 600px; border-radius: 8px;"/>
    </div>
    <p>Go behind the scenes with <strong>exclusive backstage access</strong> to see how world-class events are produced.</p>
    
    <h3>🎭 Tour Highlights</h3>
    <ul>
      <li>Production control room</li>
      <li>Artist preparation areas</li>
      <li>Technical equipment showcase</li>
      <li>Meet the production team</li>
    </ul>
  `,

  networking_breakfast: `
    <h1>Executive Networking Breakfast</h1>
    <div style="margin: 20px 0;">
      <img src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0" alt="Business Breakfast" style="width: 100%; max-width: 600px; border-radius: 8px;"/>
    </div>
    <p>Start your day with <strong>meaningful connections</strong> over a gourmet breakfast with industry leaders.</p>
    
    <h3>🤝 Networking Format</h3>
    <ul>
      <li>Structured introductions</li>
      <li>Round-table discussions</li>
      <li>Business card exchange</li>
      <li>Follow-up coordination</li>
    </ul>
  `,

  workshop: `
    <h1>Interactive Workshop Session</h1>
    <div style="margin: 20px 0;">
      <img src="https://images.unsplash.com/photo-1517048676732-d65bc937f952" alt="Workshop Session" style="width: 100%; max-width: 600px; border-radius: 8px;"/>
    </div>
    <p>Participate in hands-on learning with <strong>industry experts</strong> and fellow professionals.</p>
    
    <h3>📚 Workshop Components</h3>
    <ul>
      <li>Expert-led presentations</li>
      <li>Interactive group activities</li>
      <li>Case study analysis</li>
      <li>Q&A sessions</li>
    </ul>
  `,

  product_launch: `
    <h1>Exclusive Product Launch</h1>
    <div style="margin: 20px 0;">
      <img src="https://images.unsplash.com/photo-1556761175-b413da4baf72" alt="Product Launch" style="width: 100%; max-width: 600px; border-radius: 8px;"/>
    </div>
    <p>Be among the first to experience <strong>groundbreaking innovations</strong> before they hit the market.</p>
    
    <h3>🚀 Launch Event</h3>
    <ul>
      <li>Product demonstration</li>
      <li>Hands-on experience</li>
      <li>Developer Q&A</li>
      <li>Exclusive preview access</li>
    </ul>
  `,
};

// Comprehensive event configurations
const EVENTS_CONFIG = [
  {
    name: 'Monaco Grand Prix 2025',
    shortName: 'Monaco2025',
    location: {
      city: 'Monte-Carlo',
      country: 'Monaco',
      venue: 'Circuit de Monaco',
      timezone: 'Europe/Monaco',
    },
    dateRange: {
      start: new Date('2025-05-23'),
      end: new Date('2025-05-26'),
    },
    config: {
      micrositeUrl: 'https://monaco2025.eventconcierge.com',
      registrationOpen: true,
    },
    groups: [
      {
        name: 'Paddock Club VIP',
        description: 'Exclusive paddock access with premium hospitality and pit lane tours',
        activities: [
          { title: 'VIP Paddock Club Access', category: 'EXPERIENCE', startHour: 9, duration: 3, template: 'paddock_access' },
          { title: 'Welcome Gala Dinner', category: 'HOSPITALITY', startHour: 19, duration: 4, template: 'welcome_gala' },
          { title: 'Private Helicopter Arrival', category: 'TRANSPORT', startHour: 12, duration: 1, template: 'helicopter_transfer' },
          { title: 'Championship Celebration', category: 'HOSPITALITY', startHour: 20, duration: 3, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Yacht Club Elite',
        description: 'Private yacht viewing with gourmet catering and harbor access',
        activities: [
          { title: 'Yacht Welcome Reception', category: 'HOSPITALITY', startHour: 10, duration: 2, template: 'networking_breakfast' },
          { title: 'Harbor Tour Experience', category: 'EXPERIENCE', startHour: 14, duration: 2, template: 'backstage_tour' },
          { title: 'Sunset Cocktail Party', category: 'HOSPITALITY', startHour: 18, duration: 3, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Corporate Partners',
        description: 'Business networking opportunities with industry leaders',
        activities: [
          { title: 'Executive Networking Breakfast', category: 'MEETING', startHour: 8, duration: 2, template: 'networking_breakfast' },
          { title: 'Strategic Partnership Summit', category: 'MEETING', startHour: 14, duration: 3, template: 'workshop' },
          { title: 'Industry Innovation Showcase', category: 'EXPERIENCE', startHour: 16, duration: 2, template: 'product_launch' },
        ],
      },
      {
        name: 'Media & Influencers',
        description: 'Content creators and journalists with special press access',
        activities: [
          { title: 'Press Conference Access', category: 'MEETING', startHour: 11, duration: 1, template: 'workshop' },
          { title: 'Behind-the-Scenes Tour', category: 'EXPERIENCE', startHour: 13, duration: 2, template: 'backstage_tour' },
          { title: 'Media Networking Dinner', category: 'HOSPITALITY', startHour: 19, duration: 3, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Luxury Experience Guests',
        description: 'Premium guests enjoying curated luxury experiences',
        activities: [
          { title: 'Monaco Heritage Tour', category: 'EXPERIENCE', startHour: 10, duration: 3, template: 'backstage_tour' },
          { title: 'Casino Royale Evening', category: 'HOSPITALITY', startHour: 20, duration: 4, template: 'welcome_gala' },
          { title: 'Shopping & Spa Experience', category: 'EXPERIENCE', startHour: 14, duration: 3, template: 'workshop' },
        ],
      },
      {
        name: 'Tech Innovators',
        description: 'Technology leaders and digital innovation experts',
        activities: [
          { title: 'F1 Technology Workshop', category: 'MEETING', startHour: 9, duration: 3, template: 'workshop' },
          { title: 'Innovation Networking Lunch', category: 'MEETING', startHour: 12, duration: 2, template: 'networking_breakfast' },
          { title: 'Future of Racing Panel', category: 'MEETING', startHour: 15, duration: 2, template: 'workshop' },
        ],
      },
    ],
  },
  {
    name: 'Milan Fashion Week 2025',
    shortName: 'MFW2025',
    location: {
      city: 'Milan',
      country: 'Italy',
      venue: 'Quadrilatero della Moda',
      timezone: 'Europe/Rome',
    },
    dateRange: {
      start: new Date('2025-09-17'),
      end: new Date('2025-09-23'),
    },
    config: {
      micrositeUrl: 'https://milan2025.eventconcierge.com',
      registrationOpen: true,
    },
    groups: [
      {
        name: 'Front Row Fashion Elite',
        description: 'Premium seating at all major runway shows and designer meet-and-greets',
        activities: [
          { title: 'Versace Runway Show', category: 'EXPERIENCE', startHour: 15, duration: 2, template: 'backstage_tour' },
          { title: 'Designer Meet & Greet', category: 'MEETING', startHour: 17, duration: 2, template: 'networking_breakfast' },
          { title: 'Fashion Week Gala', category: 'HOSPITALITY', startHour: 20, duration: 4, template: 'welcome_gala' },
          { title: 'Private Atelier Tour', category: 'EXPERIENCE', startHour: 10, duration: 3, template: 'backstage_tour' },
        ],
      },
      {
        name: 'Buyer Executive Circle',
        description: 'Exclusive showroom access and private collections viewing',
        activities: [
          { title: 'Private Showroom Access', category: 'EXPERIENCE', startHour: 9, duration: 4, template: 'backstage_tour' },
          { title: 'Buyer Networking Breakfast', category: 'MEETING', startHour: 8, duration: 2, template: 'networking_breakfast' },
          { title: 'Collection Preview Event', category: 'EXPERIENCE', startHour: 14, duration: 3, template: 'product_launch' },
        ],
      },
      {
        name: 'Influencer Content Hub',
        description: 'Social media creators with backstage access and styling sessions',
        activities: [
          { title: 'Content Creation Workshop', category: 'MEETING', startHour: 11, duration: 3, template: 'workshop' },
          { title: 'Professional Styling Session', category: 'EXPERIENCE', startHour: 14, duration: 2, template: 'backstage_tour' },
          { title: 'Influencer Networking Party', category: 'HOSPITALITY', startHour: 19, duration: 3, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Luxury Retail Partners',
        description: 'High-end retail partners and boutique owners',
        activities: [
          { title: 'Retail Strategy Summit', category: 'MEETING', startHour: 9, duration: 4, template: 'workshop' },
          { title: 'Luxury Brand Showcase', category: 'EXPERIENCE', startHour: 15, duration: 2, template: 'product_launch' },
          { title: 'Partner Appreciation Dinner', category: 'HOSPITALITY', startHour: 19, duration: 3, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Fashion Media Elite',
        description: 'Top fashion journalists and media professionals',
        activities: [
          { title: 'Fashion Trends Briefing', category: 'MEETING', startHour: 10, duration: 2, template: 'workshop' },
          { title: 'Exclusive Interview Access', category: 'MEETING', startHour: 13, duration: 3, template: 'networking_breakfast' },
          { title: 'Media Awards Ceremony', category: 'HOSPITALITY', startHour: 20, duration: 3, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Emerging Designers Circle',
        description: 'Up-and-coming designers and fashion students',
        activities: [
          { title: 'Mentorship Workshop', category: 'MEETING', startHour: 9, duration: 3, template: 'workshop' },
          { title: 'Design Competition', category: 'EXPERIENCE', startHour: 14, duration: 4, template: 'product_launch' },
          { title: 'Young Talent Showcase', category: 'EXPERIENCE', startHour: 18, duration: 3, template: 'backstage_tour' },
        ],
      },
    ],
  },
  {
    name: 'Global Tech Summit 2025',
    shortName: 'GTS2025',
    location: {
      city: 'San Francisco',
      country: 'USA',
      venue: 'Moscone Convention Center',
      timezone: 'America/Los_Angeles',
    },
    dateRange: {
      start: new Date('2025-06-15'),
      end: new Date('2025-06-17'),
    },
    config: {
      micrositeUrl: 'https://techsummit2025.eventconcierge.com',
      registrationOpen: true,
    },
    groups: [
      {
        name: 'C-Suite Executive',
        description: 'Senior executives with keynote access and private networking',
        activities: [
          { title: 'Executive Leadership Summit', category: 'MEETING', startHour: 9, duration: 4, template: 'workshop' },
          { title: 'CEO Roundtable Discussion', category: 'MEETING', startHour: 14, duration: 2, template: 'networking_breakfast' },
          { title: 'Executive Gala Dinner', category: 'HOSPITALITY', startHour: 19, duration: 4, template: 'welcome_gala' },
          { title: 'Strategic Planning Workshop', category: 'MEETING', startHour: 10, duration: 3, template: 'workshop' },
        ],
      },
      {
        name: 'Innovation Partners',
        description: 'Tech innovators and startup founders with demo opportunities',
        activities: [
          { title: 'Innovation Showcase', category: 'EXPERIENCE', startHour: 11, duration: 3, template: 'product_launch' },
          { title: 'Startup Pitch Competition', category: 'MEETING', startHour: 15, duration: 3, template: 'workshop' },
          { title: 'Innovator Networking Mixer', category: 'HOSPITALITY', startHour: 18, duration: 3, template: 'networking_breakfast' },
        ],
      },
      {
        name: 'Venture Capital Circle',
        description: 'Investment partners with exclusive deal flow sessions',
        activities: [
          { title: 'Investment Opportunities Briefing', category: 'MEETING', startHour: 8, duration: 3, template: 'workshop' },
          { title: 'Portfolio Company Showcase', category: 'EXPERIENCE', startHour: 13, duration: 3, template: 'product_launch' },
          { title: 'VC Partner Dinner', category: 'HOSPITALITY', startHour: 19, duration: 3, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Enterprise Technology Leaders',
        description: 'CTO and technology decision makers',
        activities: [
          { title: 'Enterprise Tech Trends', category: 'MEETING', startHour: 9, duration: 3, template: 'workshop' },
          { title: 'CTO Leadership Panel', category: 'MEETING', startHour: 14, duration: 2, template: 'networking_breakfast' },
          { title: 'Technology Excellence Awards', category: 'HOSPITALITY', startHour: 20, duration: 3, template: 'welcome_gala' },
        ],
      },
      {
        name: 'AI & Machine Learning Experts',
        description: 'Leading researchers and AI practitioners',
        activities: [
          { title: 'AI Research Symposium', category: 'MEETING', startHour: 10, duration: 4, template: 'workshop' },
          { title: 'ML Model Showcase', category: 'EXPERIENCE', startHour: 15, duration: 3, template: 'product_launch' },
          { title: 'AI Ethics Roundtable', category: 'MEETING', startHour: 16, duration: 2, template: 'networking_breakfast' },
        ],
      },
      {
        name: 'Developer Community',
        description: 'Software engineers and development team leads',
        activities: [
          { title: 'Developer Workshop Series', category: 'MEETING', startHour: 9, duration: 4, template: 'workshop' },
          { title: 'Hackathon Competition', category: 'EXPERIENCE', startHour: 14, duration: 6, template: 'product_launch' },
          { title: 'Developer Community Meetup', category: 'HOSPITALITY', startHour: 18, duration: 3, template: 'networking_breakfast' },
        ],
      },
    ],
  },
  {
    name: 'Cannes Film Festival VIP 2025',
    shortName: 'CANNES2025',
    location: {
      city: 'Cannes',
      country: 'France',
      venue: 'Palais des Festivals',
      timezone: 'Europe/Paris',
    },
    dateRange: {
      start: new Date('2025-05-14'),
      end: new Date('2025-05-25'),
    },
    config: {
      micrositeUrl: 'https://cannes2025.eventconcierge.com',
      registrationOpen: true,
    },
    groups: [
      {
        name: 'A-List Celebrity Circle',
        description: 'Hollywood stars and international celebrities',
        activities: [
          { title: 'Red Carpet Premier Access', category: 'EXPERIENCE', startHour: 18, duration: 3, template: 'backstage_tour' },
          { title: 'Celebrity Yacht Party', category: 'HOSPITALITY', startHour: 21, duration: 4, template: 'welcome_gala' },
          { title: 'Private Screening Room', category: 'EXPERIENCE', startHour: 15, duration: 3, template: 'backstage_tour' },
          { title: 'Awards After-Party', category: 'HOSPITALITY', startHour: 22, duration: 4, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Film Industry Executives',
        description: 'Producers, directors, and studio executives',
        activities: [
          { title: 'Industry Leaders Breakfast', category: 'MEETING', startHour: 8, duration: 2, template: 'networking_breakfast' },
          { title: 'Film Market Access', category: 'EXPERIENCE', startHour: 10, duration: 4, template: 'backstage_tour' },
          { title: 'Executive Producer Summit', category: 'MEETING', startHour: 14, duration: 3, template: 'workshop' },
          { title: 'Industry Gala Dinner', category: 'HOSPITALITY', startHour: 19, duration: 4, template: 'welcome_gala' },
        ],
      },
      {
        name: 'International Press Corps',
        description: 'Entertainment journalists and film critics',
        activities: [
          { title: 'Press Conference Access', category: 'MEETING', startHour: 11, duration: 2, template: 'workshop' },
          { title: 'Exclusive Interview Sessions', category: 'MEETING', startHour: 14, duration: 3, template: 'networking_breakfast' },
          { title: 'Critics Screening Room', category: 'EXPERIENCE', startHour: 16, duration: 3, template: 'backstage_tour' },
          { title: 'Media Awards Ceremony', category: 'HOSPITALITY', startHour: 20, duration: 3, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Luxury Brand Partners',
        description: 'High-end sponsors and luxury brand representatives',
        activities: [
          { title: 'Brand Showcase Pavilion', category: 'EXPERIENCE', startHour: 10, duration: 4, template: 'product_launch' },
          { title: 'Partner Networking Lunch', category: 'MEETING', startHour: 12, duration: 2, template: 'networking_breakfast' },
          { title: 'Luxury Brand Gala', category: 'HOSPITALITY', startHour: 19, duration: 4, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Emerging Filmmakers',
        description: 'Independent directors and up-and-coming talent',
        activities: [
          { title: 'Filmmaking Workshop', category: 'MEETING', startHour: 9, duration: 3, template: 'workshop' },
          { title: 'Talent Showcase Event', category: 'EXPERIENCE', startHour: 15, duration: 3, template: 'product_launch' },
          { title: 'Young Talent Mixer', category: 'HOSPITALITY', startHour: 18, duration: 3, template: 'networking_breakfast' },
        ],
      },
      {
        name: 'Cinema Technology Innovators',
        description: 'Tech companies revolutionizing film production',
        activities: [
          { title: 'Cinema Tech Expo', category: 'EXPERIENCE', startHour: 10, duration: 4, template: 'product_launch' },
          { title: 'Innovation in Film Panel', category: 'MEETING', startHour: 14, duration: 2, template: 'workshop' },
          { title: 'Tech Innovation Awards', category: 'HOSPITALITY', startHour: 20, duration: 3, template: 'welcome_gala' },
        ],
      },
    ],
  },
  {
    name: 'Art Basel Miami 2025',
    shortName: 'ARTBASEL2025',
    location: {
      city: 'Miami',
      country: 'USA',
      venue: 'Miami Beach Convention Center',
      timezone: 'America/New_York',
    },
    dateRange: {
      start: new Date('2025-12-05'),
      end: new Date('2025-12-08'),
    },
    config: {
      micrositeUrl: 'https://artbasel2025.eventconcierge.com',
      registrationOpen: true,
    },
    groups: [
      {
        name: 'International Collectors',
        description: 'World-renowned art collectors and museum patrons',
        activities: [
          { title: 'Private Collection Viewing', category: 'EXPERIENCE', startHour: 10, duration: 3, template: 'backstage_tour' },
          { title: 'Collectors Circle Dinner', category: 'HOSPITALITY', startHour: 19, duration: 4, template: 'welcome_gala' },
          { title: 'VIP Gallery Tour', category: 'EXPERIENCE', startHour: 14, duration: 3, template: 'backstage_tour' },
          { title: 'Acquisition Advisory Session', category: 'MEETING', startHour: 11, duration: 2, template: 'networking_breakfast' },
        ],
      },
      {
        name: 'Contemporary Artists',
        description: 'Featured artists and creative professionals',
        activities: [
          { title: 'Artist Studio Tour', category: 'EXPERIENCE', startHour: 9, duration: 3, template: 'backstage_tour' },
          { title: 'Creative Process Workshop', category: 'MEETING', startHour: 14, duration: 3, template: 'workshop' },
          { title: 'Artist Networking Reception', category: 'HOSPITALITY', startHour: 18, duration: 3, template: 'networking_breakfast' },
        ],
      },
      {
        name: 'Gallery Directors',
        description: 'Leading gallery owners and curators',
        activities: [
          { title: 'Gallery Leadership Forum', category: 'MEETING', startHour: 9, duration: 3, template: 'workshop' },
          { title: 'Curated Exhibition Tour', category: 'EXPERIENCE', startHour: 13, duration: 3, template: 'backstage_tour' },
          { title: 'Directors Gala Evening', category: 'HOSPITALITY', startHour: 20, duration: 4, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Art Investment Advisors',
        description: 'Financial advisors specializing in art investments',
        activities: [
          { title: 'Art Investment Summit', category: 'MEETING', startHour: 8, duration: 4, template: 'workshop' },
          { title: 'Market Trends Analysis', category: 'MEETING', startHour: 14, duration: 2, template: 'networking_breakfast' },
          { title: 'Investment Strategy Dinner', category: 'HOSPITALITY', startHour: 19, duration: 3, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Museum Professionals',
        description: 'Museum directors and cultural institution leaders',
        activities: [
          { title: 'Museum Innovation Panel', category: 'MEETING', startHour: 10, duration: 3, template: 'workshop' },
          { title: 'Cultural Exchange Program', category: 'EXPERIENCE', startHour: 15, duration: 3, template: 'backstage_tour' },
          { title: 'Museum Leaders Dinner', category: 'HOSPITALITY', startHour: 19, duration: 3, template: 'welcome_gala' },
        ],
      },
      {
        name: 'Digital Art Pioneers',
        description: 'NFT creators and blockchain art innovators',
        activities: [
          { title: 'Digital Art Revolution', category: 'MEETING', startHour: 11, duration: 3, template: 'workshop' },
          { title: 'NFT Showcase Exhibition', category: 'EXPERIENCE', startHour: 14, duration: 3, template: 'product_launch' },
          { title: 'Crypto Art Community Mixer', category: 'HOSPITALITY', startHour: 18, duration: 3, template: 'networking_breakfast' },
        ],
      },
    ],
  },
];

// Enhanced user profile templates - more diverse and realistic
const USER_PROFILE_TEMPLATES = [
  // VIP Corporate
  {
    firstName: 'Alexandra',
    lastName: 'Chen',
    email: 'alexandra.chen@luxurycorp.com',
    phone: '+1-415-555-0123',
    guestType: 'VIP Corporate',
    flight: { airline: 'British Airways', number: 'BA0341', arrival: new Date('2025-05-23T14:30:00Z'), departure: new Date('2025-05-26T16:45:00Z'), arrivalAirport: 'NCE', departureAirport: 'LHR' },
    accommodation: {
      required: true,
      hotel: 'Hotel Hermitage Monte-Carlo',
      checkIn: new Date('2025-05-23'),
      checkOut: new Date('2025-05-26'),
      specialRequests: 'Sea view room, late checkout requested',
    },
    requirements: { dietary: 'Pescatarian, no shellfish allergies', medical: 'None', accessibility: 'None' },
    merchandiseSize: { shirt: 'M', jacket: 'M', hat: 'OS' },
    emergencyContact: { name: 'David Chen', relationship: 'Husband', phone: '+1-415-555-0124', email: 'david.chen@email.com' },
    communication: { emailOptIn: true, whatsappOptIn: true },
  },
  {
    firstName: 'Marco',
    lastName: 'Rossini',
    email: 'marco.rossini@formula-media.it',
    phone: '+39-348-555-7890',
    guestType: 'Media',
    flight: { airline: 'Alitalia', number: 'AZ0234', arrival: new Date('2025-05-23T09:15:00Z'), departure: new Date('2025-05-25T20:30:00Z'), arrivalAirport: 'NCE', departureAirport: 'FCO' },
    accommodation: { required: true, hotel: 'Fairmont Monte Carlo', checkIn: new Date('2025-05-23'), checkOut: new Date('2025-05-25'), specialRequests: 'Quiet room for editing work' },
    requirements: { dietary: 'Gluten-free required', medical: 'Diabetic - requires refrigeration for insulin', accessibility: 'None' },
    merchandiseSize: { shirt: 'L', jacket: 'L', hat: 'L' },
    emergencyContact: { name: 'Giulia Rossini', relationship: 'Sister', phone: '+39-348-555-7891', email: 'giulia.rossini@email.com' },
    communication: { emailOptIn: true, whatsappOptIn: false },
  },
  {
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sarah.johnson@wheelchairaccessible.org',
    phone: '+44-20-7946-0958',
    guestType: 'VIP Guest',
    flight: { airline: 'Air France', number: 'AF7624', arrival: new Date('2025-05-23T11:20:00Z'), departure: new Date('2025-05-26T13:35:00Z'), arrivalAirport: 'NCE', departureAirport: 'LGW' },
    accommodation: {
      required: true,
      hotel: 'Monte-Carlo Bay Hotel',
      checkIn: new Date('2025-05-23'),
      checkOut: new Date('2025-05-26'),
      specialRequests: 'Accessible room with roll-in shower, ground floor preferred',
    },
    requirements: { dietary: 'Vegetarian, nut allergy (severe)', medical: 'None', accessibility: 'Wheelchair user - requires accessible transport and seating' },
    merchandiseSize: { shirt: 'S', jacket: 'S', hat: 'OS' },
    emergencyContact: { name: 'Michael Johnson', relationship: 'Husband', phone: '+44-20-7946-0959', email: 'michael.johnson@email.com' },
    transferRequirements: 'Wheelchair accessible vehicle required',
    communication: { emailOptIn: true, whatsappOptIn: true },
  },
  {
    firstName: 'Dmitri',
    lastName: 'Volkov',
    email: 'dmitri.volkov@russiantech.ru',
    phone: '+7-495-555-1234',
    guestType: 'Tech Executive',
    flight: { airline: 'Lufthansa', number: 'LH2414', arrival: new Date('2025-05-23T13:45:00Z'), departure: new Date('2025-05-25T19:20:00Z'), arrivalAirport: 'NCE', departureAirport: 'SVO' },
    accommodation: { required: false, hotel: 'Private yacht - Port Hercules', checkIn: new Date('2025-05-22'), checkOut: new Date('2025-05-26'), specialRequests: 'None - staying on private vessel' },
    requirements: { dietary: 'No pork, prefers organic options', medical: 'None', accessibility: 'None' },
    merchandiseSize: { shirt: 'XL', jacket: 'XL', hat: 'L' },
    emergencyContact: { name: 'Katarina Volkova', relationship: 'Wife', phone: '+7-495-555-1235', email: 'katarina.volkova@email.com' },
    communication: { emailOptIn: true, whatsappOptIn: true },
  },
  {
    firstName: 'James',
    lastName: 'Whitfield',
    email: 'james.whitfield@investment-partners.com',
    phone: '+1-212-555-8890',
    guestType: 'Investment Partner',
    flight: { airline: 'Delta Airlines', number: 'DL0067', arrival: new Date('2025-05-23T08:35:00Z'), departure: new Date('2025-05-26T22:15:00Z'), arrivalAirport: 'NCE', departureAirport: 'JFK' },
    accommodation: { required: true, hotel: 'Hotel de Paris Monte-Carlo', checkIn: new Date('2025-05-23'), checkOut: new Date('2025-05-26'), specialRequests: 'Executive floor, concierge services' },
    requirements: { dietary: 'None', medical: 'Heart condition - requires quiet environment, no extreme activities', accessibility: 'None' },
    merchandiseSize: { shirt: 'L', jacket: 'L', hat: 'OS' },
    emergencyContact: { name: 'Dr. Robert Whitfield', relationship: 'Brother', phone: '+1-212-555-8891', email: 'robert.whitfield@nymedical.com' },
    communication: { emailOptIn: true, whatsappOptIn: false },
  },
  // Additional diverse profiles
  {
    firstName: 'Isabella',
    lastName: 'Rodriguez',
    email: 'isabella.rodriguez@fashionhouse.es',
    phone: '+34-91-555-2345',
    guestType: 'Fashion Director',
    flight: { airline: 'Iberia', number: 'IB3421', arrival: new Date('2025-09-17T10:15:00Z'), departure: new Date('2025-09-23T18:30:00Z'), arrivalAirport: 'MXP', departureAirport: 'MAD' },
    accommodation: {
      required: true,
      hotel: 'Four Seasons Hotel Milano',
      checkIn: new Date('2025-09-17'),
      checkOut: new Date('2025-09-23'),
      specialRequests: 'Fashion district proximity, early check-in',
    },
    requirements: { dietary: 'Mediterranean diet, no red meat', medical: 'Mild lactose intolerance', accessibility: 'None' },
    merchandiseSize: { shirt: 'S', jacket: 'S', hat: 'S' },
    emergencyContact: { name: 'Carlos Rodriguez', relationship: 'Brother', phone: '+34-91-555-2346', email: 'carlos.rodriguez@email.com' },
    communication: { emailOptIn: true, whatsappOptIn: true },
  },
  {
    firstName: 'Dr. Raj',
    lastName: 'Patel',
    email: 'raj.patel@airesearch.org',
    phone: '+1-650-555-9876',
    guestType: 'AI Researcher',
    flight: { airline: 'United Airlines', number: 'UA0892', arrival: new Date('2025-06-14T22:30:00Z'), departure: new Date('2025-06-18T14:45:00Z'), arrivalAirport: 'SFO', departureAirport: 'BOM' },
    accommodation: {
      required: true,
      hotel: 'The St. Regis San Francisco',
      checkIn: new Date('2025-06-14'),
      checkOut: new Date('2025-06-18'),
      specialRequests: 'High-speed internet, quiet room for work',
    },
    requirements: { dietary: 'Strict vegetarian (Hindu)', medical: 'None', accessibility: 'None' },
    merchandiseSize: { shirt: 'M', jacket: 'M', hat: 'M' },
    emergencyContact: { name: 'Priya Patel', relationship: 'Wife', phone: '+1-650-555-9877', email: 'priya.patel@email.com' },
    communication: { emailOptIn: true, whatsappOptIn: false },
  },
  {
    firstName: 'Sophie',
    lastName: 'Dubois',
    email: 'sophie.dubois@cannesfilms.fr',
    phone: '+33-6-12-34-5678',
    guestType: 'Film Producer',
    flight: { airline: 'Air France', number: 'AF1234', arrival: new Date('2025-05-13T16:20:00Z'), departure: new Date('2025-05-26T12:10:00Z'), arrivalAirport: 'NCE', departureAirport: 'CDG' },
    accommodation: { required: true, hotel: 'Martinez Cannes', checkIn: new Date('2025-05-13'), checkOut: new Date('2025-05-26'), specialRequests: 'Sea view suite, late checkout flexibility' },
    requirements: { dietary: 'Organic foods preferred, wine connoisseur', medical: 'None', accessibility: 'None' },
    merchandiseSize: { shirt: 'M', jacket: 'M', hat: 'OS' },
    emergencyContact: { name: 'Pierre Dubois', relationship: 'Husband', phone: '+33-6-12-34-5679', email: 'pierre.dubois@email.com' },
    communication: { emailOptIn: true, whatsappOptIn: true },
  },
  {
    firstName: 'Michael',
    lastName: 'Thompson',
    email: 'michael.thompson@artcollection.com',
    phone: '+1-305-555-7654',
    guestType: 'Art Collector',
    flight: { airline: 'American Airlines', number: 'AA1987', arrival: new Date('2025-12-04T19:45:00Z'), departure: new Date('2025-12-09T09:30:00Z'), arrivalAirport: 'MIA', departureAirport: 'LAX' },
    accommodation: { required: true, hotel: 'The Setai Miami Beach', checkIn: new Date('2025-12-04'), checkOut: new Date('2025-12-09'), specialRequests: 'Ocean view, art storage facility access' },
    requirements: { dietary: 'Keto diet, no sugar', medical: 'Type 2 diabetes - controlled with diet', accessibility: 'None' },
    merchandiseSize: { shirt: 'L', jacket: 'L', hat: 'L' },
    emergencyContact: { name: 'Jennifer Thompson', relationship: 'Wife', phone: '+1-305-555-7655', email: 'jennifer.thompson@email.com' },
    communication: { emailOptIn: true, whatsappOptIn: false },
  },
  {
    firstName: 'Yuki',
    lastName: 'Tanaka',
    email: 'yuki.tanaka@techstartup.jp',
    phone: '+81-3-5555-1234',
    guestType: 'Startup Founder',
    flight: { airline: 'Japan Airlines', number: 'JL0012', arrival: new Date('2025-06-14T18:15:00Z'), departure: new Date('2025-06-18T11:20:00Z'), arrivalAirport: 'SFO', departureAirport: 'NRT' },
    accommodation: {
      required: true,
      hotel: 'Hotel Zephyr San Francisco',
      checkIn: new Date('2025-06-14'),
      checkOut: new Date('2025-06-18'),
      specialRequests: 'Tech-friendly amenities, meeting space access',
    },
    requirements: { dietary: 'Pescatarian, sushi preferred', medical: 'None', accessibility: 'None' },
    merchandiseSize: { shirt: 'S', jacket: 'S', hat: 'M' },
    emergencyContact: { name: 'Hiroshi Tanaka', relationship: 'Father', phone: '+81-3-5555-1235', email: 'hiroshi.tanaka@email.com' },
    communication: { emailOptIn: true, whatsappOptIn: true },
  },
  {
    firstName: 'Emma',
    lastName: 'Williams',
    email: 'emma.williams@vogue.co.uk',
    phone: '+44-20-7946-1234',
    guestType: 'Fashion Editor',
    flight: { airline: 'British Airways', number: 'BA0573', arrival: new Date('2025-09-16T20:45:00Z'), departure: new Date('2025-09-24T07:30:00Z'), arrivalAirport: 'MXP', departureAirport: 'LHR' },
    accommodation: {
      required: true,
      hotel: 'Bulgari Hotel Milano',
      checkIn: new Date('2025-09-16'),
      checkOut: new Date('2025-09-24'),
      specialRequests: 'Central location, fashion week schedule flexibility',
    },
    requirements: { dietary: 'Plant-based diet, organic preferred', medical: 'None', accessibility: 'None' },
    merchandiseSize: { shirt: 'S', jacket: 'S', hat: 'OS' },
    emergencyContact: { name: 'James Williams', relationship: 'Brother', phone: '+44-20-7946-1235', email: 'james.williams@email.com' },
    communication: { emailOptIn: true, whatsappOptIn: false },
  },
  {
    firstName: 'Carlos',
    lastName: 'Montenegro',
    email: 'carlos.montenegro@venture.fund',
    phone: '+1-650-555-4321',
    guestType: 'Venture Capitalist',
    flight: { airline: 'Virgin America', number: 'VX0245', arrival: new Date('2025-06-14T14:20:00Z'), departure: new Date('2025-06-18T20:15:00Z'), arrivalAirport: 'SFO', departureAirport: 'LAX' },
    accommodation: {
      required: true,
      hotel: 'Four Seasons San Francisco',
      checkIn: new Date('2025-06-14'),
      checkOut: new Date('2025-06-18'),
      specialRequests: 'Business center access, concierge level',
    },
    requirements: { dietary: 'Low-carb diet, wine enthusiast', medical: 'None', accessibility: 'None' },
    merchandiseSize: { shirt: 'L', jacket: 'L', hat: 'L' },
    emergencyContact: { name: 'Maria Montenegro', relationship: 'Wife', phone: '+1-650-555-4322', email: 'maria.montenegro@email.com' },
    communication: { emailOptIn: true, whatsappOptIn: true },
  },
  {
    firstName: 'Fatima',
    lastName: 'Al-Rashid',
    email: 'fatima.alrashid@artgallery.ae',
    phone: '+971-4-555-9876',
    guestType: 'Gallery Owner',
    flight: { airline: 'Emirates', number: 'EK0213', arrival: new Date('2025-12-04T15:30:00Z'), departure: new Date('2025-12-09T23:45:00Z'), arrivalAirport: 'MIA', departureAirport: 'DXB' },
    accommodation: {
      required: true,
      hotel: 'The Ritz-Carlton, Miami Beach',
      checkIn: new Date('2025-12-04'),
      checkOut: new Date('2025-12-09'),
      specialRequests: 'Halal dining options, prayer room access',
    },
    requirements: { dietary: 'Halal required, Middle Eastern cuisine preferred', medical: 'None', accessibility: 'None' },
    merchandiseSize: { shirt: 'M', jacket: 'M', hat: 'OS' },
    emergencyContact: { name: 'Ahmed Al-Rashid', relationship: 'Husband', phone: '+971-4-555-9877', email: 'ahmed.alrashid@email.com' },
    communication: { emailOptIn: true, whatsappOptIn: true },
  },
];

// Generate additional user variations
function generateUserVariations(baseTemplates, count) {
  const variations = [];
  const firstNames = [
    'Alexander',
    'Maria',
    'David',
    'Anna',
    'Robert',
    'Lisa',
    'Michael',
    'Jennifer',
    'William',
    'Patricia',
    'Richard',
    'Linda',
    'Thomas',
    'Elizabeth',
    'Christopher',
    'Barbara',
    'Daniel',
    'Susan',
    'Matthew',
    'Jessica',
    'Anthony',
    'Sarah',
    'Mark',
    'Karen',
    'Donald',
    'Nancy',
    'Steven',
    'Lisa',
    'Paul',
    'Betty',
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
  ];
  const guestTypes = [
    'VIP Corporate',
    'Media',
    'Tech Executive',
    'Investment Partner',
    'Fashion Director',
    'AI Researcher',
    'Film Producer',
    'Art Collector',
    'Startup Founder',
    'Fashion Editor',
    'Venture Capitalist',
    'Gallery Owner',
    'Industry Executive',
    'Creative Director',
    'Business Leader',
  ];

  for (let i = 0; i < count; i++) {
    const baseTemplate = baseTemplates[i % baseTemplates.length];
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const guestType = guestTypes[Math.floor(Math.random() * guestTypes.length)];

    variations.push({
      ...baseTemplate,
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${Math.random().toString(36).substring(7)}.com`,
      guestType,
      communication: {
        emailOptIn: Math.random() > 0.1, // 90% email opt-in
        whatsappOptIn: Math.random() > 0.4, // 60% whatsapp opt-in
      },
    });
  }

  return variations;
}

async function clearExistingData() {
  console.log('🧹 Clearing existing data...');

  await prisma.message.deleteMany();
  await prisma.adminEvent.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.user.deleteMany();
  await prisma.group.deleteMany();
  await prisma.event.deleteMany();
  await prisma.admin.deleteMany();

  console.log('✅ Existing data cleared');
}

async function seedAdmins() {
  console.log('👨‍💼 Creating administrators...');

  const admins = [];

  // Super Admin
  const superAdmin = await prisma.admin.create({
    data: {
      email: 'admin@eventconcierge.com',
      firstName: 'Charlotte',
      lastName: 'Dubois',
      passwordHash: await bcrypt.hash('admin123', 12),
      role: 'SUPER',
    },
  });
  admins.push(superAdmin);

  // Standard Admins - more of them for larger scale
  const standardAdmins = [
    { email: 'elena.martinez@eventconcierge.com', firstName: 'Elena', lastName: 'Martinez', role: 'STANDARD' },
    { email: 'thomas.weber@eventconcierge.com', firstName: 'Thomas', lastName: 'Weber', role: 'STANDARD' },
    { email: 'sophie.laurent@eventconcierge.com', firstName: 'Sophie', lastName: 'Laurent', role: 'STANDARD' },
    { email: 'james.mitchell@eventconcierge.com', firstName: 'James', lastName: 'Mitchell', role: 'STANDARD' },
    { email: 'maria.garcia@eventconcierge.com', firstName: 'Maria', lastName: 'Garcia', role: 'STANDARD' },
    { email: 'david.chen@eventconcierge.com', firstName: 'David', lastName: 'Chen', role: 'STANDARD' },
    { email: 'anna.kowalski@eventconcierge.com', firstName: 'Anna', lastName: 'Kowalski', role: 'STANDARD' },
  ];

  for (const adminData of standardAdmins) {
    const admin = await prisma.admin.create({
      data: {
        ...adminData,
        passwordHash: await bcrypt.hash('admin123', 12),
      },
    });
    admins.push(admin);
  }

  console.log(`✅ Created ${admins.length} administrators`);
  return admins;
}

async function seedEvents(admins) {
  console.log('🎭 Creating luxury events...');

  const events = [];

  for (const eventConfig of EVENTS_CONFIG) {
    const event = await prisma.event.create({
      data: {
        name: eventConfig.name,
        shortName: eventConfig.shortName,
        location: eventConfig.location,
        dateRange: eventConfig.dateRange,
        config: eventConfig.config,
      },
    });
    events.push({ ...event, groupsConfig: eventConfig.groups });

    // Assign super admin to all events
    await prisma.adminEvent.create({
      data: {
        adminId: admins[0].id, // Super admin
        eventId: event.id,
      },
    });

    // Assign standard admins to events (distribute evenly)
    const adminIndex = (events.length % (admins.length - 1)) + 1;
    await prisma.adminEvent.create({
      data: {
        adminId: admins[adminIndex].id,
        eventId: event.id,
      },
    });
  }

  console.log(`✅ Created ${events.length} luxury events`);
  return events;
}

async function seedGroups(events) {
  console.log('👥 Creating event groups...');

  const allGroups = [];

  for (const event of events) {
    for (const groupConfig of event.groupsConfig) {
      const group = await prisma.group.create({
        data: {
          eventId: event.id,
          name: groupConfig.name,
          description: groupConfig.description,
          memberCount: 0,
        },
      });
      allGroups.push({ ...group, eventName: event.shortName, activitiesConfig: groupConfig.activities });
    }
  }

  console.log(`✅ Created ${allGroups.length} groups across all events`);
  return allGroups;
}

async function seedActivities(groups, adminId) {
  console.log('🎯 Creating rich activities...');

  let activityCount = 0;

  for (const group of groups) {
    for (const activityConfig of group.activitiesConfig) {
      // Calculate activity date based on the group's event
      const eventDate = new Date('2025-05-24'); // Default base date
      const startDateTime = new Date(eventDate);
      startDateTime.setHours(activityConfig.startHour, 0, 0, 0);

      const endDateTime = new Date(startDateTime);
      endDateTime.setHours(startDateTime.getHours() + activityConfig.duration);

      const activity = await prisma.activity.create({
        data: {
          eventId: group.eventId,
          groupId: group.id,
          title: activityConfig.title,
          startDateTime,
          endDateTime,
          category: activityConfig.category,
          thumbnail: `https://images.unsplash.com/photo-${Math.floor(Math.random() * 1000000000000)}`,
          location: {
            name: `${activityConfig.title} Venue`,
            address: `123 Event Street, ${group.eventName}`,
            mapLink: 'https://maps.google.com/?q=event+venue',
          },
          content: {
            html: ACTIVITY_CONTENT_TEMPLATES[activityConfig.template] || ACTIVITY_CONTENT_TEMPLATES.welcome_gala,
          },
          createdBy: adminId,
          lastModifiedBy: adminId,
        },
      });
      activityCount++;
    }
  }

  console.log(`✅ Created ${activityCount} rich activities`);
}

async function seedUsers(events, groups) {
  console.log('👤 Creating comprehensive user profiles...');

  // Generate more user profiles (80 total)
  const allUserTemplates = [...USER_PROFILE_TEMPLATES, ...generateUserVariations(USER_PROFILE_TEMPLATES, 70)];
  const allUsers = [];
  let userCount = 0;

  for (const event of events) {
    const eventGroups = groups.filter((g) => g.eventId === event.id);
    const usersPerEvent = Math.floor(allUserTemplates.length / events.length);
    const eventUserTemplates = allUserTemplates.slice(userCount, userCount + usersPerEvent);

    for (let i = 0; i < eventUserTemplates.length; i++) {
      const profileTemplate = eventUserTemplates[i];
      const userEmail = profileTemplate.email.replace('@', `+${event.shortName.toLowerCase()}@`);

      // Smart group assignment based on user type
      let targetGroup = null;
      const guestType = profileTemplate.guestType.toLowerCase();

      if (guestType.includes('vip') || guestType.includes('executive') || guestType.includes('corporate')) {
        targetGroup = eventGroups.find((g) => g.name.toLowerCase().includes('vip') || g.name.toLowerCase().includes('executive') || g.name.toLowerCase().includes('elite'));
      } else if (guestType.includes('media') || guestType.includes('editor')) {
        targetGroup = eventGroups.find((g) => g.name.toLowerCase().includes('media') || g.name.toLowerCase().includes('press'));
      } else if (guestType.includes('tech') || guestType.includes('ai') || guestType.includes('startup')) {
        targetGroup = eventGroups.find((g) => g.name.toLowerCase().includes('tech') || g.name.toLowerCase().includes('innovation') || g.name.toLowerCase().includes('developer'));
      } else if (guestType.includes('fashion') || guestType.includes('director')) {
        targetGroup = eventGroups.find((g) => g.name.toLowerCase().includes('fashion') || g.name.toLowerCase().includes('luxury'));
      } else if (guestType.includes('investment') || guestType.includes('venture')) {
        targetGroup = eventGroups.find((g) => g.name.toLowerCase().includes('investment') || g.name.toLowerCase().includes('venture') || g.name.toLowerCase().includes('capital'));
      } else if (guestType.includes('art') || guestType.includes('gallery')) {
        targetGroup = eventGroups.find((g) => g.name.toLowerCase().includes('art') || g.name.toLowerCase().includes('gallery') || g.name.toLowerCase().includes('collector'));
      } else if (guestType.includes('film') || guestType.includes('producer')) {
        targetGroup = eventGroups.find((g) => g.name.toLowerCase().includes('film') || g.name.toLowerCase().includes('cinema') || g.name.toLowerCase().includes('industry'));
      }

      // If no specific match, assign to random group
      if (!targetGroup) {
        targetGroup = eventGroups[Math.floor(Math.random() * eventGroups.length)];
      }

      // 85% of users should be assigned (more realistic)
      const shouldAssign = Math.random() > 0.15;

      const user = await prisma.user.create({
        data: {
          eventId: event.id,
          groupId: shouldAssign ? targetGroup.id : null,
          profile: {
            email: userEmail,
            firstName: profileTemplate.firstName,
            lastName: profileTemplate.lastName,
            phone: profileTemplate.phone,
            guestType: profileTemplate.guestType,
          },
          sessions: [],
          magicLinks: [],
          communication: profileTemplate.communication,
          flight: profileTemplate.flight,
          accommodation: profileTemplate.accommodation,
          transferRequirements: profileTemplate.transferRequirements,
          requirements: profileTemplate.requirements,
          merchandiseSize: profileTemplate.merchandiseSize,
          emergencyContact: profileTemplate.emergencyContact,
          assigned: shouldAssign,
          assignedAt: shouldAssign ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) : null, // Random assignment within last week
        },
      });

      allUsers.push(user);
      userCount++;

      // Update group member count
      if (user.groupId && user.assigned) {
        await prisma.group.update({
          where: { id: user.groupId },
          data: { memberCount: { increment: 1 } },
        });
      }
    }
  }

  console.log(`✅ Created ${allUsers.length} comprehensive user profiles`);
  return allUsers;
}

async function seedMessages(events, users, adminId) {
  console.log('📨 Creating sample messages and communication tracking...');

  let messageCount = 0;

  for (const event of events) {
    const eventUsers = users.filter((u) => u.eventId === event.id);

    // Welcome messages (more detailed)
    for (let i = 0; i < 3; i++) {
      const welcomeMessage = await prisma.message.create({
        data: {
          eventId: event.id,
          type: 'WELCOME',
          emailSubject: `Welcome to ${event.name}!`,
          emailContent: `
            <h1>Welcome to ${event.name}</h1>
            <p>Dear attendee, we're thrilled to have you join us for this exclusive event.</p>
            <p>Your registration is confirmed and we'll notify you once your personalized itinerary is ready.</p>
          `,
          whatsappTemplate: 'welcome_template',
          templateVariables: {
            event_name: event.name,
            name: '{{user.firstName}}',
          },
          recipientType: 'ALL',
          recipientIds: [],
          deliveries: eventUsers.slice(i * 5, (i + 1) * 5).map((user) => ({
            user: user.id,
            channels: {
              email: {
                sent: true,
                sentAt: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000),
                delivered: Math.random() > 0.05,
                deliveredAt: Math.random() > 0.05 ? new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000 + 300000) : null,
                error: null,
              },
              whatsapp: user.communication?.whatsappOptIn
                ? {
                    sent: true,
                    sentAt: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000),
                    delivered: Math.random() > 0.02,
                    deliveredAt: Math.random() > 0.02 ? new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000 + 180000) : null,
                    error: null,
                  }
                : null,
            },
          })),
          sentBy: adminId,
        },
      });
      messageCount++;
    }

    // Assignment notifications
    const assignmentMessage = await prisma.message.create({
      data: {
        eventId: event.id,
        type: 'ASSIGNMENT',
        emailSubject: `Your ${event.name} itinerary is ready!`,
        emailContent: `
          <h1>Your Personalized Itinerary is Ready</h1>
          <p>Great news! You've been assigned to your exclusive group and your itinerary is now available.</p>
          <p>Click here to view your schedule: <a href="#">View Itinerary</a></p>
        `,
        whatsappTemplate: 'assignment_ready',
        templateVariables: {
          event_name: event.name,
          name: '{{user.firstName}}',
          link: 'https://example.com/itinerary',
        },
        recipientType: 'GROUP',
        recipientIds: [eventUsers[0]?.groupId].filter(Boolean),
        deliveries: eventUsers
          .filter((u) => u.assigned)
          .slice(0, 10)
          .map((user) => ({
            user: user.id,
            channels: {
              email: {
                sent: true,
                sentAt: new Date(Date.now() - Math.random() * 2 * 24 * 60 * 60 * 1000),
                delivered: true,
                deliveredAt: new Date(Date.now() - Math.random() * 2 * 24 * 60 * 60 * 1000 + 300000),
                error: null,
              },
              whatsapp: user.communication?.whatsappOptIn
                ? {
                    sent: true,
                    sentAt: new Date(Date.now() - Math.random() * 2 * 24 * 60 * 60 * 1000),
                    delivered: Math.random() > 0.03,
                    deliveredAt: Math.random() > 0.03 ? new Date(Date.now() - Math.random() * 2 * 24 * 60 * 60 * 1000 + 180000) : null,
                    error: null,
                  }
                : null,
            },
          })),
        sentBy: adminId,
      },
    });
    messageCount++;
  }

  console.log(`✅ Created ${messageCount} messages with comprehensive delivery tracking`);
}

async function comprehensiveSeedLarge() {
  console.log('🌟 Starting LARGE SCALE Event Concierge Platform seeding...');
  console.log('='.repeat(80));

  try {
    await clearExistingData();

    const admins = await seedAdmins();
    const superAdmin = admins.find((a) => a.role === 'SUPER');

    const events = await seedEvents(admins);
    const groups = await seedGroups(events);

    await seedActivities(groups, superAdmin.id);
    const users = await seedUsers(events, groups);
    await seedMessages(events, users, superAdmin.id);

    console.log('='.repeat(80));
    console.log('🎉 LARGE SCALE SEEDING COMPLETE!');
    console.log('='.repeat(80));

    console.log('\n📊 Summary:');
    console.log(`👨‍💼 Administrators: ${admins.length}`);
    console.log(`🎭 Events: ${events.length}`);
    console.log(`👥 Groups: ${groups.length}`);
    console.log(`👤 Users: ${users.length}`);
    console.log(`🎯 Activities: ${groups.reduce((total, group) => total + group.activitiesConfig.length, 0)}`);
    console.log(`📨 Messages: ${events.length * 4}`);

    console.log('\n🎭 Featured Events:');
    events.forEach((event) => {
      console.log(`🎪 ${event.name} (${event.shortName})`);
      console.log(`   📍 ${event.location.city}, ${event.location.country}`);
      console.log(`   👥 ${groups.filter((g) => g.eventId === event.id).length} groups`);
      console.log(`   👤 ${users.filter((u) => u.eventId === event.id).length} attendees`);
    });

    console.log('\n🔑 Login Credentials:');
    console.log('📧 Super Admin: admin@eventconcierge.com');
    console.log('🔐 Password: admin123');

    console.log('\n🌟 Key Features Demonstrated:');
    console.log('✅ Large-scale multi-event management');
    console.log('✅ Realistic user distribution across groups');
    console.log('✅ Comprehensive activity scheduling');
    console.log('✅ Diverse user profiles with real requirements');
    console.log('✅ Multi-channel communication tracking');
    console.log('✅ Professional admin management');
    console.log('✅ Enterprise-scale data relationships');

    console.log('\n📚 Ready for Enterprise Admin Dashboard Demo!');
  } catch (error) {
    console.error('❌ Large scale seeding failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

comprehensiveSeedLarge();
