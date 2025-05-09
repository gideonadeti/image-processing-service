import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { JwtService } from '@nestjs/jwt';
import { ImagesService } from './images.service';
import { ImagesController } from './images.controller';
import { AwsS3Service } from 'src/aws-s3/aws-s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ImagesProcessor } from './images.processor';
import { AuthService } from 'src/auth/auth.service';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';

@Module({
  imports: [BullModule.registerQueue({ name: 'images' })],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    AwsS3Service,
    PrismaService,
    ImagesProcessor,
    JwtService,
    AuthService,
    NotificationsGateway,
  ],
})
export class ImagesModule {}
