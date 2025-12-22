// src/config/validation.schema.ts
import { z } from 'zod';

const configSchema = z.object({
  PORT: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  SMTP_HOST: z.string(),
  SMTP_PORT: z.string().transform(Number),
  SMTP_USER: z.string().email(),
  SMTP_PASS: z.string(),
  MAIL_FROM: z.string().email().optional(),
  MAIL_FROM_NAME: z.string().optional(),
  EMAIL_VERIFY_EXPIRY: z.string().default('24'),

  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_CALLBACK_URL: z.string().url(),

  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),

  // REDIS_HOST: z.string().default('localhost'),
  // REDIS_PORT: z.string().transform(Number).default('6379'),
  // REDIS_PASSWORD: z.string().optional(),

  FRONTEND_URL: z.string().url().default('http://localhost:3001'),

  // CACHE_TTL: z.string().transform(Number).default('300'),
});

export type Config = z.infer<typeof configSchema>;

export default configSchema;