import { Test, TestingModule } from '@nestjs/testing';
import { ImagesGateway } from './images.gateway';

describe('ImagesGateway', () => {
  let gateway: ImagesGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImagesGateway],
    }).compile();

    gateway = module.get<ImagesGateway>(ImagesGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
