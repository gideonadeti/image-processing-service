import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Param,
  Delete,
  UseGuards,
  Query,
  Res,
} from '@nestjs/common';

import { TransformedImagesService } from './transformed-images.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Response } from 'express';
import { ViewOrDownloadImageDto } from 'src/images/dto/view-or-download-image.dto';
import { Public } from 'src/public/public.decorator';
import { UserId } from 'src/user-id/user-id.decorator';

@ApiTags('TransformedImages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transformed-images')
export class TransformedImagesController {
  constructor(
    private readonly transformedImagesService: TransformedImagesService,
  ) {}

  @Get()
  findAll(@UserId() userId: string) {
    return this.transformedImagesService.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transformedImagesService.findOne(id);
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
  remove(@Param('id') id: string) {
    return this.transformedImagesService.remove(id);
  }
}
