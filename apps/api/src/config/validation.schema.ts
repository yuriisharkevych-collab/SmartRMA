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

  // Katalog na załączniki (IStorageService, dysk lokalny MVP). Ścieżka
  // relatywna liczona od CWD procesu (czyli `apps/api` przy uruchomieniu
  // przez skrypty npm) — ta sama konwencja co `.env` w @nestjs/config.
  UPLOADS_DIR: Joi.string().default('uploads'),

  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('debug'),
});
