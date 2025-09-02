#!/usr/bin/env bun
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();

interface MatrixUser {
  group: string;
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  Dinner: string;
  [activityId: string]: any; // Y/N values for activities
}

async function processActivityMatrix() {
  try {
    console.log('🚀 Starting activity matrix processing...');

    // First regenerate Prisma client to ensure it has latest schema
    console.log('🔄 Regenerating Prisma client...');
    await new Promise((resolve, reject) => {
      const prismaGenerate = spawn('bun', ['run', 'prisma:generate'], {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
      prismaGenerate.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Prisma client regenerated');
          resolve(code);
        } else {
          reject(new Error(`Prisma generate failed with code ${code}`));
        }
      });
    });

    // 1. Load matrix data
    const matrixPath = path.join(
      process.cwd(),
      '..',
      'Untitled spreadsheet - Sheet2.json'
    );
    const matrixData: MatrixUser[] = JSON.parse(
      readFileSync(matrixPath, 'utf-8')
    );

    console.log(`📊 Loaded ${matrixData.length} users from matrix`);

    // 2. Get all groups and create name-to-id mapping
    const groups = await prisma.group.findMany({
      where: { deleted: false },
      select: { id: true, name: true, eventId: true },
    });

    const groupNameToId = new Map<string, { id: string; eventId: string }>();
    groups.forEach((group) => {
      groupNameToId.set(group.name, { id: group.id, eventId: group.eventId });
    });

    console.log(`📋 Found ${groups.length} groups in database:`);
    groups.forEach((group) => {
      console.log(`   - ${group.name} (${group.id})`);
    });

    // 3. Get all activities
    const activities = await prisma.activity.findMany({
      where: { deleted: false },
      select: { id: true, eventId: true, title: true },
    });

    const activityIdMap = new Map<string, { eventId: string; title: string }>();
    activities.forEach((activity) => {
      activityIdMap.set(activity.id, {
        eventId: activity.eventId,
        title: activity.title,
      });
    });

    // 4. Find users by email/name and group
    const userMap = new Map<
      string,
      { id: string; groupId: string; eventId: string; matrixUser: MatrixUser }
    >();

    for (const matrixUser of matrixData) {
      const groupInfo = groupNameToId.get(matrixUser.group);
      if (!groupInfo) {
        console.warn(`⚠️ Group not found: ${matrixUser.group}`);
        continue;
      }

      // Skip users without email AND without both first/last names
      if (
        !matrixUser.profile.email &&
        (!matrixUser.profile.firstName || !matrixUser.profile.lastName)
      ) {
        console.warn(
          `⚠️ No email or name for user: ${matrixUser.profile.firstName} ${matrixUser.profile.lastName}`
        );
        continue;
      }

      // Since Prisma doesn't support JSON field queries well with MongoDB, we get all users and filter in JS
      const allUsers = await prisma.user.findMany({
        where: {
          eventId: groupInfo.eventId,
          active: true,
        },
      });

      const user = allUsers.find((u) => {
        const profile = u.profile as any;

        // First try email match
        if (
          matrixUser.profile.email &&
          profile?.email === matrixUser.profile.email
        ) {
          return true;
        }

        // If no email, try firstName and lastName match
        if (
          !matrixUser.profile.email &&
          profile?.firstName &&
          profile?.lastName
        ) {
          return (
            profile.firstName.trim().toLowerCase() ===
              matrixUser.profile.firstName.trim().toLowerCase() &&
            profile.lastName.trim().toLowerCase() ===
              matrixUser.profile.lastName.trim().toLowerCase()
          );
        }

        return false;
      });

      if (user) {
        // Create a consistent key for the user (email or name-based)
        const userKey =
          matrixUser.profile.email ||
          `${matrixUser.profile.firstName.trim()}_${matrixUser.profile.lastName.trim()}`;

        userMap.set(userKey, {
          id: user.id,
          groupId: groupInfo.id,
          eventId: groupInfo.eventId,
          matrixUser: matrixUser,
        });

        console.log(
          `✅ Matched user: ${matrixUser.profile.firstName} ${matrixUser.profile.lastName}`
        );
      } else {
        const identifier =
          matrixUser.profile.email ||
          `${matrixUser.profile.firstName} ${matrixUser.profile.lastName}`;
        console.warn(`⚠️ User not found in DB: ${identifier}`);
      }
    }

    console.log(`👥 Found ${userMap.size} users in database`);

    // Log user matching details
    if (userMap.size < matrixData.length) {
      const missingCount = matrixData.length - userMap.size;
      console.warn(
        `⚠️ ${missingCount} users from matrix not found in database`
      );
    }

    // 5. Delete all existing exclusions for users in the matrix
    const userIds = Array.from(userMap.values()).map((u) => u.id);
    const deletedCount = await prisma.userActivityExclusion.deleteMany({
      where: {
        userId: { in: userIds },
      },
    });

    console.log(`🗑️ Deleted ${deletedCount.count} existing exclusion records`);

    // 6. Analyze matrix to determine group-activity relationships
    const groupActivityMap = new Map<string, Set<string>>(); // groupId -> Set of activityIds

    // Initialize all groups
    groups.forEach((group) => {
      groupActivityMap.set(group.id, new Set());
    });

    // Track invalid activity IDs for logging
    const invalidActivityIds = new Set<string>();

    // Track group dinner mappings - collect ALL dinners per group
    const groupDinnerMap = new Map<string, Set<string>>(); // groupId -> Set of dinner activity IDs

    // Initialize group dinner maps
    groups.forEach((group) => {
      groupDinnerMap.set(group.id, new Set());
    });

    // Process each user in the matrix
    for (const matrixUser of matrixData) {
      const groupInfo = groupNameToId.get(matrixUser.group);
      if (!groupInfo) continue;

      // Process regular activity columns (skip 'group', 'profile', 'Dinner')
      for (const [key, value] of Object.entries(matrixUser)) {
        if (key === 'group' || key === 'profile' || key === 'Dinner') continue;

        // Check if this is a valid activity ID
        if (activityIdMap.has(key)) {
          // If any user in this group has 'Y' for this activity, the group should have this activity
          if (value === 'Y') {
            groupActivityMap.get(groupInfo.id)?.add(key);
          }
        } else {
          // Track invalid activity IDs
          invalidActivityIds.add(key);
        }
      }

      // Collect ALL dinner assignments for each group (from Dinner field)
      if (
        matrixUser.Dinner &&
        matrixUser.Dinner !== 'N' &&
        activityIdMap.has(matrixUser.Dinner)
      ) {
        const activity = activityIdMap.get(matrixUser.Dinner);
        if (activity?.title.toLowerCase().includes('dinner')) {
          groupDinnerMap.get(groupInfo.id)?.add(matrixUser.Dinner);
        }
        // Also add to regular group activities
        groupActivityMap.get(groupInfo.id)?.add(matrixUser.Dinner);
      } else if (matrixUser.Dinner && matrixUser.Dinner !== 'N') {
        invalidActivityIds.add(matrixUser.Dinner);
      }
    }

    // Log group dinner mappings
    console.log('\n🍽️ Group dinner options discovered:');
    for (const [groupId, dinnerIds] of groupDinnerMap) {
      const group = groups.find((g) => g.id === groupId);
      const dinnerTitles = Array.from(dinnerIds).map((id) => {
        const activity = activityIdMap.get(id);
        return activity?.title || id;
      });
      console.log(`   📋 ${group?.name}: ${dinnerIds.size} dinner options`);
      if (dinnerTitles.length > 0) {
        console.log(`     Dinners: ${dinnerTitles.join(', ')}`);
      }
    }

    // Log invalid activity IDs
    if (invalidActivityIds.size > 0) {
      console.warn(
        `⚠️ Found ${invalidActivityIds.size} invalid activity IDs in matrix:`
      );
      Array.from(invalidActivityIds).forEach((id) => {
        console.warn(`   - ${id}`);
      });
    }

    // 7. Update group.activityIds
    console.log('🔄 Updating group activity assignments...');
    for (const [groupId, activityIds] of groupActivityMap) {
      const activityIdsArray = Array.from(activityIds);
      await prisma.group.update({
        where: { id: groupId },
        data: {
          activityIds: activityIdsArray,
        } as any,
      });

      const group = groups.find((g) => g.id === groupId);
      console.log(
        `   📋 ${group?.name}: ${activityIdsArray.length} activities assigned`
      );

      // Log some activity details
      if (activityIdsArray.length > 0) {
        const sampleActivities = activityIdsArray.slice(0, 3).map((id) => {
          const activity = activityIdMap.get(id);
          return activity?.title || id;
        });
        console.log(
          `     Sample activities: ${sampleActivities.join(', ')}${
            activityIdsArray.length > 3 ? '...' : ''
          }`
        );
      }
    }

    // 8. Update activity.groupIds (reverse mapping)
    console.log('🔄 Updating activity group assignments...');
    const activityGroupMap = new Map<string, Set<string>>(); // activityId -> Set of groupIds

    // Initialize all activities
    activities.forEach((activity) => {
      activityGroupMap.set(activity.id, new Set());
    });

    // Build reverse mapping
    for (const [groupId, activityIds] of groupActivityMap) {
      for (const activityId of activityIds) {
        activityGroupMap.get(activityId)?.add(groupId);
      }
    }

    // Update activities
    for (const [activityId, groupIds] of activityGroupMap) {
      const groupIdsArray = Array.from(groupIds);
      await prisma.activity.update({
        where: { id: activityId },
        data: {
          groupIds: groupIdsArray,
        } as any,
      });

      const activity = activities.find((a) => a.id === activityId);
      if (groupIdsArray.length > 0) {
        console.log(
          `   🎯 ${activity?.title}: ${groupIdsArray.length} groups assigned`
        );
      }
    }

    // 9. Create exclusion records for 'N' values
    console.log('❌ Creating exclusion records...');
    const exclusionsToCreate: Array<{
      userId: string;
      activityId: string;
      groupId: string;
      eventId: string;
      excludedBy: string;
      reason: string;
    }> = [];

    // Track exclusion statistics
    let regularExclusions = 0;
    let dinnerExclusions = 0;

    // We need a system admin ID for excludedBy - let's find one or use the first admin
    const systemAdmin =
      (await prisma.admin.findFirst({
        where: { role: 'SUPER' },
      })) || (await prisma.admin.findFirst());

    if (!systemAdmin) {
      throw new Error('No admin found in database for exclusion records');
    }

    // Process exclusions for each user found in the database
    for (const [userKey, userInfo] of userMap) {
      const matrixUser = userInfo.matrixUser;

      // Check regular activity columns
      for (const [activityId, value] of Object.entries(matrixUser)) {
        if (
          activityId === 'group' ||
          activityId === 'profile' ||
          activityId === 'Dinner'
        )
          continue;

        if (value === 'N' && activityIdMap.has(activityId)) {
          // Verify this activity is assigned to the user's group
          const groupActivities = groupActivityMap.get(userInfo.groupId);
          if (groupActivities?.has(activityId)) {
            const activity = activityIdMap.get(activityId);
            console.log(
              `   🚫 Excluding ${matrixUser.profile.firstName} ${matrixUser.profile.lastName} from: ${activity?.title}`
            );

            exclusionsToCreate.push({
              userId: userInfo.id,
              activityId: activityId,
              groupId: userInfo.groupId,
              eventId: userInfo.eventId,
              excludedBy: systemAdmin.id,
              reason: 'Matrix import exclusion',
            });
            regularExclusions++;
          }
        }
      }

      // Handle Dinner assignments - CRITICAL LOGIC:
      // If user has "Dinner": "specificId" → EXCLUDE from all OTHER dinners in their group
      // If user has "Dinner": "N" → EXCLUDE from ALL dinners in their group

      const userAssignedDinner =
        matrixUser.Dinner !== 'N' ? matrixUser.Dinner : null;
      const groupDinners = groupDinnerMap.get(userInfo.groupId);

      if (groupDinners && groupDinners.size > 0) {
        for (const dinnerActivityId of groupDinners) {
          // If user has no dinner assignment OR this is not their assigned dinner
          if (!userAssignedDinner || dinnerActivityId !== userAssignedDinner) {
            const activity = activityIdMap.get(dinnerActivityId);
            console.log(
              `   🍽️ Excluding ${matrixUser.profile.firstName} ${
                matrixUser.profile.lastName
              } from dinner: ${activity?.title} (assigned dinner: ${
                userAssignedDinner || 'none'
              })`
            );

            exclusionsToCreate.push({
              userId: userInfo.id,
              activityId: dinnerActivityId,
              groupId: userInfo.groupId,
              eventId: userInfo.eventId,
              excludedBy: systemAdmin.id,
              reason: `Matrix import - dinner exclusion (assigned: ${
                userAssignedDinner || 'none'
              })`,
            });
            dinnerExclusions++;
          }
        }
      }
    }

    // Deduplicate exclusions before creating (prevent unique constraint violations)
    const uniqueExclusions = new Map<string, (typeof exclusionsToCreate)[0]>();
    exclusionsToCreate.forEach((exclusion) => {
      const key = `${exclusion.userId}_${exclusion.activityId}`;
      if (!uniqueExclusions.has(key)) {
        uniqueExclusions.set(key, exclusion);
      }
    });

    const deduplicatedExclusions = Array.from(uniqueExclusions.values());
    const duplicatesRemoved =
      exclusionsToCreate.length - deduplicatedExclusions.length;

    if (duplicatesRemoved > 0) {
      console.log(
        `🔍 Removed ${duplicatesRemoved} duplicate exclusion records`
      );
    }

    // Batch create exclusions
    if (deduplicatedExclusions.length > 0) {
      await prisma.userActivityExclusion.createMany({
        data: deduplicatedExclusions,
      });
      console.log(
        `   ❌ Created ${deduplicatedExclusions.length} exclusion records`
      );
      console.log(`     📊 Regular exclusions: ${regularExclusions}`);
      console.log(`     🍽️ Dinner exclusions: ${dinnerExclusions}`);
      if (duplicatesRemoved > 0) {
        console.log(`     🔄 Duplicates removed: ${duplicatesRemoved}`);
      }
    }

    // 10. Summary
    console.log('\n✅ Matrix processing completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Users in matrix: ${matrixData.length}`);
    console.log(
      `   - Users processed: ${userMap.size} (${Math.round(
        (userMap.size / matrixData.length) * 100
      )}%)`
    );
    console.log(`   - Users not found: ${matrixData.length - userMap.size}`);
    console.log(`   - Groups updated: ${groups.length}`);
    console.log(`   - Activities updated: ${activities.length}`);
    console.log(`   - Invalid activity IDs: ${invalidActivityIds.size}`);
    console.log(
      `   - Total exclusions created: ${deduplicatedExclusions?.length || 0}`
    );
    console.log(`     • Regular exclusions: ${regularExclusions}`);
    console.log(`     • Dinner exclusions: ${dinnerExclusions}`);
    if (exclusionsToCreate.length !== (deduplicatedExclusions?.length || 0)) {
      console.log(
        `     • Duplicates removed: ${
          exclusionsToCreate.length - (deduplicatedExclusions?.length || 0)
        }`
      );
    }
  } catch (error) {
    console.error('❌ Error processing matrix:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (import.meta.main) {
  processActivityMatrix();
}

export default processActivityMatrix;
