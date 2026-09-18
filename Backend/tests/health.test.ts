import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';

// Tests pin their own environment: the app must default PORT to 5000 when
// unset, so drop any inherited PORT before the app reads the environment.
delete process.env.PORT;
process.env.NODE_ENV = 'test';

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function startTestServer(): Promise<{
  server: Server;
  baseUrl: string;
}> {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe('Splitzy API foundation (Task 1)', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    ({ server, baseUrl } = await startTestServer());
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/v1/health returns 200 with the documented body', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    const body = await readJson<Record<string, unknown>>(response);
    assert.deepEqual(body, {
      success: true,
      service: 'splitzy-api',
      status: 'healthy',
    });
  });

  it('GET /api/v1/unknown returns the 404 error envelope', async () => {
    const response = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    assert.equal(response.status, 404);
    const body = await readJson<ErrorEnvelope>(response);
    assert.deepEqual(body, {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  it('unknown routes outside /api/v1 also return the 404 envelope', async () => {
    const response = await fetch(`${baseUrl}/totally-unknown`);
    assert.equal(response.status, 404);
    const body = await readJson<ErrorEnvelope>(response);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'NOT_FOUND');
  });

  it('malformed JSON bodies produce a 400 VALIDATION_ERROR envelope', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"broken json',
    });
    assert.equal(response.status, 400);
    const body = await readJson<ErrorEnvelope>(response);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('allows the configured CORS origin', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { origin: 'http://localhost:5173' },
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      'http://localhost:5173',
    );
  });

  it('omits CORS headers for unconfigured origins', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { origin: 'http://evil.example.com' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });
});
