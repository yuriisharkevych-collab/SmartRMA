import * as path from 'node:path';

/**
 * Typowany dostęp do konfiguracji (`ConfigService.get<AppConfig>('app')` itd.),
 * zamiast rozsianych po serwisach `process.env.X`. Wartości już zwalidowane
 * przez `validation.schema.ts` w momencie startu modułu.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  globalPrefix: string;
}

export interface DatabaseConfig {
  url: string;
}

export interface RedisConfig {
  url: string;
}

export interface JwtConfig {
  accessSecret: string;
  accessExpiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

/**
 * Osobny sekret/TTL dla tokenu sesji Portalu Klienta (RBAC.md §1.2) —
 * celowo NIEZALEŻNY od `jwt.accessSecret` pracowników: inny profil zagrożeń
 * (BR-077/078), krótszy TTL, payload niesie wyłącznie `caseId`, nigdy `userId`.
 */
export interface PortalConfig {
  secret: string;
  expiresIn: string;
}

/** Zadanie 1 (Auth) — `BCRYPT_ROUNDS` konfigurowalny przez ENV zamiast stałej w kodzie (item 6/13). */
export interface BcryptConfig {
  rounds: number;
}

export interface CorsConfig {
  /** Lista dozwolonych originów frontendu — `CORS_ORIGIN` może zawierać kilka adresów rozdzielonych przecinkiem (np. do jednoczesnego testowania z `localhost` i adresu LAN na telefonie). */
  origin: string[];
}

/**
 * Fundament „Fresh Install" — publiczny adres aplikacji używany do budowy
 * linków wysyłanych w e-mailach/powiadomieniach (potwierdzenie adresu, reset
 * hasła, zaproszenie partnera, link Portalu Klienta) — CELOWO ODDZIELONY od
 * `CorsConfig.origin`, który steruje wyłącznie allow-listą CORS i może
 * zawierać kilka originów deweloperskich naraz (kolejność której nie da się
 * bezpiecznie interpretować jako "adres publiczny"). `PUBLIC_APP_URL` jest
 * opcjonalny — gdy nieustawiony, spada na dotychczasowe zachowanie
 * (pierwszy origin z `CORS_ORIGIN`), więc środowiska, które go jeszcze nie
 * skonfigurowały, działają bez zmian.
 */
export interface PublicUrlConfig {
  url: string;
}

/** `IStorageService` (dysk lokalny MVP, DECISIONS.md). `uploadsDir` jest ścieżką ABSOLUTNĄ — rozwiązaną raz tutaj, żeby implementacja nie liczyła jej z `__dirname` (co po kompilacji wskazywałoby wnętrze `dist/`, kasowane przy każdym buildzie). */
export interface StorageConfig {
  uploadsDir: string;
}

export interface LoggerConfig {
  level: string;
}

/**
 * Ustawienia › Backup — WYŁĄCZNIE informacyjne (żądanie: "Nie implementuj
 * jeszcze wykonywania backupów"). `location` to miejsce, które zespół
 * operacyjny skonfigurował poza aplikacją (np. zadanie cron na serwerze,
 * snapshot RDS) — SmartRMA go nie tworzy ani nie odczytuje z dysku, tylko
 * WYŚWIETLA to, co administrator wpisał do `.env`. Brak zmiennej = ekran
 * pokazuje szczerze "nieskonfigurowane", zamiast zgadywać.
 */
export interface BackupConfig {
  location: string | null;
  configured: boolean;
}

/** `EncryptionService` (hasło SMTP/klucz API Resend w `EmailSettings`, patrz `crypto/encryption.service.ts`). */
export interface EncryptionConfig {
  key: string;
}

/** `NotificationDispatcherService` (`mail/notification-dispatcher.service.ts`) — EVENTS.md §11.2. */
export interface MailDispatchConfig {
  intervalMs: number;
}

/**
 * Fundament „Fresh Install" — sekret JWT dla `PlatformAdmin`, CELOWO
 * ODDZIELNY od `JwtConfig` (pracownicy) i `PortalConfig` (Portal Klienta) —
 * dokładnie ten sam wzorzec izolacji domen uwierzytelniania, co już
 * istniejące rozdzielenie tamtych dwóch. Token podpisany `jwt.accessSecret`
 * nigdy nie przejdzie walidacji jako token platformowy i odwrotnie — nawet
 * błąd w guardzie nie pomyliłby tych dwóch światów, bo klucze są różne.
 * Opcjonalny w Joi (nie blokuje startu aplikacji) — funkcja Platform Admin
 * pozostaje nieaktywna (jasny błąd konfiguracji przy próbie użycia), dopóki
 * operator świadomie jej nie skonfiguruje, zamiast wymagać tego od każdego
 * dotychczasowego środowiska.
 */
export interface PlatformAuthConfig {
  jwtSecret: string | null;
  accessExpiresIn: string;
}

