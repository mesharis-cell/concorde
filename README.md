# Savvio Concorde Platform Backend

A comprehensive multi-event management system with personalized itinerary management, rich content creation, and multi-channel communications for luxury events.

## 🚀 Key Features

- **🎯 Multi-Event Management**: Support for multiple isolated events with complete data scoping
- **👥 User Registration**: Comprehensive attendee registration with travel, accommodation, and accessibility requirements
- **📊 Advanced Group Management**: Organize attendees with visual group cards and member management
- **🎨 Rich Activity Creation**: Tiptap-powered rich text editor with S3 image uploads, edit/preview modes
- **🔐 Magic Link Authentication**: Passwordless JWT-based authentication for attendees
- **⚡ Advanced Admin Dashboard**: Role-based access (Super/Standard) with dark mode support
- **📱 Multi-Channel Communications**: Email (AWS SES) and WhatsApp (Twilio) with user preference controls
- **📋 Smart CSV Import/Export**: Auto-mapping templates with comprehensive data validation
- **☁️ S3 File Management**: Presigned URL uploads for secure image handling
- **🌍 Timezone Support**: Event-based timezone display with admin toggle capabilities
- **📈 Real-time Statistics**: Comprehensive event analytics and reporting
- **🎭 Professional Typography**: Plus Jakarta Sans, Lora serif, IBM Plex Mono fonts

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

The API will be available at `http://localhost:3001` and the documentation at `http://localhost:3001/docs`.

## 🏗️ Architecture Overview

### Frontend (Admin Dashboard)
- **Next.js 15**: React framework with App Router and TypeScript
- **Tailwind CSS**: Styling with shadcn/ui components
- **Rich Text Editor**: Tiptap with S3 image uploads
- **State Management**: TanStack Query for server state
- **Authentication**: JWT token-based with auto-refresh
- **Theme Support**: Light/dark mode with system preference detection

### Backend (API Server)
- **Hono Framework**: Fast web framework with OpenAPI integration
- **Prisma v6**: Advanced ORM with MongoDB optimizations
- **JWT Authentication**: Secure token-based authentication
- **File Storage**: AWS S3 with presigned URLs
- **Email/SMS**: AWS SES and Twilio integration

### Database Schema
```
Events
├── Groups (event-specific containers)
│   ├── Activities (rich content with scheduling)
│   └── Users (comprehensive attendee profiles)
├── Admins (role-based access control)
└── Messages (multi-channel communication tracking)
```

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
SES_FROM_NAME="Savvio Concorde"
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

## 📚 API Documentation

### Interactive Documentation
Visit `http://localhost:3001/docs` for complete interactive Swagger documentation with request/response examples.

### 🌐 Public Endpoints (User Microsite)
```http
POST   /api/events/{eventId}/register          # Event registration
GET    /api/events/{eventId}/info              # Public event information
POST   /api/auth/request-magic-link            # Request login link
POST   /api/auth/validate-magic-link           # Validate magic link token
```

### 🔐 User Authenticated Endpoints
```http
GET    /api/user/profile                       # User profile with group assignment
GET    /api/user/itinerary                     # User's group activities timeline
PUT    /api/user/preferences                   # Update communication preferences
GET    /api/activities/{activityId}            # Single activity details
```

