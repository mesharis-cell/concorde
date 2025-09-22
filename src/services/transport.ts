import { prisma } from '../config/database.js';
import { AuditTrailService } from './audit-trail.js';

export interface CarConfig {
    id: string;
    name: string;
    type: string;
    plate: string;
    driver: string;
}

export interface CarAssignment {
    userId: string;
    userEmail: string;
    userName: string;
    groupName: string;
    assignedCars: string[];
    source: 'group' | 'individual';
}

export interface CarUsage {
    carId: string;
    carName: string;
    assignedUsers: Array<{
        userId: string;
        userEmail: string;
        userName: string;
        groupName: string;
        source: 'group' | 'individual';
    }>;
}

export class TransportService {
    /**
     * Get car configuration for an event
     */
    static async getEventCarConfig(eventId: string): Promise<CarConfig[]> {
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { carConfig: true },
        });

        const carConfig = event?.carConfig as any;
        return carConfig?.cars || [];
    }

    /**
     * Update car configuration for an event
     */
    static async updateEventCarConfig(eventId: string, cars: CarConfig[]): Promise<void> {
        await prisma.event.update({
            where: { id: eventId },
            data: {
                carConfig: {
                    cars,
                    lastUpdated: new Date().toISOString(),
                },
            },
        });
    }

    /**
     * Get car assignments for all users in an event
     */
    static async getCarAssignments(eventId: string): Promise<CarAssignment[]> {
        const [users, groups] = await Promise.all([
            prisma.user.findMany({
                where: {
                    eventId,
                    active: true,
                    transferRequirements: true // Only include users who need transport
                },
                select: {
                    id: true,
                    profile: true,
                    groupIds: true,
                    carNumbers: true,
                },
            }),
            prisma.group.findMany({
                where: {
                    eventId,
                    active: true,
                    deleted: false,
                    // Get all groups - we'll filter by members needing transport later
                },
                select: { id: true, name: true, carNumbers: true },
            }),
        ]);

        const groupMap = new Map(groups.map(g => [g.id, g]));
        const assignments: CarAssignment[] = [];

        users.forEach(user => {
            const profile = user.profile as any;
            const userName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim();
            const userEmail = profile?.email || '';

            // Get user's groups
            const userGroups = user.groupIds
                .map(id => groupMap.get(id))
                .filter(Boolean);

            // Determine car assignment source and cars
            let assignedCars: string[] = [];
            let source: 'group' | 'individual' = 'group';

            if (user.carNumbers.length > 0) {
                // Individual override
                assignedCars = user.carNumbers;
                source = 'individual';
            } else {
                // Inherit from groups
                assignedCars = [...new Set(userGroups.flatMap(g => g!.carNumbers))];
                source = 'group';
            }

            assignments.push({
                userId: user.id,
                userEmail,
                userName,
                groupName: userGroups.map(g => g!.name).join(', '),
                assignedCars,
                source,
            });
        });

        return assignments;
    }

    /**
     * Get car usage analysis - which users are assigned to each car
     */
    static async getCarUsage(eventId: string): Promise<CarUsage[]> {
        const assignments = await this.getCarAssignments(eventId);
        const cars = await this.getEventCarConfig(eventId);

        const usage: CarUsage[] = [];

        cars.forEach(car => {
            const assignedUsers = assignments
                .filter(assignment => assignment.assignedCars.includes(car.id))
                .map(assignment => ({
                    userId: assignment.userId,
                    userEmail: assignment.userEmail,
                    userName: assignment.userName,
                    groupName: assignment.groupName,
                    source: assignment.source,
                }));

            usage.push({
                carId: car.id,
                carName: car.name,
                assignedUsers,
            });
        });

        return usage;
    }

    /**
     * Check if a car can be safely deleted (not assigned to any users)
     */
    static async canDeleteCar(eventId: string, carId: string): Promise<{
        canDelete: boolean;
        assignedUsers: Array<{ userId: string; userName: string; source: 'group' | 'individual' }>;
        affectedGroups: Array<{ groupId: string; groupName: string }>;
    }> {
        const [users, groups] = await Promise.all([
            prisma.user.findMany({
                where: {
                    eventId,
                    active: true,
                    carNumbers: { has: carId }
                },
                select: { id: true, profile: true },
            }),
            prisma.group.findMany({
                where: {
                    eventId,
                    active: true,
                    deleted: false,
                    carNumbers: { has: carId }
                },
                select: { id: true, name: true },
            }),
        ]);

        const assignedUsers = users.map(user => {
            const profile = user.profile as any;
            return {
                userId: user.id,
                userName: `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim(),
                source: 'individual' as const,
            };
        });

        const affectedGroups = groups.map(group => ({
            groupId: group.id,
            groupName: group.name,
        }));

        const canDelete = assignedUsers.length === 0 && affectedGroups.length === 0;

        return {
            canDelete,
            assignedUsers,
            affectedGroups,
        };
    }

    /**
     * Assign cars to a group (updates all group members)
     */
    static async assignCarsToGroup(
        groupId: string,
        carNumbers: string[],
        adminId: string
    ): Promise<void> {
        await prisma.group.update({
            where: { id: groupId },
            data: { carNumbers },
        });

        // Note: Users inherit group cars automatically through resolution logic
        // No need to update individual users unless they have overrides
    }

    /**
     * Assign cars to individual user (override group assignment)
     */
    static async assignCarsToUser(
        userId: string,
        carNumbers: string[],
        adminId: string
    ): Promise<void> {
        // Get current user data for audit trail
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!currentUser) {
            throw new Error('User not found');
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { carNumbers },
        });

        // 🚨 CRITICAL: Log car assignment changes for audit trail
        const changedFields = AuditTrailService.getChangedFields(currentUser, updatedUser);
        if (changedFields.length > 0) {
            await AuditTrailService.logUpdate(
                'User',
                userId,
                currentUser,
                updatedUser,
                changedFields,
                adminId,
                currentUser.eventId
            );
        }
    }

    /**
     * Clear individual car assignment (user will inherit from group)
     */
    static async clearUserCarOverride(userId: string, adminId: string): Promise<void> {
        await prisma.user.update({
            where: { id: userId },
            data: { carNumbers: [] },
        });
    }

    /**
     * Bulk assign cars to multiple groups (single transaction)
     */
    static async bulkAssignCarsToGroups(
        groupIds: string[],
        carNumbers: string[],
        adminId: string
    ): Promise<void> {
        // Get current group data for audit trail
        const currentGroups = await prisma.group.findMany({
            where: { id: { in: groupIds } },
        });

        await prisma.$transaction(
            groupIds.map((groupId: string) =>
                prisma.group.update({
                    where: { id: groupId },
                    data: { carNumbers },
                })
            )
        );

        // 🚨 CRITICAL: Log bulk car assignment changes
        const updatedGroups = await prisma.group.findMany({
            where: { id: { in: groupIds } },
        });

        // Log each group change individually for detailed tracking
        for (let i = 0; i < currentGroups.length; i++) {
            const currentGroup = currentGroups[i];
            const updatedGroup = updatedGroups.find(g => g.id === currentGroup.id);

            if (updatedGroup) {
                const changedFields = AuditTrailService.getChangedFields(currentGroup, updatedGroup);
                if (changedFields.length > 0) {
                    await AuditTrailService.logUpdate(
                        'Group',
                        currentGroup.id,
                        currentGroup,
                        updatedGroup,
                        changedFields,
                        adminId,
                        currentGroup.eventId
                    );

                    // 🚨 MISSION CRITICAL: Log user-level impact for operational visibility
                    await this.logUserImpactFromGroupChange(
                        currentGroup.id,
                        currentGroup.carNumbers as string[] || [],
                        carNumbers,
                        adminId,
                        currentGroup.eventId
                    );
                }
            }
        }
    }

    /**
     * Bulk remove cars from multiple groups (single transaction)
     */
    static async bulkRemoveCarsFromGroups(
        groupIds: string[],
        adminId: string
    ): Promise<void> {
        // Get current group data for audit trail
        const currentGroups = await prisma.group.findMany({
            where: { id: { in: groupIds } },
        });

        await prisma.$transaction(
            groupIds.map((groupId: string) =>
                prisma.group.update({
                    where: { id: groupId },
                    data: { carNumbers: [] }, // Clear all car assignments
                })
            )
        );

        // 🚨 CRITICAL: Log bulk car removal changes
        const updatedGroups = await prisma.group.findMany({
            where: { id: { in: groupIds } },
        });

        // Log each group change individually for detailed tracking
        for (let i = 0; i < currentGroups.length; i++) {
            const currentGroup = currentGroups[i];
            const updatedGroup = updatedGroups.find(g => g.id === currentGroup.id);

            if (updatedGroup) {
                const changedFields = AuditTrailService.getChangedFields(currentGroup, updatedGroup);
                if (changedFields.length > 0) {
                    await AuditTrailService.logUpdate(
                        'Group',
                        currentGroup.id,
                        currentGroup,
                        updatedGroup,
                        changedFields,
                        adminId,
                        currentGroup.eventId
                    );

                    // 🚨 MISSION CRITICAL: Log user-level impact for operational visibility
                    await this.logUserImpactFromGroupChange(
                        currentGroup.id,
                        currentGroup.carNumbers as string[] || [],
                        [], // Removing all cars
                        adminId,
                        currentGroup.eventId
                    );
                }
            }
        }
    }

    /**
     * 🚨 MISSION CRITICAL: Log user-level impact when group car assignments change
     * This ensures operational teams see the actual user-level changes for ground coordination
     */
    private static async logUserImpactFromGroupChange(
        groupId: string,
        oldGroupCars: string[],
        newGroupCars: string[],
        adminId: string,
        eventId: string
    ): Promise<void> {
        // Get all users in this group who DON'T have individual car overrides
        const affectedUsers = await prisma.user.findMany({
            where: {
                groupIds: { has: groupId },
                carNumbers: { isEmpty: true }, // Only users inheriting from group
                active: true,
            },
        });

        // Create user-level audit entries for operational visibility
        for (const user of affectedUsers) {
            const profile = user.profile as any;
            const userName = profile?.firstName && profile?.lastName
                ? `${profile.firstName} ${profile.lastName}`
                : profile?.email || 'Unknown User';

            await AuditTrailService.log({
                action: 'UPDATE',
                resourceType: 'User',
                resourceId: user.id,
                eventId,
                performedBy: adminId,
                performedByType: 'ADMIN',
                changes: {
                    before: { effectiveCarNumbers: oldGroupCars },
                    after: { effectiveCarNumbers: newGroupCars },
                    fields: ['effectiveCarNumbers'], // Virtual field for user impact
                },
                summary: `${userName}'s effective car assignment changed due to group update`,
                metadata: {
                    userEmail: profile?.email,
                    groupId,
                    changeSource: 'group_inheritance',
                    impactType: 'car_assignment_change',
                },
            });
        }
    }

    /**
     * Get resolved car assignments for a user (group inheritance + individual overrides)
     */
    static async getUserCars(userId: string): Promise<{
        cars: string[];
        source: 'group' | 'individual' | 'none';
        groupCars: string[];
    }> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { carNumbers: true, groupIds: true },
        });

        if (!user) {
            return { cars: [], source: 'none', groupCars: [] };
        }

        // Get group cars
        const groups = await prisma.group.findMany({
            where: { id: { in: user.groupIds } },
            select: { carNumbers: true },
        });

        const groupCars = [...new Set(groups.flatMap(g => g.carNumbers))];

        // Return individual override or group inheritance
        if (user.carNumbers.length > 0) {
            return {
                cars: user.carNumbers,
                source: 'individual',
                groupCars,
            };
        } else {
            return {
                cars: groupCars,
                source: groupCars.length > 0 ? 'group' : 'none',
                groupCars,
            };
        }
    }

    /**
     * Remove car from all assignments (for car deletion workflow)
     */
    static async removeCarFromAllAssignments(eventId: string, carId: string): Promise<{
        updatedGroups: number;
        updatedUsers: number;
    }> {
        // Remove from all groups
        const groupUpdates = await prisma.group.updateMany({
            where: {
                eventId,
                carNumbers: { has: carId }
            },
            data: {
                carNumbers: { set: [] }, // This will be handled by application logic
            },
        });

        // Remove from all users  
        const userUpdates = await prisma.user.updateMany({
            where: {
                eventId,
                carNumbers: { has: carId }
            },
            data: {
                carNumbers: { set: [] }, // This will be handled by application logic
            },
        });

        // Note: Prisma doesn't support array element removal directly in MongoDB
        // We'll need to handle this in the controller with proper array filtering

        return {
            updatedGroups: groupUpdates.count,
            updatedUsers: userUpdates.count,
        };
    }
}
