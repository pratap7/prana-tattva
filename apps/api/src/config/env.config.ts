import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_PREFIX: z.string().default('api/v1'),
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres@localhost:5432/nirvana_dev?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  JWT_SECRET: z.string().default('development-jwt-secret-replace-in-production-min32chars'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().default('minioadmin'),
  S3_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
  S3_BUCKET_NAME: z.string().default('nirvana-uploads'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  RAZORPAY_KEY_ID: z.string().default('rzp_test_exampleKey'),
  RAZORPAY_KEY_SECRET: z.string().default('rzp_test_secretKey'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('rzp_webhook_secret_default'),
  HOLD_PERIOD_HOURS: z.coerce.number().default(24),
  DAILY_API_KEY: z.string().default('mock_daily_api_key'),
  DAILY_DOMAIN: z.string().default('pranatattva'),
  DAILY_WEBHOOK_SECRET: z.string().default('daily_webhook_secret_default'),
  MESSAGE_ENCRYPTION_KEY: z
    .string()
    .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  MESSAGE_ENCRYPTION_KEY_V2: z.string().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

let parsedEnv: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!parsedEnv) {
    const result = EnvSchema.safeParse(process.env);
    if (!result.success) {
      console.error('❌ Invalid environment variables:', result.error.format());
      throw new Error('Environment configuration validation failed');
    }
    parsedEnv = result.data;
  }
  return parsedEnv;
}
