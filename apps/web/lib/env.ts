import { z } from 'zod';

const webEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
});

const parsedEnv = webEnvSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env['NEXT_PUBLIC_SITE_URL'],
  NEXT_PUBLIC_API_BASE_URL: process.env['NEXT_PUBLIC_API_BASE_URL'],
});

export const webEnv = {
  appName: 'DevAtlas',
  siteUrl: parsedEnv.NEXT_PUBLIC_SITE_URL,
  apiBaseUrl: parsedEnv.NEXT_PUBLIC_API_BASE_URL,
} as const;
