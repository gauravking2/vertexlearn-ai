import 'dotenv/config';
import { createApp } from './app';
import { getConfig } from './config';
import { logger } from './logger';

const config = getConfig();
const app = createApp();

app.listen(config.API_PORT, () => {
  logger.info({ port: config.API_PORT }, 'backend listening');
});
