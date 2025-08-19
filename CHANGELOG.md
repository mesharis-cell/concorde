# Changelog

All notable changes to the Event Concierge Platform Backend will be documented in this file.

## [1.1.0] - 2024-01-XX

### Added
- Upgraded Prisma from v5.x to v6.14.0
- Implemented Prisma v6 Global Omit feature for automatic passwordHash exclusion
- Added optimized database indexes for better query performance
- Enhanced Prisma client configuration with v6 performance optimizations
- Added new Prisma v6 validation and formatting commands

### Changed
- **BREAKING**: Updated Admin service to leverage Prisma v6 omit feature
- Improved database connection health check for MongoDB
- Enhanced TypeScript support with Prisma v6 client improvements

### Technical Improvements
- Added composite indexes for User, Activity, and Message models
- Enabled Prisma v6 library engine for better performance  
- Updated schema with optimized field ordering and indexing
- Improved query performance for timeline and user filtering operations

### Migration Guide
To upgrade from v1.0.0:

1. Ensure MongoDB is running
2. Run `bun install` to update dependencies
3. Run `bun run prisma:generate` to regenerate client
4. Run `bun run prisma:push` to update database indexes
5. Test application functionality

### Compatibility
- MongoDB 4.4+
- Bun runtime
- Node.js 18+ (if not using Bun)

---

## [1.0.0] - 2024-01-XX

### Added
- Initial release of Event Concierge Platform Backend
- Multi-event management system with full CRUD operations
- User registration with magic link authentication
- Admin role-based access control (Super/Standard)
- Group and activity management with rich content
- Multi-channel notifications (Email via AWS SES, WhatsApp via Twilio)
- File upload support with AWS S3 integration
- Comprehensive OpenAPI documentation
- CSV import/export functionality
- Real-time itinerary management
- Communication preference handling

### Technical Stack
- Hono.js framework with TypeScript
- MongoDB database with Prisma ORM v5
- JWT authentication with magic links
- AWS integration (SES, S3)
- Twilio WhatsApp Business API
- Zod validation schemas
- Full OpenAPI 3.0 specification