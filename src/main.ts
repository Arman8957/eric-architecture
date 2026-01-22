import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { utilities as nestWinstonUtilities } from 'nest-winston';
import { Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: WinstonModule.createLogger({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',

      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            nestWinstonUtilities.format.nestLike('PortfolioAPI', {
              colors: true,
              prettyPrint: true,
              processId: true,
              // appName: true,
            }),
          ),
        }),

        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          ),
        }),
      ],
    }),
  });

  const configService = app.get(ConfigService);

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:5174',
            "'unsafe-inline'",
            'https://accounts.google.com',
          ],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
          connectSrc: [
            "'self'",
            'https://accounts.google.com',
            'https://res.cloudinary.com',
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: true,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Compression
  app.use(compression());

  // Rate Limiting
  app.use(
    rateLimit({
      windowMs: 60_000, // 1 minute
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.ip === '127.0.0.1',
    }),
  );

  // CORS + Versioning + Validation
  app.enableCors({
    origin: configService.get('FRONTEND_URL', [
      'http://localhost:3001',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]),
    credentials: true,
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: process.env.NODE_ENV === 'production',
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger (only in non-prod)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Architecture Portfolio API')
      .setDescription('High-performance backend with 1D/2D/3D assets')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Health Check endpoint
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });

  // Start Server with auto port increment on conflict
  let port = configService.get<number>('PORT', 3000);
  const maxRetries = 10;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await app.listen(port, '0.0.0.0');
      Logger.log(`🚀 Server running on port ${port}`, 'Bootstrap');
      Logger.log(
        `📁 Environment: ${process.env.NODE_ENV || 'development'}`,
        'Bootstrap',
      );
      Logger.log(`🌐 URL: http://localhost:${port}`, 'Bootstrap');

      if (process.env.NODE_ENV !== 'production') {
        Logger.log(`📚 Swagger: http://localhost:${port}/docs`, 'Bootstrap');
      }
      break;
    } catch (error: any) {
      if (error.code === 'EADDRINUSE') {
        Logger.warn(
          `Port ${port} is occupied, trying ${port + 1}...`,
          'Bootstrap',
        );
        port++;
        attempt++;
      } else {
        throw error;
      }
    }
  }

  if (attempt === maxRetries) {
    throw new Error(
      `Could not find available port after ${maxRetries} attempts`,
    );
  }
}

bootstrap().catch((err) => {
  Logger.error('Failed to start server:', err);
  process.exit(1);
});

// import { NestFactory } from '@nestjs/core';
// import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
// import { NestExpressApplication } from '@nestjs/platform-express';
// import helmet from 'helmet';
// import compression from 'compression';
// import rateLimit from 'express-rate-limit';
// import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
// import { AppModule } from './app.module';
// import { ConfigService } from '@nestjs/config';
// import { WinstonModule } from 'nest-winston';
// import * as winston from 'winston';
// import { Request, Response } from 'express';

// async function bootstrap() {
//   const app = await NestFactory.create<NestExpressApplication>(AppModule, {
//     logger: WinstonModule.createLogger({
//       level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
//       format: winston.format.combine(
//         winston.format.timestamp(),
//         winston.format.errors({ stack: true }),
//         winston.format.json(),
//       ),
//       transports: [
//         new winston.transports.Console(),
//         new winston.transports.File({
//           filename: 'logs/error.log',
//           level: 'error',
//         }),
//         new winston.transports.File({ filename: 'logs/combined.log' }),
//       ],
//     }),
//   });

//   const configService = app.get(ConfigService);

