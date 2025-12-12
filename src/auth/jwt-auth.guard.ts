import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { TokenExpiredError } from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from 'src/public/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
  ): TUser {
    // Check for token expired error
    if (info instanceof TokenExpiredError) {
      throw new UnauthorizedException({
        message: 'Access token has expired',
        error: 'Token Expired',
        statusCode: 401,
      });
    }

    // If no error and user exists, return user
    if (!err && user) {
      return user;
    }

    // For all other cases, throw default unauthorized
    throw new UnauthorizedException();
  }
}
