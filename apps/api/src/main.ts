import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { toValidationException } from './common/validation/to-validation-exception';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const config = app.get(ConfigService);
  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.enableCors({ origin: config.get<string[]>('cors.origin'), credentials: true });

  const globalPrefix = config.get<string>('app.globalPrefix')!;
  app.setGlobalPrefix(globalPrefix, { exclude: ['health', 'version'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      exceptionFactory: toValidationException,
    }),
  );

  // Swagger/OpenAPI — jednocześnie pierwszy realny szkic API.md (patrz raport gotowości, Zadanie 7, finding Critical).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SmartRMA AI — API')
    .setDescription('Dokumentacja API. Źródło prawdy dla procesu/reguł: docs/architecture/*.md.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, swaggerDocument);

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const port = config.get<number>('app.port')!;
  await app.listen(port);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Nie udało się uruchomić aplikacji:', error);
  process.exit(1);
});
