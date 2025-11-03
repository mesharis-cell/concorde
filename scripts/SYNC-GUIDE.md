# 🔄 Incremental Sync Guide - Singapore Grand Prix 2025

## 📋 Overview

This guide covers nightly syncing of Google Sheet data to production MongoDB without losing manually corrected data.

---

## 🚀 Quick Start (3 Steps)

### Step 1: Review Email Preservation Window
```bash
cd backend
bun scripts/generate-compass-queries.ts
```

**This outputs MongoDB Compass queries. Use them to:**
- See which users were modified in last 48 hours (emails will be PRESERVED)
- See which users will have emails updated from CSV
- Review counts by time window

**Copy queries into MongoDB Compass and review before proceeding.**

---

### Step 2: Dry Run (Safe Mode - NO changes)
```bash
bun scripts/incremental-sync-v1.ts
```

**What happens:**
- ✅ Loads CSV from `.project/reports/data/prod.csv`
- ✅ Matches users by firstName + lastName
- ✅ Detects all changes (profile, accommodation, activities, etc.)
- ✅ Generates comprehensive Excel report
- ❌ Makes NO database changes

**Output:** Excel report in `.project/reports/output/sync-report-YYYY-MM-DD-TIMESTAMP.xlsx`

---

### Step 3: Review Report & Go Live

**Review the Excel report - 6 sheets:**

1. **📊 Summary** - Overall stats (new users, updates, preserved emails)
2. **➕ New Users** - Added guests with activity assignments
3. **🔄 Updated Users** - Existing users with detected changes
4. **🎯 Activity Changes** - Detailed before/after activity assignments
   - Green = ADDED to activity
   - Red = REMOVED from activity
5. **🔒 Emails Preserved** - Manually corrected emails kept (not overwritten)
6. **✅ Unchanged Users** - Reference list

**If report looks good, run LIVE sync:**
```bash
bun scripts/incremental-sync-v1.ts --live
```

---

## 🔒 What's Protected

### NEVER Touched:
- ✅ Activity content (descriptions, images, timing tables)
- ✅ Past activity attendance (Sept 30, Oct 1)
- ✅ Manually corrected emails (within 48 hours)

### ALWAYS Updated:
- 🔄 Accommodation (check-in, check-out, room type)
- 🔄 Flight details
- 🔄 Profile fields (phone, company, job title)
- 🔄 Requirements (dietary, medical, accessibility)
- 🔄 Car assignments
- 🔄 Future activity assignments (Oct 2+)

### CONDITIONAL:
- ⚠️ Email (only if unchanged for >48 hours)

---

## 📊 Reporting Features

### For New Users:
- Full list with emails, market, room type
- **Activity assignments included**
- Count of activities assigned per user

### For Activity Changes:
- User name
- Activity title
- Change type (ADDED/REMOVED)
- CSV value (Y/N or venue name)
- Previous state (what was in DB)
- Reason for change
- Activity date

### Example Activity Change Report:
```
User: John Smith
Activity: Evening Bar - Manhattan Bar
Change Type: ADDED
CSV Value: Manhattan Bar
Previous State: Not assigned
Reason: CSV indicates attendance
Date: Oct 3
```

---

## ⚙️ Configuration

### Email Preservation Window
**Current:** 48 hours

**To change:** Edit line 19 in `incremental-sync-v1.ts`
```typescript
const EMAIL_PRESERVATION_WINDOW_HOURS = 48; // Change this
```

### Activity Cutoff Date
**Current:** Oct 2, 2025 00:00 UTC (only syncs future activities)

**To change:** Edit line 20
```typescript
const CUTOFF_DATE = '2025-10-02T00:00:00Z'; // Change this
```

---

## 🎯 Activity Sync Logic

### For Future Activities (Oct 2+):

**Standard Activities (Y/N columns):**
- CSV has "Y" → User should attend
- CSV has "N" or empty → User excluded (if in group)

**Evening Bars (Venue columns):**
- CSV has venue name → User assigned to that specific bar
- CSV empty → User excluded from evening bar activities

### Smart Assignment:
1. Reads CSV attendance for each user
2. Determines which groups need access to activity
3. Assigns activity to those groups
4. Creates individual exclusions for group members who don't attend

---

## 🔍 Matching Logic

**Primary:** firstName + lastName match (case-insensitive)
```
CSV: "John Smith" matches DB: "John Smith" ✅
```

**Why not email?**
Emails were manually corrected in production, so they may differ from Google Sheet.

---

## 📧 Email Sync Strategy Explained

### Scenario 1: Recent Manual Fix (Within 48hrs)
```
DB Email: john.smith@correct.com (updated 12 hours ago)
CSV Email: johnsmith@wrong.com

Result: PRESERVED - DB email kept
Report: Listed in "Emails Preserved" sheet
```

### Scenario 2: Old Data (>48 hours)
```
DB Email: johnsmith@old.com (updated 3 days ago)
CSV Email: john.smith@correct.com

Result: UPDATED - CSV email synced
Report: Listed in "Updated Users" sheet
```

### Scenario 3: Never Changed
```
DB Email: same@email.com
CSV Email: same@email.com

Result: NO CHANGE
Report: Listed in "Unchanged Users" sheet
```

---

## ⚠️ Important Notes

### Before Running:
1. ✅ Backup production database (just in case)
2. ✅ Ensure CSV is at `.project/reports/data/prod.csv`
3. ✅ Review MongoDB Compass queries for email window
4. ✅ Run dry run first ALWAYS
5. ✅ Review Excel report thoroughly

### After Running:
1. ✅ Check sync summary statistics
2. ✅ Review Excel report (all 6 sheets)
3. ✅ Verify critical users in MongoDB Compass
4. ✅ Test login for newly added users

---

## 🆘 Troubleshooting

### "User not found" errors
- CSV firstName/lastName don't match DB exactly
- Check for typos, extra spaces, case differences

### Email preservation not working
- Check user's `updatedAt` timestamp in MongoDB
- Adjust `EMAIL_PRESERVATION_WINDOW_HOURS` if needed

### Activity assignments not updating
- Check `CUTOFF_DATE` - only future activities sync
- Verify activity exists in database with correct title

### New users not appearing
- Check if firstName + lastName already exist in DB
- Review "Skipped" section in console output

---

## 🔄 Daily Workflow

**Recommended Schedule:**
```
1. Export Google Sheet to CSV (save as prod.csv)
2. Run: bun scripts/generate-compass-queries.ts
3. Review email preservation queries in MongoDB Compass
4. Run: bun scripts/incremental-sync-v1.ts (dry run)
5. Review Excel report
6. Run: bun scripts/incremental-sync-v1.ts --live
7. Verify critical changes in admin dashboard
```

---

## 📞 Support

**Created by:** Claude (AI Assistant)
**Date:** October 1, 2025
**For:** Singapore Grand Prix 2025 Event Management

**Questions?** Check the code comments in `incremental-sync-v1.ts` for detailed implementation notes.

