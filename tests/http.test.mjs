import assert from 'node:assert/strict';
import test from 'node:test';
import { httpEvent, loadEntry, loadSource } from './support/bundle.mjs';

test('the health function answers through every layer', async t => {
  const { handler } = await loadEntry(t, 'src/main/functions/health.ts');
  const before = Date.now();

  const response = await handler(httpEvent({ routeKey: 'GET /health', rawPath: '/health' }));

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/json');
  const body = JSON.parse(response.body);
  assert.equal(body.status, 'ok');
  assert.ok(Date.parse(body.checkedAt) >= before - 1000);
});

test('the HTTP adapter maps requests, expected errors, and unexpected errors', async t => {
  const { handler } = await loadSource(t, `
    import { Controller } from "@application/contracts/Controller";
    import { ApplicationError } from "@application/errors/application/ApplicationError";
    import { ErrorCode } from "@application/errors/ErrorCode";
    import { lambdaHttpAdapter } from "@main/adapters/lambdaHttpAdapter";

    class Conflict extends ApplicationError {
      code = "CONFLICT" as ErrorCode;
      statusCode = 409;
    }

    const controller: Controller = {
      async handle(request) {
        const body = request.body as { mode?: string } | undefined;
        if (body?.mode === "expected") throw new Conflict("Already processed");
        if (body?.mode === "unexpected") throw new Error("database password leaked");
        return { statusCode: 202, body: request };
      },
    };

    export const handler = lambdaHttpAdapter(controller);
  `);
  const logs = [];
  t.mock.method(console, 'error', line => logs.push(JSON.parse(line)));
  const call = async overrides => {
    const response = await handler(httpEvent(overrides));
    return { statusCode: response.statusCode, body: response.body && JSON.parse(response.body) };
  };

  assert.deepEqual(await call({
    body: '{"mode":"echo"}',
    pathParameters: { id: '1' },
    queryStringParameters: { q: 'x' },
    headers: { 'x-test': 'yes' },
  }), {
    statusCode: 202,
    body: { body: { mode: 'echo' }, params: { id: '1' }, queryParams: { q: 'x' }, headers: { 'x-test': 'yes' } },
  });

  assert.deepEqual(await call({ body: '{"mode":"expected"}' }), {
    statusCode: 409,
    body: { success: false, error: { code: 'CONFLICT', message: 'Already processed' } },
  });

  assert.deepEqual(await call({ body: '{not json' }), {
    statusCode: 400,
    body: { success: false, error: { code: 'BAD_REQUEST', message: 'Malformed JSON body' } },
  });

  // Unexpected failures hide their details from the caller but keep them in the logs.
  assert.deepEqual(await call({ body: '{"mode":"unexpected"}' }), {
    statusCode: 500,
    body: { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
  });
  assert.deepEqual(logs.map(log => log.errorKind), ['expected', 'expected', 'unexpected']);
  assert.equal(logs[2].errorMessage, 'database password leaked');
  assert.equal(logs[2].requestId, 'test-request');
});
