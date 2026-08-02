import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { UserWithRoles } from '../users/mappers/user.mapper';
import { AuthService } from './auth.service';
import { CurrentRefreshToken } from './decorators/current-refresh-token.decorator';
import { AuthTokensEntity } from './entities/auth-tokens.entity';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { RefreshTokenContext } from './interfaces/jwt-payload.interface';

/**
 * Wszystkie kody błędów poniżej pochodzą z `ERROR_CODES.md` — treść i
 * status HTTP tam, nie tutaj (Zadanie 1, punkt 12: "nie zwracaj własnych
 * komunikatów"). Ten kontroler wyłącznie deklaruje, KTÓRY z udokumentowanych
 * kodów może wystąpić na danym endpointzie, dla Swaggera.
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logowanie pracownika (e-mail + hasło)',
    description:
      'RBAC.md — logowanie wewnętrzne, ODRĘBNE od Portalu Klienta (RBAC.md §1.2, POST /portal/login). ' +
      'Dane logowania weryfikuje LocalStrategy → AuthService.validateCredentials; ten handler tylko wydaje tokeny.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Zalogowano — para tokenów.', type: AuthTokensEntity })
  @ApiResponse({ status: 401, description: 'AUTH-001 — nieprawidłowy e-mail lub hasło.' })
  @ApiResponse({ status: 403, description: 'AUTH-002 — konto nieaktywne (`User.active=false`).' })
  @ApiResponse({
    status: 422,
    description: 'VALIDATION-001/002 — brakujące pole / nieprawidłowy format e-mail.',
  })
  login(
    @Body() _dto: LoginDto,
    @Req() req: Request & { user: UserWithRoles },
  ): Promise<AuthTokensEntity> {
    // `_dto` wyłącznie dla walidacji/Swagger — dane logowania weryfikuje LocalStrategy,
    // rezultat trafia do `req.user` (patrz LocalStrategy.validate).
    return this.authService.login(req.user, {
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Odświeżenie tokenów (rotacja)',
    description:
      'Weryfikuje Refresh Token (podpis + Redis allowlist — RefreshTokenStoreService, decyzja z Zadania 1 wobec ' +
      'braku tabeli sesji w schema.prisma) i wydaje NOWĄ parę Access/Refresh Token. Poprzedni Refresh Token ' +
      'przestaje działać od tego momentu (nadpisanie wpisu w Redis).',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Odświeżono — nowa para tokenów.',
    type: AuthTokensEntity,
  })
  @ApiResponse({
    status: 401,
    description:
      'AUTH-003 — token nieprawidłowy, wygasły, już zrotowany/wylogowany, lub konto nieaktywne.',
  })
  @ApiResponse({ status: 422, description: 'VALIDATION-001 — brakujące pole `refreshToken`.' })
  refresh(
    @Body() _dto: RefreshTokenDto,
    @CurrentRefreshToken() token: RefreshTokenContext,
  ): Promise<AuthTokensEntity> {
    return this.authService.refresh(token.userId);
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Wylogowanie (unieważnienie Refresh Tokenu)',
    description:
      'Usuwa Refresh Token z Redis allowlist — kolejna próba /auth/refresh tym tokenem zwróci AUTH-003. ' +
      'Access Token wydany przed wylogowaniem pozostaje techniczne ważny do naturalnego wygaśnięcia ' +
      '(JWT_ACCESS_EXPIRES_IN) — stateless z natury, brak tabeli do jego natychmiastowej rewokacji.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 204, description: 'Wylogowano.' })
  @ApiResponse({
    status: 401,
    description: 'AUTH-003 — token nieprawidłowy/wygasły/już nieaktywny.',
  })
  @ApiResponse({ status: 422, description: 'VALIDATION-001 — brakujące pole `refreshToken`.' })
  async logout(
    @Body() _dto: RefreshTokenDto,
    @CurrentRefreshToken() token: RefreshTokenContext,
  ): Promise<void> {
    await this.authService.logout(token.userId);
  }
}
