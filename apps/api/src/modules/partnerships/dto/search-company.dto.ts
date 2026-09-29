import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';
import { IsPolishNip, normalizeNip } from '../../../common/validators/nip.validator';

/**
 * Etap 6 (Partnerzy B2B — "Połącz z istniejącą firmą") — `POST`, nie `GET`
 * (decyzja właściciela): NIP w body, nie w query string/URL, więc nie trafia
 * do logów dostępu serwera/proxy (patrz zasada "nigdy danych osobowych w
 * URL" — NIP identyfikuje realny podmiot gospodarczy).
 */
export class SearchCompanyDto {
  @Transform(({ value }) => (typeof value === 'string' ? normalizeNip(value) : value))
  @IsString()
  @IsPolishNip({ message: 'VALIDATION-006' })
  nip!: string;
}
