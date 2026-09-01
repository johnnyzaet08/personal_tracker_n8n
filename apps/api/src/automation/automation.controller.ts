import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  actionRequestSchema,
  emailSourceEventSchema,
  financialTransactionCandidateSchema,
  reviewQueueItemSchema,
  type ActionRequest,
  type FinancialTransactionCandidate,
  type ReviewQueueItem,
  type SourceEvent,
} from '@tracker/contracts';
import { InternalApiGuard } from '../common/internal-api.guard';
import type { TrackerRequest } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ListQueryDto } from '../finance/list-query.dto';
import { AutomationService } from './automation.service';

@ApiTags('automation')
@Controller()
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get('api/v1/review-queue')
  reviewQueue(@Req() request: TrackerRequest, @Query() query: ListQueryDto): Promise<object> {
    return this.automation.reviewQueue(request.tenantId, query);
  }

  @Post('internal/v1/source-events')
  @UseGuards(InternalApiGuard)
  @ApiHeader({ name: 'x-internal-api-key', required: true })
  @ApiOperation({ summary: 'Idempotently ingest a normalized source event' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['schemaVersion', 'eventId', 'tenantId', 'source', 'externalId'],
    },
  })
  sourceEvent(@Body(new ZodValidationPipe(emailSourceEventSchema)) body: SourceEvent) {
    return this.automation.ingestSourceEvent(body);
  }

  @Post('internal/v1/finance/transactions')
  @UseGuards(InternalApiGuard)
  @ApiHeader({ name: 'x-internal-api-key', required: true })
  transaction(
    @Body(new ZodValidationPipe(financialTransactionCandidateSchema))
    body: FinancialTransactionCandidate,
  ) {
    return this.automation.createTransaction(body);
  }

  @Post('internal/v1/review-queue')
  @UseGuards(InternalApiGuard)
  @ApiHeader({ name: 'x-internal-api-key', required: true })
  review(@Body(new ZodValidationPipe(reviewQueueItemSchema)) body: ReviewQueueItem) {
    return this.automation.enqueueReview(body);
  }

  @Post('internal/v1/action-runs')
  @UseGuards(InternalApiGuard)
  @ApiHeader({ name: 'x-internal-api-key', required: true })
  action(@Body(new ZodValidationPipe(actionRequestSchema)) body: ActionRequest) {
    return this.automation.recordAction(body);
  }
}
