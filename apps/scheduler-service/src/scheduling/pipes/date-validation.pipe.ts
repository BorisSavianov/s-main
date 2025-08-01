// src/scheduling/pipes/date-validation.pipe.ts
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { isValid, parseISO, isFuture } from 'date-fns';

@Injectable()
export class DateValidationPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) {
      throw new BadRequestException('Date is required');
    }

    const date = parseISO(value);

    if (!isValid(date)) {
      throw new BadRequestException(
        'Invalid date format. Use ISO 8601 format.',
      );
    }

    if (!isFuture(date)) {
      throw new BadRequestException('Date must be in the future');
    }

    return value;
  }
}
