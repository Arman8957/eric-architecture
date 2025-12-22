// src/common/pipes/validation.pipe.ts
import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform, ValidationPipe } from '@nestjs/common';

@Injectable()
export class GlobalValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,                 // Strip unknown properties
      forbidNonWhitelisted: true,      // Reject if unknown properties exist
      transform: true,                 // Auto-transform payloads to DTO instances
      exceptionFactory: (errors) => {
        const messages = errors.map((error) => ({
          property: error.property,
          constraints: Object.values(error.constraints || {}),
        }));
        return new BadRequestException({
          success: false,
          message: 'Validation failed',
          errors: messages,
        });
      },
    });
  }
}