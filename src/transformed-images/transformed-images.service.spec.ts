import { Test, TestingModule } from '@nestjs/testing';
import { TransformedImagesService } from './transformed-images.service';

describe('TransformedImagesService', () => {
  let service: TransformedImagesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransformedImagesService],
    }).compile();

    service = module.get<TransformedImagesService>(TransformedImagesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
