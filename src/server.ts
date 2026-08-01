import { env } from './config/env';
import { createApp } from './app';
import { logger } from './core/logger/logger';
import { registerNotificationSubscribers } from './core/events/notificationSubscriber';

registerNotificationSubscribers();

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`IRIS backend listening on port ${env.PORT} (${env.NODE_ENV})`);
  logger.info(`Swagger docs: http://localhost:${env.PORT}/api-docs`);
});
