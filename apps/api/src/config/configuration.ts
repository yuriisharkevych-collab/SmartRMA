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
  origin: string;
}

/** `IStorageService` (dysk lokalny MVP, DECISIONS.md). `uploadsDir` jest ścieżką ABSOLUTNĄ — rozwiązaną raz tutaj, żeby implementacja nie liczyła jej z `__dirname` (co po kompilacji wskazywałoby wnętrze `dist/`, kasowane przy każdym buildzie). */
export interface StorageConfig {
  uploadsDir: string;
}

export interface LoggerConfig {
  level: string;
}

/**
 * `validationSchema` (Joi, patrz `validation.schema.ts`) gwarantuje przy
 * starcie modułu, że pola bez `??` niżej są obecne w `process.env`
 * (`.required()`) — `ConfigModule.forRoot` rzuca przed wywołaniem tej
 * fabryki, jeśli ich brak. Asercja `!` odzwierciedla tę gwarancję zamiast
 * dublować wartości domyślne, których i tak nie ma w schemacie Joi.
 */
export default () => ({
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
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  } satisfies CorsConfig,
  storage: {
    uploadsDir: path.resolve(process.cwd(), process.env.UPLOADS_DIR ?? 'uploads'),
  } satisfies StorageConfig,
  logger: {
    level: process.env.LOG_LEVEL ?? 'debug',
  } satisfies LoggerConfig,
});
