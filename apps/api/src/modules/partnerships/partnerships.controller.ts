import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { AuthTokensEntity } from '../auth/entities/auth-tokens.entity';
import { AcceptPartnerInviteDto } from './dto/accept-partner-invite.dto';
import { InvitePartnerDto } from './dto/invite-partner.dto';
import { InvitePartnershipDto } from './dto/invite-partnership.dto';
import { RequestConnectionDto } from './dto/request-connection.dto';
import { SearchCompanyDto } from './dto/search-company.dto';
import { PartnerInviteInfoEntity } from './entities/partner-invite-info.entity';
import { PartnershipEntity } from './entities/partnership.entity';
import { SearchCompanyResultEntity } from './entities/search-company-result.entity';
import { PartnershipsService } from './partnerships.service';

@ApiTags('Partnerships')
@Controller('partnerships')
export class PartnershipsController {
  constructor(private readonly partnershipsService: PartnershipsService) {}

  // --- Etap 5 — zaproszenie e-mailem (Dystrybutor → nowy partner). Trasy
  // literalne ("invite/...") PRZED `:id` niżej — więcej segmentów w ścieżce,
  // Nest/Express je poprawnie odróżnia, ale kolejność deklaracji trzyma się
  // konwencji "bardziej specyficzne wyżej" dla czytelności. ---

  @Public()
  @Get('invite/:token')
  getInviteInfo(@Param('token') token: string): Promise<PartnerInviteInfoEntity> {
    return this.partnershipsService.getInviteInfo(token);
  }

  @Public()
  @Post('invite/:token/accept')
  acceptPartnerInvite(
    @Param('token') token: string,
    @Body() dto: AcceptPartnerInviteDto,
  ): Promise<AuthTokensEntity> {
    return this.partnershipsService.acceptPartnerInvite(token, dto);
  }

  @Post('invite-partner')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_MANAGE)
  invitePartner(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InvitePartnerDto,
  ): Promise<PartnershipEntity> {
    return this.partnershipsService.invitePartner(user.companyId, user.userId, dto);
  }

  @Get()
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_VIEW)
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<PartnershipEntity[]> {
    return this.partnershipsService.findAllForCompany(user.companyId);
  }

  @Get(':id')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_VIEW)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PartnershipEntity> {
    return this.partnershipsService.findById(id, user.companyId);
  }

  @Post('invite')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_MANAGE)
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InvitePartnershipDto,
  ): Promise<PartnershipEntity> {
    return this.partnershipsService.invite(user.companyId, user.userId, dto);
  }

  // --- Etap 6 — "Połącz z istniejącą firmą" (symetryczne, obie strony) ---

  @Post('search-company')
  @HttpCode(HttpStatus.OK) // semantycznie zapytanie (odczyt, brak efektów ubocznych) — POST wyłącznie, żeby NIP nie trafiał do query stringa/logów (decyzja właściciela), więc nadpisuje domyślne 201 dla POST.
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_MANAGE)
  async searchCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SearchCompanyDto,
  ): Promise<SearchCompanyResultEntity | Record<string, never>> {
    // `{}`, NIE `null` — Nest/Express traktuje `null`/`undefined` jako "brak
    // treści" (`response.end()`, ZERO bajtów), więc klient (i `supertest` w
    // testach) dostałby pusty body zamiast poprawnego JSON-a. `{}` jest
    // jednoznaczne w każdym kliencie: `!result.id` = "nie znaleziono".
    return (await this.partnershipsService.searchCompanyByNip(user.companyId, dto)) ?? {};
  }

  @Post('request-connection')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_MANAGE)
  requestConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestConnectionDto,
  ): Promise<PartnershipEntity> {
    return this.partnershipsService.requestConnection(user.companyId, user.userId, dto);
  }

  @Post(':id/accept')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_MANAGE)
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PartnershipEntity> {
    return this.partnershipsService.accept(id, user.companyId, user.userId);
  }

  @Post(':id/reject')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_MANAGE)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PartnershipEntity> {
    return this.partnershipsService.reject(id, user.companyId, user.userId);
  }

  @Post(':id/deactivate')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.PARTNERSHIPS_MANAGE)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PartnershipEntity> {
    return this.partnershipsService.deactivate(id, user.companyId, user.userId);
  }
}
