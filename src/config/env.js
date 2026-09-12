import 'dotenv/config';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173'),
  ALLOW_PUBLIC_REGISTER: booleanString,
  // Demo endpoints (reset/seed, set approved IDs, add XP). Opt-in: /demo/reset wipes the database.
  DEMO_MODE: booleanString,
  // Key used to encrypt social-account passwords at rest. Falls back to a key derived from JWT_SECRET.
  CREDENTIALS_ENCRYPTION_KEY: z.string().min(16).optional(),
  // Business timezone offset used for daily/weekly periods (Asia/Dhaka = +360).
  TZ_OFFSET_MINUTES: z.coerce.number().int().min(-720).max(840).default(360),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  SEED_ADMIN_PASSWORD: z.string().min(6).default('pass123'),
  SEED_SMM_PASSWORD: z.string().min(6).default('pass123'),
  CLOUDINARY_URL: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const e = parsed.data;

export const env = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  corsOrigins: e.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  demoMode: e.DEMO_MODE,
  cloudinaryEnabled: Boolean(
    e.CLOUDINARY_URL || (e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET),
  ),
};
