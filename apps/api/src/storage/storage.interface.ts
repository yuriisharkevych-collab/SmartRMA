export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface StoredFile {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

/**
 * Port (DECISIONS.md "Wybór stacku technologicznego" — `IStorageService`
 * planowany od początku, dysk lokalny w MVP, wymiana na S3 przy przejściu na
 * SaaS bez zmiany logiki biznesowej). Wzorzec identyczny jak `IEventBus`
 * (`events/event-bus.interface.ts`) — kod domenowy zna wyłącznie ten
 * interfejs, nigdy konkretną implementację.
 */
export interface IStorageService {
  save(companyId: string, caseId: string, file: Express.Multer.File): Promise<StoredFile>;
  read(storagePath: string): Promise<Buffer>;
}
