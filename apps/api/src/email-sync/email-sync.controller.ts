import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  emailSourceConfigurationInputSchema,
  emailSourceConfigurationPatchSchema,
  emailSyncPreviewRequestSchema,
  emailSyncSelectionRequestSchema,
  type EmailSourceConfigurationInput,
  type EmailSourceConfigurationPatch,
  type EmailSyncPreviewRequest,
  type EmailSyncSelectionRequest,
} from '@tracker/contracts';
import { z } from 'zod';
import { InternalApiGuard } from '../common/internal-api.guard';
import type { TrackerRequest } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ListQueryDto } from '../finance/list-query.dto';
import { EmailSyncService } from './email-sync.service';
import { EmailRunsQueryDto } from './email-runs-query.dto';

const tenantQuery = z.strictObject({ tenantId: z.uuid() });
const matchQuery = tenantQuery.extend({
  sender: z.email().max(320),
  mode: z.enum(['automatic', 'manual']).default('automatic'),
});
const message = z.record(z.string(), z.unknown());
const automaticBody = z.strictObject({ tenantId: z.uuid(), message });
const messagesBody = z.strictObject({ tenantId: z.uuid(), messages: z.array(message).max(10) });
const progressBody = z.strictObject({
  tenantId: z.uuid(),
  status: z.enum(['fetching', 'processing']),
});
const completionBody = z.strictObject({
  tenantId: z.uuid(),
  errorCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,63}$/u)
    .optional(),
});
const cancellationBody = z.strictObject({ schemaVersion: z.literal(1).default(1) });
const selectionExample = {
  schemaVersion: 1,
  candidateIds: ['00000000-0000-4000-8000-000000000001'],
};

@ApiTags('email sources and reconciliation')
@ApiHeader({ name: 'x-correlation-id', required: false })
@Controller('api/v1')
export class EmailSyncController {
  constructor(private readonly email: EmailSyncService) {}

  @Get('email-sources/options')
  @ApiOperation({
    summary:
      'Tenant Gmail connections, financial accounts, supported adapters and current local period',
  })
  options(@Req() request: TrackerRequest) {
    return this.email.options(request.tenantId);
  }

  @Get('email-sources')
  @ApiOperation({ summary: 'List configured sender sources for the tenant' })
  sources(@Req() request: TrackerRequest, @Query() query: ListQueryDto) {
    return this.email.listSources(request.tenantId, query);
  }

  @Post('email-sources')
  @ApiOperation({ summary: 'Configure an exact allowed Gmail sender' })
  @ApiBody({ schema: z.toJSONSchema(emailSourceConfigurationInputSchema) as never })
  create(
    @Req() request: TrackerRequest,
    @Body(new ZodValidationPipe(emailSourceConfigurationInputSchema))
    body: EmailSourceConfigurationInput,
  ) {
    return this.email.createSource(request.tenantId, body);
  }

  @Patch('email-sources/:id')
  @ApiOperation({ summary: 'Edit, enable or disable a tenant email source' })
  @ApiBody({ schema: z.toJSONSchema(emailSourceConfigurationPatchSchema) as never })
  patch(
    @Req() request: TrackerRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(emailSourceConfigurationPatchSchema))
    body: EmailSourceConfigurationPatch,
  ) {
    return this.email.patchSource(request.tenantId, id, body);
  }

  @Post('email-sources/:id/preview')
  @HttpCode(202)
  @ApiAcceptedResponse({ description: 'Durable asynchronous preview run; poll the run endpoint' })
  @ApiOperation({
    summary: 'Search the last ten unread messages of one sender for the current Costa Rica month',
  })
  @ApiBody({ schema: z.toJSONSchema(emailSyncPreviewRequestSchema) as never })
  preview(
    @Req() request: TrackerRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(emailSyncPreviewRequestSchema)) body: EmailSyncPreviewRequest,
  ) {
    return this.email.preview(
      request.tenantId,
      id,
      body,
      request.header('x-correlation-id') ?? crypto.randomUUID(),
    );
  }

  @Post('email-sync-previews/:id/process')
  @HttpCode(202)
  @ApiAcceptedResponse({ description: 'Selection recorded; poll the synchronization run' })
  @ApiOperation({
    summary: 'Process only eligible explicitly selected messages after fetching them again',
  })
  @ApiBody({
    schema: z.toJSONSchema(emailSyncSelectionRequestSchema) as never,
    examples: { selected: { value: selectionExample } },
  })
  select(
    @Req() request: TrackerRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(emailSyncSelectionRequestSchema)) body: EmailSyncSelectionRequest,
  ) {
    return this.email.select(request.tenantId, id, body.candidateIds);
  }

  @Get('email-sync-runs')
  @ApiOperation({
    summary: 'List asynchronous runs for this tenant, optionally filtered by sourceId',
  })
  runs(@Req() request: TrackerRequest, @Query() query: EmailRunsQueryDto) {
    return this.email.listRuns(request.tenantId, query, query.sourceId);
  }

  @Get('email-sync-runs/:id')
  @ApiOperation({ summary: 'Read preview, progress and sanitized results for a tenant run' })
  run(@Req() request: TrackerRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.email.run(request.tenantId, id);
  }

  @Post('email-sync-runs/:id/cancel')
  @ApiOperation({
    summary: 'Discard a preview awaiting selection and release the source synchronization lock',
  })
  @ApiBody({ schema: z.toJSONSchema(cancellationBody) as never })
  cancel(
    @Req() request: TrackerRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancellationBody)) body: z.infer<typeof cancellationBody>,
  ) {
    void body;
    return this.email.cancel(request.tenantId, id);
  }
}

