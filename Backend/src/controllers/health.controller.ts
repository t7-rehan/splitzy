import type { Request, Response } from 'express';

/**
 * GET /api/v1/health
 *
 * Verifies the API process is up and serving. Deliberately does NOT touch
 * PostgreSQL — database connectivity checks arrive with the schema work in
 * Task 2.
 *
 * The response shape matches the documented Task 1 contract exactly (flat
 * body, no wrapper), so uptime monitors can rely on it verbatim.
 */
export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    service: 'splitzy-api',
    status: 'healthy',
  });
}
