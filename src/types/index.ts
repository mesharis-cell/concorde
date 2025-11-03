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
  'OTP_VERIFICATION',
]);
export type MessageType = z.infer<typeof MessageType>;

export const RecipientType = z.enum(['INDIVIDUAL', 'GROUP', 'ALL']);
export type RecipientType = z.infer<typeof RecipientType>;

export const ReportType = z.enum([
  'arrival-list',
  'departure-list',
  'medical-list',
  'dietary-list',
  'dietary-requirements',
  'emergency-report',
  'rooming-list',
  'guest-list-alpha',
  'activity-attendance',
  'guest-list-type',
  'guest-list-group',
  'master-guest',
  'change-report-user',
  'change-report-activity',
  'change-report-group',
  'change-report-event',
  'change-report-operations',
  'merchandise-report',
  'room-drops',
  'car-assignment',
]);
export type ReportType = z.infer<typeof ReportType>;

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
  // Email configuration
  fromEmail: z.string().email().optional(),
  fromName: z.string().optional(),
  // ✅ Phase 2 additions
  hotelConfig: z
    .object({
      hotels: z.array(
        z.object({
          name: z.string(),
          isDefault: z.boolean(),
          checkInTime: z.string(),
          checkOutTime: z.string(),
          contractedRooms: z
            .array(
              z.object({
                date: z.string(), // Changed to string to support dd/MM/yyyy format
                roomType: z.string(),
                quantity: z.number(),
                allocated: z.number(),
              })
            )
            .default([]),
        })
      ),
    })
    .nullable()
    .optional(),
  roomDrops: z
    .object({
      drops: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          stock: z.number().min(0),
          assigned: z.number().default(0),
        })
      ),
    })
    .nullable()
    .optional(),
  guestCategories: z
    .object({
      categories: z.array(z.string()),
    })
    .nullable()
    .optional(),
  carConfig: z
    .object({
      cars: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          type: z.string(),
          plate: z.string(),
          driver: z.string(),
        })
      ),
      lastUpdated: z.string().optional(),
    })
    .nullable()
    .optional(),
  termsConditions: z.string().nullable().optional(),
  privacyPolicy: z.string().nullable().optional(),
  // Dynamic Registration Form Configuration
  registrationFormConfig: z.any().optional(),
});
export type CreateEvent = z.infer<typeof CreateEventSchema>;

// ============================================================================
// Group Types
// ============================================================================

export const CreateGroupSchema = z.object({
  eventId: z.string(),
  name: z.string().min(1),
  description: z.string(),
  // Transport assignments - default cars for group members
  carNumbers: z.array(z.string()).optional().default([]), // ["car-1", "car-2"] - inherited by all group members
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
  name: z.string().optional(), // Made optional for temp dashboard compatibility
  address: z.string().optional(), // Made optional for temp dashboard compatibility
  mapLink: z.string().optional(), // Allow any string content including iframe embeds
});
export type ActivityLocation = z.infer<typeof ActivityLocationSchema>;

export const ActivityContentSchema = z.object({
  html: z.string(),
});
export type ActivityContent = z.infer<typeof ActivityContentSchema>;

export const ActivityTimingEntrySchema = z.object({
  enabled: z.boolean(),
  time: z.string(), // "18:00"
  description: z.string(),
  location: z.string().optional(),
});

export const CreateActivitySchema = z.object({
  eventId: z.string(),
  groupIds: z.array(z.string()).default([]), // Array of group IDs - optional for temp dashboard
  title: z.string().min(1),
  description: z.string().optional(),
  startDateTime: z.coerce.date(),
  endDateTime: z.coerce.date(),
  thumbnail: z.string().optional(), // Removed URL validation for flexibility
  category: ActivityCategory.default('OTHER'),
  location: ActivityLocationSchema.optional(),
  content: ActivityContentSchema,
  dressCode: z.string().optional(), // Dress code field for temp dashboard
  capacity: z.number().int().positive().optional(), // Optional capacity limit
  timingTable: z.array(ActivityTimingEntrySchema).default([]), // Structured timing details
  allowConflicts: z.boolean().optional().default(false), // Allow capacity conflicts
  createdBy: z.string().optional(), // Made optional for temp dashboard
});
export type CreateActivity = z.infer<typeof CreateActivitySchema>;

