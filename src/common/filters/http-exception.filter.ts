// common/filters/http-exception.filter.ts
import { 
  ExceptionFilter, 
  Catch, 
  ArgumentsHost, 
  HttpException, 
  HttpStatus, 
  Logger 
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.getStatusCode(exception);
    const message = this.getErrorMessage(exception);
    
    const errorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: exception instanceof Error ? exception.stack : undefined 
      }),
    };

    // Log error (don't log sensitive data)
    this.logger.error(
      `Exception caught - ${request.method} ${request.url} - Status: ${status} - Message: ${message}`,
      exception instanceof Error ? exception.stack : exception,
    );

    response.status(status).json(errorResponse);
  }

  private getStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    
    // Map common errors to appropriate status codes
    if (exception instanceof TypeError) return HttpStatus.BAD_REQUEST;
    if (exception instanceof SyntaxError) return HttpStatus.BAD_REQUEST;
    if (exception instanceof ReferenceError) return HttpStatus.INTERNAL_SERVER_ERROR;
    
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
  
 
  private getErrorMessage(exception: unknown): string | string[] {
  if (typeof exception === 'string') return exception;

  if (exception instanceof Error) return exception.message;

  if (
    exception &&
    typeof exception === 'object' &&
    'response' in exception
  ) {
    const httpException = exception as unknown as HttpException;
    const response = httpException.getResponse() as
      | { message?: string | string[] }
      | any[];

    if (Array.isArray(response)) {
      return response
        .map(item => {
          const value = Object.values(item)[0];
          return typeof value === 'string' ? value : String(value);
        });
    }

    if (response?.message) {
      return Array.isArray(response.message)
        ? response.message
        : [response.message];
    }

    return 'Validation failed';
  }

  return 'An internal server error occurred';
}


}