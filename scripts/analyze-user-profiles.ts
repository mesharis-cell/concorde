import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient({
    log: ['error'],
});

interface UserProfile {
    id: string;
    eventId: string;
    eventName?: string;
    profile: any;
    groupIds: string[];
    groupNames?: string[];
    assigned: boolean;
    active: boolean;
    registeredAt: Date;
    lastLoginAt?: Date;
    roomAssignments?: any[];
    carNumbers?: string[];
    guestCategory?: string;
}

interface ProfileAnalysis {
    uniqueProfiles: UserProfile[];
    duplicateEmailGroups: {
        email: string;
        users: UserProfile[];
        count: number;
    }[];
    missingEmails: UserProfile[];
    stats: {
        totalUsers: number;
        uniqueGoodProfiles: number;
        duplicateEmailUsers: number;
        missingEmailUsers: number;
        activeUsers: number;
        assignedUsers: number;
        withRoomAssignments: number;
        withCarAssignments: number;
    };
}

/**
 * Extract and normalize email from user profile
 */
function extractEmail(profile: any): string | null {
    if (!profile) return null;

    const email = profile.email;
    if (!email || email === '' || email === 'N/A' || email === 'undefined') {
        return null;
    }

    return email.toLowerCase().trim();
}

/**
 * Extract full name from user profile
 */
function extractFullName(profile: any): string {
    if (!profile) return 'Unknown User';

    const firstName = profile.firstName || profile.preferredFirstName || '';
    const lastName = profile.lastName || profile.preferredLastName || '';

    return `${firstName} ${lastName}`.trim() || 'Unknown User';
}

/**
 * Get all users with comprehensive data
 */
async function getAllUsers(eventId?: string): Promise<UserProfile[]> {
    console.log('📊 Fetching all users with comprehensive data...');

    const where = eventId ? { eventId, active: true } : { active: true };

    const users = await prisma.user.findMany({
        where,
        include: {
            event: {
                select: { id: true, name: true, shortName: true },
            },
            roomAssignments: {
                include: {
                    hotel: { select: { name: true } },
                    roomType: { select: { name: true } },
                },
            },
        },
        orderBy: { registeredAt: 'desc' },
    });

    console.log(`✅ Found ${users.length} users`);

    // Enrich with group information
    const enrichedUsers: UserProfile[] = [];

    for (const user of users) {
        // Get group names
        let groupNames: string[] = [];
        if (user.groupIds && user.groupIds.length > 0) {
            const groups = await prisma.group.findMany({
                where: {
                    id: { in: user.groupIds },
                    active: true,
                    deleted: false,
                },
                select: { id: true, name: true },
            });
            groupNames = groups.map(g => g.name);
        }

        enrichedUsers.push({
            id: user.id,
            eventId: user.eventId,
            eventName: user.event?.name,
            profile: user.profile,
            groupIds: user.groupIds || [],
            groupNames,
            assigned: user.assigned,
            active: user.active,
            registeredAt: user.registeredAt,
            lastLoginAt: user.lastLoginAt,
            roomAssignments: user.roomAssignments || [],
            carNumbers: user.carNumbers || [],
            guestCategory: user.guestCategory,
        });
    }

    return enrichedUsers;
}

/**
 * Analyze user profiles for duplicates and missing emails
 */
