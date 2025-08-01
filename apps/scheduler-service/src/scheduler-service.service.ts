// src/app.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getAppInfo() {
    return {
      name: 'Mental Health Platform API',
      description: 'Comprehensive API for mental health counseling platform',
      version: process.env.npm_package_version || '1.0.0',
      environment: this.configService.get('NODE_ENV'),
      timestamp: new Date().toISOString(),
      features: [
        'User Authentication & Authorization',
        'Real-time Chat System',
        'Meeting Scheduling',
        'Counselor Management',
        'Notification System',
        'File Uploads',
        'Analytics & Reporting',
      ],
    };
  }

  getVersion() {
    return {
      version: process.env.npm_package_version || '1.0.0',
      buildDate: new Date().toISOString(),
      nodeVersion: process.version,
    };
  }
}
