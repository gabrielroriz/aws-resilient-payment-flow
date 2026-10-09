import assert from 'node:assert/strict';
import test from 'node:test';
import { httpEvent, loadEntry } from '../../../testing/bundle.mjs';

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
