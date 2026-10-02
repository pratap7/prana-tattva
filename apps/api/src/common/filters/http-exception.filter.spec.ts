import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { GlobalHttpExceptionFilter } from './http-exception.filter';
import { ZodError, z } from 'zod';
import { Response } from 'express';

describe('GlobalHttpExceptionFilter', () => {
  let filter: GlobalHttpExceptionFilter;

  beforeEach(() => {
    filter = new GlobalHttpExceptionFilter();
  });

  const createMockArgumentsHost = (mockResponse: Partial<Response>): ArgumentsHost => {
    return {
      switchToHttp: () => ({
        getResponse: () => mockResponse as Response,
        getRequest: () => ({ method: 'GET', url: '/test' }),
      }),
    } as unknown as ArgumentsHost;
  };

  it('should format HttpException into standard error envelope { code, message, details }', () => {
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const host = createMockArgumentsHost({ status: statusMock });

    const exception = new HttpException('Access Denied', HttpStatus.FORBIDDEN);
    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: 'Access Denied',
      }),
    );
  });

  it('should format ZodError into VALIDATION_ERROR envelope', () => {
    const schema = z.object({ name: z.string() });
    let zodError: ZodError | null = null;
    try {
      schema.parse({ name: 123 });
    } catch (err) {
      zodError = err as ZodError;
    }

    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const host = createMockArgumentsHost({ status: statusMock });

    filter.catch(zodError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
      }),
    );
  });
});