function analyzeProfiles(users: UserProfile[]): ProfileAnalysis {
    console.log('🔍 Analyzing user profiles...');

    const emailToUsers = new Map<string, UserProfile[]>();
    const missingEmails: UserProfile[] = [];

    // Group users by email
    for (const user of users) {
        const email = extractEmail(user.profile);

        if (!email) {
            missingEmails.push(user);
        } else {
            if (!emailToUsers.has(email)) {
                emailToUsers.set(email, []);
            }
            emailToUsers.get(email)!.push(user);
        }
    }

    // Identify unique vs duplicate emails
    const uniqueProfiles: UserProfile[] = [];
    const duplicateEmailGroups: { email: string; users: UserProfile[]; count: number }[] = [];

    for (const [email, emailUsers] of emailToUsers.entries()) {
        if (emailUsers.length === 1) {
            // Unique email - this is a "good" profile
            uniqueProfiles.push(emailUsers[0]);
        } else {
            // Duplicate email
            duplicateEmailGroups.push({
                email,
                users: emailUsers,
                count: emailUsers.length,
            });
        }
    }

    // Sort duplicates by count (highest first)
    duplicateEmailGroups.sort((a, b) => b.count - a.count);

    // Calculate stats
    const duplicateEmailUsers = duplicateEmailGroups.reduce((sum, group) => sum + group.count, 0);

    const stats = {
        totalUsers: users.length,
        uniqueGoodProfiles: uniqueProfiles.length,
        duplicateEmailUsers,
        missingEmailUsers: missingEmails.length,
        activeUsers: users.filter(u => u.active).length,
        assignedUsers: users.filter(u => u.assigned).length,
        withRoomAssignments: users.filter(u => u.roomAssignments && u.roomAssignments.length > 0).length,
        withCarAssignments: users.filter(u => u.carNumbers && u.carNumbers.length > 0).length,
    };

    console.log(`📈 Analysis complete:`);
    console.log(`   Total Users: ${stats.totalUsers}`);
    console.log(`   ✅ Unique Good Profiles: ${stats.uniqueGoodProfiles}`);
    console.log(`   🔄 Duplicate Email Users: ${stats.duplicateEmailUsers} (in ${duplicateEmailGroups.length} groups)`);
    console.log(`   ❌ Missing Email Users: ${stats.missingEmailUsers}`);
    console.log(`   🟢 Active Users: ${stats.activeUsers}`);
    console.log(`   📋 Assigned Users: ${stats.assignedUsers}`);

    return {
        uniqueProfiles,
        duplicateEmailGroups,
        missingEmails,
        stats,
    };
}

/**
 * Create Excel workbook with analysis results
 */
