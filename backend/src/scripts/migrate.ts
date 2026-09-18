import 'dotenv/config';
import { runMigrations } from '../db/migrate';
import { logger } from '../logger';

async function main(): Promise<void> {
  try {
    const applied = await runMigrations();
    logger.info({ applied }, 'migrations complete');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/DATABASE_URL is not configured|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      logger.warn({ message }, 'migrate skipped: database unreachable');
      return;
    }
    throw err;
  }
}

void main();
