// apps/user-service/src/auth/guards/jwt-auth.guard.ts
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_INTERNAL_KEY } from '../decorators/internal-auth.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly allowedServices: string[];

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    super();
    this.allowedServices = this.configService
      .get<string>(
        'ALLOWED_INTERNAL_SERVICES',
        'video-service,scheduler-service,user-service,mood-service',
      )
      .split(',');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check for internal service auth FIRST
    const request = context.switchToHttp().getRequest();
    this.logger.debug(`[JwtAuthGuard] Headers: ${JSON.stringify(request.headers)}`);
    this.logger.debug(`[JwtAuthGuard] x-user-id header: ${request.headers['x-user-id']}`);
    this.logger.debug(`[JwtAuthGuard] x-service header: ${request.headers['x-service']}`);
    const serviceName = request.headers['x-service'] as string;
    const userId = request.headers['x-user-id'] as string;

    const isInternalEndpoint = this.reflector.getAllAndOverride<boolean>(
      IS_INTERNAL_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      isInternalEndpoint &&
      serviceName &&
      this.allowedServices.includes(serviceName)
    ) {
      this.logger.debug(
        `Internal service call authorized: ${serviceName} for user: ${userId}`,
      );

      // Populate user context for services
      request.user = {
        id: userId,
        userId: userId, // Some services use userId
        service: serviceName,
        isService: true,
      };
      
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Fallback to standard JWT authentication
    const canActivate = await super.canActivate(context);
    return canActivate as boolean;
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // If we've already authenticated via internal service, don't throw
    const request = context.switchToHttp().getRequest();
    if (request.user?.isService) {
      return request.user;
    }

    if (err || !user) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (isPublic) {
        return null;
      }

      // Enhanced error messages based on the error type
      if (info?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired');
      }

      if (info?.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid token');
      }

      if (info?.name === 'NotBeforeError') {
        throw new UnauthorizedException('Token not active');
      }

      throw err || new UnauthorizedException('Authentication required');
    }

    return user;
  }
}
