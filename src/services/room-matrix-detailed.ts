import { prisma } from '../config/database.js';
import { RoomAssignmentService } from './room-assignments.js';

export interface DetailedRoomMatrix {
    dailyBreakdown: Array<{
        date: string;
        totalRooms: number;
        totalAllocated: number;
        available: number;
        overAllocated: number;
        byHotel: Array<{
            hotelName: string;
            totalRooms: number;
            allocated: number;
            available: number;
            byRoomType: Array<{
                roomType: string;
                quantity: number;
                allocated: number;
                available: number;
                isOverAllocated: boolean;
                overage: number;
            }>;
        }>;
    }>;

    alerts: Array<{
        type: 'over-allocation' | 'capacity-warning';
        severity: 'critical' | 'warning';
        hotel: string;
        roomType: string;
        date: string;
        message: string;
        quantity: number;
        allocated: number;
        overage: number;
    }>;

    enhancedRoomTypeBreakdown: Array<{
        name: string;
        totalAssigned: number;
        totalCapacity: number;
        utilization: number;
        dailyBreakdown: Array<{
            date: string;
            quantity: number;
            allocated: number;
            available: number;
            isOverAllocated: boolean;
        }>;
    }>;
}

export class RoomMatrixDetailedService {
    /**
     * Get detailed room matrix with automatic sync and over-allocation detection
     */
    static async getDetailedRoomMatrix(eventId: string): Promise<DetailedRoomMatrix> {
        // 🎯 CRITICAL: Auto-sync room allocations to ensure accuracy
        await RoomAssignmentService.updateEventRoomAllocations(eventId);

        // Validate matrix integrity and get alerts
        const validation = await RoomAssignmentService.validateRoomMatrix(eventId);

        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: {
                hotelConfig: true,
                dateRange: true
            }
        });

        if (!event?.hotelConfig) {
            return {
                dailyBreakdown: [],
                alerts: [],
                enhancedRoomTypeBreakdown: []
            };
        }

        const hotelConfig = event.hotelConfig as any;
        const alerts: DetailedRoomMatrix['alerts'] = [];

        // Convert validation errors to structured alerts
        if (!validation.isValid) {
            for (const error of validation.errors) {
                if (error.includes('Over-allocated:')) {
                    // [V1] Parse format: "Over-allocated: {Hotel Name} - {Room Type} on {Date}"
                    const match = error.match(/Over-allocated: (.+) - (.+) on (.+)/);
                    if (match) {
                        const [, hotel, roomType, date] = match;

                        // Find the specific contracted room to get quantities
                        const hotelData = hotelConfig.hotels?.find((h: any) => h.name === hotel);
                        const contractedRoom = hotelData?.contractedRooms?.find((cr: any) =>
                            cr.date === date && cr.roomType === roomType
                        );

                        if (contractedRoom) {
                            alerts.push({
                                type: 'over-allocation',
                                severity: 'critical',
                                hotel,
                                roomType,
                                date,
                                message: `${roomType} at ${hotel} is overbooked by ${contractedRoom.allocated - contractedRoom.quantity} rooms on ${date}`,
                                quantity: contractedRoom.quantity,
                                allocated: contractedRoom.allocated,
                                overage: contractedRoom.allocated - contractedRoom.quantity
                            });
                        }
                    }
                }
            }
        }

        // Build daily breakdown
        const dailyBreakdown = this.buildDailyBreakdown(hotelConfig);

        // Build enhanced room type breakdown
        const enhancedRoomTypeBreakdown = await this.buildEnhancedRoomTypeBreakdown(eventId, hotelConfig);

        return {
            dailyBreakdown,
            alerts,
            enhancedRoomTypeBreakdown
        };
    }

    /**
     * Build daily breakdown from hotel configuration
     */
    private static buildDailyBreakdown(hotelConfig: any): DetailedRoomMatrix['dailyBreakdown'] {
        const dateMap = new Map<string, {
            totalRooms: number;
            totalAllocated: number;
            byHotel: Map<string, {
                hotelName: string;
                totalRooms: number;
                allocated: number;
                byRoomType: Array<{
                    roomType: string;
                    quantity: number;
                    allocated: number;
                    available: number;
                    isOverAllocated: boolean;
                    overage: number;
                }>;
            }>;
        }>();

        // Process all contracted rooms across all hotels
        for (const hotel of hotelConfig.hotels || []) {
            for (const contractedRoom of hotel.contractedRooms || []) {
                const date = contractedRoom.date;

                if (!dateMap.has(date)) {
                    dateMap.set(date, {
                        totalRooms: 0,
                        totalAllocated: 0,
                        byHotel: new Map()
                    });
                }

                const dayData = dateMap.get(date)!;
                dayData.totalRooms += contractedRoom.quantity || 0;
                dayData.totalAllocated += contractedRoom.allocated || 0;

                if (!dayData.byHotel.has(hotel.name)) {
                    dayData.byHotel.set(hotel.name, {
                        hotelName: hotel.name,
                        totalRooms: 0,
                        allocated: 0,
                        byRoomType: []
                    });
                }

                const hotelData = dayData.byHotel.get(hotel.name)!;
                hotelData.totalRooms += contractedRoom.quantity || 0;
                hotelData.allocated += contractedRoom.allocated || 0;

                const isOverAllocated = (contractedRoom.allocated || 0) > (contractedRoom.quantity || 0);
                hotelData.byRoomType.push({
                    roomType: contractedRoom.roomType,
                    quantity: contractedRoom.quantity || 0,
                    allocated: contractedRoom.allocated || 0,
                    available: (contractedRoom.quantity || 0) - (contractedRoom.allocated || 0),
                    isOverAllocated,
                    overage: isOverAllocated ? (contractedRoom.allocated || 0) - (contractedRoom.quantity || 0) : 0
                });
            }
        }

        // Convert to array and sort by date
        const dailyBreakdown: DetailedRoomMatrix['dailyBreakdown'] = [];

        for (const [date, dayData] of dateMap) {
            // Calculate actual over-allocation by summing individual room type overages
            let totalOverAllocated = 0;
            for (const hotel of dayData.byHotel.values()) {
                for (const roomType of hotel.byRoomType) {
                    if (roomType.isOverAllocated) {
                        totalOverAllocated += roomType.overage;
                    }
                }
            }

            dailyBreakdown.push({
                date,
                totalRooms: dayData.totalRooms,
                totalAllocated: dayData.totalAllocated,
                available: dayData.totalRooms - dayData.totalAllocated,
                overAllocated: totalOverAllocated, // ✅ Now correctly shows sum of individual overages
                byHotel: Array.from(dayData.byHotel.values()).map(hotel => ({
                    hotelName: hotel.hotelName,
                    totalRooms: hotel.totalRooms,
                    allocated: hotel.allocated,
                    available: hotel.totalRooms - hotel.allocated,
                    byRoomType: hotel.byRoomType
                }))
            });
        }

        // Sort by date
        dailyBreakdown.sort((a, b) => {
            const parseDate = (dateStr: string) => {
                const [day, month, year] = dateStr.split('/').map(Number);
                return new Date(year, month - 1, day);
            };
            return parseDate(a.date).getTime() - parseDate(b.date).getTime();
        });

        return dailyBreakdown;
    }

    /**
     * Build enhanced room type breakdown with daily details
     */
    private static async buildEnhancedRoomTypeBreakdown(
        eventId: string,
        hotelConfig: any
    ): Promise<DetailedRoomMatrix['enhancedRoomTypeBreakdown']> {
        // Get all room types for this event
        const roomTypes = await prisma.roomType.findMany({
            where: { eventId, active: true },
            select: { id: true, name: true }
        });

        const roomTypeBreakdown: DetailedRoomMatrix['enhancedRoomTypeBreakdown'] = [];

        for (const roomType of roomTypes) {
            // Collect daily breakdown for this room type across all hotels
            const dailyBreakdown: Array<{
                date: string;
                quantity: number;
                allocated: number;
                available: number;
                isOverAllocated: boolean;
            }> = [];

            let totalCapacity = 0;
            let totalAssigned = 0;

            // Process all hotels and dates for this room type
            for (const hotel of hotelConfig.hotels || []) {
                for (const contractedRoom of hotel.contractedRooms || []) {
                    if (contractedRoom.roomType === roomType.name) {
                        const quantity = contractedRoom.quantity || 0;
                        const allocated = contractedRoom.allocated || 0;
                        const isOverAllocated = allocated > quantity;

                        totalCapacity += quantity;
                        totalAssigned += allocated;

                        // Find existing date entry or create new one
                        const existingEntry = dailyBreakdown.find(d => d.date === contractedRoom.date);
                        if (existingEntry) {
                            existingEntry.quantity += quantity;
                            existingEntry.allocated += allocated;
                            existingEntry.available = existingEntry.quantity - existingEntry.allocated;
                            existingEntry.isOverAllocated = existingEntry.allocated > existingEntry.quantity;
                        } else {
                            dailyBreakdown.push({
                                date: contractedRoom.date,
                                quantity,
                                allocated,
                                available: quantity - allocated,
                                isOverAllocated
                            });
                        }
                    }
                }
            }

            // Sort daily breakdown by date
            dailyBreakdown.sort((a, b) => {
                const parseDate = (dateStr: string) => {
                    const [day, month, year] = dateStr.split('/').map(Number);
                    return new Date(year, month - 1, day);
                };
                return parseDate(a.date).getTime() - parseDate(b.date).getTime();
            });

            roomTypeBreakdown.push({
                name: roomType.name,
                totalAssigned,
                totalCapacity,
                utilization: totalCapacity > 0 ? Math.round((totalAssigned / totalCapacity) * 100) : 0,
                dailyBreakdown
            });
        }

        return roomTypeBreakdown;
    }

    /**
     * Force recalculation of room allocations (manual trigger)
     */
    static async forceRecalculation(eventId: string): Promise<{
        success: boolean;
        message: string;
        validation: any;
    }> {
        try {
            // Force update room allocations
            await RoomAssignmentService.updateEventRoomAllocations(eventId);

            // Get validation results
            const validation = await RoomAssignmentService.validateRoomMatrix(eventId);

            return {
                success: true,
                message: validation.isValid
                    ? 'Room allocations recalculated successfully - no conflicts detected'
                    : `Room allocations recalculated - ${validation.errors.length} conflicts detected`,
                validation
            };
        } catch (error: any) {
            return {
                success: false,
                message: `Failed to recalculate room allocations: ${error.message}`,
                validation: null
            };
        }
    }
}
