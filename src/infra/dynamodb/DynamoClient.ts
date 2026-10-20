import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type GetCommandInput,
  type PutCommandInput,
  type QueryCommandInput,
  type UpdateCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { Injectable } from "@kernel/decorators/injectable";

// Shared DynamoDB access for every table adapter.
// The registry builds one per Lambda environment, so invocations reuse connections.
// Items are plain objects; the document client handles DynamoDB attribute values.
@Injectable()
export class DynamoClient {
  // The region comes from the Lambda environment.
  // Undefined attributes are left out, so adapters can map optional fields directly.
  readonly document = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });

  async get<T extends DynamoClient.Item>(input: GetCommandInput): Promise<T | undefined> {
    const { Item } = await this.document.send(new GetCommand(input));
    return Item as T | undefined;
  }

  async put(input: PutCommandInput): Promise<void> {
    await this.document.send(new PutCommand(DynamoClient.sdkInput(input)));
  }

  // The caller's absent-key condition prevents replacing an existing item.
  // Otherwise it writes nothing and returns the stored item without a second read.
  async putIfAbsent<T extends DynamoClient.Item>(
    input: PutCommandInput,
  ): Promise<DynamoClient.PutIfAbsentResult<T>> {
    DynamoClient.requireCondition(input.ConditionExpression);
    try {
      await this.document.send(
        new PutCommand({
          ...DynamoClient.sdkInput(input),
          ReturnValuesOnConditionCheckFailure: "ALL_OLD",
        }),
      );
      return { created: true };
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException && error.Item) {
        // The document client does not convert errors, so this item arrives raw.
        return { created: false, existing: unmarshall(error.Item) as T };
      }
      throw error;
    }
  }

  // Puts the item if the condition holds for what its key stores; true if written.
  async putIf(input: PutCommandInput): Promise<boolean> {
    DynamoClient.requireCondition(input.ConditionExpression);
    try {
      await this.document.send(new PutCommand(DynamoClient.sdkInput(input)));
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw error;
    }
  }

  // Updates the item under the key if the condition holds for it; true if updated.
  async updateIf(input: UpdateCommandInput): Promise<boolean> {
    DynamoClient.requireCondition(input.ConditionExpression);
    try {
      await this.document.send(new UpdateCommand(DynamoClient.sdkInput(input)));
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw error;
    }
  }

  // Runs a query through every page, returning all matching items in index order.
  async queryAll<T extends DynamoClient.Item>(input: QueryCommandInput): Promise<T[]> {
    const items: T[] = [];
    let startKey: DynamoClient.Item | undefined;
    do {
      const page = await this.document.send(
        new QueryCommand({ ...input, ExclusiveStartKey: startKey }),
      );
      items.push(...((page.Items ?? []) as T[]));
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return items;
  }

  // Toolbox includes its local item preview in parameters, not in the SDK request.
  private static sdkInput<T extends object>(input: T): Omit<T, "ToolboxItem"> {
    const { ToolboxItem: _preview, ...sdkInput } = input as T & { ToolboxItem?: unknown };
    return sdkInput;
  }

  // A missing condition would turn a guarded write into an unconditional write.
  private static requireCondition(condition: string | undefined): void {
    if (!condition) {
      throw new Error("A conditional DynamoDB write requires a condition expression.");
    }
  }
}

export namespace DynamoClient {
  export type Item = Record<string, unknown>;

  export type PutIfAbsentResult<T> = { created: true } | { created: false; existing: T };
}
