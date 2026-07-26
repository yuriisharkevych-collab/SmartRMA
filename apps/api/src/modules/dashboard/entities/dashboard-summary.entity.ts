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
  @ApiProperty() awaitingCustomer!: number;
  @ApiProperty() readyForPickup!: number;
  @ApiProperty() myCases!: number;
}
