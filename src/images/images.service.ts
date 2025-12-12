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

import { AwsS3Service } from 'src/aws-s3/aws-s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { FindAllImagesDto } from './dto/find-all-images.dto';
import { TransformImageDto } from './dto/transform-image.dto';
import { ViewOrDownloadImageDto } from './dto/view-or-download-image.dto';
import { TransformedImage } from '@prisma/client';

@Injectable()
export class ImagesService {
  constructor(
    private readonly awsS3Service: AwsS3Service,
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

    return `${userId}:transformations:${imageId}-${hash}`;
  }

  async uploadImageToCloudinary(
    image: Express.Multer.File,
    folder = 'Bildtransformator-Images',
  ) {
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
        `upload image with original name '${image.originalname}' to folder '${folder}'`,
      );
    }
  }

  async getFileBufferFromCloudinary(secureUrl: string): Promise<Buffer> {
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
      const { publicId, secureUrl } = await this.uploadImageToCloudinary(file);
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

  async findAll(userId: string) {
    try {
      const images = await this.prismaService.image.findMany({
        where: {
          userId,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return images.map(({ publicId, ...rest }) => ({
        ...rest,
      }));
    } catch (error) {
      this.handleError(error, `'fetch images for user with ID ${userId}'`);
    }
  }

  // async findOne(userId: string, id: string) {
  //   try {
  //     const image = await this.prismaService.image.findUnique({
  //       where: {
  //         id,
  //       },
  //     });

  //     if (!image) {
  //       throw new BadRequestException(`Image with ID ${id} not found`);
  //     }

  //     if (image.userId !== userId) {
  //       throw new ForbiddenException(
  //         'You are not authorized to view this image',
  //       );
  //     }

  //     // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //     const { publicId, userId: _, ...rest } = image;

  //     return {
  //       ...rest,
  //     };
  //   } catch (error) {
  //     this.handleError(error, `fetch image with ID ${id}`);
  //   }
  // }

  // async findAllTransformed(userId: string, id: string) {
  //   try {
  //     const image = await this.prismaService.image.findUnique({
  //       where: {
  //         id,
  //       },
  //       include: {
  //         transformedImages: true,
  //       },
  //     });

  //     if (!image) {
  //       throw new BadRequestException(`Image with ID ${id} not found`);
  //     }

  //     if (image.userId !== userId) {
  //       throw new ForbiddenException(
  //         'You are not authorized to view transformed images of this image',
  //       );
  //     }

  //     const { transformedImages } = image;

  //     // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //     return transformedImages.map(
  //       // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //       ({ publicId: _, originalImageId: _, ...rest }) => ({
  //         ...rest,
  //       }),
  //     );
  //   } catch (error) {
  //     this.handleError(
  //       error,
  //       `fetch transformed images of image with ID ${id}`,
  //     );
  //   }
  // }

  // async viewOrDownload(
  //   id: string,
  //   query: ViewOrDownloadImageDto,
  //   res: Response,
  // ) {
  //   const { download } = query;

  //   console.log(`Is download? ${download}`);

  //   try {
  //     const image = await this.prismaService.image.findUnique({
  //       where: {
  //         id,
  //       },
  //     });

  //     if (!image) {
  //       throw new BadRequestException(`Image with ID ${id} not found`);
  //     }

  //     const stream = await this.awsS3Service.getFileStream(image.publicId);

  //     res.setHeader('Content-Type', 'image/' + image.format);

  //     if (download) {
  //       res.setHeader(
  //         'Content-Disposition',
  //         `attachment; filename="${image.originalName}"`,
  //       );
  //     } else {
  //       res.setHeader('Content-Disposition', 'inline');
  //     }

  //     stream.pipe(res);
  //   } catch (error) {
  //     this.handleError(error, `view or download image with ID ${id}`);
  //   }
  // }

  // async remove(userId: string, id: string) {
  //   try {
  //     const image = await this.prismaService.image.delete({
  //       where: {
  //         id,
  //       },
  //     });

  //     if (!image) {
  //       throw new BadRequestException(`Image with ID ${id} not found`);
  //     }

  //     if (image.userId !== userId) {
  //       throw new ForbiddenException(
  //         'You are not authorized to delete this image',
  //       );
  //     }

  //     await this.awsS3Service.deleteFile(image.key);

  //     // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //     const { key, userId: _, ...rest } = image;

  //     return {
  //       ...rest,
  //       url: this.baseUrl + '/images/' + image.id + '/view',
  //     };
  //   } catch (error) {
  //     this.handleError(error, `delete image with ID ${id}`);
  //   }
  // }
}
