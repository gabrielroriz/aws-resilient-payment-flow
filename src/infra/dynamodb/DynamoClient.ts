import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type PutCommandInput,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { Injectable } from "@kernel/decorators/injectable";

// Shared DynamoDB access for every table adapter.
// The registry builds one instance per execution environment, so connections are reused across
// invocations.
// Items are plain objects; the document client converts them to and from DynamoDB attribute values.
@Injectable()
export class DynamoClient {
  // The region comes from the Lambda environment.
  // Undefined attributes are left out of items, so adapters can map optional fields directly.
  readonly document = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });

  async get<T extends DynamoClient.Item>(
    table: string,
    key: DynamoClient.Item,
  ): Promise<T | undefined> {
    const { Item } = await this.document.send(new GetCommand({ TableName: table, Key: key }));
    return Item as T | undefined;
  }

  async put(table: string, item: DynamoClient.Item): Promise<void> {
    await this.document.send(new PutCommand({ TableName: table, Item: item }));
  }

  // Writes an item only when no item with its key exists.
  // Otherwise nothing is written and the stored item is returned, without a second read.
  async putIfAbsent<T extends DynamoClient.Item>(
    table: string,
    item: T,
    partitionKey: string,
  ): Promise<DynamoClient.PutIfAbsentResult<T>> {
    try {
      await this.document.send(
        new PutCommand({
          TableName: table,
          Item: item,
          ConditionExpression: "attribute_not_exists(#key)",
          ExpressionAttributeNames: { "#key": partitionKey },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD",
        }),
      );
      return { created: true };
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException && error.Item) {
        // The document client converts responses but not errors, so the stored item arrives raw.
        return { created: false, existing: unmarshall(error.Item) as T };
      }
      throw error;
    }
  }

  // Puts the item only if the condition holds for what is stored under its key; true if written.
  async putIf(
    table: string,
    item: DynamoClient.Item,
    condition: DynamoClient.Condition,
  ): Promise<boolean> {
    try {
      await this.document.send(new PutCommand({ TableName: table, Item: item, ...condition }));
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw error;
    }
  }

  // Updates the item under the key only if the condition holds for it; true if updated.
  async updateIf(
    table: string,
    key: DynamoClient.Item,
    update: DynamoClient.ConditionalUpdate,
  ): Promise<boolean> {
    try {
      await this.document.send(new UpdateCommand({ TableName: table, Key: key, ...update }));
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw error;
    }
  }

  // Runs a query and follows every page, returning all matching items in index order.
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
}

export namespace DynamoClient {
  export type Item = Record<string, unknown>;

  export type PutIfAbsentResult<T> = { created: true } | { created: false; existing: T };

  // A condition expression with the attribute names and values it refers to.
  export type Condition = Required<Pick<PutCommandInput, "ConditionExpression">> &
    Pick<PutCommandInput, "ExpressionAttributeNames" | "ExpressionAttributeValues">;

  // An update expression and the condition it requires, sharing their attribute names and values.
  export type ConditionalUpdate = Condition & { UpdateExpression: string };
}
