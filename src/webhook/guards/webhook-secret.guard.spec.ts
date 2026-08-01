import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { WebhookSecretGuard } from './webhook-secret.guard';

function buildContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('WebhookSecretGuard', () => {
  let configService: ConfigService;
  let guard: WebhookSecretGuard;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('demo-secret'),
    } as unknown as ConfigService;
    guard = new WebhookSecretGuard(configService);
  });

  it('allows the request when the secret header matches WEBHOOK_SECRET', () => {
    // Arrange
    const context = buildContext({ 'x-webhook-secret': 'demo-secret' });

    // Act
    const actualResult = guard.canActivate(context);

    // Assert
    expect(actualResult).toBe(true);
  });

  it('throws UnauthorizedException when the secret header is missing', () => {
    // Arrange
    const context = buildContext({});

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the secret header does not match', () => {
    // Arrange
    const context = buildContext({ 'x-webhook-secret': 'wrong-secret' });

    // Act & Assert
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
