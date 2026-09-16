import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { PlatformAuthTokensEntity } from './entities/platform-auth-tokens.entity';
import { PlatformAuthService } from './platform-auth.service';

@ApiTags('Platform Admin')
@Controller('platform-auth')
export class PlatformAuthController {
  constructor(private readonly platformAuthService: PlatformAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @ApiOperation({ summary: 'Logowanie administratora platformy (poza tenantami)' })
  @ApiBody({ type: PlatformLoginDto })
  @ApiResponse({ status: 200, description: 'Zalogowano.', type: PlatformAuthTokensEntity })
  @ApiResponse({ status: 401, description: 'PLATFORM-001 — nieprawidłowy e-mail lub hasło.' })
  @ApiResponse({ status: 403, description: 'PLATFORM-002 — konto nieaktywne.' })
  login(@Body() dto: PlatformLoginDto): Promise<PlatformAuthTokensEntity> {
    return this.platformAuthService.login(dto.email, dto.password);
  }
}
