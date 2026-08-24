import { ApiProperty } from '@nestjs/swagger';

/**
 * Kształt kafelków dashboardu — "dashboard jako centrum pracy"
 * (DECISIONS.md, filozofia produktu: "pracownik po zalogowaniu od razu wie,
 * co robić"). Liczby, nie encje — frontend linkuje kafelek do
 * `GET /cases?filter=overdue` itd. (wzorzec z prototypu, `dashboard.js`).
 */
export class DashboardSummaryEntity {
  @ApiProperty() totalActive!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty() dueToday!: number;
  @ApiProperty() readyForPickup!: number;
  @ApiProperty() myCases!: number;
  /** Wiadomości od klienta jeszcze nieprzeczytane przez pracownika, we wszystkich sprawach firmy (`Message.readAt=null`, kierunek klient→sklep). */
  @ApiProperty() unreadMessages!: number;
  /** Przypomnienia o reakcji — sprawy aktywne, które przekroczyły próg "brak zmiany statusu" i/lub "dni od zgłoszenia" (`case-attention.util.ts`, Ustawienia → Przypomnienia). Kafelek klikalny do `GET /cases?needsAttention=true`. */
  @ApiProperty() casesNeedingAttention!: number;

  /**
   * Faza 6 (Producent/Dystrybutor + Partnerzy B2B) — CAŁKOWITE liczby spraw
   * firmy wg pochodzenia (`Case.originType`), NIEZALEŻNE od `?source=` w
   * zapytaniu — etykiety przełącznika Wszystkie/B2B/B2C. Wszystkie POZOSTAŁE
   * pola w tym obiekcie SĄ już przefiltrowane przez `?source=`, gdy podane.
   */
  @ApiProperty() directCustomerTotal!: number;
  @ApiProperty() partnerB2BTotal!: number;
}
