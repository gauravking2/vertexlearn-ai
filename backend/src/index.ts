import 'dotenv/config';
import { createApp } from './app';
import { getConfig } from './config';
import { logger } from './logger';

const config = getConfig();
const app = createApp();

// Render injects PORT; API_PORT stays canonical for local/Compose.
// Explicit 0.0.0.0 bind is required on Render (loopback-only is unreachable).
const port = config.PORT ?? config.API_PORT;

app.listen(port, '0.0.0.0', () => {
  logger.info({ port }, 'backend listening');
});
