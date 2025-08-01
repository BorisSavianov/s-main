// src/scheduling/interceptors/meeting-logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class MeetingLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MeetingLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        this.logger.log(
          `${method} ${url} - User: ${user?.id} - Duration: ${duration}ms`,
        );

        // Log specific meeting actions
        if (url.includes('/meetings/') && method === 'PUT') {
          this.logger.log(
            `Meeting updated by user ${user?.id}: ${JSON.stringify(data)}`,
          );
        }
      }),
    );
  }
}
