import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { DynamoClient } from "@infra/dynamodb/DynamoClient";
import { expect, test, vi, type MockInstance } from "vitest";

// Replaces the SDK call, so tests check the commands sent without reaching AWS.
// The SDK's send is overloaded; tests only use its promise form.
function stubSend(client: DynamoClient) {
  return vi.spyOn(client.document, "send") as unknown as MockInstance<
    (command: PutCommand | QueryCommand | UpdateCommand) => Promise<unknown>
  >;
}

test("putIfAbsent writes the item only when its key is free", async () => {
  const client = new DynamoClient();
  const send = stubSend(client).mockResolvedValue({});

  await expect(
    client.putIfAbsent("events", { PK: "stripe#evt_1", SK: "META" }, "PK"),
  ).resolves.toEqual({
    created: true,
  });

  const [command] = send.mock.calls[0];
  expect(command).toBeInstanceOf(PutCommand);
  expect(command.input).toEqual({
    TableName: "events",
    Item: { PK: "stripe#evt_1", SK: "META" },
    ConditionExpression: "attribute_not_exists(#key)",
    ExpressionAttributeNames: { "#key": "PK" },
    ReturnValuesOnConditionCheckFailure: "ALL_OLD",
  });
});

test("putIfAbsent returns the stored item, converted to a plain object, when the key is taken", async () => {
  const client = new DynamoClient();
  const stored = { PK: "stripe#evt_1", SK: "META", expires_at: 1767866401 };
  stubSend(client).mockRejectedValue(
    new ConditionalCheckFailedException({
      message: "taken",
      $metadata: {},
      Item: marshall(stored),
    }),
  );

  await expect(
    client.putIfAbsent("events", { PK: "stripe#evt_1", SK: "META" }, "PK"),
  ).resolves.toEqual({
    created: false,
    existing: stored,
  });
});

test("putIfAbsent rethrows other failures", async () => {
  const client = new DynamoClient();
  const failure = new Error("throttled");
  stubSend(client).mockRejectedValue(failure);

  await expect(client.putIfAbsent("events", { PK: "stripe#evt_1" }, "PK")).rejects.toBe(failure);
});

const condition = {
  ConditionExpression: "attribute_not_exists(PK) OR #rank <= :rank",
  ExpressionAttributeNames: { "#rank": "rank" },
  ExpressionAttributeValues: { ":rank": "02" },
};

test("putIf writes the item with its condition and reports that it was written", async () => {
  const client = new DynamoClient();
  const send = stubSend(client).mockResolvedValue({});

  await expect(client.putIf("events", { PK: "a", SK: "STATUS" }, condition)).resolves.toBe(true);

  const [command] = send.mock.calls[0];
  expect(command).toBeInstanceOf(PutCommand);
  expect(command.input).toEqual({
    TableName: "events",
    Item: { PK: "a", SK: "STATUS" },
    ...condition,
  });
});

test("putIf reports that nothing was written when the condition does not hold", async () => {
  const client = new DynamoClient();
  stubSend(client).mockRejectedValue(
    new ConditionalCheckFailedException({ message: "outranked", $metadata: {} }),
  );

  await expect(client.putIf("events", { PK: "a", SK: "STATUS" }, condition)).resolves.toBe(false);
});

test("putIf rethrows other failures", async () => {
  const client = new DynamoClient();
  const failure = new Error("throttled");
  stubSend(client).mockRejectedValue(failure);

  await expect(client.putIf("events", { PK: "a", SK: "STATUS" }, condition)).rejects.toBe(failure);
});

const update = {
  UpdateExpression: "SET processing_status = :next",
  ConditionExpression: "processing_status = :current",
  ExpressionAttributeValues: { ":next": "enqueued", ":current": "received" },
};

test("updateIf updates the item with its condition and reports that it was updated", async () => {
  const client = new DynamoClient();
  const send = stubSend(client).mockResolvedValue({});

  await expect(client.updateIf("events", { PK: "a", SK: "META" }, update)).resolves.toBe(true);

  const [command] = send.mock.calls[0];
  expect(command).toBeInstanceOf(UpdateCommand);
  expect(command.input).toEqual({
    TableName: "events",
    Key: { PK: "a", SK: "META" },
    ...update,
  });
});

test("updateIf reports that nothing was updated when the condition does not hold", async () => {
  const client = new DynamoClient();
  stubSend(client).mockRejectedValue(
    new ConditionalCheckFailedException({ message: "moved on", $metadata: {} }),
  );

  await expect(client.updateIf("events", { PK: "a", SK: "META" }, update)).resolves.toBe(false);
});

test("updateIf rethrows other failures", async () => {
  const client = new DynamoClient();
  const failure = new Error("throttled");
  stubSend(client).mockRejectedValue(failure);

  await expect(client.updateIf("events", { PK: "a", SK: "META" }, update)).rejects.toBe(failure);
});

test("queryAll follows every page", async () => {
  const client = new DynamoClient();
  const send = stubSend(client)
    .mockResolvedValueOnce({ Items: [{ n: 1 }], LastEvaluatedKey: { PK: "a", SK: "1" } })
    .mockResolvedValueOnce({ Items: [{ n: 2 }] });
  const input = {
    TableName: "events",
    KeyConditionExpression: "PK = :key",
    ExpressionAttributeValues: { ":key": "a" },
  };

  await expect(client.queryAll(input)).resolves.toEqual([{ n: 1 }, { n: 2 }]);

  expect(send.mock.calls.map(([command]) => command.input)).toEqual([
    { ...input, ExclusiveStartKey: undefined },
    { ...input, ExclusiveStartKey: { PK: "a", SK: "1" } },
  ]);
});
