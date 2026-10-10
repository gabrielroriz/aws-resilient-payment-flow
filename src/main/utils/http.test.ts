import { buildHttpResponse, decodeHttpBody, parseHttpBody } from "@main/utils/http";
import { expect, test } from "vitest";

test("decodeHttpBody returns a text body unchanged", () => {
  expect(decodeHttpBody('{"id":"evt_1"}', false)).toBe('{"id":"evt_1"}');
  expect(decodeHttpBody(undefined, false)).toBeUndefined();
});

test("decodeHttpBody decodes a base64-encoded body to the text the client sent", () => {
  const form = "amount=100&currency=BRL&name=Jo%C3%A3o&note=São Paulo";

  expect(decodeHttpBody(Buffer.from(form).toString("base64"), true)).toBe(form);
  expect(decodeHttpBody(undefined, true)).toBeUndefined();
});

test("parseHttpBody returns undefined for a missing or empty body", () => {
  expect(parseHttpBody(undefined)).toBeUndefined();
  expect(parseHttpBody("")).toBeUndefined();
});

test("parseHttpBody parses any JSON value", () => {
  expect(parseHttpBody('{"amount":100,"items":["a"]}')).toEqual({ amount: 100, items: ["a"] });
  expect(parseHttpBody("[1,2]")).toEqual([1, 2]);
  expect(parseHttpBody("42")).toBe(42);
  expect(parseHttpBody('"text"')).toBe("text");
  expect(parseHttpBody("null")).toBeNull();
});

test("parseHttpBody rejects malformed JSON with a BadRequest", () => {
  const badRequest = expect.objectContaining({
    name: "BadRequest",
    statusCode: 400,
    code: "BAD_REQUEST",
    category: "http",
    kind: "expected",
    message: "Malformed JSON body",
  });

  expect(() => parseHttpBody("{not json")).toThrow(badRequest);
  expect(() => parseHttpBody('{"amount":')).toThrow(badRequest);
  // Whitespace is not an empty body, so it is parsed and rejected like any other invalid JSON.
  expect(() => parseHttpBody("   ")).toThrow(badRequest);
});

test("buildHttpResponse serializes the body with a JSON content type", () => {
  expect(buildHttpResponse(201, { id: "payment-1" })).toEqual({
    statusCode: 201,
    headers: { "content-type": "application/json" },
    body: '{"id":"payment-1"}',
  });
});

test("buildHttpResponse sends only the status code when the body is undefined", () => {
  expect(buildHttpResponse(204, undefined)).toStrictEqual({ statusCode: 204 });
});

test("buildHttpResponse keeps falsy bodies other than undefined", () => {
  // Only undefined means "no body"; null, 0, false, and "" are valid JSON payloads.
  for (const [value, body] of [[null, "null"], [0, "0"], [false, "false"], ["", '""']]) {
    expect(buildHttpResponse(200, value)).toMatchObject({ body });
  }
});
