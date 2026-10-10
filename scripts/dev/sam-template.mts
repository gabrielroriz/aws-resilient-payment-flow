import path from 'node:path';
import { plannedResources, type PlannedResource, type TerraformPlan } from './terraform-plan.mts';

/** A SAM template whose functions SAM runs locally behind their HTTP API routes. */
export type SamTemplate = {
  AWSTemplateFormatVersion: '2010-09-09';
  Transform: 'AWS::Serverless-2016-10-31';
  Resources: Record<string, SamFunction>;
};

type SamFunction = {
  Type: 'AWS::Serverless::Function';
  Properties: {
    FunctionName: string;
    CodeUri: string;
    Handler: string;
    Runtime: string;
    MemorySize: number;
    Timeout: number;
    Environment: { Variables: Record<string, string> };
    Events: Record<string, { Type: 'HttpApi'; Properties: { Method: string; Path: string } }>;
  };
};

// Planned values of the aws_lambda_function and aws_apigatewayv2_route resources.
type FunctionValues = {
  function_name: string;
  handler: string;
  runtime: string;
  memory_size: number;
  timeout: number;
  environment?: { variables?: Record<string, string> | null }[] | null;
};
type RouteValues = { route_key: string };

export type SamTemplateOptions = {
  /** The build's bundle directory, with one folder of code per function name. */
  bundlesDir: string;
  /** Variables added to every function's environment, overriding planned ones. */
  environment: Record<string, string>;
};

/**
 * Builds a SAM template that runs the planned Lambdas behind their planned HTTP API routes. SAM's
 * own Terraform support links routes to functions through IDs that exist only after apply, so it
 * cannot run a function or route that was never deployed; this template needs no deployed resource.
 */
export function samTemplateFromPlan(plan: TerraformPlan, options: SamTemplateOptions): SamTemplate {
  const resources: SamTemplate['Resources'] = {};
  const functionsByKey = new Map<PlannedResource['index'], SamFunction>();
  for (const { index, values } of plannedResources<FunctionValues>(plan, 'aws_lambda_function')) {
    const logicalId = logicalIdOf(values.function_name);
    if (logicalId in resources) {
      throw new Error(`Lambdas "${resources[logicalId].Properties.FunctionName}" and "${values.function_name}" get the same SAM logical ID.`);
    }
    resources[logicalId] = {
      Type: 'AWS::Serverless::Function',
      Properties: {
        FunctionName: values.function_name,
        // SAM runs the unpacked bundle, the code Terraform uploads zipped. With a zip, SAM unpacks it
        // per invocation and deletes every unpacked copy when any invocation ends, which breaks
        // concurrent invocations of one function.
        CodeUri: path.join(options.bundlesDir, values.function_name),
        Handler: values.handler,
        Runtime: values.runtime,
        MemorySize: values.memory_size,
        Timeout: values.timeout,
        Environment: { Variables: { ...values.environment?.[0]?.variables, ...options.environment } },
        Events: {},
      },
    };
    functionsByKey.set(index, resources[logicalId]);
  }

  // Every API resource is created per registry entry, so a route shares its function's for_each key.
  for (const { index, values } of plannedResources<RouteValues>(plan, 'aws_apigatewayv2_route')) {
    const events = functionsByKey.get(index)?.Properties.Events;
    if (!events) {
      throw new Error(`No planned Lambda shares the key of the route "${values.route_key}".`);
    }
    const [method, routePath] = values.route_key.split(' ');
    if (!routePath) {
      throw new Error(`Route "${values.route_key}" has no method and path, which local routes need.`);
    }
    events[`Route${Object.keys(events).length + 1}`] = { Type: 'HttpApi', Properties: { Method: method, Path: routePath } };
  }

  return { AWSTemplateFormatVersion: '2010-09-09', Transform: 'AWS::Serverless-2016-10-31', Resources: resources };
}

// Template logical IDs are alphanumeric, so names such as webhook_entry_point become WebhookEntryPoint.
function logicalIdOf(functionName: string): string {
  return functionName
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
