import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Krok 1 — "Dane klienta". Adres zbierany OD RAZU (ulica+numer/kod
 * pocztowy/miasto osobno) — świadome odejście od wcześniejszej decyzji "sklep
 * dopyta później": klient ma od razu okazję sprawdzić poprawność swoich
 * danych kontaktowych (patrz e-mail potwierdzający, `IntakeService`).
 */
class PublicComplaintCustomerDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) firstName!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) lastName!: string;
  @ApiProperty() @IsString() @MinLength(6) @MaxLength(30) phone!: string;
  /** Wymagany TUTAJ (inaczej niż ogólnie na `Customer.email`) — bez niego nie da się wysłać potwierdzenia ani linku do Portalu, czyli dwóch z pięciu rzeczy, które formularz ma zrobić po wysłaniu. */
  @ApiProperty() @IsEmail({}, { message: 'VALIDATION-002' }) email!: string;

  @ApiProperty({ description: 'Ulica i numer domu/mieszkania.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  address!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) city!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(12) postalCode!: string;
}

/**
 * Publiczny Formularz Reklamacyjny — jeden krok "Podsumowanie" wysyła WSZYSTKO
 * naraz (dane klienta + producent + opis + zgoda RODO). Celowo BEZ
 * "oczekiwanego rozwiązania" — formularz nie ma sugerować klientowi możliwości
 * (np. odstąpienia od umowy/zwrotu pieniędzy), o to pyta pracownik podczas
 * weryfikacji zgłoszenia (`IntakeService` wypełnia `requestedResolution`
 * neutralną wartością przy tworzeniu sprawy). Analogicznie BEZ
 * `complaintType` (gwarancja/rękojmia) — klient nie rozróżnia tych dwóch
 * ścieżek prawnych, to pracownik zaznacza to podczas weryfikacji zgłoszenia
 * (`CasesService.update`, CASE-014 blokuje zmianę po tym etapie);
 * `IntakeService` wypełnia `Warranty` jako startową wartość.
 * Zdjęcia/wideo/dowód zakupu jako PLIK są wgrywane OSOBNO, już PO utworzeniu
 * sprawy, przez ten sam, istniejący endpoint uploadu Portalu Klienta (frontend
 * loguje się automatycznie sesją zwróconą stąd) — bez duplikowania logiki
 * uploadu.
 */
export class SubmitPublicComplaintDto {
  @ApiProperty({ type: PublicComplaintCustomerDto })
  @ValidateNested()
  @Type(() => PublicComplaintCustomerDto)
  customer!: PublicComplaintCustomerDto;

  @ApiProperty() @IsUUID() manufacturerId!: string;

  /**
   * Etap 4 — gdy producent ma skonfigurowany katalog (`GET /intake/:orgSlug/manufacturers/:manufacturerId/products`),
   * frontend wysyła `productId` (wybór z listy, jak formularz marki). Gdy
   * katalog jest pusty (typowy stan dla świeżo dodanego zewnętrznego
   * producenta w formularzu firmowym), zostaje dotychczasowy wolny tekst
   * `productName` — "tak jak na paragonie" (patrz `IntakeRepository`).
   * Dokładnie jedno z obu musi być podane — walidacja międzypolowa w
   * `IntakeService.submitComplaint` (ten sam wzorzec co `submissionMode` w
   * `CasesService.create`).
   */
  @ApiPropertyOptional() @IsOptional() @IsUUID() productId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) productName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) frameNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) purchaseProofNumber?: string;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) description!: string;

  /** Krok "Opis problemu" — zaznaczenie odkrywa dodatkowe pole `incompleteOrderDetails` (frontend wymaga go wtedy, backend celowo NIE — ten sam wzorzec co reszta formularza: walidacja UX po stronie klienta, backend przyjmuje to, co dostanie). */
  @ApiPropertyOptional({
    description: 'Zaznaczone, jeśli przesyłka/zamówienie jest niekompletne (brakuje elementów).',
  })
  @IsOptional()
  @IsBoolean()
  incompleteOrder?: boolean;

  @ApiPropertyOptional({
    description: 'Czego brakuje w przesyłce — wypełniane wyłącznie, gdy incompleteOrder=true.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  incompleteOrderDetails?: string;

  @ApiProperty({
    description: 'Sekcja RODO (krok 8) — obowiązkowa, formularz nie wysyła się bez niej.',
  })
  @IsBoolean()
  @Equals(true, { message: 'VALIDATION-001' })
  requiredConsent!: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketingConsent?: boolean;

  @ApiPropertyOptional({
    description:
      'Zgoda na udostępnienie załączonych dokumentów/zdjęć producentowi lub dystrybutorowi w celu weryfikacji sprawy — opcjonalna.',
  })
  @IsOptional()
  @IsBoolean()
  documentSharingConsent?: boolean;
}
