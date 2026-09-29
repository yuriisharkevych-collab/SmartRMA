import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { IsPolishNip, normalizeNip } from '../../../common/validators/nip.validator';

/**
 * Etap 5/6 — zaprasza NOWEGO partnera e-mailem (odwrotny kierunek niż
 * `InvitePartnershipDto`/`RequestConnectionDto`: tam druga firma JUŻ ISTNIEJE
 * w SmartRMA; tutaj wołający zakłada jej partnerowi pustą firmę i wysyła link
 * zaproszenia — właściciel wprost zastrzegł "nie chcę ręcznego tworzenia kont
 * przez administratora SmartRMA", więc konto zakłada sam zaproszony, klikając
 * link z e-maila, patrz `AcceptPartnerInviteDto`). Etap 6 — symetryczne: może
 * wołać Sklep ALBO Producent/Dystrybutor, nowa firma dostaje TYP PRZECIWNY do
 * wołającego (`PartnershipsService.invitePartner`).
 *
 * BEZ `brandIds` (Etap 6, decyzja właściciela) — marki NIE są częścią procesu
 * zapraszania/łączenia partnera, każda firma zarządza WŁASNYMI markami po
 * swojej stronie, niezależnie od relacji B2B. `PartnershipBrand` (model)
 * pozostaje bez zmian znaczenia — po prostu nic już nie zapisuje do niej w
 * tym miejscu; istniejący, oddzielny mechanizm `InvitePartnershipDto.brandIds`
 * (stary tryb po `slug`) zostaje nietknięty.
 */
export class InvitePartnerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  companyName!: string;

  @IsEmail({}, { message: 'VALIDATION-002' })
  adminEmail!: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeNip(value) : value))
  @IsString()
  @IsPolishNip({ message: 'VALIDATION-006' })
  nip!: string;
}
