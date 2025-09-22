import { prisma } from '../config/database.js';

// Rename to main service name now that old one is removed
export { ImprovedTransportConflictService as TransportConflictService };

interface FlightTime {
    date: string; // DD/MM/YYYY
    time: string; // HH:MM
    dateTime?: Date; // Parsed for accurate comparison
}

interface ConflictGroup {
    carId: string;
    type: 'arrival' | 'departure';
    date: string;
    conflictingUsers: Array<{
        userId: string;
        userName: string;
        groupName: string;
        time: string;
        flightNumber?: string;
    }>;
    timeSpan: number; // Total minutes from first to last
    severity: 'high' | 'medium' | 'low';
}

export class ImprovedTransportConflictService {

    /**
     * Convert DD/MM/YYYY HH:MM to proper Date object
     */
    private static parseFlightDateTime(date: string, time: string): Date | null {
        try {
            const [day, month, year] = date.split('/').map(n => parseInt(n));
            const [hours, minutes] = time.split(':').map(n => parseInt(n));

            // Create date in UTC to avoid timezone issues
            return new Date(Date.UTC(
                year < 100 ? 2000 + year : year, // Handle 2-digit years
                month - 1, // JavaScript months are 0-indexed
                day,
                hours,
                minutes
            ));
        } catch {
            return null;
        }
    }

    /**
     * Calculate time difference in minutes between two Date objects
     */
    private static getTimeDifferenceMinutes(dateA: Date, dateB: Date): number {
        return Math.abs(dateA.getTime() - dateB.getTime()) / (1000 * 60);
    }

    /**
     * Group conflicts by car and time window for better visualization
     */
    private static groupConflictsByCar(
        conflicts: Array<{
            userId: string;
            userName: string;
            groupName: string;
            carId: string;
            type: 'arrival' | 'departure';
            dateTime: Date;
            time: string;
            date: string;
            flightNumber?: string;
        }>,
        windowMinutes: number = 180
    ): ConflictGroup[] {
        const groups: ConflictGroup[] = [];

        // Sort by car, type, and time
        const sorted = conflicts.sort((a, b) => {
            if (a.carId !== b.carId) return a.carId.localeCompare(b.carId);
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            return a.dateTime.getTime() - b.dateTime.getTime();
        });

        let currentGroup: ConflictGroup | null = null;

        for (const conflict of sorted) {
            if (!currentGroup ||
                currentGroup.carId !== conflict.carId ||
                currentGroup.type !== conflict.type ||
                currentGroup.date !== conflict.date) {

                // Start new group
                if (currentGroup) groups.push(currentGroup);

                currentGroup = {
                    carId: conflict.carId,
                    type: conflict.type,
                    date: conflict.date,
                    conflictingUsers: [{
                        userId: conflict.userId,
                        userName: conflict.userName,
                        groupName: conflict.groupName,
                        time: conflict.time,
                        flightNumber: conflict.flightNumber
                    }],
                    timeSpan: 0,
                    severity: 'low'
                };
            } else {
                // Check if within window of existing group
                const lastUser = currentGroup.conflictingUsers[currentGroup.conflictingUsers.length - 1];
                const lastTime = this.parseFlightDateTime(currentGroup.date, lastUser.time);

                if (lastTime && this.getTimeDifferenceMinutes(lastTime, conflict.dateTime) <= windowMinutes) {
                    currentGroup.conflictingUsers.push({
                        userId: conflict.userId,
                        userName: conflict.userName,
                        groupName: conflict.groupName,
                        time: conflict.time,
                        flightNumber: conflict.flightNumber
                    });
                } else {
                    // Outside window, start new group
                    groups.push(currentGroup);
                    currentGroup = {
                        carId: conflict.carId,
                        type: conflict.type,
                        date: conflict.date,
                        conflictingUsers: [{
                            userId: conflict.userId,
                            userName: conflict.userName,
                            groupName: conflict.groupName,
                            time: conflict.time,
                            flightNumber: conflict.flightNumber
                        }],
                        timeSpan: 0,
                        severity: 'low'
                    };
                }
            }
        }

        if (currentGroup) groups.push(currentGroup);

        // Calculate time spans and severity for each group
        for (const group of groups) {
            if (group.conflictingUsers.length > 1) {
                const firstTime = this.parseFlightDateTime(group.date, group.conflictingUsers[0].time);
                const lastTime = this.parseFlightDateTime(group.date, group.conflictingUsers[group.conflictingUsers.length - 1].time);

                if (firstTime && lastTime) {
                    group.timeSpan = this.getTimeDifferenceMinutes(firstTime, lastTime);

                    // Severity based on number of conflicts and time span
                    if (group.conflictingUsers.length >= 3 || group.timeSpan <= 60) {
                        group.severity = 'high';
                    } else if (group.timeSpan <= 120) {
                        group.severity = 'medium';
                    } else {
                        group.severity = 'low';
                    }
                }
            }
        }

        // Filter out single-user "groups" (no conflicts)
        return groups.filter(g => g.conflictingUsers.length > 1);
    }

