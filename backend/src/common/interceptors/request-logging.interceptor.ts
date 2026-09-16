import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { catchError, Observable, tap, throwError } from 'rxjs';

type AuthenticatedRequest = Request & {
  user?: {
    userId?: string;
    tenantId?: string | null;
    role?: string;
  };
};

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.writeLog(request, response.statusCode, Date.now() - startedAt);
      }),
      catchError((error: unknown) => {
        const statusCode = error instanceof HttpException ? error.getStatus() : response.statusCode || 500;
        this.writeLog(request, statusCode, Date.now() - startedAt, error);
        return throwError(() => error);
      }),
    );
  }

  private writeLog(request: AuthenticatedRequest, statusCode: number, durationMs: number, error?: unknown) {
    const payload = {
      event: 'http_request',
      method: request.method,
      // Query strings can contain signed download credentials.
      path: (request.originalUrl ?? request.url).split('?')[0],
      statusCode,
      durationMs,
      userId: request.user?.userId,
      tenantId: request.user?.tenantId,
      role: request.user?.role,
      requestId: request.headers['x-request-id'],
      userAgent: request.headers['user-agent'],
    };

    const line = JSON.stringify(payload);
    if (statusCode >= 500) {
      this.logger.error(line, error instanceof Error ? error.stack : undefined);
      return;
    }

    if (statusCode >= 400) {
      this.logger.warn(line);
      return;
    }

    this.logger.log(line);
  }
}
