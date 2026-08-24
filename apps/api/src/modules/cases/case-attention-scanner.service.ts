import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationChannel, NotificationRecipientType } from '@prisma/client';
import { CaseStatusesService } from '../case-statuses/case-statuses.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { ManufacturersService } from '../manufacturers/manufacturers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { computeCaseAttention } from './case-attention.util';
import { CasesRepository } from './cases.repository';

const REASON_LABELS: Record<string, string> = {
  StatusStale: 'brak zmiany statusu przez dłuższy czas',
  CaseAgeStale: 'zbyt długo od zgłoszenia',
};

/**
 * Przypomnienia o reakcji — cykliczny skan (raz na godzinę; próg liczony w
 * dniach, nie ma sensu odpytywać częściej niż `NotificationDispatcherService`
 * odpytuje e-maile co kilka sekund) generujący DOKŁADNIE JEDNO powiadomienie
 * `System` do właściciela sprawy na "epizod" bezczynności — `attentionNotifiedAt`
 * zerowane przy każdej realnej zmianie statusu (`CasesService.performTransition`),
 * ustawiane tutaj po wysłaniu, więc kolejny skan pomija już powiadomioną
 * sprawę, dopóki jej status znów się nie zmieni. Grupowanie po `companyId` —
 * próg (domyślny firmy + nadpisanie producenta) jest per firma, więc liczymy
 * go raz na firmę w tym przebiegu, nie raz na sprawę.
 */
@Injectable()
export class CaseAttentionScannerService {
  private readonly logger = new Logger(CaseAttentionScannerService.name);
  private running = false;

  constructor(
    private readonly casesRepository: CasesRepository,
    private readonly caseStatusesService: CaseStatusesService,
    private readonly companySettingsService: CompanySettingsService,
    private readonly manufacturersService: ManufacturersService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async scan(): Promise<void> {
    if (this.config.get<string>('app.nodeEnv') === 'test') return;
    if (this.running) return;
    this.running = true;
    try {
      const candidates = await this.casesRepository.findCandidatesForAttentionScan();
      if (candidates.length === 0) return;

      const byCompany = new Map<string, typeof candidates>();
      for (const c of candidates) {
        const list = byCompany.get(c.companyId) ?? [];
        list.push(c);
        byCompany.set(c.companyId, list);
      }

      for (const [companyId, cases] of byCompany) {
        await this.scanCompany(companyId, cases);
      }
    } finally {
      this.running = false;
    }
  }

  private async scanCompany(
    companyId: string,
    cases: Awaited<ReturnType<CasesRepository['findCandidatesForAttentionScan']>>,
  ): Promise<void> {
    const [statusDefs, companyDefaults] = await Promise.all([
      this.caseStatusesService.findAllForCompany(companyId),
      this.companySettingsService.getSettings(companyId),
    ]);
    const isFinalByCode = new Map(statusDefs.map((s) => [s.code, s.isFinal]));

    // Etap 3 — nadpisanie marki, jeśli ustawione, inaczej próg producenta (jeden resolver,
    // ten sam co `CasesService.attachAttention`/`DashboardService.countCasesNeedingAttention`).
    const resolveSla = await this.manufacturersService.resolveAttentionOverridesResolver(
      cases.map((c) => ({
        manufacturerId: c.items[0]?.manufacturerId ?? null,
        brandId: c.items[0]?.product?.brandId ?? null,
      })),
      companyId,
    );

    const now = new Date();
    for (const c of cases) {
      const result = computeCaseAttention({
        isFinal: isFinalByCode.get(c.status) ?? false,
        statusChangedAt: c.statusChangedAt,
        createdAt: c.createdAt,
        companyDefaults: {
          defaultStatusStaleDays: companyDefaults.defaultStatusStaleDays,
          defaultCaseAgeStaleDays: companyDefaults.defaultCaseAgeStaleDays,
        },
        manufacturerOverrides: resolveSla({
          manufacturerId: c.items[0]?.manufacturerId ?? null,
          brandId: c.items[0]?.product?.brandId ?? null,
        }),
        now,
      });
      if (!result.needsAttention || !c.ownerId) continue;

      await this.notificationsService.createNotificationFromTemplate({
        companyId,
        code: 'case.attention_required.owner',
        channel: NotificationChannel.System,
        recipientType: NotificationRecipientType.Employee,
        recipientUserId: c.ownerId,
        relatedCaseId: c.id,
        variables: {
          caseNumber: c.caseNumber,
          reason: result.reasons.map((r) => REASON_LABELS[r] ?? r).join(', '),
        },
      });
      await this.casesRepository.markAttentionNotified(c.id);
    }
  }
}
