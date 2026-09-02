import { ManufacturerMapper, ManufacturerWithRelations } from './manufacturer.mapper';

function buildManufacturer(
  overrides: Partial<ManufacturerWithRelations> = {},
): ManufacturerWithRelations {
  return {
    id: 'manufacturer-1',
    contractorId: 'contractor-1',
    companyId: 'company-1',
    submissionMethod: 'FormularzWWW',
    complaintEmail: null,
    portalUrl: null,
    portalLogin: null,
    portalPasswordEncrypted: null,
    publicFormSlug: null,
    publicFormDisplayName: null,
    publicFormLogoPath: null,
    complaintProcedure: null,
    requiredDocumentsNote: null,
    requiredPhotosNote: null,
    requiredVideosNote: null,
    requiresSerialNumber: false,
    requiresFrameNumber: false,
    requiresProofOfPurchase: false,
    minPhotos: 0,
    requiresVideo: false,
    maxPhotos: 6,
    maxAttachmentSizeMb: 15,
    active: true,
    sla: null,
    logistics: null,
    automation: null,
    ...overrides,
  } as unknown as ManufacturerWithRelations;
}

describe('ManufacturerMapper', () => {
  it('toEntity() zwraca publicFormSlug/publicFormDisplayName — Etap 6, wcześniej niewidoczne w API mimo że PATCH je już przyjmował', () => {
    const entity = ManufacturerMapper.toEntity(
      buildManufacturer({
        publicFormSlug: 'veres-meble',
        publicFormDisplayName: 'Veres Meble',
      }),
    );
    expect(entity.publicFormSlug).toBe('veres-meble');
    expect(entity.publicFormDisplayName).toBe('Veres Meble');
  });

  it('toEntity() zwraca null dla producenta bez formularza marki', () => {
    const entity = ManufacturerMapper.toEntity(buildManufacturer());
    expect(entity.publicFormSlug).toBeNull();
    expect(entity.publicFormDisplayName).toBeNull();
    expect(entity.publicFormLogoUrl).toBeNull();
  });

  it('toEntity() zwraca publicFormLogoUrl WYŁĄCZNIE gdy publicFormLogoPath jest ustawiony — nigdy nie wycieka surowej ścieżki dysku', () => {
    const entity = ManufacturerMapper.toEntity(
      buildManufacturer({ publicFormLogoPath: 'company-1/manufacturer-1-logo/uuid-logo.png' }),
    );
    expect(entity.publicFormLogoUrl).toBe('/manufacturers/manufacturer-1/logo');
  });
});
