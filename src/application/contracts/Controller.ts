/**
 * Transport-neutral HTTP controller. Driving adapters in `main` translate platform
 * events into this request shape, so controllers never depend on AWS types.
 */
export interface Controller<TResponseBody = unknown> {
  handle(request: Controller.Request): Promise<Controller.Response<TResponseBody>>;
}

export namespace Controller {
  export type Request<TBody = unknown> = {
    /** Parsed JSON body; `undefined` when the request has no body. */
    body: TBody;
    /** Body exactly as the client sent it, for signature checks and audit; `undefined` when there is none. */
    rawBody: string | undefined;
    params: Record<string, string | undefined>;
    queryParams: Record<string, string | undefined>;
    headers: Record<string, string | undefined>;
    /** ID the platform assigned to this request, used to trace it in logs and records. */
    requestId: string;
  };

  export type Response<TBody = unknown> = {
    statusCode: number;
    body?: TBody;
  };
}