export const UpdateActivitySchema = CreateActivitySchema.partial()
  .omit({
    eventId: true,
    createdBy: true,
  })
  .extend({
    allowConflicts: z.boolean().optional().default(false),
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
  'OTP_VERIFICATION',
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
      // Authentication templates must include otpCode variable
      if (
        data.type === 'AUTHENTICATION' &&
        data.category === 'OTP_VERIFICATION'
      ) {
        return data.html.includes('{{otpCode}}');
      }
      return true;
    },
    {
      message:
        'Authentication templates must include {{otpCode}} variable in the content',
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
  // Preferred names (always optional, no checkbox needed)
  preferredFirstName: z.string().optional(),
  preferredLastName: z.string().optional(),
  // Additional fields for CSV import
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  guestType: z.string().optional(),
  vip: z.boolean().optional(),
  initials: z.string().optional(),
  host: z.string().optional(),
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
      departureDate: z.string().optional(), // Date in dd/mm/yyyy format
      departureTime: z.string().optional(), // Time in 24hr hh:mm format
      departureTerminal: z.string().optional(), // "Inbound Departure terminal"
      flightNumber: z.string().optional(), // "Inbound Flight number"
      airline: z.string().optional(), // Singapore addition: Airline name
      arrivalDate: z.string().optional(), // Date in dd/mm/yyyy format
      arrivalTime: z.string().optional(), // Time in 24hr hh:mm format
      arrivalToAirport: z.string().optional(), // "Inbound Arrival to airport"
      arrivalToTerminal: z.string().optional(), // "Inbound Arrival to terminal"
    })
    .optional(),
  outbound: z
    .object({
      departureFrom: z.string().optional(), // "Outbound Departure from [station/airport]"
      departureDate: z.string().optional(), // Date in dd/mm/yyyy format
      departureTime: z.string().optional(), // Time in 24hr hh:mm format
      departureTerminal: z.string().optional(), // "Outbound Departure Terminal"
      flightNumber: z.string().optional(), // "Outbound Flight number"
      airline: z.string().optional(), // Singapore addition: Airline name
      arrivalDate: z.string().optional(), // Date in dd/mm/yyyy format
      arrivalTime: z.string().optional(), // Time in 24hr hh:mm format
      arrivalToAirport: z.string().optional(), // "Outbound Arrival to airport"
      arrivalToTerminal: z.string().optional(), // "Outbound Arrival to terminal"
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
  hotelId: z.string().optional(), // Reference to Hotel ID
  checkIn: z
    .string()
    .refine((val) => {
      if (!val || val === '') return true; // Allow empty
      return /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/.test(
        val
      );
    }, 'Must be DD/MM/YYYY or ISO date format')
    .nullable()
    .optional()
    .transform((val) => (val === null || val === '' ? undefined : val)),
  checkOut: z
    .string()
    .refine((val) => {
      if (!val || val === '') return true; // Allow empty
      return /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/.test(
        val
      );
    }, 'Must be DD/MM/YYYY or ISO date format')
    .nullable()
    .optional()
    .transform((val) => (val === null || val === '' ? undefined : val)),
  // Hotel notes for pre-assignment planning (restored to accommodation)
  hotelNotes: z.string().optional(),

  // Singapore Phase 2 additions - Enhanced occupancy options
  doubleOccupancy: z
    .object({
      enabled: z.boolean().default(false),
      guestType: z.enum(['official', 'plus-one']).optional(), // "another official guest" or "personal plus one"
      guestName: z.string().optional(),
      guestRelation: z.string().optional(),
    })
    .optional(),
  twinOccupancy: z
    .object({
      enabled: z.boolean().default(false),
      guestType: z.enum(['official', 'plus-one']).optional(), // "another official guest" or "personal plus one"
    })
    .optional(),
  earlyCheckIn: z.boolean().optional(),
  lateCheckOut: z.boolean().optional(),
  visaBookingRequired: z.boolean().optional(),

  // Room assignment fields (admin-managed)
  roomType: z.string().optional(), // Assigned by admin
  occupancy: z.enum(['single', 'double', 'twin', 'room_sharer']).optional(),
  guestName: z.string().optional(), // If double occupancy
  guestRelation: z.string().optional(), // "Spouse", "Partner", etc.
  nightsCount: z
    .number()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)), // Auto-computed
  roomNumber: z.string().optional(), // From RoomAssignment
  roomDropId: z.string().optional(), // References event.roomDrops[].id
});
export type UserAccommodation = z.infer<typeof UserAccommodationSchema>;

