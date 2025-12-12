import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { CookieOptions, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { PasswordResetToken, Prisma, User } from '@prisma/client';
import { Socket } from 'socket.io';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { SignUpDto } from './dto/sign-up.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthPayload } from './auth-payload.interface';
import { EmailService } from './email/email.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prismaService: PrismaService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  private logger = new Logger(AuthService.name);

  /**
   * Generates access & refresh tokens, persists the hashed refresh token,
   * sets the refresh cookie, and sends the response.
   */
  private async handleSuccessfulAuth(
    user: Partial<User>,
    res: Response,
    statusCode: number = 200,
  ) {
    const payload = this.createAuthPayload(user) as AuthPayload;
    const accessToken = this.getToken(payload, 'access');
    const refreshToken = this.getToken(payload, 'refresh');
    const salt = await bcrypt.genSalt(10);
    const hashedToken = await bcrypt.hash(refreshToken, salt);
    const userId = user.id as string;
    const existingRefreshToken =
      await this.prismaService.refreshToken.findUnique({
        where: { userId },
      });

    if (existingRefreshToken) {
      await this.prismaService.refreshToken.update({
        where: { userId },
        data: { value: hashedToken },
      });
    } else {
      await this.prismaService.refreshToken.create({
        data: { userId, value: hashedToken },
      });
    }

    res.cookie('refreshToken', refreshToken, this.getRefreshCookieConfig());
    res.status(statusCode).json({
      accessToken,
      user,
    });
  }

  private handleError(error: any, action: string) {
    this.logger.error(`Failed to ${action}`, (error as Error).stack);

    if (error instanceof UnauthorizedException) {
      throw error;
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Email is already in use');
    }

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  private createAuthPayload(user: Partial<User>) {
    return {
      sub: user.id,
      name: user.name,
      email: user.email,
      jti: uuidv4(),
    };
  }

  private getToken(payload: AuthPayload, type: 'access' | 'refresh') {
    if (type === 'refresh') {
      const secret =
        this.configService.get<string>('JWT_REFRESH_SECRET') ??
        process.env.JWT_REFRESH_SECRET;

      return this.jwtService.sign(payload, {
        secret,
        expiresIn: '7d',
      });
    }

    // Access tokens use the default secret configured in JwtModule
    return this.jwtService.sign(payload);
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);

    return bcrypt.hash(password, salt);
  }

  private getRefreshCookieConfig(): CookieOptions {
    const nodeEnv =
      this.configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
    const isProd = nodeEnv === 'production';

    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
  }

  async signUp(signUpDto: SignUpDto, res: Response) {
    try {
      const hashedPassword = await this.hashPassword(signUpDto.password);
      const user = await this.prismaService.user.create({
        data: {
          ...signUpDto,
          password: hashedPassword,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...rest } = user;

      await this.handleSuccessfulAuth(rest, res, 201);
    } catch (error) {
      this.handleError(error, 'sign up user');
    }
  }

  async signIn(user: Partial<User>, res: Response) {
    try {
      await this.handleSuccessfulAuth(user, res);
    } catch (error) {
      this.handleError(error, 'sign in user');
    }
  }

  async refresh(req: Request, res: Response) {
    const user = req.user as Partial<User>;
    const refreshTokenFromCookie = (req.cookies as { refreshToken?: string })
      ?.refreshToken;

    if (!refreshTokenFromCookie) {
      throw new UnauthorizedException('Missing refresh token');
    }

    try {
      const existingRefreshToken =
        await this.prismaService.refreshToken.findUnique({
          where: { userId: user.id },
        });

      if (!existingRefreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isCorrectRefreshToken = await bcrypt.compare(
        refreshTokenFromCookie,
        existingRefreshToken.value,
      );

      if (!isCorrectRefreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      await this.handleSuccessfulAuth(user, res);
    } catch (error) {
      this.handleError(error, 'refresh token');
    }
  }

  async signOut(user: Partial<User>, res: Response) {
    try {
      // Use deleteMany so it doesn't throw an error if the user has no refresh token, thus has already signed out
      await this.prismaService.refreshToken.deleteMany({
        where: { userId: user.id },
      });

      res.clearCookie('refreshToken', this.getRefreshCookieConfig());
      res.sendStatus(200);
    } catch (error) {
      this.handleError(error, 'sign out user');
    }
  }

  async validateUser(email: string, pass: string) {
    const user = await this.prismaService.user.findUnique({
      where: { email },
    });

    if (!user) return null;

    const isCorrectPassword = await bcrypt.compare(pass, user.password);

    if (!isCorrectPassword) return null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...rest } = user;

    return rest;
  }

  async validateClient(client: Socket & { user: any }) {
    const authHeader = client.handshake.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    const payload = this.jwtService.verify<AuthPayload>(token, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
    });

    client.user = payload;
  }

  async forgotPassword(email: string) {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { email },
      });

      // Always return success for security (don't reveal if email exists)
      if (!user) {
        this.logger.log(
          `Password reset requested for non-existent email: ${email}`,
        );

        return; // Don't throw - silently return to prevent email enumeration
      }

      // Generate secure token
      const token = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(token, 10);

      // Set expiry to 1 hour from now
      const expiresAt = new Date();

      expiresAt.setHours(expiresAt.getHours() + 1);

      // Update or create reset token
      const existingToken =
        await this.prismaService.passwordResetToken.findUnique({
          where: { userId: user.id },
        });

      if (existingToken) {
        await this.prismaService.passwordResetToken.update({
          where: { userId: user.id },
          data: {
            value: hashedToken,
            expiresAt,
            used: false, // Reset used flag
          },
        });
      } else {
        await this.prismaService.passwordResetToken.create({
          data: {
            userId: user.id,
            value: hashedToken,
            expiresAt,
          },
        });
      }

      // Send email with reset link
      await this.emailService.sendPasswordResetEmail(email, token);

      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to process password reset request for ${email}`,
        (error as Error).stack,
      );
      // Don't throw - always return success to prevent email enumeration
    }
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      // Find all unused, unexpired reset tokens and check them (since tokens are hashed)
      const resetTokens = await this.prismaService.passwordResetToken.findMany({
        where: {
          used: false,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      let validToken: PasswordResetToken | null = null;

      for (const resetToken of resetTokens) {
        const isMatch = await bcrypt.compare(token, resetToken.value);

        if (isMatch) {
          validToken = resetToken;

          break;
        }
      }

      if (!validToken) {
        throw new UnauthorizedException('Invalid or expired reset token');
      }

      // Hash new password
      const hashedPassword = await this.hashPassword(newPassword);

      // Update user password
      await this.prismaService.user.update({
        where: { id: validToken.userId },
        data: { password: hashedPassword },
      });

      // Mark token as used (one-to-one relationship) - provides audit trail and security monitoring
      await this.prismaService.passwordResetToken.update({
        where: { userId: validToken.userId },
        data: { used: true },
      });

      // Invalidate all refresh tokens for this user
      await this.prismaService.refreshToken.deleteMany({
        where: { userId: validToken.userId },
      });

      this.logger.log(
        `Password reset successful for user with ID ${validToken.userId}`,
      );
    } catch (error) {
      this.handleError(error, 'reset password');
    }
  }

  async deleteAccount(user: Partial<User>, res: Response) {
    try {
      const userId = user.id as string;

      // Delete refresh token
      await this.prismaService.refreshToken.deleteMany({
        where: { userId },
      });

      // Delete password reset token
      await this.prismaService.passwordResetToken.deleteMany({
        where: { userId },
      });

      // Delete user (cascades will handle related records)
      await this.prismaService.user.delete({
        where: { id: userId },
      });

      // Clear cookies
      res.clearCookie('refreshToken', this.getRefreshCookieConfig());
      res.sendStatus(200);
    } catch (error) {
      this.handleError(error, 'delete account');
    }
  }
}
