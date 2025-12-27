// apps/video-service/src/guards/service-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_INTERNAL_KEY } from '../decorators/internal-auth.decorator';

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(ServiceAuthGuard.name);
  private readonly allowedServices: string[];

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    this.allowedServices = this.configService
      .get<string>('ALLOWED_INTERNAL_SERVICES', 'video-service,scheduler-service,user-service,mood-service')
      .split(',');
  }

  canActivate(context: ExecutionContext): boolean {
    const isInternal = this.reflector.getAllAndOverride<boolean>(IS_INTERNAL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isInternal) {
      return true; // Let other guards handle it
    }

    const request = context.switchToHttp().getRequest();
    const serviceName = request.headers['x-service'] as string;
    const userId = request.headers['x-user-id'] as string;

    if (serviceName && this.allowedServices.includes(serviceName)) {
      this.logger.debug(`Internal service call authorized: ${serviceName} for user: ${userId}`);
      
      // If a userId is provided, we simulate a user object
      if (userId) {
        request.user = {
          userId: userId, // video-service uses userId instead of id in some decorators
          id: userId,
          service: serviceName,
          isService: true,
        };
      } else {
        request.user = {
          service: serviceName,
          isService: true,
        };
      }
      
      return true;
    }

    return false;
  }
}
