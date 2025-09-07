import { z } from 'zod';

// ============================================================================
// Base Types
// ============================================================================

export const AdminRole = z.enum(['SUPER', 'STANDARD']);
export type AdminRole = z.infer<typeof AdminRole>;

export const ActivityCategory = z.enum([
  'TRANSPORT',
  'HOSPITALITY',
  'EXPERIENCE',
  'MEETING',
  'OTHER',
]);
export type ActivityCategory = z.infer<typeof ActivityCategory>;

export const MessageType = z.enum([
  'WELCOME',
  'ASSIGNMENT',
  'ACTIVITY_UPDATE',
  'ANNOUNCEMENT',
  'MAGIC_LINK',
]);
export type MessageType = z.infer<typeof MessageType>;

export const RecipientType = z.enum(['INDIVIDUAL', 'GROUP', 'ALL']);
export type RecipientType = z.infer<typeof RecipientType>;

// ============================================================================
// Event Types
// ============================================================================

export const EventLocationSchema = z.object({
  city: z.string(),
  country: z.string(),
  venue: z.string(),
  timezone: z.string(),
});
export type EventLocation = z.infer<typeof EventLocationSchema>;

export const EventDateRangeSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});
export type EventDateRange = z.infer<typeof EventDateRangeSchema>;

export const EventConfigSchema = z.object({
  micrositeUrl: z.string().url().optional(),
  registrationOpen: z.boolean(),
});
export type EventConfig = z.infer<typeof EventConfigSchema>;

export const CreateEventSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().min(1),
  location: EventLocationSchema,
  dateRange: EventDateRangeSchema,
  config: EventConfigSchema,
});
export type CreateEvent = z.infer<typeof CreateEventSchema>;

// ============================================================================
// Group Types
// ============================================================================

export const CreateGroupSchema = z.object({
  eventId: z.string(),
  name: z.string().min(1),
  description: z.string(),
});
export type CreateGroup = z.infer<typeof CreateGroupSchema>;

export const UpdateGroupSchema = CreateGroupSchema.partial().omit({
  eventId: true,
});
export type UpdateGroup = z.infer<typeof UpdateGroupSchema>;

// ============================================================================
// Activity Types
// ============================================================================

export const ActivityLocationSchema = z.object({
  name: z.string(),
  address: z.string(),
  mapLink: z.string().optional(), // Allow any string content including iframe embeds
});
export type ActivityLocation = z.infer<typeof ActivityLocationSchema>;

export const ActivityContentSchema = z.object({
  html: z.string(),
});
export type ActivityContent = z.infer<typeof ActivityContentSchema>;

export const CreateActivitySchema = z.object({
  eventId: z.string(),
  groupIds: z.array(z.string()).default([]), // Array of group IDs
  title: z.string().min(1),
  description: z.string().optional(),
  startDateTime: z.coerce.date(),
  endDateTime: z.coerce.date(),
  thumbnail: z.string().url().optional(),
  category: ActivityCategory.default('OTHER'),
  location: ActivityLocationSchema.optional(),
  content: ActivityContentSchema,
});
export type CreateActivity = z.infer<typeof CreateActivitySchema>;

export const UpdateActivitySchema = CreateActivitySchema.partial().omit({
  eventId: true,
  createdBy: true,
});
export type UpdateActivity = z.infer<typeof UpdateActivitySchema>;

// Activity assignment schemas
export const AssignActivitySchema = z.object({
  groupId: z.string().min(1),
  adminId: z.string().min(1),
});
export type AssignActivity = z.infer<typeof AssignActivitySchema>;

export const UnassignActivitySchema = z.object({
  adminId: z.string().min(1),
});
export type UnassignActivity = z.infer<typeof UnassignActivitySchema>;

// User Activity Exclusion schemas
export const CreateExclusionSchema = z.object({
  userId: z.string().min(1),
  activityId: z.string().min(1),
  groupId: z.string().min(1),
  adminId: z.string().min(1),
  reason: z.string().optional(),
});
export type CreateExclusion = z.infer<typeof CreateExclusionSchema>;

export const RemoveExclusionSchema = z.object({
  userId: z.string().min(1),
  activityId: z.string().min(1),
  adminId: z.string().min(1),
});
export type RemoveExclusion = z.infer<typeof RemoveExclusionSchema>;

// ============================================================================
// Template Types
// ============================================================================

export const TemplateTypeEnum = z.enum(['COMMUNICATION', 'AUTHENTICATION']);
export const TemplateCategoryEnum = z.enum([
  'WELCOME',
  'ASSIGNMENT',
  'ACTIVITY_UPDATE',
  'ANNOUNCEMENT',
  'MAGIC_LINK',
  'CUSTOM',
]);

