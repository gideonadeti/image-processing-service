import { IsBoolean, IsOptional } from 'class-validator';

export class ViewOrDownloadImageDto {
  /**
   * Whether to download the image instead of just viewing it
   * @example true
   */
  @IsOptional()
  @IsBoolean()
  download?: boolean;
}
