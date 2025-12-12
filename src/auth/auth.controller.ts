import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';

import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshJwtAuthGuard } from './refresh-jwt-auth.guard';
import { User } from '@prisma/client';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('sign-up')
  async signUp(@Body() signUpDto: SignUpDto, @Res() res: Response) {
    return this.authService.signUp(signUpDto, res);
  }

  @ApiBody({ type: SignInDto })
  @UseGuards(LocalAuthGuard)
  @Post('sign-in')
  async signIn(
    @Req() req: Request & { user: Partial<User> },
    @Res() res: Response,
  ) {
    return this.authService.signIn(req.user, res);
  }

  @UseGuards(RefreshJwtAuthGuard)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    return this.authService.refresh(req, res);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('sign-out')
  async signOut(
    @Req() req: Request & { user: Partial<User> },
    @Res() res: Response,
  ) {
    return this.authService.signOut(req.user, res);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    await this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    await this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.password,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('delete-account')
  async deleteAccount(
    @Req() req: Request & { user: Partial<User> },
    @Res() res: Response,
  ) {
    return this.authService.deleteAccount(req.user, res);
  }
}
