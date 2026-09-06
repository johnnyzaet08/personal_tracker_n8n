import { IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../finance/list-query.dto';

export class EmailRunsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  sourceId?: string;
}
