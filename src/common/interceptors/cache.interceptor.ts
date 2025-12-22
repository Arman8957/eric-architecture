// src/common/interceptors/cache.interceptor.ts
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import * as cacheManager_1 from 'cache-manager';
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: cacheManager_1.Cache) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const key = this.generateCacheKey(request);

    const cached = await this.cacheManager.get(key);
    if (cached) {
      return of({
        success: true,
        message: 'Data from cache',
        data: cached,
        cached: true,
      });
    }

    return next.handle().pipe(
      tap(async (response) => {
        if (response?.success && response.data) {
          await this.cacheManager.set(key, response.data, 300); // 5 minutes TTL
        }
      }),
    );
  }

  private generateCacheKey(request: any): string {
    return `${request.method}_${request.url}_${JSON.stringify(request.query)}`;
  }
}