import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { DynamoClient } from "@infra/dynamodb/DynamoClient";
import { expect, test, vi, type MockInstance } from "vitest";

// Replaces the SDK call, so tests check the commands sent without reaching AWS. The SDK's send
// is overloaded; tests only use its promise form.
function stubSend(client: DynamoClient) {
  return vi.spyOn(client.document, "send") as unknown as MockInstance<
    (command: PutCommand | QueryCommand) => Promise<unknown>
  >;
}

test("putIfAbsent writes the item only when its key is free", async () => {
  const client = new DynamoClient();
  const send = stubSend(client).mockResolvedValue({});

  await expect(client.putIfAbsent("events", { PK: "stripe#evt_1", SK: "META" }, "PK")).resolves.toEqual({
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
    new ConditionalCheckFailedException({ message: "taken", $metadata: {}, Item: marshall(stored) }),
  );

  await expect(client.putIfAbsent("events", { PK: "stripe#evt_1", SK: "META" }, "PK")).resolves.toEqual({
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

test("queryAll follows every page", async () => {
  const client = new DynamoClient();
  const send = stubSend(client)
    .mockResolvedValueOnce({ Items: [{ n: 1 }], LastEvaluatedKey: { PK: "a", SK: "1" } })
    .mockResolvedValueOnce({ Items: [{ n: 2 }] });
  const input = { TableName: "events", KeyConditionExpression: "PK = :key", ExpressionAttributeValues: { ":key": "a" } };

  await expect(client.queryAll(input)).resolves.toEqual([{ n: 1 }, { n: 2 }]);

  expect(send.mock.calls.map(([command]) => command.input)).toEqual([
    { ...input, ExclusiveStartKey: undefined },
    { ...input, ExclusiveStartKey: { PK: "a", SK: "1" } },
  ]);
});
