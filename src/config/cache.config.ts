// src/config/cache.config.ts
import { CacheModuleOptions } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';

export const getCacheConfig = (configService: ConfigService): CacheModuleOptions => ({
  store: redisStore as any,
  host: configService.get('redis.host'),
  port: configService.get('redis.port'),
  password: configService.get('redis.password'),
  ttl: configService.get('cacheTtl'), // in seconds
  isGlobal: true,
});