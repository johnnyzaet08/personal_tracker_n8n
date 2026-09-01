import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { TrackerRequest } from '../common/request-context';
import { ListQueryDto } from '../finance/list-query.dto';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@Controller('api/v1/integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list(@Req() request: TrackerRequest, @Query() query: ListQueryDto): Promise<object> {
    return this.integrations.list(request.tenantId, query);
  }

  @Get('status')
  status(@Req() request: TrackerRequest) {
    return this.integrations.status(request.tenantId);
  }
}