export const CreateTemplateSchema = z
  .object({
    eventId: z.string().min(1),
    name: z.string().min(1).max(100),
    type: TemplateTypeEnum,
    category: TemplateCategoryEnum,
    subject: z.string().min(1),
    html: z.string().min(1),
  })
  .refine(
    (data) => {
      // Authentication templates must include magicLink variable
      if (data.type === 'AUTHENTICATION' && data.category === 'MAGIC_LINK') {
        return data.html.includes('{{magicLink}}');
      }
      return true;
    },
    {
      message:
        'Authentication templates must include {{magicLink}} variable in the content',
      path: ['html'],
    }
  );
export type CreateTemplate = z.infer<typeof CreateTemplateSchema>;

export const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  subject: z.string().min(1).optional(),
  html: z.string().min(1).optional(),
  active: z.boolean().optional(),
});
export type UpdateTemplate = z.infer<typeof UpdateTemplateSchema>;

export const TestTemplateSchema = z.object({
  recipientEmail: z.string().email(),
  variables: z.record(z.any()).optional(),
});
export type TestTemplate = z.infer<typeof TestTemplateSchema>;

// ============================================================================
// User Types
// ============================================================================

export const UserProfileSchema = z.object({
  email: z.string().optional(), // Allow empty during seeding - no email validation
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const UserCommunicationSchema = z.object({
  emailOptIn: z.boolean(),
  whatsappOptIn: z.boolean(),
});
export type UserCommunication = z.infer<typeof UserCommunicationSchema>;

export const UserFlightSchema = z.object({
  inbound: z
    .object({
      departureFrom: z.string().optional(), // "Inbound Departure from [station/airport]"
      departureDate: z.coerce.date().optional(), // Enhanced: Date field for Singapore
      departureTime: z.string().optional(), // "Inbound Departure time [hh:mm]" - 24h format
      departureTerminal: z.string().optional(), // "Inbound Departure terminal"
      flightNumber: z.string().optional(), // "Inbound Flight number"
      airline: z.string().optional(), // Singapore addition: Airline name
      arrivalDate: z.coerce.date().optional(), // Enhanced: Date field for Singapore
      arrivalTime: z.string().optional(), // "Inbound Arrival time [hh:mm]" - 24h format
      arrivalTo: z.string().optional(), // "Inbound Arrival to [station/airport]"
    })
    .optional(),
  outbound: z
    .object({
      departureFrom: z.string().optional(), // "Outbound Departure from [station/airport]"
      departureDate: z.coerce.date().optional(), // Enhanced: Date field for Singapore
      departureTime: z.string().optional(), // "Outbound Departure time [hh:mm]" - 24h format
      departureTerminal: z.string().optional(), // "Outbound Departure Terminal"
      flightNumber: z.string().optional(), // "Outbound Flight number"
      airline: z.string().optional(), // Singapore addition: Airline name
      arrivalDate: z.coerce.date().optional(), // Enhanced: Date field for Singapore
      arrivalTime: z.string().optional(), // "Outbound Arrival time [hh:mm]" - 24h format
      arrivalTo: z.string().optional(), // "Outbound Arrival to [station/airport]"
    })
    .optional(),
});
export type UserFlight = z.infer<typeof UserFlightSchema>;

export const UserAccommodationSchema = z.object({
  required: z.boolean(),
  hotel: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  checkIn: z.coerce
    .date()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  checkOut: z.coerce
    .date()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  specialRequests: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),

  // Singapore Phase 2 additions
  occupancy: z.enum(['single', 'double']).optional(),
  guestName: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  guestRelation: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  earlyCheckIn: z.boolean().optional(),
  lateCheckOut: z.boolean().optional(),
  visaBookingRequired: z.boolean().optional(),
});
export type UserAccommodation = z.infer<typeof UserAccommodationSchema>;

export const UserRequirementsSchema = z.object({
  dietary: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  medical: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  accessibility: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  specialRequests: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
});
export type UserRequirements = z.infer<typeof UserRequirementsSchema>;

export const UserMerchandiseSizeSchema = z.object({
  // Singapore Phase 2 addition
  gender: z.enum(['Men', 'Women']).optional(),
  // Updated to use single size field instead of individual items
  size: z.enum(['S', 'M', 'L', 'XL', 'XXL']).optional(),

  // Legacy fields (keeping for backward compatibility)
  shirt: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  jacket: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  hat: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
});
export type UserMerchandiseSize = z.infer<typeof UserMerchandiseSizeSchema>;

export const UserEmergencyContactSchema = z.object({
  name: z.string().optional(),
  relationship: z.string().optional(),
  phone: z.string().optional(),
  email: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val === null || val === '' ? undefined : val)),
});
export type UserEmergencyContact = z.infer<typeof UserEmergencyContactSchema>;

