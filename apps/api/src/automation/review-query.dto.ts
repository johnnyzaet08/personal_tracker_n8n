import { IsIn, IsOptional } from 'class-validator';
import { ListQueryDto } from '../finance/list-query.dto';

export class ReviewQueueQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(['pending', 'in_review', 'resolved', 'dismissed'])
  status?: 'pending' | 'in_review' | 'resolved' | 'dismissed';
}