export const UserRequirementsSchema = z.object({
  // Enhanced YES/NO pattern with conditional details
  medical: z
    .object({
      enabled: z.boolean().default(false),
      details: z.string().optional(), // "Asthma, EpiPen carrier, etc."
    })
    .optional(),
  dietary: z
    .object({
      enabled: z.boolean().default(false),
      details: z.string().optional(), // "VEGAN, HALAL, NO FISH, ETC."
    })
    .optional(),
  allergiesIntolerances: z
    .object({
      enabled: z.boolean().default(false),
      details: z.string().optional(), // "No shellfish, No nuts, no dairy"
    })
    .optional(),
  accessibility: z
    .object({
      enabled: z.boolean().default(false),
      details: z.string().optional(), // "Wheelchair, etc."
    })
    .optional(),
  otherComments: z.string().optional(), // Open text field for any other comments
});
export type UserRequirements = z.infer<typeof UserRequirementsSchema>;

export const UserMerchandiseSizeSchema = z.object({
  // Singapore Phase 2 addition
  gender: z
    .enum(['Men', 'Women'])
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? undefined : val)),
  // Updated to use single size field instead of individual items (includes XS)
  size: z.enum(['XS', 'S', 'M', 'L', 'XL']).optional(),

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

// Session and magic link schemas removed - replaced with JWT + OTP authentication

// Individual field response with metadata (must be defined before CreateUserSchema)
export const FormFieldResponseSchema = z.object({
  fieldName: z.string(),
  fieldLabel: z.string(),
  fieldType: z.string(),
  value: z.any(), // Can be string, boolean, number, etc.
  step: z.string(),
  order: z.number(),
});
export type FormFieldResponse = z.infer<typeof FormFieldResponseSchema>;

export const CreateUserSchema = z.object({
  eventId: z.string(),
  email: z.string().email(),
  formResponses: z.array(FormFieldResponseSchema),
  communication: UserCommunicationSchema,
  flight: UserFlightSchema.optional(),
  accommodation: UserAccommodationSchema.optional(),
  transferRequirements: z.boolean().optional().default(false),
  gpTransfersRequired: z.boolean().optional().default(false),
  eventTransfersRequired: z.boolean().optional().default(false),
  guestCategory: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  tickets: z
    .array(
      z.object({
        name: z.string().min(1, 'Ticket name is required'),
        number: z.string().min(1, 'Ticket number is required'),
        valid: z.boolean().default(true),
      })
    )
    .optional()
    .default([]),

  // Transport assignments - individual car overrides
  carNumbers: z.array(z.string()).optional().default([]), // [] = inherit from group, ["car-5"] = override

  // Report-specific notes
  arrivalNotes: z.string().optional(),
  departureNotes: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  masterGuestNotes: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),

  // Hotel & room management
  hotelId: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  roomDropAssigned: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val === null ? undefined : val)),

  // Admin controls
  active: z.boolean().optional().default(true),
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

// Public Registration Schema - Dynamic Form Based
export const PublicRegistrationSchema = z.object({
  eventId: z.string(),
  email: z.string().email(),
  formResponses: z.array(FormFieldResponseSchema), // Array of all form field responses
  communication: UserCommunicationSchema.default({
    emailOptIn: true,
    whatsappOptIn: false,
  }),
  // Group binding assignment during registration
  groupId: z.string().optional(),
});
export type PublicRegistration = z.infer<typeof PublicRegistrationSchema>;

// Admin User Update Schema - excludes communication preferences
export const AdminUpdateUserSchema = CreateUserSchema.omit({
  eventId: true,
  communication: true,
}).partial();
export type AdminUpdateUser = z.infer<typeof AdminUpdateUserSchema>;

// ============================================================================
// Room Assignment Types
// ============================================================================

