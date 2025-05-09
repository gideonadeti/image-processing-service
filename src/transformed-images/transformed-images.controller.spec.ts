import { Test, TestingModule } from '@nestjs/testing';
import { TransformedImagesController } from './transformed-images.controller';
import { TransformedImagesService } from './transformed-images.service';

describe('TransformedImagesController', () => {
  let controller: TransformedImagesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransformedImagesController],
      providers: [TransformedImagesService],
    }).compile();

    controller = module.get<TransformedImagesController>(TransformedImagesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
