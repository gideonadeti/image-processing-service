import { Injectable } from '@nestjs/common';

import { UpdateImageDto } from './dto/update-image.dto';

@Injectable()
export class ImagesService {
  create(file: Express.Multer.File) {
    return file;
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
