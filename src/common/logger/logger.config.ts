import type { IncomingMessage } from 'http';
import * as crypto from 'crypto';
import type { Params } from 'nestjs-pino';

export function getLoggerConfig(): Params {
  const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
  const level = process.env.LOG_LEVEL ?? (isDevelopment ? 'debug' : 'info');

  return {
    pinoHttp: {
      level,
      ...(isDevelopment
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname',
              },
            },
          }
        : {}),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          // Top-level (logs manuais: this.logger.debug({ pepper }, 'msg'))
          'password',
          'passwordHash',
          'token',
          'accessToken',
          'refreshToken',
          'refreshTokenHash',
          'rg',
          'cpf',
          'pepper',
          'secret',
          // Nested (logs com objetos: this.logger.debug({ data: { pepper } }, 'msg'))
          '*.password',
          '*.passwordHash',
          '*.token',
          '*.accessToken',
          '*.refreshToken',
          '*.refreshTokenHash',
          '*.rg',
          '*.cpf',
          '*.pepper',
          '*.secret',
        ],
        censor: '[REDACTED]',
      },
      genReqId: (req: IncomingMessage): string => {
        const existing = req.headers['x-request-id'];
        if (typeof existing === 'string' && existing.length > 0) {
          return existing;
        }
        return crypto.randomUUID();
      },
      serializers: {
        req: (req: { id?: string; method?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode?: number }) => ({
          statusCode: res.statusCode,
        }),
      },
      autoLogging: {
        ignore: (req: IncomingMessage) => req.url === '/health',
      },
    },
  };
}
