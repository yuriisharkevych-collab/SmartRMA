import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
import { UserWithRoles } from '../../users/mappers/user.mapper';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    // `passReqToCallback` — IP i User-Agent są potrzebne do zapisu NIEUDANEJ próby
    // logowania w `LoginEvent`; serwis nie zna `Request`, więc kontekst wędruje stąd.
    // `email` (pole) niesie ALBO e-mail, ALBO login — patrz doc-comment `LoginDto`.
    super({ usernameField: 'email', passReqToCallback: true });
  }

  async validate(req: Request, email: string, password: string): Promise<UserWithRoles> {
    return this.authService.validateCredentials(email, password, {
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }
}
