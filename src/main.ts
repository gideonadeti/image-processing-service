import * as cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';

import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

const bootstrap = async () => {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const frontendBaseUrl = configService.get<string>(
    'FRONTEND_BASE_URL',
    'http://localhost:3001',
  );

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: frontendBaseUrl,
    credentials: true,
  });

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Bildtransformator')
    .setDescription(
      'A service similar to Cloudinary that allows users to upload images, apply transformations, and view or download the results.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const options: SwaggerDocumentOptions = {
    operationIdFactory: (_controllerKey: string, methodKey: string) =>
      methodKey,
  };

  const documentFactory = () =>
    SwaggerModule.createDocument(app, config, options);

  SwaggerModule.setup('api/v1/documentation', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
};

bootstrap();
