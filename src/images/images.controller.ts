import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
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
  constructor(private readonly imagesService: ImagesService) {}

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
    const hasGrayscale = transformImageDto.grayscale != null;

    if (!hasResize && !hasGrayscale) {
      throw new BadRequestException(
        'At least one valid transformation option must be provided.',
      );
    }

    return this.imagesService.transform(userId, id, transformImageDto);
  }

  @Get()
  findAll(@UserId() userId: string, @Query() query: FindAllImagesDto) {
    return this.imagesService.findAll(userId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.imagesService.findOne(id);
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.imagesService.remove(id);
  }
}
