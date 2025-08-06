// apps/notification-service/src/templates/services/template.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationTemplate } from '../entities/notification-template.entity';
import { NotificationType } from '../../notifications/entities/notification.entity';
import * as Handlebars from 'handlebars';

export interface RenderedTemplate {
  subject?: string;
  text: string;
  html: string;
}

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private readonly compiledTemplates = new Map<
    string,
    {
      subject?: HandlebarsTemplateDelegate;
      body: HandlebarsTemplateDelegate;
    }
  >();

  constructor(
    @InjectRepository(NotificationTemplate)
    private templateRepository: Repository<NotificationTemplate>,
  ) {
    this.registerHelpers();
  }

  async renderTemplate(
    templateName: string,
    data: Record<string, any>,
    notificationType: NotificationType,
  ): Promise<RenderedTemplate> {
    const template = await this.getTemplate(templateName);

    if (!template) {
      throw new NotFoundException(`Template ${templateName} not found`);
    }

    if (!template.supportedChannels.includes(notificationType)) {
      this.logger.warn(
        `Template ${templateName} does not support ${notificationType} channel`,
      );
    }

    const compiledTemplate = await this.getCompiledTemplate(template);

    const renderedBody = compiledTemplate.body(data);
    const renderedSubject = compiledTemplate.subject
      ? compiledTemplate.subject(data)
      : undefined;

    return {
      subject: renderedSubject,
      text: this.stripHtml(renderedBody),
      html: renderedBody,
    };
  }

  async getTemplate(
    templateName: string,
  ): Promise<NotificationTemplate | null> {
    return this.templateRepository.findOne({
      where: { templateName, isActive: true },
    });
  }

  async getAllTemplates(): Promise<NotificationTemplate[]> {
    return this.templateRepository.find({
      where: { isActive: true },
      order: { templateCategory: 'ASC', templateName: 'ASC' },
    });
  }

  async getTemplatesByCategory(
    category: string,
  ): Promise<NotificationTemplate[]> {
    return this.templateRepository.find({
      where: { templateCategory: category, isActive: true },
      order: { templateName: 'ASC' },
    });
  }

  async createTemplate(
    templateData: Partial<NotificationTemplate>,
  ): Promise<NotificationTemplate> {
    const template = this.templateRepository.create(templateData);
    const savedTemplate = await this.templateRepository.save(template);

    // Clear compiled template cache
    this.compiledTemplates.delete(savedTemplate.templateName);

    return savedTemplate;
  }

  async updateTemplate(
    templateName: string,
    updateData: Partial<NotificationTemplate>,
  ): Promise<NotificationTemplate> {
    const template = await this.getTemplate(templateName);

    if (!template) {
      throw new NotFoundException(`Template ${templateName} not found`);
    }

    Object.assign(template, updateData);
    const updatedTemplate = await this.templateRepository.save(template);

    // Clear compiled template cache
    this.compiledTemplates.delete(templateName);

    return updatedTemplate;
  }

  private async getCompiledTemplate(template: NotificationTemplate) {
    if (this.compiledTemplates.has(template.templateName)) {
      return this.compiledTemplates.get(template.templateName)!;
    }

    const compiledTemplate = {
      subject: template.subjectTemplate
        ? Handlebars.compile(template.subjectTemplate)
        : undefined,
      body: Handlebars.compile(template.bodyTemplate),
    };

    this.compiledTemplates.set(template.templateName, compiledTemplate);
    return compiledTemplate;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private registerHelpers(): void {
    // Register custom Handlebars helpers
    Handlebars.registerHelper(
      'formatDate',
      (date: string | Date, format: string = 'YYYY-MM-DD') => {
        if (!date) return '';
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dateObj.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      },
    );

    Handlebars.registerHelper('formatTime', (date: string | Date) => {
      if (!date) return '';
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return dateObj.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    });

    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    Handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    Handlebars.registerHelper('gt', (a: any, b: any) => a > b);
    Handlebars.registerHelper('lt', (a: any, b: any) => a < b);

    Handlebars.registerHelper('capitalize', (str: string) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    });

    Handlebars.registerHelper('truncate', (str: string, length: number) => {
      if (!str || str.length <= length) return str;
      return str.substring(0, length) + '...';
    });
  }
}
