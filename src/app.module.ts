import { MiddlewareConsumer, Module } from '@nestjs/common';

import { LoggingMiddleware } from './logging/logging.middleware';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
