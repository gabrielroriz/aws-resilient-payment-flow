import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  ResourceNotFoundException,
  UpdateTimeToLiveCommand,
  type DynamoDBClient,
  type KeySchemaElement,
  type Projection,
} from '@aws-sdk/client-dynamodb';
import type {
  IndexDefinition,
  IndexValues,
  LocalTable,
  TableDefinition,
  TableValues,
} from './dynamodb-tables.types.mts';
import type { SyncResult } from './local-resources.types.mts';
import { plannedResources } from './terraform-plan.mts';
import type { TerraformPlan } from './terraform-plan.types.mts';

// Converts each planned DynamoDB table into its DynamoDB Local create request.
// Terraform cannot create them: its AWS provider calls APIs DynamoDB Local lacks.
// Only settings that change how requests behave are kept.
export function tablesFromPlan(plan: TerraformPlan): LocalTable[] {
  return plannedResources<TableValues>(plan, 'aws_dynamodb_table').map((resource) =>
    toLocalTable(resource.values),
  );
}

// Makes DynamoDB Local match a table definition.
// A table whose keys, indexes, or TTL differ is recreated, losing its items.
// Local data is disposable, and a stale table would reject requests AWS accepts.
export async function syncTable(client: DynamoDBClient, table: LocalTable): Promise<SyncResult> {
  const TableName = table.input.TableName;
  const current = await currentSchema(client, TableName);
  if (current === schemaOf(table.input, table.ttlAttribute)) {
    return 'unchanged';
  }

  if (current !== undefined) {
    await client.send(new DeleteTableCommand({ TableName }));
  }
  await client.send(new CreateTableCommand(table.input));
  if (table.ttlAttribute !== undefined) {
    await client.send(
      new UpdateTimeToLiveCommand({
        TableName,
        TimeToLiveSpecification: { Enabled: true, AttributeName: table.ttlAttribute },
      }),
    );
  }
  return current === undefined ? 'created' : 'recreated';
}

function toLocalTable(table: TableValues): LocalTable {
  return {
    input: {
      TableName: table.name,
      // DynamoDB Local ignores capacity, so on-demand mode needs no throughput.
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: table.attribute.map(({ name, type }) => ({
        AttributeName: name,
        AttributeType: type,
      })),
      KeySchema: keySchema(table.hash_key, table.range_key),
      GlobalSecondaryIndexes: nonEmpty(
        table.global_secondary_index?.map((index) => ({
          IndexName: index.name,
          // Index keys come as key_schema blocks or as hash_key and range_key.
          KeySchema: index.key_schema?.length
            ? index.key_schema.map(({ attribute_name, key_type }) => ({
                AttributeName: attribute_name,
                KeyType: key_type,
              }))
            : keySchema(index.hash_key, index.range_key),
          Projection: projection(index),
        })),
      ),
      LocalSecondaryIndexes: nonEmpty(
        table.local_secondary_index?.map((index) => ({
          IndexName: index.name,
          // A local index always shares the table's partition key.
          KeySchema: keySchema(table.hash_key, index.range_key),
          Projection: projection(index),
        })),
      ),
    },
    ttlAttribute: table.ttl?.find((setting) => setting.enabled)?.attribute_name,
  };
}

function keySchema(
  hashKey: string | undefined,
  rangeKey: string | null | undefined,
): KeySchemaElement[] {
  const schema: KeySchemaElement[] = [{ AttributeName: hashKey, KeyType: 'HASH' }];
  // Terraform reports an absent sort key as an empty string.
  if (rangeKey) {
    schema.push({ AttributeName: rangeKey, KeyType: 'RANGE' });
  }
  return schema;
}

function projection(index: IndexValues): Projection {
  return {
    ProjectionType: index.projection_type,
    NonKeyAttributes: nonEmpty(index.non_key_attributes),
  };
}

// Drops empty lists, which Terraform reports for empty blocks but DynamoDB rejects.
function nonEmpty<T>(items: T[] | null | undefined): T[] | undefined {
  return items?.length ? items : undefined;
}

async function currentSchema(
  client: DynamoDBClient,
  TableName: string | undefined,
): Promise<string | undefined> {
  try {
    const { Table } = await client.send(new DescribeTableCommand({ TableName }));
    const { TimeToLiveDescription: ttl } = await client.send(
      new DescribeTimeToLiveCommand({ TableName }),
    );
    return schemaOf(
      Table ?? {},
      ttl?.TimeToLiveStatus === 'ENABLED' ? ttl.AttributeName : undefined,
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      return undefined;
    }
    throw error;
  }
}

// The settings DynamoDB Local enforces, in a canonical form.
// Descriptions list attributes and indexes in any order, plus status fields.
function schemaOf(table: TableDefinition, ttlAttribute: string | undefined): string {
  const keys = (schema: KeySchemaElement[] = []) =>
    schema.map(({ AttributeName, KeyType }) => [AttributeName, KeyType]);
  const indexes = (list: IndexDefinition[] = []) =>
    list
      .map(({ IndexName, KeySchema, Projection }) =>
        JSON.stringify([
          IndexName,
          keys(KeySchema),
          Projection?.ProjectionType,
          [...(Projection?.NonKeyAttributes ?? [])].sort(),
        ]),
      )
      .sort();
  return JSON.stringify({
    attributes: (table.AttributeDefinitions ?? [])
      .map(({ AttributeName, AttributeType }) => `${AttributeName}:${AttributeType}`)
      .sort(),
    keys: keys(table.KeySchema),
    globalIndexes: indexes(table.GlobalSecondaryIndexes),
    localIndexes: indexes(table.LocalSecondaryIndexes),
    ttlAttribute,
  });
}
