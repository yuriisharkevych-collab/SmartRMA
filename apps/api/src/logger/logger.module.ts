import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

/**
 * Logger strukturalny (JSON w produkcji, czytelny w dev przez pino-pretty).
 * Import raz w `AppModule` — od tej pory wstrzykiwalny `Logger`/`PinoLogger`
 * wszędzie, plus automatyczny access log dla każdego żądania HTTP.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('logger.level'),
          transport:
            config.get<string>('app.nodeEnv') !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
              : undefined,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          autoLogging: true,
        },
      }),
    }),
  ],
})
export class LoggerModule {}