export const CreateRoomAssignmentSchema = z.object({
  userId: z.string().min(1),
  eventId: z.string().min(1),
  hotelId: z.string().min(1),
  roomTypeId: z.string().min(1),
  hotelNotes: z.string().optional(),
  billingNotes: z.string().optional(),
  bookingConfirmationNumber: z.string().optional(),
});
export type CreateRoomAssignment = z.infer<typeof CreateRoomAssignmentSchema>;

export const UpdateRoomAssignmentSchema = z.object({
  hotelId: z.string().optional(),
  roomTypeId: z.string().optional(),
  hotelNotes: z.string().optional(),
  billingNotes: z.string().optional(),
  bookingConfirmationNumber: z.string().optional(),
});
export type UpdateRoomAssignment = z.infer<typeof UpdateRoomAssignmentSchema>;

export const GuestCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().default(0), // For ordering
});
export type GuestCategory = z.infer<typeof GuestCategorySchema>;

export const RoomDropSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  stock: z.number().min(0),
  assigned: z.number().default(0), // Track how many are assigned
});
export type RoomDrop = z.infer<typeof RoomDropSchema>;

export const HotelSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
  checkInTime: z.string(), // "15:00"
  checkOutTime: z.string(), // "11:00"
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  active: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Hotel = z.infer<typeof HotelSchema>;

export const CreateHotelSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
  checkInTime: z.string().min(1),
  checkOutTime: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
});
export type CreateHotel = z.infer<typeof CreateHotelSchema>;

export const UpdateHotelSchema = CreateHotelSchema.partial().omit({
  eventId: true,
});
export type UpdateHotel = z.infer<typeof UpdateHotelSchema>;

export const RoomTypeSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  hotelId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  maxOccupancy: z.number().int().positive().default(2),
  amenities: z.array(z.string()).default([]),
  basePrice: z.number().optional(),
  active: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const CreateRoomTypeSchema = z.object({
  eventId: z.string().min(1),
  hotelId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  maxOccupancy: z.number().int().positive().default(2),
  amenities: z.array(z.string()).default([]),
  basePrice: z.number().optional(),
});
export type CreateRoomType = z.infer<typeof CreateRoomTypeSchema>;

export const UpdateRoomTypeSchema = CreateRoomTypeSchema.partial().omit({
  eventId: true,
  hotelId: true,
});
export type UpdateRoomType = z.infer<typeof UpdateRoomTypeSchema>;

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

// ============================================================================
// OTP Types
// ============================================================================

export const RequestOTPSchema = z.object({
  email: z.string().email('Valid email address is required'),
  eventId: z.string().min(1, 'Event ID is required'),
  channel: z.enum(['email', 'sms']).default('email'),
});
export type RequestOTP = z.infer<typeof RequestOTPSchema>;

export const ValidateOTPSchema = z.object({
  otpId: z.string().min(1, 'OTP ID is required'),
  otpCode: z
    .string()
    .length(4, 'OTP code must be 4 digits')
    .regex(/^\d{4}$/, 'OTP code must contain only numbers'),
});
export type ValidateOTP = z.infer<typeof ValidateOTPSchema>;

// ============================================================================
// Audit Trail Types
// ============================================================================

export const AuditActionEnum = z.enum([
  'CREATE',
  'UPDATE',
  'DELETE',
  'IMPORT',
  'EXPORT',
  'ASSIGN',
  'UNASSIGN',
]);
export const ResourceTypeEnum = z.enum([
  'User',
  'Activity',
  'Group',
  'Event',
  'EmailTemplate',
  'Admin',
  'BulkOperation',
]);

