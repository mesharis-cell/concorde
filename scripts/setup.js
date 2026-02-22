#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function envOrDefault(name, fallback) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

async function ensureDemoSuperAdmin() {
  const email = envOrDefault('DEMO_SUPERADMIN_EMAIL', 'demo.owner@savvio.digital');
  const password = envOrDefault('DEMO_SUPERADMIN_PASSWORD', 'DemoOwner123!');
  const firstName = envOrDefault('DEMO_SUPERADMIN_FIRST_NAME', 'Demo');
  const lastName = envOrDefault('DEMO_SUPERADMIN_LAST_NAME', 'Owner');

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: {
      firstName,
      lastName,
      passwordHash,
      role: 'SUPER',
      active: true,
    },
    create: {
      email,
      firstName,
      lastName,
      passwordHash,
      role: 'SUPER',
      active: true,
    },
  });

  console.log('✅ Demo super admin is ready');
  console.log(`📧 ${admin.email}`);
}

function runDemoSeed() {
  const result = spawnSync('bun', ['scripts/seed-demo.ts'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error('Demo seed script failed');
  }
}

async function setup() {
  console.log('🚀 Setting up Savvio Concorde demo environment...');

  try {
    await ensureDemoSuperAdmin();
    runDemoSeed();
    console.log('✅ Demo setup completed');
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

setup();
