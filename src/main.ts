import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { mkdirSync } from 'fs';
import helmet from 'helmet';
import { join } from 'path';

import { AppModule } from './app.module';
import { SocketIoAdapter } from './common/adapters/socket-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  const uploadsDir = join(process.cwd(), 'uploads');
  mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });
  app.setGlobalPrefix('api');
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const corsOrigin = configService.get<string>(
    'CORS_ORIGIN',
    'http://localhost:5173',
  );
  const corsOrigins = corsOrigin.split(',').map((origin) => origin.trim());
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useWebSocketAdapter(new SocketIoAdapter(app, corsOrigins));

  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Jewelry Shop API')
      .setDescription('REST + Socket.IO API for the Jewelry Shop project')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}

void bootstrap();
