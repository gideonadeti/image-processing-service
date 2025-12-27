import * as sharp from 'sharp';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InputJsonObject } from '@prisma/client/runtime/library';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';
import { TransformImageDto } from 'src/images/dto/transform-image.dto';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { ImagesService } from 'src/images/images.service';

@Processor('transformed-images', { concurrency: 2 })
export class TransformedImagesProcessor extends WorkerHost {
  private readonly logger = new Logger(TransformedImagesProcessor.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly imagesService: ImagesService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    super();
  }

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
        transformedImage,
        transformImageDto,
        transformedTransformedImageCacheKey,
      },
    } = job;

    try {
      const transformedImageBuffer =
        await this.imagesService.getFileBufferFromCloudinary(
          transformedImage.secureUrl,
        );

      const transformedTransformedImageBuffer = await this.transformImage(
        transformedImageBuffer,
        transformImageDto,
      );

      const transformedTransformedImageSize =
        transformedTransformedImageBuffer.length;

      const expressMulterFile = {
        buffer: transformedTransformedImageBuffer,
        originalname: transformedImage.originalImage.originalName,
        mimetype: `image/${transformedImage.originalImage.format}`,
        size: transformedTransformedImageSize,
      } as Express.Multer.File;

      const { publicId, secureUrl } =
        await this.imagesService.uploadImageToCloudinary(
          expressMulterFile,
          `Bildtransformator/users/${transformedImage.originalImage.userId}/transformed-transformed-images`,
        );

      const transformedTransformedImage =
        await this.prismaService.transformedImage.create({
          data: {
            originalImageId: transformedImage.originalImage.id,
            publicId,
            secureUrl,
            size: transformedTransformedImageSize,
            transformation: transformImageDto as unknown as InputJsonObject,
            parentId: transformedImage.id,
          },
        });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { publicId: _, ...rest } = transformedTransformedImage;

      await this.cacheManager.set(transformedTransformedImageCacheKey, rest);

      return rest;
    } catch (error) {
      this.handleError(error, 'process job');
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: any) {
    this.logger.log(`Job with ID ${job.id} completed`);

    this.notificationsGateway.emitToUser(
      job.data.userId,
      'transformed-image-transformation-completed',
      result,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job with ID ${job.id} failed`, error.stack);

    this.notificationsGateway.emitToUser(
      job.data.userId,
      'transformed-image-transformation-failed',
      { message: error.message },
    );
  }
}
