import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
  log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  // Prisma v6 optimizations
  omit: {
    // Global omit for sensitive fields - can be overridden per query
    admin: {
      passwordHash: true,
    },
  },
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});