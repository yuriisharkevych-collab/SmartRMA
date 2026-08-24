import { IsUUID } from 'class-validator';

/**
 * `brandId` — WŁASNA (samoopisana) marka Dystrybutora/Producenta, jedna z
 * objętych `dto.partnershipId` (patrz `PartnershipsService.assertActiveForShopWithBrand`).
 * Pracownik Sklepu wybiera ją jawnie (nie jest wywodzona z katalogu Sklepu —
 * katalogi obu firm są niezależne, patrz `CaseHandoffService.sendToPartner`).
 */
export class SendToPartnerDto {
  @IsUUID() partnershipId!: string;
  @IsUUID() brandId!: string;
}
