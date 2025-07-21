// src/auth/strategies/local.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
import { UserService } from '../user.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {
    super({
      usernameField: 'email',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(request: any, email: string, password: string) {
    // Check rate limiting
    const clientIp = this.getClientIp(request);
    const rateLimitKey = `login_attempts:${clientIp}`;

    try {
      // Validate credentials
      const user = await this.authService.validateUser(email, password);

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Check if account is active
      if (!user.isActive) {
        throw new UnauthorizedException('Account deactivated');
      }

      // Reset login attempts on successful login
      await this.userService.resetLoginAttempts(user.id);

      return user;
    } catch (error) {
      // Increment failed login attempts
      const userByEmail = await this.userService.getUserByEmail(email);
      if (userByEmail) {
        await this.userService.incrementLoginAttempts(userByEmail.id);
      }

      throw error;
    }
  }

  private getClientIp(request: any): string {
    return (
      request.headers?.['x-forwarded-for']?.split(',')[0] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      ''
    );
  }
}