async function createExcelReport(analysis: ProfileAnalysis, outputPath: string): Promise<void> {
    console.log('📊 Creating Excel report...');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Event Concierge Platform';
    workbook.created = new Date();

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 25 },
        { header: 'Count', key: 'count', width: 15 },
        { header: 'Percentage', key: 'percentage', width: 15 },
        { header: 'Notes', key: 'notes', width: 40 },
    ];

    const { stats } = analysis;
    summarySheet.addRows([
        {
            metric: 'Total Users',
            count: stats.totalUsers,
            percentage: '100%',
            notes: 'All users in the system',
        },
        {
            metric: 'Unique Good Profiles',
            count: stats.uniqueGoodProfiles,
            percentage: `${((stats.uniqueGoodProfiles / stats.totalUsers) * 100).toFixed(1)}%`,
            notes: 'Users with unique emails - safe to access',
        },
        {
            metric: 'Duplicate Email Users',
            count: stats.duplicateEmailUsers,
            percentage: `${((stats.duplicateEmailUsers / stats.totalUsers) * 100).toFixed(1)}%`,
            notes: `Users sharing emails - ${analysis.duplicateEmailGroups.length} email groups`,
        },
        {
            metric: 'Missing Email Users',
            count: stats.missingEmailUsers,
            percentage: `${((stats.missingEmailUsers / stats.totalUsers) * 100).toFixed(1)}%`,
            notes: 'Users without valid email addresses',
        },
        {
            metric: 'Active Users',
            count: stats.activeUsers,
            percentage: `${((stats.activeUsers / stats.totalUsers) * 100).toFixed(1)}%`,
            notes: 'Users marked as active in the system',
        },
        {
            metric: 'Assigned Users',
            count: stats.assignedUsers,
            percentage: `${((stats.assignedUsers / stats.totalUsers) * 100).toFixed(1)}%`,
            notes: 'Users assigned to groups',
        },
        {
            metric: 'With Room Assignments',
            count: stats.withRoomAssignments,
            percentage: `${((stats.withRoomAssignments / stats.totalUsers) * 100).toFixed(1)}%`,
            notes: 'Users with hotel room assignments',
        },
        {
            metric: 'With Car Assignments',
            count: stats.withCarAssignments,
            percentage: `${((stats.withCarAssignments / stats.totalUsers) * 100).toFixed(1)}%`,
            notes: 'Users with transport car assignments',
        },
    ]);

    // Style summary sheet
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F3FF' },
    };

    // Unique profiles sheet (good to access)
    const uniqueSheet = workbook.addWorksheet('Unique Profiles (Good)');
    uniqueSheet.columns = [
        { header: 'User ID', key: 'userId', width: 25 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Full Name', key: 'fullName', width: 25 },
        { header: 'First Name', key: 'firstName', width: 20 },
        { header: 'Last Name', key: 'lastName', width: 20 },
        { header: 'Phone', key: 'phone', width: 20 },
        { header: 'Event', key: 'eventName', width: 20 },
        { header: 'Groups', key: 'groups', width: 30 },
        { header: 'Assigned', key: 'assigned', width: 10 },
        { header: 'Guest Category', key: 'guestCategory', width: 15 },
        { header: 'Room Assigned', key: 'roomAssigned', width: 15 },
        { header: 'Car Numbers', key: 'carNumbers', width: 20 },
        { header: 'Registered At', key: 'registeredAt', width: 20 },
        { header: 'Last Login', key: 'lastLogin', width: 20 },
    ];

    for (const user of analysis.uniqueProfiles) {
        const profile = user.profile || {};
        uniqueSheet.addRow({
            userId: user.id,
            email: extractEmail(profile) || '',
            fullName: extractFullName(profile),
            firstName: profile.firstName || '',
            lastName: profile.lastName || '',
            phone: profile.phone || '',
            eventName: user.eventName || '',
            groups: user.groupNames?.join(', ') || '',
            assigned: user.assigned ? 'Yes' : 'No',
            guestCategory: user.guestCategory || '',
            roomAssigned: user.roomAssignments && user.roomAssignments.length > 0 ? 'Yes' : 'No',
            carNumbers: user.carNumbers?.join(', ') || '',
            registeredAt: user.registeredAt.toISOString().split('T')[0],
            lastLogin: user.lastLoginAt ? user.lastLoginAt.toISOString().split('T')[0] : '',
        });
    }

    // Style unique profiles sheet
    uniqueSheet.getRow(1).font = { bold: true };
    uniqueSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F7E6' }, // Light green
    };

    // Duplicate emails sheet
    const duplicatesSheet = workbook.addWorksheet('Duplicate Emails');
    duplicatesSheet.columns = [
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Count', key: 'count', width: 10 },
        { header: 'User ID', key: 'userId', width: 25 },
        { header: 'Full Name', key: 'fullName', width: 25 },
        { header: 'First Name', key: 'firstName', width: 20 },
        { header: 'Last Name', key: 'lastName', width: 20 },
        { header: 'Phone', key: 'phone', width: 20 },
        { header: 'Event', key: 'eventName', width: 20 },
        { header: 'Groups', key: 'groups', width: 30 },
        { header: 'Assigned', key: 'assigned', width: 10 },
        { header: 'Guest Category', key: 'guestCategory', width: 15 },
        { header: 'Room Assigned', key: 'roomAssigned', width: 15 },
        { header: 'Car Numbers', key: 'carNumbers', width: 20 },
        { header: 'Registered At', key: 'registeredAt', width: 20 },
        { header: 'Last Login', key: 'lastLogin', width: 20 },
    ];

    for (const group of analysis.duplicateEmailGroups) {
        for (let i = 0; i < group.users.length; i++) {
            const user = group.users[i];
            const profile = user.profile || {};

            duplicatesSheet.addRow({
                email: i === 0 ? group.email : '', // Only show email on first row of group
                count: i === 0 ? group.count : '', // Only show count on first row of group
                userId: user.id,
                fullName: extractFullName(profile),
                firstName: profile.firstName || '',
                lastName: profile.lastName || '',
                phone: profile.phone || '',
                eventName: user.eventName || '',
                groups: user.groupNames?.join(', ') || '',
                assigned: user.assigned ? 'Yes' : 'No',
                guestCategory: user.guestCategory || '',
                roomAssigned: user.roomAssignments && user.roomAssignments.length > 0 ? 'Yes' : 'No',
                carNumbers: user.carNumbers?.join(', ') || '',
                registeredAt: user.registeredAt.toISOString().split('T')[0],
                lastLogin: user.lastLoginAt ? user.lastLoginAt.toISOString().split('T')[0] : '',
            });
        }

        // Add separator row
        if (group !== analysis.duplicateEmailGroups[analysis.duplicateEmailGroups.length - 1]) {
            duplicatesSheet.addRow({});
        }
    }

    // Style duplicates sheet
    duplicatesSheet.getRow(1).font = { bold: true };
    duplicatesSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF2CC' }, // Light yellow
    };

    // Missing emails sheet
    const missingSheet = workbook.addWorksheet('Missing Emails');
    missingSheet.columns = [
        { header: 'User ID', key: 'userId', width: 25 },
        { header: 'Full Name', key: 'fullName', width: 25 },
        { header: 'First Name', key: 'firstName', width: 20 },
        { header: 'Last Name', key: 'lastName', width: 20 },
        { header: 'Phone', key: 'phone', width: 20 },
        { header: 'Event', key: 'eventName', width: 20 },
        { header: 'Groups', key: 'groups', width: 30 },
        { header: 'Assigned', key: 'assigned', width: 10 },
        { header: 'Guest Category', key: 'guestCategory', width: 15 },
        { header: 'Room Assigned', key: 'roomAssigned', width: 15 },
        { header: 'Car Numbers', key: 'carNumbers', width: 20 },
        { header: 'Registered At', key: 'registeredAt', width: 20 },
        { header: 'Raw Email Field', key: 'rawEmail', width: 25 },
    ];

    for (const user of analysis.missingEmails) {
        const profile = user.profile || {};
        missingSheet.addRow({
            userId: user.id,
            fullName: extractFullName(profile),
            firstName: profile.firstName || '',
            lastName: profile.lastName || '',
            phone: profile.phone || '',
            eventName: user.eventName || '',
            groups: user.groupNames?.join(', ') || '',
            assigned: user.assigned ? 'Yes' : 'No',
            guestCategory: user.guestCategory || '',
            roomAssigned: user.roomAssignments && user.roomAssignments.length > 0 ? 'Yes' : 'No',
            carNumbers: user.carNumbers?.join(', ') || '',
            registeredAt: user.registeredAt.toISOString().split('T')[0],
            rawEmail: profile.email || '(no email field)',
        });
    }

    // Style missing emails sheet
    missingSheet.getRow(1).font = { bold: true };
    missingSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFCE4EC' }, // Light red
    };

    // Save workbook
    await workbook.xlsx.writeFile(outputPath);
    console.log(`✅ Excel report saved to: ${outputPath}`);
}

