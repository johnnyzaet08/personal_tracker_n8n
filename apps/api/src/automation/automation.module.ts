import { Module } from '@nestjs/common';
import { InternalApiGuard } from '../common/internal-api.guard';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { InternalHealthController } from './internal-health.controller';

@Module({
  controllers: [AutomationController, InternalHealthController],
  providers: [AutomationService, InternalApiGuard],
})
export class AutomationModule {}
