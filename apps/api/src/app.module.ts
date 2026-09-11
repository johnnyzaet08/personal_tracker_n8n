import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { correlationId } from './common/correlation-id';
import type { IncomingMessage } from 'node:http';
import { AutomationModule } from './automation/automation.module';
import { TenantMiddleware } from './common/tenant.middleware';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { FinanceModule } from './finance/finance.module';
import { HealthModule } from './health/health.module';
import { EmailSyncModule } from './email-sync/email-sync.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (request: IncomingMessage) => {
          const incoming = request.headers['x-correlation-id'];
          return correlationId(incoming);
        },
        serializers: {
          req: (request: { id?: string; method?: string; url?: string }) => ({
            id: request.id,
            method: request.method,
            url: request.url?.split('?')[0],
          }),
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers.x-internal-api-key',
            'res.headers.set-cookie',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    DatabaseModule,
    HealthModule,
    FinanceModule,
    AutomationModule,
    IntegrationsModule,
    EmailSyncModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
