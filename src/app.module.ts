import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { LoggingMiddleware } from './logging/logging.middleware';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { ImagesModule } from './images/images.module';
import { AwsS3Service } from './aws-s3/aws-s3.service';
import { TransformedImagesModule } from './transformed-images/transformed-images.module';

@Module({
  imports: [
    AuthModule,
    ImagesModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TransformedImagesModule,
  ],
  controllers: [],
  providers: [PrismaService, AwsS3Service],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
