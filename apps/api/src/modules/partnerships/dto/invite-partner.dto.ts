import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Etap 5 — Dystrybutor/Producent zaprasza NOWEGO partnera e-mailem (odwrotny
 * kierunek niż `InvitePartnershipDto`: tam Sklep zna slug JUŻ ISTNIEJĄCEGO
 * Dystrybutora i sam się zgłasza; tutaj Dystrybutor zakłada partnerowi pustą
 * firmę i wysyła link zaproszenia — właściciel wprost zastrzegł "nie chcę
 * ręcznego tworzenia kont przez administratora SmartRMA", więc konto
 * zakłada sam zaproszony, klikając link z e-maila, patrz `AcceptPartnerInviteDto`).
 */
export class InvitePartnerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  companyName!: string;

  @IsEmail({}, { message: 'VALIDATION-002' })
  adminEmail!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  brandIds!: string[];
}
