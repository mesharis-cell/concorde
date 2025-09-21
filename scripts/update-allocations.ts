import { RoomAssignmentService } from '../src/services/room-assignments.js';

async function updateAllocations() {
  const eventId = "68c2cd941de2da411f2a2f98";

  console.log('🔄 Updating room allocations for existing assignments...');

  try {
    await RoomAssignmentService.updateEventRoomAllocations(eventId);
    console.log('✅ Room allocations updated successfully!');
  } catch (error) {
    console.error('❌ Failed to update allocations:', error);
  }
}

updateAllocations();