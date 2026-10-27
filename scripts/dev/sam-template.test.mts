import { samTemplateFromPlan } from './sam-template.mts';
import { expect, test } from 'vitest';

// A planned function, durable when the plan gives it a durable configuration.
function plannedFunction(name: string, durable?: { execution_timeout: number }) {
  return {
    mode: 'managed',
    type: 'aws_lambda_function',
    index: name,
    values: {
      function_name: name,
      handler: 'index.handler',
      runtime: 'nodejs24.x',
      memory_size: 512,
      timeout: 30,
      environment: [{ variables: { TABLE: 'events' } }],
      durable_config: durable ? [{ ...durable, retention_period: 14 }] : [],
    },
  };
}

test('durable functions keep their durable configuration, so SAM runs them durably', () => {
  const template = samTemplateFromPlan(
    {
      planned_values: {
        root_module: {
          resources: [
            plannedFunction('webhook_worker'),
            plannedFunction('wf_subscription_grant_access', { execution_timeout: 86400 }),
          ],
        },
      },
    },
    { bundlesDir: '/bundles', environment: { AWS_ENDPOINT_URL_LAMBDA: 'http://lambda:3002' } },
  );

  expect(template.Resources.WfSubscriptionGrantAccess.Properties).toMatchObject({
    FunctionName: 'wf_subscription_grant_access',
    CodeUri: '/bundles/wf_subscription_grant_access',
    DurableConfig: { ExecutionTimeout: 86400, RetentionPeriodInDays: 14 },
    Environment: { Variables: { TABLE: 'events', AWS_ENDPOINT_URL_LAMBDA: 'http://lambda:3002' } },
  });
  expect(template.Resources.WebhookWorker.Properties).not.toHaveProperty('DurableConfig');
});
