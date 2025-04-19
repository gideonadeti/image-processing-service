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
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key: imageKey, ...rest } = image;

      return {
        ...rest,
        url: this.baseUrl + '/images/' + image.id + '/view',
      };
    } catch (error) {
      this.handleError(error, 'upload image');
    }
  }

  findAll() {
    return `This action returns all images`;
  }

  findOne(id: number) {
    return `This action returns a #${id} image`;
  }

  update(id: number, updateImageDto: UpdateImageDto) {
    return `This action updates a #${id} image`;
  }

  remove(id: number) {
    return `This action removes a #${id} image`;
  }
}