/**
 * Fundament „Fresh Install" — nadawca dla e-maili CYKLU ŻYCIA KONTA
 * (potwierdzenie adresu, reset hasła). Celowo ODDZIELNY od `EmailSettings`
 * per-tenant (`MailService.buildTransport`): w chwili wysyłki potwierdzenia
 * rejestracji NOWA firma z definicji NIE MA jeszcze skonfigurowanej własnej
 * poczty (Ustawienia › E-mail — ekran dostępny dopiero PO zalogowaniu, a
 * zalogować się można dopiero PO potwierdzeniu e-maila) — próba użycia
 * konfiguracji tenanta byłaby więc zawsze pusta. To samo dotyczy
 * `PlatformAdmin`, który w ogóle nie ma `companyId`. Ten sam kształt pól co
 * `EmailSettings` (żeby dało się użyć TYCH SAMYCH klas transportu,
 * `ResendTransport`/`SmtpTransport` — patrz `MailService.sendPlatformEmail`),
 * ale czytany z ENV, nie z bazy — jeden, systemowy nadawca dla całej
 * instalacji, nie per-tenant. W pełni opcjonalny (jak `backup` niżej) —
 * brak konfiguracji = te trzy przepływy (weryfikacja e-mail, ponowna
 * wysyłka, reset hasła) kończą się jawnym, nieudanym wynikiem wysyłki
 * zamiast cichej próby przez transport, którego nie ma.
 */
export interface PlatformMailConfig {
  provider: 'Resend' | 'Smtp' | null;
  senderName: string | null;
  senderEmail: string | null;
  resendApiKey: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpPassword: string | null;
  /** `SmtpEncryption` (`@prisma/client`) — string tutaj, żeby ten plik nie musiał importować klienta Prisma tylko po jeden typ; rzutowane w `MailService.buildPlatformTransport`, dokładnie tam, gdzie faktycznie trafia do `SmtpTransport`. */
  smtpEncryption: 'None' | 'Tls' | 'Ssl';
}

/**
 * `validationSchema` (Joi, patrz `validation.schema.ts`) gwarantuje przy
 * starcie modułu, że pola bez `??` niżej są obecne w `process.env`
 * (`.required()`) — `ConfigModule.forRoot` rzuca przed wywołaniem tej
 * fabryki, jeśli ich brak. Asercja `!` odzwierciedla tę gwarancję zamiast
 * dublować wartości domyślne, których i tak nie ma w schemacie Joi.
 */
export default () => {
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    app: {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      port: parseInt(process.env.PORT ?? '3000', 10),
      globalPrefix: process.env.API_GLOBAL_PREFIX ?? 'api',
    } satisfies AppConfig,
    database: {
      url: process.env.DATABASE_URL!,
    } satisfies DatabaseConfig,
    redis: {
      url: process.env.REDIS_URL!,
    } satisfies RedisConfig,
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET!,
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      refreshSecret: process.env.JWT_REFRESH_SECRET!,
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    } satisfies JwtConfig,
    portal: {
      secret: process.env.JWT_PORTAL_SECRET!,
      expiresIn: process.env.JWT_PORTAL_EXPIRES_IN ?? '30m',
    } satisfies PortalConfig,
    bcrypt: {
      rounds: parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10),
    } satisfies BcryptConfig,
    cors: {
      origin: corsOrigins,
    } satisfies CorsConfig,
    publicUrl: {
      url: process.env.PUBLIC_APP_URL ?? corsOrigins[0],
    } satisfies PublicUrlConfig,
    storage: {
      uploadsDir: path.resolve(process.cwd(), process.env.UPLOADS_DIR ?? 'uploads'),
    } satisfies StorageConfig,
    logger: {
      level: process.env.LOG_LEVEL ?? 'debug',
    } satisfies LoggerConfig,
    backup: {
      location: process.env.BACKUP_STORAGE_LOCATION ?? null,
      configured: Boolean(process.env.BACKUP_STORAGE_LOCATION),
    } satisfies BackupConfig,
    encryption: {
      key: process.env.ENCRYPTION_KEY!,
    } satisfies EncryptionConfig,
    mailDispatch: {
      intervalMs: parseInt(process.env.NOTIFICATION_DISPATCH_INTERVAL_MS ?? '10000', 10),
    } satisfies MailDispatchConfig,
    platformAuth: {
      jwtSecret: process.env.PLATFORM_JWT_SECRET ?? null,
      accessExpiresIn: process.env.PLATFORM_JWT_EXPIRES_IN ?? '30m',
    } satisfies PlatformAuthConfig,
    platformMail: {
      provider: (process.env.PLATFORM_MAIL_PROVIDER as 'Resend' | 'Smtp' | undefined) ?? null,
      senderName: process.env.PLATFORM_MAIL_SENDER_NAME ?? null,
      senderEmail: process.env.PLATFORM_MAIL_SENDER_EMAIL ?? null,
      resendApiKey: process.env.PLATFORM_RESEND_API_KEY ?? null,
      smtpHost: process.env.PLATFORM_SMTP_HOST ?? null,
      smtpPort: process.env.PLATFORM_SMTP_PORT
        ? parseInt(process.env.PLATFORM_SMTP_PORT, 10)
        : null,
      smtpUsername: process.env.PLATFORM_SMTP_USERNAME ?? null,
      smtpPassword: process.env.PLATFORM_SMTP_PASSWORD ?? null,
      smtpEncryption:
        (process.env.PLATFORM_SMTP_ENCRYPTION as 'None' | 'Tls' | 'Ssl' | undefined) ?? 'Tls',
    } satisfies PlatformMailConfig,
  };
};
