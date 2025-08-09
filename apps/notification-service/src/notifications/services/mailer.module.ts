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
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // Build the correct path for email templates
        // In development: src/templates/email
        // In production: dist/templates/email
        const templateDir =
          process.env.NODE_ENV === 'production'
            ? join(process.cwd(), 'dist', 'templates', 'email')
            : join(process.cwd(), 'dist', 'templates', 'email'); // : join(__dirname, '..', '..', '..', 'templates', 'email');

        console.log(`Email templates directory: ${templateDir}`);

        return {
          transport: {
            host: configService.get<string>('MAIL_HOST', 'smtp.gmail.com'),
            port: configService.get<number>('MAIL_PORT', 465),
            secure: configService.get<boolean>('MAIL_SECURE', true),
            auth: {
              user: configService.get<string>('MAIL_USER'),
              pass: configService.get<string>('MAIL_PASS'),
            },
          },
          defaults: {
            from: `"${configService.get<string>('MAIL_FROM_NAME', 'Chat Service')}" <${configService.get<string>('MAIL_FROM_ADDRESS', 'noreply@example.com')}>`,
          },
          template: {
            dir: templateDir,
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
