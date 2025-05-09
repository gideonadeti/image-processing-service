import * as sharp from 'sharp';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { AwsS3Service } from 'src/aws-s3/aws-s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { InputJsonObject } from 'generated/prisma/runtime/library';
import { TransformImageDto } from 'src/images/dto/transform-image.dto';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';

@Processor('transformed-images', { concurrency: 2 })
export class TransformedImagesProcessor extends WorkerHost {
  constructor(
    private readonly awsS3Service: AwsS3Service,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly notificationsGateway: NotificationsGateway,
  ) {
    super();
  }

  private readonly baseUrl = this.configService.get<string>('BASE_URL');

  private handleError(error: any, action: string) {
    console.error(`Failed to ${action}:`, error);

    if (
      error instanceof BadRequestException ||
      error instanceof ForbiddenException
    ) {
      throw error;
    }

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  private transformImage = async (
    imageBuffer: Buffer,
    transformImageDto: TransformImageDto,
  ) => {
    let transformedImage = sharp(imageBuffer);
    const { order, resize, crop, rotate, tint } = transformImageDto;

    for (const step of order) {
      switch (step) {
        case 'resize': {
          transformedImage = transformedImage.resize({
            width: resize.width,
            height: resize.height,
            fit: resize.fit || 'cover',
          });

          break;
        }

        case 'crop': {
          const metadata = await transformedImage.metadata();
          const { width: imgWidth, height: imgHeight } = metadata;
          const { width, height, left, top } = crop;

          if (left + width > imgWidth || top + height > imgHeight) {
            throw new BadRequestException('Crop area is out of bounds');
          }

          transformedImage = transformedImage.extract({
            left,
            top,
            width,
            height,
          });

          break;
        }

        case 'rotate': {
          transformedImage = transformedImage.rotate(rotate);

          break;
        }

        case 'grayscale': {
          transformedImage = transformedImage.grayscale();

          break;
        }

        case 'tint': {
          transformedImage = transformedImage.tint(tint);

          break;
        }

        default:
          throw new BadRequestException(`Unsupported transformation: ${step}`);
      }
    }

    return await transformedImage.toBuffer();
  };

  async process(job: Job) {
    const {
      data: {
        userId,
        transformedImage,
        transformImageDto,
        transformedTransformedImageCacheKey,
      },
    } = job;

    try {
      const transformedImageBuffer = await this.awsS3Service.getFileBuffer(
        transformedImage.key,
      );
      const transformedTransformedImageBuffer = await this.transformImage(
        transformedImageBuffer,
        transformImageDto,
      );
      const expressMulterFile = {
        buffer: transformedTransformedImageBuffer,
        originalname: transformedImage.originalImage.originalName,
        mimetype: `image/${transformedImage.originalImage.format}`,
      } as Express.Multer.File;
      const key = await this.awsS3Service.uploadFile(
        expressMulterFile,
        `${userId}/transformations`,
      );
      const transformedTransformedImage =
        await this.prismaService.transformedImage.create({
          data: {
            originalImageId: transformedImage.originalImage.id,
            key,
            transformation: transformImageDto as unknown as InputJsonObject,
            parentId: transformedImage.id,
          },
        });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key: _, ...rest } = transformedTransformedImage;
      const response = {
        ...rest,
        url:
          this.baseUrl +
          '/transformed-images/' +
          transformedTransformedImage.id +
          '/view',
      };

      await this.cacheManager.set(
        transformedTransformedImageCacheKey,
        response,
      );

      return response;
    } catch (error) {
      this.handleError(error, 'process job');
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: any) {
    Logger.log(
      `Job with ID ${job.id} completed`,
      TransformedImagesProcessor.name,
    );

    this.notificationsGateway.emitToUser(
      job.data.userId,
      'transformed-image-transformation-completed',
      result,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    Logger.error(
      `Job with ID ${job.id} failed`,
      error.stack,
      TransformedImagesProcessor.name,
    );

    this.notificationsGateway.emitToUser(
      job.data.userId,
      'transformed-image-transformation-failed',
      error.message,
    );
  }
}
