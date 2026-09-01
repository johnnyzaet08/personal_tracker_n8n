import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { InternalApiGuard } from '../common/internal-api.guard';
import { PrismaService } from '../database/prisma.service';

@ApiTags('internal')
@Controller('internal/v1/health')
@UseGuards(InternalApiGuard)
@ApiHeader({ name: 'x-internal-api-key', required: true })
export class InternalHealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('database')
  async database() {
    await this.prisma.client.$queryRaw`SELECT 1`;
    return {
      status: 'healthy',
      path: 'n8n -> api -> postgresql',
      api: 'reachable',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
