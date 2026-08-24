import { Injectable } from '@nestjs/common';
import { AiSettings, CompanySettings, EmailSettings, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

export type CompanySettingsUpdate = Partial<
  Omit<CompanySettings, 'id' | 'companyId' | 'updatedAt'>
>;
export type AiSettingsUpdate = Partial<Omit<AiSettings, 'id' | 'companyId' | 'updatedAt'>>;
export type EmailSettingsUpdate = Partial<Omit<EmailSettings, 'id' | 'companyId' | 'updatedAt'>>;

/**
 * Czyste operacje na `CompanySettings`/`AiSettings` — jeden wiersz na firmę,
 * tworzony leniwie (`upsert`) zamiast wymagać osobnego kroku "utwórz
 * ustawienia dla nowej firmy" (BR-086: jedna firma z seeda, ale kod ma
 * działać też, gdyby to założenie kiedyś odpadło).
 */
@Injectable()
export class CompanySettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCompanySettings(
    companyId: string,
    client: PrismaClientLike = this.prisma,
  ): Promise<CompanySettings | null> {
    return client.companySettings.findUnique({ where: { companyId } });
  }

  upsertCompanySettings(
    companyId: string,
    data: CompanySettingsUpdate,
    client: PrismaClientLike = this.prisma,
  ): Promise<CompanySettings> {
    return client.companySettings.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    });
  }

  findAiSettings(
    companyId: string,
    client: PrismaClientLike = this.prisma,
  ): Promise<AiSettings | null> {
    return client.aiSettings.findUnique({ where: { companyId } });
  }

  upsertAiSettings(
    companyId: string,
    data: AiSettingsUpdate,
    client: PrismaClientLike = this.prisma,
  ): Promise<AiSettings> {
    return client.aiSettings.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    });
  }

  findEmailSettings(
    companyId: string,
    client: PrismaClientLike = this.prisma,
  ): Promise<EmailSettings | null> {
    return client.emailSettings.findUnique({ where: { companyId } });
  }

  upsertEmailSettings(
    companyId: string,
    data: EmailSettingsUpdate,
    client: PrismaClientLike = this.prisma,
  ): Promise<EmailSettings> {
    return client.emailSettings.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    });
  }
}
