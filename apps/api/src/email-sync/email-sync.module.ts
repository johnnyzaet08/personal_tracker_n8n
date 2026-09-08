import { Module } from '@nestjs/common';
import { EmailSyncController, InternalEmailSyncController } from './email-sync.controller';
import { EmailSyncService } from './email-sync.service';
import { InternalApiGuard } from '../common/internal-api.guard';

@Module({
  controllers: [EmailSyncController, InternalEmailSyncController],
  providers: [EmailSyncService, InternalApiGuard],
  exports: [EmailSyncService],
})
export class EmailSyncModule {}
