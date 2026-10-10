import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  ResourceNotFoundException,
  UpdateTimeToLiveCommand,
  type AttributeDefinition,
  type CreateTableCommandInput,
  type DynamoDBClient,
  type KeySchemaElement,
  type KeyType,
  type Projection,
  type ProjectionType,
  type ScalarAttributeType,
} from '@aws-sdk/client-dynamodb';
import { plannedResources, type TerraformPlan } from './terraform-plan.mts';

/** A table as DynamoDB Local should have it: the request that creates it and its TTL attribute. */
export type LocalTable = { input: CreateTableCommandInput; ttlAttribute?: string };

/** What happened to a local table when it was brought in line with its definition. */
export type SyncResult = 'created' | 'unchanged' | 'recreated';

// Planned values of an aws_dynamodb_table resource.
type TableValues = {
  name: string;
  hash_key: string;
  range_key?: string | null;
  attribute: { name: string; type: ScalarAttributeType }[];
  global_secondary_index?: IndexValues[] | null;
  local_secondary_index?: IndexValues[] | null;
  ttl?: { attribute_name: string; enabled: boolean }[] | null;
};

type IndexValues = {
  name: string;
  hash_key?: string;
  range_key?: string | null;
  key_schema?: { attribute_name: string; key_type: KeyType }[] | null;
  projection_type: ProjectionType;
  non_key_attributes?: string[] | null;
};

// Fields shared by table requests and table descriptions, which are compared with each other.
type IndexDefinition = { IndexName?: string; KeySchema?: KeySchemaElement[]; Projection?: Projection };
type TableDefinition = {
  AttributeDefinitions?: AttributeDefinition[];
  KeySchema?: KeySchemaElement[];
  GlobalSecondaryIndexes?: IndexDefinition[];
  LocalSecondaryIndexes?: IndexDefinition[];
};

/**
 * Converts every DynamoDB table in a Terraform plan into the request that creates it in DynamoDB
 * Local. Terraform cannot create them itself: its AWS provider calls APIs that DynamoDB Local
 * lacks, such as DescribeContinuousBackups. Only what changes how requests behave is kept;
 * capacity, backups, and encryption mean nothing locally.
 */
export function tablesFromPlan(plan: TerraformPlan): LocalTable[] {
  return plannedResources<TableValues>(plan, 'aws_dynamodb_table').map((resource) => toLocalTable(resource.values));
}

/**
 * Makes DynamoDB Local match a table definition. A table whose keys, indexes, or TTL differ is
 * deleted and created again, losing its items: local data is disposable, and a stale table would
 * reject requests that the deployed one accepts.
 */
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
      // DynamoDB Local ignores capacity, so on-demand mode avoids carrying throughput settings over.
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: table.attribute.map(({ name, type }) => ({ AttributeName: name, AttributeType: type })),
      KeySchema: keySchema(table.hash_key, table.range_key),
      GlobalSecondaryIndexes: nonEmpty(
        table.global_secondary_index?.map((index) => ({
          IndexName: index.name,
          // Terraform declares index keys either as key_schema blocks or as hash_key and range_key.
          KeySchema: index.key_schema?.length
            ? index.key_schema.map(({ attribute_name, key_type }) => ({ AttributeName: attribute_name, KeyType: key_type }))
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

function keySchema(hashKey: string | undefined, rangeKey: string | null | undefined): KeySchemaElement[] {
  const schema: KeySchemaElement[] = [{ AttributeName: hashKey, KeyType: 'HASH' }];
  // Terraform reports an absent sort key as an empty string.
  if (rangeKey) {
    schema.push({ AttributeName: rangeKey, KeyType: 'RANGE' });
  }
  return schema;
}

function projection(index: IndexValues): Projection {
  return { ProjectionType: index.projection_type, NonKeyAttributes: nonEmpty(index.non_key_attributes) };
}

// DynamoDB rejects empty lists where Terraform reports empty blocks, so they are left out.
function nonEmpty<T>(items: T[] | null | undefined): T[] | undefined {
  return items?.length ? items : undefined;
}

async function currentSchema(client: DynamoDBClient, TableName: string | undefined): Promise<string | undefined> {
  try {
    const { Table } = await client.send(new DescribeTableCommand({ TableName }));
    const { TimeToLiveDescription: ttl } = await client.send(new DescribeTimeToLiveCommand({ TableName }));
    return schemaOf(Table ?? {}, ttl?.TimeToLiveStatus === 'ENABLED' ? ttl.AttributeName : undefined);
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      return undefined;
    }
    throw error;
  }
}

// The settings DynamoDB Local enforces, in a canonical form: descriptions list attributes and
// indexes in any order and carry status fields that requests do not have.
function schemaOf(table: TableDefinition, ttlAttribute: string | undefined): string {
  const keys = (schema: KeySchemaElement[] = []) => schema.map(({ AttributeName, KeyType }) => [AttributeName, KeyType]);
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
    attributes: (table.AttributeDefinitions ?? []).map(({ AttributeName, AttributeType }) => `${AttributeName}:${AttributeType}`).sort(),
    keys: keys(table.KeySchema),
    globalIndexes: indexes(table.GlobalSecondaryIndexes),
    localIndexes: indexes(table.LocalSecondaryIndexes),
    ttlAttribute,
  });
}