@ApiTags('internal email reconciliation')
@ApiHeader({ name: 'x-internal-api-key', required: true })
@ApiHeader({ name: 'x-correlation-id', required: false })
@UseGuards(InternalApiGuard)
@Controller('internal/v1')
export class InternalEmailSyncController {
  constructor(private readonly email: EmailSyncService) {}

  @Get('email-sources/match')
  @ApiOperation({
    summary: 'Match an exact sender against active tenant configuration before ingestion',
  })
  match(@Query(new ZodValidationPipe(matchQuery)) query: z.infer<typeof matchQuery>) {
    return this.email.match(query.tenantId, query.sender, query.mode);
  }

  @Post('email-ingestion/automatic')
  @ApiOperation({
    summary:
      'Transiently normalize Gmail MIME, match source, parse and reconcile without retaining message content',
  })
  @ApiBody({ schema: z.toJSONSchema(automaticBody) as never })
  automatic(@Body(new ZodValidationPipe(automaticBody)) body: z.infer<typeof automaticBody>) {
    return this.email.automatic(body.tenantId, body.message);
  }

  @Get('email-sync-runs/:id/context')
  @ApiOperation({
    summary:
      'Authenticate n8n and load authoritative sender query or explicitly selected message IDs',
  })
  context(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(tenantQuery)) query: z.infer<typeof tenantQuery>,
  ) {
    return this.email.context(query.tenantId, id);
  }

  @Post('email-sync-runs/:id/progress')
  @ApiOperation({ summary: 'Record an allowed progress transition for the tenant run' })
  @ApiBody({ schema: z.toJSONSchema(progressBody) as never })
  progress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(progressBody)) body: z.infer<typeof progressBody>,
  ) {
    return this.email.progress(body.tenantId, id, body.status);
  }

  @Post('email-sync-runs/:id/candidates')
  @ApiOperation({
    summary:
      'Parse at most ten unread messages into a preview without inserting observations or transactions',
  })
  @ApiBody({ schema: z.toJSONSchema(messagesBody) as never })
  candidates(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(messagesBody)) body: z.infer<typeof messagesBody>,
  ) {
    return this.email.candidates(body.tenantId, id, body.messages);
  }

  @Post('email-sync-runs/:id/process-message')
  @ApiOperation({
    summary: 'Reconcile a refetched message only when selected for the current tenant run',
  })
  @ApiBody({ schema: z.toJSONSchema(automaticBody) as never })
  process(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(automaticBody)) body: z.infer<typeof automaticBody>,
  ) {
    return this.email.processMessage(body.tenantId, id, body.message);
  }

  @Post('email-sync-runs/:id/complete')
  @ApiOperation({
    summary: 'Compute run counters from persisted message results and record terminal state',
  })
  @ApiBody({ schema: z.toJSONSchema(completionBody) as never })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(completionBody)) body: z.infer<typeof completionBody>,
  ) {
    return this.email.complete(body.tenantId, id, body.errorCode);
  }
}
