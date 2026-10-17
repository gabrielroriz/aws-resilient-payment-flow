import type {
  AttributeDefinition,
  CreateTableCommandInput,
  KeySchemaElement,
  KeyType,
  Projection,
  ProjectionType,
  ScalarAttributeType,
} from '@aws-sdk/client-dynamodb';

// A table as DynamoDB Local should have it: its create request and TTL attribute.
export type LocalTable = { input: CreateTableCommandInput; ttlAttribute?: string };

// Planned values of an aws_dynamodb_table resource.
export type TableValues = {
  name: string;
  hash_key: string;
  range_key?: string | null;
  attribute: { name: string; type: ScalarAttributeType }[];
  global_secondary_index?: IndexValues[] | null;
  local_secondary_index?: IndexValues[] | null;
  ttl?: { attribute_name: string; enabled: boolean }[] | null;
};

export type IndexValues = {
  name: string;
  hash_key?: string;
  range_key?: string | null;
  key_schema?: { attribute_name: string; key_type: KeyType }[] | null;
  projection_type: ProjectionType;
  non_key_attributes?: string[] | null;
};

// Fields shared by table requests and descriptions, so the two can be compared.
export type IndexDefinition = {
  IndexName?: string;
  KeySchema?: KeySchemaElement[];
  Projection?: Projection;
};
export type TableDefinition = {
  AttributeDefinitions?: AttributeDefinition[];
  KeySchema?: KeySchemaElement[];
  GlobalSecondaryIndexes?: IndexDefinition[];
  LocalSecondaryIndexes?: IndexDefinition[];
};
