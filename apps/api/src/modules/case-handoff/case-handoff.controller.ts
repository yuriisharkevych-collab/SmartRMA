import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { CaseHandoffService } from './case-handoff.service';
import { SendToPartnerDto } from './dto/send-to-partner.dto';
import { HandoffThreadEntity } from './entities/handoff-thread.entity';

@ApiTags('Case Handoff')
@ApiBearerAuth()
@Controller('cases/:id/handoff')
export class CaseHandoffController {
  constructor(private readonly caseHandoffService: CaseHandoffService) {}

  /** `cases.view` — czyta wąski wątek własnej sprawy (IDOR-safe wewnątrz `CaseHandoffService.getThread`), nie zarządza przekazaniem. */
  @Get()
  @RequirePermissions(PERMISSIONS.CASES_VIEW)
  getThread(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<HandoffThreadEntity | null> {
    return this.caseHandoffService.getThread(id, user.companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CASES_HANDOFF_SEND)
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendToPartnerDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ targetCaseNumber: string }> {
    return this.caseHandoffService.sendToPartner(id, user.companyId, user.userId, dto);
  }
}
