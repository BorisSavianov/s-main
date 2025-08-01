// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';

import { ScheduleModule } from '@nestjs/schedule';

// Feature Modules
import { SchedulingModule } from './scheduling/services/scheduling.module';
import { HealthModule } from './health/health.module';

// Configuration
import { SchedulerServiceController } from './scheduler-service.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from 'apps/user-service/src/auth/auth.module';
import {
  PrometheusController,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CounselorTimeSlot } from './scheduling/entities/counselor-time-slot.entity';
import { MeetingParticipant } from './scheduling/entities/meeting-participant.entity';
import { MeetingReminder } from './scheduling/entities/meeting-reminder.entity';
import { ScheduledMeeting } from './scheduling/entities/scheduled-meeting.entity';
import { SchedulingPreferences } from './scheduling/entities/scheduling-prefrences.entity';
import { User } from 'apps/user-service/src/database/entities/user.entity';
import { CounselorProfile } from 'apps/user-service/src/database/entities/counselor-profile.entity';
import { UserSession } from 'apps/user-service/src/database/entities/user-session.entity';
import { OAuthProvider } from 'apps/user-service/src/database/entities/oauth-provider.entity';
import { UsersModule } from 'apps/user-service/src/users/users.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    // Prometheus metrics
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
        config: { prefix: 'scheduler_service_' },
      },
    }),
    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [
          CounselorTimeSlot,
          MeetingParticipant,
          MeetingReminder,
          ScheduledMeeting,
          SchedulingPreferences,
          User,
          CounselorProfile,
          UserSession,
          OAuthProvider,
        ],
        synchronize: false, // Set to false in production
        logging: configService.get<string>('NODE_ENV') === 'development',
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          name: 'short',
          ttl: 1000,
          limit: 10,
        },
        {
          name: 'medium',
          ttl: 10000,
          limit: 50,
        },
        {
          name: 'long',
          ttl: 60000,
          limit: 100,
        },
      ],
      inject: [ConfigService],
    }),

    // Scheduled Tasks
    ScheduleModule.forRoot(),

    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: {
          expiresIn: process.env.JWT_EXPIRES_IN,
        },
      }),
    }),

    // Feature Modules
    SchedulingModule,
    PassportModule,
    HealthModule,
    DatabaseModule,

    AuthModule,
  ],
  controllers: [SchedulerServiceController],
  providers: [PrometheusController],
})
export class SchedulerServiceModule {}
