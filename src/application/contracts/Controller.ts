// Transport-neutral HTTP controller.
// Driving adapters in `main` translate platform events into this request shape.
// This keeps controllers free of AWS types.
export interface Controller<TResponseBody = unknown> {
  handle(request: Controller.Request): Promise<Controller.Response<TResponseBody>>;
}

export namespace Controller {
  export type Request<TBody = unknown> = {
    // Parsed JSON body; `undefined` when the request has no body.
    // With a `@Schema`, the body is already validated and is the schema's output.
    body: TBody;
    // Body exactly as sent, for signature checks and audit; `undefined` when absent.
    rawBody: string | undefined;
    params: Record<string, string | undefined>;
    queryParams: Record<string, string | undefined>;
    headers: Record<string, string | undefined>;
    // ID the platform gave this request, used to trace it in logs and records.
    requestId: string;
  };

  export type Response<TBody = unknown> = {
    statusCode: number;
    body?: TBody;
  };
}
