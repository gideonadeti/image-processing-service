import { createHash } from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v2 as cloudinary } from 'cloudinary';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { TransformImageDto } from './dto/transform-image.dto';
import { TransformedImage } from '@prisma/client';

@Injectable()
export class ImagesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectQueue('images') private imagesQueue: Queue,
  ) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new InternalServerErrorException(
        'Missing required Cloudinary environment variables',
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }

  private readonly baseUrl = this.configService.get<string>('BASE_URL');

  private handleError(error: any, action: string) {
    console.error(`Failed to ${action}:`, error);

    if (error instanceof BadRequestException) {
      throw error;
    } else if (error instanceof ForbiddenException) {
      throw error;
    }

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  private generateTransformedImageCacheKey(
    userId: string,
    imageId: string,
    transformImageDto: TransformImageDto,
    isNested: boolean = false,
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

    const prefix = isNested ? 'transformed-transformations' : 'transformations';

    return `bildtransformator:users:${userId}:${prefix}:${imageId}-${hash}`;
  }

  async uploadImageToCloudinary(image: Express.Multer.File, folder: string) {
    try {
      // Upload from buffer using data URI format for Cloudinary
      const dataUri = `data:${image.mimetype};base64,${image.buffer.toString('base64')}`;
      const response = await cloudinary.uploader.upload(dataUri, {
        folder,
      });

      return {
        publicId: response.public_id,
        secureUrl: response.secure_url,
      };
    } catch (error) {
      this.handleError(
        error,
        `upload image with original name '${image.originalname}' `,
      );
    }
  }

  async getFileBufferFromCloudinary(secureUrl: string) {
    try {
      const response = await fetch(secureUrl);

      if (!response.ok) {
        throw new BadRequestException(
          `Failed to fetch image from Cloudinary: ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();

      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.handleError(error, 'fetch image buffer from Cloudinary');
    }
  }

  async create(userId: string, file: Express.Multer.File) {
    const format = file.mimetype.split('/')[1];

    try {
      const { publicId, secureUrl } = await this.uploadImageToCloudinary(
        file,
        `Bildtransformator/users/${userId}/uploaded-images`,
      );
      const image = await this.prismaService.image.create({
        data: {
          userId,
          originalName: file.originalname,
          size: file.size,
          format,
          publicId,
          secureUrl,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { publicId: _, ...rest } = image;

      return {
        ...rest,
      };
    } catch (error) {
      this.handleError(error, 'upload image');
    }
  }

  async transform(
    userId: string,
    id: string,
    transformImageDto: TransformImageDto,
  ) {
    try {
      const image = await this.prismaService.image.findUnique({
        where: {
          id,
          userId,
        },
      });

      if (!image) {
        throw new BadRequestException('Image not found');
      }

      const transformedImageCacheKey = this.generateTransformedImageCacheKey(
        userId,
        id,
        transformImageDto,
      );

      const transformedImage: TransformedImage = await this.cacheManager.get(
        transformedImageCacheKey,
      );

      if (transformedImage) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { publicId: _, ...rest } = transformedImage;

        return {
          ...rest,
        };
      }

      const job = await this.imagesQueue.add('transform', {
        userId,
        image,
        transformImageDto,
        transformedImageCacheKey,
      });

      return {
        jobId: job.id,
      };
    } catch (error) {
      this.handleError(error, 'transform image');
    }
  }

  async likeUnlike(userId: string, id: string) {
    try {
      const image = await this.prismaService.image.findUnique({
        where: {
          id,
          userId,
        },
      });

      if (!image) {
        throw new BadRequestException('Image not found');
      }

      // Check if like already exists
      const existingLike = await this.prismaService.like.findUnique({
        where: {
          userId_imageId_transformedImageId: {
            userId,
            imageId: id,
            transformedImageId: null,
          },
        },
      });

      if (existingLike) {
        // Unlike: delete the existing like
        await this.prismaService.like.delete({
          where: {
            id: existingLike.id,
          },
        });

        // Unliked
        return false;
      }

      // Like: create new like
      await this.prismaService.like.create({
        data: {
          userId,
          imageId: id,
        },
      });

      // Liked
      return true;
    } catch (error) {
      this.handleError(error, 'like image');
    }
  }

  async download(userId: string, id: string) {
    try {
      const image = await this.prismaService.image.findUnique({
        where: {
          id,
          userId,
        },
      });

      if (!image) {
        throw new BadRequestException('Image not found');
      }

      await this.prismaService.download.create({
        data: {
          userId,
          imageId: id,
        },
      });

      // Success
      return true;
    } catch (error) {
      this.handleError(error, 'download image');
    }
  }

  async findAll(userId: string) {
    try {
      const images = await this.prismaService.image.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          transformedImages: true,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return images.map(({ publicId, ...rest }) => ({
        ...rest,
        transformedImages:
          rest.transformedImages
            .filter((ti) => ti.parentId === null) // Filter out nested transformed images
            .map(
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              ({ publicId, ...rest }) => ({
                ...rest,
              }),
            ) || [],
      }));
    } catch (error) {
      this.handleError(error, `'fetch images for user with ID ${userId}'`);
    }
  }

  private async collectAllTransformedImages(
    transformedImageId: string,
    collected: Set<string>,
  ) {
    if (collected.has(transformedImageId)) {
      return [];
    }

    collected.add(transformedImageId);

    // Get all nested transformed images (children)
    const nestedTransformedImages =
      await this.prismaService.transformedImage.findMany({
        where: {
          parentId: transformedImageId,
        },
      });

    const allIds = [transformedImageId];

    // Recursively collect nested transformed images
    for (const nested of nestedTransformedImages) {
      const nestedIds = await this.collectAllTransformedImages(
        nested.id,
        collected,
      );
      allIds.push(...nestedIds);
    }

    return allIds;
  }

  async remove(userId: string, id: string) {
    try {
      const image = await this.prismaService.image.findUnique({
        where: {
          id,
          userId,
        },
        include: {
          transformedImages: true,
        },
      });

      if (!image) {
        throw new BadRequestException(`Image with ID ${id} not found`);
      }

      // Collect all transformed image IDs (including nested ones)
      const collected = new Set<string>();
      const allTransformedImageIds: string[] = [];

      for (const transformedImage of image.transformedImages) {
        const ids = await this.collectAllTransformedImages(
          transformedImage.id,
          collected,
        );
        allTransformedImageIds.push(...ids);
      }

      // Fetch all transformed images to get their publicIds, transformations, and parentIds
      const allTransformedImages =
        allTransformedImageIds.length > 0
          ? await this.prismaService.transformedImage.findMany({
              where: {
                id: {
                  in: allTransformedImageIds,
                },
              },
              select: {
                id: true,
                publicId: true,
                transformation: true,
                parentId: true,
              },
            })
          : [];

      // Delete cache entries for all transformed images
      const cacheDeletePromises = allTransformedImages.map(
        async (transformedImage) => {
          try {
            // Reconstruct the cache key using the stored transformation
            const transformImageDto =
              transformedImage.transformation as unknown as TransformImageDto;

            // Direct transformation (from original image) - parentId is null
            // Nested transformation (from transformed image) - parentId is not null
            const cacheKey = this.generateTransformedImageCacheKey(
              userId,
              transformedImage.parentId === null
                ? id // Use the original imageId for direct transformations
                : transformedImage.parentId, // Use the parent transformed image ID for nested transformations
              transformImageDto,
              transformedImage.parentId !== null, // isNested flag
            );

            // Check if cache entry exists and delete it
            const cachedValue = await this.cacheManager.get(cacheKey);

            if (cachedValue) {
              await this.cacheManager.del(cacheKey);
            }
          } catch (error) {
            console.error(
              `Failed to delete cache entry for transformed image:`,
              error,
            );
            // Continue even if cache deletion fails
          }
        },
      );

      // Delete all transformed images from Cloudinary in parallel
      const deletePromises = allTransformedImages.map((transformedImage) =>
        cloudinary.uploader
          .destroy(transformedImage.publicId)
          .catch((error) => {
            console.error(
              `Failed to delete transformed image with publicId ${transformedImage.publicId} from Cloudinary:`,
              error,
            );
            // Continue even if Cloudinary deletion fails
          }),
      );

      // Also delete the original image from Cloudinary
      deletePromises.push(
        cloudinary.uploader.destroy(image.publicId).catch((error) => {
          console.error(
            `Failed to delete image ${image.id} from Cloudinary:`,
            error,
          );
          // Continue with database deletion even if Cloudinary deletion fails
        }),
      );

      // Wait for all cache deletions and Cloudinary deletions to complete (in parallel)
      await Promise.all([...cacheDeletePromises, ...deletePromises]);

      // Delete all transformed images from database (including nested ones)
      // We need to delete children first, then parents, to avoid violating the self-relation constraint
      // Use the already-fetched data to determine deletion order in memory (no additional queries)
      if (allTransformedImages.length > 0) {
        // Build a set of IDs that are parents (have children)
        const parentIds = new Set(
          allTransformedImages
            .map((ti) => ti.parentId)
            .filter((pid): pid is string => pid !== null),
        );

        // Delete in batches from bottom-up: keep deleting leaf nodes until all are gone
        const remainingIds = new Set(allTransformedImages.map((ti) => ti.id));
        let hasMoreToDelete = true;

        while (hasMoreToDelete && remainingIds.size > 0) {
          // Find leaf nodes (those that are not parents and are still remaining)
          const leafNodeIds = Array.from(remainingIds).filter(
            (nodeId) => !parentIds.has(nodeId),
          );

          if (leafNodeIds.length === 0) {
            // Should not happen, but safety check
            break;
          }

          // Delete leaf nodes
          await this.prismaService.transformedImage.deleteMany({
            where: {
              id: {
                in: leafNodeIds,
              },
            },
          });

          // Remove deleted nodes from remaining set and parentIds set
          leafNodeIds.forEach((nodeId) => {
            remainingIds.delete(nodeId);
            parentIds.delete(nodeId);
          });

          // Check if we're done
          hasMoreToDelete = remainingIds.size > 0;
        }
      }

      // Delete the original image from database
      await this.prismaService.image.delete({
        where: {
          id,
          userId,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { publicId, userId: _, transformedImages, ...rest } = image;

      return {
        ...rest,
        transformedImages: transformedImages.map(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ({ publicId, ...rest }) => ({
            ...rest,
          }),
        ),
      };
    } catch (error) {
      this.handleError(error, `delete image with ID ${id}`);
    }
  }
}
