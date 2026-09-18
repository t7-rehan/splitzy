import type { NextFunction, Request, Response } from 'express';

/**
 * Request logging middleware.
 *
 * Logs method, path, status code and duration for every request. Never logs
 * headers, query strings, or bodies, so passwords, tokens, secrets, database
 * credentials and financial payloads can never leak into logs.
 *
 * Uses `req.originalUrl` (the URL as it entered the app) because `req.url`
 * gets prefix-stripped while a mounted router handles the request, which
 * would otherwise log truncated paths like `/` for nested routes.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const fullPath = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
    const line = `${req.method} ${fullPath} ${res.statusCode} ${durationMs.toFixed(1)}ms`;
    console.log(line);
  });

  next();
}
