import { prisma } from '../config/database.js';
import type { Pagination, PaginatedResponse } from '../types/index.js';
import { ObjectId } from 'mongodb';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'IMPORT'
  | 'EXPORT'
  | 'ASSIGN'
  | 'UNASSIGN';
export type ResourceType =
  | 'User'
  | 'Activity'
  | 'Group'
  | 'Event'
  | 'EmailTemplate'
  | 'Admin'
  | 'BulkOperation'
  | 'RoomAssignment';
export type PerformedByType = 'ADMIN' | 'SYSTEM';

export interface AuditLogRequest {
  action: AuditAction;
  resourceType: ResourceType;
  resourceId: string;
  eventId?: string;
  performedBy: string;
  performedByType: PerformedByType;
  changes?: {
    before?: any;
    after?: any;
    fields?: string[]; // Changed field names for updates
  };
  summary: string;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    bulkOperation?: {
      totalItems: number;
      successCount: number;
      failedCount: number;
      fileName?: string;
    };
    additionalContext?: any;
  };
}

export interface AuditTrailFilters {
  eventId?: string;
  performedBy?: string;
  resourceType?: ResourceType;
  action?: AuditAction;
  resourceId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export class AuditTrailService {
  /**
   * Log an audit trail entry
   */
  static async log(request: AuditLogRequest): Promise<void> {
    try {
      await prisma.auditTrail.create({
        data: {
          action: request.action,
          resourceType: request.resourceType,
          resourceId: request.resourceId,
          eventId: request.eventId,
          performedBy: request.performedBy,
          performedByType: request.performedByType,
          changes: request.changes,
          summary: request.summary,
          metadata: request.metadata,
        },
      });
    } catch (error: any) {
      // Don't let audit logging failures break the main operation
      console.error('Failed to log audit trail:', error);
    }
  }

  /**
   * Log resource creation
   */
  static async logCreate(
    resourceType: ResourceType,
    resourceId: string,
    resourceData: any,
    performedBy: string,
    eventId?: string,
    metadata?: any
  ): Promise<void> {
    const summary = `Created ${resourceType.toLowerCase()} "${this.getResourceName(resourceData)}"`;

    await this.log({
      action: 'CREATE',
      resourceType,
      resourceId,
      eventId,
      performedBy,
      performedByType: 'ADMIN',
      changes: { after: resourceData },
      summary,
      metadata,
    });
  }

  /**
   * Log resource update
   */
  static async logUpdate(
    resourceType: ResourceType,
    resourceId: string,
    beforeData: any,
    afterData: any,
    changedFields: string[],
    performedBy: string,
    eventId?: string,
    metadata?: any
  ): Promise<void> {
    const summary = `Updated ${resourceType.toLowerCase()} "${this.getResourceName(afterData)}" - Changed: ${changedFields.join(', ')}`;

    await this.log({
      action: 'UPDATE',
      resourceType,
      resourceId,
      eventId,
      performedBy,
      performedByType: 'ADMIN',
      changes: {
        before: beforeData,
        after: afterData,
        fields: changedFields,
      },
      summary,
      metadata,
    });
  }

  /**
   * Log resource deletion
   */
  static async logDelete(
    resourceType: ResourceType,
    resourceId: string,
    resourceData: any,
    performedBy: string,
    eventId?: string,
    metadata?: any
  ): Promise<void> {
    const summary = `Deleted ${resourceType.toLowerCase()} "${this.getResourceName(resourceData)}"`;

    await this.log({
      action: 'DELETE',
      resourceType,
      resourceId,
      eventId,
      performedBy,
      performedByType: 'ADMIN',
      changes: { before: resourceData },
      summary,
      metadata,
    });
  }

  /**
   * Log assignment operation
   */
  static async logAssign(
    resourceType: ResourceType,
    resourceId: string,
    assignmentTarget: string,
    assignmentType: string,
    performedBy: string,
    eventId?: string,
    metadata?: any
  ): Promise<void> {
    const summary = `Assigned ${resourceType.toLowerCase()} to ${assignmentType} "${assignmentTarget}"`;

    await this.log({
      action: 'ASSIGN',
      resourceType,
      resourceId,
      eventId,
      performedBy,
      performedByType: 'ADMIN',
      summary,
      metadata: {
        ...metadata,
        assignmentTarget,
        assignmentType,
      },
    });
  }

  /**
   * Log unassignment operation
   */
  static async logUnassign(
    resourceType: ResourceType,
    resourceId: string,
    assignmentTarget: string,
    assignmentType: string,
    performedBy: string,
    eventId?: string,
    metadata?: any
  ): Promise<void> {
    const summary = `Unassigned ${resourceType.toLowerCase()} from ${assignmentType} "${assignmentTarget}"`;

    await this.log({
      action: 'UNASSIGN',
      resourceType,
      resourceId,
      eventId,
      performedBy,
      performedByType: 'ADMIN',
      summary,
      metadata: {
        ...metadata,
        assignmentTarget,
        assignmentType,
      },
    });
  }

  /**
   * Log bulk import operation
   */
  static async logImport(
    resourceType: ResourceType,
    totalItems: number,
    successCount: number,
    failedCount: number,
    performedBy: string,
    eventId?: string,
    fileName?: string,
    metadata?: any
  ): Promise<void> {
    const summary = `Imported ${resourceType.toLowerCase()}s - ${successCount}/${totalItems} successful`;

    await this.log({
      action: 'IMPORT',
      resourceType: 'BulkOperation',
      resourceId: new ObjectId().toString(), // 🎯 FIX: Generate valid ObjectID for bulk operations
      eventId,
      performedBy,
      performedByType: 'ADMIN',
      summary,
      metadata: {
        ...metadata,
        bulkOperation: {
          totalItems,
          successCount,
          failedCount,
          fileName,
          resourceType,
          operationId: `import-${resourceType.toLowerCase()}-${Date.now()}`, // Keep original ID as metadata
        },
      },
    });
  }

  /**
   * Log bulk export operation
   */
  static async logExport(
    resourceType: ResourceType,
    exportCount: number,
    format: string,
    performedBy: string,
    eventId?: string,
    metadata?: any
  ): Promise<void> {
    const summary = `Exported ${exportCount} ${resourceType.toLowerCase()}(s) as ${format.toUpperCase()}`;

    await this.log({
      action: 'EXPORT',
      resourceType: 'BulkOperation',
      resourceId: new ObjectId().toString(), // 🎯 FIX: Generate valid ObjectID for bulk operations
      eventId,
      performedBy,
      performedByType: 'ADMIN',
      summary,
      metadata: {
        ...metadata,
        bulkOperation: {
          totalItems: exportCount,
          successCount: exportCount,
          failedCount: 0,
          resourceType,
          format,
          operationId: `export-${resourceType.toLowerCase()}-${Date.now()}`, // Keep original ID as metadata
        },
      },
    });
  }

  /**
   * Get audit trail with pagination and filtering
   */
  static async getAuditTrail(
    pagination: Pagination,
    filters: AuditTrailFilters = {}
  ): Promise<PaginatedResponse<any>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (filters.eventId) where.eventId = filters.eventId;
    if (filters.performedBy) where.performedBy = filters.performedBy;
    if (filters.resourceType) where.resourceType = filters.resourceType;
    if (filters.action) where.action = filters.action;
    if (filters.resourceId) where.resourceId = filters.resourceId;

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }

