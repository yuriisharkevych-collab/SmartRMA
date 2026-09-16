import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { IsPolishNip, normalizeNip } from '../../../common/validators/nip.validator';

/** `POST /companies/signup` — jedna z trzech wartości, którą serwis mapuje na `Company.type`/`Company.orgKind` (patrz `CompaniesService.signup`): `Shop` → `type=Shop, orgKind=null`; `Producent`/`Dystrybutor` → `type=ManufacturerDistributor, orgKind=<ta wartość>`. */
export type SignupOrgType = 'Shop' | 'Producent' | 'Dystrybutor';
const SIGNUP_ORG_TYPES: SignupOrgType[] = ['Shop', 'Producent', 'Dystrybutor'];

/**
 * `POST /companies/signup` — publiczny, samoobsługowy onboarding. Etap 6
 * ograniczał to do Producent/Dystrybutor (`orgKind`); Fundament „Fresh
 * Install" rozszerza o `Shop` (`orgType` zastępuje `orgKind` — jedno pole,
 * trzy wartości, zamiast dwóch osobnych DTO) i dokłada WYMAGANY `nip`
 * (właściciel: pierwszy realny partner musi mieć NIP od razu przy
 * rejestracji, nie dopiero później w Ustawieniach).
 *
 * `ValidationPipe` globalny (`main.ts`, `forbidNonWhitelisted:true`) odrzuca
 * 422 każde pole spoza tej listy (w tym `companyId`/`orgId`/`roleId`) —
 * wołający nie może podstawić się pod istniejącą firmę ani nadać sobie roli
 * innej niż systemowy Administrator.
 *
 * Od tego zadania `signup()` NIE loguje już automatycznie (breaking change,
 * wprost wymagany) — konto wymaga potwierdzenia e-maila PRZED pierwszym
 * logowaniem (AUTH-007, `AccountRecoveryService`).
 */
export class CompanySignupDto {
  @IsString() @MinLength(2) @MaxLength(200) companyName!: string;

  @IsIn(SIGNUP_ORG_TYPES) orgType!: SignupOrgType;

  /**
   * Separatory (spacje/myślniki) dozwolone przy wpisywaniu — znormalizowane
   * do 10 cyfr przed walidacją/zapisem, ten sam wzorzec co
   * `UpdateCompanyDto.nip`. Różnica: TAM pole jest opcjonalne (`@IsOptional`,
   * `isValidPolishNip` traktuje pusty string jako poprawny — świadomie, dla
   * edycji już istniejącej firmy), TUTAJ wymagane — `@IsNotEmpty` łapie
   * pusty/`undefined` PRZED `@IsPolishNip`, którego kontrakt "puste = OK"
   * inaczej cicho przepuściłby brak NIP-u przy rejestracji.
   */
  @Transform(({ value }) => (typeof value === 'string' ? normalizeNip(value) : value))
  @IsString()
  @IsNotEmpty({ message: 'VALIDATION-006' })
  @IsPolishNip({ message: 'VALIDATION-006' })
  nip!: string;

  @IsString() @MinLength(1) @MaxLength(100) adminFirstName!: string;
  @IsString() @MinLength(1) @MaxLength(100) adminLastName!: string;

  @IsEmail({}, { message: 'VALIDATION-002' }) adminEmail!: string;

  /** Ta sama polityka minimalna co `AcceptPartnerInviteDto`/`AUTH-004` — firma nie ma jeszcze WŁASNYCH `CompanySettings.passwordMin*` w chwili rejestracji (dopiero je zakładamy), więc nie ma czego odczytać. */
  @IsString() @MinLength(8, { message: 'AUTH-004' }) password!: string;
}
