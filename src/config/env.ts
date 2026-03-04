import { z } from 'zod';
import 'dotenv/config';

const boolFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}, z.boolean());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('7d'),
  MAGIC_LINK_EXPIRES_IN: z.string().default('24h'),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  APP_URL: z.string().url().default('https://demo.savvio.digital'),
  FRONTEND_URL: z.string().url().optional(),

  EMAIL_PROVIDER: z.enum(['ses', 'resend']).default('resend'),
  // Preferred sender identity keys
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().optional(),
  // Legacy sender identity keys (kept for backward compatibility)
  SES_FROM_EMAIL: z.string().email().optional(),
  SES_FROM_NAME: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),

  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_BUCKET: z.string().optional(),

  // [V1] Optional channel gating
  TWILIO_ENABLED: boolFromEnv.default(false),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),

  // [V1] PassKit contract (Task 2.6.1)
  PASSKIT_API_KEY: z.string().optional(),
  PASSKIT_API_SECRET: z.string().optional(),
  PASSKIT_API_BASE: z.string().url().default('https://api.pub1.passkit.io'),
  PASSKIT_PRODUCTION_ID: z.string().optional(),
  PASSKIT_TEMPLATE_ID: z.string().optional(),
  PASSKIT_ISSUER_ID: z.string().optional(),
  PASSKIT_BASE_URL: z.string().url().default('https://api.passkit.com'),
  WALLET_PASS_TTL_HOURS: z.coerce.number().int().positive().default(24),

  MONITORING_EMAIL: z.string().email().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  throw new Error('Invalid environment variables');
}

const envData = parsed.data;
const errors: string[] = [];

if (envData.EMAIL_PROVIDER === 'resend' && !envData.RESEND_API_KEY) {
  errors.push('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
}

if (envData.EMAIL_PROVIDER === 'ses') {
  if (!envData.AWS_ACCESS_KEY_ID) errors.push('AWS_ACCESS_KEY_ID is required for SES mode');
  if (!envData.AWS_SECRET_ACCESS_KEY) errors.push('AWS_SECRET_ACCESS_KEY is required for SES mode');
}

if (envData.TWILIO_ENABLED) {
  if (!envData.TWILIO_ACCOUNT_SID) errors.push('TWILIO_ACCOUNT_SID is required when TWILIO_ENABLED=true');
  if (!envData.TWILIO_AUTH_TOKEN) errors.push('TWILIO_AUTH_TOKEN is required when TWILIO_ENABLED=true');
  if (!envData.TWILIO_WHATSAPP_FROM) errors.push('TWILIO_WHATSAPP_FROM is required when TWILIO_ENABLED=true');
}

if (errors.length > 0) {
  console.error('❌ Invalid environment variables:', errors);
  throw new Error('Invalid environment variables');
}

export const env = envData;

export type Env = typeof env;
