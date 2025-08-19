# Event Concierge Platform Backend

A comprehensive multi-event management system with personalized itinerary management and multi-channel communications for luxury events.

## Features

- **Multi-Event Management**: Support for multiple isolated events with data scoping
- **User Registration**: Comprehensive attendee registration with detailed requirements
- **Group Management**: Organize attendees into groups with dedicated activities
- **Activity Management**: Rich content activities with scheduling and location details
- **Magic Link Authentication**: Passwordless authentication for attendees
- **Admin Management**: Role-based access control (Super/Standard admins)
- **Multi-Channel Notifications**: Email (AWS SES) and WhatsApp (Twilio) communications
- **CSV Import/Export**: Bulk user management capabilities
- **File Upload**: S3 integration for activity images and assets
- **Rich Content**: HTML editor support for activity descriptions

## Tech Stack

- **Framework**: Hono with OpenAPI integration
- **Database**: MongoDB with Prisma ORM v6.14.0
- **Validation**: Zod schemas
- **Authentication**: JWT with magic links
- **File Storage**: AWS S3
- **Email**: AWS SES
- **WhatsApp**: Twilio Business API
- **Runtime**: Bun

### Prisma v6 Features
- **Global Omit**: Automatically exclude sensitive fields like `passwordHash`
- **Enhanced Performance**: Optimized query engine with advanced indexing
- **Better TypeScript Support**: Improved type inference and safety
- **Enhanced MongoDB Support**: Better JSON field handling and indexing

## Quick Start

### Prerequisites

- Bun runtime
- MongoDB database
- AWS account (S3, SES)
- Twilio account (WhatsApp Business API)

### Installation

1. Install dependencies:
```bash
bun install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Generate Prisma client:
```bash
bun run prisma:generate
```

4. Push database schema:
```bash
bun run prisma:push
```

5. Start development server:
```bash
bun run dev
```

The API will be available at `http://localhost:3000` and the documentation at `http://localhost:3000/docs`.

## Environment Configuration

### Database
```env
DATABASE_URL="mongodb://localhost:27017/event-concierge"
```

### Authentication
```env
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"
MAGIC_LINK_EXPIRES_IN="24h"
```

### AWS Services
```env
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_REGION="us-east-1"
AWS_S3_BUCKET="event-concierge-assets"
SES_FROM_EMAIL="noreply@yourdomain.com"
SES_FROM_NAME="Event Concierge"
```

### WhatsApp (Twilio)
```env
TWILIO_ACCOUNT_SID="your-twilio-account-sid"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"
TWILIO_WHATSAPP_FROM="whatsapp:+1234567890"
```

### Application
```env
APP_URL="http://localhost:3000"
PORT="3000"
NODE_ENV="development"
```

## API Documentation

Once running, visit `http://localhost:3000/docs` for interactive API documentation.

### Key Endpoints

#### Authentication
- `POST /api/auth/admin/login` - Admin login
- `POST /api/auth/magic-link/request` - Request magic link
- `POST /api/auth/magic-link/verify` - Verify magic link

#### Events Management
- `GET /api/events` - List events
- `POST /api/events` - Create event (Super admin)
- `GET /api/events/{id}/stats` - Event statistics

#### User Management
- `POST /api/users/register` - User registration (public)
- `GET /api/users` - List users (admin)
- `POST /api/users/import` - CSV import
- `GET /api/users/export` - CSV export

#### Group & Activity Management
- `GET /api/groups` - List groups
- `POST /api/groups` - Create group
- `GET /api/activities` - List activities
- `POST /api/activities` - Create activity

## Core Concepts

### Entity Hierarchy
```
Event → Groups → Activities → Users
```

### Key Principles
1. **One User, One Group**: Users can only belong to one group per event
2. **One Activity, One Group**: Activities are created specifically for one group
3. **Event Isolation**: All data is scoped to a specific event
4. **Rich Content**: Activities use HTML editor for flexible content
5. **User-Controlled Communications**: All notifications respect user channel preferences

## Development Scripts

```bash
bun run dev          # Start development server
bun run build        # Build for production
bun run start        # Start production server

# Prisma v6 Commands
bun run prisma:generate  # Generate Prisma client
bun run prisma:push     # Push schema to database
bun run prisma:studio   # Open Prisma Studio
bun run prisma:validate # Validate schema (Prisma v6)
bun run prisma:format   # Format schema (Prisma v6)

# Development
bun run type-check      # TypeScript type checking
bun run setup           # Initial setup with sample data
```

## Communication Flow

1. **User Registration**: Multi-step registration with comprehensive profile
2. **Welcome Notification**: Sent via user's preferred channels (email/WhatsApp)
3. **Admin Assignment**: Manual assignment to appropriate group
4. **Assignment Notification**: User receives group assignment via preferred channels
5. **Activity Updates**: Notifications when activities are modified
6. **Announcements**: Broadcast messages to groups or all users

## CSV Import/Export

### Import Template
Download the CSV template at `/api/users/import-template` which includes:
- User profile information
- Flight and accommodation details
- Requirements (dietary, medical, accessibility)
- Communication preferences
- Emergency contact information

### Export Options
Export user data with filtering by:
- Event
- Group assignment
- Assignment status
- Special requirements

## Security Features

- JWT-based authentication with magic links
- Role-based access control (Super/Standard admins)
- Event-scoped data isolation
- Input validation with Zod schemas
- Rate limiting and CORS protection
- Secure file uploads via S3 presigned URLs

## Production Deployment

1. **Environment**: Configure production environment variables
2. **Database**: Set up MongoDB Atlas or self-hosted MongoDB
3. **AWS Services**: Configure S3 bucket, SES, and CloudFront
4. **WhatsApp**: Submit and approve message templates with Twilio
5. **SSL/TLS**: Configure HTTPS certificates
6. **Monitoring**: Set up CloudWatch or application monitoring

## WhatsApp Setup

Before production launch, submit message templates to Twilio for approval:
- Welcome messages
- Group assignment notifications
- Activity updates
- General announcements

## License

MIT License - see LICENSE file for details.
