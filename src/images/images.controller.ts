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
} from '@nestjs/common';

import { ImagesService } from './images.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserId } from 'src/user-id/user-id.decorator';
import { FindAllImagesDto } from './dto/find-all-images.dto';
import { TransformImageDto } from './dto/transform-image.dto';
import { ViewOrDownloadImageDto } from './dto/view-or-download-image.dto';

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

  @Get(':id/view')
  viewOrDownload(
    @Param('id') id: string,
    @Res() res: Response,
    @Query() query: ViewOrDownloadImageDto,
  ) {
    return this.imagesService.viewOrDownload(id, res, query);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.imagesService.remove(id);
  }
}