//   // Security Headers
//   app.use(
//     helmet({
//       contentSecurityPolicy: {
//         directives: {
//           defaultSrc: ["'self'"],
//           scriptSrc: [
//             "'self'",
//             "'unsafe-inline'",
//             'https://accounts.google.com',
//           ],
//           styleSrc: ["'self'", "'unsafe-inline'"],
//           imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
//           connectSrc: [
//             "'self'",
//             'https://accounts.google.com',
//             'https://res.cloudinary.com',
//           ],
//           fontSrc: ["'self'", 'https://fonts.gstatic.com'],
//           objectSrc: ["'none'"],
//           frameAncestors: ["'none'"],
//           upgradeInsecureRequests: [],
//         },
//       },
//       hsts: {
//         maxAge: 31536000,
//         includeSubDomains: true,
//         preload: true,
//       },
//       referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
//       crossOriginEmbedderPolicy: true,
//       crossOriginOpenerPolicy: true,
//       crossOriginResourcePolicy: { policy: 'cross-origin' },
//     }),
//   );

//   // Compression
//   app.use(compression());

//   // Rate Limiting
//   app.use(
//     rateLimit({
//       windowMs: 60_000,
//       max: 100,
//       standardHeaders: true,
//       legacyHeaders: false,
//       skip: (req) => req.ip === '127.0.0.1',
//     }),
//   );

//   // CORS + Versioning + Validation
//   app.enableCors({
//     origin: configService.get('FRONTEND_URL','http://localhost:3001'),
//     credentials: true,
//   });

//   app.enableVersioning({
//     type: VersioningType.URI,
//     defaultVersion: '1',
//   });

//   app.useGlobalPipes(
//     new ValidationPipe({
//       whitelist: true,
//       forbidNonWhitelisted: true,
//       transform: true,
//       disableErrorMessages: process.env.NODE_ENV === 'production',
//       transformOptions: {
//         enableImplicitConversion: true,
//       },
//     }),
//   );

//   //   app.useGlobalPipes(
//   //   new ValidationPipe({
//   //     whitelist: true,
//   //     forbidNonWhitelisted: true,
//   //     transform: true,
//   //     transformOptions: {
//   //       enableImplicitConversion: true,
//   //     },
//   //   }),
//   // );

//   // Swagger
//   if (process.env.NODE_ENV !== 'production') {
//     const config = new DocumentBuilder()
//       .setTitle('Architecture Portfolio API')
//       .setDescription('High-performance backend with 1D/2D/3D assets')
//       .setVersion('1.0')
//       .addBearerAuth()
//       .build();
//     const document = SwaggerModule.createDocument(app, config);
//     SwaggerModule.setup('docs', app, document, {
//       swaggerOptions: { persistAuthorization: true },
//     });
//   }

//   // Health Check
//   const expressApp = app.getHttpAdapter().getInstance();
//   expressApp.get('/api/health', (_req: Request, res: Response) => {
//     res.json({
//       status: 'ok',
//       timestamp: new Date().toISOString(),
//       uptime: process.uptime(),
//       memory: process.memoryUsage(),
//     });
//   });

//   // Start Server with auto port increment
//   let port = configService.get<number>('PORT', 3000);
//   const maxRetries = 10;
//   let attempt = 0;

//   while (attempt < maxRetries) {
//     try {
//       await app.listen(port, '0.0.0.0');
//       Logger.log(`🚀 Server running on port ${port}`, 'Bootstrap');
//       Logger.log(
//         `📁 Environment: ${process.env.NODE_ENV || 'development'}`,
//         'Bootstrap',
//       );
//       Logger.log(`🌐 URL: http://localhost:${port}`, 'Bootstrap');
//       if (process.env.NODE_ENV !== 'production') {
//         Logger.log(`📚 Swagger: http://localhost:${port}/docs`, 'Bootstrap');
//       }
//       break;
//     } catch (error) {
//       if (error.code === 'EADDRINUSE') {
//         Logger.warn(
//           `Port ${port} is occupied, trying ${port + 1}...`,
//           'Bootstrap',
//         );
//         port++;
//         attempt++;
//       } else {
//         throw error;
//       }
//     }
//   }

//   if (attempt === maxRetries) {
//     throw new Error(
//       `Could not find available port after ${maxRetries} attempts`,
//     );
//   }
// }

// bootstrap().catch((err) => {
//   Logger.error('Failed to start server:', err);
//   process.exit(1);
// });
