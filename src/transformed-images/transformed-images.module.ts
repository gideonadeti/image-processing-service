import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { TransformedImagesService } from './transformed-images.service';
import { TransformedImagesController } from './transformed-images.controller';
import { AwsS3Service } from 'src/aws-s3/aws-s3.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'transformed-images' })],
  controllers: [TransformedImagesController],
  providers: [TransformedImagesService, AwsS3Service, PrismaService],
})
export class TransformedImagesModule {}
