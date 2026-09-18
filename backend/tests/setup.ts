process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-16-chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-16-chars';
process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';
process.env.DATABASE_URL = '';
process.env.REDIS_URL = '';
// Isolate tests from host-shell/.env leaks: no AI provider env should reach
// provider-selection logic (CI has none anyway; local machines may).
delete process.env.AI_SERVICE_URL;
delete process.env.AI_TUTOR_PROVIDER;
delete process.env.AI_TUTOR_API_KEY;
delete process.env.AI_TUTOR_CHAT_MODEL;
delete process.env.AI_TUTOR_BASE_URL;
delete process.env.LLM_PROVIDER;
delete process.env.LLM_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.EMBEDDING_API_KEY;
delete process.env.EMBEDDING_MODEL;
delete process.env.EMBEDDING_BASE_URL;
// Storage must default to the local backend in tests even when the host
// shell carries real MinIO/S3 credentials.
delete process.env.STORAGE_ENDPOINT;
delete process.env.STORAGE_PUBLIC_ENDPOINT;
delete process.env.STORAGE_ACCESS_KEY;
delete process.env.STORAGE_SECRET_KEY;
