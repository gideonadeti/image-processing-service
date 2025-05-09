import { WsJwtAuthGuard } from './ws-jwt-auth.guard';

describe('WsJwtAuthGuard', () => {
  it('should be defined', () => {
    expect(new WsJwtAuthGuard()).toBeDefined();
  });
});
