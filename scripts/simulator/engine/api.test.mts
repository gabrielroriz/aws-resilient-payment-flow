import { expect, test, vi } from 'vitest';
import { createWebhookApi } from './api.mts';
import { testEvent, testGateway } from './simulation.fixtures.mts';

function apiWith(reply: () => Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(reply);
  return { fetch, api: createWebhookApi({ baseUrl: 'http://api.test/', fetch }) };
}

test("deliver posts the gateway's rendering of an event to its webhook route and parses the JSON reply", async () => {
  const { fetch, api } = apiWith(async () => new Response('{"duplicate":false}', { status: 200 }));

  await expect(api.deliver(testGateway, testEvent(), { credentials: 'forged' })).resolves.toEqual({
    gateway: 'gatewayGlobal',
    eventId: 'evt_1',
    status: 200,
    body: { duplicate: false },
  });

  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('http://api.test/webhooks/gatewayGlobal');
  expect(init).toMatchObject({
    method: 'POST',
    body: '{"id":"evt_1"}',
    headers: { 'content-type': 'application/json', 'x-credentials': 'forged' },
  });
  expect(init?.signal).toBeUndefined();
});

test('deliverBody sends a body as it is, names no event, and keeps a reply that is not JSON as text', async () => {
  const { fetch, api } = apiWith(
    async () => new Response('<html>bad gateway</html>', { status: 502 }),
  );

  await expect(api.deliverBody(testGateway, '{"unexpected":true}')).resolves.toEqual({
    gateway: 'gatewayGlobal',
    status: 502,
    body: '<html>bad gateway</html>',
  });
  expect(fetch.mock.calls[0][1]?.body).toBe('{"unexpected":true}');
});

test('a delivery the gateway stops waiting for is an outcome, not a failure', async () => {
  const { fetch, api } = apiWith(async () => {
    throw new DOMException('The operation timed out.', 'TimeoutError');
  });

  await expect(api.deliver(testGateway, testEvent(), { timeoutMs: 50 })).resolves.toEqual({
    gateway: 'gatewayGlobal',
    eventId: 'evt_1',
    timedOut: true,
  });
  expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
});

test("a delivery that cannot reach the API throws ApiUnreachableError with the network's reason", async () => {
  const { api } = apiWith(async () => {
    throw new TypeError('fetch failed', {
      cause: new Error('connect ECONNREFUSED 127.0.0.1:3999'),
    });
  });

  await expect(api.deliver(testGateway, testEvent())).rejects.toMatchObject({
    name: 'ApiUnreachableError',
    message: 'could not reach http://api.test: connect ECONNREFUSED 127.0.0.1:3999',
  });
});
