import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SignUpDto {
  /**
   * User's name
   * @example "John Doe"
   */
  @IsString()
  @IsNotEmpty()
  name: string;

  /**
   * User's email
   * @example johndoe@gmail.com
   */
  @IsEmail()
  @IsNotEmpty()
  email: string;

  /**
   * User's password
   * @example strongPassword
   */
  @IsString()
  @IsNotEmpty()
  password: string;
}
