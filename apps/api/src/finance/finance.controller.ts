import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TrackerRequest } from '../common/request-context';
import { FinanceService } from './finance.service';
import { ListQueryDto, TransactionQueryDto } from './list-query.dto';
import {
  materializeObligationsSchema,
  obligationPaymentSchema,
  categoryInputSchema,
  categoryAssignmentSchema,
  monthlyBudgetInputSchema,
  type CategoryAssignment,
  type CategoryInput,
  type MonthlyBudgetInput,
  obligationUpdateSchema,
  recurringPaymentInputSchema,
  recurringPaymentUpdateSchema,
  type MaterializeObligations,
  type ObligationPayment,
  type RecurringPaymentInput,
  type RecurringPaymentUpdate,
} from '@tracker/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@ApiTags('finance')
@Controller('api/v1')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('dashboard/summary')
  @ApiOperation({ summary: 'Financial summary for the selected period' })
  summary(@Req() request: TrackerRequest, @Query() query: TransactionQueryDto) {
    return this.finance.summary(request.tenantId, query);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Paginated and filterable transactions' })
  transactions(@Req() request: TrackerRequest, @Query() query: TransactionQueryDto) {
    return this.finance.transactions(request.tenantId, query);
  }

  @Get('categories')
  categories(@Req() request: TrackerRequest, @Query() query: ListQueryDto) {
    return this.finance.categories(request.tenantId, query);
  }

  @Post('categories')
  createCategory(
    @Req() request: TrackerRequest,
    @Body(new ZodValidationPipe(categoryInputSchema)) body: CategoryInput,
  ) {
    return this.finance.createCategory(request.tenantId, body);
  }

  @Get('planning/summary')
  planning(
    @Req() request: TrackerRequest,
    @Query('period') period: string,
    @Query('currency') currency: string,
  ) {
    return this.finance.planning(request.tenantId, period, currency?.toUpperCase());
  }

  @Post('monthly-budgets')
  saveBudget(
    @Req() request: TrackerRequest,
    @Body(new ZodValidationPipe(monthlyBudgetInputSchema)) body: MonthlyBudgetInput,
  ) {
    return this.finance.saveBudget(request.tenantId, body);
  }

  @Patch('transactions/:id/category')
  assignCategory(
    @Req() request: TrackerRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(categoryAssignmentSchema)) body: CategoryAssignment,
  ) {
    return this.finance.assignCategory(request.tenantId, id, body.categoryId);
  }

  @Get('recurring-payments')
  recurring(@Req() request: TrackerRequest, @Query() query: ListQueryDto) {
    return this.finance.recurring(request.tenantId, query);
  }

  @Get('recurring-obligations')
  obligations(@Req() request: TrackerRequest, @Query('period') period?: string) {
    return this.finance.obligations(request.tenantId, period);
  }

  @Post('recurring-payments')
  createRecurring(
    @Req() request: TrackerRequest,
    @Body(new ZodValidationPipe(recurringPaymentInputSchema)) body: RecurringPaymentInput,
  ) {
    return this.finance.createRecurring(request.tenantId, body);
  }

  @Patch('recurring-payments/:id')
  updateRecurring(
    @Req() request: TrackerRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recurringPaymentUpdateSchema)) body: RecurringPaymentUpdate,
  ) {
    return this.finance.updateRecurring(request.tenantId, id, body);
  }

  @Post('recurring-obligations/materialize')
  materialize(
    @Req() request: TrackerRequest,
    @Body(new ZodValidationPipe(materializeObligationsSchema)) body: MaterializeObligations,
  ) {
    return this.finance.materialize(request.tenantId, body.period);
  }

  @Patch('recurring-obligations/:id')
  updateObligation(
    @Req() request: TrackerRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(obligationUpdateSchema)) body: { dueAt: string },
  ) {
    return this.finance.updateObligation(request.tenantId, id, body.dueAt);
  }

  @Post('recurring-obligations/:id/pay')
  payObligation(
    @Req() request: TrackerRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(obligationPaymentSchema)) body: ObligationPayment,
  ) {
    return this.finance.payObligation(request.tenantId, id, body);
  }
}
