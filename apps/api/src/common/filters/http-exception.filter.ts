import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiErrorResponse } from '@project-nirvana/shared';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected internal error occurred';
    let details: unknown = undefined;

    if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_ERROR';
      message = 'Request validation failed';
      details = exception.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = HttpStatus[status] || 'HTTP_EXCEPTION';
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const respObj = exceptionResponse as Record<string, unknown>;
        message = (respObj['message'] as string) || exception.message;
        code =
          (respObj['error'] as string) ||
          (respObj['code'] as string) ||
          HttpStatus[status] ||
          'HTTP_EXCEPTION';
        details =
          respObj['details'] ||
          (Array.isArray(respObj['message']) ? respObj['message'] : undefined);
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception for ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
      if (process.env.NODE_ENV === 'development') {
        details = { error: exception.message };
      }
    }

    const payload: ApiErrorResponse = {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    };

    response.status(status).json(payload);
  }
}
