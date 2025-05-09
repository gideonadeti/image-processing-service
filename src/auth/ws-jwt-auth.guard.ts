import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const client = context.switchToWs().getClient();

    try {
      await this.authService.validateClient(client);

      return true;
    } catch (error) {
      Logger.error(
        'Failed to authenticate WebSocket client:',
        error.stack,
        WsJwtAuthGuard.name,
      );

      return false;
    }
  }
}
