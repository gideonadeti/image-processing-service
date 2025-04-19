import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { UpdateImageDto } from './dto/update-image.dto';
import { AwsS3Service } from 'src/aws-s3/aws-s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ImagesService {
  constructor(
    private readonly awsS3Service: AwsS3Service,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private readonly baseUrl = this.configService.get<string>('BASE_URL');

  private handleError(error: any, action: string) {
    console.error(`Failed to ${action}:`, error);

    if (error instanceof BadRequestException) {
      throw error;
    }

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  async create(userId: string, file: Express.Multer.File) {
    const format = file.mimetype.split('/')[1];
    try {
      const key = await this.awsS3Service.uploadFile(file, userId);
      const image = await this.prismaService.image.create({
        data: {
          userId,
          originalName: file.originalname,
          size: file.size,
          format,
          key,
        },
        select: {
          id: true,
          userId: true,
          originalName: true,
          size: true,
          format: true,
          key: false,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        ...image,
        url: this.baseUrl + '/images/' + image.id + '/view',
      };
    } catch (error) {
      this.handleError(error, 'upload image');
    }
  }

  async findAll(userId: string) {
    try {
      const images = await this.prismaService.image.findMany({
        where: {
          userId,
        },
        select: {
          id: true,
          userId: true,
          originalName: true,
          size: true,
          format: true,
          key: false,
          createdAt: true,
          updatedAt: true,
        },
      });

      return images.map((image) => ({
        ...image,
        url: this.baseUrl + '/images/' + image.id + '/view',
      }));
    } catch (error) {
      this.handleError(error, `'fetch images for user with ID ${userId}'`);
    }
  }

  async findOne(id: string) {
    const image = await this.prismaService.image.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        userId: true,
        originalName: true,
        size: true,
        format: true,
        key: false,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!image) {
      throw new BadRequestException(`Image with ID ${id} not found`);
    }

    return {
      ...image,
      url: this.baseUrl + '/images/' + image.id + '/view',
    };
  }

  update(id: number, updateImageDto: UpdateImageDto) {
    return `This action updates a #${id} image`;
  }

  remove(id: number) {
    return `This action removes a #${id} image`;
  }
}
