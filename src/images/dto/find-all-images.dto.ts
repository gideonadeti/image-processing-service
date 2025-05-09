import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class FindAllImagesDto {
  /**
   * Optional search term (partial match on image name)
   * @example cat
   */
  @IsOptional()
  @IsString()
  originalName?: string;

  /**
   * Minimum size filter (in MB)
   * @example 5
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  minSize?: number;

  /**
   * Maximum size filter (in MB)
   * @example 10
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxSize?: number;

  /**
   * Sort by this field
   * @example size
   */
  @IsOptional()
  @IsIn(['originalName', 'size', 'format', 'createdAt', 'updatedAt'])
  sortBy?: 'originalName' | 'size' | 'format' | 'createdAt' | 'updatedAt';

  /**
   * Sort order: ascending or descending
   * @example desc
   */
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  /**
   * Results per page
   * @example 10
   */
  @IsOptional()
  @IsPositive()
  limit?: number;

  /**
   * Page number
   * @example 1
   */
  @IsOptional()
  @IsPositive()
  page?: number;
}
