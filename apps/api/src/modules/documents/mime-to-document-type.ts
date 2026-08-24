import { DocumentType } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';

const MIME_TO_DOCUMENT_TYPE: Record<string, DocumentType> = {
  'application/pdf': DocumentType.PDF,
  'image/jpeg': DocumentType.JPG,
  'image/jpg': DocumentType.JPG,
  'image/png': DocumentType.PNG,
  'image/heic': DocumentType.HEIC,
  'image/heif': DocumentType.HEIC,
  'video/mp4': DocumentType.MP4,
};

/**
 * `DocumentType` (`schema.prisma`) to zamknięty enum formatów — plik spoza tej listy jest odrzucany, zamiast zgadywać najbliższy typ.
 *
 * Rzuca `AppException` (kod `FILE-003`, już zarejestrowany w `ERROR_CODES.md`,
 * dotąd nieużywany przy właściwym uploadzie) zamiast gołego `UnprocessableEntityException`
 * — ten drugi to zwykły `HttpException`, który `HttpExceptionFilter` traktuje jak
 * nieprzetłumaczony komunikat `ValidationPipe` i podmienia na generyczne "sprawdź pola",
 * kasując ten konkretny, już zrozumiały tekst (UAT — Sekcja 8, wgranie pliku w złym formacie).
 */
export function mimeToDocumentType(mimeType: string): DocumentType {
  const documentType = MIME_TO_DOCUMENT_TYPE[mimeType.toLowerCase()];
  if (!documentType) {
    throw new AppException(
      ERROR_CODES.FILE_003.code,
      `Nieobsługiwany format pliku: ${mimeType}. Dozwolone: PDF, JPG, PNG, HEIC, MP4.`,
      ERROR_CODES.FILE_003.status,
    );
  }
  return documentType;
}