/**
 * Create CSV reports (alternative to Excel)
 */
async function createCSVReports(analysis: ProfileAnalysis, outputDir: string): Promise<void> {
    console.log('📊 Creating CSV reports...');

    // Unique profiles CSV
    const uniqueCsvPath = path.join(outputDir, 'unique-profiles-good.csv');
    const uniqueCsvHeader = 'User ID,Email,Full Name,First Name,Last Name,Phone,Event,Groups,Assigned,Guest Category,Room Assigned,Car Numbers,Registered At,Last Login\n';
    let uniqueCsvContent = uniqueCsvHeader;

    for (const user of analysis.uniqueProfiles) {
        const profile = user.profile || {};
        const row = [
            user.id,
            `"${extractEmail(profile) || ''}"`,
            `"${extractFullName(profile)}"`,
            `"${profile.firstName || ''}"`,
            `"${profile.lastName || ''}"`,
            `"${profile.phone || ''}"`,
            `"${user.eventName || ''}"`,
            `"${user.groupNames?.join(', ') || ''}"`,
            user.assigned ? 'Yes' : 'No',
            `"${user.guestCategory || ''}"`,
            user.roomAssignments && user.roomAssignments.length > 0 ? 'Yes' : 'No',
            `"${user.carNumbers?.join(', ') || ''}"`,
            user.registeredAt.toISOString().split('T')[0],
            user.lastLoginAt ? user.lastLoginAt.toISOString().split('T')[0] : '',
        ].join(',');
        uniqueCsvContent += row + '\n';
    }

    fs.writeFileSync(uniqueCsvPath, uniqueCsvContent);
    console.log(`✅ Unique profiles CSV saved to: ${uniqueCsvPath}`);

    // Duplicates CSV
    const duplicatesCsvPath = path.join(outputDir, 'duplicate-emails.csv');
    const duplicatesCsvHeader = 'Email,Count,User ID,Full Name,First Name,Last Name,Phone,Event,Groups,Assigned,Guest Category,Room Assigned,Car Numbers,Registered At,Last Login\n';
    let duplicatesCsvContent = duplicatesCsvHeader;

    for (const group of analysis.duplicateEmailGroups) {
        for (let i = 0; i < group.users.length; i++) {
            const user = group.users[i];
            const profile = user.profile || {};

            const row = [
                i === 0 ? `"${group.email}"` : '""', // Only show email on first row
                i === 0 ? group.count : '', // Only show count on first row
                user.id,
                `"${extractFullName(profile)}"`,
                `"${profile.firstName || ''}"`,
                `"${profile.lastName || ''}"`,
                `"${profile.phone || ''}"`,
                `"${user.eventName || ''}"`,
                `"${user.groupNames?.join(', ') || ''}"`,
                user.assigned ? 'Yes' : 'No',
                `"${user.guestCategory || ''}"`,
                user.roomAssignments && user.roomAssignments.length > 0 ? 'Yes' : 'No',
                `"${user.carNumbers?.join(', ') || ''}"`,
                user.registeredAt.toISOString().split('T')[0],
                user.lastLoginAt ? user.lastLoginAt.toISOString().split('T')[0] : '',
            ].join(',');
            duplicatesCsvContent += row + '\n';
        }

        // Add separator row
        if (group !== analysis.duplicateEmailGroups[analysis.duplicateEmailGroups.length - 1]) {
            duplicatesCsvContent += '\n';
        }
    }

    fs.writeFileSync(duplicatesCsvPath, duplicatesCsvContent);
    console.log(`✅ Duplicates CSV saved to: ${duplicatesCsvPath}`);

    // Missing emails CSV
    const missingCsvPath = path.join(outputDir, 'missing-emails.csv');
    const missingCsvHeader = 'User ID,Full Name,First Name,Last Name,Phone,Event,Groups,Assigned,Guest Category,Room Assigned,Car Numbers,Registered At,Raw Email Field\n';
    let missingCsvContent = missingCsvHeader;

    for (const user of analysis.missingEmails) {
        const profile = user.profile || {};
        const row = [
            user.id,
            `"${extractFullName(profile)}"`,
            `"${profile.firstName || ''}"`,
            `"${profile.lastName || ''}"`,
            `"${profile.phone || ''}"`,
            `"${user.eventName || ''}"`,
            `"${user.groupNames?.join(', ') || ''}"`,
            user.assigned ? 'Yes' : 'No',
            `"${user.guestCategory || ''}"`,
            user.roomAssignments && user.roomAssignments.length > 0 ? 'Yes' : 'No',
            `"${user.carNumbers?.join(', ') || ''}"`,
            user.registeredAt.toISOString().split('T')[0],
            `"${profile.email || '(no email field)'}"`,
        ].join(',');
        missingCsvContent += row + '\n';
    }

    fs.writeFileSync(missingCsvPath, missingCsvContent);
    console.log(`✅ Missing emails CSV saved to: ${missingCsvPath}`);
}

