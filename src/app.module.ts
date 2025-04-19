import { MiddlewareConsumer, Module } from '@nestjs/common';

import { LoggingMiddleware } from './logging/logging.middleware';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { ImagesModule } from './images/images.module';

@Module({
  imports: [AuthModule, ImagesModule],
  controllers: [],
  providers: [PrismaService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
