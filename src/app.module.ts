import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { LoggingMiddleware } from './logging/logging.middleware';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { ImagesModule } from './images/images.module';
import { AwsS3Service } from './aws-s3/aws-s3.service';
import { TransformedImagesModule } from './transformed-images/transformed-images.module';
import { minutes, ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    AuthModule,
    ImagesModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TransformedImagesModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: minutes(1),
          limit: 6,
          getTracker: (req) => req.user?.id,
        },
      ],
    }),
    CacheModule.register({ isGlobal: true }),
  ],
  controllers: [],
  providers: [PrismaService, AwsS3Service],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