/**
 * Main execution function
 */
async function main() {
    const eventId = process.argv[2]; // Optional: specific event ID
    const outputFormat = process.argv[3] || 'excel'; // 'excel' or 'csv'
    const outputDir = process.argv[4] || './reports';

    try {
        console.log('🚀 Starting user profile analysis...');
        console.log(`🎯 Event ID: ${eventId || 'All events'}`);
        console.log(`📊 Output format: ${outputFormat}`);
        console.log(`📁 Output directory: ${outputDir}`);
        console.log('');

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log(`📁 Created output directory: ${outputDir}`);
        }

        // Get all users
        const users = await getAllUsers(eventId);

        if (users.length === 0) {
            console.log('❌ No users found');
            return;
        }

        // Analyze profiles
        const analysis = analyzeProfiles(users);

        // Generate timestamp for filenames
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];

        if (outputFormat === 'excel') {
            const excelPath = path.join(outputDir, `user-profile-analysis-${timestamp}.xlsx`);
            await createExcelReport(analysis, excelPath);
        } else if (outputFormat === 'csv') {
            await createCSVReports(analysis, outputDir);
        } else {
            console.log('❌ Invalid output format. Use "excel" or "csv"');
            return;
        }

        // Print final summary
        console.log('\n' + '='.repeat(60));
        console.log('📋 FINAL ANALYSIS SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Users: ${analysis.stats.totalUsers}`);
        console.log(`✅ Unique Good Profiles: ${analysis.stats.uniqueGoodProfiles} (${((analysis.stats.uniqueGoodProfiles / analysis.stats.totalUsers) * 100).toFixed(1)}%)`);
        console.log(`🔄 Duplicate Email Users: ${analysis.stats.duplicateEmailUsers} in ${analysis.duplicateEmailGroups.length} groups (${((analysis.stats.duplicateEmailUsers / analysis.stats.totalUsers) * 100).toFixed(1)}%)`);
        console.log(`❌ Missing Email Users: ${analysis.stats.missingEmailUsers} (${((analysis.stats.missingEmailUsers / analysis.stats.totalUsers) * 100).toFixed(1)}%)`);

        if (analysis.duplicateEmailGroups.length > 0) {
            console.log('\n🔄 Top duplicate email groups:');
            analysis.duplicateEmailGroups.slice(0, 5).forEach((group, index) => {
                console.log(`   ${index + 1}. ${group.email}: ${group.count} users`);
            });
        }

        console.log('\n🎉 Analysis completed successfully!');

    } catch (error) {
        console.error('💥 Analysis failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run if called directly
if (import.meta.main) {
    await main();
}

// CLI usage help
if (process.argv.length === 2 || process.argv[2] === '--help') {
    console.log(`
🔍 USER PROFILE ANALYSIS SCRIPT

This script analyzes user profiles to find unique profiles, duplicate emails, and missing emails.

Usage: bun scripts/analyze-user-profiles.ts [eventId] [format] [outputDir]

Arguments:
  [eventId]   Optional: Specific event ID to analyze (default: all events)
  [format]    Optional: Output format - "excel" or "csv" (default: excel)
  [outputDir] Optional: Output directory (default: ./reports)

Examples:
  bun scripts/analyze-user-profiles.ts
  bun scripts/analyze-user-profiles.ts 68c2cd941de2da411f2a2f98
  bun scripts/analyze-user-profiles.ts 68c2cd941de2da411f2a2f98 excel ./analysis-reports
  bun scripts/analyze-user-profiles.ts "" csv ./csv-output

Output:
  - Excel format: Single .xlsx file with multiple sheets
  - CSV format: Multiple .csv files (one per category)

Categories analyzed:
  ✅ Unique Profiles (Good): Users with unique emails - safe to access
  🔄 Duplicate Emails: Users sharing the same email address
  ❌ Missing Emails: Users without valid email addresses
`);
}
