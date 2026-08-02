import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { IStorageService, StoredFile } from './storage.interface';

/** Usuwa separatory ścieżki i cofnięcia katalogu z nazwy pliku klienta — jedyna wartość w `save()` pochodząca bezpośrednio od użytkownika, reszta ścieżki to nasze własne UUID/id. */
function sanitizeFileName(originalName: string): string {
  return originalName.replace(/[/\\]/g, '_').replace(/\.\./g, '_');
}

/**
 * Implementacja MVP `IStorageService` — dysk lokalny (DECISIONS.md). Ścieżka
 * `{companyId}/{caseId}/{uuid}-{nazwa}` — izolacja dzierżawy na poziomie
 * systemu plików, ten sam duch co `@@index([companyId])` w bazie.
 *
 * Katalog bazowy pochodzi z `storage.uploadsDir` (`configuration.ts`,
 * absolutny, liczony od CWD) — NIE z `__dirname`: po kompilacji `__dirname`
 * wskazuje wnętrze `dist/`, które `nest build` czyści przy każdym buildzie,
 * więc załączniki ginęłyby po każdym przebudowaniu (wykryte przy pierwszym
 * realnym teście uploadu).
 */
@Injectable()
export class LocalDiskStorageService implements IStorageService {
  private readonly uploadsRoot: string;

  constructor(config: ConfigService) {
    this.uploadsRoot = config.get<string>('storage.uploadsDir')!;
  }

  async save(companyId: string, caseId: string, file: Express.Multer.File): Promise<StoredFile> {
    const dir = path.join(this.uploadsRoot, companyId, caseId);
    await fs.mkdir(dir, { recursive: true });

    const safeName = sanitizeFileName(file.originalname);
    const diskName = `${randomUUID()}-${safeName}`;
    await fs.writeFile(path.join(dir, diskName), file.buffer);

    return {
      // Rozdzielone `/` niezależnie od platformy — `storagePath` trafia do bazy i musi być stabilny między Windows/Linux (kontener).
      storagePath: [companyId, caseId, diskName].join('/'),
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  }

  async read(storagePath: string): Promise<Buffer> {
    const absolute = path.resolve(this.uploadsRoot, ...storagePath.split('/'));
    // `storagePath` pochodzi z naszej bazy (zapisany przez `save()` wyżej), więc nie jest wejściem
    // użytkownika — ale odczyt pliku z dysku na podstawie stringa z bazy zasługuje na jawną
    // barierę: gdyby kiedykolwiek dało się wstrzyknąć `../`, nie wyjdzie to poza katalog uploadów.
    if (absolute !== this.uploadsRoot && !absolute.startsWith(this.uploadsRoot + path.sep)) {
      throw new Error('storagePath wskazuje poza katalog uploadów.');
    }
    return fs.readFile(absolute);
  }
}