    /**
     * Optimized conflict detection using time-based grouping
     */
    static async detectAirportTimingConflictsOptimized(
        eventId: string,
        config?: {
            windowMinutes?: number; // Default 180 (3 hours)
            includeBuffer?: boolean; // Add buffer time for distance/traffic
            airportDistanceMinutes?: number; // Travel time to airport
        }
    ): Promise<ConflictGroup[]> {
        const windowMinutes = config?.windowMinutes || 180;
        const bufferMinutes = config?.includeBuffer ? (config?.airportDistanceMinutes || 60) : 0;

        // Fetch data (same as before)
        const [users, groups] = await Promise.all([
            prisma.user.findMany({
                where: {
                    eventId,
                    active: true,
                    transferRequirements: true
                },
                select: {
                    id: true,
                    profile: true,
                    flight: true,
                    carNumbers: true,
                    groupIds: true,
                }
            }),
            prisma.group.findMany({
                where: { eventId, active: true, deleted: false },
                select: { id: true, name: true, carNumbers: true }
            })
        ]);

        const groupMap = new Map(groups.map(g => [g.id, g]));

        // Build indexed structure for efficient lookup
        const carSchedule = new Map<string, Array<{
            userId: string;
            userName: string;
            groupNames: string[];
            type: 'arrival' | 'departure';
            dateTime: Date;
            date: string;
            time: string;
            flightNumber?: string;
            carId: string;
        }>>();

        // Process users and build schedule
        for (const user of users) {
            const profile = user.profile as any;
            const flight = user.flight as any;

            if (!flight) continue;

            // Resolve car assignments
            let assignedCars: string[] = [];
            if (user.carNumbers.length > 0) {
                assignedCars = user.carNumbers;
            } else {
                const userGroups = user.groupIds.map(id => groupMap.get(id)).filter(Boolean);
                assignedCars = [...new Set(userGroups.flatMap(g => g!.carNumbers))];
            }

            if (assignedCars.length === 0) continue;

            const userGroups = user.groupIds.map(id => groupMap.get(id)).filter(Boolean);
            const groupNames = userGroups.map(g => g!.name);
            const userName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim();

            // Process arrival
            if (flight.inbound?.arrivalDate && flight.inbound?.arrivalTime) {
                const arrivalDateTime = this.parseFlightDateTime(
                    flight.inbound.arrivalDate,
                    flight.inbound.arrivalTime
                );

                if (arrivalDateTime) {
                    // Adjust for buffer (arrive early to pick up)
                    if (bufferMinutes > 0) {
                        arrivalDateTime.setMinutes(arrivalDateTime.getMinutes() - bufferMinutes);
                    }

                    for (const carId of assignedCars) {
                        if (!carSchedule.has(carId)) {
                            carSchedule.set(carId, []);
                        }

                        carSchedule.get(carId)!.push({
                            userId: user.id,
                            userName,
                            groupNames,
                            type: 'arrival',
                            dateTime: arrivalDateTime,
                            date: flight.inbound.arrivalDate,
                            time: flight.inbound.arrivalTime,
                            flightNumber: flight.inbound.flightNumber,
                            carId
                        });
                    }
                }
            }

            // Process departure (similar logic)
            if (flight.outbound?.departureDate && flight.outbound?.departureTime) {
                const departureDateTime = this.parseFlightDateTime(
                    flight.outbound.departureDate,
                    flight.outbound.departureTime
                );

                if (departureDateTime) {
                    // Adjust for buffer (leave early for departure)
                    if (bufferMinutes > 0) {
                        departureDateTime.setMinutes(departureDateTime.getMinutes() - bufferMinutes * 2);
                    }

                    for (const carId of assignedCars) {
                        if (!carSchedule.has(carId)) {
                            carSchedule.set(carId, []);
                        }

                        carSchedule.get(carId)!.push({
                            userId: user.id,
                            userName,
                            groupNames,
                            type: 'departure',
                            dateTime: departureDateTime,
                            date: flight.outbound.departureDate,
                            time: flight.outbound.departureTime,
                            flightNumber: flight.outbound.flightNumber,
                            carId
                        });
                    }
                }
            }
        }

        // Find conflicts within each car's schedule
        const allConflicts: typeof carSchedule extends Map<string, infer T> ? T : never = [];

        for (const [carId, schedule] of carSchedule) {
            // Sort by datetime
            schedule.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

            // Find overlapping time windows (different groups only)
            for (let i = 0; i < schedule.length; i++) {
                for (let j = i + 1; j < schedule.length; j++) {
                    const schedA = schedule[i];
                    const schedB = schedule[j];

                    // Check if different groups
                    const differentGroups = !schedA.groupNames.some(g => schedB.groupNames.includes(g));
                    if (!differentGroups) continue;

                    // Check time difference
                    const timeDiff = this.getTimeDifferenceMinutes(schedA.dateTime, schedB.dateTime);

                    if (timeDiff <= windowMinutes) {
                        // Conflict found - add both to conflicts list
                        allConflicts.push({
                            ...schedA,
                            groupName: schedA.groupNames.join(', ')
                        });
                        allConflicts.push({
                            ...schedB,
                            groupName: schedB.groupNames.join(', ')
                        });
                    } else {
                        // No more conflicts possible for schedA (sorted list)
                        break;
                    }
                }
            }
        }

        // Remove duplicates and group conflicts
        const uniqueConflicts = Array.from(
            new Map(allConflicts.map(c => [`${c.userId}-${c.type}-${c.dateTime.getTime()}`, c])).values()
        );

        return this.groupConflictsByCar(uniqueConflicts, windowMinutes);
    }
}
