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

/** Formularz rozgałęziony marki (np. Veres Meble) — krok "Kto składa zgłoszenie?". */
export enum BrandReporterType {
  Customer = 'Customer',
  Partner = 'Partner',
}

/** Krok "Rodzaj zgłoszenia B2B" — wyłącznie gdy `reporterType=Partner`. */
export enum BrandPartnerRequestType {
  Presale = 'Presale',
  OnBehalfOfCustomer = 'OnBehalfOfCustomer',
}

/** Krok "Z kim mamy się kontaktować?" — wyłącznie gdy `partnerRequestType=OnBehalfOfCustomer`. */
export enum BrandContactPreference {
  Customer = 'Customer',
  Partner = 'Partner',
}

/** Krok "Czego dotyczy reklamacja?" — wspólny dla obu ścieżek B2C/B2B. */
export enum BrandIssueType {
  MissingPart = 'MissingPart',
  DamagedPart = 'DamagedPart',
  Defect = 'Defect',
  Other = 'Other',
}

class BrandComplaintCustomerDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) firstName!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) lastName!: string;
  @ApiProperty() @IsString() @MinLength(6) @MaxLength(30) phone!: string;
  @ApiProperty() @IsEmail({}, { message: 'VALIDATION-002' }) email!: string;
  @ApiProperty({ description: 'Ulica i numer domu/mieszkania.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  address!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) city!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(12) postalCode!: string;
}

/** Osoba kontaktowa po stronie partnera — używana jako "klient" sprawy WYŁĄCZNIE przy zgłoszeniu przedsprzedażowym (brak klienta końcowego), patrz `Case.customerId` (pole wymagane). */
class BrandComplaintPartnerContactDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) firstName!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) lastName!: string;
  @ApiProperty() @IsString() @MinLength(6) @MaxLength(30) phone!: string;
  @ApiProperty() @IsEmail({}, { message: 'VALIDATION-002' }) email!: string;
}

/**
 * `POST /intake/brand/:brandSlug/complaints` — odpowiednik `SubmitPublicComplaintDto`
 * dla formularza rozgałęzionego marki (Veres Meble i kolejne). Warunkowa wymagalność
 * pól (który wariant klienta/partnera jest potrzebny) jest walidowana W SERWISIE
 * (`IntakeService.submitBrandComplaint`), nie tutaj — dokładnie ten sam wzorzec co
 * `submissionMode`/`complaintType` w `CasesService.create` (DTO kształtuje wejście,
 * reguły międzypolowe egzekwuje serwis).
 */
export class SubmitBrandComplaintDto {
  @ApiProperty({ enum: BrandReporterType })
  @IsEnum(BrandReporterType)
  reporterType!: BrandReporterType;

  /** Wymagane, gdy `reporterType=Customer` LUB (`reporterType=Partner` I `partnerRequestType=OnBehalfOfCustomer`). */
  @ApiPropertyOptional({ type: BrandComplaintCustomerDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandComplaintCustomerDto)
  customer?: BrandComplaintCustomerDto;

  /** Wymagane, gdy `reporterType=Partner` — `Company` powiązana AKTYWNYM `Partnership` z tą firmą, patrz `GET /intake/brand/:brandSlug/partners`. */
  @ApiPropertyOptional() @IsOptional() @IsUUID() partnerCompanyId?: string;
  @ApiPropertyOptional({ enum: BrandPartnerRequestType })
  @IsOptional()
  @IsEnum(BrandPartnerRequestType)
  partnerRequestType?: BrandPartnerRequestType;
  /** Wymagane, gdy `partnerRequestType=OnBehalfOfCustomer`. */
  @ApiPropertyOptional({ enum: BrandContactPreference })
  @IsOptional()
  @IsEnum(BrandContactPreference)
  contactPreference?: BrandContactPreference;
  /** Wymagane, gdy `partnerRequestType=Presale` (brak klienta końcowego — patrz doc-comment klasy wyżej). */
  @ApiPropertyOptional({ type: BrandComplaintPartnerContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandComplaintPartnerContactDto)
  partnerContact?: BrandComplaintPartnerContactDto;

  /**
   * Etap 4 (Produkty i konfiguracja formularza) — schemat Organizacja → Producent
   * → Marka → Kategoria → Produkt. `brandId`/`categoryId` istnieją WYŁĄCZNIE jako
   * kroki zawężające listę w `GET /intake/brand/:brandSlug/products` — nie są
   * osobno zapisywane na sprawie (marka pochodzi z wybranego `Product.brandId`,
   * dokładnie tak jak wcześniej dla produktów katalogowych pracownika, BR-076).
   * `productId` musi wskazywać AKTYWNY produkt TEGO producenta — weryfikowane w
   * `IntakeService.submitBrandComplaint` (IDOR: klient nie może podstawić
   * `productId` cudzej firmy/innego producenta).
   */
  @ApiPropertyOptional({
    description: 'Krok "Marka" — wymagany tylko gdy producent ma więcej niż jedną aktywną markę.',
  })
  @IsOptional()
  @IsUUID()
  brandId?: string;
  @ApiProperty({
    description: 'Pozycja z katalogu producenta (`GET /intake/brand/:brandSlug/products`).',
  })
  @IsUUID()
  productId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) purchaseProofNumber?: string;

  @ApiProperty({ enum: BrandIssueType }) @IsEnum(BrandIssueType) issueType!: BrandIssueType;
  /** Wymagany UX-owo (frontend), gdy `issueType` in [MissingPart, DamagedPart] — backend celowo NIE wymusza, ten sam wzorzec co `incompleteOrderDetails` w formularzu firmowym. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) affectedPartNumber?: string;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) description!: string;

  @ApiProperty({
    description:
      'Sekcja RODO — obowiązkowa, formularz nie wysyła się bez niej. Dotyczy zawsze jakiejś osoby fizycznej (klienta końcowego albo osoby kontaktowej partnera przy zgłoszeniu przedsprzedażowym).',
  })
  @IsBoolean()
  @Equals(true, { message: 'VALIDATION-001' })
  requiredConsent!: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketingConsent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() documentSharingConsent?: boolean;
}
