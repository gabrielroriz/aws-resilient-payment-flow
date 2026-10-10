import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { samTemplateFromPlan } from './sam-template.mts';
import { syncTable, tablesFromPlan } from './dynamodb-tables.mts';

// Prepares a local run from a Terraform plan, read as `terraform show -json` output: creates the
// planned tables in DynamoDB Local and writes the SAM template that runs the planned Lambdas.
const [planFile, templateFile] = process.argv.slice(2);
if (!planFile || !templateFile) {
  throw new Error('Usage: node scripts/dev/prepare.mts <plan.json> <template.json>');
}

// Must match the DynamoDB Local service of the Docker Compose configuration: its published port
// on the host, and its service name on the network that the Lambda containers join.
const HOST_DYNAMODB_ENDPOINT = 'http://localhost:8000';
const LAMBDA_DYNAMODB_ENDPOINT = 'http://dynamodb:8000';

const plan = JSON.parse(await readFile(planFile, 'utf8'));

// DynamoDB Local accepts any credentials; fixed ones keep this script from ever signing as a real AWS identity.
const client = new DynamoDBClient({
  endpoint: HOST_DYNAMODB_ENDPOINT,
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
for (const table of tablesFromPlan(plan)) {
  const result = await syncTable(client, table);
  const detail = result === 'recreated' ? ' because its definition changed; its items were removed' : '';
  console.log(`Local table ${table.input.TableName}: ${result}${detail}`);
}

const template = samTemplateFromPlan(plan, {
  terraformDir: fileURLToPath(new URL('../../terraform/', import.meta.url)),
  // The AWS SDK sends DynamoDB requests to this endpoint instead of AWS, so handlers need no local-only code.
  environment: { AWS_ENDPOINT_URL_DYNAMODB: LAMBDA_DYNAMODB_ENDPOINT },
});
await writeFile(templateFile, JSON.stringify(template, null, 2));