export const UserSessionSchema = z.object({
  token: z.string(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  used: z.boolean(),
});
export type UserSession = z.infer<typeof UserSessionSchema>;

export const UserMagicLinkSchema = z.object({
  token: z.string(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  lastAccessedAt: z.coerce.date().optional(),
  used: z.boolean(),
});
export type UserMagicLink = z.infer<typeof UserMagicLinkSchema>;

export const CreateUserSchema = z.object({
  eventId: z.string(),
  profile: UserProfileSchema,
  communication: UserCommunicationSchema,
  flight: UserFlightSchema.optional(),
  accommodation: UserAccommodationSchema.optional(),
  transferRequirements: z.string().optional(),
  requirements: UserRequirementsSchema.optional(),
  merchandiseSize: UserMerchandiseSizeSchema.optional(),
  emergencyContact: UserEmergencyContactSchema.optional(),
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

// Public Registration Schema - Enhanced for Singapore Phase 2
export const PublicRegistrationSchema = z.object({
  eventId: z.string(),
  profile: UserProfileSchema, // Required: email, firstName, lastName, phone
  communication: UserCommunicationSchema.default({
    emailOptIn: true,
    whatsappOptIn: false,
  }),
  transferRequirements: z.string().nullable().optional(),
  requirements: UserRequirementsSchema.optional(), // Optional: dietary, medical, accessibility, specialRequests
  merchandiseSize: UserMerchandiseSizeSchema.optional(), // Enhanced: gender + size
  emergencyContact: UserEmergencyContactSchema.optional(), // Optional: name, relationship, phone, email

  // Singapore Phase 2: Users can now provide flight and accommodation details during registration
  flight: UserFlightSchema.optional(),
  accommodation: UserAccommodationSchema.optional(),
});
export type PublicRegistration = z.infer<typeof PublicRegistrationSchema>;

// Admin User Update Schema - excludes communication preferences
export const AdminUpdateUserSchema = CreateUserSchema.omit({
  eventId: true,
  communication: true,
}).partial();
export type AdminUpdateUser = z.infer<typeof AdminUpdateUserSchema>;

// ============================================================================
// Admin Types
// ============================================================================

export const CreateAdminSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(8),
  role: AdminRole.default('STANDARD'),
});
export type CreateAdmin = z.infer<typeof CreateAdminSchema>;

export const AdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type AdminLogin = z.infer<typeof AdminLoginSchema>;

// ============================================================================
// Message Types
// ============================================================================

export const MessageDeliveryChannelSchema = z.object({
  sent: z.boolean(),
  sentAt: z.coerce.date().optional(),
  delivered: z.boolean(),
  deliveredAt: z.coerce.date().optional(),
  error: z.string().optional(),
});
export type MessageDeliveryChannel = z.infer<
  typeof MessageDeliveryChannelSchema
>;

export const MessageDeliverySchema = z.object({
  user: z.string(),
  channels: z.object({
    email: MessageDeliveryChannelSchema.optional(),
    whatsapp: MessageDeliveryChannelSchema.optional(),
  }),
});
export type MessageDelivery = z.infer<typeof MessageDeliverySchema>;

export const CreateMessageSchema = z.object({
  eventId: z.string(),
  type: MessageType,
  emailSubject: z.string().optional(),
  emailContent: z.string().optional(),
  whatsappTemplate: z.string().optional(),
  templateVariables: z.record(z.any()).optional(),
  recipientType: RecipientType,
  recipientIds: z.array(z.string()),
  sentBy: z.string(),
});
export type CreateMessage = z.infer<typeof CreateMessageSchema>;

// ============================================================================
// API Response Types
// ============================================================================

export const ApiSuccessSchema = z.object({
  success: z.literal(true),
  data: z.any(),
  message: z.string().optional(),
});
export type ApiSuccess<T = any> = {
  success: true;
  data: T;
  message?: string;
};

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  details: z.any().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export type ApiResponse<T = any> = ApiSuccess<T> | ApiError;

// ============================================================================
// Utility Types
// ============================================================================

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const PaginatedResponseSchema = z.object({
  items: z.array(z.any()),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});
export type PaginatedResponse<T = any> = {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
