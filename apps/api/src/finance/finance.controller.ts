import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TrackerRequest } from '../common/request-context';
import { FinanceService } from './finance.service';
import { ListQueryDto, TransactionQueryDto } from './list-query.dto';

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

  @Get('recurring-payments')
  recurring(@Req() request: TrackerRequest, @Query() query: ListQueryDto) {
    return this.finance.recurring(request.tenantId, query);
  }
}
