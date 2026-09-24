import type { Request } from 'express';
import type { RequestUser } from './request-user';

export interface AuthenticatedRequest extends Request {
  user?: RequestUser;
}
