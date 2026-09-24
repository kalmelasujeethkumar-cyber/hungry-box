import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const IGNORED_PATHS = ['/api/health', '/socket.io'];

/**
 * Minimal request logging for Railway stdout. Only the HTTP method, path (query
 * strings are never logged), status code and duration are recorded. The
 * Authorization header, JWT payloads, credentials and DATABASE_URL are never
 * touched, and health/socket.io polling chatter is skipped.
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    if (this.ignored(req.path)) {
      next();
      return;
    }
    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      this.logger.log(`${req.method} ${req.path} ${res.statusCode} ${durationMs}ms`);
    });
    next();
  }

  private ignored(path: string): boolean {
    return IGNORED_PATHS.some((prefix) => path === prefix || path.startsWith(prefix));
  }
}
