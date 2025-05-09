import { Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

import { AuthService } from './auth.service';

export const wsJwtAuthMiddleware = (authService: AuthService) => {
  return async (
    socket: Socket & { user: any },
    next: (err?: Error) => void,
  ) => {
    try {
      await authService.validateClient(socket);

      next();
    } catch (error) {
      Logger.error(
        'Failed to authenticate WebSocket client:',
        error.stack,
        wsJwtAuthMiddleware.name,
      );

      next(error);
    }
  };
};
