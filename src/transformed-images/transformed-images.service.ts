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
  NotFoundException,
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

    if (
      error instanceof BadRequestException ||
      error instanceof NotFoundException ||
      error instanceof ForbiddenException
    ) {
      throw error;
    }

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  private generateTransformedTransformedImageCacheKey(
    userId: string,
    transformedImageId: string,
    transformImageDto: TransformImageDto,
    isNested: boolean = true,
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

    return `bildtransformator:users:${userId}:${prefix}:${transformedImageId}-${hash}`;
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
  async likeUnlike(userId: string, id: string) {
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

      // If transformed image is private, only the owner can like/unlike it
      if (
        !transformedImage.isPublic &&
        transformedImage.originalImage.userId !== userId
      ) {
        throw new ForbiddenException(
          'You are not authorized to like/unlike this private transformed image',
        );
      }

      // Check if like already exists
      const existingLike = await this.prismaService.like.findFirst({
        where: {
          userId,
          transformedImageId: id,
        },
      });

      if (existingLike) {
        // Unlike: delete the existing like
        await this.prismaService.like.delete({
          where: {
            id: existingLike.id,
          },
        });
      } else {
        // Like: create new like
        await this.prismaService.like.create({
          data: {
            userId,
            transformedImageId: id,
          },
        });
      }

      // Success
      return true;
    } catch (error) {
      this.handleError(error, 'like or unlike transformed image');
    }
  }

  async download(id: string, userId: string) {
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

      // If transformed image is public, any authenticated user can download it
      // If transformed image is private, only the owner can download it
      if (
        !transformedImage.isPublic &&
        transformedImage.originalImage.userId !== userId
      ) {
        throw new ForbiddenException(
          'You are not authorized to download this transformed image',
        );
      }

      // For MongoDB, we need to increment the count manually
      // Prisma's increment might not work reliably with MongoDB
      await this.prismaService.transformedImage.update({
        where: {
          id,
        },
        data: {
          downloadsCount: (transformedImage.downloadsCount ?? 0) + 1,
        },
      });

      // Success
      return true;
    } catch (error) {
      this.handleError(error, 'download transformed image');
    }
  }

  async togglePublic(userId: string, id: string) {
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
          'You are not authorized to toggle public status of this transformed image',
        );
      }

      await this.prismaService.transformedImage.update({
        where: {
          id,
        },
        data: {
          isPublic: !transformedImage.isPublic,
        },
      });

      // Success
      return true;
    } catch (error) {
      this.handleError(error, 'toggle transformed image public status');
    }
  }

  async findOnePublic(id: string) {
    try {
      const transformedImage =
        await this.prismaService.transformedImage.findUnique({
          where: {
            id,
            isPublic: true,
          },
          include: {
            transformedTransformedImages: {
              where: {
                isPublic: true,
              },
            },
            originalImage: {
              select: {
                originalName: true,
                userId: true,
              },
            },
            likes: true,
          },
        });

      if (!transformedImage) {
        throw new NotFoundException(
          `Public transformed image with ID ${id} not found`,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { publicId, ...rest } = transformedImage;

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
      this.handleError(error, `fetch public transformed image with ID ${id}`);
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
            transformedTransformedImages: {
              include: {
                likes: true,
              },
            },
            likes: true,
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
    transformedTransformedImageId: string,
    collected: Set<string>,
  ) {
    if (collected.has(transformedTransformedImageId)) {
      return [];
    }

    collected.add(transformedTransformedImageId);

    // Get all nested transformed images (children)
    const nestedTransformedImages =
      await this.prismaService.transformedImage.findMany({
        where: {
          parentId: transformedTransformedImageId,
        },
      });

    const allIds = [transformedTransformedImageId];

    // Recursively collect nested transformed images
    for (const nestedTransformedImage of nestedTransformedImages) {
      const nestedIds = await this.collectAllNestedTransformedImages(
        nestedTransformedImage.id,
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
            originalImage: true,
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

      // Collect all nested transformed image IDs (including nested ones)
      const collected = new Set<string>();
      const allTransformedTransformedImageIds: string[] = [];

      for (const transformedTransformedImage of transformedImage.transformedTransformedImages) {
        const ids = await this.collectAllNestedTransformedImages(
          transformedTransformedImage.id,
          collected,
        );
        allTransformedTransformedImageIds.push(...ids);
      }

      // Fetch all transformed transformed images to get their publicIds, transformations, and parentIds
      const allTransformedTransformedImages =
        allTransformedTransformedImageIds.length > 0
          ? await this.prismaService.transformedImage.findMany({
              where: {
                id: {
                  in: allTransformedTransformedImageIds,
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

      // Delete cache entries for all transformed transformed images
      const cacheDeletePromises = allTransformedTransformedImages.map(
        async (transformedTransformedImage) => {
          try {
            // Reconstruct the cache key using the stored transformation
            const transformImageDto =
              transformedTransformedImage.transformation as unknown as TransformImageDto;

            // All transformed-transformed images are nested (they have a parentId)
            // Use the parent transformed image ID that was used when creating the cache key
            const cacheKey = this.generateTransformedTransformedImageCacheKey(
              userId,
              transformedTransformedImage.parentId, // Parent ID is the source transformed image ID
              transformImageDto,
            );

            // Check if cache entry exists and delete it
            const cachedValue = await this.cacheManager.get(cacheKey);

            if (cachedValue) {
              await this.cacheManager.del(cacheKey);
            }
          } catch (error) {
            console.error(
              `Failed to delete cache entry for transformed transformed image:`,
              error,
            );
            // Continue even if cache deletion fails
          }
        },
      );

      // Delete cache entry for the transformed image itself
      cacheDeletePromises.push(
        (async () => {
          try {
            const transformImageDto =
              transformedImage.transformation as unknown as TransformImageDto;

            const cacheKey = this.generateTransformedTransformedImageCacheKey(
              userId,
              transformedImage.parentId === null
                ? transformedImage.originalImageId // Use original image ID for direct transformations
                : transformedImage.parentId, // Use parent ID for nested transformations
              transformImageDto,
              transformedImage.parentId !== null, // isNested flag
            );

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
        })(),
      );

      // Delete all transformed transformed images from Cloudinary in parallel
      const deletePromises = allTransformedTransformedImages.map(
        (transformedTransformedImage) =>
          cloudinary.uploader
            .destroy(transformedTransformedImage.publicId)
            .catch((error) => {
              console.error(
                `Failed to delete transformed transformed image with publicId ${transformedTransformedImage.publicId} from Cloudinary:`,
                error,
              );
              // Continue even if Cloudinary deletion fails
            }),
      );

      // Also delete the transformed image itself from Cloudinary
      deletePromises.push(
        cloudinary.uploader
          .destroy(transformedImage.publicId)
          .catch((error) => {
            console.error(
              `Failed to delete transformed image ${transformedImage.id} from Cloudinary:`,
              error,
            );
            // Continue with database deletion even if Cloudinary deletion fails
          }),
      );

      // Wait for all Cloudinary deletions to complete
      await Promise.all([...cacheDeletePromises, ...deletePromises]);

      // Delete all transformed transformed images from database (including nested ones)
      // We need to delete children first, then parents, to avoid violating the self-relation constraint
      if (allTransformedTransformedImages.length > 0) {
        // Build a set of IDs that are parents (have children)
        const parentIds = new Set(
          allTransformedTransformedImages
            .map((ti) => ti.parentId)
            .filter((pid): pid is string => pid !== null),
        );

        // Delete in batches from bottom-up: keep deleting leaf nodes until all are gone
        const remainingIds = new Set(
          allTransformedTransformedImages.map((ti) => ti.id),
        );
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

          // Remove deleted IDs from remaining set and parent set
          leafNodeIds.forEach((id) => {
            remainingIds.delete(id);
            parentIds.delete(id);
          });

          hasMoreToDelete = remainingIds.size > 0;
        }
      }

      // Finally, delete the transformed image itself from database
      await this.prismaService.transformedImage.delete({
        where: {
          id,
        },
      });

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
