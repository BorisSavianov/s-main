// apps/user-service/src/counselors/counselors.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CounselorsController } from './counselors.controler';
import { CounselorsService } from './counselots.service';
import { User } from '../database/entities/user.entity';
import { CounselorProfile } from '../database/entities/counselor-profile.entity';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, CounselorProfile]),
    RedisModule,
    AuthModule,
  ],
  controllers: [CounselorsController],
  providers: [CounselorsService],
  exports: [CounselorsService],
})
export class CounselorsModule {}
