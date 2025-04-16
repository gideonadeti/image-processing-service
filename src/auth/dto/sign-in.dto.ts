import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SignInDto {
  /**
   * User's email
   * @example "johndoe@gmail.com"
   */
  @IsEmail()
  @IsNotEmpty()
  email: string;

  /**
   * User's password
   * @example "strongPassword"
   */
  @IsString()
  @IsNotEmpty()
  password: string;
}
