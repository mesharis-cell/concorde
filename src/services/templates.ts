import { prisma } from '../config/database.js';
import type { EmailTemplate } from '@prisma/client';
import { AdminService } from './admins.js';
import { v4 as uuidv4 } from 'uuid';

export interface CreateTemplate {
  eventId: string;
  name: string;
  type: 'COMMUNICATION' | 'AUTHENTICATION';
  category:
    | 'WELCOME'
    | 'ASSIGNMENT'
    | 'ACTIVITY_UPDATE'
    | 'ANNOUNCEMENT'
    | 'OTP_VERIFICATION'
    | 'CUSTOM';
  subject: string;
  html: string;
  createdBy: string;
  requiredVariables?: string[];
}

export interface UpdateTemplate {
  name?: string;
  subject?: string;
  html?: string;
  active?: boolean;
  requiredVariables?: string[];
}

export class TemplateService {
  static async create(data: CreateTemplate): Promise<EmailTemplate> {
    // Validate admin permissions (only super admin can create templates)
    const admin = await AdminService.findById(data.createdBy);
    if (!admin || admin.role !== 'SUPER') {
      throw new Error('Only super administrators can create email templates');
    }

    // Validate authentication templates must include magicLink variable
    if (
      data.type === 'AUTHENTICATION' &&
      data.category === 'OTP_VERIFICATION'
    ) {
      const magicLinkRegex = /\{\{\s*magicLink\s*\}\}/i;
      if (!magicLinkRegex.test(data.html)) {
        throw new Error(
          'Authentication templates must include {{magicLink}} variable'
        );
      }
    }

    // Extract variables from template content
    const extractedVariables = this.extractVariables(
      data.html + ' ' + data.subject
    );

    // Check if template name already exists for this event
    const existingTemplate = await prisma.emailTemplate.findUnique({
      where: {
        eventId_name: {
          eventId: data.eventId,
          name: data.name,
        },
      },
    });

    if (existingTemplate) {
      throw new Error(
        'A template with this name already exists for this event'
      );
    }

    return await prisma.emailTemplate.create({
      data: {
        eventId: data.eventId,
        name: data.name,
        type: data.type,
        category: data.category,
        subject: data.subject,
        html: data.html,
        requiredVariables: data.requiredVariables || extractedVariables,
        createdBy: data.createdBy,
      },
    });
  }

  static async findById(id: string): Promise<EmailTemplate | null> {
    return await prisma.emailTemplate.findUnique({
      where: { id, active: true },
      include: {
        event: {
          select: { id: true, name: true, shortName: true },
        },
        createdByAdmin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  static async findByEventId(
    eventId: string,
    filters: {
      type?: 'COMMUNICATION' | 'AUTHENTICATION';
      category?: string;
      active?: boolean;
    } = {}
  ): Promise<EmailTemplate[]> {
    const where: any = { eventId, active: true };

    if (filters.type) where.type = filters.type;
    if (filters.category) where.category = filters.category;
    if (filters.active !== undefined) where.active = filters.active;

    return await prisma.emailTemplate.findMany({
      where,
      include: {
        createdByAdmin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
    });
  }

  static async update(
    id: string,
    data: UpdateTemplate,
    adminId: string
  ): Promise<EmailTemplate> {
    // Check if template exists and admin has permission
    const template = await prisma.emailTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    // Only super admin can edit templates
    const admin = await AdminService.findById(adminId);
    if (!admin || admin.role !== 'SUPER') {
      throw new Error('Only super administrators can edit email templates');
    }

    // Validate authentication templates
    if (template.type === 'AUTHENTICATION' && data.html) {
      const magicLinkRegex = /\{\{\s*magicLink\s*\}\}/i;
      if (!magicLinkRegex.test(data.html)) {
        throw new Error(
          'Authentication templates must include {{magicLink}} variable'
        );
      }
    }

    // Extract variables if HTML content is updated
    const updateData: any = { ...data };
    if (data.html) {
      updateData.requiredVariables = this.extractVariables(
        (data.html || template.html) + ' ' + (data.subject || template.subject)
      );
    }

    return await prisma.emailTemplate.update({
      where: { id },
      data: updateData,
    });
  }

  static async delete(id: string, adminId: string): Promise<void> {
    // Check permissions (only super admin)
    const admin = await AdminService.findById(adminId);
    if (!admin || admin.role !== 'SUPER') {
      throw new Error('Only super administrators can delete email templates');
    }

    // Soft delete by setting active to false
    await prisma.emailTemplate.update({
      where: { id },
      data: { active: false },
    });
  }

  static async checkAccess(
    templateId: string,
    adminId: string
  ): Promise<{ canAccess: boolean; canEdit: boolean }> {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return { canAccess: false, canEdit: false };
    }

    const admin = await AdminService.findById(adminId);
    if (!admin) {
      return { canAccess: false, canEdit: false };
    }

    const isSuperAdmin = admin.role === 'SUPER';

    // Access rules based on template type
    if (template.type === 'AUTHENTICATION') {
      // Only super admin can access authentication templates
      return { canAccess: isSuperAdmin, canEdit: isSuperAdmin };
    } else {
      // All admins can access communication templates, only super admin can edit
      return { canAccess: true, canEdit: isSuperAdmin };
    }
  }

  static async generateTrackingUrl(
    messageId: string,
    userId: string
  ): Promise<string> {
    const trackingId = uuidv4();
    const trackingUrl = `/api/track/open/${messageId}/${userId}/${trackingId}`;

    await prisma.emailTracking.create({
      data: {
        messageId,
        userId,
        trackingUrl: trackingId, // Store just the UUID part
      },
    });

    return trackingUrl;
  }

  static async trackEmailOpen(
    trackingId: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<boolean> {
    const tracking = await prisma.emailTracking.findUnique({
      where: { trackingUrl: trackingId },
    });

    if (!tracking) {
      return false;
    }

    // Update tracking record (multiple opens only update timestamp)
    await prisma.emailTracking.update({
      where: { id: tracking.id },
      data: {
        opened: true,
        openedAt: new Date(),
        userAgent: userAgent || tracking.userAgent,
        ipAddress: ipAddress || tracking.ipAddress,
      },
    });

    return true;
  }

  static async getTemplateUsageStats(templateId: string): Promise<{
    totalSent: number;
    totalOpened: number;
    openRate: number;
    lastUsed: Date | null;
  }> {
    const messages = await prisma.message.findMany({
      where: { templateId },
      select: {
        id: true,
        createdAt: true,
        emailTracking: {
          select: { opened: true },
        },
      },
    });

    const totalSent = messages.length;
    const totalOpened = messages.reduce((count, message) => {
      return (
        count +
        message.emailTracking.filter((tracking) => tracking.opened).length
      );
    }, 0);

    const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
    const lastUsed =
      messages.length > 0
        ? messages.reduce(
            (latest, message) =>
              message.createdAt > latest ? message.createdAt : latest,
            messages[0].createdAt
          )
        : null;

    return {
      totalSent,
      totalOpened,
      openRate,
      lastUsed,
    };
  }

  private static extractVariables(content: string): string[] {
    const matches = content.match(/\{\{([^}]+)\}\}/g);
    return matches
      ? [...new Set(matches.map((m) => m.slice(2, -2).trim()))]
      : [];
  }
}
