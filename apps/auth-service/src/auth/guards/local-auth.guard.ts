// src/auth/guards/local-auth.guard.ts
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      if (info?.message === 'Missing credentials') {
        throw new UnauthorizedException('Email and password are required');
      }

      if (info?.message === 'Invalid credentials') {
        throw new UnauthorizedException('Invalid email or password');
      }

      throw err || new UnauthorizedException('Authentication failed');
    }

    return user;
  }
}
