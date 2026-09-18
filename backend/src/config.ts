import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  COOKIE_SECURE: z.string().default('false'),
  DATABASE_URL: z.string().default(''),
  REDIS_URL: z.string().default(''),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  STORAGE_ENDPOINT: z.string().default(''),
  STORAGE_PUBLIC_ENDPOINT: z.string().default(''),
  STORAGE_REGION: z.string().default(''),
  STORAGE_ACCESS_KEY: z.string().default(''),
  STORAGE_SECRET_KEY: z.string().default(''),
  STORAGE_BUCKET_VIDEOS: z.string().default(''),
  STORAGE_BUCKET_MATERIALS: z.string().default(''),
  STORAGE_BUCKET_SUBMISSIONS: z.string().default(''),
  STORAGE_BUCKET_CERTIFICATES: z.string().default(''),
  STORAGE_FORCE_PATH_STYLE: z.string().default('true'),
  UPLOAD_MAX_MB: z.coerce.number().int().min(1).max(500).default(25),
  CERT_STORAGE_DIR: z.string().default(''),
  AI_SERVICE_URL: z.string().default(''),
  AI_SERVICE_TOKEN: z.string().default(''),
  LLM_PROVIDER: z.string().default('anthropic'),
  LLM_API_KEY: z.string().default(''),
  LLM_BASE_URL: z.string().default(''),
  LLM_CHAT_MODEL: z.string().default('claude-3-5-sonnet-latest'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  GEMINI_API_KEY: z.string().default(''),
  EMBEDDING_MODEL: z.string().default(''),
  EMBEDDING_API_KEY: z.string().default(''),
  EMBEDDING_BASE_URL: z.string().default(''),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(1536),
  RAG_TOP_K: z.coerce.number().int().positive().default(5),
  EMAIL_PROVIDER: z.string().default(''),
  EMAIL_FROM: z.string().default(''),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SENDGRID_API_KEY: z.string().default(''),
});

export type AppConfig = z.infer<typeof envSchema> & {
  isProduction: boolean;
};

let cached: AppConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return { ...parsed.data, isProduction: parsed.data.NODE_ENV === 'production' };
}

export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

export function resetConfig(): void {
  cached = undefined;
}
