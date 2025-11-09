// apps/user-service/src/users/users.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersController } from './users.controler';
import { UsersService } from './users.service';
import { User } from '../database/entities/user.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { UserPreferences } from '../database/entities/user-preferences.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSession, UserPreferences]),
    RedisModule,
    AuthModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
