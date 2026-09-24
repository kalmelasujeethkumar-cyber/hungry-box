import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HungryBoxIoAdapter } from './modules/realtime/cors-io.adapter';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production');
  }

  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const apiPrefix = config.get<string>('API_PREFIX', 'api');
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigins = config
    .get<string>('CORS_ORIGINS', '')
    .trim()
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
    });
  }

  app.useWebSocketAdapter(
    new HungryBoxIoAdapter(app, corsOrigins.length > 0 ? corsOrigins : undefined),
  );

  const port = Number(config.get<string>('PORT', '3000'));
  await app.listen(port);
  Logger.log(`Hungry Box API listening on http://localhost:${port}/${apiPrefix}`, 'Bootstrap');
}

void bootstrap();
