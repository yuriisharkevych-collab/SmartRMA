import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PortalStage } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ERROR_CODES } from '../../common/exceptions/error-codes.const';
import { CaseStatusesRepository } from './case-statuses.repository';
import { CreateCaseStatusDto } from './dto/create-case-status.dto';
import { ReorderCaseStatusesDto } from './dto/reorder-case-statuses.dto';
import { UpdateCaseStatusDto } from './dto/update-case-status.dto';
import { CaseStatusEntity } from './entities/case-status.entity';
import { CaseStatusMapper } from './mappers/case-status.mapper';

const DIACRITICS_MAP: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
  Ą: 'A',
  Ć: 'C',
  Ę: 'E',
  Ł: 'L',
  Ń: 'N',
  Ó: 'O',
  Ś: 'S',
  Ź: 'Z',
  Ż: 'Z',
};

/** `code` niezmienny po utworzeniu — PascalCase bez polskich znaków diakrytycznych, wzorem seedowanych kodów (`PrzekazanaDoProducenta`). Kolizje (rzadkie — dwa statusy o tej samej nazwie) rozstrzygane liczbowym sufiksem. */
function slugifyToCode(label: string): string {
  const transliterated = label
    .split('')
    .map((ch) => DIACRITICS_MAP[ch] ?? ch)
    .join('');
  const words = transliterated.match(/[A-Za-z0-9]+/g) ?? ['Status'];
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/**
 * Katalog domyślny (9 wierszy) — identyczny z tym, jaki dziś ma DAWIDAM.
 * Historycznie powstał jednorazowym backfill-skryptem (Status Workflow
 * Refactor) usuniętym z repo po wykonaniu — do TEJ pory żadna firma założona
 * PO tamtym backfillu nie miała jak dostać własnego katalogu (`CasesService.create`
 * rzuca, jeśli katalog jest pusty). Producent/Dystrybutor + Partnerzy B2B
 * wymaga zakładania nowych firm w locie, więc to musi być reużywalna metoda,
 * nie jednorazowy skrypt — patrz `CaseStatusesService.seedDefaultCatalog`.
 */
export const DEFAULT_STATUS_CATALOG: Omit<
  Prisma.CaseStatusDefinitionCreateManyInput,
  'companyId'
>[] = [
  {
    code: 'Nowa',
    label: 'Nowa',
    order: 1,
    isFinal: false,
    isDefaultForNew: true,
    requiresConfirmation: false,
    portalStage: PortalStage.Zgloszona,
    isSystem: true,
  },
  {
    code: 'Przyjeta',
    label: 'Przyjęta',
    order: 2,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: false,
    portalStage: PortalStage.Przyjeta,
    isSystem: true,
  },
  {
    code: 'PrzekazanaDoProducenta',
    label: 'Przekazana do producenta / dystrybutora',
    order: 3,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: false,
    portalStage: PortalStage.WTrakcie,
    notifyCustomerTemplateCode: 'case.sent_to_manufacturer.customer',
    isSystem: true,
  },
  {
    code: 'DecyzjaPozytywna',
    label: 'Decyzja pozytywna – oczekujemy na realizację',
    order: 4,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: false,
    portalStage: PortalStage.Decyzja,
    notifyCustomerTemplateCode: 'case.status_changed.customer',
    isSystem: true,
  },
  {
    code: 'TowarWyslanyDoSerwisu',
    label: 'Towar wysłany do serwisu',
    order: 5,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: false,
    portalStage: PortalStage.Decyzja,
    isSystem: true,
  },
  {
    code: 'TowarWrocilZSerwisu',
    label: 'Towar wrócił z serwisu – oczekuje na odbiór',
    order: 6,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: false,
    portalStage: PortalStage.Zakonczona,
    notifyCustomerTemplateCode: 'case.ready_for_pickup.customer',
    isSystem: true,
  },
  {
    code: 'DecyzjaNegatywna',
    label: 'Decyzja negatywna',
    order: 7,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: true,
    portalStage: PortalStage.Decyzja,
    notifyCustomerTemplateCode: 'case.status_changed.customer',
    isSystem: true,
  },
  {
    code: 'Zakonczona',
    label: 'Zakończona',
    order: 8,
    isFinal: true,
    isDefaultForNew: false,
    requiresConfirmation: true,
    portalStage: PortalStage.Zakonczona,
    notifyCustomerTemplateCode: 'case.closed.customer',
    isSystem: true,
  },
  {
    code: 'ReklamacjaPonownie',
    label: 'Reklamacja zgłoszona ponownie',
    order: 9,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: true,
    portalStage: PortalStage.WTrakcie,
    isSystem: true,
  },
  // Etap 2 (Dashboard Producenta/Dystrybutora) — kafelek "Oczekujące na partnera" potrzebuje
  // REALNEGO, ręcznie ustawianego statusu (dokładnie ten sam wzorzec co `PrzekazanaDoProducenta`
  // — pracownik świadomie oznacza "czekam na firmę, która zgłosiła sprawę"), bo w przeciwieństwie
  // do B2C (gdzie "czeka na klienta" da się wyliczyć z niespełnionych wymagań completeness) nie ma
  // żadnego innego sygnału dla B2B. Bez WŁASNEGO statusu ten kafelek pokazywałby zawsze 0.
  {
    code: 'OczekiwanieNaPartnera',
    label: 'Oczekiwanie na partnera',
    order: 10,
    isFinal: false,
    isDefaultForNew: false,
    requiresConfirmation: false,
    portalStage: PortalStage.WTrakcie,
    isSystem: true,
  },
];

/**
 * `caseStatuses.manage`/`caseStatuses.view` — Status Workflow Refactor.
 * Katalog statusów reklamacji per firma. Pracownik może wybrać KAŻDY aktywny
 * status w dowolnym momencie (patrz `CasesService.performTransition`) — ten
 * serwis nie zna/nie definiuje LEGALNYCH przejść, tylko metadane statusu.
 * Status NIGDY nie jest fizycznie usuwany (brak metody `delete`) — wyłącznie
 * `active:false`, zablokowane (CASE-015), jeśli status jest używany przez
 * aktywną (nie-finalną) sprawę.
 */
@Injectable()
export class CaseStatusesService {
  constructor(private readonly repository: CaseStatusesRepository) {}

  /** Zakładanie nowej firmy (Sklep albo Producent/Dystrybutor) — bez tego `CasesService.create` nie miałby jak wybrać statusu początkowego (rzuca, gdy katalog firmy jest pusty). Idempotentne — jeśli firma ma już JAKIKOLWiek status, nic nie robi (nie nadpisuje ręcznych zmian admina). */
  async seedDefaultCatalog(companyId: string): Promise<void> {
    const existing = await this.repository.findAllForCompany(companyId);
    if (existing.length > 0) return;
    await this.repository.createMany(companyId, DEFAULT_STATUS_CATALOG);
  }

  async findAllForCompany(companyId: string): Promise<CaseStatusEntity[]> {
    return CaseStatusMapper.toEntityList(await this.repository.findAllForCompany(companyId));
  }

  async findActiveForCompany(companyId: string): Promise<CaseStatusEntity[]> {
    return CaseStatusMapper.toEntityList(await this.repository.findActiveForCompany(companyId));
  }

  async findById(id: string, companyId: string): Promise<CaseStatusEntity> {
    const status = await this.repository.findById(id, companyId);
    if (!status) throw new NotFoundException();
    return CaseStatusMapper.toEntity(status);
  }

  /** Używane przez `CasesService` (nie przez controller) — zwraca `null` zamiast rzucać, wołający decyduje o kodzie błędu (CASE-016). Wymaga `active:true` — pracownik może wybrać tylko AKTYWNY status jako NOWY cel przejścia. */
  findActiveByCode(code: string, companyId: string) {
    return this.repository.findByCode(code, companyId).then((s) => (s && s.active ? s : null));
  }

  /** Jak `findActiveByCode`, ale BEZ wymogu `active:true` — dla odczytów, gdzie liczy się metadana statusu (np. `isFinal`) niezależnie od tego, czy admin go później dezaktywował (np. sprawa nadal referencjonuje dezaktywowany status). */
  findByCode(code: string, companyId: string) {
    return this.repository.findByCode(code, companyId);
  }

  private async generateUniqueCode(label: string, companyId: string): Promise<string> {
    const base = slugifyToCode(label);
    const existing = await this.repository.countCodesWithPrefix(base, companyId);
    return existing === 0 ? base : `${base}${existing + 1}`;
  }

  async create(companyId: string, dto: CreateCaseStatusDto): Promise<CaseStatusEntity> {
    const code = await this.generateUniqueCode(dto.label, companyId);
    const order = dto.order ?? ((await this.repository.maxOrder(companyId))._max.order ?? 0) + 1;
    const created = await this.repository.create(companyId, {
      code,
      label: dto.label,
      description: dto.description ?? null,
      order,
      active: true,
      isFinal: dto.isFinal ?? false,
      isDefaultForNew: false,
      requiresConfirmation: false,
      requiredCheck: null,
      // Bezpieczny domyślny "w trakcie" — admin nie definiuje mapowania na Portal
      // Klienta przy tworzeniu statusu (poza zakresem wymagania właściciela §9).
      portalStage: PortalStage.WTrakcie,
      defaultNextAction: null,
      notifyCustomerTemplateCode: null,
      isSystem: false,
    });
    return CaseStatusMapper.toEntity(created);
  }

  async update(id: string, companyId: string, dto: UpdateCaseStatusDto): Promise<CaseStatusEntity> {
    const current = await this.repository.findById(id, companyId);
    if (!current) throw new NotFoundException();

    if (dto.active === false && current.active && !current.isFinal) {
      const usedByCases = await this.repository.countCasesUsingCode(current.code, companyId);
      if (usedByCases > 0) {
        throw new AppException(
          ERROR_CODES.CASE_015.code,
          `${ERROR_CODES.CASE_015.message} (${usedByCases} ${usedByCases === 1 ? 'sprawa' : 'spraw'}).`,
          ERROR_CODES.CASE_015.status,
        );
      }
    }

    const updated = await this.repository.update(id, {
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.order !== undefined ? { order: dto.order } : {}),
      ...(dto.isFinal !== undefined ? { isFinal: dto.isFinal } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
    });
    return CaseStatusMapper.toEntity(updated);
  }

  async reorder(companyId: string, dto: ReorderCaseStatusesDto): Promise<CaseStatusEntity[]> {
    // Sprawdź, że KAŻDE id należy do tej firmy, ZANIM cokolwiek zapiszemy (IDOR — inaczej firma A mogłaby przesunąć kolejność wiersza firmy B, znając samo UUID).
    const owned = await this.repository.findAllForCompany(companyId);
    const ownedIds = new Set(owned.map((s) => s.id));
    for (const id of dto.statusIds) {
      if (!ownedIds.has(id)) throw new NotFoundException();
    }

    await this.repository.runInTransaction(async (tx) => {
      for (let i = 0; i < dto.statusIds.length; i += 1) {
        await this.repository.updateOrder(dto.statusIds[i], i + 1, tx);
      }
    });

    return this.findAllForCompany(companyId);
  }
}