### 🛡️ Admin Endpoints
```http
# Authentication
POST   /api/v1/admin/login                     # Admin login

# Event Management (Super Admin Only)
GET    /api/v1/admin/events                    # List all events
POST   /api/v1/admin/events                    # Create new event
PATCH  /api/v1/admin/events/{id}               # Update event
PATCH  /api/v1/admin/events/{id}/toggle        # Toggle event status

# User Management
GET    /api/v1/admin/users                     # List users with filters
GET    /api/v1/admin/users/{id}                # Get user details
PUT    /api/v1/admin/users/{id}                # Update user profile
PUT    /api/v1/admin/users/{id}/assign         # Assign user to group
POST   /api/v1/admin/users/{id}/unassign       # Unassign user from group
POST   /api/v1/admin/users/import              # Bulk import from CSV
GET    /api/v1/admin/users/export              # Export to CSV

# Group Management
GET    /api/v1/admin/groups                    # List groups
POST   /api/v1/admin/groups                    # Create group
PATCH  /api/v1/admin/groups/{id}               # Update group
DELETE /api/v1/admin/groups/{id}               # Delete group
GET    /api/v1/admin/groups/export             # Export groups

# Activity Management
GET    /api/v1/admin/activities                # List activities
POST   /api/v1/admin/activities                # Create activity with rich content
PATCH  /api/v1/admin/activities/{id}           # Update activity
DELETE /api/v1/admin/activities/{id}           # Delete activity
GET    /api/v1/admin/activities/export         # Export activities

# File Upload
POST   /api/v1/admin/upload/presigned-url      # Generate S3 upload URL

# Administrator Management
GET    /api/v1/admin/administrators            # List administrators
PATCH  /api/v1/admin/administrators/{id}       # Update admin role/status
```

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

## 🛠️ Development Scripts

### Backend Server
```bash
bun run dev             # Start development server (auto-reload)
bun run build           # Build for production
bun run start           # Start production server
bun run type-check      # TypeScript type checking
```

### Database Management (Prisma v6)
```bash
bun run prisma:generate    # Generate Prisma client
bun run prisma:push        # Push schema to database
bun run prisma:studio      # Open Prisma Studio GUI
bun run prisma:validate    # Validate schema
bun run prisma:format      # Format schema file
bun run reset-db           # Reset database (development)
```

### Setup & Utilities
```bash
bun run setup              # Ensure demo super admin + run demo seeding
bun run seed:demo          # Seed deterministic demo dataset
bun run demo:reset         # Force-reset and reseed demo dataset
bun run demo:setup         # Prisma generate/push + setup + seed flow
bun run create-dummy-users # Generate test users
```

### Demo Reset
Use this sequence before recording to guarantee deterministic state:

```bash
bun run prisma:generate
bun run prisma:push
bun run demo:reset
```

If you need full setup (admin bootstrap + seed) in one command:

```bash
bun run demo:setup
```

### [V1] Demo Mode & OTP Fallback
Use these values in `backend/.env` for local recording reliability:

```bash
DEMO_MODE=true
DEMO_OTP_MODE=true
DEMO_OTP_FIXED_CODE=1234
EMAIL_PROVIDER=resend
```

With `DEMO_MODE=true`, backend boot does not require unused provider credentials.  
With `DEMO_OTP_MODE=true`, `/api/v1/auth/request-email-otp` succeeds without outbound delivery and `/api/v1/auth/validate-otp` accepts only `DEMO_OTP_FIXED_CODE`.

### [V1] PassKit Setup (Google Wallet)
Required env vars:

```bash
PASSKIT_API_KEY=pk_test_replace_me
PASSKIT_TEMPLATE_ID=template_replace_me
PASSKIT_ISSUER_ID=issuer_replace_me
PASSKIT_BASE_URL=https://api.passkit.com
WALLET_PASS_TTL_HOURS=24
```

When configured, attendee endpoint `GET /api/v1/user/wallet-pass` calls PassKit to return `googleWalletUrl`.

### [V1] Smoke Check
From repo root:

```bash
./scripts/demo-smoke.sh
```

The script checks backend health/docs, dashboard login route, public event info, OTP request/validate, and wallet endpoint readiness.

### Frontend Admin Dashboard
```bash
cd admin-frontend
bun run dev                # Start Next.js development server
bun run build              # Build for production
bun run lint               # ESLint validation
bun run format             # Prettier formatting
```

## Communication Flow

1. **User Registration**: Multi-step registration with comprehensive profile
2. **Welcome Notification**: Sent via user's preferred channels (email/WhatsApp)
3. **Admin Assignment**: Manual assignment to appropriate group
4. **Assignment Notification**: User receives group assignment via preferred channels
5. **Activity Updates**: Notifications when activities are modified
6. **Announcements**: Broadcast messages to groups or all users

## 📋 Advanced Data Management

