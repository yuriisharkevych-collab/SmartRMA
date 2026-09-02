import { OrganizationKind } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `POST /companies/signup` — publiczny, Etap 6. Odpowiednik `AcceptPartnerInviteDto`
 * (jedyny ROZMIAR wejścia to nazwa firmy + rodzaj + dane PIERWSZEGO Administratora —
 * bez `companyId`/`orgId`/`roleId`/żadnego innego identyfikatora, żeby wołający NIE
 * MÓGŁ podstawić się pod istniejącą firmę ani nadać sobie roli innej niż systemowy
 * Administrator). `ValidationPipe` globalny (`main.ts`, `forbidNonWhitelisted:true`)
 * odrzuca 422 każde dodatkowe pole spoza tej listy, więc próba przemycenia
 * `companyId` w body kończy się VALIDATION-003, nigdy nie dociera do serwisu.
 *
 * Zakres celowo WYŁĄCZNIE `ManufacturerDistributor` — self-service zakładanie
 * kolejnego Sklepu nie jest w zakresie Etapu 6 (właściciel poprosił o
 * "Onboarding nowej firmy Producent/Dystrybutor", nie o ogólny multi-tenant
 * signup), stąd `orgKind` zamiast `type`.
 */
export class CompanySignupDto {
  @IsString() @MinLength(2) @MaxLength(200) companyName!: string;

  @IsEnum(OrganizationKind) orgKind!: OrganizationKind;

  @IsString() @MinLength(1) @MaxLength(100) adminFirstName!: string;
  @IsString() @MinLength(1) @MaxLength(100) adminLastName!: string;

  @IsEmail({}, { message: 'VALIDATION-002' }) adminEmail!: string;

  /** Ta sama polityka minimalna co `AcceptPartnerInviteDto`/`AUTH-004` — firma nie ma jeszcze WŁASNYCH `CompanySettings.passwordMin*` w chwili rejestracji (dopiero je zakładamy), więc nie ma czego odczytać. */
  @IsString() @MinLength(8, { message: 'AUTH-004' }) password!: string;
}
