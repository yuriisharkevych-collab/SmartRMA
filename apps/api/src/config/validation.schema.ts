import * as Joi from 'joi';

/**
 * Walidacja zmiennych środowiskowych przy starcie aplikacji — awaria startu
 * z czytelnym komunikatem jest tańsza niż awaria w środku żądania HTTP.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  API_GLOBAL_PREFIX: Joi.string().default('api'),

  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  JWT_PORTAL_SECRET: Joi.string().min(16).required(),
  JWT_PORTAL_EXPIRES_IN: Joi.string().default('30m'),

  BCRYPT_ROUNDS: Joi.number().integer().min(4).max(15).default(10),

  // Klucz szyfrowania sekretów modułu e-mail (hasło SMTP, klucz API Resend —
  // EmailSettings). AES-256-GCM z kluczem SHA-256(ten string) — patrz
  // EncryptionService. Minimalna długość analogicznie do sekretów JWT.
  ENCRYPTION_KEY: Joi.string().min(32).required(),

  // Co ile ms NotificationDispatcherService odpytuje Notification.status=Pending/Failed
  // do wysyłki (EVENTS.md §11.2) — dispatcher jest jedyną ścieżką faktycznej
  // wysyłki (nie tylko odzyskiwaniem), patrz mail/notification-dispatcher.service.ts.
  NOTIFICATION_DISPATCH_INTERVAL_MS: Joi.number().integer().min(1000).default(10000),

  // Katalog na załączniki (IStorageService, dysk lokalny MVP). Ścieżka
  // relatywna liczona od CWD procesu (czyli `apps/api` przy uruchomieniu
  // przez skrypty npm) — ta sama konwencja co `.env` w @nestjs/config.
  UPLOADS_DIR: Joi.string().default('uploads'),

  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('debug'),

  // Ustawienia › Backup — WYŁĄCZNIE informacyjne (patrz configuration.ts).
  // Opcjonalne: brak = ekran szczerze pokazuje "nieskonfigurowane".
  BACKUP_STORAGE_LOCATION: Joi.string().optional(),

  // Fundament „Fresh Install" — Platform Admin (patrz configuration.ts,
  // PlatformAuthConfig). Opcjonalne: brak = funkcja pozostaje nieaktywna,
  // nie blokuje startu reszty aplikacji (identyczny kompromis co BACKUP_*).
  PLATFORM_JWT_SECRET: Joi.string().min(16).optional(),
  PLATFORM_JWT_EXPIRES_IN: Joi.string().default('30m'),

  // Fundament „Fresh Install" — nadawca e-maili cyklu życia konta
  // (potwierdzenie adresu, reset hasła), NIEZALEŻNY od EmailSettings
  // per-tenant (patrz PlatformMailConfig). Wszystkie opcjonalne.
  PLATFORM_MAIL_PROVIDER: Joi.string().valid('Resend', 'Smtp').optional(),
  PLATFORM_MAIL_SENDER_NAME: Joi.string().optional(),
  PLATFORM_MAIL_SENDER_EMAIL: Joi.string().optional(),
  PLATFORM_RESEND_API_KEY: Joi.string().optional(),
  PLATFORM_SMTP_HOST: Joi.string().optional(),
  PLATFORM_SMTP_PORT: Joi.number().integer().optional(),
  PLATFORM_SMTP_USERNAME: Joi.string().optional(),
  PLATFORM_SMTP_PASSWORD: Joi.string().optional(),
  PLATFORM_SMTP_ENCRYPTION: Joi.string().valid('None', 'Tls', 'Ssl').default('Tls'),
});
