import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NamedCountEntity {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() count!: number;
}

export class MonthlyCountEntity {
  @ApiProperty({ description: 'YYYY-MM' }) month!: string;
  @ApiProperty() count!: number;
}

export class ManufacturerReportRowEntity {
  @ApiProperty() manufacturerId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() caseCount!: number;
  @ApiProperty({ description: 'Uznane = decyzja inna niż Odrzucenie.' }) accepted!: number;
  @ApiProperty() rejected!: number;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Procent uznanych spośród spraw Z PODJĘTĄ decyzją. null = brak decyzji w zakresie.',
  })
  acceptanceRate!: number | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Średni czas odpowiedzi producenta w dniach (WyslanaDoProducenta → decyzja).',
  })
  avgResponseDays!: number | null;
  @ApiPropertyOptional({ nullable: true, description: 'Średni czas zamknięcia sprawy w dniach.' })
  avgResolutionDays!: number | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Próg SLA producenta (dni). null = nieskonfigurowany.',
  })
  slaResponseDays!: number | null;
  @ApiProperty({ description: 'Liczba spraw, w których odpowiedź przekroczyła próg SLA.' })
  slaBreaches!: number;
}

export class EmployeeReportRowEntity {
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() total!: number;
  @ApiProperty() closed!: number;
  @ApiProperty() open!: number;
  @ApiProperty() overdue!: number;
  @ApiPropertyOptional({ nullable: true }) avgResolutionDays!: number | null;
}

export class ShopReportRowEntity {
  @ApiProperty() shopId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() total!: number;
  @ApiProperty() closed!: number;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Procent spraw zamkniętych (miara „skuteczności" sklepu).',
  })
  closeRate!: number | null;
  @ApiPropertyOptional({ nullable: true }) avgResolutionDays!: number | null;
}

export class TopItemEntity {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() count!: number;
}

/**
 * Finanse — pokrycie danych jest CZĘŚCIOWE i jawnie to sygnalizujemy zamiast
 * zgadywać. `productValue` liczy się wyłącznie z pozycji dowiązanych do
 * konkretnego `OrderItem` (tylko tam istnieje cena); `logisticsCost` to realne
 * koszty transportu z `Logistics.cost`. Pełny „koszt reklamacji" (robocizna,
 * części, koszty producenta) NIE ma odpowiednika w modelu — patrz `coverageNote`.
 */
export class FinanceReportEntity {
  @ApiProperty({
    description: 'Wartość reklamowanych produktów (zł) — tylko pozycje dowiązane do zamówienia.',
  })
  productValue!: string;
  @ApiProperty({ description: 'Ile pozycji miało cenę (dowiązanych do zamówienia).' })
  pricedItems!: number;
  @ApiProperty({ description: 'Ile pozycji łącznie — różnica to pozycje bez ceny.' })
  totalItems!: number;
  @ApiProperty({ description: 'Suma kosztów transportu (zł) z Logistics.cost.' })
  logisticsCost!: string;
  @ApiProperty() replacements!: number;
  @ApiProperty() repairs!: number;
  @ApiProperty() refunds!: number;
  @ApiProperty({
    type: [String],
    description: 'Czego model danych NIE pokrywa — do świadomej decyzji, nie do zgadywania.',
  })
  coverageNotes!: string[];
}

export class SlaReportEntity {
  @ApiProperty() breaches!: number;
  @ApiProperty({ description: 'Sprawy, dla których dało się policzyć czas odpowiedzi.' })
  measured!: number;
  @ApiPropertyOptional({ nullable: true }) avgResponseDays!: number | null;
  @ApiPropertyOptional({ nullable: true }) avgResolutionDays!: number | null;
}

export class ReportOverviewEntity {
  @ApiProperty() from!: Date;
  @ApiProperty() to!: Date;

  @ApiProperty() totalCases!: number;
  @ApiProperty() closedCases!: number;
  @ApiProperty() openCases!: number;
  @ApiProperty() overdueCases!: number;
  @ApiPropertyOptional({ nullable: true }) avgResolutionDays!: number | null;

  @ApiProperty({ type: [NamedCountEntity] }) byComplaintType!: NamedCountEntity[];
  @ApiProperty({ type: [NamedCountEntity] }) byStatus!: NamedCountEntity[];
  @ApiProperty({ type: [NamedCountEntity] }) bySource!: NamedCountEntity[];
  @ApiProperty({ type: [MonthlyCountEntity] }) byMonth!: MonthlyCountEntity[];

  @ApiProperty({ type: [ManufacturerReportRowEntity] })
  manufacturers!: ManufacturerReportRowEntity[];
  @ApiProperty({ type: [EmployeeReportRowEntity] }) employees!: EmployeeReportRowEntity[];
  @ApiProperty({ type: [ShopReportRowEntity] }) shops!: ShopReportRowEntity[];

  @ApiProperty({ type: [TopItemEntity] }) topProducts!: TopItemEntity[];
  @ApiProperty({ type: [TopItemEntity] }) topBrands!: TopItemEntity[];

  @ApiProperty({ type: SlaReportEntity }) sla!: SlaReportEntity;
  @ApiProperty({ type: FinanceReportEntity }) finance!: FinanceReportEntity;
}
