// apps/user-service/src/database/database.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './entities/user.entity';
import { CounselorProfile } from './entities/counselor-profile.entity';
import { UserSession } from './entities/user-session.entity';
import { OAuthProvider } from './entities/oauth-provider.entity';
import { UserPreferences } from './entities/user-preferences.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserPreferences,
      User,
      CounselorProfile,
      UserSession,
      OAuthProvider,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
