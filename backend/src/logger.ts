import pino from 'pino';

// Never log secrets: redact known secret-bearing keys at the logger level.
// PII (emails/names) is logged only where needed for operations; passwords,
// JWTs, API keys, and raw secrets must never be passed to the logger.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'vertexlearn-backend' },
  redact: {
    paths: [
      'password',
      'passwordHash',
      'password_hash',
      '*.password',
      '*.passwordHash',
      'refreshToken',
      'accessToken',
      '*.refreshToken',
      '*.accessToken',
      'token',
      '*.token',
      'authorization',
      '*.authorization',
      'apiKey',
      'api_key',
      'LLM_API_KEY',
      'SENDGRID_API_KEY',
      'SMTP_PASS',
      'STORAGE_SECRET_KEY',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'AI_SERVICE_TOKEN',
    ],
    censor: '[REDACTED]',
  },
});
