import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { ReportRangeDto } from './dto/report-range.dto';
import { ReportOverviewEntity } from './entities/report-overview.entity';
import { buildOverviewCsv } from './reports.csv';
import { ReportsService } from './reports.service';

/** Domyślnie 12 miesięcy wstecz — sensowny zakres dla „ile mamy reklamacji" bez wymuszania wyboru dat przy wejściu na ekran. */
function resolveRange(dto: ReportRangeDto): { from: Date; to: Date } {
  const to = dto.to ? new Date(dto.to) : new Date();
  const from = dto.from ? new Date(dto.from) : new Date(to.getFullYear(), to.getMonth() - 11, 1);
  return { from, to };
}

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Komplet raportów zarządczych w JEDNYM wywołaniu. Rozbicie na osobne
   * endpointy per raport oznaczałoby kilkanaście żądań przy każdej zmianie
   * zakresu dat i wielokrotne liczenie tych samych agregatów — czas zamknięcia
   * sprawy jest potrzebny raportowi producentów, pracowników i sklepów naraz.
   *
   * `GET /reports/manufacturers/:id` USUNIĘTY: liczył to samo co sekcja
   * producentów tego raportu, ale metodą oznaczoną w kodzie jako naiwna
   * (nie odróżniał spraw wieloelementowych), i nie był używany przez żaden ekran.
   */
  @Get('overview')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @ApiOperation({ summary: 'Raporty zarządcze dla zakresu dat' })
  @ApiResponse({ status: 200, description: 'Komplet raportów.', type: ReportOverviewEntity })
  @ApiResponse({ status: 403, description: 'RBAC-001 — brak uprawnienia `reports.view`.' })
  getOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportRangeDto,
  ): Promise<ReportOverviewEntity> {
    const { from, to } = resolveRange(query);
    return this.reportsService.getOverview(user.companyId, from, to);
  }

  /**
   * Eksport do arkusza — CSV z BOM UTF-8 i separatorem `;`, czyli format, który
   * Excel w polskiej lokalizacji otwiera bezpośrednio, z poprawnymi znakami
   * diakrytycznymi i podziałem na kolumny. Świadomie BEZ biblioteki do `.xlsx`:
   * dane są płaskimi tabelami, a taka zależność to kilka MB w obrazie i kolejny
   * element do utrzymania — bez korzyści dla odbiorcy pliku.
   *
   * Eksport respektuje ten sam zakres dat co widok (`from`/`to` idą tą samą ścieżką).
   */
  @Get('overview/export')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Eksport raportów do CSV (otwierany przez Excel)' })
  @ApiResponse({ status: 200, description: 'Plik CSV.' })
  async exportOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportRangeDto,
    @Res() res: Response,
  ): Promise<void> {
    const { from, to } = resolveRange(query);
    const overview = await this.reportsService.getOverview(user.companyId, from, to);
    const fileName = `smartrma-raport-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    // BOM — bez niego Excel czyta plik jako Windows-1252 i psuje polskie znaki.
    res.send('﻿' + buildOverviewCsv(overview));
  }
}
