import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from '../../../testing/bundle.mjs';

const loadHelpers = t => loadSource(t, 'export * from "@main/utils/http";');

test('parseHttpBody returns undefined for a missing or empty body', async t => {
  const { parseHttpBody } = await loadHelpers(t);

  assert.equal(parseHttpBody(undefined), undefined);
  assert.equal(parseHttpBody(''), undefined);
});

test('parseHttpBody parses any JSON value', async t => {
  const { parseHttpBody } = await loadHelpers(t);

  assert.deepEqual(parseHttpBody('{"amount":100,"items":["a"]}'), { amount: 100, items: ['a'] });
  assert.deepEqual(parseHttpBody('[1,2]'), [1, 2]);
  assert.equal(parseHttpBody('42'), 42);
  assert.equal(parseHttpBody('"text"'), 'text');
  assert.equal(parseHttpBody('null'), null);
});

test('parseHttpBody rejects malformed JSON with a BadRequest', async t => {
  const { parseHttpBody } = await loadHelpers(t);
  const badRequest = { name: 'BadRequest', statusCode: 400, code: 'BAD_REQUEST', message: 'Malformed JSON body' };

  assert.throws(() => parseHttpBody('{not json'), badRequest);
  assert.throws(() => parseHttpBody('{"amount":'), badRequest);
  // Whitespace is not an empty body, so it is parsed and rejected like any other invalid JSON.
  assert.throws(() => parseHttpBody('   '), badRequest);
});

test('buildHttpResponse serializes the body with a JSON content type', async t => {
  const { buildHttpResponse } = await loadHelpers(t);

  assert.deepEqual(buildHttpResponse(201, { id: 'payment-1' }), {
    statusCode: 201,
    headers: { 'content-type': 'application/json' },
    body: '{"id":"payment-1"}',
  });
});

test('buildHttpResponse sends only the status code when the body is undefined', async t => {
  const { buildHttpResponse } = await loadHelpers(t);

  assert.deepEqual(buildHttpResponse(204, undefined), { statusCode: 204 });
});

test('buildHttpResponse keeps falsy bodies other than undefined', async t => {
  const { buildHttpResponse } = await loadHelpers(t);

  // Only undefined means "no body"; null, 0, false, and "" are valid JSON payloads.
  for (const [value, body] of [[null, 'null'], [0, '0'], [false, 'false'], ['', '""']]) {
    assert.equal(buildHttpResponse(200, value).body, body);
  }
});
