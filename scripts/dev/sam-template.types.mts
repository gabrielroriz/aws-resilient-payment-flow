/** A SAM template for local HTTP routes and direct invocations of queue workers. */
export type SamTemplate = {
  AWSTemplateFormatVersion: '2010-09-09';
  Transform: 'AWS::Serverless-2016-10-31';
  Resources: Record<string, SamFunction>;
};

export type SamFunction = {
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
export type FunctionValues = {
  function_name: string;
  handler: string;
  runtime: string;
  memory_size: number;
  timeout: number;
  environment?: { variables?: Record<string, string> | null }[] | null;
};
export type RouteValues = { route_key: string };

export type SamTemplateOptions = {
  /** The build's bundle directory, with one folder of code per function name. */
  bundlesDir: string;
  /** Variables added to every function's environment, overriding planned ones. */
  environment: Record<string, string>;
};
