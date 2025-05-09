import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { minutes, ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';

import { LoggingMiddleware } from './logging/logging.middleware';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { ImagesModule } from './images/images.module';
import { AwsS3Service } from './aws-s3/aws-s3.service';
import { TransformedImagesModule } from './transformed-images/transformed-images.module';
import { JobsModule } from './jobs/jobs.module';

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
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          username: config.get<string>('REDIS_USERNAME'),
          password: config.get<string>('REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          attempts: 2,
          removeOnComplete: 10,
          removeOnFail: 10,
        },
      }),
    }),
    JobsModule,
  ],
  controllers: [],
  providers: [PrismaService, AwsS3Service],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
