import { IsUUID } from 'class-validator';

/**
 * Etap 6 — "Wyślij prośbę o połączenie" z firmą znalezioną WCZEŚNIEJ przez
 * `POST /partnerships/search-company`. `targetCompanyId` weryfikowany od
 * nowa na serwerze (aktywność, typ, czy już nie jest partnerem/prośbą) —
 * klient mógłby wysłać dowolne UUID, wynik wyszukiwania to tylko UX.
 */
export class RequestConnectionDto {
  @IsUUID()
  targetCompanyId!: string;
}
