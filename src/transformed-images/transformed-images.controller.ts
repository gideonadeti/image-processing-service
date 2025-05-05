import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Param,
  Delete,
  UseGuards,
  Query,
  Res,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';

import { TransformedImagesService } from './transformed-images.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Response } from 'express';
import { ViewOrDownloadImageDto } from 'src/images/dto/view-or-download-image.dto';
import { Public } from 'src/public/public.decorator';
import { UserId } from 'src/user-id/user-id.decorator';
import { TransformImageDto } from 'src/images/dto/transform-image.dto';

@ApiTags('TransformedImages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transformed-images')
export class TransformedImagesController {
  constructor(
    private readonly transformedImagesService: TransformedImagesService,
  ) {}

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

    return this.transformedImagesService.transform(
      userId,
      id,
      transformImageDto,
    );
  }

  @Get()
  findAll(@UserId() userId: string) {
    return this.transformedImagesService.findAll(userId);
  }

  @Get(':id')
  findOne(@UserId() userId: string, @Param('id') id: string) {
    return this.transformedImagesService.findOne(userId, id);
  }

  @Public()
  @Get(':id/view')
  viewOrDownload(
    @Param('id') id: string,
    @Query() query: ViewOrDownloadImageDto,
    @Res() res: Response,
  ) {
    return this.transformedImagesService.viewOrDownload(id, query, res);
  }

  @Delete(':id')
  remove(@UserId() userId: string, @Param('id') id: string) {
    return this.transformedImagesService.remove(userId, id);
  }
}
