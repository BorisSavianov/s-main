// apps/notification-service/src/mailer/mailer.module.ts
import { Module } from '@nestjs/common';
import { MailerModule as NestMailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';

import { MailerService } from './mailer.service';
import { TemplateModule } from '../../templates/services/template.module';

@Module({
  imports: [
    ConfigModule,
    TemplateModule,
    NestMailerModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get('MAIL_HOST', 'smtp.gmail.com'),
          port: configService.get<number>('MAIL_PORT', 465),
          secure: configService.get<boolean>('MAIL_SECURE', true),
          auth: {
            user: configService.get('MAIL_USER'),
            pass: configService.get('MAIL_PASS'),
          },
          // Additional SMTP options
          pool: true,
          maxConnections: 5,
          maxMessages: 100,
          rateDelta: 1000,
          rateLimit: 5,
        },
        defaults: {
          from: `${configService.get('MAIL_FROM_NAME', 'Mental Health Platform')} <${configService.get('MAIL_FROM_ADDRESS', 'noreply@mentalhealth.com')}>`,
        },
        template: {
          dir: join(__dirname, '../templates/email'),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
        options: {
          partials: {
            dir: join(__dirname, '../templates/email/partials'),
            options: {
              strict: true,
            },
          },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
