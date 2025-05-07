import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  Res,
  Query,
  BadRequestException,
  Inject,
} from '@nestjs/common';

import { ImagesService } from './images.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserId } from 'src/user-id/user-id.decorator';
import { FindAllImagesDto } from './dto/find-all-images.dto';
import { TransformImageDto } from './dto/transform-image.dto';
import { ViewOrDownloadImageDto } from './dto/view-or-download-image.dto';
import { Public } from 'src/public/public.decorator';

@ApiTags('Images')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('images')
export class ImagesController {
  constructor(
    private readonly imagesService: ImagesService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(
    @UserId() userId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: 'image/*',
        })
        .addMaxSizeValidator({
          maxSize: 1024 * 1024 * 10, // 10MB
        })
        .build(),
    )
    file: Express.Multer.File,
  ) {
    return this.imagesService.create(userId, file);
  }

  @UseGuards(ThrottlerGuard)
  @Post(':id/transform')
  transform(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() transformImageDto: TransformImageDto,
  ) {
    const hasResize =
      transformImageDto.resize &&
      (transformImageDto.resize.width != null ||
        transformImageDto.resize.height != null);
    const hasCrop = transformImageDto.crop != null;
    const hasRotate = transformImageDto.rotate != null;
    const hasGrayscale = transformImageDto.grayscale != null;
    const hasTint = transformImageDto.tint != null;

    if (!hasResize && !hasCrop && !hasRotate && !hasGrayscale && !hasTint) {
      throw new BadRequestException(
        'At least one valid transformation option must be provided.',
      );
    }

    const fit = transformImageDto.resize?.fit;
    const width = transformImageDto.resize?.width;
    const height = transformImageDto.resize?.height;

    if (fit != null && width == null && height == null) {
      throw new BadRequestException(
        "If 'fit' is provided, either 'width' or 'height' must also be provided.",
      );
    }

    return this.imagesService.transform(userId, id, transformImageDto);
  }

  @Get()
  findAll(@UserId() userId: string, @Query() query: FindAllImagesDto) {
    return this.imagesService.findAll(userId, query);
  }

  @Get(':id')
  findOne(@UserId() userId: string, @Param('id') id: string) {
    return this.imagesService.findOne(userId, id);
  }

  @Public()
  @Get(':id/view')
  viewOrDownload(
    @Param('id') id: string,
    @Query() query: ViewOrDownloadImageDto,
    @Res() res: Response,
  ) {
    return this.imagesService.viewOrDownload(id, query, res);
  }

  @Get(':id/transformed')
  findAllTransformed(@UserId() userId: string, @Param('id') id: string) {
    return this.imagesService.findAllTransformed(userId, id);
  }

  @Delete(':id')
  remove(@UserId() userId: string, @Param('id') id: string) {
    return this.imagesService.remove(userId, id);
  }
}
