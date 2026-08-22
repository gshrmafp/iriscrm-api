import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import pinoHttp from 'pino-http';
import { logger } from './core/logger/logger';
import { swaggerSpec } from './core/http/swagger';
import { renderStatusPage } from './core/http/statusPage';
import { errorMiddleware, notFoundMiddleware } from './core/http/errorMiddleware';
import { identityRouter } from './modules/identity/routes';
import { catalogRouter } from './modules/sales/catalog/routes';
import { leadRouter } from './modules/sales/leads/routes';
import { opportunityRouter } from './modules/sales/opportunities/routes';
import { customerRouter } from './modules/customers/routes';
import { quotationRouter } from './modules/sales/quotations/routes';
import { salesQueryRouter } from './modules/sales/queries/routes';
import { departmentRouter } from './modules/departments/routes';
import { notificationRouter } from './modules/notifications/routes';
import { picklistRouter } from './modules/picklists/routes';
import { geoRouter } from './modules/geo/routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get('/', (_req, res) => res.type('html').send(renderStatusPage()));
  app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

  const v1 = express.Router();
  v1.use(identityRouter);
  v1.use(catalogRouter);
  v1.use(leadRouter);
  v1.use(opportunityRouter);
  v1.use(customerRouter);
  v1.use(quotationRouter);
  v1.use(salesQueryRouter);
  v1.use(departmentRouter);
  v1.use(notificationRouter);
  v1.use(picklistRouter);
  v1.use(geoRouter);
  app.use('/api/v1', v1);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
