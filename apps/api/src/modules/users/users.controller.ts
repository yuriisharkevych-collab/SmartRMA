import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeactivateUserResponseEntity } from './entities/deactivate-user-response.entity';
import { UserEntity } from './entities/user.entity';
import { UsersService } from './users.service';

/**
 * Uprawnienia per RBAC.md §2 "Moduł: Users / Roles (administracja)" —
 * wszystkie egzekwowane przez globalny `JwtAuthGuard` (uwierzytelnienie,
 * `APP_GUARD` w AppModule) + `PermissionsGuard` (autoryzacja, ten sam
 * globalny mechanizm, `@RequirePermissions` poniżej). RBAC.md §3 pokazuje
 * te uprawnienia jako wyłączne dla roli Administrator — egzekwowane przez
 * dane w tabeli `RolePermission` (seed.ts), nie sprawdzane tu wprost po
 * nazwie roli (RBAC.md §4: "Permission.code, nigdy nazwa roli wprost").
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  @ApiOperation({ summary: 'Lista użytkowników firmy', description: 'RBAC.md §3: Administrator — pełny dostęp; Kierownik — tylko pracownicy własnego oddziału (nieegzekwowane na poziomie zapytania, patrz raport gotowości).' })
  @ApiResponse({ status: 200, description: 'Lista użytkowników (bez passwordHash).', type: [UserEntity] })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `users.view`.' })
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<UserEntity[]> {
    return this.usersService.findAllForCompany(user.companyId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  @ApiOperation({ summary: 'Szczegóły użytkownika' })
  @ApiResponse({ status: 200, description: 'Użytkownik znaleziony.', type: UserEntity })
  @ApiResponse({ status: 404, description: 'USER-002 — nie znaleziono użytkownika.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `users.view`.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserEntity> {
    return this.usersService.findById(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  @ApiOperation({
    summary: 'Utworzenie użytkownika (pracownika)',
    description:
      'Hasło początkowe przyjmowane z DTO jawnym tekstem, hashowane przez PasswordService przed zapisem — ' +
      'nigdy nie trafia do bazy w postaci jawnej (DATABASE.md zasada projektowa #3). Wymaga co najmniej jednej roli (RBAC-004).',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'Użytkownik utworzony.', type: UserEntity })
  @ApiResponse({ status: 409, description: 'USER-001 — adres e-mail już zajęty.' })
  @ApiResponse({ status: 422, description: 'VALIDATION-001/002, AUTH-004 (hasło poniżej 8 znaków), RBAC-004 (pusta lista ról).' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `users.create`.' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto): Promise<UserEntity> {
    return this.usersService.create(user.companyId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_EDIT)
  @ApiOperation({
    summary: 'Edycja danych użytkownika',
    description: 'Nie zmienia hasła ani ról — patrz POST /users/:id/reset-password i PUT /users/:id/roles (osobne uprawnienia w RBAC.md).',
  })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'Użytkownik zaktualizowany.', type: UserEntity })
  @ApiResponse({ status: 404, description: 'USER-002 — nie znaleziono użytkownika.' })
  @ApiResponse({ status: 409, description: 'USER-001 — nowy adres e-mail już zajęty przez innego użytkownika.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `users.edit`.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto): Promise<UserEntity> {
    return this.usersService.update(id, dto);
  }

  @Post(':id/deactivate')
  @RequirePermissions(PERMISSIONS.USERS_DEACTIVATE)
  @ApiOperation({
    summary: 'Dezaktywacja konta (BR: soft delete przez `active=false`, nigdy fizyczne usunięcie)',
    description:
      'Zawsze dozwolona — jeśli użytkownik jest właścicielem otwartych spraw, odpowiedź niesie ' +
      '`warnings: ["USER-003"]` (kod informacyjny, nie blokujący, ERROR_CODES.md).',
  })
  @ApiResponse({ status: 201, description: 'Konto dezaktywowane, ewentualnie z ostrzeżeniem.', type: DeactivateUserResponseEntity })
  @ApiResponse({ status: 404, description: 'USER-002 — nie znaleziono użytkownika.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `users.deactivate`.' })
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<DeactivateUserResponseEntity> {
    return this.usersService.deactivate(id);
  }

  @Post(':id/reset-password')
  @RequirePermissions(PERMISSIONS.USERS_RESET_PASSWORD)
  @ApiOperation({
    summary: 'Reset hasła (poza zakresem Zadania 2 — endpoint istniał już wcześniej)',
    description:
      'UWAGA: mechanizm dostarczenia (hasło tymczasowe zwrócone wprost vs. link resetujący e-mailem) jest ' +
      'jawnie nierozstrzygnięty w NOTIFICATIONS.md §9 ("do potwierdzenia z zespołem bezpieczeństwa przed ' +
      'implementacją") — ten endpoint pozostaje placeholderem (zwraca hasło tymczasowe wprost), nie był ' +
      'częścią listy CRUD tego zadania. Patrz raport końcowy.',
  })
  @ApiResponse({ status: 201, description: 'Tymczasowe hasło wygenerowane i zahashowane (placeholder).' })
  @ApiResponse({ status: 404, description: 'USER-002 — nie znaleziono użytkownika.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `users.resetPassword`.' })
  resetPassword(@Param('id', ParseUUIDPipe) id: string): Promise<{ temporaryPassword: string }> {
    return this.usersService.resetPassword(id);
  }

  @Put(':id/roles')
  @RequirePermissions(PERMISSIONS.USERS_ROLES_ASSIGN)
  @ApiOperation({ summary: 'Zastąpienie pełnego zestawu ról użytkownika', description: 'Wymaga co najmniej jednej roli (RBAC-004) — osobne uprawnienie od `users.edit` (RBAC.md §2).' })
  @ApiBody({ type: AssignRolesDto })
  @ApiResponse({ status: 200, description: 'Role zaktualizowane.', type: UserEntity })
  @ApiResponse({ status: 404, description: 'USER-002 — nie znaleziono użytkownika.' })
  @ApiResponse({ status: 422, description: 'RBAC-004 — pusta lista ról odrzucona już na poziomie DTO.' })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `users.roles.assign`.' })
  assignRoles(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignRolesDto): Promise<UserEntity> {
    return this.usersService.assignRoles(id, dto.roleIds);
  }
}
