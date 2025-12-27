import { createHash } from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { TransformedImage } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';
import { TransformImageDto } from 'src/images/dto/transform-image.dto';

@Injectable()
export class TransformedImagesService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectQueue('transformed-images') private transformedImagesQueue: Queue,
  ) {}

  private handleError(error: any, action: string) {
    console.error(`Failed to ${action}:`, error);

    if (error instanceof BadRequestException) {
      throw error;
    } else if (error instanceof ForbiddenException) {
      throw error;
    }

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  private generateTransformedTransformedImageCacheKey(
    userId: string,
    transformedImageId: string,
    transformImageDto: TransformImageDto,
  ): string {
    const filteredOptions = Object.fromEntries(
      Object.entries(transformImageDto).filter(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ([_, value]) => value !== undefined && value !== null,
      ),
    );
    const sortedOptions = Object.fromEntries(
      Object.entries(filteredOptions).sort(([a], [b]) => a.localeCompare(b)),
    );
    const hash = createHash('sha256')
      .update(JSON.stringify(sortedOptions))
      .digest('hex');

    return `bildtransformator:users:${userId}:transformed-transformations:${transformedImageId}-${hash}`;
  }

  async transform(
    userId: string,
    id: string,
    transformImageDto: TransformImageDto,
  ) {
    try {
      const transformedImage =
        await this.prismaService.transformedImage.findUnique({
          where: {
            id,
          },
          include: {
            originalImage: true,
          },
        });

      if (!transformedImage) {
        throw new BadRequestException('Transformed image not found');
      }

      if (transformedImage.originalImage.userId !== userId) {
        throw new ForbiddenException(
          'You are not authorized to transform this transformed image',
        );
      }

      const transformedTransformedImageCacheKey =
        this.generateTransformedTransformedImageCacheKey(
          userId,
          id,
          transformImageDto,
        );

      const transformedTransformedImage: TransformedImage =
        await this.cacheManager.get(transformedTransformedImageCacheKey);

      if (transformedTransformedImage) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { publicId, ...rest } = transformedTransformedImage;

        return {
          ...rest,
        };
      }

      const job = await this.transformedImagesQueue.add('transform', {
        userId,
        transformedImage,
        transformImageDto,
        transformedTransformedImageCacheKey,
      });

      return {
        jobId: job.id,
      };
    } catch (error) {
      this.handleError(error, 'transform transformed image');
    }
  }

  async findOne(userId: string, id: string) {
    try {
      const transformedImage =
        await this.prismaService.transformedImage.findUnique({
          where: {
            id,
          },
          include: {
            originalImage: {
              select: {
                userId: true,
              },
            },
            transformedTransformedImages: true,
          },
        });

      if (!transformedImage) {
        throw new BadRequestException(
          `Transformed image with ID ${id} not found`,
        );
      }

      if (transformedImage.originalImage.userId !== userId) {
        throw new ForbiddenException(
          'You are not authorized to access this transformed image',
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { publicId, originalImage, ...rest } = transformedImage;

      return {
        ...rest,
        transformedTransformedImages:
          transformedImage.transformedTransformedImages.map(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ({ publicId, ...rest }) => ({
              ...rest,
            }),
          ),
      };
    } catch (error) {
      this.handleError(error, `fetch transformed image with ID ${id}`);
    }
  }

  // async remove(userId: string, id: string) {
  //   try {
  //     const transformedImage = await this.prismaService.transformedImage.delete(
  //       {
  //         where: {
  //           id,
  //         },
  //         include: {
  //           originalImage: true,
  //         },
  //       },
  //     );

  //     if (!transformedImage) {
  //       throw new BadRequestException(`Image with ID ${id} not found`);
  //     }

  //     if (transformedImage.originalImage.userId !== userId) {
  //       throw new ForbiddenException(
  //         `You do not have permission to delete this transformed image`,
  //       );
  //     }

  //     await this.awsS3Service.deleteFile(transformedImage.key);

  //     // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //     const { key, originalImage, ...rest } = transformedImage;

  //     return {
  //       ...rest,
  //       url:
  //         this.baseUrl + '/transformed-images/' + transformedImage.id + '/view',
  //     };
  //   } catch (error) {
  //     this.handleError(error, `delete transformed image with ID ${id}`);
  //   }
  // }
}
