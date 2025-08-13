import { Injectable } from '@nestjs/common';

@Injectable()
export class MoodServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
