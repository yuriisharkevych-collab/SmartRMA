import { INestApplication, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Jedyny punkt dostępu do bazy — każdy `*.repository.ts` wstrzykuje ten
 * serwis, nigdy nie tworzy własnego `PrismaClient`. `$transaction` używany
 * bezpośrednio stąd w serwisach domenowych, które wymagają atomowości
 * (patrz EVENTS.md §6.1 — niezmienniki w tej samej transakcji co mutacja).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Połączono z bazą danych.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Wołane z `main.ts`, żeby Nest zamknął się razem z zamknięciem połączenia do bazy. */
  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.on('beforeExit', () => {
      void app.close();
    });
  }
}
