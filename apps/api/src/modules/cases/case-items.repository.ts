import { Injectable } from '@nestjs/common';
import { CaseItem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Wydzielone z `CasesRepository` (Zadanie 16, zakres zadania wymaga osobnego
 * repozytorium). Tworzenie pozycji nadal odbywa się zagnieżdżone w
 * `CasesRepository.create()` (`items: { create: [...] }`, jedna transakcja
 * Prisma) — to repozytorium obsługuje odczyt i jedyną udokumentowaną mutację
 * pozycji NIEZALEŻNĄ od tworzenia sprawy (BR-072 — zmiana sugerowanego
 * producenta pozycji), pominiętą w zakresie service/controller tego zadania
 * (nie ma dla niej endpointu w liście z Zadania 16), ale przygotowaną tu,
 * żeby repozytorium było kompletne.
 */
@Injectable()
export class CaseItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCaseId(caseId: string): Promise<CaseItem[]> {
    return this.prisma.caseItem.findMany({ where: { caseId } });
  }

  findById(id: string): Promise<CaseItem | null> {
    return this.prisma.caseItem.findUnique({ where: { id } });
  }

  updateManufacturer(id: string, manufacturerId: string | null): Promise<CaseItem> {
    return this.prisma.caseItem.update({ where: { id }, data: { manufacturerId } });
  }
}
