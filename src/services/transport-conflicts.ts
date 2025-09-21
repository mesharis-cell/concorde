import { prisma } from '../config/database.js';

interface FlightTime {
    date: string; // DD/MM/YYYY
    time: string; // HH:MM
    dateTime?: Date; // Parsed for accurate comparison
}

interface ScheduleEntry {
    userId: string;
    userName: string;
    groupNames: string[];
    type: 'arrival' | 'departure';
    dateTime: Date;
    date: string;
    time: string;
    flightNumber?: string;
    airport?: string;
    terminal?: string;
    carId: string;
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
        airport?: string;
        terminal?: string;
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
                    transferRequirements: { not: null }
                }
            }) as any,
            prisma.group.findMany({
                where: { eventId, active: true, deleted: false }
            }) as any
        ]);

        const groupMap = new Map(groups.map(g => [g.id, g]));

        // Build indexed structure for efficient lookup
        const carSchedule = new Map<string, ScheduleEntry[]>();

        // Process users and build schedule
        for (const user of users) {
            const profile = user.profile as any;
            const flight = user.flight as any;

            if (!flight) continue;

            // Resolve car assignments
            const userGroups = user.groupIds.map(id => groupMap.get(id)).filter(Boolean);
            const groupNames = userGroups.map(g => g!.name);

            let assignedCars: string[] = [];
            if ((user.carNumbers as string[]).length > 0) {
                assignedCars = user.carNumbers as string[];
            } else {
                const groupCarNumbers = userGroups.flatMap(g => g!.carNumbers as any || []) as string[];
                assignedCars = [...new Set(groupCarNumbers)];
            }

            if (assignedCars.length === 0) continue;
            const userName = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim();

            // If user has no groups, use their guestCategory as a fallback group
            if (groupNames.length === 0 && profile?.guestCategory) {
                groupNames.push(profile.guestCategory);
            }

            // Skip users with no group identification at all
            if (groupNames.length === 0) {
                console.log(`⚠️ User ${userName} has no groups or guestCategory - skipping`);
                continue;
            }

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
                            airport: flight.inbound.arrivalToAirport,
                            terminal: flight.inbound.arrivalToTerminal,
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
                            airport: flight.outbound.departureFrom,
                            terminal: flight.outbound.departureTerminal,
                            carId
                        });
                    }
                }
            }
        }

        // Find conflicts within each car's schedule
        const conflictGroups: ConflictGroup[] = [];

        for (const [carId, schedule] of carSchedule) {
            // Sort by datetime
            schedule.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

            // Group by type and date first
            const byTypeAndDate = new Map<string, ScheduleEntry[]>();

            for (const sched of schedule) {
                const key = `${sched.type}-${sched.date}`;
                if (!byTypeAndDate.has(key)) {
                    byTypeAndDate.set(key, []);
                }
                byTypeAndDate.get(key)!.push(sched);
            }

            // For each type/date combination, find conflicts using optimized sliding window
            for (const [typeDate, schedules] of byTypeAndDate) {
                console.log(`\n📅 Processing ${typeDate} on ${carId}: ${schedules.length} users`);

                if (schedules.length < 2) continue; // No conflicts possible with single user

                // Sort by time for efficient window processing
                const sortedSchedules = schedules.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
                const conflictingUsers = new Set<string>(); // Track conflicting user IDs

                // Sliding window approach: O(n log n) instead of O(n²)
                for (let i = 0; i < sortedSchedules.length; i++) {
                    const currentUser = sortedSchedules[i];

                    // Check all users within the window after current user
                    for (let j = i + 1; j < sortedSchedules.length; j++) {
                        const nextUser = sortedSchedules[j];
                        const timeDiff = this.getTimeDifferenceMinutes(currentUser.dateTime, nextUser.dateTime);

                        if (timeDiff <= windowMinutes) {
                            console.log(`   ⚠️ CONFLICT: ${currentUser.userName}(${currentUser.groupNames.join(',')}) vs ${nextUser.userName}(${nextUser.groupNames.join(',')}) - ${timeDiff} min`);
                            conflictingUsers.add(currentUser.userId);
                            conflictingUsers.add(nextUser.userId);
                        } else {
                            // Since sorted by time, no more conflicts possible for currentUser
                            break;
                        }
                    }
                }

                // If conflicts found, create conflict group
                if (conflictingUsers.size >= 2) {
                    const conflictList = sortedSchedules
                        .filter(s => conflictingUsers.has(s.userId))
                        .map(s => ({
                            userId: s.userId,
                            userName: s.userName,
                            groupName: s.groupNames.join(', '),
                            time: s.time,
                            flightNumber: s.flightNumber,
                            airport: s.airport,
                            terminal: s.terminal
                        } as any));

                    console.log(`   ✅ Found ${conflictList.length} conflicting users: ${conflictList.map(u => `${u.userName}(${u.groupName})`).join(', ')}`);

                    // Calculate time span
                    const firstTime = this.parseFlightDateTime(schedules[0].date, conflictList[0].time);
                    const lastTime = this.parseFlightDateTime(schedules[0].date, conflictList[conflictList.length - 1].time);
                    const timeSpan = firstTime && lastTime ? this.getTimeDifferenceMinutes(firstTime, lastTime) : 0;

                    // Determine severity
                    let severity: 'high' | 'medium' | 'low' = 'low';
                    if (conflictList.length >= 4 || timeSpan <= 60) {
                        severity = 'high';
                    } else if (timeSpan <= 120) {
                        severity = 'medium';
                    }

                    conflictGroups.push({
                        carId,
                        type: schedules[0].type as 'arrival' | 'departure',
                        date: schedules[0].date,
                        conflictingUsers: conflictList,
                        timeSpan,
                        severity
                    });
                }
            }
        }

        // Sort conflicts by severity (high -> medium -> low) then by date/time
        return conflictGroups.sort((a, b) => {
            // Severity priority: high = 3, medium = 2, low = 1
            const severityOrder = { high: 3, medium: 2, low: 1 };
            const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
            if (severityDiff !== 0) return severityDiff;

            // Then by date
            const dateCompare = a.date.localeCompare(b.date);
            if (dateCompare !== 0) return dateCompare;

            // Then by car ID
            return a.carId.localeCompare(b.carId);
        });
    }
}
