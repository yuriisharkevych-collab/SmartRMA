import { Request } from 'express';

export interface PlatformAdminPrincipal {
  platformAdminId: string;
  email: string;
}

export interface PlatformAuthenticatedRequest extends Request {
  platformAdmin: PlatformAdminPrincipal;
}