export const GetAuditTrailSchema = z.object({
  eventId: z.string().optional(),
  performedBy: z.string().optional(),
  resourceType: ResourceTypeEnum.optional(),
  action: AuditActionEnum.optional(),
  resourceId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

export type GetAuditTrail = z.infer<typeof GetAuditTrailSchema>;

// ============================================================================
// Reports Types
// ============================================================================

export const ReportExportRequestSchema = z.object({
  eventId: z.string(),
  reportType: ReportType,
  format: z.enum(['excel', 'csv']).default('excel'),
  activityId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});
export type ReportExportRequest = z.infer<typeof ReportExportRequestSchema>;

export const BulkExportRequestSchema = z.object({
  eventId: z.string(),
  reportTypes: z.array(ReportType),
  format: z.enum(['excel', 'csv']).default('excel'),
});
export type BulkExportRequest = z.infer<typeof BulkExportRequestSchema>;

// ============================================================================
// Dynamic Registration Form Configuration Types
// ============================================================================

// Field Types - All supported form field types
export const FormFieldTypeEnum = z.enum([
  'text',
  'email',
  'tel',
  'url',
  'password',
  'textarea',
  'select',
  'radio',
  'checkbox',
  'switch',
  'date',
  'time',
  'datetime',
  'file',
  'number',
  'dynamic-hotel-select',
  'dynamic-groups-select',
]);
export type FormFieldType = z.infer<typeof FormFieldTypeEnum>;

// Validation Rules Schema
export const ValidationRulesSchema = z.object({
  required: z.boolean().default(false),
  min: z.number().optional(), // For numbers, min value
  max: z.number().optional(), // For numbers, max value
  minLength: z.number().optional(), // For strings, min length
  maxLength: z.number().optional(), // For strings, max length
  pattern: z.string().optional(), // Regex pattern as string
  email: z.boolean().optional(), // Email format validation
  url: z.boolean().optional(), // URL format validation
  phone: z.boolean().optional(), // Phone format validation
  minDate: z.string().optional(), // For date fields - minimum allowed date (ISO string)
  maxDate: z.string().optional(), // For date fields - maximum allowed date (ISO string)
  minAge: z.number().optional(), // For date fields - minimum age in years (e.g., 21 for age gating)
  maxAge: z.number().optional(), // For date fields - maximum age in years
  custom: z.string().optional(), // Custom validation expression
  message: z.string().optional(), // Custom error message
}).optional();
export type ValidationRules = z.infer<typeof ValidationRulesSchema>;

// Conditional Expression Schema
export const ConditionalExpressionSchema = z.string().optional();
export type ConditionalExpression = z.infer<typeof ConditionalExpressionSchema>;

// Select/Radio Option Schema
export const FieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  disabled: z.boolean().optional().default(false),
});
export type FieldOption = z.infer<typeof FieldOptionSchema>;

// Form Field Configuration Schema
export const FormFieldConfigSchema = z.object({
  name: z.string().min(1), // Field name (used as key in form data)
  type: FormFieldTypeEnum,
  label: z.string().min(1), // Display label
  placeholder: z.string().optional(), // Placeholder text
  helperText: z.string().optional(), // Helper text below field
  required: z.boolean().default(false), // Is field required
  validation: ValidationRulesSchema, // Validation rules
  conditional: ConditionalExpressionSchema, // Show/hide based on condition
  options: z.array(FieldOptionSchema).optional(), // For select/radio fields
  defaultValue: z.any().optional(), // Default value
  order: z.number().default(0), // Display order within step
  rows: z.number().optional(), // For textarea - number of rows
  multiple: z.boolean().optional(), // For select - allow multiple
  accept: z.string().optional(), // For file - accepted file types
  // Phone field specific
  defaultCountry: z.string().optional(), // For tel fields - default country code (e.g., "AE", "US")
  // Date field specific
  dateFormat: z.enum(['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy']).optional(), // For date fields - display format
  metadata: z.record(z.any()).optional(), // Additional custom metadata
});
export type FormFieldConfig = z.infer<typeof FormFieldConfigSchema>;

// Form Step Configuration Schema
export const FormStepConfigSchema = z.object({
  label: z.string().min(1), // Step title
  subLabel: z.string().optional(), // Step subtitle/description
  order: z.number().default(0), // Step order
  fields: z.array(FormFieldConfigSchema), // Array of field configurations
});
export type FormStepConfig = z.infer<typeof FormStepConfigSchema>;

// Complete Registration Form Configuration Schema
export const RegistrationFormConfigSchema = z.record(
  z.string(), // Step key (step1, step2, etc.)
  FormStepConfigSchema
);
export type RegistrationFormConfig = z.infer<typeof RegistrationFormConfigSchema>;

// Update Event Schema to include form config (for API updates)
export const UpdateEventFormConfigSchema = z.object({
  registrationFormConfig: RegistrationFormConfigSchema.optional(),
});
export type UpdateEventFormConfig = z.infer<typeof UpdateEventFormConfigSchema>;
