import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_SEARCH_MAX: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_AI_MAX: z.coerce.number().int().min(1).default(10),
});

export type EnvVars = z.infer<typeof envSchema>;
