import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  PlatformAdminPrincipal,
  PlatformAuthenticatedRequest,
} from '../interfaces/platform-authenticated-request.interface';

export const CurrentPlatformAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): PlatformAdminPrincipal => {
    return ctx.switchToHttp().getRequest<PlatformAuthenticatedRequest>().platformAdmin;
  },
);
