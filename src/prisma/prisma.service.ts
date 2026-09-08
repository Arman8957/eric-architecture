// prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'stdout',
          level: 'error',
        },
        {
          emit: 'stdout',
          level: 'info',
        },
        {
          emit: 'stdout',
          level: 'warn',
        },
      ],
    });
  }

  async onModuleInit() {
    await this.connectWithRetry();

    // Optional: Enable query logging in development
    if (process.env.NODE_ENV !== 'production') {
      // @ts-ignore - Prisma query event typing
      this.$on('query', (e: any) => {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Params: ${e.params}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      });
    }
  }

  /**
   * Neon scales the compute to zero when idle. The pooler endpoint accepts the
   * TCP connection straight away but rejects the first query while the backend
   * is still waking, which Prisma surfaces as P1001 within a second or two —
   * `connect_timeout` never comes into play because the attempt is refused
   * rather than left hanging. A single failed `$connect()` used to bubble up
   * and kill the process, so retry a few times with backoff to let the
   * database wake up.
   */
  private async connectWithRetry(maxAttempts = 5) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Prisma Client connected to PostgreSQL database successfully');
        return;
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;
        const isReachabilityError =
          (error as { errorCode?: string }).errorCode === 'P1001';

        // Anything other than "server unreachable" (bad credentials, a missing
        // database) will not fix itself by waiting, so fail immediately.
        if (isLastAttempt || !isReachabilityError) {
          this.logger.error('Failed to connect to database', error);
          throw error;
        }

        const delayMs = 1000 * 2 ** (attempt - 1);
        this.logger.warn(
          `Database unreachable (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma Client disconnected');
  }

  // Optional helper: Clean shutdown for graceful exit
  async enableShutdownHooks(app: any) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}