// src/auth/email.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    console.log('Initializing email transporter...');
    const emailConfig = {
      // Removed the fixed service property for proper host resolution
      host: this.configService.get<string>('MAIL_HOST') ?? 'smtp.gmail.com',
      port: this.configService.get<number>('MAIL_PORT', 456),
      secure: this.configService.get<boolean>('MAIL_SECURE', true),
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    };
    console.log('Email configuration:', emailConfig);
    this.transporter = nodemailer.createTransport(emailConfig);
    console.log('Email transporter created:', this.transporter);
    // Verify connection
    this.transporter.verify((error, success) => {
      if (error) {
        this.logger.error('SMTP connection failed:', error);
      } else {
        this.logger.log('SMTP connection established successfully');
      }
    });
  }

  async sendEmail(to: string, template: EmailTemplate): Promise<void> {
    try {
      const mailOptions = {
        from:
          this.configService.get<string>('MAIL_FROM_NAME') +
          ' ' +
          ' <' +
          this.configService.get<string>('MAIL_FROM_ADDRESS'),
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully to: ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      throw new Error('Email delivery failed');
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${this.configService.get<string>('FRONTEND_URL')}/verify-email?token=${token}`;

    const template: EmailTemplate = {
      subject: 'Verify Your Email Address',
      html: this.getVerificationEmailTemplate(verificationUrl),
      text: `Please verify your email by clicking this link: ${verificationUrl}`,
    };

    await this.sendEmail(email, template);
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${this.configService.get<string>('FRONTEND_URL')}/reset-password?token=${token}`;

    const template: EmailTemplate = {
      subject: 'Reset Your Password',
      html: this.getPasswordResetEmailTemplate(resetUrl),
      text: `Reset your password by clicking this link: ${resetUrl}`,
    };

    await this.sendEmail(email, template);
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    const template: EmailTemplate = {
      subject: 'Welcome to Our Mental Health Platform',
      html: this.getWelcomeEmailTemplate(firstName),
      text: `Welcome ${firstName}! Thank you for joining our mental health platform.`,
    };

    await this.sendEmail(email, template);
  }

  async sendPasswordChangedEmail(
    email: string,
    firstName: string,
  ): Promise<void> {
    const template: EmailTemplate = {
      subject: 'Password Changed Successfully',
      html: this.getPasswordChangedEmailTemplate(firstName),
      text: `Hello ${firstName}, your password has been changed successfully.`,
    };

    await this.sendEmail(email, template);
  }

  async sendAccountDeactivatedEmail(
    email: string,
    firstName: string,
  ): Promise<void> {
    const template: EmailTemplate = {
      subject: 'Account Deactivated',
      html: this.getAccountDeactivatedEmailTemplate(firstName),
      text: `Hello ${firstName}, your account has been deactivated.`,
    };

    await this.sendEmail(email, template);
  }

  async sendLoginAlertEmail(
    email: string,
    firstName: string,
    ipAddress: string,
    userAgent: string,
    timestamp: Date,
  ): Promise<void> {
    const template: EmailTemplate = {
      subject: 'New Login Alert',
      html: this.getLoginAlertEmailTemplate(
        firstName,
        ipAddress,
        userAgent,
        timestamp,
      ),
      text: `New login detected from ${ipAddress} at ${timestamp.toISOString()}`,
    };

    await this.sendEmail(email, template);
  }

  async sendSuspiciousActivityEmail(
    email: string,
    firstName: string,
    activityType: string,
    timestamp: Date,
  ): Promise<void> {
    const template: EmailTemplate = {
      subject: 'Suspicious Activity Detected',
      html: this.getSuspiciousActivityEmailTemplate(
        firstName,
        activityType,
        timestamp,
      ),
      text: `Suspicious activity detected: ${activityType} at ${timestamp.toISOString()}`,
    };

    await this.sendEmail(email, template);
  }

  private getVerificationEmailTemplate(verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4f46e5; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background: #f9fafb; }
            .button { display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Verify Your Email Address</h1>
            </div>
            <div class="content">
              <p>Welcome to our mental health platform!</p>
              <p>To complete your account setup, please verify your email address by clicking the button below:</p>
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
              <p>If you didn't create an account, please ignore this email.</p>
              <p>This link will expire in 24 hours.</p>
            </div>
            <div class="footer">
              <p>If you have any questions, please contact our support team.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getPasswordResetEmailTemplate(resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background: #f9fafb; }
            .button { display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Reset Your Password</h1>
            </div>
            <div class="content">
              <p>You requested to reset your password. Click the button below to set a new password:</p>
              <a href="${resetUrl}" class="button">Reset Password</a>
              <div class="warning">
                <p><strong>Security Notice:</strong></p>
                <p>• This link will expire in 1 hour</p>
                <p>• If you didn't request this, please ignore this email</p>
                <p>• Your current password remains unchanged until you reset it</p>
              </div>
            </div>
            <div class="footer">
              <p>If you have any questions, please contact our support team.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getWelcomeEmailTemplate(firstName: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Our Platform</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10b981; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background: #f9fafb; }
            .feature { margin: 20px 0; padding: 15px; background: white; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome, ${firstName}!</h1>
            </div>
            <div class="content">
              <p>We're excited to have you join our mental health platform!</p>
              <p>Here's what you can do with your account:</p>
              
              <div class="feature">
                <h3>🔒 Secure & Private</h3>
                <p>Your mental health journey is private and secure with end-to-end encryption.</p>
              </div>
              
              <div class="feature">
                <h3>👥 Find Counselors</h3>
                <p>Connect with licensed mental health professionals who understand your needs.</p>
              </div>
              
              <div class="feature">
                <h3>📊 Track Progress</h3>
                <p>Monitor your mental health journey with personalized insights and tools.</p>
              </div>
              
              <p>Get started by completing your profile and exploring our features.</p>
            </div>
            <div class="footer">
              <p>Need help? Contact our support team anytime.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getPasswordChangedEmailTemplate(firstName: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Changed</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #059669; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background: #f9fafb; }
            .alert { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Changed Successfully</h1>
            </div>
            <div class="content">
              <p>Hello ${firstName},</p>
              <p>Your password has been changed successfully at ${new Date().toLocaleString()}.</p>
              
              <div class="alert">
                <p><strong>Didn't change your password?</strong></p>
                <p>If you didn't make this change, please contact our support team immediately.</p>
              </div>
              
              <p>For your security, you've been logged out of all devices. Please log in again with your new password.</p>
            </div>
            <div class="footer">
              <p>If you have any concerns, please contact our support team.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getAccountDeactivatedEmailTemplate(firstName: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Account Deactivated</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background: #f9fafb; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Account Deactivated</h1>
            </div>
            <div class="content">
              <p>Hello ${firstName},</p>
              <p>Your account has been deactivated as requested.</p>
              <p>Your data will be retained for 30 days in case you want to reactivate your account.</p>
              <p>If you wish to reactivate your account, please contact our support team.</p>
              <p>Thank you for using our mental health platform.</p>
            </div>
            <div class="footer">
              <p>Contact our support team if you have any questions.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getLoginAlertEmailTemplate(
    firstName: string,
    ipAddress: string,
    userAgent: string,
    timestamp: Date,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Login Alert</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #f59e0b; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background: #f9fafb; }
            .info { background: #e0f2fe; border: 1px solid #0284c7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Login Alert</h1>
            </div>
            <div class="content">
              <p>Hello ${firstName},</p>
              <p>We detected a new login to your account:</p>
              
              <div class="info">
                <p><strong>Login Details:</strong></p>
                <p>• Time: ${timestamp.toLocaleString()}</p>
                <p>• IP Address: ${ipAddress}</p>
                <p>• Device: ${userAgent}</p>
              </div>
              
              <p>If this was you, no action is needed.</p>
              <p>If you don't recognize this login, please change your password immediately and contact our support team.</p>
            </div>
            <div class="footer">
              <p>Stay secure! If you have any concerns, contact our support team.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getSuspiciousActivityEmailTemplate(
    firstName: string,
    activityType: string,
    timestamp: Date,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Suspicious Activity Alert</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; background: #f9fafb; }
            .alert { background: #fef2f2; border: 1px solid #dc2626; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Security Alert</h1>
            </div>
            <div class="content">
              <p>Hello ${firstName},</p>
              <p>We detected suspicious activity on your account:</p>
              
              <div class="alert">
                <p><strong>Activity:</strong> ${activityType}</p>
                <p><strong>Time:</strong> ${timestamp.toLocaleString()}</p>
              </div>
              
              <p><strong>Immediate Action Required:</strong></p>
              <p>1. Change your password immediately</p>
              <p>2. Review your recent account activity</p>
              <p>3. Contact our support team if you need assistance</p>
              
              <p>Your account security is our priority.</p>
            </div>
            <div class="footer">
              <p>Contact our support team immediately if you have any concerns.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
