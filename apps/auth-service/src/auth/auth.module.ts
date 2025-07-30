// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthCoreModule } from './auth-core.module';
import { AuthController } from './auth.controller';

@Module({
  imports: [AuthCoreModule],
  controllers: [AuthController],
})
export class AuthModule {}
