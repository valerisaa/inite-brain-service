import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from './api-key.service';
import { BrainScope, AuthenticatedRequest } from './api-key.types';

const REQUIRED_SCOPES_KEY = 'requiredScopes';
export const RequireScopes = (...scopes: BrainScope[]) =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header = request.headers['authorization'] as string | undefined;

    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const plaintext = header.slice(7).trim();
    const record = this.apiKeys.resolve(plaintext);
    if (!record) {
      throw new UnauthorizedException('Invalid ApiKey');
    }

    // Scope enforcement
    const required = this.reflector.getAllAndOverride<BrainScope[]>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? [];
    for (const s of required) {
      if (!record.scopes.includes(s)) {
        throw new ForbiddenException(`Scope ${s} required`);
      }
    }

    // Tenancy: every request gets companyId stamped on the request object.
    // Downstream code MUST use req.brainAuth.companyId, not any path/body value.
    (request as AuthenticatedRequest).brainAuth = {
      companyId: record.companyId,
      scopes: record.scopes,
      keyHash: record.keyHash,
    };
    return true;
  }
}
