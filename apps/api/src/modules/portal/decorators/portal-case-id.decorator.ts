import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PortalRequest } from '../guards/portal-access.guard';

/** `@PortalCaseId() caseId: string` — dostępne wyłącznie za `PortalAccessGuard`. */
export const PortalCaseId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<PortalRequest>();
  return request.portalCaseId;
});