### Smart CSV Import/Export System
- **Auto-Mapping Templates**: Download pre-formatted CSV templates with sample data
- **Intelligent Field Detection**: Automatic field mapping when using templates
- **Fuzzy Matching**: Smart detection of field name variations (e.g., `first_name` → `firstName`)
- **Export-Import Roundtrip**: Perfect compatibility - exported data can be immediately re-imported
- **Comprehensive Validation**: Real-time error reporting with row-specific feedback

### Template Structure
**Users Template (16+ fields)**:
```csv
firstName, lastName, email, phone, dietaryRequirements,
medicalRequirements, accessibilityRequirements, accommodationRequired,
hotel, checkInDate, checkOutDate, flightArrival, flightDeparture,
emergencyContactName, emergencyContactPhone
```

**Groups Template (5 fields)**:
```csv  
name, description, capacity, category, assignedMembers
```

**Activities Template (10 fields)**:
```csv
title, group, startDateTime, endDateTime, location, address,
category, description, thumbnail, mapLink
```

## 🔒 Security & Authentication

### User Authentication (Microsite)
- **Passwordless Magic Links**: 24-hour expiring email-based authentication
- **JWT Sessions**: Secure token-based sessions lasting event duration
- **Single-Use Tokens**: Magic links can only be used once
- **Group-Based Access**: Users only see activities from their assigned group

### Admin Authentication (Dashboard)
- **Password-Based**: Traditional email/password for admin accounts
- **Role-Based Access Control**: Super Admin vs Standard Admin permissions
- **JWT Tokens**: Secure API authentication with automatic refresh
- **Self-Edit Protection**: Admins cannot modify their own accounts

### Data Security
- **Event Isolation**: Complete data scoping per event
- **Input Validation**: Comprehensive Zod schema validation
- **S3 Presigned URLs**: Secure file uploads without direct S3 access
- **JWT Token Management**: Automatic token refresh and secure storage

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

## 🎨 Frontend Features (Admin Dashboard)

### Rich Text Activity Editor
- **Tiptap Integration**: Professional rich text editor with full toolbar
- **S3 Image Uploads**: Direct image upload with presigned URLs
- **Edit/Preview Modes**: Real-time content preview for activities
- **Dark Mode Support**: Complete light/dark theme compatibility
- **Professional Typography**: Custom Google Fonts (Plus Jakarta Sans, Lora, IBM Plex Mono)

### Advanced User Interface
- **Card-Based Design**: Modern card layouts for groups, activities, and admins
- **Responsive Design**: Mobile-friendly admin dashboard
- **Timezone Management**: Event-based timezone display with clear indicators
- **Real-Time Statistics**: Live event analytics and reporting
- **Smart Search**: Enhanced search with visual feedback

### Data Management Tools
- **Template System**: Downloadable CSV templates with sample data
- **Auto-Mapping**: Intelligent field detection for imports
- **Export Compatibility**: Exported data can be immediately re-imported
- **Bulk Operations**: Efficient handling of large datasets

## 🚀 Getting Started

### Quick Setup (Development)
```bash
# 1. Clone and install dependencies
git clone <repository>
cd suleman-backend
bun install

# 2. Set up environment
cp .env.example .env
# Configure your MongoDB, AWS, and Twilio credentials

# 3. Initialize database
bun run prisma:generate
bun run prisma:push
bun run setup

# 4. Start backend server
bun run dev
# API: http://localhost:3001
# Docs: http://localhost:3001/docs

# 5. Start admin dashboard (in new terminal)
cd admin-frontend
bun install
bun run dev
# Dashboard: http://localhost:3000
```

### Production Deployment Checklist
- [ ] Configure production MongoDB (Atlas recommended)
- [ ] Set up AWS services (S3, SES, CloudFront)
- [ ] Submit WhatsApp templates to Twilio for approval
- [ ] Configure SSL certificates
- [ ] Set up monitoring (CloudWatch)
- [ ] Configure backup strategies
- [ ] Test email deliverability (SPF/DKIM)

## 📧 Contact & Support

For questions, issues, or feature requests, please refer to the project documentation or contact the development team.

## License

MIT License - see LICENSE file for details.
