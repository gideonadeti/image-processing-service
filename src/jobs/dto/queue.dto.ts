import { IsDefined, IsIn } from 'class-validator';

export class QueueDto {
  /**
   * The name of the queue
   * @example images
   */
  @IsDefined()
  @IsIn(['images', 'transformed-images'])
  queue: 'images' | 'transformed-images';
}
