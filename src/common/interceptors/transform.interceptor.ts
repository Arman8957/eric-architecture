// src/common/interceptors/transform.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface Response<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => {
        // If data is already in standard format (e.g., from auth), return as-is
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // Default success response
        return {
          success: true,
          message: data?.message || 'Request successful',
          data: data?.data ?? data,
        };
      }),
    );
  }
}