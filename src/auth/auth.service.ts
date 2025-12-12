import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { CookieOptions, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { Prisma, User } from '@prisma/client';
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

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prismaService: PrismaService,
    private configService: ConfigService,
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
}
