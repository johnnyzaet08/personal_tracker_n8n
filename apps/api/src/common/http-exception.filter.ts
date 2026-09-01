import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class StructuredExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const structured = typeof payload === 'object' && payload !== null ? payload : {};
    const correlationId =
      response.getHeader('x-correlation-id') ?? request.header('x-correlation-id') ?? null;

    response.status(status).json({
      error: {
        code: this.codeFor(status, structured),
        message: status >= 500 ? 'An internal error occurred' : this.messageFor(payload),
        status,
        correlationId,
      },
    });
  }

  private codeFor(status: number, payload: object): string {
    if ('code' in payload && typeof payload.code === 'string') return payload.code;
    return HttpStatus[status] ?? 'ERROR';
  }

  private messageFor(payload: unknown): string {
    if (typeof payload === 'string') return payload;
    if (typeof payload === 'object' && payload !== null && 'message' in payload) {
      const message = payload.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join('; ');
    }
    return 'Request failed';
  }
}
