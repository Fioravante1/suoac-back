import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

function buildCorsOrigin(env: string | undefined): boolean | RegExp | string[] {
  if (!env || env === 'development') {
    return /^https?:\/\/localhost(:\d+)?$/;
  }

  const origins = process.env.ALLOWED_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (!origins || origins.length === 0) {
    return false;
  }

  return origins;
}

async function bootstrap(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV;
  const isProduction = nodeEnv === 'production';

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true }), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  // CORS
  app.enableCors({
    origin: buildCorsOrigin(nodeEnv),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400,
  });

  // Helmet — security headers
  await app.register(helmet, { contentSecurityPolicy: isProduction });

  // Rate limiting global
  const parsedRateLimit = parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10);
  const rateLimitMax = Number.isInteger(parsedRateLimit) && parsedRateLimit > 0 ? parsedRateLimit : 100;
  await app.register(rateLimit, { max: rateLimitMax, timeWindow: '1 minute' });

  // Rate limiting reforçado para rotas de autenticação (anti brute-force / credential stuffing).
  // O limiter estrito roda em um hook onRequest global (antes dos hooks por rota), marca o request
  // como já processado e faz o limiter global ser ignorado nessas rotas — então elas usam APENAS
  // este limite, bem mais baixo que o global.
  const parsedAuthRateLimit = parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? '10', 10);
  const authRateLimitMax = Number.isInteger(parsedAuthRateLimit) && parsedAuthRateLimit > 0 ? parsedAuthRateLimit : 10;
  const fastifyInstance = app.getHttpAdapter().getInstance();
  const authRateLimiter = fastifyInstance.rateLimit({ max: authRateLimitMax, timeWindow: '1 minute' });
  const authThrottledPaths = new Set(['/auth/login', '/auth/refresh', '/auth/change-password']);
  fastifyInstance.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0];
    if (path && authThrottledPaths.has(path)) {
      await authRateLimiter.call(fastifyInstance, request, reply);
    }
  });

  // Pipe global: valida automaticamente todo request body contra o DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('SUOAC API')
      .setDescription('API do Sistema Unificado de Ônibus para Assembleias de Circuito')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(process.env.PORT ?? 8080, '0.0.0.0');
}
void bootstrap();
