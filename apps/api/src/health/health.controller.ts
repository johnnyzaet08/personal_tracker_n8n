import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Process liveness' })
  liveness(): object {
    return { status: 'healthy', service: 'api', timestamp: new Date().toISOString() };
  }

  @Get('database')
  @ApiOperation({ summary: 'Database readiness' })
  async database(): Promise<object> {
    await this.prisma.client.$queryRaw`SELECT 1`;
    return { status: 'healthy', database: 'connected', timestamp: new Date().toISOString() };
  }
}
