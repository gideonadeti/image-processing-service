import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  /**
   * Password reset token from email
   * @example abc123xyz...
   */
  @IsString()
  @IsNotEmpty()
  token: string;

  /**
   * New password
   * @example newSecurePassword123
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
