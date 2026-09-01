import type { Request } from 'express';

export interface TrackerRequest extends Request {
  tenantId: string;
}
