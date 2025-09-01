# Event Concierge Migration System

A clean, batched migration system for MongoDB data transformations, inspired by traditional SQL migration patterns but adapted for document databases.

## 🎯 Features

- **Timestamp-based ordering** - Migrations run in chronological order
- **Batch tracking** - Group related migrations together
- **Rollback support** - Undo migrations safely
- **Status reporting** - See what's pending vs completed
- **MongoDB native operations** - Use `$runCommandRaw` for complex transformations

## 📁 Structure

```
database/
├── migrations/           # Migration files (timestamped)
├── types.ts             # TypeScript interfaces
└── README.md           # This file

scripts/
└── migrate.ts          # Migration runner
```

## 🚀 Usage

### Run Migrations

```bash
# Run all pending migrations
bun run migrate

# Alternative syntax
bun scripts/migrate.ts up
```

### Check Status

```bash
# See completed vs pending migrations
bun run migrate:status
```

### Rollback

```bash
# Rollback last migration
bun run migrate:rollback

# Rollback multiple migrations
bun scripts/migrate.ts rollback 3
```

## 📝 Creating Migrations

### 1. Generate Migration File (Recommended)

Use the migration generator to create timestamped files automatically:

```bash
# Generate migration with automatic timestamp
bun run make:migration "Add user preferences"
bun run make:migration "Update activity schema"
bun run make:migration "Rename old field to new field"

# Results in files like:
# 2025_08_31_035046_add_user_preferences.ts
# 2025_08_31_035102_update_activity_schema.ts
```

### 2. Manual Creation (Alternative)

Use timestamp format: `YYYY_MM_DD_HHMMSS_description.ts`

```bash
# Example filename:
2025_01_31_140000_add_user_preferences.ts
```

### 3. Migration Template

```typescript
import { prisma } from '../../src/config/database.js';
import type { MigrationAction } from '../types.js';

const migration: MigrationAction = {
  async migrate() {
    // Forward migration logic
    await prisma.user.updateMany({
      where: { preferences: null },
      data: { preferences: {} },
    });

    console.log('✅ Added preferences to users');
  },

  async rollback() {
    // Reverse migration logic
    await prisma.$runCommandRaw({
      update: 'users',
      updates: [
        {
          q: {},
          u: { $unset: { preferences: '' } },
          multi: true,
        },
      ],
    });

    console.log('✅ Removed preferences from users');
  },
};

export default migration;
```

## 🛠️ Common Patterns

### Add Optional Field

```typescript
// Usually no migration needed - schema handles this
await prisma.model.updateMany({
  where: { newField: null },
  data: { newField: 'default_value' },
});
```

### Rename Field

```typescript
await prisma.$runCommandRaw({
  update: 'collection_name',
  updates: [
    {
      q: {},
      u: { $rename: { oldField: 'newField' } },
      multi: true,
    },
  ],
});
```

### Remove Field

```typescript
await prisma.$runCommandRaw({
  update: 'collection_name',
  updates: [
    {
      q: {},
      u: { $unset: { fieldToRemove: '' } },
      multi: true,
    },
  ],
});
```

### Complex Data Transformation

```typescript
const records = await prisma.model.findMany({
  where: { needsTransformation: true },
});

for (const record of records) {
  await prisma.model.update({
    where: { id: record.id },
    data: {
      transformedField: complexTransform(record.originalField),
    },
  });
}
```

## 📊 Migration Tracking

Migrations are tracked in the `migrations` collection:

```typescript
{
  id: ObjectId,
  name: "2025_01_31_140000_add_description.ts",
  batch: 1,
  runAt: ISODate("2025-01-31T14:00:00Z")
}
```

- **name**: Filename of migration
- **batch**: Incremental batch number
- **runAt**: When migration was executed

## ⚠️ Best Practices

1. **Always test rollbacks** - Ensure you can undo changes
2. **Use descriptive names** - Make migration purpose clear
3. **Handle edge cases** - Check for null/undefined values
4. **Log progress** - Add console.log statements
5. **Keep migrations small** - One logical change per migration
6. **Don't modify old migrations** - Create new ones instead

## 🔄 Workflow Integration

The migration system integrates with your existing workflow:

```bash
# 1. Update Prisma schema
# 2. Generate Prisma client
bun run prisma:generate

# 3. Push schema changes
bun run prisma:push

# 4. Run data migrations (if needed)
bun run migrate
```

## 🎯 Example: Current Description Migration

See `2025_01_31_140000_add_description_to_activities.ts` for a real example of handling optional field additions.

This migration demonstrates:

- ✅ Schema change (optional field)
- ✅ No data migration needed
- ✅ Rollback strategy using `$unset`
