import { Injectable, UnauthorizedException, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { TrackerRequest } from './request-context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(request: TrackerRequest, _response: Response, next: NextFunction): void {
    if (
      request.path.startsWith('/health') ||
      request.path.startsWith('/docs') ||
      request.path.startsWith('/internal/')
    ) {
      next();
      return;
    }
    const header = request.header('x-tenant-id');
    const localEnabled = this.config.get<string>('LOCAL_AUTH_ENABLED') === 'true';
    const candidate =
      header ?? (localEnabled ? this.config.get<string>('LOCAL_TENANT_ID') : undefined);
    const parsed = z.uuid().safeParse(candidate);
    if (!parsed.success) {
      throw new UnauthorizedException('A valid tenant context is required');
    }
    request.tenantId = parsed.data;
    next();
  }
}
