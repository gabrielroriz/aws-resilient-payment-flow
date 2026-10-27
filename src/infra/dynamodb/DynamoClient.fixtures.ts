// Restores names and values so assertions describe DynamoDB's actual condition.
export function expression(
  input: {
    ConditionExpression?: string;
    UpdateExpression?: string;
    KeyConditionExpression?: string;
    FilterExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  },
  kind: "ConditionExpression" | "UpdateExpression" | "KeyConditionExpression" | "FilterExpression",
): string {
  let result = input[kind] ?? "";
  const aliases = {
    ...input.ExpressionAttributeNames,
    ...Object.fromEntries(
      Object.entries(input.ExpressionAttributeValues ?? {}).map(([name, value]) => [
        name,
        JSON.stringify(value),
      ]),
    ),
  };
  for (const [alias, value] of Object.entries(aliases).sort(
    ([left], [right]) => right.length - left.length,
  )) {
    result = result.replaceAll(alias, value);
  }
  return result;
}
