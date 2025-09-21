import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    log: ['error']
});

async function debugTrungUser() {
    try {
        console.log('🔍 DEBUGGING TRUNG USER ACTIVITY ISSUE...');

        // Find all users and filter for Trung (since JSON queries can be tricky)
        const allUsers = await prisma.user.findMany({
            select: {
                id: true,
                profile: true,
                groupIds: true,
                activityExclusions: {
                    include: {
                        activity: { select: { title: true } }
                    }
                }
            }
        });

        const user = allUsers.find(u => {
            const profile = u.profile as any;
            return profile?.firstName?.toLowerCase().includes('trung');
        });

        if (!user) {
            console.log('❌ Trung User not found in database');
            return;
        }

        const profile = user.profile as any;
        console.log(`✅ Found user: ${profile?.firstName} ${profile?.lastName}`);
        console.log(`👥 User groups: [${user.groupIds.join(', ')}]`);
        console.log(`🚫 User exclusions: ${user.activityExclusions.length}`);

        if (user.activityExclusions.length > 0) {
            console.log(`🚫 Excluded activities:`);
            user.activityExclusions.forEach(exclusion => {
                console.log(`   - ${exclusion.activity.title}`);
            });
        }

        // Get groups this user belongs to
        const userGroups = await prisma.group.findMany({
            where: {
                id: { in: user.groupIds },
                active: true,
                deleted: false
            },
            select: { id: true, name: true, memberCount: true }
        });

        console.log(`👥 User's groups:`);
        userGroups.forEach(group => {
            console.log(`   - "${group.name}" (${group.memberCount} members)`);
        });

        // Get activities assigned to user's groups
        const activitiesForGroups = await prisma.activity.findMany({
            where: {
                groupIds: { hasSome: user.groupIds },
                active: true,
                deleted: false
            },
            select: { id: true, title: true, groupIds: true }
        });

        console.log(`🎯 Activities available to user's groups: ${activitiesForGroups.length}`);
        activitiesForGroups.forEach(activity => {
            const isExcluded = user.activityExclusions.some(exc => exc.activityId === activity.id);
            console.log(`   - "${activity.title}" ${isExcluded ? '🚫 EXCLUDED' : '✅ AVAILABLE'}`);
        });

        // Check specific missing activities
        const missingActivities = [
            'Crystal Gold Launch',
            'AIR CCCC',
            'Regal Club - Friday',
            'Evening Bar - Stay Gold',
            'Fred Interview Session',
            'Crystal Gold Lounge - Saturday',
            'Sushi Samba After Party',
            'Regal Club - Sunday',
            'LAVO After Party'
        ];

        console.log(`\n🔍 INVESTIGATING MISSING ACTIVITIES:`);
        for (const activityTitle of missingActivities) {
            const activity = await prisma.activity.findFirst({
                where: {
                    title: activityTitle,
                    active: true,
                    deleted: false
                },
                select: { id: true, groupIds: true }
            });

            if (!activity) {
                console.log(`   ❌ "${activityTitle}" - Activity doesn't exist`);
                continue;
            }

            const hasGroupAccess = activity.groupIds.some(groupId => user.groupIds.includes(groupId));
            const isExcluded = user.activityExclusions.some(exc => exc.activityId === activity.id);

            console.log(`   📊 "${activityTitle}":`);
            console.log(`      Activity groups: [${activity.groupIds.join(', ')}]`);
            console.log(`      User has group access: ${hasGroupAccess}`);
            console.log(`      User is excluded: ${isExcluded}`);

            if (!hasGroupAccess) {
                const activityGroups = await prisma.group.findMany({
                    where: { id: { in: activity.groupIds } },
                    select: { name: true }
                });
                console.log(`      Activity assigned to groups: [${activityGroups.map(g => g.name).join(', ')}]`);
                console.log(`      User is in groups: [${userGroups.map(g => g.name).join(', ')}]`);
            }
        }

    } catch (error) {
        console.error('💥 Debug failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debugTrungUser();
