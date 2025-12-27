import { createHash } from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { v2 as cloudinary } from 'cloudinary';
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

  private async collectAllNestedTransformedImages(
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
      const nestedIds = await this.collectAllNestedTransformedImages(
        nested.id,
        collected,
      );
      allIds.push(...nestedIds);
    }

    return allIds;
  }

  async remove(userId: string, id: string) {
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
          'You are not authorized to delete this transformed image',
        );
      }

      // Collect all nested transformed image IDs (including the one being deleted)
      const collected = new Set<string>();
      const allTransformedImageIds =
        await this.collectAllNestedTransformedImages(id, collected);

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
      const cacheDeletePromises = allTransformedImages.map(async (ti) => {
        try {
          // Reconstruct the cache key using the stored transformation
          const transformImageDto =
            ti.transformation as unknown as TransformImageDto;

          // For nested transformed images, the cache key uses the parent's ID
          // If parentId is null, this is a direct transformation (shouldn't happen in this service)
          // Otherwise, use the parentId to generate the cache key
          if (ti.parentId) {
            const cacheKey = this.generateTransformedTransformedImageCacheKey(
              userId,
              ti.parentId,
              transformImageDto,
            );

            // Check if cache entry exists and delete it
            const cachedValue = await this.cacheManager.get(cacheKey);

            if (cachedValue) {
              await this.cacheManager.del(cacheKey);
            }
          }
        } catch (error) {
          console.error(
            `Failed to delete cache entry for transformed image:`,
            error,
          );
          // Continue even if cache deletion fails
        }
      });

      // Delete all transformed images from Cloudinary in parallel
      const deletePromises = allTransformedImages.map((ti) =>
        cloudinary.uploader.destroy(ti.publicId).catch((error) => {
          console.error(
            `Failed to delete transformed image with publicId ${ti.publicId} from Cloudinary:`,
            error,
          );
          // Continue even if Cloudinary deletion fails
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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { publicId, originalImage, transformedTransformedImages, ...rest } =
        transformedImage;

      return {
        ...rest,
        transformedTransformedImages: transformedTransformedImages.map(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ({ publicId, ...rest }) => ({
            ...rest,
          }),
        ),
      };
    } catch (error) {
      this.handleError(error, `delete transformed image with ID ${id}`);
    }
  }
}
