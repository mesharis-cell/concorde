// MongoDB initialization script for Docker
// This script runs when the container starts for the first time

// Switch to the event-concierge database
db = db.getSiblingDB('event-concierge');

// Create a user for the application
db.createUser({
  user: 'app',
  pwd: 'password',
  roles: [
    {
      role: 'readWrite',
      db: 'event-concierge'
    }
  ]
});

// Create indexes for better performance
db.users.createIndex({ "email": 1 }, { unique: true, sparse: true });
db.users.createIndex({ "eventId": 1 });
db.users.createIndex({ "groupId": 1 });
db.users.createIndex({ "assigned": 1 });
db.users.createIndex({ "active": 1 });

db.admins.createIndex({ "email": 1 }, { unique: true });
db.admins.createIndex({ "role": 1 });
db.admins.createIndex({ "active": 1 });

db.events.createIndex({ "shortName": 1 }, { unique: true, sparse: true });
db.events.createIndex({ "active": 1 });
db.events.createIndex({ "dateRange.start": 1 });
db.events.createIndex({ "dateRange.end": 1 });

db.groups.createIndex({ "eventId": 1 });
db.groups.createIndex({ "name": 1, "eventId": 1 }, { unique: true });
db.groups.createIndex({ "active": 1 });
db.groups.createIndex({ "deleted": 1 });

db.activities.createIndex({ "eventId": 1 });
db.activities.createIndex({ "groupId": 1 });
db.activities.createIndex({ "startDateTime": 1 });
db.activities.createIndex({ "endDateTime": 1 });
db.activities.createIndex({ "category": 1 });
db.activities.createIndex({ "deleted": 1 });

db.adminEvents.createIndex({ "adminId": 1, "eventId": 1 }, { unique: true });
db.adminEvents.createIndex({ "adminId": 1 });
db.adminEvents.createIndex({ "eventId": 1 });

print('Event Concierge database initialized successfully!');
print('Created indexes for optimal performance.');
print('Database is ready for the application.');