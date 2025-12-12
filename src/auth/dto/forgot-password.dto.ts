import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  /**
   * User's email address
   * @example "user@example.com"
   */
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
