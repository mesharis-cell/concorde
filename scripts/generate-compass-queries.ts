/**
 * MongoDB Compass Query Generator
 * Generates ready-to-use queries for reviewing email preservation logic
 */

const EVENT_ID = '68c2cd941de2da411f2a2f98';

function generateQueries() {
    const now = Date.now();
    const fortyEightHoursAgo = now - (48 * 60 * 60 * 1000);
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

    console.log('='.repeat(80));
    console.log('MongoDB Compass Queries - Email Preservation Analysis');
    console.log('='.repeat(80));
    console.log(`Generated at: ${new Date().toISOString()}`);
    console.log('');

    // Query 1: Users modified in last 48 hours (would be preserved)
    console.log('📧 QUERY 1: Users modified in LAST 48 HOURS (emails will be PRESERVED)');
    console.log('Copy this into MongoDB Compass Filter:');
    console.log('');
    console.log(`{
  "eventId": ObjectId('${EVENT_ID}'),
  "active": true,
  "updatedAt": {
    "$gte": new ISODate('${new Date(fortyEightHoursAgo).toISOString()}')
  }
}`);
    console.log('');
    console.log('Projection (to see only relevant fields):');
    console.log(JSON.stringify({
        "profile.firstName": 1,
        "profile.lastName": 1,
        "profile.email": 1,
        "updatedAt": 1
    }, null, 2));
    console.log('');
    console.log('-'.repeat(80));
    console.log('');

    // Query 2: Users modified MORE than 48 hours ago (would be updated)
    console.log('⚠️  QUERY 2: Users modified MORE than 48 hours ago (emails WILL UPDATE)');
    console.log('Copy this into MongoDB Compass Filter:');
    console.log('');
    console.log(`{
  "eventId": ObjectId('${EVENT_ID}'),
  "active": true,
  "updatedAt": {
    "$lt": new ISODate('${new Date(fortyEightHoursAgo).toISOString()}')
  }
}`);
    console.log('');
    console.log('Projection (to see only relevant fields):');
    console.log(JSON.stringify({
        "profile.firstName": 1,
        "profile.lastName": 1,
        "profile.email": 1,
        "updatedAt": 1
    }, null, 2));
    console.log('');
    console.log('-'.repeat(80));
    console.log('');

    // Query 3: Users modified in last 24 hours (stricter preservation)
    console.log('🔒 QUERY 3: Users modified in LAST 24 HOURS (alternative stricter window)');
    console.log('Copy this into MongoDB Compass Filter:');
    console.log('');
    console.log(`{
  "eventId": ObjectId('${EVENT_ID}'),
  "active": true,
  "updatedAt": {
    "$gte": new ISODate('${new Date(twentyFourHoursAgo).toISOString()}')
  }
}`);
    console.log('');
    console.log('-'.repeat(80));
    console.log('');

    // Query 4: Count by time windows
    console.log('📊 SUMMARY COUNTS:');
    console.log('');
    console.log('Last 24 hours:');
    console.log(`{
  "eventId": ObjectId('${EVENT_ID}'),
  "active": true,
  "updatedAt": {
    "$gte": new ISODate('${new Date(twentyFourHoursAgo).toISOString()}')
  }
}`);
    console.log('');
    console.log('24-48 hours ago:');
    console.log(`{
  "eventId": ObjectId('${EVENT_ID}'),
  "active": true,
  "updatedAt": {
    "$gte": new ISODate('${new Date(fortyEightHoursAgo).toISOString()}'),
    "$lt": new ISODate('${new Date(twentyFourHoursAgo).toISOString()}')
  }
}`);
    console.log('');
    console.log('More than 48 hours ago:');
    console.log(`{
  "eventId": ObjectId('${EVENT_ID}'),
  "active": true,
  "updatedAt": {
    "$lt": new ISODate('${new Date(fortyEightHoursAgo).toISOString()}')
  }
}`);
    console.log('');
    console.log('-'.repeat(80));
    console.log('');

    // Timestamps for reference
    console.log('📅 TIMESTAMP REFERENCE:');
    console.log(`Current time: ${new Date(now).toISOString()}`);
    console.log(`48 hours ago: ${new Date(fortyEightHoursAgo).toISOString()}`);
    console.log(`24 hours ago: ${new Date(twentyFourHoursAgo).toISOString()}`);
    console.log(`1 week ago: ${new Date(oneWeekAgo).toISOString()}`);
    console.log('');

    // Export counts aggregation
    console.log('💡 ADVANCED: Count users by update window (run in MongoDB Compass Aggregation tab)');
    console.log('');
    console.log(`[
  {
    "$match": {
      "eventId": ObjectId('${EVENT_ID}'),
      "active": true
    }
  },
  {
    "$bucket": {
      "groupBy": "$updatedAt",
      "boundaries": [
        new ISODate('${new Date(oneWeekAgo).toISOString()}'),
        new ISODate('${new Date(fortyEightHoursAgo).toISOString()}'),
        new ISODate('${new Date(twentyFourHoursAgo).toISOString()}'),
        new ISODate('${new Date(now).toISOString()}')
      ],
      "default": "Older than 1 week",
      "output": {
        "count": { "$sum": 1 },
        "users": {
          "$push": {
            "firstName": "$profile.firstName",
            "lastName": "$profile.lastName",
            "email": "$profile.email",
            "updatedAt": "$updatedAt"
          }
        }
      }
    }
  }
]`);
    console.log('');
}

generateQueries();