    const [items, total] = await Promise.all([
      prisma.auditTrail.findMany({
        where,
        include: {
          admin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
          event: {
            select: {
              id: true,
              name: true,
              shortName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditTrail.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get audit trail for a specific resource
   */
  static async getResourceHistory(
    resourceType: ResourceType,
    resourceId: string,
    pagination: Pagination
  ): Promise<PaginatedResponse<any>> {
    return this.getAuditTrail(pagination, { resourceType, resourceId });
  }

  /**
   * Get audit trail statistics
   */
  static async getStatistics(eventId?: string): Promise<{
    totalActions: number;
    actionBreakdown: Record<AuditAction, number>;
    resourceBreakdown: Record<ResourceType, number>;
    adminBreakdown: Array<{
      adminId: string;
      adminName: string;
      actionCount: number;
    }>;
    recentActivity: number; // Last 24 hours
  }> {
    const where: any = {};
    if (eventId) where.eventId = eventId;

    const [
      totalActions,
      actionStats,
      resourceStats,
      adminStats,
      recentActivity,
    ] = await Promise.all([
      // Total actions
      prisma.auditTrail.count({ where }),

      // Action breakdown
      prisma.auditTrail.groupBy({
        by: ['action'],
        where,
        _count: true,
      }),

      // Resource breakdown
      prisma.auditTrail.groupBy({
        by: ['resourceType'],
        where,
        _count: true,
      }),

      // Admin breakdown
      prisma.auditTrail.groupBy({
        by: ['performedBy'],
        where,
        _count: true,
        _max: {
          createdAt: true,
        },
      }),

      // Recent activity (24 hours)
      prisma.auditTrail.count({
        where: {
          ...where,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    // Get admin details for the breakdown
    const adminIds = adminStats.map((stat) => stat.performedBy);
    const admins = await prisma.admin.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, firstName: true, lastName: true },
    });

    const adminLookup = new Map(admins.map((admin) => [admin.id, admin]));

    return {
      totalActions,
      actionBreakdown: Object.fromEntries(
        actionStats.map((stat) => [stat.action, stat._count])
      ) as Record<AuditAction, number>,
      resourceBreakdown: Object.fromEntries(
        resourceStats.map((stat) => [stat.resourceType, stat._count])
      ) as Record<ResourceType, number>,
      adminBreakdown: adminStats.map((stat) => {
        const admin = adminLookup.get(stat.performedBy);
        return {
          adminId: stat.performedBy,
          adminName: admin
            ? `${admin.firstName} ${admin.lastName}`
            : 'Unknown Admin',
          actionCount: stat._count,
        };
      }),
      recentActivity,
    };
  }

  /**
   * Helper method to extract a human-readable name from resource data
   */
  private static getResourceName(resourceData: any): string {
    if (!resourceData) return 'Unknown';

    // Try common name patterns
    if (resourceData.name) return resourceData.name;
    if (resourceData.title) return resourceData.title;
    if (resourceData.email) return resourceData.email;
    if (resourceData.profile?.email) return resourceData.profile.email;
    if (resourceData.profile?.firstName && resourceData.profile?.lastName) {
      return `${resourceData.profile.firstName} ${resourceData.profile.lastName}`;
    }

    return 'Unknown';
  }

  /**
   * Helper method to detect changed fields between two objects
   */
  static getChangedFields(before: any, after: any): string[] {
    const changes: string[] = [];
    this.detectNestedChanges(before, after, '', changes);
    return changes;
  }

  /**
   * Recursively detect changes in nested objects with full paths
   */
  private static detectNestedChanges(
    before: any,
    after: any,
    path: string,
    changes: string[]
  ): void {
    const beforeKeys = new Set(Object.keys(before || {}));
    const afterKeys = new Set(Object.keys(after || {}));
    const allKeys = new Set([...beforeKeys, ...afterKeys]);

    for (const key of allKeys) {
      const currentPath = path ? `${path}.${key}` : key;
      const beforeValue = before?.[key];
      const afterValue = after?.[key];

      // Handle null/undefined differences with better logic
      if (beforeValue == null && afterValue == null) {
        continue; // Both null/undefined, no change
      }

      // 🚨 FIX: Don't report changes for undefined vs null (they're equivalent for our purposes)
      if (
        (beforeValue == null || beforeValue === '') &&
        (afterValue == null || afterValue === '')
      ) {
        continue; // Treat null, undefined, and empty string as equivalent
      }

      if (beforeValue == null || afterValue == null) {
        // Only report as changed if one has a meaningful value and the other doesn't
        const beforeHasValue = beforeValue != null && beforeValue !== '';
        const afterHasValue = afterValue != null && afterValue !== '';

        if (beforeHasValue !== afterHasValue) {
          changes.push(currentPath);
        }
        continue;
      }

      // Handle arrays
      if (Array.isArray(beforeValue) && Array.isArray(afterValue)) {
        if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
          changes.push(currentPath);
        }
        continue;
      }

      // Handle objects recursively
      if (
        typeof beforeValue === 'object' &&
        typeof afterValue === 'object' &&
        !Array.isArray(beforeValue) &&
        !Array.isArray(afterValue)
      ) {
        // Recursively check nested objects
        this.detectNestedChanges(beforeValue, afterValue, currentPath, changes);
        continue;
      }

      // Handle primitive values with better comparison
      if (beforeValue !== afterValue) {
        // 🚨 FIX: Additional check for equivalent empty values
        const beforeIsEmpty =
          beforeValue === '' ||
          beforeValue === null ||
          beforeValue === undefined;
        const afterIsEmpty =
          afterValue === '' || afterValue === null || afterValue === undefined;

        // Don't report changes between different types of "empty" values
        if (beforeIsEmpty && afterIsEmpty) {
          continue;
        }

        changes.push(currentPath);
      }
    }
  }

  /**
   * Bulk log multiple audit entries (for bulk operations)
   */
  static async logBulk(requests: AuditLogRequest[]): Promise<void> {
    try {
      await prisma.auditTrail.createMany({
        data: requests.map((request) => ({
          action: request.action,
          resourceType: request.resourceType,
          resourceId: request.resourceId,
          eventId: request.eventId,
          performedBy: request.performedBy,
          performedByType: request.performedByType,
          changes: request.changes,
          summary: request.summary,
          metadata: request.metadata,
        })),
      });
    } catch (error: any) {
      console.error('Failed to log bulk audit trails:', error);
    }
  }

  /**
   * Clean up old audit trails (call periodically)
   * Keeps audit trails for 2 years by default
   */
  static async cleanup(retentionDays: number = 730): Promise<number> {
    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000
    );

    const result = await prisma.auditTrail.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    return result.count;
  }
}
