import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SQSClient } from '@aws-sdk/client-sqs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { samTemplateFromPlan } from './sam-template.mts';
import { syncTable, tablesFromPlan } from './dynamodb-tables.mts';
import { queuesFromPlan, syncQueue } from './sqs-queues.mts';

// Prepares a local run from a Terraform plan, read as `terraform show -json` output: creates the
// planned tables in DynamoDB Local and the planned queues in ElasticMQ, and writes the SAM template
// that runs the planned Lambdas.
const [planFile, templateFile] = process.argv.slice(2);
if (!planFile || !templateFile) {
  throw new Error('Usage: node scripts/dev/prepare.mts <plan.json> <template.json>');
}

// Must match the DynamoDB Local and ElasticMQ services of the Docker Compose configuration: 
// their published ports on the host, and their service names on the network that the Lambda containers join.
const ENDPOINT_DYNAMODB_HOST = 'http://localhost:8000';
const ENDPOINT_DYNAMODB_LAMBDA = 'http://dynamodb:8000';
const ENDPOINT_SQS_HOST = 'http://localhost:9324';
const ENDPOINT_SQS_LAMBDA = 'http://sqs:9324';

const plan = JSON.parse(await readFile(planFile, 'utf8'));

// The local services accept any credentials; fixed ones keep this script from ever signing as a real AWS identity.
const local = { region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } };

const dynamodb = new DynamoDBClient({ ...local, endpoint: ENDPOINT_DYNAMODB_HOST });
for (const table of tablesFromPlan(plan)) {
  const result = await syncTable(dynamodb, table);
  const detail = result === 'recreated' ? ' because its definition changed; its items were removed' : '';
  console.log(`Local table ${table.input.TableName}: ${result}${detail}`);
}

const sqs = new SQSClient({ ...local, endpoint: ENDPOINT_SQS_HOST });
for (const queue of queuesFromPlan(plan)) {
  const result = await syncQueue(sqs, queue);
  const detail = result === 'recreated' ? ' because its definition changed; its messages were removed' : '';
  console.log(`Local queue ${queue.name}: ${result}${detail}`);
}

const template = samTemplateFromPlan(plan, {
  bundlesDir: fileURLToPath(new URL('../../dist/bundles/', import.meta.url)),
  // The AWS SDK sends DynamoDB and SQS requests to these endpoints instead of AWS, so handlers need
  // no local-only code.
  environment: { 
    AWS_ENDPOINT_URL_DYNAMODB: ENDPOINT_DYNAMODB_LAMBDA, 
    AWS_ENDPOINT_URL_SQS: ENDPOINT_SQS_LAMBDA 
  },
});
await writeFile(templateFile, JSON.stringify(template, null, 2));
