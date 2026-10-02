import { Params } from 'nestjs-pino';
import { getEnvConfig } from '../../config/env.config';

export function getPinoLoggerConfig(): Params {
  const env = getEnvConfig();
  const isDev = env.NODE_ENV === 'development';

  return {
    pinoHttp: {
      level: isDev ? 'debug' : 'info',
      transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            },
          }
        : undefined,
      // Strict PII and sensitive data redaction paths
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'password',
          'token',
          'secret',
          'email',
          'phone',
          'phoneNumber',
          'sessionNotes',
          'notes',
          'messageContent',
          'content',
          'details.sessionNotes',
          'details.notes',
          '*.password',
          '*.token',
          '*.email',
          '*.phone',
          '*.notes',
          '*.sessionNotes',
          '*.messageContent',
        ],
        censor: '[REDACTED]',
      },
      customProps: (req) => ({
        requestId: req.headers['x-request-id'],
      }),
      autoLogging: {
        ignore: (req) => req.url === '/health',
      },
    },
  };
}
