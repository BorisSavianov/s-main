import { Controller, Get } from '@nestjs/common';
import { MoodServiceService } from './mood-service.service';

@Controller()
export class MoodServiceController {
  constructor(private readonly moodServiceService: MoodServiceService) {}

  @Get()
  getHello(): string {
    return this.moodServiceService.getHello();
  }
}
